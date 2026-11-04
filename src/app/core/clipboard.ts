import { Injectable, inject } from '@angular/core'
import { Notify } from './notify.service'

/**
 * Copies text. Browsers may refuse to write to the clipboard when the copy does not follow a click directly (for
 * example at the end of an upload); the user then gets a message with a button that copies on click.
 */
@Injectable({ providedIn: 'root' })
export class Clipboard {
  private readonly notify = inject(Notify)

  async copy(text: string, doneKey = 'common.copied', params?: Record<string, string | number>) {
    try {
      await navigator.clipboard.writeText(text)
      this.notify.info(doneKey, params)
    } catch {
      this.notify.action('common.copy_blocked', undefined, 'common.copy', () => {
        navigator.clipboard.writeText(text).then(
          () => this.notify.info(doneKey, params),
          () => this.notify.error('common.copy_failed')
        )
      })
    }
  }
}
