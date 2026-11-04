import { MediaMatcher } from '@angular/cdk/layout'
import { DOCUMENT, Injectable, Provider, inject } from '@angular/core'
import { MATERIAL_ANIMATIONS } from '@angular/material/core'
import { ViewTransitionInfo } from '@angular/router'
import { AppearanceStore } from './appearance.store'

/**
 * Material turns its animations off when the system asks for reduced motion, and reads that once. When motion is
 * set to "on", it is told the system does not ask for it.
 */
@Injectable()
class MotionMediaMatcher extends MediaMatcher {
  private readonly appearance = inject(AppearanceStore)

  override matchMedia(query: string): MediaQueryList {
    if (query.includes('prefers-reduced-motion') && this.appearance.value().motion === 'on') {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false
      }
    }
    return super.matchMedia(query)
  }
}

/** Material's animations follow the motion setting; components made after a change follow the new one. */
export function provideMotion(): Provider[] {
  return [
    { provide: MediaMatcher, useClass: MotionMediaMatcher },
    {
      provide: MATERIAL_ANIMATIONS,
      useFactory: () => {
        const appearance = inject(AppearanceStore)
        return {
          get animationsDisabled() {
            return !appearance.motion()
          }
        }
      }
    }
  ]
}

/**
 * Page changes go through a view transition: the content fades through while the top bar and the navigation
 * stay (see styles.scss). Without motion the transition is skipped.
 */
export function onRouteTransition({ transition }: ViewTransitionInfo) {
  if (!inject(AppearanceStore).motion()) {
    transition.skipTransition()
    return
  }
  const root = inject(DOCUMENT).documentElement
  root.classList.add('pg-route-transition')
  transition.finished.finally(() => root.classList.remove('pg-route-transition'))
}
