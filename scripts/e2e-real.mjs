// Runs the smoke test against the real GitHub API. Playwright saves a snapshot of the page when a test fails, and
// that snapshot can hold the token typed into the sign-in form. The test output therefore goes to a temporary
// directory; afterwards only its text reports are copied to test-results/real, with the token replaced, and the rest
// is deleted whatever the result.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const tokenFile = process.env.PICG_E2E_TOKEN_FILE
const token = tokenFile ? readFileSync(tokenFile, 'utf8').trim() : ''
const out = mkdtempSync(join(tmpdir(), 'picg-e2e-real-'))
const kept = 'test-results/real'

try {
  const run = spawnSync(
    'playwright',
    ['test', 'e2e/real.spec.ts', '--output', out, ...process.argv.slice(2)],
    { stdio: 'inherit', shell: process.platform === 'win32' }
  )
  process.exitCode = run.status ?? 1
  rmSync(kept, { recursive: true, force: true })
  for (const entry of readdirSync(out, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const from = join(entry.parentPath, entry.name)
      const to = join(kept, relative(out, from))
      mkdirSync(join(to, '..'), { recursive: true })
      const text = readFileSync(from, 'utf8')
      writeFileSync(to, token ? text.replaceAll(token, '<token>') : text)
      console.log(`Kept ${to}`)
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true })
}
