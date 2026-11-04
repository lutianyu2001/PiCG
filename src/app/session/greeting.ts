/**
 * Greetings on the sign-in page, one picked at random from those that fit the time and the day. Each is the first
 * half of `login.welcome` ("{greeting}, welcome to PiCG"), so the welcome itself is written once per language.
 */
const SLOTS = {
  /** 5:00 to 11:59 */
  morning: ['good_morning', 'morning', 'early_bird', 'fresh_start'],
  /** 12:00 to 17:59 */
  afternoon: ['good_afternoon', 'afternoon', 'tea_time', 'keep_going'],
  /** 18:00 to 22:59 */
  evening: ['good_evening', 'evening', 'long_day', 'lovely_evening'],
  /** 23:00 to 4:59 */
  night: ['late_night', 'night_owl', 'still_up']
} as const

export type Slot = keyof typeof SLOTS

export function slotOf(hour: number): Slot {
  if (hour >= 5 && hour < 12) {
    return 'morning'
  }
  if (hour >= 12 && hour < 18) {
    return 'afternoon'
  }
  return hour >= 18 && hour < 23 ? 'evening' : 'night'
}

/** Greetings for the day of the week, added to those of the time slot. */
function dayGreetings(day: number): string[] {
  if (day === 1) {
    return ['monday']
  }
  if (day === 5) {
    return ['friday']
  }
  return day === 0 || day === 6 ? ['weekend'] : []
}

/** Every greeting that fits a moment, as translation keys. */
export function greetingKeys(date: Date): string[] {
  return [...SLOTS[slotOf(date.getHours())], ...dayGreetings(date.getDay())].map(
    (id) => `login.greeting.${id}`
  )
}

export function pickGreeting(date = new Date(), random = Math.random): string {
  const keys = greetingKeys(date)
  return keys[Math.floor(random() * keys.length) % keys.length]
}
