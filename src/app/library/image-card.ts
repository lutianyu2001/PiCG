import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core'
import { MatIconButton } from '@angular/material/button'
import { MatCheckbox } from '@angular/material/checkbox'
import { MatRipple } from '@angular/material/core'
import { MatIcon } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { LinkService } from '../links/link.service'
import { PAGES_RULE } from '../links/links'
import { LongPress } from '../shared/long-press'
import { ImageFile } from './library.store'

export type CardAction = 'copy' | 'properties' | 'rename' | 'delete'

@Component({
  selector: 'pg-image-card',
  imports: [
    LongPress,
    MatCheckbox,
    MatIcon,
    MatIconButton,
    MatMenuModule,
    MatRipple,
    TranslatePipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card" [class.selected]="selected()" [class.busy]="busy()">
      <button
        class="thumb"
        type="button"
        matRipple
        [attr.aria-label]="
          (selecting() ? 'library.toggle_select' : 'library.view') | t: { name: file().name }
        "
        (pgLongPress)="pick.emit(false)"
        (click)="onClick($event)"
      >
        <img
          alt=""
          loading="lazy"
          decoding="async"
          [src]="failed() ? links.rawUrl(file().path) : links.url(file().path)"
          (error)="onError()"
        />
        @if (notPublished()) {
          <span class="badge">{{ 'library.not_on_pages' | t }}</span>
        } @else if (unreachable()) {
          <span class="badge">{{ 'library.not_public' | t }}</span>
        }
      </button>
      <mat-checkbox
        class="check"
        [checked]="selected()"
        [attr.aria-label]="'library.select' | t: { name: file().name }"
        (change)="pick.emit(false)"
        (click)="$event.stopPropagation()"
      />
      <div class="foot">
        <span class="name" [title]="file().name">{{ file().name }}</span>
        <button matIconButton [attr.aria-label]="'links.copy' | t" (click)="action.emit('copy')">
          <mat-icon svgIcon="content-copy" />
        </button>
        <button matIconButton [matMenuTriggerFor]="menu" [attr.aria-label]="'common.more' | t">
          <mat-icon svgIcon="more-vert" />
        </button>
      </div>
    </div>
    <mat-menu #menu="matMenu">
      <button mat-menu-item (click)="action.emit('copy')">
        <mat-icon svgIcon="content-copy" />{{ 'links.copy' | t }}
      </button>
      <button mat-menu-item (click)="action.emit('properties')">
        <mat-icon svgIcon="info" />{{ 'library.properties' | t }}
      </button>
      <button mat-menu-item (click)="action.emit('rename')">
        <mat-icon svgIcon="edit" />{{ 'library.rename' | t }}
      </button>
      <button mat-menu-item (click)="action.emit('delete')">
        <mat-icon svgIcon="delete" />{{ 'common.delete' | t }}
      </button>
    </mat-menu>
  `,
  styleUrl: './image-card.scss'
})
export class ImageCard {
  protected readonly links = inject(LinkService)

  readonly file = input.required<ImageFile>()
  readonly selected = input(false)
  readonly selecting = input(false)
  readonly busy = input(false)
  /** true when shift was held, for range selection. */
  readonly pick = output<boolean>()
  readonly view = output<void>()
  readonly action = output<CardAction>()

  protected readonly failed = signal(false)
  protected readonly notPublished = computed(
    () => this.failed() && this.links.rule().id === PAGES_RULE
  )
  /** A bucket's image could not be loaded from its public address either. */
  protected readonly unreachable = signal(false)

  protected onClick(event: MouseEvent) {
    if (this.selecting() || event.shiftKey || event.ctrlKey || event.metaKey) {
      this.pick.emit(event.shiftKey)
    } else {
      this.view.emit()
    }
  }

  protected onError() {
    const path = this.file().path
    if (this.failed() || this.links.url(path) === this.links.rawUrl(path)) {
      this.unreachable.set(this.links.kind() === 'r2')
    }
    this.failed.set(true)
  }
}
