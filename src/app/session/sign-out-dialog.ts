import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { MatButton } from '@angular/material/button'
import { MatCheckbox } from '@angular/material/checkbox'
import { MatDialogModule } from '@angular/material/dialog'
import { TranslatePipe } from '../core/i18n/i18n.service'

/** Closes with `true` to keep the token and settings on this device, `false` to remove them. */
@Component({
  selector: 'pg-sign-out-dialog',
  imports: [MatButton, MatCheckbox, MatDialogModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ 'account.sign_out_title' | t }}</h2>
    <mat-dialog-content>
      <mat-checkbox [checked]="keep()" (change)="keep.set($event.checked)">
        {{ 'account.keep_data' | t }}
      </mat-checkbox>
      <p class="muted">{{ (keep() ? 'account.keep_note' : 'account.remove_note') | t }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>{{ 'common.cancel' | t }}</button>
      <button matButton="filled" [mat-dialog-close]="keep()">{{ 'account.sign_out' | t }}</button>
    </mat-dialog-actions>
  `
})
export class SignOutDialog {
  protected readonly keep = signal(true)
}
