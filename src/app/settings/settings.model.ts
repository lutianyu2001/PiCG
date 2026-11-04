export type Subfolder = 'none' | 'time' | 'custom'
export type Encoder = 'webp' | 'avif' | 'mozjpeg'
export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

export interface CustomTemplate {
  id: string
  name: string
  template: string
}

export interface UploadSettings {
  autoUpload: boolean
  subfolder: Subfolder
  customSubfolder: string
  timeFormat: string
  hash: boolean
  prefixEnabled: boolean
  prefix: string
  /** Remove EXIF and similar metadata, such as the place a photo was taken. */
  stripMetadata: boolean
}

export interface CompressSettings {
  enabled: boolean
  encoder: Encoder
  quality: number
}

export interface WatermarkSettings {
  enabled: boolean
  text: string
  /** Font size in pixels for a 1000 px wide image; scaled with the image. */
  size: number
  color: string
  opacity: number
  position: WatermarkPosition
}

export interface LinkSettings {
  rule: string
  format: string
  rules: CustomTemplate[]
  formats: CustomTemplate[]
}

export interface AppSettings {
  upload: UploadSettings
  compress: CompressSettings
  watermark: WatermarkSettings
  link: LinkSettings
}

export const SUBFOLDERS: readonly Subfolder[] = ['none', 'time', 'custom']
export const ENCODERS: readonly Encoder[] = ['webp', 'avif', 'mozjpeg']
export const POSITIONS: readonly WatermarkPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center'
]
export const TIME_FORMAT_PRESETS = ['yyyy/MM', 'yyyyMMdd', 'yyyy/MM/dd'] as const

export function defaultSettings(): AppSettings {
  return {
    upload: {
      autoUpload: false,
      subfolder: 'none',
      customSubfolder: '',
      timeFormat: 'yyyy/MM',
      hash: true,
      prefixEnabled: false,
      prefix: '',
      stripMetadata: true
    },
    compress: { enabled: true, encoder: 'webp', quality: 80 },
    watermark: {
      enabled: false,
      text: 'PiCG',
      size: 32,
      color: '#ffffff',
      opacity: 0.5,
      position: 'bottom-right'
    },
    link: { rule: 'github', format: 'url', rules: [], formats: [] }
  }
}

/** Keeps a number inside a range, using the fallback for anything that is not a finite number. */
export function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}
