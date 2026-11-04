import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { MatIcon } from '@angular/material/icon'
import { TranslatePipe } from '../core/i18n/i18n.service'
import {
  FileDrop,
  IMAGE_ACCEPT,
  IncomingFile,
  filesFromClipboard,
  filesFromList
} from '../shared/file-intake'

/** A box to drop, paste or pick images into. */
@Component({
  selector: 'pg-drop-area',
  imports: [FileDrop, MatIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:paste)': 'paste($event)' },
  template: `
    <label class="area" pgFileDrop (pgFileDrop)="files.emit(only($event))">
      <input
        class="visually-hidden"
        type="file"
        [accept]="accept"
        [multiple]="multiple()"
        (change)="picked($any($event.target))"
      />
      <mat-icon svgIcon="cloud-upload" />
      <span>{{ 'tools.drop' | t }}</span>
    </label>
  `,
  styles: `
    .area {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
      border: 2px dashed var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-extra-large);
      color: var(--mat-sys-on-surface-variant);
      cursor: pointer;
      text-align: center;
      &.drag-over,
      &:hover,
      &:focus-within {
        border-color: var(--mat-sys-primary);
        background: var(--mat-sys-surface-container-low);
      }
      mat-icon {
        width: 2.5rem;
        height: 2.5rem;
        color: var(--mat-sys-primary);
      }
    }
  `
})
export class DropArea {
  readonly multiple = input(true)
  readonly files = output<File[]>()
  protected readonly accept = IMAGE_ACCEPT

  protected only(list: IncomingFile[]) {
    const files = list.map((x) => x.file)
    return this.multiple() ? files : files.slice(0, 1)
  }

  protected picked(input: HTMLInputElement) {
    this.files.emit(this.only(filesFromList(input.files)))
    input.value = ''
  }

  protected paste(event: ClipboardEvent) {
    if ((event.target as HTMLElement | null)?.closest('input, textarea')) {
      return
    }
    const files = filesFromClipboard(event.clipboardData)
    if (files.length) {
      this.files.emit(this.only(files))
    }
  }
}
