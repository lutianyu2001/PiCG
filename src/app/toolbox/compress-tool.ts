import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { inject } from '@angular/core'
import { MatButton, MatIconButton } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIcon } from '@angular/material/icon'
import { MatProgressSpinner } from '@angular/material/progress-spinner'
import { MatSelectModule } from '@angular/material/select'
import { MatSlider, MatSliderThumb } from '@angular/material/slider'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { ImagePipeline } from '../imaging/image-pipeline.service'
import { formatBytes } from '../library/properties-dialog'
import { ENCODERS, Encoder } from '../settings/settings.model'
import { DropArea } from './drop-area'
import { downloadBlob, renameExtension } from './download'

interface Row {
  id: number
  file: File
  state: 'working' | 'done' | 'failed' | 'unsupported'
  result: Blob | null
  name: string
  error: string
}

@Component({
  selector: 'pg-compress-tool',
  imports: [
    DropArea,
    MatButton,
    MatFormFieldModule,
    MatIcon,
    MatIconButton,
    MatProgressSpinner,
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
        <mat-label>{{ 'settings.encoder' | t }}</mat-label>
        <mat-select [value]="encoder()" (selectionChange)="encoder.set($event.value)">
          @for (e of encoders; track e) {
            <mat-option [value]="e">{{ 'settings.encoder_' + e | t }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <div class="slider">
        <span class="muted">{{ 'settings.quality' | t }}</span>
        <mat-slider min="10" max="100" step="1" discrete>
          <input matSliderThumb [value]="quality()" (valueChange)="quality.set($event)" />
        </mat-slider>
        <span>{{ quality() }}</span>
      </div>
    </div>
    <pg-drop-area (files)="add($event)" />

    @if (rows().length) {
      <ul class="rows">
        @for (row of rows(); track row.id) {
          <li animate.enter="pg-enter-item" [style.--pg-i]="$index">
            <span class="grow" [title]="row.file.name">{{ row.name }}</span>
            <span class="muted">{{ bytes(row.file.size) }}</span>
            @switch (row.state) {
              @case ('working') {
                <mat-progress-spinner diameter="18" mode="indeterminate" />
              }
              @case ('done') {
                <span>→ {{ bytes(row.result!.size) }}</span>
                <span class="saving">{{ saving(row) }}</span>
                <button matIconButton [attr.aria-label]="'tools.download' | t" (click)="save(row)">
                  <mat-icon svgIcon="download" />
                </button>
              }
              @case ('unsupported') {
                <span class="muted">{{ 'tools.unsupported' | t }}</span>
              }
              @default {
                <span class="error">{{ row.error }}</span>
              }
            }
          </li>
        }
      </ul>
      <div class="actions">
        <button matButton (click)="rows.set([])">{{ 'upload.clear' | t }}</button>
        <button matButton="filled" [disabled]="!anyDone()" (click)="saveAll()">
          <mat-icon svgIcon="download" />{{ 'tools.download_all' | t }}
        </button>
      </div>
    }
  `
})
export class CompressTool {
  private readonly pipeline = inject(ImagePipeline)
  protected readonly encoders = ENCODERS
  protected readonly encoder = signal<Encoder>('webp')
  protected readonly quality = signal(80)
  protected readonly rows = signal<Row[]>([])
  protected readonly bytes = formatBytes
  private nextId = 1

  protected anyDone() {
    return this.rows().some((r) => r.state === 'done')
  }

  protected saving(row: Row) {
    const ratio = 1 - (row.result?.size ?? 0) / row.file.size
    return ratio > 0 ? `−${Math.round(ratio * 100)}%` : `+${Math.round(-ratio * 100)}%`
  }

  private patch(id: number, changes: Partial<Row>) {
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...changes } : r)))
  }

  protected async add(files: File[]) {
    const added: Row[] = files.map((file) => ({
      id: this.nextId++,
      file,
      state: this.pipeline.canProcess(file) ? 'working' : 'unsupported',
      result: null,
      name: file.name,
      error: ''
    }))
    this.rows.update((rows) => [...rows, ...added])
    const compress = { encoder: this.encoder(), quality: this.quality() }
    for (const row of added.filter((r) => r.state === 'working')) {
      try {
        const result = await this.pipeline.process(row.file, {
          compress,
          watermark: null,
          alwaysEncode: true
        })
        this.patch(row.id, {
          state: 'done',
          result: result.blob,
          name: renameExtension(row.file.name, result.extension)
        })
      } catch (err) {
        this.patch(row.id, { state: 'failed', error: (err as Error).message })
      }
    }
  }

  protected save(row: Row) {
    if (row.result) {
      downloadBlob(row.result, row.name)
    }
  }

  protected saveAll() {
    this.rows()
      .filter((r) => r.state === 'done')
      .forEach((r, i) => setTimeout(() => this.save(r), i * 300))
  }
}
