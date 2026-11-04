import { CustomTemplate, LinkSettings } from '../settings/settings.model'

export interface LinkTemplate extends CustomTemplate {
  builtIn: boolean
}

export const PAGES_RULE = 'pages'

export const BUILT_IN_RULES: readonly LinkTemplate[] = [
  {
    id: 'github',
    name: 'GitHub',
    template: 'https://github.com/{owner}/{repo}/raw/{branch}/{path}',
    builtIn: true
  },
  { id: PAGES_RULE, name: 'GitHub Pages', template: '{pages}/{path}', builtIn: true },
  {
    id: 'jsdelivr',
    name: 'jsDelivr',
    template: 'https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path}',
    builtIn: true
  },
  {
    id: 'statically',
    name: 'Statically',
    template: 'https://cdn.statically.io/gh/{owner}/{repo}@{branch}/{path}',
    builtIn: true
  },
  {
    id: 'jsdmirror',
    name: 'jsDelivr mirror (China)',
    template: 'https://cdn.jsdmirror.com/gh/{owner}/{repo}@{branch}/{path}',
    builtIn: true
  }
]

export const R2_RULE = 'r2'

/** The rules of a bucket: GitHub's do not apply to it. */
export const R2_RULES: readonly LinkTemplate[] = [
  { id: R2_RULE, name: 'Cloudflare R2', template: '{public}/{path}', builtIn: true }
]

export type StorageKind = 'github' | 'r2'

export const builtInRules = (kind: StorageKind) => (kind === 'r2' ? R2_RULES : BUILT_IN_RULES)

export const BUILT_IN_FORMATS: readonly LinkTemplate[] = [
  { id: 'url', name: 'URL', template: '{url}', builtIn: true },
  { id: 'markdown', name: 'Markdown', template: '![{name}]({url})', builtIn: true },
  { id: 'html', name: 'HTML', template: '<img src="{url}" alt="{name}">', builtIn: true },
  { id: 'bbcode', name: 'BBCode', template: '[img]{url}[/img]', builtIn: true }
]

export const allRules = (link: LinkSettings, kind: StorageKind = 'github'): LinkTemplate[] => [
  ...builtInRules(kind),
  ...link.rules.map((r) => ({ ...r, builtIn: false }))
]

export const allFormats = (link: LinkSettings): LinkTemplate[] => [
  ...BUILT_IN_FORMATS,
  ...link.formats.map((f) => ({ ...f, builtIn: false }))
]

export interface LinkContext {
  kind: StorageKind
  owner: string
  repo: string
  branch: string
  /** GitHub Pages base URL without a trailing slash. */
  pages: string
  bucket: string
  /** Public address of the bucket without a trailing slash. */
  public: string
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all)
}

export function buildUrl(rule: string, ctx: LinkContext, path: string) {
  return fill(rule, {
    owner: ctx.owner,
    repo: ctx.repo,
    branch: encodeURIComponent(ctx.branch),
    pages: ctx.pages.replace(/\/+$/, ''),
    bucket: ctx.bucket,
    public: ctx.public.replace(/\/+$/, ''),
    path: encodePath(path)
  })
}

export function formatLink(format: string, url: string, fileName: string) {
  const name = fileName.replace(/\.[^.]+$/, '')
  return fill(format, { url, name })
}

/** Why a custom rule template cannot be used, or null when it can. */
export function ruleProblem(template: string): 'https' | 'path' | null {
  if (!template.startsWith('https://')) {
    return 'https'
  }
  return template.includes('{path}') ? null : 'path'
}

export function formatProblem(template: string): 'url' | null {
  return template.includes('{url}') ? null : 'url'
}

export function newTemplateId(name: string, taken: readonly string[]) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'custom'
  let id = base
  for (let i = 2; taken.includes(id); i++) {
    id = `${base}-${i}`
  }
  return id
}
