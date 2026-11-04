import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButton, MatIconButton } from '@angular/material/button'
import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIcon } from '@angular/material/icon'
import { MatInput } from '@angular/material/input'
import { MatMenuModule } from '@angular/material/menu'
import { MatProgressSpinner } from '@angular/material/progress-spinner'
import { MatSlideToggle } from '@angular/material/slide-toggle'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { Subfolder } from '../settings/settings.model'
import { SettingsStore } from '../settings/settings.store'
import { joinPath } from './library.store'
import { cleanSegment } from './naming'
import { formatBytes } from './properties-dialog'
import { QueueItem, UploadQueueStore } from './upload-queue.store'

@Component({
  selector: 'pg-queue-panel',
  imports: [
    FormsModule,
    MatButton,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIcon,
    MatIconButton,
    MatInput,
    MatMenuModule,
    MatProgressSpinner,
    MatSlideToggle,
    TranslatePipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './queue-panel.html',
  styleUrl: './queue-panel.scss'
})
export class QueuePanel {
  protected readonly queue = inject(UploadQueueStore)
  private readonly settings = inject(SettingsStore)

  protected readonly options = this.queue.options
  protected readonly prefix = computed(() => this.settings.settings().upload.prefix)
  protected readonly prefixEnabled = computed(() => this.settings.settings().upload.prefixEnabled)
  /** Where the first item goes, shown in the header so the target is never a surprise. */
  protected readonly target = computed(() => {
    const first = this.queue.pending()[0]
    return first ? joinPath(first.target, this.queue.subfolder()) || '/' : ''
  })
  protected readonly bytes = formatBytes

  protected setSubfolder(value: Subfolder) {
    this.queue.setOptions({ subfolder: value })
  }

  protected rename(item: QueueItem, base: string) {
    this.queue.patch(item.id, { base })
  }

  protected prefixOf(item: QueueItem) {
    return item.prefix && this.prefixEnabled() ? cleanSegment(this.prefix()) : ''
  }

  /** The part of the final name after the editable base: hash and extension. */
  protected restOf(item: QueueItem) {
    const extension = item.processedExtension || item.extension
    return (
      (item.hash && item.hashHex ? `.${item.hashHex}` : '') + (extension ? `.${extension}` : '')
    )
  }
}
