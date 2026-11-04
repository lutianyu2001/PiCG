import { DOCUMENT, Injectable, inject } from '@angular/core'
import type { Encoder, WatermarkSettings } from '../settings/settings.model'
import { stripMetadata } from './metadata'
import { HEIF_TYPES, PROCESSABLE_TYPES, PipelineRequest, PipelineResponse } from './pipeline-types'

export interface ProcessOptions {
  watermark: Omit<WatermarkSettings, 'enabled'> | null
  compress: { encoder: Encoder; quality: number } | null
  alwaysEncode?: boolean
  /** Remove EXIF and similar metadata from files that are uploaded without re-encoding. */
  stripMetadata?: boolean
}

export interface ProcessResult {
  blob: Blob
  /** New extension when the format changed, otherwise empty. */
  extension: string
  /** The original file is used as is. */
  unchanged: boolean
}

const TYPE_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif'
}

/** Type of an image file, from the browser or from its extension when the browser does not say. */
export function imageType(file: File): string {
  return file.type || TYPE_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''] || ''
}

/** Watermarks and compresses images in a worker, so large images do not freeze the page. */
@Injectable({ providedIn: 'root' })
export class ImagePipeline {
  private readonly document = inject(DOCUMENT)
  private worker: Worker | null = null
  private nextId = 1
  private readonly waiting = new Map<number, (res: PipelineResponse) => void>()

  canProcess(file: File) {
    return PROCESSABLE_TYPES.includes(imageType(file))
  }

  /** HEIC and HEIF are converted even when nothing else is asked for, since browsers cannot show them. */
  isHeif(file: File) {
    return HEIF_TYPES.includes(imageType(file))
  }

  async process(file: File, options: ProcessOptions): Promise<ProcessResult> {
    if ((!options.watermark && !options.compress && !this.isHeif(file)) || !this.canProcess(file)) {
      return this.original(file, options)
    }
    const id = this.nextId++
    const request: PipelineRequest = {
      id,
      buffer: await file.arrayBuffer(),
      type: imageType(file),
      watermark: options.watermark,
      compress: options.compress,
      alwaysEncode: options.alwaysEncode ?? false,
      wasmBase: new URL('wasm/', this.document.baseURI).href,
      heifBase: new URL('heif/', this.document.baseURI).href
    }
    const res = await new Promise<PipelineResponse>((resolve) => {
      this.waiting.set(id, resolve)
      this.getWorker().postMessage(request, [request.buffer])
    })
    if (!res.ok) {
      throw new Error(res.error)
    }
    if (res.unchanged) {
      return this.original(file, options)
    }
    return {
      blob: new Blob([res.buffer], { type: res.type }),
      extension: res.extension,
      unchanged: false
    }
  }

  /** The original file, without metadata when asked; re-encoded output never carries any. */
  private async original(file: File, options: ProcessOptions): Promise<ProcessResult> {
    if (options.stripMetadata) {
      const stripped = stripMetadata(new Uint8Array(await file.arrayBuffer()))
      if (stripped.changed) {
        return {
          blob: new Blob([stripped.bytes as BlobPart], { type: file.type }),
          extension: '',
          unchanged: false
        }
      }
    }
    return { blob: file, extension: '', unchanged: true }
  }

  private getWorker() {
    if (!this.worker) {
      this.worker = new Worker(new URL('./image.worker', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }: MessageEvent<PipelineResponse>) => {
        this.waiting.get(data.id)?.(data)
        this.waiting.delete(data.id)
      }
      this.worker.onerror = (event) => {
        // A crashed worker fails everything it was doing; the next request starts a new one.
        for (const [id, resolve] of this.waiting) {
          resolve({ id, ok: false, error: event.message || 'Worker failed' })
        }
        this.waiting.clear()
        this.worker?.terminate()
        this.worker = null
      }
    }
    return this.worker
  }
}
