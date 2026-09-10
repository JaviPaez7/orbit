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

    // The seeded workspace has ~70 issues. Wait for the count to load (the
    // status bar shows a skeleton while the first request is in flight).
    await expect
      .poll(
        async () => Number((await page.getByTestId('issue-count').textContent())?.replace(/\D/g, '') ?? '0'),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(20);
    await expect(page.getByTestId('issue-count')).toContainText(/\d+ issues/);

    // The list renders rows immediately; grouping is client-side over the page.
    const rows = page.locator('[data-testid^="issue-row-"]');
    await expect(rows.first()).toBeVisible();
    await expect.poll(async () => rows.count(), { timeout: 15_000 }).toBeGreaterThan(1);

    // The list is grouped by status, so group headers render as well.
    await expect(page.locator('section h2').first()).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('navigates through every main section', async ({ page, consoleErrors }) => {
    const sections: { link: string; expect: RegExp }[] = [
      { link: 'nav-my-issues', expect: /\/my-issues/ },
      { link: 'nav-board', expect: /\/board/ },
      { link: 'nav-projects', expect: /\/projects/ },
      { link: 'nav-analytics', expect: /\/analytics/ },
      { link: 'nav-inbox', expect: /\/inbox/ },
      { link: 'nav-issues', expect: /\/issues/ },
    ];

    for (const section of sections) {
      await page.getByTestId(section.link).click();
      await expect(page).toHaveURL(section.expect);
      // Each page renders real content, never a crash or error screen.
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByText('This view crashed')).toHaveCount(0);
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expect(page.getByText('Could not load')).toHaveCount(0);
    }

    // Cycles live in their own sidebar section.
    await page.getByRole('link', { name: 'All cycles' }).click();
    await expect(page).toHaveURL(/\/cycles/);
    await expect(page.getByTestId('create-cycle')).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('board renders every workflow column with cards', async ({ page, consoleErrors }) => {
    await page.goto('/board');
    await expect(page.getByTestId('board-column-backlog')).toBeVisible();
    await expect(page.getByTestId('board-column-todo')).toBeVisible();
    await expect(page.getByTestId('board-column-in_progress')).toBeVisible();
    await expect(page.getByTestId('board-column-done')).toBeVisible();

    const cards = page.locator('[data-testid^="board-card-"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(5);

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('projects list shows progress for seeded projects', async ({ page, consoleErrors }) => {
    await page.goto('/projects');
    await expect(page.getByTestId('create-project')).toBeVisible();

    const cards = page.locator('[data-testid^="project-card-"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
    await expect(cards.filter({ hasText: 'Payments Platform' })).toHaveCount(1);
    // Progress bars are driven by real issue counts.
    await expect(page.locator('[role="progressbar"]').first()).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('cycles page separates active, upcoming and completed', async ({ page, consoleErrors }) => {
    await page.goto('/cycles');
    const cards = page.locator('[data-testid^="cycle-card-"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    await expect(page.getByText('Active').first()).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('analytics renders charts built from real data', async ({ page, consoleErrors }) => {
    await page.goto('/analytics');
    await expect(page.getByText('Issues created vs completed')).toBeVisible();
    await expect(page.getByText('Workload per member')).toBeVisible();
    // Recharts renders SVG; at least one chart must have produced geometry.
    await expect
      .poll(async () => page.locator('svg .recharts-line, svg .recharts-bar, svg .recharts-area').count(), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('inbox lists notifications for the seeded user', async ({ page, consoleErrors }) => {
    await page.goto('/inbox');
    const items = page.locator('[data-testid^="inbox-item-"]');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(0);
    await expect(page.getByTestId('mark-all-read')).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('issue detail, project detail and cycle detail all resolve', async ({ page, consoleErrors }) => {
    // Pick a real identifier from the list so the deep link is exercised.
    await page.goto('/issues');
    const firstRow = page.locator('[data-testid^="issue-row-"]').first();
    await expect(firstRow).toBeVisible();
    const identifier = (await firstRow.getAttribute('data-testid'))!.replace('issue-row-', '');

    await page.goto(`/issues/${identifier}`);
    await expect(page.getByTestId('issue-detail-title')).toBeVisible();
    await expect(page.getByText('Activity')).toBeVisible();

    await page.goto('/projects');
    const projectCard = page.locator('[data-testid^="project-card-"]').first();
    await expect(projectCard).toBeVisible();
    await projectCard.click();
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page.getByText('Progress')).toBeVisible();

    await page.goto('/cycles');
    const cycleCard = page.locator('[data-testid^="cycle-card-"]').first();
    await expect(cycleCard).toBeVisible();
    await cycleCard.getByRole('link', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/cycles\/[a-z0-9]+/);
    await expect(page.getByRole('heading', { name: /Burndown/ })).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('unknown routes render the not-found screen, not a crash', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByText('This page drifted out of orbit')).toBeVisible();
  });
});
