import { Injectable, inject } from '@angular/core'
import { GitHubClient, GitHubError } from '../github/github.client'
import { RepoRef } from '../github/repo-api'
import { GitHubUser } from './session.store'

export type CheckFailure =
  | 'invalid'
  | 'classic'
  | 'repo_missing'
  | 'branch_missing'
  | 'no_write'
  | 'other_write'
  | 'repo_blocked'
  | 'network'
  | 'rate_limit'
  | 'unexpected'

export interface CheckedRepo extends RepoRef {
  defaultBranch: string
  /** The repository has no commits yet. */
  empty: boolean
}

export type CheckResult =
  | { ok: true; user: GitHubUser; repos: CheckedRepo[] }
  | { ok: false; reason: CheckFailure; repo?: string; branch?: string; status?: number }

/** Failures that say nothing about the token itself, so it is kept in the form. */
export const KEEPS_TOKEN: readonly CheckFailure[] = [
  'repo_missing',
  'repo_blocked',
  'branch_missing',
  'network',
  'rate_limit',
  'unexpected'
]

/** A repository as the user wrote it; without a branch the default branch is used. */
export interface RepoSpec {
  name: string
  branch?: string
}

const BRANCH = /^(?!\/|.*(\.\.|\/\/|@\{|\.lock$|\/$|\.$))[A-Za-z0-9._/-]+$/

const PARALLEL = 6

export const isBranchName = (text: string) => BRANCH.test(text)

/** Parses `name` or `name@branch` entries separated by commas or spaces. Returns null when one is invalid. */
export function parseRepoSpecs(text: string, fallback: string): RepoSpec[] | null {
  const parts = text.split(/[\s,，、]+/).filter(Boolean)
  if (!parts.length) {
    return [{ name: fallback }]
  }
  const specs: RepoSpec[] = []
  for (const part of parts) {
    const at = part.indexOf('@')
    const name = at < 0 ? part : part.slice(0, at)
    const branch = at < 0 ? undefined : part.slice(at + 1)
    if (!/^[A-Za-z0-9._-]+$/.test(name) || (branch !== undefined && !isBranchName(branch))) {
      return null
    }
    if (!specs.some((s) => s.name === name)) {
      specs.push(branch ? { name, branch } : { name })
    }
  }
  return specs
}

export const formatRepoSpecs = (repos: readonly RepoSpec[]) =>
  repos.map((r) => (r.branch ? `${r.name}@${r.branch}` : r.name)).join(', ')

class Stop extends Error {
  constructor(readonly result: CheckResult) {
    super(result.ok ? 'ok' : result.reason)
  }
}

/**
 * Checks that a token is a fine-grained token that can write to exactly the listed repositories of its owner.
 *
 * Write access is probed by asking GitHub to create an empty blob: without the permission GitHub answers 403 or 404
 * (451 for a repository GitHub has blocked);
 * with it, it answers 201 (or 409 for a repository without commits). The empty blob is the same object in every
 * repository and is referenced by nothing, so the probe changes nothing visible.
 */
@Injectable({ providedIn: 'root' })
export class TokenCheck {
  private readonly gh = inject(GitHubClient)

  async check(token: string, specs: RepoSpec[], skipOthers: boolean): Promise<CheckResult> {
    try {
      return await this.run(token.trim(), specs, skipOthers)
    } catch (err) {
      if (err instanceof Stop) {
        return err.result
      }
      if (err instanceof GitHubError) {
        if (err.kind === 'rate_limit') {
          return { ok: false, reason: 'rate_limit' }
        }
        if (err.kind === 'unauthorized') {
          return { ok: false, reason: 'invalid' }
        }
        // Only a failed request is a network error; any other answer from GitHub is reported as it is.
        if (err.kind !== 'network') {
          return { ok: false, reason: 'unexpected', status: err.status }
        }
      }
      return { ok: false, reason: 'network' }
    }
  }

  private async run(token: string, specs: RepoSpec[], skipOthers: boolean): Promise<CheckResult> {
    if (/^(ghp|gho|ghu|ghs|ghr)_/.test(token)) {
      return { ok: false, reason: 'classic' }
    }
    if (!token.startsWith('github_pat_')) {
      return { ok: false, reason: 'invalid' }
    }

    const me = await this.gh.get<{
      login: string
      id: number
      name: string | null
      avatar_url: string
    }>('/user', {
      token
    })
    const user: GitHubUser = {
      login: me.login,
      id: me.id,
      name: me.name ?? '',
      avatarUrl: me.avatar_url
    }

    const repos: CheckedRepo[] = []
    for (const spec of specs) {
      const repo = await this.gh
        .find<{ name: string; default_branch: string }>(`/repos/${user.login}/${spec.name}`, {
          token
        })
        .catch((err: unknown) => {
          if (err instanceof GitHubError && err.kind === 'blocked') {
            throw new Stop({ ok: false, reason: 'repo_blocked', repo: spec.name })
          }
          throw err
        })
      if (!repo) {
        return { ok: false, reason: 'repo_missing', repo: spec.name }
      }
      if (!(await this.canWrite(token, user.login, repo.name))) {
        return { ok: false, reason: 'no_write', repo: repo.name }
      }
      const head = await this.gh.find(
        `/repos/${user.login}/${repo.name}/branches/${encodeURIComponent(repo.default_branch)}`,
        { token }
      )
      const branch = spec.branch ?? repo.default_branch
      // A chosen branch must exist, unless the repository is empty and the branch will be created with it.
      if (branch !== repo.default_branch && head !== null) {
        const found = await this.gh.find(
          `/repos/${user.login}/${repo.name}/branches/${encodeURIComponent(branch)}`,
          { token }
        )
        if (!found) {
          return { ok: false, reason: 'branch_missing', repo: repo.name, branch }
        }
      }
      repos.push({
        owner: user.login,
        name: repo.name,
        branch,
        defaultBranch: repo.default_branch,
        empty: head === null
      })
    }

    if (!skipOthers) {
      const listed = new Set(repos.map((r) => `${user.login}/${r.name}`.toLowerCase()))
      const others = (await this.accessibleRepos(token)).filter(
        (r) => !listed.has(r.full_name.toLowerCase()) && r.permissions?.push !== false
      )
      await this.inBatches(others, async (repo) => {
        const [owner, name] = repo.full_name.split('/')
        if (await this.canWrite(token, owner, name)) {
          throw new Stop({ ok: false, reason: 'other_write', repo: repo.full_name })
        }
      })
    }

    return { ok: true, user, repos }
  }

  /** Login of the token's owner, or null when the token is not accepted. */
  async owner(token: string) {
    const me = await this.gh.find<{ login: string }>('/user', { token })
    return me?.login ?? null
  }

  async defaultBranch(token: string, owner: string, name: string) {
    const repo = await this.gh.get<{ default_branch: string }>(`/repos/${owner}/${name}`, { token })
    return repo.default_branch
  }

  private async canWrite(token: string, owner: string, name: string) {
    try {
      await this.gh.post(
        `/repos/${owner}/${name}/git/blobs`,
        { content: '', encoding: 'utf-8' },
        { token }
      )
      return true
    } catch (err) {
      if (err instanceof GitHubError) {
        if (err.kind === 'validation' || err.kind === 'conflict') {
          return true
        }
        // A repository GitHub has blocked (DMCA takedown) cannot be written by anyone, and the owner cannot delete
        // it, so it must not stop the check of the other repositories.
        if (err.kind === 'forbidden' || err.kind === 'not_found' || err.kind === 'blocked') {
          return false
        }
      }
      throw err
    }
  }

  private async accessibleRepos(token: string) {
    type Item = { full_name: string; permissions?: { push?: boolean } }
    const all: Item[] = []
    for (let page = 1; ; page++) {
      const items = await this.gh.get<Item[]>('/user/repos', {
        token,
        query: { per_page: 100, page, affiliation: 'owner,collaborator,organization_member' }
      })
      all.push(...items)
      if (items.length < 100) {
        return all
      }
    }
  }

  private async inBatches<T>(items: T[], run: (item: T) => Promise<void>) {
    for (let i = 0; i < items.length; i += PARALLEL) {
      await Promise.all(items.slice(i, i + PARALLEL).map(run))
    }
  }
}
