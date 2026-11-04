import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButton, MatIconButton } from '@angular/material/button'
import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatCheckbox, MatCheckboxChange } from '@angular/material/checkbox'
import { MatDialog } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIcon } from '@angular/material/icon'
import { MatInput } from '@angular/material/input'
import { MatProgressBar } from '@angular/material/progress-bar'
import { MatTooltip } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { Clipboard } from '../core/clipboard'
import { I18n, TranslatePipe } from '../core/i18n/i18n.service'
import { LegacyService } from '../legacy/legacy.service'
import { accountOf, parseS3Address } from '../r2/r2.client'
import { ConfirmData, ConfirmDialog } from '../shared/confirm-dialog'
import { pickGreeting } from './greeting'
import { R2Check, corsPolicy, normalizePublicUrl } from './r2-check'
import { RepoSetup } from './repo-setup'
import { Account, GitHubAccount, R2Account, SessionStore, accountId } from './session.store'
import {
  CheckResult,
  KEEPS_TOKEN,
  RepoSpec,
  TokenCheck,
  formatRepoSpecs,
  parseRepoSpecs
} from './token-check'

export const DEFAULT_REPO = 'picg-images-hosting'
export const CREATE_REPO_URL = `https://github.com/new?name=${DEFAULT_REPO}&visibility=public`
export const CREATE_TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=PiCG&expires_in=90&contents=write'
export const R2_DASHBOARD_URL = 'https://dash.cloudflare.com/?to=/:account/r2/overview'
export const R2_TOKENS_URL = 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens'

type Provider = 'github' | 'r2'

const repoSpecsOf = (account: GitHubAccount) =>
  formatRepoSpecs(
    account.repos.map((r) => ({
      name: r.name,
      branch: r.defaultBranch && r.branch !== r.defaultBranch ? r.branch : undefined
    }))
  )

@Component({
  selector: 'pg-login-page',
  imports: [
    FormsModule,
    MatButton,
    MatButtonToggleModule,
    MatCheckbox,
    MatFormFieldModule,
    MatIcon,
    MatIconButton,
    MatInput,
    MatProgressBar,
    MatTooltip,
    TranslatePipe
  ],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPage {
  protected readonly session = inject(SessionStore)
  private readonly check = inject(TokenCheck)
  private readonly r2Check = inject(R2Check)
  private readonly setup = inject(RepoSetup)
  private readonly legacy = inject(LegacyService)
  private readonly dialog = inject(MatDialog)
  private readonly router = inject(Router)
  private readonly i18n = inject(I18n)
  private readonly clipboard = inject(Clipboard)

  protected readonly createRepoUrl = CREATE_REPO_URL
  protected readonly createTokenUrl = CREATE_TOKEN_URL
  protected readonly r2DashboardUrl = R2_DASHBOARD_URL
  protected readonly r2TokensUrl = R2_TOKENS_URL
  protected readonly defaultRepo = DEFAULT_REPO
  protected readonly greeting = pickGreeting()
  protected readonly cors = corsPolicy(location.origin)
  protected readonly accountId = accountId

  /** Remembered accounts are shown instead of the form until the user asks for another account. */
  protected readonly picking = signal(this.session.accounts().length > 0)
  protected readonly provider = signal<Provider>('github')
  /** The account being signed in with from its card. */
  protected readonly using = signal('')
  protected readonly busy = signal(false)
  protected readonly error = signal('')

  protected readonly token = signal(this.legacy.browser()?.token ?? '')
  protected readonly repoNames = signal((this.legacy.browser()?.repoNames ?? []).join(', '))
  protected readonly fromLegacy = !!this.legacy.browser()?.token
  protected readonly skipCheck = signal(false)
  protected readonly showToken = signal(false)

  protected readonly s3Address = signal('')
  protected readonly accessKeyId = signal('')
  protected readonly secretAccessKey = signal('')
  protected readonly publicUrl = signal('')
  protected readonly showSecret = signal(false)
  /** Buckets of an R2 account picked from its card beyond the first, which the form does not show. */
  private moreBuckets: R2Account['buckets'] = []

  protected readonly accounts = computed(() => this.session.accounts())

  protected label(account: Account) {
    return account.kind === 'github'
      ? (account.user?.login ?? 'GitHub')
      : `Cloudflare R2 · ${accountOf(account.endpoint).slice(0, 8)}…`
  }

  protected targets(account: Account) {
    return account.kind === 'github'
      ? account.repos.map((r) => r.name).join(', ')
      : account.buckets.map((b) => b.name).join(', ')
  }

  protected chooseProvider(provider: Provider) {
    this.provider.set(provider)
    this.error.set('')
  }

  /** Opens an empty form, also after a remembered account filled it in. */
  protected anotherAccount() {
    this.picking.set(false)
    this.error.set('')
    this.token.set('')
    this.repoNames.set('')
    this.skipCheck.set(false)
    this.s3Address.set('')
    this.accessKeyId.set('')
    this.secretAccessKey.set('')
    this.publicUrl.set('')
    this.moreBuckets = []
  }

  protected backToAccounts() {
    this.picking.set(true)
    this.error.set('')
  }

  /** Signs in with a remembered account; if the check fails, its form opens with the reason. */
  protected async use(account: Account) {
    if (this.busy()) {
      return
    }
    this.using.set(accountId(account))
    this.error.set('')
    if (account.kind === 'github') {
      this.provider.set('github')
      this.token.set(account.token)
      this.repoNames.set(repoSpecsOf(account))
      this.skipCheck.set(!!account.skipCheck)
    } else {
      this.provider.set('r2')
      const [first, ...rest] = account.buckets
      this.s3Address.set(first ? `${account.endpoint}/${first.name}` : account.endpoint)
      this.publicUrl.set(first?.publicUrl ?? '')
      this.accessKeyId.set(account.accessKeyId)
      this.secretAccessKey.set(account.secretAccessKey)
      this.moreBuckets = rest
    }
    const ok = account.kind === 'github' ? await this.signIn() : await this.signInR2()
    this.using.set('')
    if (!ok) {
      this.picking.set(false)
    }
  }

  protected async forget(account: Account) {
    const data: ConfirmData = {
      title: 'login.forget_title',
      message: 'login.forget_message',
      params: { name: this.label(account) },
      confirm: 'login.forget',
      danger: true
    }
    if (await firstValueFrom(this.dialog.open(ConfirmDialog, { data }).afterClosed())) {
      this.session.forget(accountId(account))
      if (!this.session.accounts().length) {
        this.picking.set(false)
      }
    }
  }

  protected copyCors() {
    return this.clipboard.copy(this.cors)
  }

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

  /** Signs in with GitHub. Returns whether it worked. */
  protected async signIn() {
    const token = this.token().trim()
    if (!token) {
      this.error.set(this.i18n.t('login.token_required'))
      return false
    }
    const specs = parseRepoSpecs(this.repoNames(), DEFAULT_REPO)
    if (!specs) {
      this.error.set(this.i18n.t('login.repo_names_invalid'))
      return false
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
        return false
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
        })),
        this.skipCheck()
      )
      await this.router.navigateByUrl('/library')
      return true
    } finally {
      this.busy.set(false)
    }
  }

  /** Signs in with R2 keys. Returns whether it worked. */
  protected async signInR2() {
    const ref = parseS3Address(this.s3Address())
    if (!ref) {
      this.error.set(this.i18n.t('login_r2.fail.address'))
      return false
    }
    const publicUrl = normalizePublicUrl(this.publicUrl())
    if (!publicUrl) {
      this.error.set(this.i18n.t('login_r2.fail.public_url'))
      return false
    }
    const keys = {
      accessKeyId: this.accessKeyId().trim(),
      secretAccessKey: this.secretAccessKey().trim()
    }
    if (!keys.accessKeyId || !keys.secretAccessKey) {
      this.error.set(this.i18n.t('login_r2.keys_required'))
      return false
    }
    const buckets = [
      { name: ref.bucket, publicUrl },
      ...this.moreBuckets.filter((b) => b.name !== ref.bucket)
    ]

    this.busy.set(true)
    this.error.set('')
    try {
      const result = await this.r2Check.check(ref.endpoint, keys, buckets)
      if (!result.ok) {
        if (result.reason === 'invalid') {
          this.secretAccessKey.set('')
        }
        this.error.set(
          this.i18n.t(`login_r2.fail.${result.reason}`, {
            bucket: result.bucket ?? '',
            status: String(result.status ?? '')
          })
        )
        return false
      }
      this.session.signInR2(ref.endpoint, keys, buckets)
      await this.router.navigateByUrl('/library')
      return true
    } finally {
      this.busy.set(false)
    }
  }
}
