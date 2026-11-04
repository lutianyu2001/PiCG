import type { Encoder, WatermarkSettings } from '../settings/settings.model'

export interface PipelineRequest {
  id: number
  buffer: ArrayBuffer
  type: string
  watermark: Omit<WatermarkSettings, 'enabled'> | null
  compress: { encoder: Encoder; quality: number } | null
  /** Keep the encoded result even when it is larger than the original. */
  alwaysEncode: boolean
  /** URL of the folder holding the codec binaries, ending with a slash. */
  wasmBase: string
  /** URL of the folder holding the libheif decoder, ending with a slash. */
  heifBase: string
}

export type PipelineResponse =
  | {
      id: number
      ok: true
      buffer: ArrayBuffer
      type: string
      extension: string
      unchanged: boolean
    }
  | { id: number; ok: false; error: string }

export const ENCODER_OUTPUT: Record<Encoder, { type: string; extension: string }> = {
  webp: { type: 'image/webp', extension: 'webp' },
  avif: { type: 'image/avif', extension: 'avif' },
  mozjpeg: { type: 'image/jpeg', extension: 'jpg' }
}

/** HEIC and HEIF photos, which most browsers cannot show; they are always converted before upload. */
export const HEIF_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

/** Types the pipeline can decode and re-encode. Others (gif, svg, ico, bmp) are uploaded as they are. */
export const PROCESSABLE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  ...HEIF_TYPES
]
