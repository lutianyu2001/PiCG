import { Routes } from '@angular/router'
import { ToolboxPage } from './toolbox-page'

export const TOOLBOX_ROUTES: Routes = [
  {
    path: '',
    component: ToolboxPage,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'compress' },
      {
        path: 'compress',
        title: 'PiCG',
        loadComponent: () => import('./compress-tool').then((m) => m.CompressTool)
      },
      {
        path: 'base64',
        title: 'PiCG',
        loadComponent: () => import('./base64-tool').then((m) => m.Base64Tool)
      },
      {
        path: 'watermark',
        title: 'PiCG',
        loadComponent: () => import('./watermark-tool').then((m) => m.WatermarkTool)
      }
    ]
  }
]
