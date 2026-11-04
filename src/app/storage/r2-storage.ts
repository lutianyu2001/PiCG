import { extensionOf } from '../library/library.store'
import { BucketRef, R2Client, R2Error, R2Keys } from '../r2/r2.client'
import { ImageStorage, Listing, StoredFile, Upload } from './storage'

/** A bucket in use, with the address its objects are public at (no trailing slash). */
export interface R2Target extends BucketRef {
  publicUrl: string
}

const PARALLEL_UPLOADS = 4
const PARALLEL_DELETES = 6

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp'
}

export const contentTypeOf = (path: string, blob?: Blob) =>
  TYPES[extensionOf(path)] ?? (blob?.type || 'application/octet-stream')

/** Runs the tasks, `width` at a time, and returns each one's error or null. */
async function inBatches<T>(items: T[], width: number, task: (item: T) => Promise<unknown>) {
  const errors: unknown[] = []
  for (let i = 0; i < items.length; i += width) {
    const part = items.slice(i, i + width)
    const settled = await Promise.allSettled(part.map(task))
    settled.forEach((r) => errors.push(r.status === 'rejected' ? r.reason : null))
  }
  return errors
}

/** A Cloudflare R2 bucket. Each object is its own request; nothing is atomic across files. */
export class R2Storage implements ImageStorage {
  readonly kind = 'r2'
  readonly id: string
  readonly folderLimit = null
  private cached: { keys: R2Keys; client: R2Client } | null = null

  constructor(
    readonly target: R2Target,
    private readonly keys: () => R2Keys
  ) {
    this.id = `r2:${new URL(target.endpoint).host}/${target.bucket}`
  }

  /** A client with the keys of the moment. */
  private get client() {
    const keys = this.keys()
    if (
      this.cached?.keys.accessKeyId !== keys.accessKeyId ||
      this.cached.keys.secretAccessKey !== keys.secretAccessKey
    ) {
      this.cached = { keys, client: new R2Client(this.target, keys) }
    }
    return this.cached.client
  }

  async list(): Promise<Listing> {
    const { objects, truncated } = await this.client.list()
    return {
      // A key ending in a slash is a folder made in the Cloudflare dashboard.
      files: objects
        .filter((o) => !o.key.endsWith('/'))
        .map((o) => ({ path: o.key, size: o.size, version: o.etag })),
      folders: objects
        .filter((o) => o.key.endsWith('/') && o.key.length > 1)
        .map((o) => o.key.replace(/\/+$/, '')),
      truncated
    }
  }

  /** Puts each file on its own, refusing a key that is taken, so each succeeds or fails alone. */
  async upload(files: Upload[]) {
    const errors = await inBatches(files, PARALLEL_UPLOADS, (file) =>
      this.client.put(file.path, file.blob, {
        contentType: contentTypeOf(file.path, file.blob),
        ifNoneMatch: true
      })
    )
    return new Map(files.map((file, i) => [file.path, errors[i]]))
  }

  async rename(file: StoredFile, to: string) {
    await this.client.copy(file.path, to)
    try {
      await this.client.delete(file.path)
    } catch (err) {
      throw new R2Error('rename_incomplete', 0, (err as Error).message)
    }
  }

  async remove(files: StoredFile[]) {
    const errors = await inBatches(files, PARALLEL_DELETES, (file) => this.client.delete(file.path))
    const failed = errors.filter(Boolean)
    if (failed.length === files.length) {
      throw failed[0]
    }
    if (failed.length) {
      throw new R2Error('delete_incomplete', 0, `${failed.length} of ${files.length} not deleted`)
    }
  }

  async readText(path: string) {
    const file = await this.client.getText(path)
    return file ? { version: file.etag, text: file.text } : null
  }

  writeText(path: string, text: string, version: string | undefined) {
    return this.client.put(path, text, {
      contentType: 'text/plain; charset=utf-8',
      ifMatch: version,
      ifNoneMatch: !version
    })
  }

  async modified(file: StoredFile) {
    const head = await this.client.head(file.path)
    return head?.lastModified ? new Date(head.lastModified) : null
  }

  webUrl() {
    return ''
  }
}
