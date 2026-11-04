import { Injectable, effect, inject, untracked } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { Notify } from '../core/notify.service'
import { RepoApi, RepoRef } from '../github/repo-api'
import { LegacyDialog } from '../legacy/legacy-dialog'
import { LegacyService } from '../legacy/legacy.service'
import { LibraryStore } from '../library/library.store'
import { UploadQueueStore } from '../library/upload-queue.store'
import { PagesService } from '../pages/pages.service'
import { SettingsStore } from '../settings/settings.store'
import { GitHubStorage } from '../storage/github-storage'
import { ImageStorage } from '../storage/storage'
import { StorageService } from '../storage/storage.service'
import { SessionStore } from './session.store'

/**
 * Opens the repository or bucket in use: its files, settings and (for a repository) GitHub Pages status belong to
 * it and change together when the user switches.
 */
@Injectable({ providedIn: 'root' })
export class Workspace {
  private readonly session = inject(SessionStore)
  private readonly storage = inject(StorageService)
  private readonly library = inject(LibraryStore)
  private readonly settings = inject(SettingsStore)
  private readonly pages = inject(PagesService)
  private readonly legacy = inject(LegacyService)
  private readonly queue = inject(UploadQueueStore)
  private readonly dialog = inject(MatDialog)
  private readonly api = inject(RepoApi)
  private readonly notify = inject(Notify)

  private opened = ''
  /** The conversion question is asked once per start of the app. */
  private asked = new Set<string>()

  start() {
    this.legacy.adoptBrowserAppearance()
    effect(() => {
      const storage = this.storage.current()
      const loggedIn = this.session.loggedIn()
      untracked(() => {
        if (loggedIn && storage) {
          void this.open(storage)
        } else {
          this.opened = ''
        }
      })
    })
    addEventListener('pagehide', () => void this.settings.flush())
  }

  private async open(storage: ImageStorage) {
    const key = storage.id
    if (key === this.opened) {
      return
    }
    this.opened = key
    const repo = storage instanceof GitHubStorage ? storage.ref : null
    if (repo && (await this.followRenamedDefault(repo))) {
      return
    }
    this.queue.clear()
    this.legacy.drop()
    this.pages.reset(repo)
    void this.pages.detect()
    void this.library.open(storage)
    try {
      const found = await this.settings.open(storage)
      if (found === 'none' && repo && this.opened === key && (await this.legacy.adopt(repo))) {
        this.askToConvert(key)
      }
    } catch {
      // Settings could not be read (network, rate limit); the cached ones stay in use.
    }
  }

  /**
   * A repository that PiCG uses on its default branch may have had that branch renamed on GitHub since sign-in (for
   * example master to gh-pages). Then PiCG moves to the new default branch; the session change opens it again.
   */
  private async followRenamedDefault(repo: RepoRef) {
    if (repo.branch !== repo.defaultBranch) {
      return false
    }
    try {
      if (await this.api.hasBranch(repo, repo.branch)) {
        return false
      }
      const info = await this.api.repo(repo.owner, repo.name)
      const next = info?.default_branch
      if (
        !next ||
        next === repo.branch ||
        this.opened !== `${repo.owner}/${repo.name}@${repo.branch}`
      ) {
        return false
      }
      this.session.setRepos(
        this.session
          .repos()
          .map((r) => (r.name === repo.name ? { ...r, branch: next, defaultBranch: next } : r))
      )
      this.notify.info('settings.branch_changed', { repo: repo.name, branch: next })
      return true
    } catch {
      // Network or rate limit: carry on with the branch as it is; the library reports the error.
      return false
    }
  }

  askToConvert(key = this.opened) {
    if (this.asked.has(key) || !this.legacy.pending()) {
      return
    }
    this.asked.add(key)
    this.dialog.open(LegacyDialog, { width: '32rem', autoFocus: 'first-tabbable' })
  }

  /** Detects GitHub Pages again, for example after the user changed it on GitHub. */
  refreshPages() {
    return this.pages.detect()
  }
}
