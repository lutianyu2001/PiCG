import { Injectable, computed, effect, inject, signal } from '@angular/core'
import { deobfuscate, obfuscate } from '../core/obfuscate'
import { readJson, removeKey, removeKeysStartingWith, writeJson } from '../core/storage'
import { GitHubClient } from '../github/github.client'
import { RepoRef } from '../github/repo-api'

export interface GitHubUser {
  login: string
  id: number
  name: string
  avatarUrl: string
}

interface SessionState {
  token: string
  user: GitHubUser | null
  repos: RepoRef[]
  /** Name of the repository in use. */
  current: string
}

interface StoredSession extends Omit<SessionState, 'token'> {
  token: string
}

const KEY = 'session'
const EMPTY: SessionState = { token: '', user: null, repos: [], current: '' }

function load(): SessionState {
  const stored = readJson<Partial<StoredSession>>(KEY, {})
  return {
    ...EMPTY,
    ...stored,
    token: deobfuscate(stored.token ?? ''),
    repos: Array.isArray(stored.repos) ? stored.repos : []
  }
}

/** Who is signed in, with which token, and which repositories PiCG may use. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly gh = inject(GitHubClient)
  private readonly state = signal<SessionState>(load())

  readonly token = computed(() => this.state().token)
  readonly user = computed(() => this.state().user)
  readonly repos = computed(() => this.state().repos)
  readonly loggedIn = computed(
    () => !!this.state().user && this.state().repos.length > 0 && !!this.state().token
  )
  readonly repo = computed<RepoRef | null>(() => {
    const { repos, current } = this.state()
    return repos.find((r) => r.name === current) ?? repos[0] ?? null
  })

  constructor() {
    effect(() => this.gh.token.set(this.state().token))
  }

  private set(next: SessionState) {
    this.state.set(next)
    writeJson(KEY, { ...next, token: obfuscate(next.token) })
  }

  signIn(token: string, user: GitHubUser, repos: RepoRef[]) {
    this.set({ token, user, repos, current: repos[0]?.name ?? '' })
  }

  setRepos(repos: RepoRef[]) {
    const { current } = this.state()
    this.set({
      ...this.state(),
      repos,
      current: repos.some((r) => r.name === current) ? current : (repos[0]?.name ?? '')
    })
  }

  setToken(token: string) {
    this.set({ ...this.state(), token })
  }

  switchTo(name: string) {
    if (this.state().repos.some((r) => r.name === name)) {
      this.set({ ...this.state(), current: name })
    }
  }

  /**
   * Signs out. With `keep`, the token and repository names stay so the login form is filled in next time, and
   * cached settings stay too; otherwise everything PiCG stored on this device except appearance is removed.
   */
  signOut(keep: boolean) {
    if (keep) {
      this.set({ ...this.state(), user: null })
      return
    }
    this.state.set(EMPTY)
    removeKey(KEY)
    removeKeysStartingWith('settings.')
  }
}
