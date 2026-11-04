import { describe, expect, it } from 'vitest'
import en from '../core/i18n/locales/en.json'
import { greetingKeys, pickGreeting, slotOf } from './greeting'

// 2026-11-04 is a Wednesday, 2026-11-06 a Friday and 2026-11-07 a Saturday.
const at = (day: number, hour: number) => new Date(2026, 10, day, hour)

describe('greetings', () => {
  it('follow the time of day', () => {
    expect([4, 5, 11, 12, 17, 18, 22, 23, 0].map(slotOf)).toEqual([
      'night',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
      'night',
      'night'
    ])
  })

  it('add the day of the week', () => {
    expect(greetingKeys(at(4, 9))).not.toContain('login.greeting.friday')
    expect(greetingKeys(at(6, 9))).toContain('login.greeting.friday')
    expect(greetingKeys(at(7, 21))).toContain('login.greeting.weekend')
    expect(greetingKeys(at(9, 15))).toContain('login.greeting.monday')
  })

  it('pick one of those that fit', () => {
    const keys = greetingKeys(at(6, 9))
    expect(pickGreeting(at(6, 9), () => 0)).toBe(keys[0])
    expect(pickGreeting(at(6, 9), () => 0.9999)).toBe(keys[keys.length - 1])
  })

  it('all have a text', () => {
    const texts = en.login.greeting as Record<string, string>
    for (let hour = 0; hour < 24; hour++) {
      for (const day of [4, 6, 7, 9]) {
        for (const key of greetingKeys(at(day, hour))) {
          expect(texts[key.split('.').pop()!], key).toBeTruthy()
        }
      }
    }
  })
})
