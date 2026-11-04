import { GitHubError } from '../github/github.client'
import { RepoApi, RepoRef, bytesToBase64 } from '../github/repo-api'
import { ImageStorage, Listing, StoredFile, Upload } from './storage'

/** At most this many files in one folder of a repository; an upload that would go past it fails for that folder. */
export const FOLDER_FILE_LIMIT = 1000
const PARALLEL_BLOBS = 4

/** A branch of a GitHub repository. Every change is one commit. */
export class GitHubStorage implements ImageStorage {
  readonly kind = 'github'
  readonly id: string
  readonly folderLimit = FOLDER_FILE_LIMIT

  constructor(
    private readonly api: RepoApi,
    readonly ref: RepoRef
  ) {
    this.id = `${ref.owner}/${ref.name}@${ref.branch}`
  }

  async list(): Promise<Listing> {
    try {
      const tree = await this.api.tree(this.ref)
      return {
        files: tree.tree
          .filter((e) => e.type === 'blob')
          .map((e) => ({ path: e.path, size: e.size ?? 0, version: e.sha })),
        folders: tree.tree.filter((e) => e.type === 'tree').map((e) => e.path),
        truncated: tree.truncated
      }
    } catch (err) {
      // An empty repository has no tree yet; it holds nothing.
      if (err instanceof GitHubError && (err.kind === 'conflict' || err.kind === 'not_found')) {
        return { files: [], folders: [], truncated: false }
      }
      throw err
    }
  }

  /** Uploads the files as blobs and adds them in one commit, so they all succeed or fail together. */
  async upload(files: Upload[], message: string) {
    const blobs = new Map<string, string>()
    const results = new Map<string, unknown>()
    try {
      for (let i = 0; i < files.length; i += PARALLEL_BLOBS) {
        await Promise.all(
          files.slice(i, i + PARALLEL_BLOBS).map(async (file) => {
            const bytes = new Uint8Array(await file.blob.arrayBuffer())
            blobs.set(file.path, await this.api.createBlob(this.ref, bytesToBase64(bytes)))
          })
        )
      }
      await this.api.commit(
        this.ref,
        files.map((file) => ({ path: file.path, blob: blobs.get(file.path)! })),
        message
      )
      files.forEach((file) => results.set(file.path, null))
    } catch (err) {
      files.forEach((file) => results.set(file.path, err))
    }
    return results
  }

  /** Keeps the blob, so the image is not encoded again. */
  async rename(file: StoredFile, to: string, message: string) {
    await this.api.commit(
      this.ref,
      [
        { path: to, blob: file.version },
        { path: file.path, delete: true }
      ],
      message
    )
  }

  async remove(files: StoredFile[], message: string) {
    await this.api.commit(
      this.ref,
      files.map((f) => ({ path: f.path, delete: true as const })),
      message
    )
  }

  async readText(path: string) {
    const file = await this.api.readText(this.ref, path)
    return file ? { version: file.sha, text: file.text } : null
  }

  writeText(path: string, text: string, version: string | undefined, message: string) {
    return this.api.writeText(this.ref, path, text, message, version)
  }

  async modified(file: StoredFile) {
    const commit = await this.api.lastCommit(this.ref, file.path)
    return commit ? new Date(commit.commit.committer.date) : null
  }

  webUrl(file: StoredFile) {
    const { owner, name, branch } = this.ref
    return `https://github.com/${owner}/${name}/blob/${branch}/${file.path}`
  }
}
