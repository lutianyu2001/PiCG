import type { WatermarkSettings } from '../settings/settings.model'

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Draws the watermark text on an image of the given size. Works on the main thread and in workers. */
export function drawWatermark(
  ctx: Context2D,
  width: number,
  height: number,
  mark: Omit<WatermarkSettings, 'enabled'>
) {
  const text = mark.text.trim()
  if (!text) {
    return
  }
  const px = Math.max(8, Math.round((mark.size * width) / 1000))
  const margin = Math.round(px * 0.6)
  ctx.save()
  ctx.font = `600 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.globalAlpha = mark.opacity
  ctx.fillStyle = mark.color
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = Math.round(px * 0.15)

  const [vertical, horizontal] =
    mark.position === 'center' ? ['middle', 'center'] : mark.position.split('-')
  ctx.textAlign = horizontal === 'left' ? 'left' : horizontal === 'right' ? 'right' : 'center'
  ctx.textBaseline = vertical === 'top' ? 'top' : vertical === 'bottom' ? 'bottom' : 'middle'
  const x = horizontal === 'left' ? margin : horizontal === 'right' ? width - margin : width / 2
  const y = vertical === 'top' ? margin : vertical === 'bottom' ? height - margin : height / 2
  ctx.fillText(text, x, y)
  ctx.restore()
}
