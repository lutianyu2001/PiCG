import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { MatButton } from '@angular/material/button'
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { Notify } from '../core/notify.service'
import { errorKey } from '../storage/storage'
import { LegacyService } from './legacy.service'

/** Asks whether to keep settings of an earlier version in PiCG's format and delete the old files. */
@Component({
  selector: 'pg-legacy-dialog',
  imports: [MatButton, MatDialogModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ 'legacy.title' | t }}</h2>
    <mat-dialog-content>
      <p>{{ 'legacy.found' | t: { repo: repoName } }}</p>
      <ul>
        @for (file of files; track file) {
          <li>
            <code>{{ file.path }}</code> <span class="note">({{ file.branch }})</span>
          </li>
        }
      </ul>
      <p>{{ 'legacy.question' | t }}</p>
      <p class="note">{{ 'legacy.decline_note' | t }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [disabled]="saving()" (click)="ref.close()">
        {{ 'legacy.not_now' | t }}
      </button>
      <button matButton="filled" [disabled]="saving()" (click)="convert()">
        {{ 'legacy.convert' | t }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .note {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }
  `
})
export class LegacyDialog {
  protected readonly ref = inject(MatDialogRef<LegacyDialog>)
  private readonly legacy = inject(LegacyService)
  private readonly notify = inject(Notify)

  protected readonly saving = signal(false)
  protected readonly repoName = this.legacy.pending()?.ref.name ?? ''
  protected readonly files = this.legacy.pending()?.files ?? []

  protected async convert() {
    this.saving.set(true)
    try {
      await this.legacy.convert()
      this.notify.info('legacy.converted')
      this.ref.close()
    } catch (err) {
      this.notify.error(errorKey(err))
    } finally {
      this.saving.set(false)
    }
  }
}
