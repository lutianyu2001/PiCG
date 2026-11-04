/**
 * Loads the app's fonts, which are open source variable fonts from Fontsource, from a CDN instead of bundling them:
 * the CJK fonts come in hundreds of unicode-range subsets and the browser fetches only the ones a page needs.
 *
 * jsDelivr is tried first. If its stylesheet or the first font does not arrive in time (in some networks the
 * stylesheet loads but the font files time out), the links are replaced by the same files from npmmirror. Both serve
 * byte-identical files, so each package has one integrity hash; update it together with the version.
 */
interface FontPackage {
  name: string
  version: string
  integrity: string
}

export const FONT_PACKAGES: readonly FontPackage[] = [
  {
    name: 'inter',
    version: '5.3.0',
    integrity: 'sha384-ZTIcl2CmY0wyM9ANOhomBco7rEUIlWztf6lGcLKCocKUrIgGCsfisuZyE+hadW8K'
  },
  {
    name: 'josefin-sans',
    version: '5.3.0',
    integrity: 'sha384-DXeLfivvnuHZDh/Cl758H/Bku2crIi9rVTqU6EG/VNBHxFXonbwzL49B2ZBgjhnP'
  },
  {
    name: 'noto-sans-sc',
    version: '5.3.1',
    integrity: 'sha384-trLmBcjSrR4yNXG1/Z7+293878BKOchyG/K5tgTQGLmkQqVsqUV93bR9WSfWhB5+'
  },
  {
    name: 'noto-sans-tc',
    version: '5.3.1',
    integrity: 'sha384-thGZ0ltp/1SzNB8gk8r2XtCGWGgsMLM9r+DQgsVCwjCCO1zI7G3zn9uhaIdseGxe'
  },
  {
    name: 'noto-sans-jp',
    version: '5.3.1',
    integrity: 'sha384-6UMiIWFsrzlxO4G9ZqGPzY7gkMKr8eoO7Uerd/6kw5hJUkZGwtr0/OpdX6cTfXqe'
  }
]

const MIRRORS = {
  jsdelivr: (p: FontPackage) =>
    `https://cdn.jsdelivr.net/npm/@fontsource-variable/${p.name}@${p.version}/index.css`,
  npmmirror: (p: FontPackage) =>
    `https://registry.npmmirror.com/@fontsource-variable/${p.name}/${p.version}/files/index.css`
}

const TIMEOUT_MS = 3000
/** A family from the first package, used to tell that its font files arrive, not just the stylesheet. */
const PROBE = '1em "Inter Variable"'

function addLinks(doc: Document, url: (p: FontPackage) => string) {
  return FONT_PACKAGES.map((p) => {
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = url(p)
    link.integrity = p.integrity
    link.crossOrigin = 'anonymous'
    link.dataset['font'] = p.name
    doc.head.append(link)
    return link
  })
}

function arrives(doc: Document, link: HTMLLinkElement) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(reject, TIMEOUT_MS)
    link.addEventListener('error', () => reject(), { once: true })
    link.addEventListener(
      'load',
      () => {
        doc.fonts
          .load(PROBE, 'A')
          .then((faces) => (faces.length ? resolve() : reject()))
          .catch(() => reject())
          .finally(() => clearTimeout(timer))
      },
      { once: true }
    )
  })
}

/** Starts loading the fonts; the page uses system fonts until they arrive. */
export async function loadFonts(doc: Document = document) {
  const links = addLinks(doc, MIRRORS.jsdelivr)
  try {
    await arrives(doc, links[0])
  } catch {
    links.forEach((link) => link.remove())
    addLinks(doc, MIRRORS.npmmirror)
  }
}
