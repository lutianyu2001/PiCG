import { Injectable, computed, inject } from '@angular/core'
import { Clipboard } from '../core/clipboard'
import { PagesService } from '../pages/pages.service'
import { SessionStore } from '../session/session.store'
import { SettingsStore } from '../settings/settings.store'
import { LinkContext, allFormats, allRules, buildUrl, builtInRules, formatLink } from './links'

/** Links of images in the repository or bucket in use, following the selected rule and format. */
@Injectable({ providedIn: 'root' })
export class LinkService {
  private readonly session = inject(SessionStore)
  private readonly settings = inject(SettingsStore)
  private readonly pages = inject(PagesService)
  private readonly clipboard = inject(Clipboard)

  private readonly context = computed<LinkContext | null>(() => {
    const repo = this.session.repo()
    if (repo) {
      return {
        kind: 'github',
        owner: repo.owner,
        repo: repo.name,
        branch: repo.branch,
        pages: this.pages.status().base,
        bucket: '',
        public: ''
      }
    }
    const bucket = this.session.bucket()
    if (bucket) {
      return {
        kind: 'r2',
        owner: '',
        repo: '',
        branch: '',
        pages: '',
        bucket: bucket.bucket,
        public: bucket.publicUrl
      }
    }
    return null
  })

  readonly kind = computed(() => this.context()?.kind ?? 'github')

  /** The rules that apply to the storage in use. */
  readonly rules = computed(() => allRules(this.settings.settings().link, this.kind()))

  readonly rule = computed(() => {
    const link = this.settings.settings().link
    return this.rules().find((r) => r.id === link.rule) ?? builtInRules(this.kind())[0]
  })

  readonly format = computed(() => {
    const link = this.settings.settings().link
    return allFormats(link).find((f) => f.id === link.format) ?? allFormats(link)[0]
  })

  url(path: string): string {
    const ctx = this.context()
    return ctx ? buildUrl(this.rule().template, ctx, path) : ''
  }

  /**
   * URL with the first built-in rule (GitHub's, which works as soon as the commit exists, or the bucket's public
   * address); used for thumbnails as a fallback.
   */
  rawUrl(path: string): string {
    const ctx = this.context()
    return ctx ? buildUrl(builtInRules(ctx.kind)[0].template, ctx, path) : ''
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
