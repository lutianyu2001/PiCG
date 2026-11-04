/**
 * Keeps the token from being readable at a glance in browser storage. This is not encryption: the key ships with
 * the app, so anyone with the stored value and the app can recover the token.
 */
const PREFIX = 'pg1:'
// The key keeps the project's former spelling, PicG: changing it would make every stored token unreadable.
const KEY = new TextEncoder().encode('PicG keeps tokens out of plain sight')
const IV_LENGTH = 12

function mask(bytes: Uint8Array, iv: Uint8Array): Uint8Array {
  return bytes.map((byte, i) => {
    const k = KEY[i % KEY.length] ^ iv[i % IV_LENGTH]
    return byte ^ ((k + i * 131) & 0xff)
  })
}

function toBase64(bytes: Uint8Array): string {
  let text = ''
  bytes.forEach((byte) => (text += String.fromCharCode(byte)))
  return btoa(text)
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

export function obfuscate(plain: string): string {
  if (!plain) {
    return ''
  }
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const body = mask(new TextEncoder().encode(plain), iv)
  const joined = new Uint8Array(IV_LENGTH + body.length)
  joined.set(iv)
  joined.set(body, IV_LENGTH)
  return PREFIX + toBase64(joined)
}

/** Returns the plain value, or an empty string when the stored value is not one of ours or is damaged. */
export function deobfuscate(stored: string): string {
  if (!stored?.startsWith(PREFIX)) {
    return ''
  }
  try {
    const joined = fromBase64(stored.slice(PREFIX.length))
    const iv = joined.slice(0, IV_LENGTH)
    return new TextDecoder().decode(mask(joined.slice(IV_LENGTH), iv))
  } catch {
    return ''
  }
}
