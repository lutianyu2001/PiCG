import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButton } from '@angular/material/button'
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInput } from '@angular/material/input'
import { MatProgressBar } from '@angular/material/progress-bar'
import { MatRadioModule } from '@angular/material/radio'
import { MatSelectModule } from '@angular/material/select'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { Notify } from '../core/notify.service'
import { GitHubClient } from '../github/github.client'
import { errorKey } from '../storage/storage'
import { RepoRef } from '../github/repo-api'
import { RepoSetup } from '../session/repo-setup'
import { isBranchName } from '../session/token-check'

const MAX_PAGES = 5

/** Picks an existing branch of a repository or creates a new one from the current branch. Closes with its name. */
@Component({
  selector: 'pg-branch-dialog',
  imports: [
    FormsModule,
    MatButton,
    MatDialogModule,
    MatFormFieldModule,
    MatInput,
    MatProgressBar,
    MatRadioModule,
    MatSelectModule,
    TranslatePipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ 'settings.change_branch_title' | t: { repo: repo.name } }}</h2>
    <mat-dialog-content>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <mat-radio-group [value]="mode()" (change)="mode.set($event.value)">
        <mat-radio-button value="existing">{{ 'settings.branch_existing' | t }}</mat-radio-button>
        @if (mode() === 'existing') {
          <mat-form-field class="field">
            <mat-select [value]="picked()" (selectionChange)="picked.set($event.value)">
              @for (branch of branches(); track branch) {
                <mat-option [value]="branch">{{ branch }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-radio-button value="new">
          {{ 'settings.branch_new' | t: { branch: repo.branch } }}
        </mat-radio-button>
        @if (mode() === 'new') {
          <mat-form-field class="field">
            <mat-label>{{ 'settings.branch_name' | t }}</mat-label>
            <input
              matInput
              name="branch"
              autocomplete="off"
              spellcheck="false"
              [ngModel]="name()"
              (ngModelChange)="name.set($event)"
            />
            @if (problem()) {
              <mat-hint class="problem">{{ problem()! | t }}</mat-hint>
            }
          </mat-form-field>
        }
      </mat-radio-group>
      <p class="note">{{ 'settings.branch_note' | t }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>{{ 'common.cancel' | t }}</button>
      <button matButton="filled" [disabled]="!ready() || saving()" (click)="confirm()">
        {{ 'common.save' | t }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-radio-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .field {
      width: 100%;
      margin: 0.25rem 0 0.5rem;
    }
    .note {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
      line-height: 1.5;
    }
    .problem {
      color: var(--mat-sys-error);
    }
  `
})
export class BranchDialog {
  protected readonly repo = inject<RepoRef>(MAT_DIALOG_DATA)
  private readonly ref = inject(MatDialogRef<BranchDialog, string>)
  private readonly gh = inject(GitHubClient)
  private readonly setup = inject(RepoSetup)
  private readonly notify = inject(Notify)

  protected readonly mode = signal<'existing' | 'new'>('existing')
  protected readonly branches = signal<string[]>([this.repo.branch])
  protected readonly picked = signal(this.repo.branch)
  protected readonly name = signal('')
  protected readonly loading = signal(true)
  protected readonly saving = signal(false)

  protected readonly problem = computed(() => {
    const name = this.name().trim()
    if (!name) {
      return null
    }
    if (!isBranchName(name)) {
      return 'settings.branch_invalid'
    }
    return this.branches().includes(name) ? 'settings.branch_exists' : null
  })
  protected readonly ready = computed(() =>
    this.mode() === 'existing' ? !!this.picked() : !!this.name().trim() && !this.problem()
  )

  constructor() {
    void this.load()
  }

  private async load() {
    try {
      const names: string[] = []
      for (let page = 1; page <= MAX_PAGES; page++) {
        const list = await this.gh.get<{ name: string }[]>(
          `/repos/${this.repo.owner}/${this.repo.name}/branches`,
          { query: { per_page: 100, page } }
        )
        names.push(...list.map((b) => b.name))
        if (list.length < 100) {
          break
        }
      }
      this.branches.set(names.sort())
    } catch (err) {
      this.notify.error(errorKey(err))
    } finally {
      this.loading.set(false)
    }
  }

  protected async confirm() {
    if (this.mode() === 'existing') {
      this.ref.close(this.picked())
      return
    }
    const name = this.name().trim()
    this.saving.set(true)
    try {
      await this.setup.createBranch(this.repo, name, this.repo.branch)
      this.ref.close(name)
    } catch (err) {
      this.notify.error(errorKey(err))
    } finally {
      this.saving.set(false)
    }
  }
}
