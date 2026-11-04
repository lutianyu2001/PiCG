import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButton, MatIconButton } from '@angular/material/button'
import { MatCheckbox, MatCheckboxChange } from '@angular/material/checkbox'
import { MatDialog } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIcon } from '@angular/material/icon'
import { MatInput } from '@angular/material/input'
import { MatProgressBar } from '@angular/material/progress-bar'
import { Router } from '@angular/router'
import { I18n, TranslatePipe } from '../core/i18n/i18n.service'
import { LegacyService } from '../legacy/legacy.service'
import { ConfirmDialog, ConfirmData } from '../shared/confirm-dialog'
import { RepoSetup } from './repo-setup'
import { SessionStore } from './session.store'
import { firstValueFrom } from 'rxjs'
import {
  CheckResult,
  KEEPS_TOKEN,
  RepoSpec,
  TokenCheck,
  formatRepoSpecs,
  parseRepoSpecs
} from './token-check'
import { pickGreeting } from './greeting'

export const DEFAULT_REPO = 'picg-images-hosting'
export const CREATE_REPO_URL = `https://github.com/new?name=${DEFAULT_REPO}&visibility=public`
export const CREATE_TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=PiCG&expires_in=90&contents=write'

@Component({
  selector: 'pg-login-page',
  imports: [
    FormsModule,
    MatButton,
    MatCheckbox,
    MatFormFieldModule,
    MatIcon,
    MatIconButton,
    MatInput,
    MatProgressBar,
    TranslatePipe
  ],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPage {
  private readonly session = inject(SessionStore)
  private readonly check = inject(TokenCheck)
  private readonly setup = inject(RepoSetup)
  private readonly legacy = inject(LegacyService)
  private readonly dialog = inject(MatDialog)
  private readonly router = inject(Router)
  private readonly i18n = inject(I18n)

  protected readonly createRepoUrl = CREATE_REPO_URL
  protected readonly createTokenUrl = CREATE_TOKEN_URL
  protected readonly defaultRepo = DEFAULT_REPO
  protected readonly greeting = pickGreeting()

  protected readonly token = signal(this.session.token() || this.legacy.browser()?.token || '')
  protected readonly repoNames = signal(
    this.session.repos().length
      ? formatRepoSpecs(
          this.session.repos().map((r) => ({
            name: r.name,
            branch: r.defaultBranch && r.branch !== r.defaultBranch ? r.branch : undefined
          }))
        )
      : (this.legacy.browser()?.repoNames ?? []).join(', ')
  )
  protected readonly fromLegacy = !this.session.token() && !!this.legacy.browser()?.token
  protected readonly skipCheck = signal(false)
  protected readonly showToken = signal(false)
  protected readonly busy = signal(false)
  protected readonly error = signal('')

  protected toggleSkip(event: MatCheckboxChange) {
    if (!event.checked) {
      this.skipCheck.set(false)
      return
    }
    event.source.checked = false
    const data: ConfirmData = {
      title: 'login.skip_title',
      message: 'login.skip_message',
      confirm: 'login.skip_confirm',
      cancel: 'login.skip_cancel',
      danger: true
    }
    this.dialog
      .open(ConfirmDialog, { data, width: '30rem' })
      .afterClosed()
      .subscribe((yes) => this.skipCheck.set(!!yes))
  }

  /** Runs the check; a chosen branch that does not exist can be created from the default branch. */
  private async checkCreatingBranches(token: string, specs: RepoSpec[]): Promise<CheckResult> {
    for (;;) {
      const result = await this.check.check(token, specs, this.skipCheck())
      if (result.ok || result.reason !== 'branch_missing' || !result.repo || !result.branch) {
        return result
      }
      const data: ConfirmData = {
        title: 'login.create_branch_title',
        message: 'login.create_branch_message',
        params: { repo: result.repo, branch: result.branch },
        confirm: 'login.create_branch'
      }
      if (!(await firstValueFrom(this.dialog.open(ConfirmDialog, { data }).afterClosed()))) {
        return result
      }
      try {
        const owner = (await this.check.owner(token)) ?? ''
        const repo = await this.check.defaultBranch(token, owner, result.repo)
        await this.setup.createBranch({ owner, name: result.repo }, result.branch, repo, token)
      } catch {
        return { ok: false, reason: 'network' }
      }
    }
  }

  protected async signIn() {
    const token = this.token().trim()
    if (!token) {
      this.error.set(this.i18n.t('login.token_required'))
      return
    }
    const specs = parseRepoSpecs(this.repoNames(), DEFAULT_REPO)
    if (!specs) {
      this.error.set(this.i18n.t('login.repo_names_invalid'))
      return
    }

    this.busy.set(true)
    this.error.set('')
    try {
      const result = await this.checkCreatingBranches(token, specs)
      if (!result.ok) {
        if (!KEEPS_TOKEN.includes(result.reason)) {
          this.token.set('')
        }
        this.error.set(
          this.i18n.t(`login.fail.${result.reason}`, {
            repo: result.repo ?? '',
            branch: result.branch ?? '',
            status: String(result.status ?? '')
          })
        )
        return
      }
      for (const repo of result.repos) {
        await this.setup.prepare(repo, token)
      }
      this.session.signIn(
        token,
        result.user,
        result.repos.map(({ owner, name, branch, defaultBranch }) => ({
          owner,
          name,
          branch,
          defaultBranch
        }))
      )
      await this.router.navigateByUrl('/library')
    } finally {
      this.busy.set(false)
    }
  }
}
