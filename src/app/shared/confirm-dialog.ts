import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { MatButton } from '@angular/material/button'
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog'
import { Params, TranslatePipe } from '../core/i18n/i18n.service'

export interface ConfirmData {
  title: string
  message: string
  params?: Params
  confirm: string
  cancel?: string
  danger?: boolean
}

/** A yes or no question. Closes with true on confirm. Texts are translation keys. */
@Component({
  selector: 'pg-confirm-dialog',
  imports: [MatButton, MatDialogModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title | t: data.params }}</h2>
    <mat-dialog-content>
      <p class="message">{{ data.message | t: data.params }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [mat-dialog-close]="false">{{ data.cancel ?? 'common.cancel' | t }}</button>
      <button matButton="filled" [class.danger]="data.danger" [mat-dialog-close]="true">
        {{ data.confirm | t: data.params }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .message {
      white-space: pre-line;
      line-height: 1.6;
    }
    .danger {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA)
}
