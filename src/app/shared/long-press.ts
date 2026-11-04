import { Directive, output } from '@angular/core'

const DELAY_MS = 500
const MOVE_TOLERANCE = 10

/** Emits after a finger rests on the element; the click that follows is swallowed. */
@Directive({
  selector: '[pgLongPress]',
  host: {
    '(touchstart)': 'start($event)',
    '(touchmove)': 'move($event)',
    '(touchend)': 'cancel()',
    '(touchcancel)': 'cancel()',
    '(click)': 'swallow($event)',
    '(contextmenu)': 'menu($event)'
  }
})
export class LongPress {
  readonly pgLongPress = output<void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private origin: { x: number; y: number } | null = null
  private fired = false

  protected start(event: TouchEvent) {
    const touch = event.touches[0]
    this.origin = { x: touch.clientX, y: touch.clientY }
    this.fired = false
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.fired = true
      navigator.vibrate?.(10)
      this.pgLongPress.emit()
    }, DELAY_MS)
  }

  protected move(event: TouchEvent) {
    const touch = event.touches[0]
    if (
      this.origin &&
      Math.hypot(touch.clientX - this.origin.x, touch.clientY - this.origin.y) > MOVE_TOLERANCE
    ) {
      this.cancel()
    }
  }

  protected cancel() {
    clearTimeout(this.timer)
    this.origin = null
  }

  protected swallow(event: MouseEvent) {
    if (this.fired) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.fired = false
    }
  }

  protected menu(event: MouseEvent) {
    if (this.fired) {
      event.preventDefault()
    }
  }
}
