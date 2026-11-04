import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButton } from '@angular/material/button'
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInput } from '@angular/material/input'
import { Params, TranslatePipe } from '../core/i18n/i18n.service'

export interface Field {
  label: string
  value?: string
  hint?: string
  placeholder?: string
  /** Masked, like a password. */
  secret?: boolean
  /** Returns a translation key describing the problem, or null when the value is fine. */
  validate?: (value: string) => string | null
}

export interface FieldsData {
  title: string
  params?: Params
  fields: Field[]
  confirm: string
}

/** Asks for several lines of text. Closes with the trimmed values in order, or undefined when cancelled. */
@Component({
  selector: 'pg-fields-dialog',
  imports: [FormsModule, MatButton, MatDialogModule, MatFormFieldModule, MatInput, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title | t: data.params }}</h2>
    <form (ngSubmit)="submit()">
      <mat-dialog-content>
        @for (field of data.fields; track $index; let i = $index) {
          <mat-form-field class="field" floatLabel="always">
            <mat-label>{{ field.label | t }}</mat-label>
            <input
              matInput
              autocomplete="off"
              spellcheck="false"
              [name]="'field-' + i"
              [type]="field.secret ? 'password' : 'text'"
              [placeholder]="field.placeholder ?? ''"
              [ngModel]="values()[i]"
              (ngModelChange)="set(i, $event)"
            />
            @if (problems()[i]; as problem) {
              <mat-hint class="problem">{{ problem | t }}</mat-hint>
            } @else if (field.hint) {
              <mat-hint>{{ field.hint | t: data.params }}</mat-hint>
            }
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button matButton="filled" type="submit" [disabled]="!ready()">
          {{ data.confirm | t }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .field {
      display: block;
      width: 100%;
      min-width: min(26rem, 70vw);
      margin-top: 0.5rem;
    }
    .problem {
      color: var(--mat-sys-error);
    }
  `
})
export class FieldsDialog {
  protected readonly data = inject<FieldsData>(MAT_DIALOG_DATA)
  private readonly ref = inject(MatDialogRef<FieldsDialog, string[]>)
  protected readonly values = signal(this.data.fields.map((f) => f.value ?? ''))
  protected readonly problems = computed(() =>
    this.values().map((value, i) => {
      const text = value.trim()
      const validate = this.data.fields[i].validate
      return text && validate ? validate(text) : null
    })
  )
  protected readonly ready = computed(
    () => this.values().every((v) => v.trim()) && this.problems().every((p) => !p)
  )

  protected set(i: number, value: string) {
    this.values.update((list) => list.map((v, j) => (j === i ? value : v)))
  }

  protected submit() {
    if (this.ready()) {
      this.ref.close(this.values().map((v) => v.trim()))
    }
  }
}
