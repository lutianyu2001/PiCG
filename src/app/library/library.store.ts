import { Injectable, computed, inject, signal } from '@angular/core'
import { GitHubError } from '../github/github.client'
import { RepoApi, RepoRef, TreeEntry } from '../github/repo-api'

export interface ImageFile {
  path: string
  name: string
  dir: string
  sha: string
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

function buildIndex(entries: TreeEntry[]): Index {
  const folders = new Map<string, Set<string>>([['', new Set()]])
  const images = new Map<string, ImageFile[]>()
  const paths = new Set<string>()
  const files = new Map<string, number>()
  const addFolder = (path: string) => {
    while (!folders.has(path)) {
      folders.set(path, new Set())
      const parent = parentOf(path)
      if (!folders.has(parent)) {
        folders.set(parent, new Set())
      }
      folders.get(parent)!.add(path)
      path = parent
    }
  }
  for (const entry of entries) {
    paths.add(entry.path)
    if (entry.type === 'blob') {
      const dir = parentOf(entry.path)
      files.set(dir, (files.get(dir) ?? 0) + 1)
    }
    if (hidden(entry.path)) {
      continue
    }
    if (entry.type === 'tree') {
      addFolder(entry.path)
      folders.get(parentOf(entry.path))!.add(entry.path)
    } else if (entry.type === 'blob' && isImageName(baseName(entry.path))) {
      const dir = parentOf(entry.path)
      addFolder(dir)
      const list = images.get(dir) ?? []
      list.push({
        path: entry.path,
        name: baseName(entry.path),
        dir,
        sha: entry.sha,
        size: entry.size ?? 0
      })
      images.set(dir, list)
    }
  }
  return { folders, images, paths, files }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** The files of the repository in use and the folder being viewed. */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly api = inject(RepoApi)

  private ref: RepoRef | null = null
  private readonly index = signal<Index>(buildIndex([]))
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

  async open(ref: RepoRef) {
    this.ref = ref
    this.path.set('')
    this.localFolders.set(new Set())
    this.index.set(buildIndex([]))
    this.loaded.set(false)
    await this.reload()
  }

  async reload() {
    const ref = this.ref
    if (!ref) {
      return
    }
    this.loading.set(true)
    this.error.set(null)
    try {
      const tree = await this.api.tree(ref)
      if (this.ref !== ref) {
        return
      }
      const index = buildIndex(tree.tree)
      this.index.set(index)
      this.truncated.set(tree.truncated)
      // Local folders that now exist in Git no longer need to be remembered.
      this.localFolders.update((set) => new Set([...set].filter((f) => !index.folders.has(f))))
    } catch (err) {
      // An empty repository has no tree yet; show it as empty.
      if (err instanceof GitHubError && (err.kind === 'conflict' || err.kind === 'not_found')) {
        this.index.set(buildIndex([]))
      } else {
        this.error.set(err)
      }
    } finally {
      if (this.ref === ref) {
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
