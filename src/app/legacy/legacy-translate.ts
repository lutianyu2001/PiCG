import { BUILT_IN_FORMATS, BUILT_IN_RULES, newTemplateId } from '../links/links'
import {
  AppSettings,
  CustomTemplate,
  Encoder,
  WatermarkPosition,
  clampNumber,
  defaultSettings
} from '../settings/settings.model'

type Obj = Record<string, unknown>

const obj = (value: unknown): Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Obj) : {}
const str = (value: unknown) => (typeof value === 'string' ? value : undefined)
const bool = (value: unknown) => (typeof value === 'boolean' ? value : undefined)

const RULE_IDS: Record<string, string> = {
  GitHub: 'github',
  'GitHub Pages': 'pages',
  jsDelivr: 'jsdelivr',
  Statically: 'statically',
  ChinaJsDelivr: 'jsdmirror'
}
const FORMAT_IDS: Record<string, string> = { Markdown: 'markdown', HTML: 'html', BBCode: 'bbcode' }
const ENCODERS: Record<string, Encoder> = { webP: 'webp', avif: 'avif', mozJPEG: 'mozjpeg' }
/** Encoders of newer PicX versions that keep the original format; PiCG then does not re-encode. */
const KEEP_FORMAT_ENCODERS = ['original', 'png']
const POSITIONS: Record<string, WatermarkPosition> = {
  leftTop: 'top-left',
  rightTop: 'top-right',
  leftBottom: 'bottom-left',
  rightBottom: 'bottom-right',
  // PicX can tile the text over the whole image; PiCG has one mark, so it goes in the middle.
  fullScreen: 'center'
}

const ruleTemplate = (rule: string) => rule.replace(/\{\{(owner|repo|branch|path)\}\}/g, '{$1}')
const formatTemplate = (format: string) =>
  format.replaceAll('imageLink', '{url}').replaceAll('imageName', '{name}')

/**
 * Translates the settings model of PicX and of earlier PiCG versions (stored as JSON in `.settings` and in browser
 * storage) into PiCG settings. Anything missing, malformed or unknown keeps its default.
 */
export function translateLegacySettings(input: unknown): AppSettings {
  const s = defaultSettings()
  const old = obj(input)

  const name = obj(old['imageName'])
  const prefix = obj(name['addPrefix'])
  s.upload.hash = bool(name['enableHash']) ?? s.upload.hash
  s.upload.prefixEnabled = bool(prefix['enable']) ?? s.upload.prefixEnabled
  s.upload.prefix = str(prefix['prefix']) ?? s.upload.prefix

  const compress = obj(old['compress'])
  s.compress.enabled = bool(compress['enable']) ?? s.compress.enabled
  const encoder = str(compress['encoder']) ?? ''
  s.compress.encoder = ENCODERS[encoder] ?? s.compress.encoder
  if (KEEP_FORMAT_ENCODERS.includes(encoder)) {
    s.compress.enabled = false
  }

  const mark = obj(old['watermark'])
  s.watermark.enabled = bool(mark['enable']) ?? s.watermark.enabled
  s.watermark.text = str(mark['text']) ?? s.watermark.text
  s.watermark.size = clampNumber(mark['fontSize'], 4, 400, s.watermark.size)
  const color = str(mark['textColor'])
  if (color && /^#[0-9a-f]{6}$/i.test(color)) {
    s.watermark.color = color.toLowerCase()
  }
  s.watermark.opacity = clampNumber(mark['opacity'], 0, 1, s.watermark.opacity)
  s.watermark.position = POSITIONS[str(mark['position']) ?? ''] ?? s.watermark.position

  // Link rules: the selected one by name, custom ones from the preset map.
  const linkType = obj(old['imageLinkType'])
  const builtInRuleNames = new Set(Object.keys(RULE_IDS))
  const taken: string[] = BUILT_IN_RULES.map((r) => r.id)
  const customRules: CustomTemplate[] = []
  const ruleIdByName: Record<string, string> = { ...RULE_IDS }
  for (const item of Object.values(obj(linkType['presetList']))) {
    const rule = obj(item)
    const ruleName = str(rule['name'])
    const template = str(rule['rule'])
    if (!ruleName || !template || builtInRuleNames.has(ruleName)) {
      continue
    }
    const id = newTemplateId(ruleName, taken)
    taken.push(id)
    ruleIdByName[ruleName] = id
    customRules.push({ id, name: ruleName, template: ruleTemplate(template) })
  }
  s.link.rules = customRules
  s.link.rule = ruleIdByName[str(linkType['selected']) ?? ''] ?? s.link.rule

  // Link formats: off means the bare URL.
  const linkFormat = obj(old['imageLinkFormat'])
  const builtInFormatNames = new Set(Object.keys(FORMAT_IDS))
  const formatTaken: string[] = BUILT_IN_FORMATS.map((f) => f.id)
  const customFormats: CustomTemplate[] = []
  const formatIdByName: Record<string, string> = { ...FORMAT_IDS }
  const presets = Array.isArray(linkFormat['presetList']) ? linkFormat['presetList'] : []
  for (const item of presets) {
    const format = obj(item)
    const formatName = str(format['name'])
    const template = str(format['format'])
    if (!formatName || !template || builtInFormatNames.has(formatName)) {
      continue
    }
    const id = newTemplateId(formatName, formatTaken)
    formatTaken.push(id)
    formatIdByName[formatName] = id
    customFormats.push({ id, name: formatName, template: formatTemplate(template) })
  }
  s.link.formats = customFormats
  s.link.format =
    bool(linkFormat['enable']) === true
      ? (formatIdByName[str(linkFormat['selected']) ?? ''] ?? 'url')
      : 'url'

  return s
}

export interface LegacyBrowserData {
  token: string
  /** Entries for the repository field: `name`, or `name@branch` when a branch was configured. */
  repoNames: string[]
  settings: AppSettings | null
  language: string | null
  theme: string | null
  navCollapsed: boolean | null
}

/** Key prefixes of earlier versions, most recent first: PiCG, PicX from v3.1.0, PicX up to v3.0.x. */
export const LEGACY_PREFIXES = ['PICG_', 'PICX_IH_', 'PICX_'] as const

/**
 * Reads what PicX or an earlier PiCG kept in browser storage. Browser storage is per site, so PicX data is only
 * there when PiCG is served from the same address PicX was. Returns null when there is nothing.
 */
export function translateLegacyBrowser(
  local: (key: string) => string | null,
  session: (key: string) => string | null,
  reveal: (value: unknown) => string
): LegacyBrowserData | null {
  const parse = (raw: string | null): Obj | null => {
    if (raw === null) {
      return null
    }
    try {
      return obj(JSON.parse(raw))
    } catch {
      return {}
    }
  }
  /** The value of the most recent version that has one. */
  const first = (read: (key: string) => string | null, name: string) => {
    for (const prefix of LEGACY_PREFIXES) {
      const value = parse(read(prefix + name))
      if (value) {
        return { value, prefix }
      }
    }
    return null
  }
  const config = first(local, 'CONFIG')
  const auth = first(local, 'AUTHORIZATION')
  const settings = first(local, 'SETTINGS')
  const global = first(session, 'GLOBAL_SETTINGS')
  const management = LEGACY_PREFIXES.some((p) => local(p + 'MANAGEMENT') !== null)
  if (!config && !auth && !settings && !global && !management) {
    return null
  }

  const names: string[] = []
  const add = (entry: string) => {
    if (entry && !names.some((n) => n.split('@')[0] === entry.split('@')[0])) {
      names.push(entry)
    }
  }
  const c = config?.value
  const repoList = Array.isArray(c?.['repoList']) ? (c['repoList'] as unknown[]) : []
  for (const item of repoList) {
    add(str(obj(item)['name']) ?? '')
  }
  const single = str(c?.['repo'])
  if (single) {
    // PicX works on one configured branch, which may not be the default; earlier PiCG always used the default.
    const branch = config?.prefix === 'PICG_' ? undefined : str(c?.['branch'])
    add(branch ? `${single}@${branch}` : single)
  }

  const a = auth?.value
  return {
    token: reveal(c?.['token']) || reveal(a?.['manualToken']) || reveal(a?.['token']),
    repoNames: names,
    settings: settings ? translateLegacySettings(settings.value) : null,
    language: str(global?.value['language']) ?? null,
    theme: str(global?.value['theme']) ?? null,
    navCollapsed: bool(global?.value['folded']) ?? null
  }
}

/** Text of an old settings file: UTF-8, or Latin-1 for files PicX up to v3.0.x encoded without UTF-8. */
export function decodeLegacyText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return String.fromCharCode(...bytes)
  }
}

/** Keys removed after a conversion. PicX's own keys are left alone: they belong to PicX. */
export const LEGACY_LOCAL_KEYS = [
  'PICG_CONFIG',
  'PICG_AUTHORIZATION',
  'PICG_SETTINGS',
  'PICG_MANAGEMENT'
] as const
export const LEGACY_SESSION_KEYS = ['PICG_GLOBAL_SETTINGS'] as const
export const LEGACY_REPO_SETTINGS = '.settings'
export const LEGACY_REPO_DEPLOY = '.deploy'
