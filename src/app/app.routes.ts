import { inject } from '@angular/core'
import { CanActivateFn, Router, Routes } from '@angular/router'
import { SessionStore } from './session/session.store'

const signedIn: CanActivateFn = () =>
  inject(SessionStore).loggedIn() || inject(Router).createUrlTree(['/login'])

const signedOut: CanActivateFn = () =>
  !inject(SessionStore).loggedIn() || inject(Router).createUrlTree(['/library'])

const home: CanActivateFn = () =>
  inject(Router).createUrlTree([inject(SessionStore).loggedIn() ? '/library' : '/login'])

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [home], children: [] },
  {
    path: 'login',
    canActivate: [signedOut],
    title: 'PiCG',
    loadComponent: () => import('./session/login-page').then((m) => m.LoginPage)
  },
  {
    path: 'library',
    canActivate: [signedIn],
    title: 'PiCG',
    loadComponent: () => import('./library/library-page').then((m) => m.LibraryPage)
  },
  {
    path: 'settings',
    title: 'PiCG',
    loadComponent: () => import('./settings/settings-page').then((m) => m.SettingsPage)
  },
  {
    path: 'toolbox',
    loadChildren: () => import('./toolbox/toolbox.routes').then((m) => m.TOOLBOX_ROUTES)
  },
  {
    path: 'about',
    title: 'PiCG',
    loadComponent: () => import('./about/about-page').then((m) => m.AboutPage)
  },
  { path: 'upload', redirectTo: 'library' },
  { path: '**', canActivate: [home], children: [] }
]
