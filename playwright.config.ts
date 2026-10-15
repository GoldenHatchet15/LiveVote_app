import { defineConfig, devices } from '@playwright/test';

const PORT = 3200;
const BASE = `http://localhost:${PORT}`;

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
  webServer: {
    command: 'sh scripts/e2e-server.sh',
    url: `${BASE}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATABASE_URL: 'file:./e2e.db',
      ADMIN_PASSWORD: 'changeme',
      SESSION_SECRET: 'e2e-secret-0123456789abcdef0123456789abcdef',
      PUBLIC_BASE_URL: BASE,
      CORS_ORIGINS: BASE,
    },
  },
});
