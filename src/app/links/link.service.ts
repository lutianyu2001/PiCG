import { Injectable, computed, inject } from '@angular/core'
import { Clipboard } from '../core/clipboard'
import { PagesService } from '../pages/pages.service'
import { SessionStore } from '../session/session.store'
import { SettingsStore } from '../settings/settings.store'
import { BUILT_IN_RULES, LinkContext, allFormats, allRules, buildUrl, formatLink } from './links'

/** Links of images in the repository in use, following the selected rule and format. */
@Injectable({ providedIn: 'root' })
export class LinkService {
  private readonly session = inject(SessionStore)
  private readonly settings = inject(SettingsStore)
  private readonly pages = inject(PagesService)
  private readonly clipboard = inject(Clipboard)

  private readonly context = computed<LinkContext | null>(() => {
    const repo = this.session.repo()
    if (!repo) {
      return null
    }
    return {
      owner: repo.owner,
      repo: repo.name,
      branch: repo.branch,
      pages: this.pages.status().base
    }
  })

  readonly rule = computed(() => {
    const link = this.settings.settings().link
    return allRules(link).find((r) => r.id === link.rule) ?? BUILT_IN_RULES[0]
  })

  readonly format = computed(() => {
    const link = this.settings.settings().link
    return allFormats(link).find((f) => f.id === link.format) ?? allFormats(link)[0]
  })

  url(path: string): string {
    const ctx = this.context()
    return ctx ? buildUrl(this.rule().template, ctx, path) : ''
  }

  /** URL with the GitHub rule, which works as soon as the commit exists; used for thumbnails as a fallback. */
  rawUrl(path: string): string {
    const ctx = this.context()
    return ctx ? buildUrl(BUILT_IN_RULES[0].template, ctx, path) : ''
  }

  formatted(path: string): string {
    const name = path.slice(path.lastIndexOf('/') + 1)
    return formatLink(this.format().template, this.url(path), name)
  }

  copy(paths: string[]) {
    if (!paths.length) {
      return Promise.resolve()
    }
    const text = paths.map((p) => this.formatted(p)).join('\n')
    return this.clipboard.copy(
      text,
      paths.length === 1 ? 'links.copied_one' : 'links.copied_many',
      {
        count: paths.length
      }
    )
  }
}
