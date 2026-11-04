/**
 * Removes metadata (EXIF, XMP, IPTC, text chunks) from JPEG, PNG and WebP files without touching the image data.
 * Photos often carry the place they were taken; once in a public repository that is public too.
 *
 * JPEG orientation is kept: when the EXIF orientation is not the default, a minimal EXIF block holding only the
 * orientation replaces the original, so the image is still shown the right way up. Colour profiles are kept.
 */
export interface StripResult {
  bytes: Uint8Array
  /** Something was removed. */
  changed: boolean
}

const unchanged = (bytes: Uint8Array): StripResult => ({ bytes, changed: false })

export function stripMetadata(bytes: Uint8Array): StripResult {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return stripJpeg(bytes)
  }
  if (ascii(bytes, 1, 3) === 'PNG' && bytes[0] === 0x89) {
    return stripPng(bytes)
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return stripWebp(bytes)
  }
  return unchanged(bytes)
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// ---- JPEG ----

const APP1 = 0xe1
const APP13 = 0xed
const COM = 0xfe
const SOS = 0xda

/** Orientation (1 to 8) from an APP1 EXIF payload, or 1 when there is none. */
export function exifOrientation(payload: Uint8Array): number {
  if (ascii(payload, 0, 6) !== 'Exif\0\0') {
    return 1
  }
  const tiff = payload.subarray(6)
  const little = ascii(tiff, 0, 2) === 'II'
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
  try {
    const ifd = view.getUint32(4, little)
    const count = view.getUint16(ifd, little)
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12
      if (view.getUint16(entry, little) === 0x0112) {
        const value = view.getUint16(entry + 8, little)
        return value >= 1 && value <= 8 ? value : 1
      }
    }
  } catch {
    // A damaged block counts as having no orientation.
  }
  return 1
}

/** An APP1 segment holding only an orientation tag. */
export function orientationSegment(orientation: number): Uint8Array {
  const tiff = [
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08, // big-endian TIFF header, IFD0 at offset 8
    0x00,
    0x01, // one entry
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01, // tag 0x0112 Orientation, SHORT, count 1
    0x00,
    orientation,
    0x00,
    0x00, // value
    0x00,
    0x00,
    0x00,
    0x00 // no next IFD
  ]
  const payload = [...new TextEncoder().encode('Exif\0\0'), ...tiff]
  const length = payload.length + 2
  return Uint8Array.from([0xff, APP1, length >> 8, length & 0xff, ...payload])
}

function stripJpeg(bytes: Uint8Array): StripResult {
  const kept: Uint8Array[] = [bytes.subarray(0, 2)]
  let orientation = 1
  let changed = false
  let pos = 2
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) {
      return unchanged(bytes)
    }
    const marker = bytes[pos + 1]
    if (marker === 0xff) {
      pos++ // fill byte
      continue
    }
    if (marker === SOS) {
      break
    }
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3]
    const end = pos + 2 + length
    if (length < 2 || end > bytes.length) {
      return unchanged(bytes)
    }
    const payload = bytes.subarray(pos + 4, end)
    const isExifOrXmp = marker === APP1
    if (isExifOrXmp || marker === APP13 || marker === COM) {
      if (isExifOrXmp && ascii(payload, 0, 6) === 'Exif\0\0') {
        orientation = exifOrientation(payload)
      }
      changed = true
    } else {
      kept.push(bytes.subarray(pos, end))
    }
    pos = end
  }
  if (!changed) {
    return unchanged(bytes)
  }
  if (orientation !== 1) {
    // After SOI and an APP0 (JFIF) segment if there is one.
    const at = kept[1] && kept[1][1] === 0xe0 ? 2 : 1
    kept.splice(at, 0, orientationSegment(orientation))
  }
  kept.push(bytes.subarray(pos))
  return { bytes: concat(kept), changed: true }
}

// ---- PNG ----

const PNG_DROPPED = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'])

function stripPng(bytes: Uint8Array): StripResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const kept: Uint8Array[] = [bytes.subarray(0, 8)]
  let changed = false
  let pos = 8
  while (pos + 12 <= bytes.length) {
    const length = view.getUint32(pos)
    const end = pos + 12 + length
    if (end > bytes.length) {
      return unchanged(bytes)
    }
    if (PNG_DROPPED.has(ascii(bytes, pos + 4, 4))) {
      changed = true
    } else {
      kept.push(bytes.subarray(pos, end))
    }
    pos = end
  }
  return changed ? { bytes: concat(kept), changed } : unchanged(bytes)
}

// ---- WebP ----

const VP8X_EXIF = 0x08
const VP8X_XMP = 0x04

function stripWebp(bytes: Uint8Array): StripResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const kept: Uint8Array[] = []
  let changed = false
  let pos = 12
  while (pos + 8 <= bytes.length) {
    const size = view.getUint32(pos + 4, true)
    const end = pos + 8 + size + (size & 1)
    if (pos + 8 + size > bytes.length) {
      return unchanged(bytes)
    }
    const fourcc = ascii(bytes, pos, 4)
    if (fourcc === 'EXIF' || fourcc === 'XMP ') {
      changed = true
    } else {
      kept.push(bytes.slice(pos, Math.min(end, bytes.length)))
    }
    pos = end
  }
  if (!changed) {
    return unchanged(bytes)
  }
  for (const chunk of kept) {
    if (ascii(chunk, 0, 4) === 'VP8X') {
      chunk[8] &= ~(VP8X_EXIF | VP8X_XMP)
    }
  }
  const body = concat(kept)
  const header = new Uint8Array(12)
  header.set(bytes.subarray(0, 12))
  new DataView(header.buffer).setUint32(4, body.length + 4, true)
  return { bytes: concat([header, body]), changed: true }
}
