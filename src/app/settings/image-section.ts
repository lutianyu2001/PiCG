import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInput } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatSlideToggle } from '@angular/material/slide-toggle'
import { MatSlider, MatSliderThumb } from '@angular/material/slider'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { drawWatermark } from '../imaging/watermark'
import { CompressSettings, ENCODERS, POSITIONS, WatermarkSettings } from './settings.model'
import { SettingsStore } from './settings.store'

/** Draws a neutral sample picture with the watermark on top. */
export function drawWatermarkPreview(canvas: HTMLCanvasElement, mark: WatermarkSettings) {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }
  const { width, height } = canvas
  const sky = ctx.createLinearGradient(0, 0, width, height)
  sky.addColorStop(0, '#7b8fd6')
  sky.addColorStop(1, '#d9a7c7')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#3d4a73'
  ctx.beginPath()
  ctx.moveTo(0, height)
  ctx.lineTo(width * 0.35, height * 0.45)
  ctx.lineTo(width * 0.6, height * 0.75)
  ctx.lineTo(width * 0.8, height * 0.55)
  ctx.lineTo(width, height * 0.8)
  ctx.lineTo(width, height)
  ctx.fill()
  drawWatermark(ctx, width, height, mark)
}

@Component({
  selector: 'pg-image-section',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInput,
    MatSelectModule,
    MatSlideToggle,
    MatSlider,
    MatSliderThumb,
    TranslatePipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.scss',
  template: `
    <section class="section">
      <h2>{{ 'settings.compression' | t }}</h2>
      <div class="stack">
        <mat-slide-toggle
          [checked]="compress().enabled"
          (change)="setCompress({ enabled: $event.checked })"
        >
          {{ 'settings.compress_default' | t }}
        </mat-slide-toggle>
        <p class="desc">{{ 'settings.compress_desc' | t }}</p>
      </div>
      <div class="row">
        <span class="label">{{ 'settings.encoder' | t }}</span>
        <mat-form-field>
          <mat-select
            [value]="compress().encoder"
            (selectionChange)="setCompress({ encoder: $event.value })"
          >
            <mat-select-trigger>{{
              'settings.encoder_' + compress().encoder | t
            }}</mat-select-trigger>
            @for (encoder of encoders; track encoder) {
              <mat-option [value]="encoder">
                {{ 'settings.encoder_' + encoder | t }}
                <span class="option-desc">{{ 'settings.encoder_' + encoder + '_desc' | t }}</span>
              </mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <div class="row">
        <span class="label">{{ 'settings.quality' | t }}</span>
        <div class="slider">
          <mat-slider min="10" max="100" step="1" discrete>
            <input
              matSliderThumb
              [value]="compress().quality"
              (valueChange)="setCompress({ quality: $event })"
            />
          </mat-slider>
          <span class="value">{{ compress().quality }}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>{{ 'settings.watermark' | t }}</h2>
      <div class="stack">
        <mat-slide-toggle
          [checked]="mark().enabled"
          (change)="setMark({ enabled: $event.checked })"
        >
          {{ 'settings.watermark_default' | t }}
        </mat-slide-toggle>
        <p class="desc">{{ 'settings.watermark_desc' | t }}</p>
      </div>
      <div class="row">
        <mat-form-field>
          <mat-label>{{ 'settings.watermark_text' | t }}</mat-label>
          <input
            matInput
            name="mark-text"
            [ngModel]="mark().text"
            (ngModelChange)="setMark({ text: $event })"
          />
        </mat-form-field>
        <mat-form-field class="narrow">
          <mat-label>{{ 'settings.watermark_position' | t }}</mat-label>
          <mat-select
            [value]="mark().position"
            (selectionChange)="setMark({ position: $event.value })"
          >
            @for (position of positions; track position) {
              <mat-option [value]="position">{{ 'settings.position_' + position | t }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <div class="row">
        <span class="label">{{ 'settings.watermark_size' | t }}</span>
        <div class="slider">
          <mat-slider min="8" max="160" step="1" discrete>
            <input matSliderThumb [value]="mark().size" (valueChange)="setMark({ size: $event })" />
          </mat-slider>
          <span class="value">{{ mark().size }}</span>
        </div>
      </div>
      <div class="row">
        <span class="label">{{ 'settings.watermark_opacity' | t }}</span>
        <div class="slider">
          <mat-slider min="0.05" max="1" step="0.05" discrete>
            <input
              matSliderThumb
              [value]="mark().opacity"
              (valueChange)="setMark({ opacity: $event })"
            />
          </mat-slider>
          <span class="value">{{ (mark().opacity * 100).toFixed(0) }}%</span>
        </div>
      </div>
      <div class="row">
        <label class="label" for="mark-color">{{ 'settings.watermark_color' | t }}</label>
        <input
          id="mark-color"
          type="color"
          class="color"
          [value]="mark().color"
          (input)="setMark({ color: $any($event.target).value })"
        />
      </div>
      <canvas
        #preview
        class="preview"
        width="1000"
        height="560"
        [attr.aria-label]="'settings.watermark_preview' | t"
        role="img"
      ></canvas>
    </section>
  `,
  styles: `
    .narrow {
      max-width: 14rem;
    }
    .color {
      width: 3rem;
      height: 2rem;
      padding: 0;
      border: 1px solid var(--mat-sys-outline);
      border-radius: var(--mat-sys-corner-small);
      background: none;
    }
    .preview {
      display: block;
      width: 100%;
      max-width: 28rem;
      height: auto;
      border-radius: var(--mat-sys-corner-medium);
    }
  `
})
export class ImageSection {
  private readonly store = inject(SettingsStore)
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('preview')

  protected readonly compress = computed(() => this.store.settings().compress)
  protected readonly mark = computed(() => this.store.settings().watermark)
  protected readonly encoders = ENCODERS
  protected readonly positions = POSITIONS

  constructor() {
    effect(() => {
      const canvas = this.canvas()?.nativeElement
      if (canvas) {
        drawWatermarkPreview(canvas, this.mark())
      }
    })
  }

  protected setCompress(changes: Partial<CompressSettings>) {
    this.store.update((draft) => Object.assign(draft.compress, changes))
  }

  protected setMark(changes: Partial<WatermarkSettings>) {
    this.store.update((draft) => Object.assign(draft.watermark, changes))
  }
}
