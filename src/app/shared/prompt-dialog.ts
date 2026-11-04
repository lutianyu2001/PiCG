import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButton } from '@angular/material/button'
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInput } from '@angular/material/input'
import { Params, TranslatePipe } from '../core/i18n/i18n.service'

export interface PromptData {
  title: string
  label: string
  value?: string
  hint?: string
  params?: Params
  confirm: string
  /** Returns a translation key describing the problem, or null when the value is fine. */
  validate?: (value: string) => string | null
}

/** Asks for one line of text. Closes with the trimmed text, or undefined when cancelled. */
@Component({
  selector: 'pg-prompt-dialog',
  imports: [FormsModule, MatButton, MatDialogModule, MatFormFieldModule, MatInput, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title | t: data.params }}</h2>
    <form (ngSubmit)="submit()">
      <mat-dialog-content>
        <mat-form-field class="field">
          <mat-label>{{ data.label | t }}</mat-label>
          <input
            matInput
            name="value"
            autocomplete="off"
            spellcheck="false"
            cdkFocusInitial
            [ngModel]="value()"
            (ngModelChange)="value.set($event)"
          />
          @if (problem()) {
            <mat-hint class="problem">{{ problem()! | t }}</mat-hint>
          } @else if (data.hint) {
            <mat-hint>{{ data.hint | t: data.params }}</mat-hint>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button matButton="filled" type="submit" [disabled]="!value().trim() || !!problem()">
          {{ data.confirm | t }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .field {
      width: 100%;
      min-width: min(24rem, 70vw);
      margin-top: 0.5rem;
    }
    .problem {
      color: var(--mat-sys-error);
    }
  `
})
export class PromptDialog {
  protected readonly data = inject<PromptData>(MAT_DIALOG_DATA)
  private readonly ref = inject(MatDialogRef<PromptDialog, string>)
  protected readonly value = signal(this.data.value ?? '')
  protected readonly problem = computed(() => {
    const text = this.value().trim()
    return text && this.data.validate ? this.data.validate(text) : null
  })

  protected submit() {
    if (this.value().trim() && !this.problem()) {
      this.ref.close(this.value().trim())
    }
  }
}
