import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatChipsModule } from '@angular/material/chips'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInput } from '@angular/material/input'
import { MatSlideToggle } from '@angular/material/slide-toggle'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { cleanFolderPath, finalName, timeFolder } from '../library/naming'
import { Subfolder, TIME_FORMAT_PRESETS, UploadSettings } from './settings.model'
import { SettingsStore } from './settings.store'

@Component({
  selector: 'pg-upload-section',
  imports: [
    FormsModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInput,
    MatSlideToggle,
    TranslatePipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.scss',
  template: `
    <section class="section">
      <h2>{{ 'settings.upload' | t }}</h2>

      <div class="stack">
        <mat-slide-toggle
          [checked]="upload().autoUpload"
          (change)="set({ autoUpload: $event.checked })"
        >
          {{ 'settings.auto_upload' | t }}
        </mat-slide-toggle>
        <p class="desc">{{ 'settings.auto_upload_desc' | t }}</p>
      </div>

      <div class="stack">
        <span class="muted">{{ 'settings.default_subfolder' | t }}</span>
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [attr.aria-label]="'settings.default_subfolder' | t"
          [value]="upload().subfolder"
          (change)="setSubfolder($event.value)"
        >
          <mat-button-toggle value="none">{{ 'upload.sub_none' | t }}</mat-button-toggle>
          <mat-button-toggle value="time">{{ 'upload.sub_time' | t }}</mat-button-toggle>
          <mat-button-toggle value="custom">{{ 'upload.sub_custom' | t }}</mat-button-toggle>
        </mat-button-toggle-group>
        <p class="desc">{{ 'settings.subfolder_desc' | t }}</p>
      </div>

      @if (upload().subfolder === 'custom') {
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'upload.custom_name' | t }}</mat-label>
            <input
              matInput
              name="custom-subfolder"
              autocomplete="off"
              [ngModel]="upload().customSubfolder"
              (ngModelChange)="set({ customSubfolder: $event })"
            />
            <mat-hint>{{ 'settings.custom_hint' | t: { path: cleanCustom() || '—' } }}</mat-hint>
          </mat-form-field>
        </div>
      }

      <div class="row">
        <mat-form-field>
          <mat-label>{{ 'settings.time_format' | t }}</mat-label>
          <input
            matInput
            name="time-format"
            autocomplete="off"
            spellcheck="false"
            [ngModel]="upload().timeFormat"
            (ngModelChange)="set({ timeFormat: $event })"
          />
          <mat-hint>{{ 'settings.time_preview' | t: { folder: timePreview() || '—' } }}</mat-hint>
        </mat-form-field>
        <mat-chip-set [attr.aria-label]="'settings.time_presets' | t">
          @for (preset of presets; track preset) {
            <mat-chip (click)="set({ timeFormat: preset })">{{ preset }}</mat-chip>
          }
        </mat-chip-set>
      </div>
      <p class="desc">{{ 'settings.time_format_desc' | t }}</p>

      <div class="stack">
        <mat-slide-toggle [checked]="upload().hash" (change)="set({ hash: $event.checked })">
          {{ 'settings.hash' | t }}
        </mat-slide-toggle>
        <p class="desc">{{ 'settings.hash_desc' | t }}</p>
      </div>

      <div class="stack">
        <mat-slide-toggle
          [checked]="upload().prefixEnabled"
          (change)="set({ prefixEnabled: $event.checked })"
        >
          {{ 'settings.prefix' | t }}
        </mat-slide-toggle>
      </div>
      @if (upload().prefixEnabled) {
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'settings.prefix_text' | t }}</mat-label>
            <input
              matInput
              name="prefix"
              autocomplete="off"
              [ngModel]="upload().prefix"
              (ngModelChange)="set({ prefix: $event })"
            />
          </mat-form-field>
        </div>
      }
      <p class="desc">{{ 'settings.name_preview' | t: { name: namePreview() } }}</p>

      <div class="stack">
        <mat-slide-toggle
          [checked]="upload().stripMetadata"
          (change)="set({ stripMetadata: $event.checked })"
        >
          {{ 'settings.strip_metadata' | t }}
        </mat-slide-toggle>
        <p class="desc">{{ 'settings.strip_metadata_desc' | t }}</p>
      </div>
    </section>
  `
})
export class UploadSection {
  private readonly store = inject(SettingsStore)
  protected readonly upload = computed(() => this.store.settings().upload)
  protected readonly presets = TIME_FORMAT_PRESETS
  protected readonly timePreview = computed(() => timeFolder(this.upload().timeFormat))
  protected readonly cleanCustom = computed(() => cleanFolderPath(this.upload().customSubfolder))
  protected readonly namePreview = computed(() =>
    finalName({
      base: 'photo',
      extension: 'webp',
      prefix: this.upload().prefixEnabled ? this.upload().prefix : '',
      hash: this.upload().hash ? '1a2b3c4d' : ''
    })
  )

  protected set(changes: Partial<UploadSettings>) {
    this.store.update((draft) => Object.assign(draft.upload, changes))
  }

  protected setSubfolder(subfolder: Subfolder) {
    this.set({ subfolder })
  }
}
