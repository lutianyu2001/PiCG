import { Injectable, signal } from '@angular/core'
import { StorageError, StorageErrorKind } from '../storage/storage'

export const API_BASE = 'https://api.github.com'
const TIMEOUT_MS = 60_000

export type GitHubErrorKind = StorageErrorKind

export class GitHubError extends StorageError {
  constructor(kind: GitHubErrorKind, status: number, message: string) {
    super('github', kind, status, message)
  }
}

function classify(status: number, message: string, headers: Headers): GitHubErrorKind {
  if (status === 401) {
    return 'unauthorized'
  }
  if (
    status === 429 ||
    (status === 403 &&
      (headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(message)))
  ) {
    return 'rate_limit'
  }
  if (status === 403) {
    return 'forbidden'
  }
  if (status === 404) {
    return 'not_found'
  }
  if (status === 409 || /fast.forward|does not match/i.test(message)) {
    return 'conflict'
  }
  // GitHub has blocked the repository, for example after a DMCA takedown. The owner cannot delete it, and it still
  // shows up in listings of the owner's repositories.
  if (status === 451) {
    return 'blocked'
  }
  if (status === 413) {
    return 'too_large'
  }
  if (status === 422) {
    return 'validation'
  }
  return status >= 500 ? 'server' : 'unknown'
}

export interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number | boolean>
  /** Overrides the session token, used while checking a token before signing in. */
  token?: string
}

/** Thin wrapper over the GitHub REST API. Every failure is thrown as a GitHubError. */
@Injectable({ providedIn: 'root' })
export class GitHubClient {
  readonly token = signal('')

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path.replace(/^\/?/, '/'), API_BASE)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value))
    }
    const token = options.token ?? this.token()
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        // The API sends cache headers; reads must see writes made a moment ago.
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch (err) {
      throw new GitHubError('network', 0, (err as Error).message)
    }

    if (!res.ok) {
      let message = res.statusText
      try {
        message = ((await res.json()) as { message?: string }).message ?? message
      } catch {
        // The body is not JSON; keep the status text.
      }
      throw new GitHubError(classify(res.status, message, res.headers), res.status, message)
    }
    if (res.status === 204) {
      return undefined as T
    }
    return (await res.json()) as T
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>('GET', path, options)
  }

  /** GET that returns null instead of throwing when the resource does not exist. */
  async find<T>(path: string, options?: RequestOptions): Promise<T | null> {
    try {
      return await this.get<T>(path, options)
    } catch (err) {
      if (err instanceof GitHubError && err.kind === 'not_found') {
        return null
      }
      throw err
    }
  }

  post<T>(path: string, body: unknown, options?: RequestOptions) {
    return this.request<T>('POST', path, { ...options, body })
  }

  put<T>(path: string, body: unknown, options?: RequestOptions) {
    return this.request<T>('PUT', path, { ...options, body })
  }

  patch<T>(path: string, body: unknown, options?: RequestOptions) {
    return this.request<T>('PATCH', path, { ...options, body })
  }

  delete<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('DELETE', path, { ...options, body })
  }
}
