import { Injectable, computed, inject } from '@angular/core'
import { RepoApi } from '../github/repo-api'
import { SessionStore } from '../session/session.store'
import { GitHubStorage } from './github-storage'
import { ImageStorage } from './storage'

/** The storage in use: the repository or bucket chosen in the session. */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly session = inject(SessionStore)
  private readonly api = inject(RepoApi)

  readonly current = computed<ImageStorage | null>(() => {
    const repo = this.session.repo()
    return repo ? new GitHubStorage(this.api, repo) : null
  })
}
