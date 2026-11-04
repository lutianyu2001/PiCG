import { describe, expect, it } from 'vitest'
import { legacyKeystream, legacyReveal } from './legacy-reveal'
import {
  decodeLegacyText,
  translateLegacyBrowser,
  translateLegacySettings
} from './legacy-translate'

/** Builds a value in the old `obs1:` form, following the description of the format. */
function legacyObscure(plain: string, iv: Uint8Array) {
  const next = legacyKeystream(iv)
  const body = new TextEncoder().encode(plain).map((b) => b ^ next())
  return 'obs1:' + btoa(String.fromCharCode(...iv, ...body))
}

describe('legacyReveal', () => {
  it('recovers obfuscated tokens', () => {
    const token = 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz'
    const value = legacyObscure(token, Uint8Array.from([1, 2, 3, 4, 250, 251, 252, 253]))
    expect(value).not.toContain('github_pat')
    expect(legacyReveal(value)).toBe(token)
  })

  it('returns plain values as they are and damaged ones as empty', () => {
    expect(legacyReveal('github_pat_plain')).toBe('github_pat_plain')
    expect(legacyReveal('obs1:!!!')).toBe('')
    expect(legacyReveal(undefined)).toBe('')
  })
})

describe('translateLegacySettings', () => {
  const old = {
    imageName: { enableHash: false, addPrefix: { enable: true, prefix: 'blog-' } },
    compress: { enable: true, encoder: 'mozJPEG' },
    imageLinkType: {
      selected: 'My CDN',
      presetList: {
        GitHub: {
          id: 'a',
          name: 'GitHub',
          rule: 'https://github.com/{{owner}}/{{repo}}/raw/{{branch}}/{{path}}'
        },
        'My CDN': { id: 'b', name: 'My CDN', rule: 'https://img.example.com/{{repo}}/{{path}}' }
      }
    },
    imageLinkFormat: {
      enable: true,
      selected: 'Wiki',
      presetList: [
        { name: 'Markdown', format: '![imageName](imageLink)' },
        { name: 'Wiki', format: '[[File:imageLink|imageName]]' }
      ]
    },
    watermark: {
      enable: true,
      text: 'Me',
      fontSize: 40,
      position: 'leftTop',
      textColor: '#FF0000',
      opacity: 0.3
    }
  }

  it('maps every field to the new model', () => {
    const s = translateLegacySettings(old)
    expect(s.upload).toMatchObject({ hash: false, prefixEnabled: true, prefix: 'blog-' })
    expect(s.compress).toMatchObject({ enabled: true, encoder: 'mozjpeg' })
    expect(s.watermark).toEqual({
      enabled: true,
      text: 'Me',
      size: 40,
      color: '#ff0000',
      opacity: 0.3,
      position: 'top-left'
    })
    expect(s.link.rules).toEqual([
      { id: 'my-cdn', name: 'My CDN', template: 'https://img.example.com/{repo}/{path}' }
    ])
    expect(s.link.rule).toBe('my-cdn')
    expect(s.link.formats).toEqual([
      { id: 'wiki', name: 'Wiki', template: '[[File:{url}|{name}]]' }
    ])
    expect(s.link.format).toBe('wiki')
  })

  it('maps built-in names and a disabled format', () => {
    const s = translateLegacySettings({
      imageLinkType: { selected: 'ChinaJsDelivr' },
      imageLinkFormat: { enable: false, selected: 'HTML' }
    })
    expect(s.link.rule).toBe('jsdmirror')
    expect(s.link.format).toBe('url')
  })

  it('keeps defaults for garbage', () => {
    const s = translateLegacySettings('not an object')
    expect(s.compress.encoder).toBe('webp')
    expect(
      translateLegacySettings({ watermark: { opacity: 'x', position: 'nowhere' } }).watermark
        .position
    ).toBe('bottom-right')
  })
})

describe('translateLegacyBrowser', () => {
  it('reads token, repositories and appearance', () => {
    const token = 'github_pat_abc'
    const local: Record<string, string> = {
      PICG_CONFIG: JSON.stringify({
        token: legacyObscure(token, new Uint8Array(8)),
        repo: 'pics',
        repoList: [{ name: 'pics', branch: 'main' }, { name: 'more' }]
      })
    }
    const session: Record<string, string> = {
      PICG_GLOBAL_SETTINGS: JSON.stringify({ language: 'zh-TW', theme: 'dark', folded: true })
    }
    const data = translateLegacyBrowser(
      (k) => local[k] ?? null,
      (k) => session[k] ?? null,
      legacyReveal
    )
    expect(data).toMatchObject({
      token,
      repoNames: ['pics', 'more'],
      settings: null,
      language: 'zh-TW',
      theme: 'dark',
      navCollapsed: true
    })
  })

  it('returns null when nothing is stored', () => {
    expect(
      translateLegacyBrowser(
        () => null,
        () => null,
        legacyReveal
      )
    ).toBeNull()
  })
})

describe('PicX formats', () => {
  it('maps newer PicX values', () => {
    const s = translateLegacySettings({
      imageName: {
        enableHash: true,
        enableTimestamp: false,
        addPrefix: { enable: false, prefix: '' }
      },
      compress: { enable: true, encoder: 'original' },
      management: { sort: 'nameAsc' },
      deploy: { customDomain: '' },
      watermark: {
        enable: true,
        text: 'PicX',
        fontSize: 50,
        position: 'fullScreen',
        textColor: '#FFFFFF',
        opacity: 0.5,
        rotate: -20,
        gap: 80
      },
      imageLinkType: {
        selected: 'Mine',
        presetList: {
          GitHub: {
            id: 'x',
            name: 'GitHub',
            rule: 'https://github.com/{{owner}}/{{repo}}/raw/{{branch}}/{{path}}'
          },
          Mine: { id: 'y', name: 'Mine', rule: 'https://cdn.example.com/{{path}}', editable: true }
        }
      }
    })
    expect(s.compress.enabled).toBe(false)
    expect(s.watermark.position).toBe('center')
    expect(s.link.rule).toBe('mine')
    expect(s.link.rules).toEqual([
      { id: 'mine', name: 'Mine', template: 'https://cdn.example.com/{path}' }
    ])
  })

  it('reads PicX browser keys of both prefixes, newest first', () => {
    const local: Record<string, string> = {
      PICX_CONFIG: JSON.stringify({ token: 'github_pat_old', repo: 'old', branch: 'main' }),
      PICX_IH_CONFIG: JSON.stringify({ token: 'github_pat_new', repo: 'pics', branch: 'images' }),
      PICX_IH_SETTINGS: JSON.stringify({ compress: { enable: true, encoder: 'avif' } })
    }
    const session: Record<string, string> = {
      PICX_IH_GLOBAL_SETTINGS: JSON.stringify({ language: 'en', theme: 'light', folded: false })
    }
    const data = translateLegacyBrowser(
      (k) => local[k] ?? null,
      (k) => session[k] ?? null,
      legacyReveal
    )
    expect(data?.token).toBe('github_pat_new')
    expect(data?.repoNames).toEqual(['pics@images'])
    expect(data?.settings?.compress.encoder).toBe('avif')
    expect(data?.theme).toBe('light')
  })

  it('falls back to Latin-1 for old settings files', () => {
    expect(decodeLegacyText(new TextEncoder().encode('© PicG'))).toBe('© PicG')
    expect(decodeLegacyText(Uint8Array.from([0xa9, 0x20, 0x50]))).toBe('© P')
  })
})
