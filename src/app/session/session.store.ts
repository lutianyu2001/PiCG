import { Injectable, computed, effect, inject, signal } from '@angular/core'
import { deobfuscate, obfuscate } from '../core/obfuscate'
import { readJson, removeKey, removeKeysStartingWith, writeJson } from '../core/storage'
import { GitHubClient } from '../github/github.client'
import { RepoRef } from '../github/repo-api'
import { R2Keys } from '../r2/r2.client'
import { R2Target } from '../storage/r2-storage'

export interface GitHubUser {
  login: string
  id: number
  name: string
  avatarUrl: string
}

export interface GitHubAccount {
  kind: 'github'
  token: string
  /** Null for a session stored by an earlier version after signing out, which did not keep the user. */
  user: GitHubUser | null
  repos: RepoRef[]
  /** Name of the repository in use. */
  current: string
  /** The check of other repositories was skipped at sign-in, after the warning; one-click sign-in skips it too. */
  skipCheck?: boolean
  /** When the account was last signed in with, in milliseconds. */
  usedAt: number
}

export interface R2Bucket {
  name: string
  /** The address the bucket's objects are public at, without a trailing slash. */
  publicUrl: string
}

export interface R2Account extends R2Keys {
  kind: 'r2'
  /** The account's S3 API endpoint, such as `https://{account_id}.r2.cloudflarestorage.com`. */
  endpoint: string
  buckets: R2Bucket[]
  /** Name of the bucket in use. */
  current: string
  usedAt: number
}

export type Account = GitHubAccount | R2Account

/** Identifies an account on this device: the GitHub user, or the R2 endpoint with the key. */
export function accountId(account: Account): string {
  if (account.kind === 'r2') {
    return `r2:${account.endpoint}:${account.accessKeyId}`
  }
  return `github:${account.user?.id ?? account.token}`
}

interface State {
  accounts: Account[]
  /** Id of the account signed in with, or empty when signed out. */
  active: string
}

const KEY = 'accounts'
/** Where earlier versions kept the one session; read once and turned into a remembered account. */
const OLD_KEY = 'session'

const hide = (account: Account): Account =>
  account.kind === 'r2'
    ? { ...account, secretAccessKey: obfuscate(account.secretAccessKey) }
    : { ...account, token: obfuscate(account.token) }

const reveal = (account: Account): Account =>
  account.kind === 'r2'
    ? { ...account, secretAccessKey: deobfuscate(account.secretAccessKey) }
    : { ...account, token: deobfuscate(account.token) }

function load(): State {
  const stored = readJson<Partial<State> | null>(KEY, null)
  if (stored && Array.isArray(stored.accounts)) {
    return {
      accounts: stored.accounts
        .filter((a) => a && (a.kind === 'github' || a.kind === 'r2'))
        .map(reveal),
      active: typeof stored.active === 'string' ? stored.active : ''
    }
  }
  const old = readJson<{
    token?: string
    user?: GitHubUser | null
    repos?: RepoRef[]
    current?: string
  }>(OLD_KEY, {})
  const token = deobfuscate(old.token ?? '')
  if (!token) {
    return { accounts: [], active: '' }
  }
  const account: GitHubAccount = {
    kind: 'github',
    token,
    user: old.user ?? null,
    repos: Array.isArray(old.repos) ? old.repos : [],
    current: old.current ?? '',
    usedAt: Date.now()
  }
  return { accounts: [account], active: account.user ? accountId(account) : '' }
}

const sameRepo = (a: RepoRef | null, b: RepoRef | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.owner === b.owner &&
    a.name === b.name &&
    a.branch === b.branch &&
    a.defaultBranch === b.defaultBranch)

const sameBucket = (a: R2Target | null, b: R2Target | null) =>
  a === b ||
  (!!a && !!b && a.endpoint === b.endpoint && a.bucket === b.bucket && a.publicUrl === b.publicUrl)

/** Storage ids of an account's repositories or buckets, as prefixes of their cached settings. */
function settingsPrefixes(account: Account): string[] {
  if (account.kind === 'r2') {
    const host = new URL(account.endpoint).host
    return account.buckets.map((b) => `settings.r2:${host}/${b.name}`)
  }
  return account.repos.map((r) => `settings.${r.owner}/${r.name}@`)
}

/**
 * The accounts remembered on this device and the one signed in with. A GitHub account brings a token and the
 * repositories PiCG may use; an R2 account brings keys and buckets.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly gh = inject(GitHubClient)
  private readonly state = signal<State>(load())

  /** Remembered accounts, last used first. */
  readonly accounts = computed(() => [...this.state().accounts].sort((a, b) => b.usedAt - a.usedAt))
  readonly account = computed<Account | null>(
    () => this.state().accounts.find((a) => accountId(a) === this.state().active) ?? null
  )
  readonly kind = computed(() => this.account()?.kind ?? null)

  private readonly github = computed(() => {
    const account = this.account()
    return account?.kind === 'github' ? account : null
  })
  readonly r2 = computed(() => {
    const account = this.account()
    return account?.kind === 'r2' ? account : null
  })

  readonly token = computed(() => this.github()?.token ?? '')
  readonly user = computed(() => this.github()?.user ?? null)
  readonly repos = computed(() => this.github()?.repos ?? [])
  readonly loggedIn = computed(() => {
    const account = this.account()
    if (account?.kind === 'github') {
      return !!account.user && account.repos.length > 0 && !!account.token
    }
    return !!account && account.buckets.length > 0
  })
  readonly repo = computed<RepoRef | null>(
    () => {
      const account = this.github()
      if (!account) {
        return null
      }
      return account.repos.find((r) => r.name === account.current) ?? account.repos[0] ?? null
    },
    { equal: sameRepo }
  )
  readonly bucket = computed<R2Target | null>(
    () => {
      const account = this.r2()
      if (!account) {
        return null
      }
      const bucket = account.buckets.find((b) => b.name === account.current) ?? account.buckets[0]
      return bucket
        ? { endpoint: account.endpoint, bucket: bucket.name, publicUrl: bucket.publicUrl }
        : null
    },
    { equal: sameBucket }
  )
  /** Names of the repositories or buckets of the account, for switching between them. */
  readonly targets = computed(() => {
    const account = this.account()
    if (!account) {
      return []
    }
    return account.kind === 'r2'
      ? account.buckets.map((b) => b.name)
      : account.repos.map((r) => r.name)
  })
  readonly target = computed(() => this.repo()?.name ?? this.bucket()?.bucket ?? '')

  constructor() {
    effect(() => this.gh.token.set(this.token()))
    // A session of an earlier version was turned into an account; store it in the new place.
    if (this.state().accounts.length && readJson(KEY, null) === null) {
      this.set(this.state())
    }
  }

  private set(next: State) {
    this.state.set(next)
    writeJson(KEY, { ...next, accounts: next.accounts.map(hide) })
    removeKey(OLD_KEY)
  }

  /**
   * Remembers the account, replacing earlier copies of it (and those `same` matches), and signs in with it.
   */
  private use(account: Account, same: (a: Account) => boolean = () => false) {
    const id = accountId(account)
    const others = this.state().accounts.filter((a) => accountId(a) !== id && !same(a))
    this.set({ accounts: [...others, { ...account, usedAt: Date.now() }], active: id })
  }

  /** Changes the signed-in account. */
  private update(change: (account: Account) => Account) {
    const active = this.account()
    if (active) {
      this.use(change(active), (a) => accountId(a) === accountId(active))
    }
  }

  signIn(token: string, user: GitHubUser, repos: RepoRef[], skipCheck = false) {
    // A session from an earlier version may have no user; with the same token it is the same account.
    const same = (a: Account) => a.kind === 'github' && !a.user && a.token === token
    const known = this.state().accounts.find(
      (a) => a.kind === 'github' && (a.user?.id === user.id || same(a))
    )
    const current = repos.some((r) => r.name === known?.current) ? known!.current : repos[0]?.name
    this.use(
      { kind: 'github', token, user, repos, current: current ?? '', skipCheck, usedAt: 0 },
      same
    )
  }

  signInR2(endpoint: string, keys: R2Keys, buckets: R2Bucket[]) {
    const account: R2Account = {
      kind: 'r2',
      endpoint,
      ...keys,
      buckets,
      current: buckets[0]?.name ?? '',
      usedAt: 0
    }
    const known = this.state().accounts.find((a) => accountId(a) === accountId(account))
    if (known?.kind === 'r2' && buckets.some((b) => b.name === known.current)) {
      account.current = known.current
    }
    this.use(account)
  }

  setRepos(repos: RepoRef[]) {
    this.update((a) =>
      a.kind === 'github'
        ? {
            ...a,
            repos,
            current: repos.some((r) => r.name === a.current) ? a.current : (repos[0]?.name ?? '')
          }
        : a
    )
  }

  setBuckets(buckets: R2Bucket[]) {
    this.update((a) =>
      a.kind === 'r2'
        ? {
            ...a,
            buckets,
            current: buckets.some((b) => b.name === a.current)
              ? a.current
              : (buckets[0]?.name ?? '')
          }
        : a
    )
  }

  setToken(token: string) {
    this.update((a) => (a.kind === 'github' ? { ...a, token } : a))
  }

  /** Replaces the keys; a new access key makes it a new account, which replaces the old one. */
  setKeys(keys: R2Keys) {
    this.update((a) => (a.kind === 'r2' ? { ...a, ...keys } : a))
  }

  /** Uses another repository or bucket of the account. */
  switchTo(name: string) {
    if (this.targets().includes(name)) {
      this.update((a) => ({ ...a, current: name }))
    }
  }

  /**
   * Signs out. With `keep`, the account stays on this device, so it can be picked on the sign-in page, and its
   * cached settings stay too; otherwise the account and its cached settings are removed.
   */
  signOut(keep: boolean) {
    const id = this.state().active
    if (keep) {
      this.set({ ...this.state(), active: '' })
      return
    }
    this.forget(id)
  }

  /** Removes a remembered account and its cached settings from this device. */
  forget(id: string) {
    const account = this.state().accounts.find((a) => accountId(a) === id)
    if (account) {
      settingsPrefixes(account).forEach((prefix) => removeKeysStartingWith(prefix))
    }
    const accounts = this.state().accounts.filter((a) => accountId(a) !== id)
    const active = this.state().active === id ? '' : this.state().active
    if (!accounts.length) {
      this.state.set({ accounts, active })
      removeKey(KEY)
      removeKey(OLD_KEY)
      return
    }
    this.set({ accounts, active })
  }
}
