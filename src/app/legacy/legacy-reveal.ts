/**
 * Recovers tokens stored by earlier versions of PiCG. Those versions kept the token as `obs1:` followed by Base64 of
 * an 8-byte IV and the token XORed with a keystream; values without the prefix are plain text.
 */
const PREFIX = 'obs1:'
const KEY = 'picg-token-obscure-v1'
const IV_LENGTH = 8

/** Keystream: a 32-bit FNV-1a hash of the key and IV seeds an xorshift32 generator, one byte per step. */
export function legacyKeystream(iv: Uint8Array): () => number {
  let state = 0x811c9dc5
  for (const byte of [...new TextEncoder().encode(KEY), ...iv]) {
    state = Math.imul(state ^ byte, 0x01000193)
  }
  if (state === 0) {
    state = 1
  }
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state & 0xff
  }
}

export function legacyReveal(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    return ''
  }
  if (!value.startsWith(PREFIX)) {
    return value
  }
  try {
    const bytes = Uint8Array.from(atob(value.slice(PREFIX.length)), (c) => c.charCodeAt(0))
    const next = legacyKeystream(bytes.subarray(0, IV_LENGTH))
    return new TextDecoder().decode(bytes.subarray(IV_LENGTH).map((b) => b ^ next()))
  } catch {
    return ''
  }
}
