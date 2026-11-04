import { Injectable, computed, inject, signal } from '@angular/core'
import { Notify } from '../core/notify.service'
import { errorKey } from '../storage/storage'
import { ImagePipeline, ProcessOptions } from '../imaging/image-pipeline.service'
import { LinkService } from '../links/link.service'
import { Subfolder } from '../settings/settings.model'
import { SettingsStore } from '../settings/settings.store'
import { IncomingFile } from '../shared/file-intake'
import { StorageService } from '../storage/storage.service'
import { LibraryStore, joinPath, parentOf } from './library.store'
import { cleanFolderPath, finalName, shortHash, splitName, timeFolder } from './naming'

export type ItemState = 'processing' | 'ready' | 'uploading' | 'done' | 'failed'

export interface QueueItem {
  id: number
  file: File
  previewUrl: string
  /** Folder the item was added to. */
  target: string
  /** Folder below the target, for items from a dropped folder. */
  relDir: string
  base: string
  extension: string
  hash: boolean
  prefix: boolean
  state: ItemState
  /** Translation key of the last problem, with its parameters. */
  error: { key: string; params?: Record<string, string> } | null
  processed: Blob | null
  processedExtension: string
  hashHex: string
}

export interface BatchOptions {
  subfolder: Subfolder
  customSubfolder: string
  compress: boolean
  watermark: boolean
}

/** Images waiting to be uploaded to the repository in use, and the choices for this batch. */
@Injectable({ providedIn: 'root' })
export class UploadQueueStore {
  private readonly storage = inject(StorageService)
  private readonly pipeline = inject(ImagePipeline)
  private readonly settingsStore = inject(SettingsStore)
  private readonly library = inject(LibraryStore)
  private readonly links = inject(LinkService)
  private readonly notify = inject(Notify)

  private nextId = 1
  readonly items = signal<QueueItem[]>([])
  readonly options = signal<BatchOptions>(this.defaultOptions())
  readonly uploading = signal(false)

  readonly pending = computed(() => this.items().filter((i) => i.state !== 'done'))
  readonly busy = computed(() => this.items().some((i) => i.state === 'processing'))
  readonly canUpload = computed(
    () => !this.uploading() && !this.busy() && this.items().some((i) => this.uploadable(i))
  )

  /** Ready, or failed and worth retrying; an unconverted HEIC photo is never uploaded. */
  private uploadable(item: QueueItem) {
    if (item.state !== 'ready' && item.state !== 'failed') {
      return false
    }
    return !(this.pipeline.isHeif(item.file) && !item.processed)
  }

  private defaultOptions(): BatchOptions {
    const s = this.settingsStore.settings()
    return {
      subfolder: s.upload.subfolder,
      customSubfolder: s.upload.customSubfolder,
      compress: s.compress.enabled,
      watermark: s.watermark.enabled
    }
  }

  /** Folder below the target that this batch goes to. */
  subfolder(): string {
    const o = this.options()
    if (o.subfolder === 'time') {
      return timeFolder(this.settingsStore.settings().upload.timeFormat)
    }
    return o.subfolder === 'custom' ? cleanFolderPath(o.customSubfolder) : ''
  }

  name(item: QueueItem): string {
    const upload = this.settingsStore.settings().upload
    return finalName({
      base: item.base,
      extension: item.processedExtension || item.extension,
      prefix: item.prefix && upload.prefixEnabled ? upload.prefix : '',
      hash: item.hash ? item.hashHex : ''
    })
  }

  path(item: QueueItem): string {
    return joinPath(item.target, this.subfolder(), item.relDir, this.name(item))
  }

  add(files: IncomingFile[], target: string) {
    if (!this.items().length) {
      this.options.set(this.defaultOptions())
    }
    const upload = this.settingsStore.settings().upload
    const added: QueueItem[] = files.map(({ file, relDir }) => {
      const { base, extension } = splitName(file.name)
      return {
        id: this.nextId++,
        file,
        previewUrl: URL.createObjectURL(file),
        target,
        relDir: cleanFolderPath(relDir),
        base,
        extension,
        hash: upload.hash,
        prefix: upload.prefixEnabled,
        state: 'processing',
        error: null,
        processed: null,
        processedExtension: '',
        hashHex: ''
      }
    })
    this.items.update((list) => [...list, ...added])
    void this.processAll(added.map((i) => i.id)).then(() => {
      if (this.settingsStore.settings().upload.autoUpload) {
        void this.upload()
      }
    })
  }

  setOptions(changes: Partial<BatchOptions>) {
    const before = this.options()
    this.options.set({ ...before, ...changes })
    if (changes.compress !== undefined || changes.watermark !== undefined) {
      const ids = this.items()
        .filter((i) => i.state !== 'done' && i.state !== 'uploading')
        .map((i) => i.id)
      void this.processAll(ids)
    }
  }

  patch(id: number, changes: Partial<QueueItem>) {
    this.items.update((list) => list.map((i) => (i.id === id ? { ...i, ...changes } : i)))
  }

  remove(id: number) {
    const item = this.items().find((i) => i.id === id)
    if (item) {
      URL.revokeObjectURL(item.previewUrl)
    }
    this.items.update((list) => list.filter((i) => i.id !== id))
  }

  clear() {
    if (this.uploading()) {
      return
    }
    this.items().forEach((i) => URL.revokeObjectURL(i.previewUrl))
    this.items.set([])
  }

  private replacePreview(item: QueueItem, blob: Blob) {
    URL.revokeObjectURL(item.previewUrl)
    return URL.createObjectURL(blob)
  }

  private processOptions(): ProcessOptions {
    const s = this.settingsStore.settings()
    const o = this.options()
    const { enabled: _w, ...watermark } = s.watermark
    return {
      watermark: o.watermark && watermark.text.trim() ? watermark : null,
      compress: o.compress ? { encoder: s.compress.encoder, quality: s.compress.quality } : null,
      stripMetadata: s.upload.stripMetadata
    }
  }

  private async processAll(ids: number[]) {
    const options = this.processOptions()
    ids.forEach((id) => this.patch(id, { state: 'processing', error: null }))
    for (const id of ids) {
      const item = this.items().find((i) => i.id === id)
      if (!item) {
        continue
      }
      try {
        const result = await this.pipeline.process(item.file, options)
        const hashHex = await shortHash(result.blob)
        this.patch(id, {
          // Browsers cannot show HEIC, so its preview is the converted image.
          ...(this.pipeline.isHeif(item.file)
            ? { previewUrl: this.replacePreview(item, result.blob) }
            : {}),
          state: 'ready',
          processed: result.blob,
          processedExtension: result.extension,
          hashHex
        })
      } catch (err) {
        // HEIC cannot be shown by most browsers, so it is never uploaded unconverted.
        if (this.pipeline.isHeif(item.file)) {
          this.patch(id, {
            state: 'failed',
            processed: null,
            error: { key: 'upload.heif_failed', params: { reason: (err as Error).message } }
          })
          continue
        }
        // The browser could not decode the image; upload it as it is.
        const hashHex = await shortHash(item.file)
        this.patch(id, {
          state: 'ready',
          processed: item.file,
          processedExtension: '',
          hashHex,
          error: { key: 'upload.process_failed', params: { reason: (err as Error).message } }
        })
      }
    }
  }

  /** Uploads every ready item (in one commit, on GitHub), then copies the links of those uploaded. */
  async upload() {
    const storage = this.storage.current()
    if (!storage || this.uploading() || this.busy()) {
      return
    }
    const batch = this.items().filter((i) => this.uploadable(i))
    if (!batch.length) {
      return
    }

    // Names must be free in the repository and unique within the batch.
    const seen = new Set<string>()
    const go: QueueItem[] = []
    for (const item of batch) {
      const path = this.path(item)
      if (this.library.exists(path) || seen.has(path)) {
        this.patch(item.id, {
          state: 'failed',
          error: { key: 'upload.exists', params: { name: this.name(item) } }
        })
        continue
      }
      seen.add(path)
      go.push(item)
    }

    // A folder may not hold more files than the storage allows; the whole part of the batch for it fails otherwise.
    const limit = storage.folderLimit
    const byFolder = new Map<string, QueueItem[]>()
    for (const item of go) {
      const dir = parentOf(this.path(item))
      byFolder.set(dir, [...(byFolder.get(dir) ?? []), item])
    }
    for (const [dir, items] of limit === null ? [] : byFolder) {
      const existing = this.library.fileCount(dir)
      if (existing + items.length > limit!) {
        for (const item of items) {
          this.patch(item.id, {
            state: 'failed',
            error: {
              key: 'upload.folder_full',
              params: {
                dir: dir || '/',
                existing: String(existing),
                count: String(items.length),
                limit: String(limit)
              }
            }
          })
          go.splice(go.indexOf(item), 1)
        }
      }
    }
    if (!go.length) {
      this.notify.error('upload.nothing_uploaded')
      return
    }

    this.uploading.set(true)
    go.forEach((i) => this.patch(i.id, { state: 'uploading', error: null }))
    try {
      const paths = go.map((item) => this.path(item))
      const results = await storage.upload(
        go.map((item, i) => ({ path: paths[i], blob: item.processed ?? item.file })),
        go.length === 1 ? 'Upload image' : `Upload ${go.length} images`
      )
      const uploaded: string[] = []
      go.forEach((item, i) => {
        const err = results.get(paths[i])
        if (err) {
          this.patch(item.id, { state: 'failed', error: { key: errorKey(err) } })
        } else {
          uploaded.push(paths[i])
          this.remove(item.id)
        }
      })
      if (uploaded.length < go.length) {
        this.notify.error('upload.failed')
      }
      if (uploaded.length) {
        await this.library.reload()
        await this.links.copy(uploaded)
      }
    } finally {
      this.uploading.set(false)
    }
  }
}
