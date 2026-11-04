import { ChangeDetectionStrategy, Component } from '@angular/core'
import { MatTabsModule } from '@angular/material/tabs'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { TranslatePipe } from '../core/i18n/i18n.service'

@Component({
  selector: 'pg-toolbox-page',
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h1 class="page-title">{{ 'nav.toolbox' | t }}</h1>
      <p class="muted intro">{{ 'tools.intro' | t }}</p>
      <nav mat-tab-nav-bar [tabPanel]="panel">
        @for (tool of tools; track tool) {
          <a
            mat-tab-link
            [routerLink]="tool"
            routerLinkActive
            #rla="routerLinkActive"
            [active]="rla.isActive"
          >
            {{ 'tools.' + tool | t }}
          </a>
        }
      </nav>
      <mat-tab-nav-panel #panel>
        <router-outlet />
      </mat-tab-nav-panel>
    </div>
  `,
  styles: `
    .intro {
      margin: -0.5rem 0 1rem;
    }
    mat-tab-nav-panel {
      display: block;
      padding-top: 1.5rem;
    }
  `
})
export class ToolboxPage {
  protected readonly tools = ['compress', 'base64', 'watermark'] as const
}
