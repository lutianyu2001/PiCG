import {
  ApplicationRef,
  DOCUMENT,
  Injectable,
  computed,
  effect,
  inject,
  signal
} from '@angular/core'
import { readJson, writeJson } from './storage'

export type ThemeChoice = 'system' | 'light' | 'dark'
export type Language = 'zh-CN' | 'zh-TW' | 'en' | 'ja'
export type LanguageChoice = 'system' | Language
/** Animations: as the system asks (none when it asks for reduced motion), always, or never. */
export type MotionChoice = 'system' | 'on' | 'off'

export interface Appearance {
  theme: ThemeChoice
  language: LanguageChoice
  motion: MotionChoice
  navCollapsed: boolean
}

const KEY = 'appearance'
const DEFAULTS: Appearance = {
  theme: 'system',
  language: 'system',
  motion: 'system',
  navCollapsed: false
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** Picks the interface language from the browser's preferred languages. */
export function browserLanguage(
  languages: readonly string[] = navigator.languages ?? []
): Language {
  for (const tag of languages) {
    const lower = tag.toLowerCase()
    if (lower.startsWith('zh')) {
      return /^zh-(tw|hk|mo|hant)/.test(lower) ? 'zh-TW' : 'zh-CN'
    }
    if (lower.startsWith('en')) {
      return 'en'
    }
    if (lower.startsWith('ja')) {
      return 'ja'
    }
  }
  return 'en'
}

/** Theme, language, motion and layout preferences of this device. They are never written to a repository. */
@Injectable({ providedIn: 'root' })
export class AppearanceStore {
  private readonly document = inject(DOCUMENT)
  private readonly appRef = inject(ApplicationRef)
  private readonly reducedMotionQuery = this.document.defaultView?.matchMedia?.(REDUCED_MOTION)
  /** The system asks for reduced motion. */
  readonly systemReducedMotion = signal(this.reducedMotionQuery?.matches ?? false)
  private readonly darkQuery = this.document.defaultView?.matchMedia?.(
    '(prefers-color-scheme: dark)'
  )
  private readonly systemDark = signal(this.darkQuery?.matches ?? false)
  private readonly state = signal<Appearance>({
    ...DEFAULTS,
    ...readJson<Partial<Appearance>>(KEY, {})
  })

  readonly value = this.state.asReadonly()
  readonly language = computed<Language>(() => {
    const choice = this.state().language
    return choice === 'system' ? browserLanguage() : choice
  })
  /** The theme in use, with "system" resolved. */
  readonly theme = computed<'light' | 'dark'>(() => {
    const choice = this.state().theme
    if (choice !== 'system') {
      return choice
    }
    return this.systemDark() ? 'dark' : 'light'
  })
  /** Whether to animate, from the setting and the system's preference. */
  readonly motion = computed(() => {
    const choice = this.state().motion
    return choice === 'system' ? !this.systemReducedMotion() : choice === 'on'
  })

  constructor() {
    effect(() => {
      const { theme } = this.state()
      const root = this.document.documentElement
      root.style.colorScheme = theme === 'system' ? 'light dark' : theme
      root.lang = this.language()
      root.dataset['motion'] = this.motion() ? 'on' : 'off'
    })
    this.reducedMotionQuery?.addEventListener('change', (event) =>
      this.systemReducedMotion.set(event.matches)
    )
    this.darkQuery?.addEventListener('change', (event) => this.systemDark.set(event.matches))
  }

  patch(changes: Partial<Appearance>) {
    this.state.update((current) => ({ ...current, ...changes }))
    writeJson(KEY, this.state())
  }

  /** Changes the theme or the language, cross-fading the whole window from the old look to the new one. */
  change(changes: Partial<Appearance>) {
    if (!this.motion() || !('startViewTransition' in this.document)) {
      this.patch(changes)
      return
    }
    this.document.startViewTransition(() => {
      this.patch(changes)
      // Render the change now, so the transition's new state shows it.
      this.appRef.tick()
    })
  }
}
