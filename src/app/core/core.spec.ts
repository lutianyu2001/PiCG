import { describe, expect, it } from 'vitest'
import { finalName, cleanFolderPath, splitName, timeFolder } from '../library/naming'
import { buildUrl, formatLink, newTemplateId, ruleProblem } from '../links/links'
import { normalizeDomain } from '../pages/pages.service'
import { formatRepoSpecs, isBranchName, parseRepoSpecs } from '../session/token-check'
import { browserLanguage } from './appearance.store'
import { interpolate } from './i18n/i18n.service'
import { deobfuscate, obfuscate } from './obfuscate'

describe('obfuscate', () => {
  it('round-trips and hides the token', () => {
    const token = 'github_pat_11AAAA_secret'
    const stored = obfuscate(token)
    expect(stored).not.toContain('secret')
    expect(deobfuscate(stored)).toBe(token)
    expect(deobfuscate('nonsense')).toBe('')
  })
})

describe('naming', () => {
  it('builds final names', () => {
    expect(
      finalName({ base: 'my photo', extension: 'webp', prefix: 'blog-', hash: '1a2b3c4d' })
    ).toBe('blog-my-photo.1a2b3c4d.webp')
    expect(finalName({ base: '', extension: 'png', prefix: '', hash: '' })).toBe('image.png')
  })

  it('cleans folder paths', () => {
    expect(cleanFolderPath(' /a b/../.hidden/c?/ ')).toBe('a-b/hidden/c')
  })

  it('splits names', () => {
    expect(splitName('Screen Shot.PNG')).toEqual({ base: 'Screen-Shot', extension: 'png' })
  })

  it('formats time folders', () => {
    expect(timeFolder('yyyy/MM', new Date(2026, 10, 3))).toBe('2026/11')
    expect(timeFolder('jjj', new Date())).toBe('')
  })
})

describe('links', () => {
  const ctx = { owner: 'me', repo: 'pics', branch: 'main', pages: 'https://img.example.com/' }

  it('fills rule templates and encodes paths', () => {
    expect(
      buildUrl('https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path}', ctx, 'a b/c#.png')
    ).toBe('https://cdn.jsdelivr.net/gh/me/pics@main/a%20b/c%23.png')
    expect(buildUrl('{pages}/{path}', ctx, 'x.png')).toBe('https://img.example.com/x.png')
  })

  it('formats links', () => {
    expect(formatLink('![{name}]({url})', 'https://x/y.png', 'y.png')).toBe('![y](https://x/y.png)')
  })

  it('validates templates and makes ids', () => {
    expect(ruleProblem('http://x/{path}')).toBe('https')
    expect(ruleProblem('https://x/')).toBe('path')
    expect(newTemplateId('My CDN', ['my-cdn'])).toBe('my-cdn-2')
  })
})

describe('small parsers', () => {
  it('parses repository names with optional branches', () => {
    expect(parseRepoSpecs('', 'default')).toEqual([{ name: 'default' }])
    expect(parseRepoSpecs('a, b@dev  a，c@feature/x', 'd')).toEqual([
      { name: 'a' },
      { name: 'b', branch: 'dev' },
      { name: 'c', branch: 'feature/x' }
    ])
    expect(parseRepoSpecs('me/a', 'd')).toBeNull()
    expect(parseRepoSpecs('a@bad..name', 'd')).toBeNull()
    expect(formatRepoSpecs([{ name: 'a' }, { name: 'b', branch: 'dev' }])).toBe('a, b@dev')
    expect(isBranchName('picg-smoke-1')).toBe(true)
    expect(isBranchName('x.lock')).toBe(false)
  })

  it('normalizes domains', () => {
    expect(normalizeDomain(' https://Img.Example.com/ \n')).toBe('img.example.com')
    expect(normalizeDomain('')).toBe('')
    expect(normalizeDomain('not a domain')).toBeNull()
  })

  it('picks a language', () => {
    expect(browserLanguage(['zh-HK', 'en'])).toBe('zh-TW')
    expect(browserLanguage(['zh'])).toBe('zh-CN')
    expect(browserLanguage(['ja-JP', 'en'])).toBe('ja')
    expect(browserLanguage(['fr'])).toBe('en')
  })

  it('interpolates', () => {
    expect(interpolate('{a} and {b}', { a: 1 })).toBe('1 and {b}')
  })
})
