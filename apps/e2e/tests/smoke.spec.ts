import { expect, loginAs, test, DEMO_USERS } from './helpers';

/**
 * Smoke coverage: every top-level route renders with real data and without
 * console errors. Catches dead routes, crashed components and empty states that
 * should not be empty in a seeded workspace.
 */
test.describe('application shell and routing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_USERS.owner.email);
  });

  test('renders the seeded workspace with issues, projects and cycles', async ({ page, consoleErrors }) => {
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('workspace-switcher')).toContainText('Orbit Labs');
    await expect(page.getByTestId('issue-count')).toContainText('issue');
    // The seeded workspace has ~70 issues.
    const count = await page.getByTestId('issue-count').textContent();
    expect(Number(count?.replace(/\D/g, '') ?? '0')).toBeGreaterThan(20);

    const rows = page.locator('[data-testid^="issue-row-"]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(10);

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('navigates through every main section', async ({ page, consoleErrors }) => {
    const sections: { link: string; expect: RegExp }[] = [
      { link: 'nav-board', expect: /\/board/ },
      { link: 'nav-projects', expect: /\/projects/ },
      { link: 'nav-cycles', expect: /\/cycles/ },
      { link: 'nav-analytics', expect: /\/analytics/ },
      { link: 'nav-inbox', expect: /\/inbox/ },
      { link: 'nav-my-issues', expect: /\/my-issues/ },
      { link: 'nav-issues', expect: /\/issues/ },
    ];

    for (const section of sections) {
      await page.getByTestId(section.link).click();
      await expect(page).toHaveURL(section.expect);
      // Each page renders *something* real.
      await expect(page.locator('main')).toBeVisible();
      await page.waitForTimeout(200);
    }

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('board renders every workflow column with cards', async ({ page }) => {
    await page.goto('/board');
    await expect(page.getByTestId('board-column-backlog')).toBeVisible();
    await expect(page.getByTestId('board-column-todo')).toBeVisible();
    await expect(page.getByTestId('board-column-in_progress')).toBeVisible();
    await expect(page.getByTestId('board-column-done')).toBeVisible();

    const cards = page.locator('[data-testid^="board-card-"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(5);
  });

  test('projects list shows progress for seeded projects', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    const cards = page.locator('[data-testid^="project-card-"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
    await expect(page.getByText('Payments Platform')).toBeVisible();
  });

  test('cycles page separates active, upcoming and completed', async ({ page }) => {
    await page.goto('/cycles');
    await expect(page.getByText('Active', { exact: false }).first()).toBeVisible();
    const cards = page.locator('[data-testid^="cycle-card-"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
  });

  test('analytics renders charts built from real data', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.getByText('Issues created vs completed')).toBeVisible();
    await expect(page.getByText('Workload per member')).toBeVisible();
    // Recharts renders SVG; at least one chart must have produced paths.
    expect(await page.locator('svg .recharts-line, svg .recharts-bar, svg .recharts-area').count()).toBeGreaterThan(0);
  });

  test('inbox lists notifications for the seeded user', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.getByText('Inbox')).toBeVisible();
    const items = page.locator('[data-testid^="inbox-item-"]');
    expect(await items.count()).toBeGreaterThan(0);
  });

  test('unknown routes render the not-found screen, not a crash', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByText('This page drifted out of orbit')).toBeVisible();
  });
});
