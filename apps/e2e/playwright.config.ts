import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1440, height: 900 },
    // dnd-kit relies on pointer events; keep a real mouse.
    hasTouch: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /**
   * The suite runs against a throwaway SQLite database seeded by the server's
   * own seed script, so it never touches the developer's dev.db.
   */
  webServer: [
    {
      command: 'pnpm --filter @orbit/server exec tsx src/index.ts',
      cwd: '../..',
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        HOST: '127.0.0.1',
        DATABASE_URL: 'file:./e2e.db',
        AUTH_SECRET: 'e2e-secret-0123456789abcdef0123456789abcdef',
        CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT},http://localhost:${WEB_PORT}`,
        APP_URL: `http://127.0.0.1:${WEB_PORT}`,
        EXPOSE_RESET_TOKEN: 'true',
        LOG_LEVEL: 'warn',
        UPLOAD_DIR: 'uploads-e2e',
        E2E_MODE: 'true',
      },
    },
    {
      command: `pnpm --filter @orbit/web exec vite --port ${WEB_PORT} --strictPort`,
      cwd: '../..',
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_URL: `http://127.0.0.1:${API_PORT}`,
        VITE_WS_URL: `ws://127.0.0.1:${API_PORT}/api/realtime`,
      },
    },
  ],
});
