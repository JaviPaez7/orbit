import { mkdirSync } from 'node:fs';
import { expect, loginAs, test, DEMO_USERS, waitForShortcuts } from './helpers';

/**
 * Screenshot walkthrough.
 *
 * Visits every main route against the *development* servers, captures a PNG of
 * each, and asserts the page actually rendered content (no error or empty
 * states) while failing on any console error.
 *
 * Run against `pnpm dev` (ports 4000/5173):
 *   E2E_WEB_PORT=5173 E2E_API_PORT=4000 pnpm --filter @orbit/e2e run screenshots
 */
const OUT = 'screenshots';
const ROUTES: { path: string; name: string }[] = [
  { path: '/issues', name: '01-issues-list' },
  { path: '/board', name: '02-kanban-board' },
  { path: '/projects', name: '03-projects' },
  { path: '/cycles', name: '04-cycles' },
  { path: '/analytics', name: '05-analytics' },
  { path: '/inbox', name: '06-inbox' },
  { path: '/my-issues', name: '07-my-issues' },
  { path: '/settings/members', name: '08-settings-members' },
  { path: '/settings/labels', name: '09-settings-labels' },
  { path: '/settings/profile', name: '10-settings-profile' },
  { path: '/import', name: '11-import-export' },
];

test('walker: capture every route and fail on broken pages', async ({ page, consoleErrors }) => {
  mkdirSync(OUT, { recursive: true });
  await loginAs(page, DEMO_USERS.owner.email);

  // The realtime channel must be live: the header only shows a status badge
  // when the socket is reconnecting or offline.
  await expect(page.getByTestId('realtime-status')).toHaveCount(0, { timeout: 20_000 });

  for (const route of ROUTES) {
    await page.goto(route.path);
    await waitForShortcuts(page);
    // Wait for the page body to settle (lazy chunks + first queries).
    await page.waitForTimeout(1200);

    await expect(page.getByText('This view crashed')).toHaveCount(0);
    await expect(page.getByText('Could not load')).toHaveCount(0);
    await expect(page.getByText('Something went wrong')).toHaveCount(0);

    await page.screenshot({ path: `${OUT}/${route.name}.png`, fullPage: false });
  }

  // Detail pages need a real identifier.
  await page.goto('/issues');
  const row = page.locator('[data-testid^="issue-row-"]').first();
  await expect(row).toBeVisible();
  const identifier = (await row.getAttribute('data-testid'))!.replace('issue-row-', '');
  await page.goto(`/issues/${identifier}`);
  await expect(page.getByTestId('issue-detail-title')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/12-issue-detail.png` });

  // Command palette.
  await page.goto('/issues');
  await waitForShortcuts(page);
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.screenshot({ path: `${OUT}/13-command-palette.png` });
  await page.keyboard.press('Escape');

  // Light theme (uses the explicit theme picker so the assertion is stable).
  await page.goto('/settings/notifications');
  await page.getByTestId('theme-light').click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.goto('/issues');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/14-issues-light.png` });
  await page.goto('/settings/notifications');
  await page.getByTestId('theme-dark').click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  // Login screen (fresh context so the session is not reused).
  const anonymous = await page.context().browser()!.newContext();
  const loginPage = await anonymous.newPage();
  await loginPage.goto(`${process.env.E2E_WEB_URL ?? 'http://localhost:5173'}/login`);
  await expect(loginPage.getByTestId('login-form')).toBeVisible();
  await loginPage.screenshot({ path: `${OUT}/15-login.png` });
  await anonymous.close();

  expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
});
