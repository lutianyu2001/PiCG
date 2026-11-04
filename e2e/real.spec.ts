import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/**
 * Smoke test against the real GitHub API. It works on a temporary branch of PICG_E2E_REPO (`owner/name`), made from
 * the default branch, and deletes the branch at the end; the default branch is checked to be untouched.
 * The token is read from the file named by PICG_E2E_TOKEN_FILE and should be a fine-grained token limited to that
 * repository with Contents: Read and write.
 */
const tokenFile = process.env['PICG_E2E_TOKEN_FILE']
const repoName = process.env['PICG_E2E_REPO']
test.skip(
  !tokenFile || !repoName,
  'Set PICG_E2E_TOKEN_FILE and PICG_E2E_REPO to run against GitHub'
)

const token = tokenFile ? readFileSync(tokenFile, 'utf8').trim() : ''
const [owner, name] = (repoName ?? '/').split('/')
const branch = `picg-smoke-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

async function files(): Promise<string[]> {
  const tree = await api<{ tree: { path: string; type: string }[] }>(
    'GET',
    `/git/trees/${branch}?recursive=1`
  )
  return tree.tree.filter((e) => e.type === 'blob').map((e) => e.path)
}

async function text(path: string) {
  const file = await api<{ content: string }>(
    'GET',
    `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${branch}`
  )
  return Buffer.from(file.content, 'base64').toString('utf8')
}

let defaultBranch = ''
let defaultHead = ''

test.beforeAll(async () => {
  const repo = await api<{ default_branch: string }>('GET', '')
  defaultBranch = repo.default_branch
  const head = await api<{ commit: { sha: string } }>('GET', `/branches/${defaultBranch}`)
  defaultHead = head.commit.sha
  await api('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha: defaultHead })
})

test.afterAll(async () => {
  if (defaultBranch) {
    await api('DELETE', `/git/refs/heads/${branch}`).catch(() => undefined)
    const head = await api<{ commit: { sha: string } }>('GET', `/branches/${defaultBranch}`)
    expect(head.commit.sha, 'the default branch must not change').toBe(defaultHead)
  }
})

// No trace, screenshot or video: each would hold the token. See scripts/e2e-real.mjs for the page snapshot.
test.use({ locale: 'en-US', trace: 'off', screenshot: 'off', video: 'off' })

const problems: string[] = []

test.beforeEach(({ page }) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      problems.push(`console ${msg.type()}: ${msg.text()}`)
    }
  })
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().startsWith('https://api.github.com/')) {
      problems.push(`${res.request().method()} ${res.url()} -> ${res.status()}`)
    }
  })
})

// On failure, print what the page showed and what went wrong, with the token replaced.
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const snapshot = await page
      .locator('body')
      .ariaSnapshot({ timeout: 5_000 })
      .catch(() => '')
    const listing = await files().catch((err: Error) => [err.message])
    console.log(
      [snapshot, ...problems, `Files on ${branch}:`, ...listing]
        .join('\n')
        .replaceAll(token, '<token>')
    )
  }
})

test('signs in, converts old settings, uploads, renames, deletes and syncs settings', async ({
  page
}) => {
  test.setTimeout(240_000)
  const hadOldSettings = (await files()).includes('.settings')

  await page.goto('./#/login')
  await page.getByLabel('Token', { exact: true }).fill(token)
  await page.getByLabel('Image repositories').fill(`${name}@${branch}`)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/#\/library/, { timeout: 60_000 })

  if (hadOldSettings) {
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('.settings', { timeout: 30_000 })
    await dialog.getByRole('button', { name: 'Save and delete old files' }).click()
    await expect.poll(files, { timeout: 30_000 }).toContain('.picg/settings.toml')
    expect(await files()).not.toContain('.settings')
  }

  // Upload into a folder of its own, so the test does not depend on what the repository holds.
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByLabel('Folder name').fill(branch)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Folder path' })).toContainText(branch)
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'smoke.png', mimeType: 'image/png', buffer: PNG })
  await page.locator('pg-queue-panel').getByRole('button', { name: 'Upload', exact: true }).click()
  await expect
    .poll(async () => (await files()).find((p) => p.startsWith(`${branch}/smoke.`)), {
      timeout: 60_000
    })
    .toBeTruthy()
  const uploaded = (await files()).find((p) => p.startsWith(`${branch}/smoke.`))!
  const fileName = uploaded.slice(branch.length + 1)

  const card = page.locator('pg-image-card', { hasText: fileName })
  await card.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByLabel('New name').fill('renamed.png')
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect.poll(files, { timeout: 60_000 }).toContain(`${branch}/renamed.png`)

  await page
    .locator('pg-image-card', { hasText: 'renamed.png' })
    .getByRole('button', { name: 'More' })
    .click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(files, { timeout: 60_000 }).not.toContain(`${branch}/renamed.png`)

  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  const hashOn = (await text('.picg/settings.toml').catch(() => 'hash = true')).includes(
    'hash = true'
  )
  await page.getByText('Add a hash to file names').click()
  await expect
    .poll(() => text('.picg/settings.toml').catch(() => ''), { timeout: 60_000 })
    .toContain(`hash = ${!hashOn}`)
})
