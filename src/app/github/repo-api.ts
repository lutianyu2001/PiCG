import { Injectable, inject } from '@angular/core'
import { GitHubClient, GitHubError } from './github.client'

export interface RepoRef {
  owner: string
  name: string
  /** The branch PiCG works on. */
  branch: string
  /** The repository's default branch, when known. */
  defaultBranch?: string
}

export interface TreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

export interface RepoFile {
  sha: string
  /** Decoded UTF-8 text. */
  text: string
}

/** One change in a commit: new content, an existing blob at a new path, or a deletion. */
export type Change =
  | { path: string; content: string }
  | { path: string; blob: string }
  | { path: string; delete: true }

export const COMMIT_SUFFIX = ' via PiCG'

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/')
const repoPath = (ref: Pick<RepoRef, 'owner' | 'name'>, rest = '') =>
  `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}${rest}`

export function encodeBase64Text(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
}

export function decodeBase64Text(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(bin)
}

/** Repository operations PiCG needs, on top of the REST API. */
@Injectable({ providedIn: 'root' })
export class RepoApi {
  private readonly gh = inject(GitHubClient)

  /** The whole file tree of the branch. `truncated` is set when GitHub could not return all of it. */
  async tree(ref: RepoRef) {
    const res = await this.gh.get<{ sha: string; tree: TreeEntry[]; truncated: boolean }>(
      repoPath(ref, `/git/trees/${enc(ref.branch)}`),
      { query: { recursive: 1 } }
    )
    return res
  }

  async readText(ref: RepoRef, path: string, branch = ref.branch): Promise<RepoFile | null> {
    const file = await this.readBytes(ref, path, branch)
    return file ? { sha: file.sha, text: new TextDecoder().decode(file.bytes) } : null
  }

  async readBytes(ref: RepoRef, path: string, branch = ref.branch) {
    const res = await this.gh.find<{ sha: string; content?: string; type: string }>(
      repoPath(ref, `/contents/${enc(path)}`),
      { query: branch ? { ref: branch } : {} }
    )
    if (!res || res.type !== 'file') {
      return null
    }
    const bin = atob((res.content ?? '').replace(/\s/g, ''))
    return { sha: res.sha, bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)) }
  }

  /** Creates or replaces one file with the contents API. `sha` is the current blob when replacing. */
  async writeText(ref: RepoRef, path: string, text: string, message: string, sha?: string) {
    const res = await this.gh.put<{ content: { sha: string } }>(
      repoPath(ref, `/contents/${enc(path)}`),
      {
        message: message + COMMIT_SUFFIX,
        content: encodeBase64Text(text),
        branch: ref.branch,
        ...(sha ? { sha } : {})
      }
    )
    return res.content.sha
  }

  async deleteFile(ref: RepoRef, path: string, sha: string, message: string) {
    await this.gh.delete(repoPath(ref, `/contents/${enc(path)}`), {
      message: message + COMMIT_SUFFIX,
      sha,
      branch: ref.branch
    })
  }

  async createBlob(ref: RepoRef, base64: string): Promise<string> {
    const res = await this.gh.post<{ sha: string }>(repoPath(ref, '/git/blobs'), {
      content: base64,
      encoding: 'base64'
    })
    return res.sha
  }

  /** Base64 content of a blob, in any repository the token can read. */
  async readBlob(owner: string, name: string, sha: string): Promise<string> {
    const res = await this.gh.get<{ content: string }>(
      repoPath({ owner, name }, `/git/blobs/${sha}`)
    )
    return res.content.replace(/\s/g, '')
  }

  /**
   * Applies all changes in one commit on top of the branch head. If the branch moved in the meantime, the commit
   * is rebuilt on the new head once.
   */
  async commit(ref: RepoRef, changes: Change[], message: string): Promise<string> {
    try {
      return await this.commitOnce(ref, changes, message)
    } catch (err) {
      if (err instanceof GitHubError && (err.kind === 'conflict' || err.kind === 'validation')) {
        return this.commitOnce(ref, changes, message)
      }
      throw err
    }
  }

  private async commitOnce(ref: RepoRef, changes: Change[], message: string) {
    const branch = await this.gh.get<{
      commit: { sha: string; commit: { tree: { sha: string } } }
    }>(repoPath(ref, `/branches/${enc(ref.branch)}`))
    const tree = await this.gh.post<{ sha: string }>(repoPath(ref, '/git/trees'), {
      base_tree: branch.commit.commit.tree.sha,
      tree: changes.map((change) => {
        const base = { path: change.path, mode: '100644', type: 'blob' }
        if ('content' in change) {
          return { ...base, content: change.content }
        }
        return { ...base, sha: 'blob' in change ? change.blob : null }
      })
    })
    const commit = await this.gh.post<{ sha: string }>(repoPath(ref, '/git/commits'), {
      message: message + COMMIT_SUFFIX,
      tree: tree.sha,
      parents: [branch.commit.sha]
    })
    await this.gh.patch(repoPath(ref, `/git/refs/heads/${enc(ref.branch)}`), { sha: commit.sha })
    return commit.sha
  }

  async lastCommit(ref: RepoRef, path: string) {
    const list = await this.gh.get<{ sha: string; commit: { committer: { date: string } } }[]>(
      repoPath(ref, '/commits'),
      { query: { path, sha: ref.branch, per_page: 1 } }
    )
    return list[0] ?? null
  }

  repo(owner: string, name: string) {
    return this.gh.find<{
      full_name: string
      default_branch: string
      has_pages: boolean
      private: boolean
      archived: boolean
    }>(repoPath({ owner, name }))
  }

  async hasBranch(ref: Pick<RepoRef, 'owner' | 'name'>, branch: string) {
    return (await this.gh.find(repoPath(ref, `/branches/${enc(branch)}`))) !== null
  }
}
