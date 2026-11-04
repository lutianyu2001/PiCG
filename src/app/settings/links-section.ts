import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButton, MatIconButton } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIcon } from '@angular/material/icon'
import { MatInput } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { Notify } from '../core/notify.service'
import { errorKey } from '../github/github.client'
import { LinkService } from '../links/link.service'
import {
  PAGES_RULE,
  allFormats,
  allRules,
  formatLink,
  formatProblem,
  newTemplateId,
  ruleProblem
} from '../links/links'
import { PagesNotice } from '../pages/pages-notice'
import { PagesService, normalizeDomain } from '../pages/pages.service'
import { SessionStore } from '../session/session.store'
import { SettingsStore } from './settings.store'

type Kind = 'rules' | 'formats'

@Component({
  selector: 'pg-links-section',
  imports: [
    FormsModule,
    MatButton,
    MatFormFieldModule,
    MatIcon,
    MatIconButton,
    MatInput,
    MatSelectModule,
    PagesNotice,
    TranslatePipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.scss',
  templateUrl: './links-section.html'
})
export class LinksSection {
  private readonly store = inject(SettingsStore)
  private readonly pages = inject(PagesService)
  private readonly links = inject(LinkService)
  private readonly notify = inject(Notify)
  private readonly session = inject(SessionStore)

  protected readonly link = computed(() => this.store.settings().link)
  protected readonly rules = computed(() => allRules(this.link()))
  protected readonly formats = computed(() => allFormats(this.link()))
  protected readonly pagesOff = computed(() => this.pages.status().enabled === false)
  protected readonly pagesSelected = computed(() => this.link().rule === PAGES_RULE)
  protected readonly sample = computed(() => {
    this.link()
    this.pages.status()
    return this.links.formatted('2026/11/photo.1a2b3c4d.webp')
  })

  protected readonly domainDraft = signal<string | null>(null)
  protected readonly domain = computed(() => this.domainDraft() ?? this.pages.status().domain)
  /** Without its own domain, the repository is served under the main site's domain, if that has one. */
  protected readonly domainPlaceholder = computed(() => {
    const { siteDomain } = this.pages.status()
    const repo = this.session.repo()
    return siteDomain && repo ? `${siteDomain}/${repo.name}` : 'img.example.com'
  })
  protected readonly domainChanged = computed(
    () => this.domainDraft() !== null && this.domainDraft()!.trim() !== this.pages.status().domain
  )
  protected readonly savingDomain = signal(false)

  protected readonly newName: Record<Kind, ReturnType<typeof signal<string>>> = {
    rules: signal(''),
    formats: signal('')
  }
  protected readonly newTemplate: Record<Kind, ReturnType<typeof signal<string>>> = {
    rules: signal(''),
    formats: signal('')
  }
  protected readonly PAGES_RULE = PAGES_RULE
  protected readonly kinds: readonly Kind[] = ['rules', 'formats']

  protected problem(kind: Kind): string | null {
    const template = this.newTemplate[kind]().trim()
    if (!template) {
      return null
    }
    const problem = kind === 'rules' ? ruleProblem(template) : formatProblem(template)
    return problem ? `settings.template_${problem}` : null
  }

  protected preview(kind: Kind) {
    const template = this.newTemplate[kind]().trim()
    if (!template || this.problem(kind)) {
      return ''
    }
    return kind === 'formats'
      ? formatLink(template, 'https://example.com/photo.webp', 'photo.webp')
      : template
  }

  protected setRule(rule: string) {
    this.store.update((draft) => (draft.link.rule = rule))
  }

  protected setFormat(format: string) {
    this.store.update((draft) => (draft.link.format = format))
  }

  protected add(kind: Kind) {
    const name = this.newName[kind]().trim()
    const template = this.newTemplate[kind]().trim()
    if (!name || !template || this.problem(kind)) {
      return
    }
    const taken = (kind === 'rules' ? this.rules() : this.formats()).map((x) => x.id)
    const id = newTemplateId(name, taken)
    this.store.update((draft) => {
      draft.link[kind].push({ id, name, template })
      if (kind === 'rules') {
        draft.link.rule = id
      } else {
        draft.link.format = id
      }
    })
    this.newName[kind].set('')
    this.newTemplate[kind].set('')
  }

  protected remove(kind: Kind, id: string) {
    this.store.update((draft) => {
      draft.link[kind] = draft.link[kind].filter((x) => x.id !== id)
      if (kind === 'rules' && draft.link.rule === id) {
        draft.link.rule = 'github'
      }
      if (kind === 'formats' && draft.link.format === id) {
        draft.link.format = 'url'
      }
    })
  }

  protected async saveDomain() {
    const domain = normalizeDomain(this.domain())
    if (domain === null) {
      this.notify.error('settings.domain_invalid')
      return
    }
    this.savingDomain.set(true)
    try {
      await this.pages.saveDomain(domain)
      this.domainDraft.set(null)
      this.notify.info('settings.domain_saved')
    } catch (err) {
      this.notify.error(errorKey(err))
    } finally {
      this.savingDomain.set(false)
    }
  }
}
