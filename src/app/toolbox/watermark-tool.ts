import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButton } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIcon } from '@angular/material/icon'
import { MatInput } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatSlider, MatSliderThumb } from '@angular/material/slider'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { drawWatermark } from '../imaging/watermark'
import { POSITIONS, WatermarkSettings } from '../settings/settings.model'
import { SettingsStore } from '../settings/settings.store'
import { DropArea } from './drop-area'
import { downloadBlob, renameExtension } from './download'

@Component({
  selector: 'pg-watermark-tool',
  imports: [
    DropArea,
    FormsModule,
    MatButton,
    MatFormFieldModule,
    MatIcon,
    MatInput,
    MatSelectModule,
    MatSlider,
    MatSliderThumb,
    TranslatePipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tool.scss',
  template: `
    <div class="controls">
      <mat-form-field>
        <mat-label>{{ 'settings.watermark_text' | t }}</mat-label>
        <input
          matInput
          name="text"
          [ngModel]="mark().text"
          (ngModelChange)="set({ text: $event })"
        />
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'settings.watermark_position' | t }}</mat-label>
        <mat-select [value]="mark().position" (selectionChange)="set({ position: $event.value })">
          @for (p of positions; track p) {
            <mat-option [value]="p">{{ 'settings.position_' + p | t }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <div class="slider">
        <span class="muted">{{ 'settings.watermark_size' | t }}</span>
        <mat-slider min="8" max="160" step="1" discrete>
          <input matSliderThumb [value]="mark().size" (valueChange)="set({ size: $event })" />
        </mat-slider>
      </div>
      <div class="slider">
        <span class="muted">{{ 'settings.watermark_opacity' | t }}</span>
        <mat-slider min="0.05" max="1" step="0.05" discrete>
          <input matSliderThumb [value]="mark().opacity" (valueChange)="set({ opacity: $event })" />
        </mat-slider>
      </div>
      <label class="muted">
        {{ 'settings.watermark_color' | t }}
        <input
          type="color"
          [value]="mark().color"
          (input)="set({ color: $any($event.target).value })"
        />
      </label>
    </div>
    <pg-drop-area [multiple]="false" (files)="load($event[0])" />
    <div class="result" [hidden]="!file()">
      <canvas #canvas [attr.aria-label]="'settings.watermark_preview' | t" role="img"></canvas>
      <div class="actions">
        <button matButton="filled" (click)="save()">
          <mat-icon svgIcon="download" />{{ 'tools.download' | t }}
        </button>
      </div>
    </div>
  `
})
export class WatermarkTool {
  private readonly settings = inject(SettingsStore)
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas')

  /** Starts from the upload watermark settings; changes here do not touch them. */
  protected readonly mark = signal<WatermarkSettings>({ ...this.settings.settings().watermark })
  protected readonly positions = POSITIONS
  protected readonly file = signal<File | null>(null)
  private readonly bitmap = signal<ImageBitmap | null>(null)
  private readonly type = computed(() =>
    ['image/png', 'image/jpeg', 'image/webp'].includes(this.file()?.type ?? '')
      ? this.file()!.type
      : 'image/png'
  )

  constructor() {
    effect(() => {
      const bitmap = this.bitmap()
      const canvas = this.canvas().nativeElement
      const mark = this.mark()
      if (!bitmap) {
        return
      }
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      drawWatermark(ctx, canvas.width, canvas.height, mark)
    })
  }

  protected set(changes: Partial<WatermarkSettings>) {
    this.mark.update((m) => ({ ...m, ...changes }))
  }

  protected async load(file: File | undefined) {
    if (!file) {
      return
    }
    this.bitmap()?.close()
    this.file.set(file)
    this.bitmap.set(await createImageBitmap(file))
  }

  protected save() {
    const file = this.file()
    const type = this.type()
    this.canvas().nativeElement.toBlob(
      (blob) => {
        if (blob && file) {
          const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1]
          downloadBlob(blob, renameExtension(file.name.replace(/(\.[^.]+)?$/, '-watermark$1'), ext))
        }
      },
      type,
      0.92
    )
  }
}
