import { defineConfig, devices } from '@playwright/test';

/**
 * Walkthrough configuration.
 *
 * Unlike `playwright.config.ts` this does **not** start servers: it targets an
 * already-running `pnpm dev` (API :4000, client :5173) so the screenshots show
 * the real development database.
 *
 *   pnpm --filter @orbit/e2e run screenshots
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /walkthrough\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    // Must match `APP_URL`/`CORS_ORIGINS` in apps/server/.env so cookies and
    // CORS behave exactly as they do for a developer using the documented URL.
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
