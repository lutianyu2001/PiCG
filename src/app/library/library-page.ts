import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core'
import { MatButton, MatIconButton } from '@angular/material/button'
import { MatRipple } from '@angular/material/core'
import { MatIcon } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { MatProgressBar } from '@angular/material/progress-bar'
import { MatSelectModule } from '@angular/material/select'
import { MatTooltip } from '@angular/material/tooltip'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { errorKey } from '../github/github.client'
import { LinkService } from '../links/link.service'
import { PAGES_RULE } from '../links/links'
import { PagesNotice } from '../pages/pages-notice'
import { SessionStore } from '../session/session.store'
import {
  FileDrop,
  IMAGE_ACCEPT,
  IncomingFile,
  filesFromClipboard,
  filesFromList
} from '../shared/file-intake'
import { CardAction, ImageCard } from './image-card'
import { LibraryActions } from './library-actions'
import { ImageFile, LibraryStore, baseName } from './library.store'
import { PathField } from './path-field'
import { QueuePanel } from './queue-panel'
import { UploadQueueStore } from './upload-queue.store'

@Component({
  selector: 'pg-library-page',
  imports: [
    PathField,
    FileDrop,
    ImageCard,
    MatButton,
    MatIcon,
    MatIconButton,
    MatMenuModule,
    MatProgressBar,
    MatRipple,
    MatSelectModule,
    MatTooltip,
    PagesNotice,
    QueuePanel,
    TranslatePipe
  ],
  templateUrl: './library-page.html',
  styleUrl: './library-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:paste)': 'paste($event)' }
})
export class LibraryPage {
  protected readonly session = inject(SessionStore)
  protected readonly library = inject(LibraryStore)
  protected readonly queue = inject(UploadQueueStore)
  protected readonly actions = inject(LibraryActions)
  private readonly links = inject(LinkService)

  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker')

  protected readonly selected = signal<ReadonlySet<string>>(new Set())
  private anchor: string | null = null

  protected readonly crumbs = computed(() => {
    const parts = this.library.path().split('/').filter(Boolean)
    return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))
  })
  protected readonly selecting = computed(() => this.selected().size > 0)
  protected readonly selectedFiles = computed(() =>
    this.library.images().filter((f) => this.selected().has(f.path))
  )
  protected readonly pagesRule = computed(() => this.links.rule().id === PAGES_RULE)
  protected readonly errorKey = computed(() =>
    this.library.error() ? errorKey(this.library.error()) : ''
  )
  protected readonly empty = computed(
    () => !this.library.loading() && !this.library.folders().length && !this.library.images().length
  )
  protected readonly baseName = baseName
  protected readonly accept = IMAGE_ACCEPT

  constructor() {
    // Selection belongs to one folder.
    effect(() => {
      this.library.path()
      this.selected.set(new Set())
      this.anchor = null
    })
  }

  protected switchRepo(name: string) {
    this.session.switchTo(name)
  }

  protected open(path: string) {
    this.library.go(path)
  }

  protected up() {
    const crumbs = this.crumbs()
    this.library.go(crumbs.length > 1 ? crumbs[crumbs.length - 2].path : '')
  }

  protected add(files: IncomingFile[], target = this.library.path()) {
    if (files.length) {
      this.queue.add(files, target)
    }
  }

  protected pick() {
    this.picker().nativeElement.click()
  }

  protected picked(input: HTMLInputElement) {
    this.add(filesFromList(input.files))
    input.value = ''
  }

  protected paste(event: ClipboardEvent) {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, [contenteditable]')) {
      return
    }
    const files = filesFromClipboard(event.clipboardData)
    if (files.length) {
      event.preventDefault()
      this.add(files)
    }
  }

  protected toggle(file: ImageFile, range: boolean) {
    const images = this.library.images()
    const next = new Set(this.selected())
    if (range && this.anchor) {
      const from = images.findIndex((f) => f.path === this.anchor)
      const to = images.indexOf(file)
      if (from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from]
        images.slice(a, b + 1).forEach((f) => next.add(f.path))
        this.selected.set(next)
        return
      }
    }
    if (next.has(file.path)) {
      next.delete(file.path)
    } else {
      next.add(file.path)
    }
    this.anchor = file.path
    this.selected.set(next)
  }

  protected selectAll() {
    this.selected.set(new Set(this.library.images().map((f) => f.path)))
  }

  protected clearSelection() {
    this.selected.set(new Set())
  }

  protected copySelected() {
    void this.links.copy(this.selectedFiles().map((f) => f.path))
  }

  protected async deleteSelected() {
    if (await this.actions.delete(this.selectedFiles())) {
      this.clearSelection()
    }
  }

  protected act(file: ImageFile, action: CardAction) {
    switch (action) {
      case 'copy':
        void this.links.copy([file.path])
        break
      case 'properties':
        this.actions.properties(file)
        break
      case 'rename':
        void this.actions.rename(file)
        break
      case 'delete':
        void this.actions.delete([file])
        break
    }
  }
}
