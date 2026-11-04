import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { MatIcon } from '@angular/material/icon'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { SessionStore } from '../session/session.store'
import { LEGACY_PAGES_BRANCH, PagesService } from './pages.service'

export type PagesState = 'unknown' | 'off' | 'legacy' | 'on'

/** GitHub Pages status of the repository in use, with what to do when something is wrong. */
@Component({
  selector: 'pg-pages-notice',
  imports: [MatIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="notice" [class.warn]="problem()" role="status" animate.enter="pg-enter">
        <mat-icon [svgIcon]="state() === 'on' ? 'check-circle' : 'warning'" />
        <div>
          <p>{{ 'pages.' + state() | t: params() }}</p>
          @if (state() !== 'unknown') {
            <p>
              <a target="_blank" rel="noopener" [href]="settingsUrl()">{{
                'pages.open_settings' | t
              }}</a>
            </p>
          }
        </div>
      </div>
    }
  `
})
export class PagesNotice {
  private readonly pages = inject(PagesService)
  private readonly session = inject(SessionStore)

  /** Shows nothing unless the user has to act. */
  readonly problemsOnly = input(false)

  protected readonly state = computed<PagesState>(() => {
    const { enabled, legacyBranch } = this.pages.status()
    if (enabled === null) {
      return 'unknown'
    }
    if (!enabled) {
      return 'off'
    }
    return legacyBranch ? 'legacy' : 'on'
  })
  protected readonly problem = computed(() => this.state() === 'off' || this.state() === 'legacy')
  protected readonly visible = computed(() => !this.problemsOnly() || this.problem())
  protected readonly params = computed(() => ({
    branch: this.session.repo()?.branch ?? '',
    legacy: LEGACY_PAGES_BRANCH,
    url: this.pages.status().base
  }))
  protected readonly settingsUrl = computed(() => {
    const repo = this.session.repo()
    return repo ? `https://github.com/${repo.owner}/${repo.name}/settings/pages` : ''
  })
}
