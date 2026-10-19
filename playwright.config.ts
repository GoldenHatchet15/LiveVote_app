import { defineConfig, devices } from '@playwright/test';

const PORT = 3200;
// Point at a live deployment for the production smoke test:
//   PLAYWRIGHT_BASE_URL=https://livevote.jrcodestudio.org npx playwright test …
const EXTERNAL_BASE = process.env.PLAYWRIGHT_BASE_URL;
const BASE = EXTERNAL_BASE ?? `http://localhost:${PORT}`;

/**
 * E2E runs against the real built app on an isolated SQLite file. The server
 * is the single source of truth, so tests drive the host + several players
 * through full QUIZ and POLL games and assert on what each actually sees.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // When testing a live URL, don't boot a local server.
  webServer: EXTERNAL_BASE ? undefined : {
    command: 'sh scripts/e2e-server.sh',
    url: `${BASE}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATABASE_URL: 'file:./e2e.db',
      ADMIN_PASSWORD: 'changeme',
      // Explicitly clear these so a developer's local .env (e.g. a production
      // ADMIN_PASSWORD_HASH) can't leak into the e2e server (dotenv won't
      // override an already-set env var).
      ADMIN_PASSWORD_HASH: '',
      TRUST_PROXY: 'false',
      SESSION_SECRET: 'e2e-secret-0123456789abcdef0123456789abcdef',
      PUBLIC_BASE_URL: BASE,
      CORS_ORIGINS: BASE,
    },
  },
});
