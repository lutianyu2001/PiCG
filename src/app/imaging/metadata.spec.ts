import { describe, expect, it } from 'vitest'
import { exifOrientation, orientationSegment, stripMetadata } from './metadata'

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p))
  )

const segment = (marker: number, payload: Uint8Array) => {
  const length = payload.length + 2
  return Uint8Array.from([0xff, marker, length >> 8, length & 0xff, ...payload])
}

/** EXIF payload with an orientation and a fake GPS pointer entry. */
function exif(orientation: number) {
  return bytes(
    'Exif\0\0',
    [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8],
    [0, 2],
    [0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0],
    [0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0]
  )
}

const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]))
const SCAN = bytes([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9])

describe('stripMetadata', () => {
  it('removes EXIF, XMP and comments from JPEG but keeps a non-default orientation', () => {
    const jpeg = join(
      bytes([0xff, 0xd8]),
      segment(0xe0, bytes('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0])),
      segment(0xe1, exif(6)),
      segment(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0<x/>')),
      segment(0xe2, bytes('ICC_PROFILE\0', [1, 1])),
      segment(0xfe, bytes('secret')),
      SCAN
    )
    const { bytes: out, changed } = stripMetadata(jpeg)
    expect(changed).toBe(true)
    const text = String.fromCharCode(...out)
    expect(text).not.toContain('xap')
    expect(text).not.toContain('secret')
    expect(text).toContain('ICC_PROFILE')
    expect(text).toContain('JFIF')
    // The new EXIF block sits after APP0 and holds only the orientation.
    const app1 = out.indexOf(0xe1, 2) - 1
    const length = (out[app1 + 2] << 8) | out[app1 + 3]
    expect(exifOrientation(out.subarray(app1 + 4, app1 + 2 + length))).toBe(6)
    expect(out.subarray(app1, app1 + 2 + length)).toEqual(orientationSegment(6))
    expect(out.subarray(out.length - SCAN.length)).toEqual(SCAN)
  })

  it('drops EXIF entirely when the orientation is the default', () => {
    const jpeg = join(bytes([0xff, 0xd8]), segment(0xe1, exif(1)), SCAN)
    const { bytes: out } = stripMetadata(jpeg)
    expect(out).toEqual(join(bytes([0xff, 0xd8]), SCAN))
  })

  it('removes text and EXIF chunks from PNG', () => {
    const chunk = (type: string, data: number[]) => {
      const length = data.length
      return bytes([0, 0, 0, length], type, data, [0, 0, 0, 0])
    }
    const png = join(
      bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', [1, 2, 3]),
      chunk('tEXt', [65, 66]),
      chunk('eXIf', [1]),
      chunk('IDAT', [9]),
      chunk('IEND', [])
    )
    const { bytes: out, changed } = stripMetadata(png)
    expect(changed).toBe(true)
    const text = String.fromCharCode(...out)
    expect(text).not.toContain('tEXt')
    expect(text).not.toContain('eXIf')
    expect(text).toContain('IDAT')
  })

  it('removes EXIF and XMP chunks from WebP and clears their flags', () => {
    const chunk = (fourcc: string, data: number[]) =>
      bytes(fourcc, [data.length, 0, 0, 0], data, data.length & 1 ? [0] : [])
    const body = join(
      bytes('WEBP'),
      chunk('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      chunk('VP8 ', [1, 2, 3]),
      chunk('EXIF', [7, 7]),
      chunk('XMP ', [8])
    )
    const webp = join(bytes('RIFF', [body.length, 0, 0, 0]), body)
    const { bytes: out, changed } = stripMetadata(webp)
    expect(changed).toBe(true)
    const view = new DataView(out.buffer)
    expect(view.getUint32(4, true)).toBe(out.length - 8)
    expect(String.fromCharCode(...out)).not.toContain('EXIF')
    expect(out[20] & 0x0c).toBe(0)
  })

  it('leaves other files alone', () => {
    const gif = bytes('GIF89a', [1, 2, 3])
    expect(stripMetadata(gif)).toEqual({ bytes: gif, changed: false })
  })
})
