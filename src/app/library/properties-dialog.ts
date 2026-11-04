import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { MatButton } from '@angular/material/button'
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog'
import { I18n, TranslatePipe } from '../core/i18n/i18n.service'
import { RepoApi } from '../github/repo-api'
import { LinkService } from '../links/link.service'
import { SessionStore } from '../session/session.store'
import { ImageFile } from './library.store'

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

@Component({
  selector: 'pg-properties-dialog',
  imports: [MatButton, MatDialogModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ file.name }}</h2>
    <mat-dialog-content>
      <dl>
        <dt>{{ 'library.prop_path' | t }}</dt>
        <dd>
          <code>{{ file.path }}</code>
        </dd>
        <dt>{{ 'library.prop_size' | t }}</dt>
        <dd>{{ size }}</dd>
        <dt>{{ 'library.prop_dimensions' | t }}</dt>
        <dd>{{ dimensions() || '…' }}</dd>
        <dt>{{ 'library.prop_modified' | t }}</dt>
        <dd>{{ modified() || '…' }}</dd>
        <dt>SHA</dt>
        <dd>
          <code>{{ file.sha }}</code>
        </dd>
        <dt>{{ 'library.prop_link' | t }}</dt>
        <dd class="link">{{ links.url(file.path) }}</dd>
      </dl>
      <img class="probe" alt="" [src]="links.rawUrl(file.path)" (load)="measure($event)" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <a matButton target="_blank" rel="noopener" [href]="githubUrl()">{{
        'library.open_on_github' | t
      }}</a>
      <button matButton (click)="links.copy([file.path])">{{ 'links.copy' | t }}</button>
      <button matButton="filled" mat-dialog-close>{{ 'common.close' | t }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.5rem 1rem;
      margin: 0;
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .probe {
      display: none;
    }
  `
})
export class PropertiesDialog {
  protected readonly file = inject<ImageFile>(MAT_DIALOG_DATA)
  protected readonly links = inject(LinkService)
  private readonly api = inject(RepoApi)
  private readonly session = inject(SessionStore)
  private readonly i18n = inject(I18n)

  protected readonly size = formatBytes(this.file.size)
  protected readonly dimensions = signal('')
  protected readonly modified = signal('')
  protected readonly githubUrl = computed(() => {
    const repo = this.session.repo()
    return repo
      ? `https://github.com/${repo.owner}/${repo.name}/blob/${repo.branch}/${this.file.path}`
      : ''
  })

  constructor() {
    const repo = this.session.repo()
    if (repo) {
      this.api.lastCommit(repo, this.file.path).then(
        (commit) =>
          this.modified.set(
            commit
              ? new Date(commit.commit.committer.date).toLocaleString(this.i18n.language())
              : this.i18n.t('common.unknown')
          ),
        () => this.modified.set(this.i18n.t('common.unknown'))
      )
    }
  }

  protected measure(event: Event) {
    const img = event.target as HTMLImageElement
    this.dimensions.set(`${img.naturalWidth} × ${img.naturalHeight}`)
  }
}
