import { defineConfig, devices } from '@playwright/test'

/* Runs against the real backend on :8771, on a throwaway database that is
 * deleted before each run, serving the build in web/dist. `npm run e2e`
 * builds first. Local mode (no LEDGER_AUTH) signs everyone in as the dev
 * identity. LEDGER_AI=fake answers research and summarise at once, with
 * canned text. */
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8771',
    extraHTTPHeaders: { 'X-Ledger': '1' },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command:
      'cd .. && rm -f e2e.db e2e.db-wal e2e.db-shm && LEDGER_DB=e2e.db LEDGER_PORT=8771 LEDGER_WEB=web/dist LEDGER_AI=fake .venv/bin/python -m ledger',
    url: 'http://127.0.0.1:8771/api/health',
    reuseExistingServer: false,
  },
})
