import { Directive, ElementRef, inject, input, output, signal } from '@angular/core'
import { isImageName } from '../library/library.store'

export interface IncomingFile {
  file: File
  /** Folder below the drop target, for files that came from a dropped folder. */
  relDir: string
}

const isImage = (file: File) =>
  file.type.startsWith('image/') || isImageName(file.name) || /\.(heic|heif)$/i.test(file.name)

/** For file pickers: every image type, plus HEIC files, which some systems do not list as images. */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif'

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}

async function walk(entry: FileSystemEntry, dir: string, out: IncomingFile[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    )
    if (isImage(file)) {
      out.push({ file, relDir: dir })
    }
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const sub = dir ? `${dir}/${entry.name}` : entry.name
    // readEntries returns at most 100 entries per call.
    for (let batch = await readEntries(reader); batch.length; batch = await readEntries(reader)) {
      for (const child of batch) {
        await walk(child, sub, out)
      }
    }
  }
}

/** Image files of a drop, including those inside dropped folders. */
export async function filesFromDataTransfer(data: DataTransfer): Promise<IncomingFile[]> {
  const entries = [...data.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null)
  if (entries.length && entries.every((e) => e !== null)) {
    const out: IncomingFile[] = []
    for (const entry of entries) {
      await walk(entry!, '', out)
    }
    return out
  }
  return filesFromList(data.files)
}

export function filesFromList(list: FileList | File[] | null | undefined): IncomingFile[] {
  return [...(list ?? [])].filter(isImage).map((file) => ({ file, relDir: '' }))
}

/** Pasted images get a name, since clipboard images are usually called image.png. */
export function filesFromClipboard(data: DataTransfer | null): IncomingFile[] {
  const files = [...(data?.items ?? [])]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file && isImage(file))
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return files.map((file, i) => {
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') || 'png'
    const name = `pasted-${stamp}${files.length > 1 ? `-${i + 1}` : ''}.${ext}`
    return {
      file: new File([file], name, { type: file.type, lastModified: Date.now() }),
      relDir: ''
    }
  })
}

/**
 * Accepts dropped files and folders. Sets the `drag-over` class while something is dragged over the element.
 * Nested drop targets win: a drop on an inner target does not reach the outer one.
 */
@Directive({
  selector: '[pgFileDrop]',
  host: {
    '[class.drag-over]': 'over()',
    '(dragenter)': 'enter($event)',
    '(dragover)': 'overEvent($event)',
    '(dragleave)': 'leave($event)',
    '(drop)': 'drop($event)'
  }
})
export class FileDrop {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef)
  readonly disabled = input(false, { alias: 'pgFileDropDisabled' })
  readonly pgFileDrop = output<IncomingFile[]>()
  protected readonly over = signal(false)

  private accepts(event: DragEvent) {
    return !this.disabled() && !!event.dataTransfer?.types.includes('Files')
  }

  protected enter(event: DragEvent) {
    if (this.accepts(event)) {
      event.preventDefault()
      event.stopPropagation()
      this.over.set(true)
    }
  }

  protected overEvent(event: DragEvent) {
    if (this.accepts(event)) {
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer!.dropEffect = 'copy'
      this.over.set(true)
    }
  }

  protected leave(event: DragEvent) {
    if (!this.el.nativeElement.contains(event.relatedTarget as Node | null)) {
      this.over.set(false)
    }
  }

  protected async drop(event: DragEvent) {
    if (!this.accepts(event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    this.over.set(false)
    const files = await filesFromDataTransfer(event.dataTransfer!)
    if (files.length) {
      this.pgFileDrop.emit(files)
    }
  }
}
