import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core'
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog'
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field'
import { provideRouter, withHashLocation, withViewTransitions } from '@angular/router'
import { provideServiceWorker } from '@angular/service-worker'
import { routes } from './app.routes'
import { provideIcons } from './core/icons'
import { onRouteTransition, provideMotion } from './core/motion'
import { Workspace } from './session/workspace.service'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withHashLocation(),
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: onRouteTransition
      })
    ),
    provideMotion(),
    provideIcons(),
    provideAppInitializer(() => inject(Workspace).start()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', subscriptSizing: 'dynamic' }
    },
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        // These replace Material's defaults, so the role has to be given again.
        role: 'dialog',
        ariaModal: true,
        maxWidth: 'calc(100vw - 2rem)',
        autoFocus: 'dialog'
      }
    }
  ]
}
