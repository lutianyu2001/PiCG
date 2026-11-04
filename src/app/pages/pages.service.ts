import { Injectable, inject, signal } from '@angular/core'
import { RepoApi, RepoRef } from '../github/repo-api'

export const LEGACY_PAGES_BRANCH = 'gh-pages'
const CNAME = 'CNAME'

export interface PagesStatus {
  /** null until checked. */
  enabled: boolean | null
  /** An old deploy branch is still there and may be what Pages publishes. */
  legacyBranch: boolean
  /** Domain from the image branch's own CNAME, or empty. */
  domain: string
  /** Domain of the account's main site (`{owner}.github.io`), which serves this repository under its name. */
  siteDomain: string
  /** Base URL of the published site without a trailing slash. */
  base: string
}

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** Reads a domain from text such as a CNAME file. Empty text gives '', anything else invalid gives null. */
export function normalizeDomain(text: string): string | null {
  const first = text.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const domain = first.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!domain) {
    return ''
  }
  return DOMAIN.test(domain) ? domain : null
}

export const defaultPagesBase = (ref: Pick<RepoRef, 'owner' | 'name'>) =>
  `https://${ref.owner.toLowerCase()}.github.io/${ref.name}`

/** GitHub Pages of the image repository: whether it is on, and the address images are published at. */
@Injectable({ providedIn: 'root' })
export class PagesService {
  private readonly api = inject(RepoApi)

  readonly status = signal<PagesStatus>({
    enabled: null,
    legacyBranch: false,
    domain: '',
    siteDomain: '',
    base: ''
  })
  private ref: RepoRef | null = null

  /** Starts over for a repository, or for no repository when the storage in use is not one. */
  reset(ref: RepoRef | null) {
    this.ref = ref
    this.status.set({
      enabled: null,
      legacyBranch: false,
      domain: '',
      siteDomain: '',
      base: ref ? defaultPagesBase(ref) : ''
    })
  }

  async detect() {
    const ref = this.ref
    if (!ref) {
      return
    }
    const [repo, legacyBranch, own, site] = await Promise.all([
      this.api.repo(ref.owner, ref.name).catch(() => null),
      this.api.hasBranch(ref, LEGACY_PAGES_BRANCH).catch(() => false),
      this.readDomain(ref, ref.name, ref.branch),
      this.readDomain(ref, `${ref.owner}.github.io`)
    ])
    if (this.ref !== ref) {
      return
    }
    let base = defaultPagesBase(ref)
    if (own) {
      base = `https://${own}`
    } else if (site) {
      base = `https://${site}/${ref.name}`
    }
    this.status.update((current) => ({
      enabled: repo ? repo.has_pages : current.enabled,
      // A gh-pages branch that is the default branch is where the user keeps the repository, not a leftover deploy.
      legacyBranch:
        legacyBranch &&
        ref.branch !== LEGACY_PAGES_BRANCH &&
        (repo?.default_branch ?? ref.defaultBranch) !== LEGACY_PAGES_BRANCH,
      domain: own,
      siteDomain: site,
      base
    }))
  }

  private async readDomain(ref: RepoRef, name: string, branch?: string) {
    try {
      const file = await this.api.readText({ owner: ref.owner, name, branch: branch ?? '' }, CNAME)
      return (file && normalizeDomain(file.text)) || ''
    } catch {
      return ''
    }
  }

  /** Writes the domain to CNAME on the image branch, or deletes the file when the domain is empty. */
  async saveDomain(domain: string) {
    const ref = this.ref
    if (!ref) {
      return
    }
    const existing = await this.api.readText(ref, CNAME)
    if (domain) {
      await this.api.writeText(ref, CNAME, `${domain}\n`, 'Update CNAME', existing?.sha)
    } else if (existing) {
      await this.api.deleteFile(ref, CNAME, existing.sha, 'Delete CNAME')
    }
    await this.detect()
  }
}
