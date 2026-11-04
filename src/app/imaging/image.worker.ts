/// <reference lib="webworker" />
import { decodeHeif } from './heif'
import { ENCODER_OUTPUT, HEIF_TYPES, PipelineRequest, PipelineResponse } from './pipeline-types'
import { drawWatermark } from './watermark'

type EncodeFn = (data: ImageData, options: { quality: number }) => Promise<ArrayBuffer>
type CodecModule = {
  default: EncodeFn
  init: (options: { locateFile: (file: string) => string }) => Promise<unknown>
}

const loaders: Record<string, () => Promise<CodecModule>> = {
  webp: () => import('@jsquash/webp/encode') as unknown as Promise<CodecModule>,
  avif: () => import('@jsquash/avif/encode') as unknown as Promise<CodecModule>,
  mozjpeg: () => import('@jsquash/jpeg/encode') as unknown as Promise<CodecModule>
}
const ready = new Map<string, Promise<EncodeFn>>()

function encoder(name: string, wasmBase: string): Promise<EncodeFn> {
  let found = ready.get(name)
  if (!found) {
    found = loaders[name]().then(async (mod) => {
      await mod.init({ locateFile: (file) => wasmBase + file })
      return mod.default
    })
    ready.set(name, found)
  }
  return found
}

/** Draws the image on a canvas: with the browser's decoder, or with libheif for HEIF it cannot read. */
async function draw(req: PipelineRequest) {
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(new Blob([req.buffer], { type: req.type }))
  } catch (err) {
    if (!HEIF_TYPES.includes(req.type)) {
      throw err
    }
  }
  const pixels = bitmap ? null : await decodeHeif(req.buffer, req.heifBase)
  const width = bitmap?.width ?? pixels!.width
  const height = bitmap?.height ?? pixels!.height
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas is not available')
  }
  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
  } else {
    ctx.putImageData(pixels!, 0, 0)
  }
  return { canvas, ctx }
}

async function process(req: PipelineRequest): Promise<PipelineResponse> {
  const { canvas, ctx } = await draw(req)
  const heif = HEIF_TYPES.includes(req.type)
  if (req.watermark) {
    drawWatermark(ctx, canvas.width, canvas.height, req.watermark)
  }

  if (req.compress) {
    const encode = await encoder(req.compress.encoder, req.wasmBase)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const buffer = await encode(data, { quality: req.compress.quality })
    const output = ENCODER_OUTPUT[req.compress.encoder]
    // Compressing an already small file can make it larger; without a watermark the original is better.
    if (
      !heif &&
      !req.alwaysEncode &&
      !req.watermark &&
      buffer.byteLength >= req.buffer.byteLength
    ) {
      return {
        id: req.id,
        ok: true,
        buffer: req.buffer,
        type: req.type,
        extension: '',
        unchanged: true
      }
    }
    return {
      id: req.id,
      ok: true,
      buffer,
      type: output.type,
      extension: output.extension,
      unchanged: false
    }
  }

  // HEIF photos become JPEG; other formats the browser can write keep their type.
  const type = heif
    ? 'image/jpeg'
    : ['image/png', 'image/jpeg', 'image/webp'].includes(req.type)
      ? req.type
      : 'image/png'
  const blob = await canvas.convertToBlob({ type, quality: 0.92 })
  const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length)
  return {
    id: req.id,
    ok: true,
    buffer: await blob.arrayBuffer(),
    type,
    extension,
    unchanged: false
  }
}

addEventListener('message', async ({ data }: MessageEvent<PipelineRequest>) => {
  let res: PipelineResponse
  try {
    res = await process(data)
  } catch (err) {
    res = { id: data.id, ok: false, error: (err as Error)?.message ?? String(err) }
  }
  postMessage(res, res.ok ? [res.buffer] : [])
})
