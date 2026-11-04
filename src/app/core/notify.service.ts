import { Injectable, inject } from '@angular/core'
import { MatSnackBar } from '@angular/material/snack-bar'
import { I18n, Params } from './i18n/i18n.service'

/** Short messages at the bottom of the screen. Only the latest one is shown. */
@Injectable({ providedIn: 'root' })
export class Notify {
  private readonly snackBar = inject(MatSnackBar)
  private readonly i18n = inject(I18n)

  info(key: string, params?: Params, duration = 4000) {
    this.snackBar.open(this.i18n.t(key, params), this.i18n.t('common.close'), { duration })
  }

  /** Errors stay longer, since they usually need to be read in full. */
  error(key: string, params?: Params) {
    this.info(key, params, 10000)
  }

  /** A message with one action, such as copying a link the browser refused to copy without a click. */
  action(
    key: string,
    params: Params | undefined,
    actionKey: string,
    run: () => void,
    duration = 10000
  ) {
    this.snackBar
      .open(this.i18n.t(key, params), this.i18n.t(actionKey), { duration })
      .onAction()
      .subscribe(run)
  }
}
