import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild
} from '@angular/core'
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { MatIcon } from '@angular/material/icon'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { LibraryStore, baseName } from './library.store'

interface Part {
  text: string
  /** Folder path up to and including this part. */
  path: string
  invalid: boolean
  /** A level above the last one, which can be clicked to go there. */
  clickable: boolean
}

/**
 * The folder path above the library, which can be edited directly or clicked at any level to go back to it.
 *
 * The typed text cannot be coloured or clicked in parts, so the input's own text is transparent and a layer drawn
 * over it shows the path: levels that exist can be clicked, and from the first level that does not exist on, the
 * rest is red, as is the field. Suggestions list the folders in the deepest level that exists.
 */
@Component({
  selector: 'pg-path-field',
  imports: [MatAutocompleteModule, MatIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="field"
      [class.invalid]="shownInvalidFrom() >= 0"
      [attr.aria-label]="'library.path' | t"
    >
      <button class="root" type="button" [attr.aria-label]="'library.root' | t" (click)="go('')">
        <mat-icon svgIcon="home" />
      </button>
      <div class="box">
        <input
          #input
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          [attr.aria-label]="'library.path_edit' | t"
          [attr.aria-invalid]="shownInvalidFrom() >= 0"
          [placeholder]="'library.path_placeholder' | t"
          [value]="text()"
          [matAutocomplete]="suggest"
          (input)="text.set(input.value)"
          (scroll)="offset.set(input.scrollLeft)"
          (keydown.enter)="submit()"
          (focus)="focused.set(true)"
          (blur)="focused.set(false); submit()"
        />
        <div class="layer" aria-hidden="true">
          <div [style.margin-left.px]="-offset()">
            @for (part of parts(); track $index; let last = $last) {
              @if (part.clickable) {
                <a class="level" (mousedown)="$event.preventDefault()" (click)="go(part.path)">{{
                  part.text
                }}</a>
              } @else {
                <span [class.bad]="part.invalid">{{ part.text }}</span>
              }
              @if (!last) {
                <span class="slash" [class.bad]="part.invalid">/</span>
              }
            }
          </div>
        </div>
      </div>
    </nav>
    @if (invalidName(); as name) {
      <p class="error" role="alert" animate.enter="pg-enter-fade">
        {{ 'library.path_invalid' | t: { name } }}
      </p>
    }
    <mat-autocomplete #suggest="matAutocomplete" (optionSelected)="picked($event)">
      @for (folder of suggestions(); track folder) {
        <mat-option [value]="folder">{{ baseName(folder) }}</mat-option>
      }
    </mat-autocomplete>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1 1 14rem;
      flex-direction: column;
      min-width: 0;
    }
    .field {
      display: flex;
      align-items: center;
      height: 2.5rem;
      padding-right: 0.75rem;
      border: 1px solid transparent;
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-surface-container-high);
      &:focus-within {
        border-color: var(--mat-sys-primary);
      }
      &.invalid {
        border-color: var(--mat-sys-error);
      }
    }
    .root {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      padding: 0;
      border: none;
      border-radius: var(--mat-sys-corner-full);
      background: none;
      color: var(--mat-sys-on-surface-variant);
      cursor: pointer;
      &:hover {
        color: var(--mat-sys-on-surface);
      }
    }
    .box {
      position: relative;
      flex: 1;
      min-width: 0;
    }
    input,
    .layer {
      font: var(--mat-sys-body-large);
      letter-spacing: normal;
      white-space: pre;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      padding: 0;
      border: none;
      outline: none;
      background: none;
      color: transparent;
      caret-color: var(--mat-sys-on-surface);
      &::placeholder {
        color: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
      }
      &::selection {
        background: color-mix(in srgb, var(--mat-sys-primary) 30%, transparent);
      }
    }
    .layer {
      position: absolute;
      inset: 0;
      overflow: hidden;
      color: var(--mat-sys-on-surface);
      pointer-events: none;
    }
    .level {
      color: var(--mat-sys-primary);
      cursor: pointer;
      pointer-events: auto;
      &:hover {
        text-decoration: underline;
      }
    }
    .slash {
      color: var(--mat-sys-on-surface-variant);
    }
    .bad {
      color: var(--mat-sys-error);
    }
    .error {
      margin: 0.25rem 0 0 1rem;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `
})
export class PathField {
  private readonly library = inject(LibraryStore)
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input')

  /** Asks to open a folder; the library's path is the source of truth. */
  readonly navigate = output<string>()

  protected readonly text = signal('')
  protected readonly focused = signal(false)
  protected readonly offset = signal(0)
  protected readonly baseName = baseName

  private readonly segments = computed(() => this.text().split('/').filter(Boolean))

  /** Index of the first level that is not a folder, or -1. */
  protected readonly invalidFrom = computed(() => {
    const segments = this.segments()
    return segments.findIndex((_, i) => !this.library.isFolder(segments.slice(0, i + 1).join('/')))
  })

  /**
   * What is shown as wrong: while a name is being typed at the end of the path and still matches suggestions, it is
   * not marked yet. Going there is still refused until it names a folder.
   */
  protected readonly shownInvalidFrom = computed(() => {
    const from = this.invalidFrom()
    const typingLast =
      this.focused() && from === this.segments().length - 1 && !this.text().endsWith('/')
    return typingLast && this.suggestions().length ? -1 : from
  })

  protected readonly invalidName = computed(() => this.segments()[this.shownInvalidFrom()] ?? '')

  /** The text as typed, extra slashes included, so the layer lines up with the input's own text. */
  protected readonly parts = computed(() => {
    const invalidFrom = this.shownInvalidFrom()
    const last = this.segments().length - 1
    let depth = -1
    return this.text()
      .split('/')
      .map((text): Part => {
        depth += text ? 1 : 0
        const invalid = invalidFrom >= 0 && depth >= invalidFrom
        return {
          text,
          path: this.segments()
            .slice(0, depth + 1)
            .join('/'),
          invalid,
          clickable: !!text && !invalid && depth < last
        }
      })
  })

  /** Folders in the deepest level that exists, narrowed by the level being typed. */
  protected readonly suggestions = computed(() => {
    const segments = this.segments()
    const typing = !this.text().endsWith('/') && segments.length > 0
    const invalidFrom = this.invalidFrom()
    const keep = invalidFrom >= 0 ? invalidFrom : typing ? segments.length - 1 : segments.length
    const parent = segments.slice(0, keep).join('/')
    const word = invalidFrom >= 0 || typing ? (segments[keep] ?? '').toLowerCase() : ''
    return this.library
      .subfolders(parent)
      .filter((f) => !word || baseName(f).toLowerCase().includes(word))
  })

  constructor() {
    // Follow the library when it moves, for example by opening a folder in the list.
    effect(() => {
      const path = this.library.path()
      this.text.set(path)
      this.offset.set(0)
    })
  }

  protected go(path: string) {
    this.text.set(path)
    this.navigate.emit(path)
  }

  protected submit() {
    const path = this.segments().join('/')
    if (this.invalidFrom() < 0 && path !== this.library.path()) {
      this.navigate.emit(path)
    }
  }

  protected picked(event: MatAutocompleteSelectedEvent) {
    this.go(String(event.option.value))
    this.input().nativeElement.blur()
  }
}
