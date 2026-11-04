import { Injectable, signal } from '@angular/core'
import { readJson, writeJson } from '../core/storage'
import { ImageStorage, StorageError } from '../storage/storage'
import {
  ParsedSettings,
  SETTINGS_PATH,
  parseSettingsFile,
  settingsFromTable,
  stringifySettings
} from './settings-file'
import { AppSettings, defaultSettings } from './settings.model'

export type SyncState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'blocked'

export const SYNC_DELAY_MS = 3000

type Leaf = Record<string, unknown>

/** Flattens an object to `a.b.c` paths; arrays count as single values. */
function leaves(value: unknown, prefix = '', into: Leaf = {}): Leaf {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [key, inner] of Object.entries(value)) {
      leaves(inner, prefix ? `${prefix}.${key}` : key, into)
    }
  } else {
    into[prefix] = value
  }
  return into
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.')
  let node = target
  keys.slice(0, -1).forEach((key) => (node = node[key] as Record<string, unknown>))
  node[keys[keys.length - 1]] = structuredClone(value)
}

/** Applies the values that changed between `base` and `mine` on top of `theirs`. */
export function rebase(base: AppSettings, mine: AppSettings, theirs: AppSettings): AppSettings {
  const before = leaves(base)
  const after = leaves(mine)
  const out = structuredClone(theirs) as unknown as Record<string, unknown>
  for (const [path, value] of Object.entries(after)) {
    if (JSON.stringify(before[path]) !== JSON.stringify(value)) {
      setPath(out, path, value)
    }
  }
  return out as unknown as AppSettings
}

interface RemoteState {
  version: string | undefined
  raw: Record<string, unknown>
  /** Settings as they are in the repository, for working out what changed locally. */
  base: AppSettings
}

const cacheKey = (storage: ImageStorage) => `settings.${storage.id}`

/**
 * Settings of the repository or bucket in use. They are cached on the device, read from `.picg/settings.toml` when
 * the storage is opened, and written back a few seconds after each change.
 */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly state = signal<AppSettings>(defaultSettings())
  readonly settings = this.state.asReadonly()
  readonly sync = signal<SyncState>('idle')

  private storage: ImageStorage | null = null
  private remote: RemoteState | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private writing: Promise<void> | null = null
  private blocked = false

  /**
   * Opens the settings of a repository. Returns what was found there, so the caller can look for settings of
   * earlier versions when there is no file.
   */
  async open(storage: ImageStorage): Promise<'file' | 'none'> {
    await this.flush()
    this.storage = storage
    this.remote = null
    this.blocked = false
    this.sync.set('idle')
    const cached = readJson<unknown>(cacheKey(storage), null)
    if (cached && typeof cached === 'object') {
      this.state.set(settingsFromTable(toFileShape(cached as AppSettings)))
    }

    const file = await storage.readText(SETTINGS_PATH)
    if (this.storage !== storage) {
      return 'none'
    }
    if (!file) {
      this.remote = { version: undefined, raw: {}, base: this.state() }
      return 'none'
    }
    let parsed: ParsedSettings
    try {
      parsed = parseSettingsFile(file.text)
    } catch {
      // A damaged file is replaced on the next change instead of blocking the app.
      this.remote = { version: file.version, raw: {}, base: this.state() }
      this.sync.set('error')
      return 'file'
    }
    this.remote = { version: file.version, raw: parsed.raw, base: parsed.settings }
    this.state.set(parsed.settings)
    writeJson(cacheKey(storage), parsed.settings)
    return 'file'
  }

  /** Uses settings from elsewhere (such as an import) without writing them to the repository. */
  replaceLocal(settings: AppSettings) {
    this.state.set(settings)
    if (this.storage) {
      writeJson(cacheKey(this.storage), settings)
    }
  }

  /** While blocked, changes stay on the device and nothing is written to the repository. */
  setBlocked(blocked: boolean) {
    this.blocked = blocked
    clearTimeout(this.timer)
    this.sync.set(blocked ? 'blocked' : 'idle')
  }

  update(change: (draft: AppSettings) => void) {
    const draft = structuredClone(this.state())
    change(draft)
    this.state.set(draft)
    if (this.storage) {
      writeJson(cacheKey(this.storage), draft)
    }
    this.schedule()
  }

  /** Schedules a write, for example right after settings imported from an earlier version are accepted. */
  schedule() {
    if (this.blocked || !this.storage) {
      return
    }
    clearTimeout(this.timer)
    this.sync.set('pending')
    this.timer = setTimeout(() => void this.write(), SYNC_DELAY_MS)
  }

  /** Writes a pending change now. */
  async flush() {
    if (this.sync() === 'pending') {
      clearTimeout(this.timer)
      await this.write()
    }
    await this.writing
  }

  /** Content of the settings file for the current settings, keeping unknown keys of the file. */
  fileText() {
    return stringifySettings(this.state(), this.remote?.raw)
  }

  /** Records that the file was written by someone else, such as the legacy conversion commit. */
  async reloadVersion() {
    if (!this.storage) {
      return
    }
    const file = await this.storage.readText(SETTINGS_PATH)
    this.remote = { version: file?.version, raw: this.remote?.raw ?? {}, base: this.state() }
  }

  private async write() {
    if (this.writing) {
      await this.writing
    }
    const storage = this.storage
    if (!storage || this.blocked) {
      return
    }
    this.sync.set('saving')
    this.writing = this.writeTo(storage).finally(() => (this.writing = null))
    await this.writing
  }

  private async writeTo(storage: ImageStorage) {
    const snapshot = this.state()
    try {
      const version = await storage.writeText(
        SETTINGS_PATH,
        this.fileText(),
        this.remote?.version,
        'Update settings'
      )
      this.remote = { version, raw: this.remote?.raw ?? {}, base: snapshot }
    } catch (err) {
      if (!(err instanceof StorageError) || !['conflict', 'validation'].includes(err.kind)) {
        this.sync.set('error')
        return
      }
      try {
        await this.retryOnTheirs(storage, snapshot)
      } catch {
        this.sync.set('error')
        return
      }
    }
    if (this.storage === storage) {
      this.sync.set(this.state() === snapshot ? 'saved' : 'pending')
      if (this.state() !== snapshot) {
        this.schedule()
      }
    }
  }

  /** The file changed elsewhere: put the local changes on top of it and write once more. */
  private async retryOnTheirs(storage: ImageStorage, snapshot: AppSettings) {
    const file = await storage.readText(SETTINGS_PATH)
    const theirs = file ? parseSettingsFile(file.text) : { settings: defaultSettings(), raw: {} }
    const merged = rebase(this.remote?.base ?? defaultSettings(), snapshot, theirs.settings)
    const text = stringifySettings(merged, theirs.raw)
    const version = await storage.writeText(SETTINGS_PATH, text, file?.version, 'Update settings')
    this.remote = { version, raw: theirs.raw, base: merged }
    if (this.state() === snapshot) {
      this.state.set(merged)
      writeJson(cacheKey(storage), merged)
    }
  }
}

/** Cached settings are stored in the in-app shape; route them through the file reader to validate them. */
function toFileShape(s: AppSettings): Record<string, unknown> {
  return {
    upload: {
      auto_upload: s.upload?.autoUpload,
      subfolder: s.upload?.subfolder,
      custom_subfolder: s.upload?.customSubfolder,
      time_format: s.upload?.timeFormat,
      hash: s.upload?.hash,
      prefix_enabled: s.upload?.prefixEnabled,
      prefix: s.upload?.prefix,
      strip_metadata: s.upload?.stripMetadata
    },
    compress: s.compress,
    watermark: s.watermark,
    link: s.link
  }
}
