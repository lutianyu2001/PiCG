/**
 * Reads and writes JSON in localStorage. Storage can be unavailable (private mode, blocked site data), so every
 * access is guarded and falls back quietly.
 */
export const STORAGE_PREFIX = 'picg.'

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
  } catch {
    // Nothing to do: the value simply is not remembered on this device.
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    // Ignored for the same reason as in writeJson.
  }
}

/** Removes every key of this app whose name starts with the given part. */
export function removeKeysStartingWith(part: string): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(STORAGE_PREFIX + part)) {
        keys.push(key)
      }
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Ignored.
  }
}
