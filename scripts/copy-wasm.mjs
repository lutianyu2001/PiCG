// Copies the jSquash encoder binaries into public/wasm and the libheif decoder into public/heif, where the image
// worker loads them at run time, together with the license files that come with them. libheif is LGPL-3.0 and is
// kept as separate files so it can be replaced.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const target = join(root, 'public/wasm')

mkdirSync(target, { recursive: true })
for (const name of ['webp', 'avif', 'jpeg']) {
  const pkg = join(root, 'node_modules/@jsquash', name)
  const encoders = join(pkg, 'codec/enc')
  for (const file of readdirSync(encoders).filter((x) => x.endsWith('.wasm'))) {
    copyFileSync(join(encoders, file), join(target, file))
  }
  copyFileSync(join(pkg, 'LICENSE'), join(target, `LICENSE.jsquash-${name}.txt`))
  const codecLicense = join(pkg, 'codec/LICENSE.codec.md')
  if (existsSync(codecLicense)) {
    copyFileSync(codecLicense, join(target, `LICENSE.${name}-codec.md`))
  }
}

const heif = join(root, 'public/heif')
const libheif = join(root, 'node_modules/libheif-js/libheif-wasm')
mkdirSync(heif, { recursive: true })
for (const file of ['libheif.js', 'libheif.wasm', 'LICENSE']) {
  copyFileSync(join(libheif, file), join(heif, file === 'LICENSE' ? 'LICENSE.libheif.txt' : file))
}
