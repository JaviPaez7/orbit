import { test as base, expect, type Page } from '@playwright/test';
import { DEMO_PASSWORD, DEMO_USERS, unique } from './fixtures';

export { expect, DEMO_PASSWORD, DEMO_USERS, unique };

/** Signs in through the real login form so the session cookie is genuine. */
export async function loginAs(page: Page, email: string, password = DEMO_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/issues/, { timeout: 20_000 });
}

/** Signs out through the account menu. */
export async function logout(page: Page): Promise<void> {
  await page.getByLabel('Account menu').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
}

/**
 * Drags one locator onto another.
 *
 * The board uses the native HTML5 drag-and-drop API, which needs a real
 * press → incremental move → release sequence for Chromium to synthesise
 * `dragstart`/`dragover`/`drop`.
 *
 * Both elements are scrolled into view *before* the pointer starts moving:
 * the kanban board scrolls horizontally, and a column outside the viewport
 * never receives the drop event.
 */
export async function dragAndDrop(
  page: Page,
  source: import('@playwright/test').Locator,
  target: import('@playwright/test').Locator,
): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('dragAndDrop: source or target is not visible');

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + Math.min(80, targetBox.height / 2);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Give the browser a chance to register the drag start before moving.
  await page.waitForTimeout(150);
  const steps = 16;
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      startX + ((endX - startX) * step) / steps,
      startY + ((endY - startY) * step) / steps,
    );
    await page.waitForTimeout(25);
  }
  await page.mouse.move(endX, endY);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(250);
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

