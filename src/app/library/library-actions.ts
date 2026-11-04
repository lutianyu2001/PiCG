import { Injectable, inject, signal } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { firstValueFrom } from 'rxjs'
import { Notify } from '../core/notify.service'
import { errorKey } from '../storage/storage'
import { ImageStorage } from '../storage/storage'
import { StorageService } from '../storage/storage.service'
import { ConfirmData, ConfirmDialog } from '../shared/confirm-dialog'
import { PromptData, PromptDialog } from '../shared/prompt-dialog'
import { ImportDialog } from './import-dialog'
import { ImageFile, LibraryStore, isImageName, joinPath, parentOf } from './library.store'
import { cleanFolderPath, cleanSegment } from './naming'
import { PreviewDialog } from './preview-dialog'
import { PropertiesDialog } from './properties-dialog'

/** What the library page can do to files, each with its dialogs and messages. */
@Injectable({ providedIn: 'root' })
export class LibraryActions {
  private readonly storage = inject(StorageService)
  private readonly library = inject(LibraryStore)
  private readonly dialog = inject(MatDialog)
  private readonly notify = inject(Notify)

  /** Paths being changed right now. */
  readonly busy = signal<ReadonlySet<string>>(new Set())

  private mark(paths: string[], on: boolean) {
    this.busy.update((set) => {
      const next = new Set(set)
      paths.forEach((p) => (on ? next.add(p) : next.delete(p)))
      return next
    })
  }

  private async run(
    paths: string[],
    change: (storage: ImageStorage) => Promise<void>,
    doneKey: string,
    params = {}
  ) {
    const storage = this.storage.current()
    if (!storage) {
      return false
    }
    this.mark(paths, true)
    try {
      await change(storage)
      await this.library.reload()
      this.notify.info(doneKey, params)
      return true
    } catch (err) {
      this.notify.error(errorKey(err))
      return false
    } finally {
      this.mark(paths, false)
    }
  }

  view(file: ImageFile, files: ImageFile[]) {
    this.dialog.open(PreviewDialog, {
      data: { files, index: Math.max(0, files.indexOf(file)) },
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'pg-preview-panel'
    })
  }

  properties(file: ImageFile) {
    this.dialog.open(PropertiesDialog, { data: file, width: '34rem' })
  }

  async rename(file: ImageFile) {
    const data: PromptData = {
      title: 'library.rename_title',
      label: 'library.new_name',
      value: file.name,
      hint: 'library.rename_hint',
      confirm: 'library.rename',
      validate: (value) => {
        const name = cleanSegment(value)
        if (!name || !isImageName(name)) {
          return 'library.name_needs_extension'
        }
        if (name !== file.name && this.library.exists(joinPath(file.dir, name))) {
          return 'library.name_taken'
        }
        return null
      }
    }
    const value = await firstValueFrom(this.dialog.open(PromptDialog, { data }).afterClosed())
    const name = value ? cleanSegment(value) : ''
    if (!name || name === file.name) {
      return
    }
    await this.run(
      [file.path],
      (storage) => storage.rename(file, joinPath(file.dir, name), 'Rename image'),
      'library.renamed'
    )
  }

  async delete(files: ImageFile[]) {
    if (!files.length) {
      return false
    }
    const data: ConfirmData = {
      title: files.length === 1 ? 'library.delete_one_title' : 'library.delete_many_title',
      message: 'library.delete_message',
      params: { name: files[0].name, count: files.length },
      confirm: 'common.delete',
      danger: true
    }
    if (!(await firstValueFrom(this.dialog.open(ConfirmDialog, { data }).afterClosed()))) {
      return false
    }
    return this.run(
      files.map((f) => f.path),
      (storage) =>
        storage.remove(
          files,
          files.length === 1 ? 'Delete image' : `Delete ${files.length} images`
        ),
      files.length === 1 ? 'library.deleted_one' : 'library.deleted_many',
      { count: files.length }
    )
  }

  /** Asks for a folder name and opens the new, still empty folder. */
  async newFolder() {
    const here = this.library.path()
    const data: PromptData = {
      title: 'library.new_folder',
      label: 'library.folder_name',
      hint: 'library.folder_hint',
      confirm: 'common.create',
      validate: (value) => {
        const path = cleanFolderPath(value)
        if (!path) {
          return 'library.folder_invalid'
        }
        return this.library.exists(joinPath(here, path)) ? 'library.name_taken' : null
      }
    }
    const value = await firstValueFrom(this.dialog.open(PromptDialog, { data }).afterClosed())
    const path = value ? cleanFolderPath(value) : ''
    if (!path) {
      return
    }
    const full = joinPath(here, path)
    let walk = full
    while (walk && walk !== here) {
      this.library.addLocalFolder(walk)
      walk = parentOf(walk)
    }
    this.library.go(full)
  }

  importFromRepo() {
    this.dialog.open(ImportDialog, { width: '32rem', disableClose: true })
  }
}
