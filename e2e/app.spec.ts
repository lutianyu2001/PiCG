import { createHash } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { FakeGitHub } from './fake-github'

// A valid 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const TOKEN = 'github_pat_11TEST_fake'

let gh: FakeGitHub

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  gh = new FakeGitHub()
  await gh.install(page)
})

async function signIn(page: Page, repos = 'pics', token = TOKEN) {
  await page.goto('./#/login')
  await page.getByLabel('Token', { exact: true }).fill(token)
  await page.getByLabel('Image repositories').fill(repos)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

/**
 * Signs in and waits for the library. Signing in ends by opening the library, so an action taken before that, such
 * as clicking another page in the menu, would be undone by it.
 */
async function signInToLibrary(page: Page, repos = 'pics') {
  await signIn(page, repos)
  await expect(page).toHaveURL(/#\/library/)
}

const queue = (page: Page) => page.locator('pg-queue-panel')

test('rejects a classic token', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics' })
  await signIn(page, 'pics', 'ghp_classic')
  await expect(page.getByRole('alert')).toContainText('classic token')
})

test('rejects a token that can write to other repositories', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics' })
  gh.addRepo('blog', { 'README.md': '# blog' })
  await signIn(page)
  await expect(page.getByRole('alert')).toContainText('can also write to tester/blog')
})

test('ignores repositories the token cannot write to or GitHub has blocked', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics', '.nojekyll': '\n' })
  gh.addRepo('blog', { 'README.md': '# blog' }, { readOnly: true })
  gh.addRepo('takedown', { 'README.md': '# gone' }, { blocked: true })
  await signInToLibrary(page)
})

test('says so when the image repository is blocked by GitHub', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics' }, { blocked: true })
  await signIn(page)
  await expect(page.getByRole('alert')).toContainText('GitHub has blocked pics')
  await expect(page.getByLabel('Token', { exact: true })).toHaveValue(TOKEN)
})

test('skips the check of other repositories after a warning', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics', '.nojekyll': '\n' })
  gh.addRepo('blog', { 'README.md': '# blog' })
  await page.goto('./#/login')
  await page.getByText('Skip the token security check').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('bad security habit')
  await dialog.getByRole('button', { name: 'I understand the risk, continue' }).click()
  await expect(page.getByRole('checkbox', { name: 'Skip the token security check' })).toBeChecked()
  await signInToLibrary(page)
})

test('prepares an empty repository at sign-in', async ({ page }) => {
  gh.addRepo('pics')
  await signInToLibrary(page)
  await expect.poll(() => Object.keys(gh.files('pics')).sort()).toEqual(['.nojekyll', 'README.md'])
})

test('uploads, renames and deletes an image', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics', '.nojekyll': '\n' })
  await signInToLibrary(page)
  await expect(page.getByText('No images here yet')).toBeVisible()

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'my photo.png', mimeType: 'image/png', buffer: PNG })
  await expect(queue(page)).toContainText('Upload 1')
  await queue(page).getByRole('button', { name: 'Upload', exact: true }).click()

  await expect
    .poll(() => Object.keys(gh.files('pics')).find((p) => p.startsWith('my-photo.')))
    .toMatch(/^my-photo\.[0-9a-f]{8}\.png$/)
  const uploaded = Object.keys(gh.files('pics')).find((p) => p.startsWith('my-photo.'))!
  // The link is copied once the upload has answered, which can be after the file is stored.
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`https://github.com/tester/pics/raw/main/${uploaded}`)
  await expect(queue(page)).toHaveCount(0)

  // Rename keeps the blob.
  const card = page.locator('pg-image-card', { hasText: uploaded })
  await card.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByLabel('New name').fill('renamed.png')
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect.poll(() => Object.keys(gh.files('pics'))).toContain('renamed.png')
  expect(gh.files('pics')).not.toHaveProperty(uploaded)
  expect(gh.bytes('pics', 'renamed.png').equals(PNG)).toBe(true)

  // Delete asks first.
  await page
    .locator('pg-image-card', { hasText: 'renamed.png' })
    .getByRole('button', { name: 'More' })
    .click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => Object.keys(gh.files('pics'))).not.toContain('renamed.png')
})

test('uploads into a new folder', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics', '.nojekyll': '\n' })
  await signInToLibrary(page)
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill('trip')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Folder path' })).toContainText('trip')
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG })
  await queue(page).getByRole('button', { name: 'Upload', exact: true }).click()
  await expect
    .poll(() => Object.keys(gh.files('pics')).filter((p) => p.endsWith('.png')))
    .toEqual([expect.stringMatching(/^trip\/a\.[0-9a-f]{8}\.png$/)])
})

test('follows the default branch when it is renamed on GitHub', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics', '.nojekyll': '\n' })
  await signInToLibrary(page)
  await expect(page.getByText('No images here yet')).toBeVisible()
  gh.renameBranch('pics', 'main', 'gh-pages')
  await page.reload()
  await expect(page.getByText('pics now uses the gh-pages branch')).toBeVisible()
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'c.png', mimeType: 'image/png', buffer: PNG })
  await queue(page).getByRole('button', { name: 'Upload', exact: true }).click()
  await expect
    .poll(() => Object.keys(gh.files('pics', 'gh-pages')).some((p) => p.startsWith('c.')))
    .toBe(true)
})

test('refuses to put more than 1000 files in a folder', async ({ page }) => {
  const files: Record<string, string> = { 'README.md': '# pics', '.nojekyll': '\n' }
  for (let i = 0; i < 999; i++) {
    files[`full/${i}.txt`] = String(i)
  }
  gh.addRepo('pics', files)
  await signInToLibrary(page)
  await page.getByRole('button', { name: 'full' }).click()
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: PNG },
      { name: 'b.png', mimeType: 'image/png', buffer: PNG }
    ])
  await queue(page).getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(queue(page)).toContainText(
    'already has 999 files, and adding 2 more would exceed the limit of 1000'
  )
  expect(Object.keys(gh.files('pics')).filter((p) => p.endsWith('.png'))).toEqual([])
})

test('edits the folder path, marks folders that do not exist and goes back by level', async ({
  page
}) => {
  gh.addRepo('pics', {
    'README.md': '# pics',
    '.nojekyll': '\n',
    'trips/2026/a.png': PNG,
    'trips/2025/b.png': PNG
  })
  await signInToLibrary(page)
  const path = page.getByLabel('Folder path, editable')

  await path.fill('trips/2026')
  await path.press('Enter')
  await expect(page.locator('pg-image-card', { hasText: 'a.png' })).toBeVisible()

  await path.fill('trips/2024/x')
  await expect(path).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toContainText('There is no folder 2024 here')
  await expect(page.locator('pg-path-field .bad', { hasText: '2024' })).toBeVisible()
  await path.press('Enter')
  await expect(page.locator('pg-image-card', { hasText: 'a.png' })).toBeVisible()

  await path.fill('trips/20')
  await expect(page.getByRole('option', { name: '2025' })).toBeVisible()
  await page.getByRole('option', { name: '2025' }).click()
  await expect(page.locator('pg-image-card', { hasText: 'b.png' })).toBeVisible()
  await expect(path).toHaveValue('trips/2025')

  await page.locator('pg-path-field .level', { hasText: 'trips' }).click()
  await expect(page.getByRole('button', { name: '2026' })).toBeVisible()
  await expect(path).toHaveValue('trips')
})

test('uploads into a dated subfolder', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics', '.nojekyll': '\n' })
  await signInToLibrary(page)
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG })
  await queue(page).getByRole('radio', { name: 'By date' }).click()
  await queue(page).getByRole('button', { name: 'Upload', exact: true }).click()
  const now = new Date()
  const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
  await expect
    .poll(() => Object.keys(gh.files('pics')).some((p) => p.startsWith(`${folder}/a.`)))
    .toBe(true)
})

test('writes settings back to the repository', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics', '.nojekyll': '\n' })
  await signInToLibrary(page)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByText('Add a hash to file names').click()
  await expect
    .poll(() => gh.files('pics')['.picg/settings.toml'] ?? '', { timeout: 15_000 })
    .toContain('hash = false')
})

test('imports and converts settings of PicX', async ({ page }) => {
  const picx = {
    imageName: { enableHash: false, addPrefix: { enable: true, prefix: 'blog-' } },
    compress: { enable: true, encoder: 'avif' },
    watermark: {
      enable: true,
      text: 'Mine',
      fontSize: 40,
      position: 'leftTop',
      textColor: '#FF0000',
      opacity: 0.4
    }
  }
  gh.addRepo('pics', {
    'README.md': '# pics',
    '.nojekyll': '\n',
    '.settings': JSON.stringify(picx),
    '.deploy': JSON.stringify({ github: { status: true } })
  })
  await signIn(page)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('.settings')
  await dialog.getByRole('button', { name: 'Save and delete old files' }).click()
  await expect.poll(() => Object.keys(gh.files('pics'))).toContain('.picg/settings.toml')
  const files = gh.files('pics')
  expect(files).not.toHaveProperty('.settings')
  expect(files).not.toHaveProperty('.deploy')
  expect(files['.picg/settings.toml']).toContain('prefix = "blog-"')
  expect(files['.picg/settings.toml']).toContain('encoder = "avif"')
  expect(files['.picg/settings.toml']).toContain('position = "top-left"')
})

test('keeps working without writing settings when the conversion is declined', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics', '.nojekyll': '\n', '.settings': '{}' })
  await signIn(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Not now' }).click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(
    page.getByText('Settings are not saved to the repository until they are converted')
  ).toBeVisible()
  await page.getByText('Add a hash to file names').click()
  await page.waitForTimeout(4500)
  expect(gh.files('pics')).not.toHaveProperty('.picg/settings.toml')
})

test('creates and uses another branch', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics' })
  await signIn(page, 'pics@images')
  await page.getByRole('dialog').getByRole('button', { name: 'Create branch' }).click()
  await expect(page).toHaveURL(/#\/library/)
  await expect.poll(() => Object.keys(gh.files('pics', 'images'))).toContain('.nojekyll')
  expect(gh.files('pics', 'main')).not.toHaveProperty('.nojekyll')

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG })
  await queue(page).getByRole('button', { name: 'Upload', exact: true }).click()
  await expect
    .poll(() => Object.keys(gh.files('pics', 'images')).some((p) => p.startsWith('b.')))
    .toBe(true)
  expect(Object.keys(gh.files('pics', 'main')).some((p) => p.startsWith('b.'))).toBe(false)
})

test.describe('when the system asks for reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  const animating = (page: Page) =>
    page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a instanceof CSSAnimation && a.animationName.startsWith('pg-')).length
    )

  test('does not animate unless motion is turned on', async ({ page }) => {
    gh.addRepo('pics', { 'README.md': '# pics', '2026/a.png': PNG, '2027/b.png': PNG })
    await signInToLibrary(page)
    await page.getByRole('button', { name: '2026', exact: true }).click()
    await expect(page.getByRole('button', { name: 'View a.png' })).toBeVisible()
    expect(await animating(page)).toBe(0)

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByText('Your system asks for reduced motion')).toBeVisible()
    await page.locator('.row', { hasText: 'Motion' }).getByRole('combobox').click()
    await page.getByRole('option', { name: 'On', exact: true }).click()
    await expect(page.getByText('Your system asks for reduced motion')).toBeHidden()

    await page.getByRole('link', { name: 'Library', exact: true }).click()
    await page.getByRole('button', { name: 'Root folder' }).click()
    await page.getByRole('button', { name: '2027', exact: true }).click()
    await expect.poll(() => animating(page), { intervals: [20] }).toBeGreaterThan(0)
  })
})

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('tells about a new version while the page stays open', async ({ page, context }) => {
    let manifestFetches = 0
    context.on('requestfinished', (r) => {
      manifestFetches += r.url().includes('/ngsw.json') ? 1 : 0
    })
    await context.route(/^https:\/\/(cdn\.jsdelivr\.net|registry\.npmmirror\.com)\//, (route) =>
      route.abort()
    )
    await page.goto('./')
    await page.waitForFunction(
      async () => !!(await navigator.serviceWorker.getRegistration())?.active
    )
    // The worker fetches the manifest when it installs, and again a few seconds after the page is opened to look
    // for a new version; let it find none.
    await page.reload()
    await expect.poll(() => manifestFetches, { timeout: 15_000 }).toBe(2)
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

    // Publish a new version: one file changes and the manifest lists its new hash.
    const manifest = await (await page.request.get('ngsw.json')).json()
    const main = Object.keys(manifest.hashTable).find((path) => /^\/main-.*\.js$/.test(path))!
    const body = (await (await page.request.get(`.${main}`)).text()) + '\n// next version\n'
    manifest.hashTable[main] = createHash('sha1').update(body).digest('hex')
    await context.route(/\/ngsw\.json/, (route) => route.fulfill({ json: manifest }))
    await context.route(
      (url) => url.pathname === main,
      (route) => route.fulfill({ body, contentType: 'text/javascript' })
    )

    const notice = page.getByText('A new version is available')
    await page.waitForTimeout(1000)
    await expect(notice).toBeHidden()
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(notice).toBeVisible()
  })
})
