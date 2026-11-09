import { expect, test, type Page } from '@playwright/test'
import { ENDPOINT, FakeR2, KEYS } from './fake-r2'
import { FakeGitHub } from './fake-github'

// A valid 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const TOKEN = 'github_pat_11TEST_fake'

let r2: FakeR2
let gh: FakeGitHub

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  r2 = new FakeR2()
  gh = new FakeGitHub()
  await r2.install(page)
  await gh.install(page)
})

const keys = (bucket: string) => [...r2.buckets.get(bucket)!.objects.keys()]

async function signInToR2(
  page: Page,
  bucket = 'pics',
  options: { secret?: string; publicUrl?: string } = {}
) {
  await page.goto('./#/login')
  await page.getByRole('radio', { name: 'Cloudflare R2' }).click()
  await page.getByLabel('S3 API address').fill(`${ENDPOINT}/${bucket}`)
  await page.getByLabel('Access Key ID').fill(KEYS.accessKeyId)
  await page
    .getByLabel('Secret Access Key', { exact: true })
    .fill(options.secret ?? KEYS.secretAccessKey)
  await page.getByLabel('Public address').fill(options.publicUrl ?? `https://${bucket}.img.test`)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

const queue = (page: Page) => page.locator('pg-queue-panel')

test('uploads, renames and deletes an image in an R2 bucket', async ({ page }) => {
  r2.addBucket('pics')
  await signInToR2(page)
  await expect(page).toHaveURL(/#\/library/)
  await expect(page.getByText('No images here yet')).toBeVisible()
  // The check wrote a file to see that it can, and deleted it again.
  expect(r2.log).toContain('PUT /pics/.picg/check')
  expect(keys('pics')).toEqual([])

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'my photo.png', mimeType: 'image/png', buffer: PNG })
  await queue(page).getByRole('button', { name: 'Upload', exact: true }).click()
  await expect
    .poll(() => keys('pics').find((k) => k.startsWith('my-photo.')))
    .toMatch(/^my-photo\.[0-9a-f]{8}\.png$/)
  const uploaded = keys('pics').find((k) => k.startsWith('my-photo.'))!
  // A taken name is refused by R2 itself, and the image is served with its own type.
  expect(r2.puts.get(uploaded)?.['if-none-match']).toBe('*')
  expect(r2.puts.get(uploaded)?.['content-type']).toBe('image/png')
  // The link is copied once the upload has answered, which can be after the file is stored.
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`https://pics.img.test/${uploaded}`)
  const card = page.locator('pg-image-card', { hasText: uploaded })
  await expect(card.locator('img')).toHaveJSProperty('naturalWidth', 1)

  await card.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByLabel('New name').fill('renamed.png')
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect.poll(() => keys('pics')).toEqual(['renamed.png'])
  expect(r2.buckets.get('pics')!.objects.get('renamed.png')!.body.equals(PNG)).toBe(true)

  await page
    .locator('pg-image-card', { hasText: 'renamed.png' })
    .getByRole('button', { name: 'More' })
    .click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => keys('pics')).toEqual([])
})

test('writes settings to the bucket only over the version it read', async ({ page }) => {
  r2.addBucket('pics')
  await signInToR2(page)
  await expect(page).toHaveURL(/#\/library/)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByText('Add a hash to file names').click()
  const settings = () => r2.buckets.get('pics')!.objects.get('.picg/settings.toml')
  await expect
    .poll(() => settings()?.body.toString() ?? '', { timeout: 15_000 })
    .toContain('hash = false')
  expect(r2.puts.get('.picg/settings.toml')?.['if-none-match']).toBe('*')
  expect(settings()!.body.toString()).toContain('rule = "r2"')

  await page.getByText('Add a hash to file names').click()
  await expect.poll(() => settings()!.body.toString(), { timeout: 15_000 }).toContain('hash = true')
  expect(r2.puts.get('.picg/settings.toml')?.['if-match']).toMatch(/^"[0-9a-f]+"$/)
})

test('lists folders and images of a bucket', async ({ page }) => {
  r2.addBucket('pics', {
    'top.png': PNG,
    '2026/11/a.png': PNG,
    'empty/': '',
    '.picg/settings.toml': 'version = 1\n',
    'notes.txt': 'not an image'
  })
  await signInToR2(page)
  await expect(page.locator('pg-image-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /2026/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /empty/ })).toBeVisible()
  await expect(page.getByText('.picg')).toHaveCount(0)
})

test('says when the CORS policy of the bucket blocks PiCG', async ({ page }) => {
  r2.addBucket('pics', {}, { noCors: true })
  await signInToR2(page)
  await expect(page.getByRole('alert')).toContainText('CORS policy')
  await expect(page).toHaveURL(/#\/login/)
})

test('rejects keys R2 does not accept, and keys that cannot write', async ({ page }) => {
  r2.addBucket('pics')
  r2.addBucket('locked', {}, { readOnly: true })
  await signInToR2(page, 'pics', { secret: 'wrong' })
  await expect(page.getByRole('alert')).toContainText('did not accept the keys')
  await expect(page.getByLabel('Secret Access Key', { exact: true })).toHaveValue('')

  await signInToR2(page, 'locked')
  await expect(page.getByRole('alert')).toContainText('cannot write to bucket locked')

  await signInToR2(page, 'missing')
  await expect(page.getByRole('alert')).toContainText('Bucket missing does not exist')

  await signInToR2(page, 'pics', { publicUrl: 'http://pics.img.test' })
  await expect(page.getByRole('alert')).toContainText('starting with https://')
})

test('remembers accounts on the device and signs in with one click', async ({ page }) => {
  r2.addBucket('pics')
  gh.addRepo('pics', { 'README.md': '# pics', '.nojekyll': '\n' })

  await page.goto('./#/login')
  await page.getByLabel('Token', { exact: true }).fill(TOKEN)
  await page.getByLabel('Image repositories').fill('pics')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/#\/library/)
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/#\/login/)

  // The GitHub account is remembered; another account can still be added.
  await page.getByRole('button', { name: 'Use another account' }).click()
  await signInToR2(page)
  await expect(page).toHaveURL(/#\/library/)
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click()

  const cards = page.locator('.accounts li')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('Cloudflare R2')
  await page.getByRole('button', { name: 'Sign in as tester' }).click()
  await expect(page).toHaveURL(/#\/library/)
  await expect(page.locator('.repo')).toHaveText('pics')

  // Signing out without keeping removes the account.
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.getByText('Keep this account on this device').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click()
  await expect(cards).toHaveCount(1)
  await page.getByRole('button', { name: 'Remove from this device' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove from this device' }).click()
  await expect(page.getByLabel('Token', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('picg.accounts'))).toBeNull()
})

test('keeps the session of an earlier version as a remembered account', async ({ page }) => {
  gh.addRepo('pics', { 'README.md': '# pics', '.nojekyll': '\n' })
  await page.goto('./#/login')
  await page.getByLabel('Token', { exact: true }).fill(TOKEN)
  await page.getByLabel('Image repositories').fill('pics')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/#\/library/)
  // Turn what was stored back into the shape of an earlier version.
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('picg.accounts')!)
    const { kind: _kind, usedAt: _usedAt, skipCheck: _skip, ...session } = stored.accounts[0]
    localStorage.removeItem('picg.accounts')
    localStorage.setItem('picg.session', JSON.stringify(session))
  })
  await page.reload()
  await expect(page).toHaveURL(/#\/library/)
  await expect(page.locator('.repo')).toHaveText('pics')
  expect(await page.evaluate(() => localStorage.getItem('picg.session'))).toBeNull()
})
