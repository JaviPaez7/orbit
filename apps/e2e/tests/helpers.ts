import { test as base, expect, type Page } from '@playwright/test';
import { DEMO_PASSWORD, DEMO_USERS } from './fixtures';

export { expect };

/** Signs in through the real login form so the session cookie is genuine. */
export async function loginAs(page: Page, email: string, password = DEMO_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/issues/, { timeout: 20_000 });
}

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          const text = message.text();
          // Realtime connection failures are expected in headless CI.
          if (/websocket|WebSocket|favicon|Download the React DevTools/i.test(text)) return;
          errors.push(text);
        }
      });
      page.on('pageerror', (error) => {
        errors.push(`pageerror: ${error.message}`);
      });
      await use(errors);
    },
    { auto: true },
  ],
});

export { DEMO_PASSWORD, DEMO_USERS };
