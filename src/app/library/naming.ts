import { format } from 'date-fns'
import type { UploadSettings } from '../settings/settings.model'

// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const FORBIDDEN = /[\\:*?"<>|#%\u0000-\u001f]/g

/** Makes one path segment safe: no spaces, no characters Git hosts or URLs choke on, no leading dots. */
export function cleanSegment(text: string): string {
  return text.trim().replace(FORBIDDEN, '').replace(/\s+/g, '-').replace(/^\.+/, '')
}

/** Cleans a folder path typed by the user; slashes separate folders. */
export function cleanFolderPath(text: string): string {
  return text
    .split('/')
    .map(cleanSegment)
    .filter((part) => part && part !== '..')
    .join('/')
}

/** Folder name for the time-based subfolder, or '' when the format gives nothing usable. */
export function timeFolder(pattern: string, date = new Date()): string {
  try {
    return cleanFolderPath(format(date, pattern))
  } catch {
    return ''
  }
}

export function subfolderFor(
  upload: Pick<UploadSettings, 'subfolder' | 'customSubfolder' | 'timeFormat'>
) {
  switch (upload.subfolder) {
    case 'time':
      return timeFolder(upload.timeFormat)
    case 'custom':
      return cleanFolderPath(upload.customSubfolder)
    default:
      return ''
  }
}

export function splitName(fileName: string): { base: string; extension: string } {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) {
    return { base: cleanSegment(fileName) || 'image', extension: '' }
  }
  return {
    base: cleanSegment(fileName.slice(0, dot)) || 'image',
    extension: fileName.slice(dot + 1).toLowerCase()
  }
}

export interface NameParts {
  base: string
  extension: string
  prefix: string
  hash: string
}

/** `prefix + base + .hash + .extension`, leaving out empty parts. */
export function finalName({ base, extension, prefix, hash }: NameParts): string {
  const name = cleanSegment(prefix) + (cleanSegment(base) || 'image') + (hash ? `.${hash}` : '')
  return extension ? `${name}.${extension}` : name
}

/** First 8 hex digits of the SHA-256 of the bytes. */
export async function shortHash(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest).slice(0, 4)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
