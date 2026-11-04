/// <reference lib="webworker" />
/**
 * Decodes HEIC and HEIF images with libheif (LGPL-3.0), loaded at run time from separate files so the library can
 * be replaced. Only used when the browser cannot decode the image itself.
 */
interface HeifImage {
  get_width(): number
  get_height(): number
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    done: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void
  ): void
  free?(): void
}

interface HeifModule {
  HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] }
}

type Factory = (options: {
  locateFile: (file: string) => string
  onRuntimeInitialized: () => void
}) => unknown

let ready: Promise<HeifModule> | null = null

function load(base: string): Promise<HeifModule> {
  ready ??= (async () => {
    const source = await (await fetch(base + 'libheif.js')).text()
    // The file defines a global factory; module workers have no importScripts, so it is evaluated here.
    const factory = new Function(`${source}\nreturn libheif`)() as Factory
    // Initialisation may finish before the factory returns, so wait for both.
    let mod: unknown
    let initialised = false
    return new Promise<HeifModule>((resolve) => {
      mod = factory({
        locateFile: (file) => base + file,
        onRuntimeInitialized: () => {
          initialised = true
          if (mod) {
            resolve(mod as HeifModule)
          }
        }
      })
      if (initialised) {
        resolve(mod as HeifModule)
      }
    })
  })().catch((err) => {
    ready = null
    throw err
  })
  return ready
}

/** The first image of a HEIC or HEIF file as RGBA pixels. */
export async function decodeHeif(buffer: ArrayBuffer, base: string): Promise<ImageData> {
  const heif = await load(base)
  const [image] = new heif.HeifDecoder().decode(new Uint8Array(buffer))
  if (!image) {
    throw new Error('No image in the HEIF file')
  }
  const width = image.get_width()
  const height = image.get_height()
  const pixels = await new Promise<Uint8ClampedArray>((resolve, reject) =>
    image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (result) =>
      result ? resolve(result.data) : reject(new Error('Could not decode the HEIF image'))
    )
  )
  image.free?.()
  return new ImageData(new Uint8ClampedArray(pixels), width, height)
}
