import { Injectable, Pipe, PipeTransform, computed, inject } from '@angular/core'
import { AppearanceStore, Language } from '../appearance.store'
import en from './locales/en.json'
import ja from './locales/ja.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'

type Tree = { [key: string]: string | Tree }
export type Params = Record<string, string | number>

function flatten(tree: Tree, prefix = '', into: Record<string, string> = {}) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      into[path] = value
    } else {
      flatten(value, path, into)
    }
  }
  return into
}

const DICTIONARIES: Record<Language, Record<string, string>> = {
  en: flatten(en),
  'zh-CN': flatten(zhCN),
  'zh-TW': flatten(zhTW),
  ja: flatten(ja)
}

/** Replaces `{name}` placeholders with the given values. */
export function interpolate(text: string, params?: Params) {
  return params ? text.replace(/\{(\w+)\}/g, (all, name) => String(params[name] ?? all)) : text
}

@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly appearance = inject(AppearanceStore)
  private readonly dictionary = computed(() => DICTIONARIES[this.appearance.language()])

  readonly language = this.appearance.language

  /** Text for a key in the current language, falling back to English and then to the key itself. */
  t(key: string, params?: Params): string {
    return interpolate(this.dictionary()[key] ?? DICTIONARIES.en[key] ?? key, params)
  }
}

/** `{{ 'key' | t }}` or `{{ 'key' | t: { name: value } }}`. Impure so it follows language changes. */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18n)

  transform(key: string, params?: Params): string {
    return this.i18n.t(key, params)
  }
}
