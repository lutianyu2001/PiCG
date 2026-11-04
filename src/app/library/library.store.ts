import { Injectable, computed, signal } from '@angular/core'
import { ImageStorage, Listing } from '../storage/storage'

export interface ImageFile {
  path: string
  name: string
  dir: string
  /** Changes with the content: the Git blob SHA or the R2 ETag. */
  version: string
  size: number
}

export const IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'bmp'
] as const

export const extensionOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase()
export const isImageName = (name: string) =>
  name.includes('.') && (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(name))

export const parentOf = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
export const joinPath = (...parts: string[]) => parts.filter(Boolean).join('/')

/** Paths of folders and files starting with a dot (and everything inside them) are not shown. */
const hidden = (path: string) => path.split('/').some((part) => part.startsWith('.'))

interface Index {
  folders: Map<string, Set<string>>
  images: Map<string, ImageFile[]>
  paths: Set<string>
  /** Number of files of any kind directly in each folder. */
  files: Map<string, number>
}

const EMPTY: Listing = { files: [], folders: [], truncated: false }

function buildIndex(listing: Listing): Index {
  const folders = new Map<string, Set<string>>([['', new Set()]])
  const images = new Map<string, ImageFile[]>()
  const paths = new Set<string>()
  const files = new Map<string, number>()
  /** Adds a folder and every folder above it, each linked to its parent (R2 lists no folders of its own). */
  const addFolder = (path: string) => {
    for (let p = path; p; p = parentOf(p)) {
      const parent = parentOf(p)
      if (!folders.has(p)) {
        folders.set(p, new Set())
      }
      if (!folders.has(parent)) {
        folders.set(parent, new Set())
      }
      folders.get(parent)!.add(p)
    }
  }
  for (const folder of listing.folders) {
    paths.add(folder)
    if (!hidden(folder)) {
      addFolder(folder)
    }
  }
  for (const file of listing.files) {
    paths.add(file.path)
    const dir = parentOf(file.path)
    files.set(dir, (files.get(dir) ?? 0) + 1)
    if (hidden(file.path) || !isImageName(baseName(file.path))) {
      continue
    }
    addFolder(dir)
    const list = images.get(dir) ?? []
    list.push({
      path: file.path,
      name: baseName(file.path),
      dir,
      version: file.version,
      size: file.size
    })
    images.set(dir, list)
  }
  return { folders, images, paths, files }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** The files of the repository in use and the folder being viewed. */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private storage: ImageStorage | null = null
  private readonly index = signal<Index>(buildIndex(EMPTY))
  /** Folders created in the app that hold nothing yet, so Git does not know them. */
  private readonly localFolders = signal<Set<string>>(new Set())

  readonly path = signal('')
  readonly loading = signal(false)
  readonly error = signal<unknown>(null)
  readonly truncated = signal(false)
  readonly loaded = signal(false)

  readonly folders = computed(() => this.subfolders(this.path()))

  /** Folders directly in a folder, including those that exist only in the app, sorted by name. */
  subfolders(path: string): string[] {
    const known = [...(this.index().folders.get(path) ?? [])]
    const local = [...this.localFolders()].filter((f) => parentOf(f) === path && !known.includes(f))
    return [...known, ...local].sort((a, b) => collator.compare(baseName(a), baseName(b)))
  }

  /** The path is a folder, in the repository or only in the app; the root always is. */
  isFolder(path: string) {
    return path === '' || this.index().folders.has(path) || this.localFolders().has(path)
  }

  readonly images = computed(() =>
    [...(this.index().images.get(this.path()) ?? [])].sort((a, b) =>
      collator.compare(a.name, b.name)
    )
  )

  /** The folder being viewed exists only in the app. */
  readonly isLocalFolder = computed(
    () => this.path() !== '' && !this.index().folders.has(this.path())
  )

  async open(storage: ImageStorage) {
    this.storage = storage
    this.path.set('')
    this.localFolders.set(new Set())
    this.index.set(buildIndex(EMPTY))
    this.loaded.set(false)
    await this.reload()
  }

  async reload() {
    const storage = this.storage
    if (!storage) {
      return
    }
    this.loading.set(true)
    this.error.set(null)
    try {
      const listing = await storage.list()
      if (this.storage !== storage) {
        return
      }
      const index = buildIndex(listing)
      this.index.set(index)
      this.truncated.set(listing.truncated)
      // Local folders that now exist in the storage no longer need to be remembered.
      this.localFolders.update((set) => new Set([...set].filter((f) => !index.folders.has(f))))
    } catch (err) {
      this.error.set(err)
    } finally {
      if (this.storage === storage) {
        this.loading.set(false)
        this.loaded.set(true)
      }
    }
  }

  go(path: string) {
    this.path.set(path.replace(/^\/+|\/+$/g, ''))
  }

  addLocalFolder(path: string) {
    this.localFolders.update((set) => new Set([...set, path]))
  }

  exists(path: string) {
    return this.index().paths.has(path)
  }

  /** Files of any kind directly in a folder. */
  fileCount(dir: string) {
    return this.index().files.get(dir) ?? 0
  }

  /** Images in a folder and everything below it. */
  imagesUnder(path: string): ImageFile[] {
    const out: ImageFile[] = []
    for (const [dir, list] of this.index().images) {
      if (path === '' || dir === path || dir.startsWith(path + '/')) {
        out.push(...list)
      }
    }
    return out
  }
}
