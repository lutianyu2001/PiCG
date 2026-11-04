import { bootstrapApplication } from '@angular/platform-browser'
import { App } from './app/app'
import { appConfig } from './app/app.config'
import { loadFonts } from './app/core/fonts'

void loadFonts()

bootstrapApplication(App, appConfig).catch((err) => console.error(err))
