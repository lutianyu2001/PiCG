import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { MatButton, MatIconButton } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIcon } from '@angular/material/icon'
import { MatProgressBar } from '@angular/material/progress-bar'
import { MatTooltip } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { Notify } from '../core/notify.service'
import { RepoSetup } from '../session/repo-setup'
import { SessionStore } from '../session/session.store'
import { SignOutDialog } from '../session/sign-out-dialog'
import { RepoSpec, TokenCheck, parseRepoSpecs } from '../session/token-check'
import { RepoRef } from '../github/repo-api'
import { BranchDialog } from './branch-dialog'
import { ConfirmDialog, ConfirmData } from '../shared/confirm-dialog'
import { PromptData, PromptDialog } from '../shared/prompt-dialog'

/** Who is signed in, the token, and the repositories PiCG may use. Changes rerun the token check. */
@Component({
  selector: 'pg-account-section',
  imports: [MatButton, MatIcon, MatIconButton, MatProgressBar, MatTooltip, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.scss',
  template: `
    <section class="section">
      <h2>{{ 'settings.account' | t }}</h2>
      @if (session.user(); as user) {
        <div class="row">
          <span class="label">{{ 'settings.user' | t }}</span>
          <a [href]="'https://github.com/' + user.login" target="_blank" rel="noopener">{{
            user.login
          }}</a>
        </div>
      }
      <div class="row">
        <span class="label">{{ 'settings.token' | t }}</span>
        <code>{{ masked() }}</code>
        <button matButton [disabled]="busy()" (click)="replaceToken()">
          {{ 'settings.replace_token' | t }}
        </button>
      </div>

      <div class="stack">
        <span class="label muted">{{ 'settings.repositories' | t }}</span>
        <ul class="list">
          @for (repo of session.repos(); track repo.name) {
            <li>
              <span class="grow">
                <a
                  [href]="'https://github.com/' + repo.owner + '/' + repo.name"
                  target="_blank"
                  rel="noopener"
                  >{{ repo.name }}</a
                >
              </span>
              <button
                matButton
                class="branch"
                [disabled]="busy()"
                [matTooltip]="'settings.change_branch' | t"
                (click)="changeBranch(repo)"
              >
                {{ repo.branch }}
              </button>
              <button
                matIconButton
                [disabled]="busy() || session.repos().length === 1"
                [matTooltip]="'settings.remove_repo' | t"
                [attr.aria-label]="'settings.remove_repo' | t"
                (click)="removeRepo(repo.name)"
              >
                <mat-icon svgIcon="delete" />
              </button>
            </li>
          }
        </ul>
        <div>
          <button matButton [disabled]="busy()" (click)="addRepo()">
            <mat-icon svgIcon="add" />{{ 'settings.add_repo' | t }}
          </button>
        </div>
        <p class="desc">{{ 'settings.repos_note' | t }}</p>
      </div>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <div class="row">
        <button matButton="outlined" (click)="signOut()">
          <mat-icon svgIcon="logout" />{{ 'account.sign_out' | t }}
        </button>
      </div>
    </section>
  `
})
export class AccountSection {
  protected readonly session = inject(SessionStore)
  private readonly check = inject(TokenCheck)
  private readonly setup = inject(RepoSetup)
  private readonly dialog = inject(MatDialog)
  private readonly notify = inject(Notify)
  private readonly router = inject(Router)

  protected readonly busy = signal(false)

  protected masked() {
    const token = this.session.token()
    return token ? `${token.slice(0, 15)}…${token.slice(-4)}` : ''
  }

  /** Checks the token against the repositories; on success, prepares new ones and stores the result. */
  private async apply(token: string, specs: RepoSpec[]) {
    this.busy.set(true)
    try {
      const result = await this.check.check(token, specs, false)
      if (!result.ok) {
        this.notify.error(`login.fail.${result.reason}`, {
          repo: result.repo ?? '',
          branch: result.branch ?? '',
          status: String(result.status ?? '')
        })
        return false
      }
      const known = new Set(this.session.repos().map((r) => r.name))
      for (const repo of result.repos.filter((r) => !known.has(r.name))) {
        await this.setup.prepare(repo, token)
      }
      const repos = result.repos.map(({ owner, name, branch, defaultBranch }) => ({
        owner,
        name,
        branch,
        defaultBranch
      }))
      if (token !== this.session.token()) {
        this.session.signIn(token, result.user, repos)
      } else {
        this.session.setRepos(repos)
      }
      return true
    } finally {
      this.busy.set(false)
    }
  }

  private names() {
    return this.session.repos().map((r) => r.name)
  }

  private specs(): RepoSpec[] {
    return this.session.repos().map((r) => ({ name: r.name, branch: r.branch }))
  }

  /** Picks another branch of a repository, or creates one. */
  protected async changeBranch(repo: RepoRef) {
    const branch = await firstValueFrom(
      this.dialog.open(BranchDialog, { data: repo, width: '28rem' }).afterClosed()
    )
    if (!branch || branch === repo.branch) {
      return
    }
    this.busy.set(true)
    try {
      await this.setup.prepare(
        { ...repo, branch, defaultBranch: repo.defaultBranch ?? branch, empty: false },
        this.session.token()
      )
      this.session.setRepos(
        this.session.repos().map((r) => (r.name === repo.name ? { ...r, branch } : r))
      )
      this.notify.info('settings.branch_changed', { repo: repo.name, branch })
    } finally {
      this.busy.set(false)
    }
  }

  protected async replaceToken() {
    const data: PromptData = {
      title: 'settings.replace_token',
      label: 'login.token',
      hint: 'settings.replace_token_hint',
      confirm: 'settings.check_and_save',
      validate: (v) => (v.startsWith('github_pat_') ? null : 'login.fail.invalid')
    }
    const token = await firstValueFrom(this.dialog.open(PromptDialog, { data }).afterClosed())
    if (token && (await this.apply(token, this.specs()))) {
      this.notify.info('settings.token_saved')
    }
  }

  protected async addRepo() {
    const data: PromptData = {
      title: 'settings.add_repo',
      label: 'settings.repo_name',
      hint: 'settings.add_repo_hint',
      confirm: 'settings.check_and_save',
      validate: (v) => {
        const [spec] = parseRepoSpecs(v, v) ?? []
        if (!spec || v.trim().split(/[\s,]+/).length > 1) {
          return 'login.repo_names_invalid'
        }
        return this.names().includes(spec.name) ? 'settings.repo_exists' : null
      }
    }
    const name = await firstValueFrom(this.dialog.open(PromptDialog, { data }).afterClosed())
    if (
      name &&
      (await this.apply(this.session.token(), [
        ...this.specs(),
        ...(parseRepoSpecs(name, name) ?? [])
      ]))
    ) {
      this.notify.info('settings.repo_added', { repo: name.split('@')[0] })
    }
  }

  protected async removeRepo(name: string) {
    const data: ConfirmData = {
      title: 'settings.remove_repo',
      message: 'settings.remove_repo_message',
      params: { repo: name },
      confirm: 'settings.remove_repo'
    }
    if (await firstValueFrom(this.dialog.open(ConfirmDialog, { data }).afterClosed())) {
      this.session.setRepos(this.session.repos().filter((r) => r.name !== name))
    }
  }

  protected signOut() {
    this.dialog
      .open(SignOutDialog, { width: '26rem' })
      .afterClosed()
      .subscribe((keep?: boolean) => {
        if (keep !== undefined) {
          this.session.signOut(keep)
          void this.router.navigateByUrl('/login')
        }
      })
  }
}
