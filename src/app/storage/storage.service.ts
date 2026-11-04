import { Injectable, computed, inject } from '@angular/core'
import { RepoApi } from '../github/repo-api'
import { SessionStore } from '../session/session.store'
import { GitHubStorage } from './github-storage'
import { R2Storage } from './r2-storage'
import { ImageStorage } from './storage'

/** The storage in use: the repository or bucket chosen in the session. */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly session = inject(SessionStore)
  private readonly api = inject(RepoApi)

  /** The R2 keys of the session, read on every request so that replaced keys take effect at once. */
  private readonly keys = () => {
    const account = this.session.r2()
    return {
      accessKeyId: account?.accessKeyId ?? '',
      secretAccessKey: account?.secretAccessKey ?? ''
    }
  }

  readonly current = computed<ImageStorage | null>(() => {
    const repo = this.session.repo()
    if (repo) {
      return new GitHubStorage(this.api, repo)
    }
    const bucket = this.session.bucket()
    return bucket ? new R2Storage(bucket, this.keys) : null
  })
}
