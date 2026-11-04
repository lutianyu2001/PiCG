import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { MatIconButton } from '@angular/material/button'
import { MatRipple } from '@angular/material/core'
import { MatDialog } from '@angular/material/dialog'
import { MatIcon } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { MatTooltip } from '@angular/material/tooltip'
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { SwUpdate } from '@angular/service-worker'
import { AppearanceStore, LanguageChoice } from './core/appearance.store'
import { I18n, TranslatePipe } from './core/i18n/i18n.service'
import { Notify } from './core/notify.service'
import { SessionStore } from './session/session.store'
import { SignOutDialog } from './session/sign-out-dialog'
import { Logo } from './shared/logo'

interface NavItem {
  path: string
  label: string
  icon: string
}

const UPDATE_CHECK_INTERVAL = 10 * 60 * 1000

const NAV: NavItem[] = [
  { path: '/library', label: 'nav.library', icon: 'photo-library' },
  { path: '/toolbox', label: 'nav.toolbox', icon: 'construction' },
  { path: '/settings', label: 'nav.settings', icon: 'settings' },
  { path: '/about', label: 'nav.about', icon: 'info' }
]

@Component({
  selector: 'pg-root',
  imports: [
    Logo,
    MatIcon,
    MatIconButton,
    MatMenuModule,
    MatRipple,
    MatTooltip,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslatePipe
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  protected readonly session = inject(SessionStore)
  protected readonly appearance = inject(AppearanceStore)
  private readonly i18n = inject(I18n)
  private readonly dialog = inject(MatDialog)
  private readonly router = inject(Router)
  private readonly notify = inject(Notify)
  private readonly updates = inject(SwUpdate)

  protected readonly collapsed = computed(() => this.appearance.value().navCollapsed)
  protected readonly nav = computed(() =>
    NAV.map((item) =>
      item.path === '/library' && !this.session.loggedIn() ? { ...item, path: '/login' } : item
    )
  )

  protected readonly languageOptions: { value: LanguageChoice; key?: string; label?: string }[] = [
    { value: 'system', key: 'settings.language_system' },
    { value: 'zh-CN', label: '简体中文' },
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' }
  ]
  protected readonly themeIcon = computed(() =>
    this.appearance.theme() === 'dark' ? 'moon-stars-fill' : 'sun-fill'
  )
  protected readonly themeLabel = computed(() => {
    const theme = this.appearance.theme()
    this.i18n.language()
    return this.i18n.t('nav.theme', { theme: this.i18n.t(`settings.theme_${theme}`) })
  })

  constructor() {
    // The service worker serves the cached version; say when a newer one has been downloaded.
    if (this.updates.isEnabled) {
      this.watchUpdates()
      this.updates.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') {
          this.notify.action(
            'app.update_ready',
            undefined,
            'app.update_reload',
            () => location.reload(),
            0
          )
        }
      })
    }
  }

  /**
   * The service worker looks for a new version only when the page is opened, so a page left open would never hear
   * of one. Look again every ten minutes and whenever the page comes back into view, as PicX did.
   */
  private watchUpdates() {
    const check = () => {
      if (document.visibilityState === 'visible') {
        this.updates.checkForUpdate().catch(() => undefined)
      }
    }
    setInterval(check, UPDATE_CHECK_INTERVAL)
    document.addEventListener('visibilitychange', check)
  }

  /** Switches between light and dark; following the system is chosen in settings. */
  protected toggleTheme() {
    this.appearance.change({ theme: this.appearance.theme() === 'dark' ? 'light' : 'dark' })
  }

  protected setLanguage(language: LanguageChoice) {
    this.appearance.change({ language })
  }

  protected toggleNav() {
    this.appearance.patch({ navCollapsed: !this.collapsed() })
  }

  protected signOut() {
    this.dialog
      .open(SignOutDialog, { width: '26rem' })
      .afterClosed()
      .subscribe((keep?: boolean) => {
        if (keep !== undefined) {
          this.session.signOut(keep)
          void this.router.navigateByUrl('/login')
        }
      })
  }
}
