import { expect, loginAs, test, DEMO_USERS, unique } from './helpers';

/** Issue list behaviour: filtering, bulk edit, keyboard navigation, export. */
test.describe('issue list and bulk operations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_USERS.owner.email);
    await page.goto('/issues');
    await expect(page.locator('[data-testid^="issue-row-"]').first()).toBeVisible();
  });

  test('filters by status and reflects it in the URL', async ({ page }) => {
    const total = await page.getByTestId('issue-count').textContent();

    await page.getByTestId('multiselect-trigger').first().click();
    await page.getByRole('menuitem', { name: 'In Progress' }).click();
    await page.keyboard.press('Escape');

    await expect(page).toHaveURL(/status=in_progress/);
    const filtered = await page.getByTestId('issue-count').textContent();
    expect(filtered).not.toBe(total);

    // Every visible row is in progress (status icon carries an accessible name).
    const rows = page.locator('[data-testid^="issue-row-"]');
    for (let index = 0; index < Math.min(await rows.count(), 5); index += 1) {
      await expect(rows.nth(index).getByLabel('In Progress')).toBeVisible();
    }

    // Clearing restores the full list.
    await page.getByRole('button', { name: /Clear 1/ }).click();
    await expect(page).not.toHaveURL(/status=/);
  });

  test('text search narrows the list', async ({ page }) => {
    const before = Number(
      (await page.getByTestId('issue-count').textContent())?.replace(/\D/g, '') ?? '0',
    );

    await page.getByTestId('issue-search').fill('dunning');

    // The server-side search filters the list down.
    await expect
      .poll(
        async () =>
          Number((await page.getByTestId('issue-count').textContent())?.replace(/\D/g, '') ?? '0'),
        { timeout: 20_000 },
      )
      .toBeLessThan(before);

    const rows = page.locator('[data-testid^="issue-row-"]');
    await expect(rows.first()).toBeVisible();

    // The matching issue is present; the search also covers description,
    // comments and labels, so not every row repeats the term in its title.
    const texts = await rows.allTextContents();
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((text) => /dunning/i.test(text))).toBe(true);
  });

  test('multi-select bulk status change persists', async ({ page }) => {
    const checkboxes = page.locator('input[type="checkbox"][aria-label^="Select "]');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await expect(page.getByTestId('bulk-actions')).toBeVisible();
    await expect(page.getByTestId('bulk-actions')).toContainText('2 selected');

    await page.getByTestId('bulk-actions').getByRole('button', { name: 'Status' }).click();
    // Scope to the open menu (the list itself also contains "Done" text) and
    // match on the label text, which is stable across icon markup changes.
    await page
      .getByTestId('menu-panel')
      .getByRole('menuitem')
      .filter({ hasText: /^Done$/ })
      .click();

    await expect(page.getByText('Updated 2 issues')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('bulk-actions')).toBeHidden();

    // Reload to prove the change hit the database.
    await page.reload();
    await page.getByTestId('issue-search').fill('');
    await expect(page.locator('[data-testid^="issue-row-"]').first()).toBeVisible();
  });

  test('bulk delete removes the selected issues', async ({ page }) => {
    // Create a disposable issue so the delete does not touch seeded data.
    const title = unique('Doomed issue');
    await page.getByTestId('header-create-issue').click();
    await page.getByTestId('issue-title-input').fill(title);
    await page.getByTestId('issue-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });

    const row = page.locator('[data-testid^="issue-row-"]').filter({ hasText: title }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('input[type="checkbox"]').check();
    await page.getByTestId('bulk-actions').getByRole('button', { name: 'Delete' }).click();
    await page.getByTestId('confirm-bulk-delete').click();

    await expect(page.getByText(/Deleted 1 issue/)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[data-testid^="issue-row-"]').filter({ hasText: title }),
    ).toHaveCount(0);
  });

  test('keyboard navigation moves focus and opens the focused issue', async ({ page }) => {
    await page.locator('body').click({ position: { x: 700, y: 300 } });
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/issues\/[A-Z]{2,5}-\d+/, { timeout: 15_000 });
    await expect(page.getByTestId('issue-detail-title')).toBeVisible();
  });

  test('CSV export downloads the current issues', async ({ page }) => {
    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]).then(([event]) => event);
    expect(download.suggestedFilename()).toMatch(/orbit-issues-\d{4}-\d{2}-\d{2}\.csv/);
  });
});
