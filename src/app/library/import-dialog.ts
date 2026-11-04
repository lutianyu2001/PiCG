import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButton } from '@angular/material/button'
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInput } from '@angular/material/input'
import { MatProgressBar } from '@angular/material/progress-bar'
import { I18n, TranslatePipe } from '../core/i18n/i18n.service'
import { Notify } from '../core/notify.service'
import { GitHubClient, errorKey } from '../github/github.client'
import { RepoApi, TreeEntry } from '../github/repo-api'
import { SessionStore } from '../session/session.store'
import { LibraryStore, baseName, isImageName } from './library.store'

const PARALLEL = 4
const MAX_PER_COMMIT = 500

/** Copies the images of another repository that are not here yet, keeping their paths. */
@Component({
  selector: 'pg-import-dialog',
  imports: [
    FormsModule,
    MatButton,
    MatDialogModule,
    MatFormFieldModule,
    MatInput,
    MatProgressBar,
    TranslatePipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ 'import.title' | t }}</h2>
    <form (ngSubmit)="run()">
      <mat-dialog-content>
        <p class="muted">{{ 'import.intro' | t }}</p>
        <mat-form-field class="field">
          <mat-label>{{ 'import.source' | t }}</mat-label>
          <input
            matInput
            name="source"
            autocomplete="off"
            spellcheck="false"
            placeholder="owner/repository"
            [disabled]="busy()"
            [ngModel]="source()"
            (ngModelChange)="source.set($event)"
          />
        </mat-form-field>
        <mat-form-field class="field">
          <mat-label>{{ 'import.branch' | t }}</mat-label>
          <input
            matInput
            name="branch"
            autocomplete="off"
            spellcheck="false"
            [placeholder]="'import.branch_default' | t"
            [disabled]="busy()"
            [ngModel]="branch()"
            (ngModelChange)="branch.set($event)"
          />
        </mat-form-field>
        @if (busy()) {
          <mat-progress-bar
            [mode]="total() ? 'determinate' : 'indeterminate'"
            [value]="(done() / (total() || 1)) * 100"
          />
          <p class="muted">{{ status() }}</p>
        } @else if (result()) {
          <p>{{ result() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" [disabled]="busy()" (click)="ref.close()">
          {{ 'common.close' | t }}
        </button>
        <button matButton="filled" type="submit" [disabled]="busy() || !source().includes('/')">
          {{ 'import.start' | t }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .field {
      width: 100%;
      margin-bottom: 0.75rem;
    }
  `
})
export class ImportDialog {
  protected readonly ref = inject(MatDialogRef<ImportDialog>)
  private readonly gh = inject(GitHubClient)
  private readonly api = inject(RepoApi)
  private readonly session = inject(SessionStore)
  private readonly library = inject(LibraryStore)
  private readonly notify = inject(Notify)
  private readonly i18n = inject(I18n)

  protected readonly source = signal('')
  protected readonly branch = signal('')
  protected readonly busy = signal(false)
  protected readonly total = signal(0)
  protected readonly done = signal(0)
  protected readonly status = signal('')
  protected readonly result = signal('')

  protected async run() {
    const repo = this.session.repo()
    const [owner, name] = this.source()
      .trim()
      .replace(/^https:\/\/github\.com\//, '')
      .split('/')
    if (!repo || !owner || !name) {
      return
    }
    this.busy.set(true)
    this.result.set('')
    this.total.set(0)
    this.done.set(0)
    this.status.set(this.i18n.t('import.reading'))
    try {
      const info = await this.api.repo(owner, name)
      if (!info) {
        this.result.set(this.i18n.t('import.not_found'))
        return
      }
      const branch = this.branch().trim() || info.default_branch
      const tree = await this.gh.get<{ tree: TreeEntry[] }>(
        `/repos/${owner}/${name}/git/trees/${encodeURIComponent(branch)}`,
        {
          query: { recursive: 1 }
        }
      )
      const missing = tree.tree
        .filter(
          (e) =>
            e.type === 'blob' &&
            isImageName(baseName(e.path)) &&
            !e.path.split('/').some((p) => p.startsWith('.'))
        )
        .filter((e) => !this.library.exists(e.path))
        .slice(0, MAX_PER_COMMIT)
      if (!missing.length) {
        this.result.set(this.i18n.t('import.nothing'))
        return
      }
      this.total.set(missing.length)
      this.status.set(this.i18n.t('import.copying', { count: missing.length }))
      const blobs: { path: string; blob: string }[] = []
      for (let i = 0; i < missing.length; i += PARALLEL) {
        await Promise.all(
          missing.slice(i, i + PARALLEL).map(async (entry) => {
            const content = await this.api.readBlob(owner, name, entry.sha)
            blobs.push({ path: entry.path, blob: await this.api.createBlob(repo, content) })
            this.done.update((n) => n + 1)
          })
        )
      }
      await this.api.commit(repo, blobs, `Import ${blobs.length} images from ${owner}/${name}`)
      await this.library.reload()
      this.result.set(this.i18n.t('import.done', { count: blobs.length }))
    } catch (err) {
      this.notify.error(errorKey(err))
    } finally {
      this.busy.set(false)
    }
  }
}
