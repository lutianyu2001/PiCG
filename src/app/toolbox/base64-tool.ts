import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { MatButton } from '@angular/material/button'
import { MatIcon } from '@angular/material/icon'
import { Clipboard } from '../core/clipboard'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { formatBytes } from '../library/properties-dialog'
import { DropArea } from './drop-area'

@Component({
  selector: 'pg-base64-tool',
  imports: [DropArea, MatButton, MatIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tool.scss',
  template: `
    <pg-drop-area [multiple]="false" (files)="read($event[0])" />
    @if (dataUrl()) {
      <div class="result" animate.enter="pg-enter">
        <img alt="" [src]="dataUrl()" />
        <p class="muted">{{ name() }} · {{ 'tools.base64_length' | t: { size: size() } }}</p>
        <textarea readonly [attr.aria-label]="'tools.base64' | t" [value]="dataUrl()"></textarea>
        <div class="actions">
          <button matButton="filled" (click)="copy()">
            <mat-icon svgIcon="content-copy" />{{ 'common.copy' | t }}
          </button>
        </div>
      </div>
    }
  `
})
export class Base64Tool {
  private readonly clipboard = inject(Clipboard)
  protected readonly dataUrl = signal('')
  protected readonly name = signal('')
  protected readonly size = signal('')

  protected read(file: File | undefined) {
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result)
      this.dataUrl.set(text)
      this.name.set(file.name)
      this.size.set(formatBytes(text.length))
    }
    reader.readAsDataURL(file)
  }

  protected copy() {
    void this.clipboard.copy(this.dataUrl())
  }
}
