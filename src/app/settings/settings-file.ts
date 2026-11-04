import { parse, stringify } from 'smol-toml'
import {
  AppSettings,
  CustomTemplate,
  ENCODERS,
  POSITIONS,
  SUBFOLDERS,
  clampNumber,
  defaultSettings,
  oneOf
} from './settings.model'

export const SETTINGS_PATH = '.picg/settings.toml'
export const FILE_VERSION = 1

type Table = Record<string, unknown>

const isTable = (value: unknown): value is Table =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)

const str = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

function templates(value: unknown): CustomTemplate[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter(isTable)
    .map((item) => ({
      id: str(item['id'], ''),
      name: str(item['name'], ''),
      template: str(item['template'], '')
    }))
    .filter((item) => item.id && item.template)
}

/** Builds settings from a parsed file, using defaults for anything missing or of the wrong type. */
export function settingsFromTable(table: Table): AppSettings {
  const d = defaultSettings()
  const upload = isTable(table['upload']) ? table['upload'] : {}
  const compress = isTable(table['compress']) ? table['compress'] : {}
  const watermark = isTable(table['watermark']) ? table['watermark'] : {}
  const link = isTable(table['link']) ? table['link'] : {}
  return {
    upload: {
      autoUpload: bool(upload['auto_upload'], d.upload.autoUpload),
      subfolder: oneOf(upload['subfolder'], SUBFOLDERS, d.upload.subfolder),
      customSubfolder: str(upload['custom_subfolder'], d.upload.customSubfolder),
      timeFormat: str(upload['time_format'], d.upload.timeFormat) || d.upload.timeFormat,
      hash: bool(upload['hash'], d.upload.hash),
      prefixEnabled: bool(upload['prefix_enabled'], d.upload.prefixEnabled),
      prefix: str(upload['prefix'], d.upload.prefix),
      stripMetadata: bool(upload['strip_metadata'], d.upload.stripMetadata)
    },
    compress: {
      enabled: bool(compress['enabled'], d.compress.enabled),
      encoder: oneOf(compress['encoder'], ENCODERS, d.compress.encoder),
      quality: Math.round(clampNumber(compress['quality'], 1, 100, d.compress.quality))
    },
    watermark: {
      enabled: bool(watermark['enabled'], d.watermark.enabled),
      text: str(watermark['text'], d.watermark.text),
      size: clampNumber(watermark['size'], 4, 400, d.watermark.size),
      color: /^#[0-9a-f]{6}$/i.test(str(watermark['color'], ''))
        ? str(watermark['color'], '')
        : d.watermark.color,
      opacity: clampNumber(watermark['opacity'], 0, 1, d.watermark.opacity),
      position: oneOf(watermark['position'], POSITIONS, d.watermark.position)
    },
    link: {
      rule: str(link['rule'], d.link.rule) || d.link.rule,
      format: str(link['format'], d.link.format) || d.link.format,
      rules: templates(link['rules']),
      formats: templates(link['formats'])
    }
  }
}

export function settingsToTable(s: AppSettings): Table {
  return {
    version: FILE_VERSION,
    upload: {
      auto_upload: s.upload.autoUpload,
      subfolder: s.upload.subfolder,
      custom_subfolder: s.upload.customSubfolder,
      time_format: s.upload.timeFormat,
      hash: s.upload.hash,
      prefix_enabled: s.upload.prefixEnabled,
      prefix: s.upload.prefix,
      strip_metadata: s.upload.stripMetadata
    },
    compress: { ...s.compress },
    watermark: { ...s.watermark },
    link: {
      rule: s.link.rule,
      format: s.link.format,
      rules: s.link.rules.map((r) => ({ ...r })),
      formats: s.link.formats.map((f) => ({ ...f }))
    }
  }
}

/** Puts `over` on top of `base` table by table, so keys PiCG does not know survive a rewrite. */
function overlay(base: Table, over: Table): Table {
  const out: Table = { ...base }
  for (const [key, value] of Object.entries(over)) {
    out[key] = isTable(value) && isTable(base[key]) ? overlay(base[key] as Table, value) : value
  }
  return out
}

export interface ParsedSettings {
  settings: AppSettings
  /** The file as parsed, kept to preserve unknown keys. */
  raw: Table
}

export function parseSettingsFile(text: string): ParsedSettings {
  const raw = parse(text) as Table
  return { settings: settingsFromTable(raw), raw }
}

export function stringifySettings(settings: AppSettings, raw: Table = {}): string {
  const header =
    '# PiCG settings. PiCG rewrites this file when settings change; comments are not kept.\n'
  return header + stringify(overlay(raw, settingsToTable(settings))) + '\n'
}
