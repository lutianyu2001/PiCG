import { defineConfig, devices } from '@playwright/test'

// End-to-end tests of the built site. `e2e/app.spec.ts` runs against a fake GitHub API and needs nothing else;
// `e2e/real.spec.ts` talks to the real API and only runs when PICG_E2E_TOKEN_FILE and PICG_E2E_REPO are set.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    ...devices['Desktop Chrome'],
    permissions: ['clipboard-read', 'clipboard-write'],
    // Requests a service worker makes cannot be routed to the fake API.
    serviceWorkers: 'block',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI
  }
})
