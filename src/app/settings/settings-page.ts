import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { MatButton } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIcon } from '@angular/material/icon'
import { MatSelectModule } from '@angular/material/select'
import { RouterLink } from '@angular/router'
import {
  AppearanceStore,
  LanguageChoice,
  MotionChoice,
  ThemeChoice
} from '../core/appearance.store'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { LegacyService } from '../legacy/legacy.service'
import { SessionStore } from '../session/session.store'
import { Workspace } from '../session/workspace.service'
import { AccountSection } from './account-section'
import { ImageSection } from './image-section'
import { LinksSection } from './links-section'
import { SettingsStore } from './settings.store'
import { UploadSection } from './upload-section'

@Component({
  selector: 'pg-settings-page',
  imports: [
    AccountSection,
    ImageSection,
    LinksSection,
    MatButton,
    MatFormFieldModule,
    MatIcon,
    MatSelectModule,
    RouterLink,
    TranslatePipe,
    UploadSection
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.scss',
  template: `
    <div class="page">
      <h1 class="page-title">{{ 'nav.settings' | t }}</h1>

      @if (session.loggedIn()) {
        @switch (store.sync()) {
          @case ('blocked') {
            <div class="notice warn banner" animate.enter="pg-enter">
              <mat-icon svgIcon="sync-problem" />
              <div>
                <p>{{ 'settings.sync_blocked' | t }}</p>
                <button
                  matButton="filled"
                  (click)="workspace.askToConvert()"
                  [disabled]="!legacy.pending()"
                >
                  {{ 'legacy.convert_short' | t }}
                </button>
              </div>
            </div>
          }
          @case ('error') {
            <div class="notice warn banner" animate.enter="pg-enter">
              <mat-icon svgIcon="sync-problem" />
              <div>
                <p>{{ 'settings.sync_error' | t }}</p>
                <button matButton (click)="store.schedule()">{{ 'common.retry' | t }}</button>
              </div>
            </div>
          }
          @default {
            <p class="sync muted" aria-live="polite">
              <mat-icon
                [svgIcon]="
                  store.sync() === 'saved' || store.sync() === 'idle' ? 'cloud-done' : 'sync'
                "
              />
              {{ 'settings.sync_' + store.sync() | t: { repo: repoName() } }}
            </p>
          }
        }

        <pg-account-section />
        <pg-upload-section />
        <pg-image-section />
        <pg-links-section />
      } @else {
        <div class="notice banner">
          <mat-icon svgIcon="info" />
          <p>
            {{ 'settings.sign_in_first' | t }}
            <a routerLink="/login">{{ 'login.sign_in' | t }}</a>
          </p>
        </div>
      }

      <section class="section">
        <h2>{{ 'settings.appearance' | t }}</h2>
        <div class="row">
          <span class="label">{{ 'settings.theme' | t }}</span>
          <mat-form-field>
            <mat-select
              [value]="appearance.value().theme"
              (selectionChange)="setTheme($event.value)"
            >
              <mat-option value="system">{{ 'settings.theme_system' | t }}</mat-option>
              <mat-option value="light">{{ 'settings.theme_light' | t }}</mat-option>
              <mat-option value="dark">{{ 'settings.theme_dark' | t }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <div class="row">
          <span class="label">{{ 'settings.language' | t }}</span>
          <mat-form-field>
            <mat-select
              [value]="appearance.value().language"
              (selectionChange)="setLanguage($event.value)"
            >
              <mat-option value="system">{{ 'settings.language_system' | t }}</mat-option>
              <mat-option value="zh-CN">简体中文</mat-option>
              <mat-option value="zh-TW">繁體中文</mat-option>
              <mat-option value="en">English</mat-option>
              <mat-option value="ja">日本語</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <div class="row">
          <span class="label">{{ 'settings.motion' | t }}</span>
          <mat-form-field>
            <mat-select
              [value]="appearance.value().motion"
              (selectionChange)="setMotion($event.value)"
            >
              <mat-option value="system">{{ 'settings.motion_system' | t }}</mat-option>
              <mat-option value="on">{{ 'settings.motion_on' | t }}</mat-option>
              <mat-option value="off">{{ 'settings.motion_off' | t }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        @if (appearance.systemReducedMotion() && appearance.value().motion === 'system') {
          <p class="desc">{{ 'settings.motion_reduced' | t }}</p>
        }
        <p class="desc">{{ 'settings.appearance_note' | t }}</p>
      </section>
    </div>
  `,
  styles: `
    .banner {
      margin-bottom: 1.5rem;
      button {
        margin-top: 0.5rem;
      }
    }
    .sync {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin: -0.5rem 0 1rem;
      mat-icon {
        width: 1.125rem;
        height: 1.125rem;
      }
    }
  `
})
export class SettingsPage {
  protected readonly session = inject(SessionStore)
  protected readonly store = inject(SettingsStore)
  protected readonly appearance = inject(AppearanceStore)
  protected readonly legacy = inject(LegacyService)
  protected readonly workspace = inject(Workspace)

  protected readonly repoName = computed(() => this.session.repo()?.name ?? '')

  constructor() {
    if (this.session.loggedIn()) {
      void this.workspace.refreshPages()
    }
  }

  protected setTheme(theme: ThemeChoice) {
    this.appearance.change({ theme })
  }

  protected setLanguage(language: LanguageChoice) {
    this.appearance.change({ language })
  }

  protected setMotion(motion: MotionChoice) {
    this.appearance.patch({ motion })
  }
}
