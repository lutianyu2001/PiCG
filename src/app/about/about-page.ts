import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { Logo } from '../shared/logo'

export const SOURCE_URL = 'https://github.com/lutianyu2001/PiCG'
export const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`

@Component({
  selector: 'pg-about-page',
  imports: [Logo, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="hero">
        <pg-logo />
        <div>
          <h1>PiCG</h1>
          <p class="muted">{{ 'about.tagline' | t }}</p>
        </div>
      </div>

      <section>
        <h2>{{ 'about.how_title' | t }}</h2>
        <ul>
          <li>{{ 'about.how_1' | t }}</li>
          <li>{{ 'about.how_2' | t }}</li>
          <li>{{ 'about.how_3' | t }}</li>
          <li>{{ 'about.how_4' | t }}</li>
          <li>{{ 'about.how_5' | t }}</li>
        </ul>
      </section>

      <section>
        <h2>{{ 'about.privacy_title' | t }}</h2>
        <p>{{ 'about.privacy' | t }}</p>
      </section>

      <section>
        <h2>{{ 'about.disclaimer_title' | t }}</h2>
        <p>{{ 'about.disclaimer' | t }}</p>
        <p>{{ 'about.content' | t }}</p>
      </section>

      <section>
        <h2>{{ 'about.license_title' | t }}</h2>
        <p>
          {{ 'about.license' | t }}
          <a [href]="licenseUrl" target="_blank" rel="noopener">{{ 'about.view_license' | t }}</a> ·
          <a [href]="sourceUrl" target="_blank" rel="noopener">{{ 'about.view_source' | t }}</a>
        </p>
        <p class="muted">Copyright 2026 Tianyu (Sky) Lu</p>
      </section>
    </div>
  `,
  styles: `
    .hero {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-bottom: 1.5rem;
      pg-logo {
        width: 4rem;
        height: 4rem;
      }
      h1 {
        margin: 0;
        font: var(--mat-sys-headline-medium);
      }
      p {
        margin: 0.25rem 0 0;
      }
    }
    section {
      margin-bottom: 1.5rem;
      line-height: 1.7;
    }
    h2 {
      margin: 0 0 0.5rem;
      font: var(--mat-sys-title-large);
    }
    ul {
      padding-left: 1.25rem;
    }
  `
})
export class AboutPage {
  protected readonly sourceUrl = SOURCE_URL
  protected readonly licenseUrl = LICENSE_URL
}
