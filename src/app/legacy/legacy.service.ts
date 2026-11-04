import { Injectable, inject, signal } from '@angular/core'
import { AppearanceStore, LanguageChoice, ThemeChoice } from '../core/appearance.store'
import { RepoApi, RepoRef } from '../github/repo-api'
import { SETTINGS_PATH } from '../settings/settings-file'
import { AppSettings } from '../settings/settings.model'
import { SettingsStore } from '../settings/settings.store'
import { legacyReveal } from './legacy-reveal'
import {
  LEGACY_LOCAL_KEYS,
  LEGACY_REPO_DEPLOY,
  LEGACY_REPO_SETTINGS,
  LEGACY_SESSION_KEYS,
  LegacyBrowserData,
  decodeLegacyText,
  translateLegacyBrowser,
  translateLegacySettings
} from './legacy-translate'

export interface OldFile {
  path: string
  branch: string
  sha: string
}

export interface PendingConversion {
  ref: RepoRef
  settings: AppSettings
  /** Old files found in the repository. */
  files: OldFile[]
}

const safe = (read: () => string | null) => {
  try {
    return read()
  } catch {
    return null
  }
}

/**
 * The only part of PiCG that knows the data formats of earlier versions. It reads and translates them, and removes
 * them once the user agrees to keep the translated settings in PiCG's own format.
 */
@Injectable({ providedIn: 'root' })
export class LegacyService {
  private readonly api = inject(RepoApi)
  private readonly settings = inject(SettingsStore)
  private readonly appearance = inject(AppearanceStore)

  /** A repository whose old settings are in use but not yet converted. */
  readonly pending = signal<PendingConversion | null>(null)
  private browserCache: LegacyBrowserData | null | undefined

  browser(): LegacyBrowserData | null {
    if (this.browserCache === undefined) {
      this.browserCache = translateLegacyBrowser(
        (key) => safe(() => localStorage.getItem(key)),
        (key) => safe(() => sessionStorage.getItem(key)),
        legacyReveal
      )
    }
    return this.browserCache
  }

  /** Browser data never leaves the device, so it is converted and removed without asking. */
  adoptBrowserAppearance() {
    const data = this.browser()
    if (!data) {
      return
    }
    const language = (['zh-CN', 'zh-TW', 'en', 'ja'] as const).find((x) => x === data.language)
    const theme = (['system', 'light', 'dark'] as const).find((x) => x === data.theme)
    const current = this.appearance.value()
    this.appearance.patch({
      language:
        current.language === 'system' && language ? (language as LanguageChoice) : current.language,
      theme: current.theme === 'system' && theme ? (theme as ThemeChoice) : current.theme,
      navCollapsed: data.navCollapsed ?? current.navCollapsed
    })
  }

  clearBrowser() {
    for (const key of LEGACY_LOCAL_KEYS) {
      safe(() => (localStorage.removeItem(key), null))
    }
    for (const key of LEGACY_SESSION_KEYS) {
      safe(() => (sessionStorage.removeItem(key), null))
    }
    this.browserCache = null
  }

  /**
   * Called when a repository has no PiCG settings file. Uses old settings from the repository when there are some
   * (and asks before converting), otherwise old settings from the browser.
   * Returns true when the repository holds old data that waits for the user's answer.
   */
  /**
   * Finds an old file on the image branch, or on the default branch: PicX up to v3.0.x always wrote there, and
   * its deploy status is read from there by later versions too.
   */
  private async findOld(ref: RepoRef, path: string) {
    const branches = [...new Set([ref.branch, ref.defaultBranch].filter((b): b is string => !!b))]
    for (const branch of branches) {
      const file = await this.api.readBytes(ref, path, branch).catch(() => null)
      if (file) {
        return { ...file, path, branch }
      }
    }
    return null
  }

  async adopt(ref: RepoRef): Promise<boolean> {
    const [old, deploy] = await Promise.all([
      this.findOld(ref, LEGACY_REPO_SETTINGS),
      this.findOld(ref, LEGACY_REPO_DEPLOY)
    ])
    if (old) {
      let parsed: unknown = {}
      try {
        parsed = JSON.parse(decodeLegacyText(old.bytes))
      } catch {
        // A damaged file still counts as found, so it can be replaced; the defaults are used.
      }
      const settings = translateLegacySettings(parsed)
      this.settings.replaceLocal(settings)
      this.settings.setBlocked(true)
      const files = [old, ...(deploy ? [deploy] : [])].map(({ path, branch, sha }) => ({
        path,
        branch,
        sha
      }))
      this.pending.set({ ref, settings, files })
      return true
    }

    const browser = this.browser()?.settings
    if (browser) {
      this.settings.replaceLocal(browser)
      this.settings.schedule()
    }
    this.clearBrowser()
    return false
  }

  /** Writes the settings in PiCG's format and deletes the old files, in one commit. */
  async convert() {
    const pending = this.pending()
    if (!pending) {
      return
    }
    const here = pending.files.filter((f) => f.branch === pending.ref.branch)
    const elsewhere = pending.files.filter((f) => f.branch !== pending.ref.branch)
    await this.api.commit(
      pending.ref,
      [
        { path: SETTINGS_PATH, content: this.settings.fileText() },
        ...here.map(({ path }) => ({ path, delete: true as const }))
      ],
      'Convert settings'
    )
    for (const file of elsewhere) {
      await this.api
        .deleteFile(
          { ...pending.ref, branch: file.branch },
          file.path,
          file.sha,
          'Delete old settings'
        )
        .catch(() => undefined)
    }
    this.pending.set(null)
    this.settings.setBlocked(false)
    await this.settings.reloadSha()
    this.clearBrowser()
  }

  /** Forgets a pending conversion, for example after switching to another repository. */
  drop() {
    this.pending.set(null)
  }
}
