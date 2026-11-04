import { ChangeDetectionStrategy, Component } from '@angular/core'

/** The PiCG mark. Colours follow the theme. */
@Component({
  selector: 'pg-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <g transform="translate(49.12 50) rotate(45) scale(0.84) translate(-50 -50)">
        <path
          class="body"
          d="M12 30 A14 14 0 0 1 26 16 H44 V56 H84 V74 A14 14 0 0 1 70 88 H26 A14 14 0 0 1 12 74 Z"
        />
        <rect class="accent" x="56" y="12" width="32" height="32" rx="9" />
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .body {
      fill: light-dark(#15171c, #f2f3f5);
    }
    .accent {
      fill: light-dark(#6d4aff, #9480ff);
    }
  `
})
export class Logo {}
