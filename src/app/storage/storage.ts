export type StorageErrorKind =
  | 'network'
  | 'rate_limit'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'too_large'
  | 'blocked'
  | 'server'
  | 'unknown'

/** A failed request to a storage service. `service` picks the wording of the message shown for it. */
export class StorageError extends Error {
  constructor(
    readonly service: 'github' | 'r2',
    readonly kind: StorageErrorKind,
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/** Translation key for an error, for messages shown to the user. */
export function errorKey(err: unknown): string {
  if (!(err instanceof StorageError)) {
    return 'api_error.unknown'
  }
  return `${err.service === 'r2' ? 'r2_error' : 'api_error'}.${err.kind}`
}

/** A file in the storage. `version` changes whenever its content does (a Git blob SHA, an R2 ETag). */
export interface StoredFile {
  path: string
  size: number
  version: string
}

export interface Listing {
  files: StoredFile[]
  /** Folders that exist in the storage, also those that hold no files. */
  folders: string[]
  /** The storage could not return all of it. */
  truncated: boolean
}

export interface TextFile {
  version: string
  text: string
}

export interface Upload {
  path: string
  blob: Blob
}

/** What every kind of storage can do with the images and the settings file in it. */
export interface ImageStorage {
  readonly kind: 'github' | 'r2'
  /** Identifies the storage on this device, for example in the keys of cached settings. */
  readonly id: string
  /** At most this many files in one folder, or null when there is no limit. */
  readonly folderLimit: number | null

  list(): Promise<Listing>
  /**
   * Stores new files, refusing names that exist. Returns the error of each path that failed, or null for one that
   * was stored; storages that store a batch as a whole fail every path together.
   */
  upload(files: Upload[], message: string): Promise<Map<string, unknown>>
  rename(file: StoredFile, to: string, message: string): Promise<void>
  remove(files: StoredFile[], message: string): Promise<void>
  readText(path: string): Promise<TextFile | null>
  /** Writes a text file; `version` is the one last read, or undefined when there was none. Returns the new one. */
  writeText(
    path: string,
    text: string,
    version: string | undefined,
    message: string
  ): Promise<string>
  /** When the file last changed, if the storage can tell. */
  modified(file: StoredFile): Promise<Date | null>
  /** The page that shows the file on the storage service's website, if there is one. */
  webUrl(file: StoredFile): string
}
