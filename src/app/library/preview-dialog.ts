import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { MatIconButton } from '@angular/material/button'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { MatIcon } from '@angular/material/icon'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { LinkService } from '../links/link.service'
import { ImageFile } from './library.store'

export interface PreviewData {
  files: ImageFile[]
  index: number
}

/** Shows an image large; arrow keys move through the folder. */
@Component({
  selector: 'pg-preview-dialog',
  imports: [MatIcon, MatIconButton, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="preview">
      <!-- One image per file, so going to another fades it in. -->
      @for (shown of [file()]; track shown.path) {
        <img
          animate.enter="pg-enter-fade"
          [src]="failed() ? links.rawUrl(shown.path) : links.url(shown.path)"
          [alt]="shown.name"
          (error)="failed.set(true)"
        />
      }
      <figcaption>
        <span class="name">{{ file().name }}</span>
        @if (data.files.length > 1) {
          <button matIconButton [attr.aria-label]="'library.previous' | t" (click)="move(-1)">
            <mat-icon svgIcon="chevron-left" />
          </button>
        }
        <span class="count">{{ index() + 1 }} / {{ data.files.length }}</span>
        @if (data.files.length > 1) {
          <button matIconButton [attr.aria-label]="'library.next' | t" (click)="move(1)">
            <mat-icon svgIcon="chevron-right" />
          </button>
        }
        <button
          matIconButton
          [attr.aria-label]="'links.copy' | t"
          (click)="links.copy([file().path])"
        >
          <mat-icon svgIcon="content-copy" />
        </button>
        <button matIconButton [attr.aria-label]="'common.close' | t" (click)="ref.close()">
          <mat-icon svgIcon="close" />
        </button>
      </figcaption>
    </figure>
  `,
  styles: `
    .preview {
      display: flex;
      flex-direction: column;
      margin: 0;
      max-width: 92vw;
    }
    img {
      max-width: 92vw;
      max-height: calc(92vh - 3.5rem);
      object-fit: contain;
      background: repeating-conic-gradient(
          var(--mat-sys-surface-container-high) 0 25%,
          transparent 0 50%
        )
        0 0 / 16px 16px;
    }
    figcaption {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      padding: 0 0.25rem 0 1rem;
      min-height: 3.5rem;
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .count {
      color: var(--mat-sys-on-surface-variant);
    }
  `
})
export class PreviewDialog {
  protected readonly data = inject<PreviewData>(MAT_DIALOG_DATA)
  protected readonly ref = inject(MatDialogRef<PreviewDialog>)
  protected readonly links = inject(LinkService)
  protected readonly index = signal(this.data.index)
  protected readonly file = computed(() => this.data.files[this.index()])
  protected readonly failed = signal(false)

  protected move(step: number) {
    const count = this.data.files.length
    this.failed.set(false)
    this.index.set((this.index() + step + count) % count)
  }
}
