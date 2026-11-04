import { describe, expect, it } from 'vitest'
import { parseSettingsFile, stringifySettings } from './settings-file'
import { defaultSettings } from './settings.model'
import { rebase } from './settings.store'

describe('settings file', () => {
  it('round-trips settings', () => {
    const s = defaultSettings()
    s.upload.subfolder = 'time'
    s.upload.timeFormat = 'yyyy/MM/dd'
    s.link.rules = [{ id: 'cdn', name: 'CDN', template: 'https://cdn.example.com/{path}' }]
    expect(parseSettingsFile(stringifySettings(s)).settings).toEqual(s)
  })

  it('keeps keys it does not know', () => {
    const text = 'future = "yes"\n[upload]\nhash = false\nlater = 3\n'
    const { settings, raw } = parseSettingsFile(text)
    expect(settings.upload.hash).toBe(false)
    const again = parseSettingsFile(stringifySettings(settings, raw)).raw
    expect(again['future']).toBe('yes')
    expect((again['upload'] as Record<string, unknown>)['later']).toBe(3)
  })

  it('falls back to defaults for wrong values', () => {
    const { settings } = parseSettingsFile(
      '[compress]\nencoder = "gif"\nquality = 900\n[watermark]\ncolor = "red"\nposition = 1\n'
    )
    expect(settings.compress.encoder).toBe('webp')
    expect(settings.compress.quality).toBe(100)
    expect(settings.watermark.color).toBe('#ffffff')
    expect(settings.watermark.position).toBe('bottom-right')
  })
})

describe('rebase', () => {
  it('applies only local changes on top of the remote version', () => {
    const base = defaultSettings()
    const mine = structuredClone(base)
    mine.compress.quality = 60
    const theirs = structuredClone(base)
    theirs.watermark.text = 'Theirs'
    const merged = rebase(base, mine, theirs)
    expect(merged.compress.quality).toBe(60)
    expect(merged.watermark.text).toBe('Theirs')
  })
})
