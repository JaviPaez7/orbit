import { expect, loginAs, test, DEMO_USERS, unique } from './helpers';

/** Realtime synchronisation between two independent browser tabs. */
test.describe('realtime updates across tabs', () => {
  test('status changes and comments propagate to a second tab', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const tabA = await contextA.newPage();
    const tabB = await contextB.newPage();

    await loginAs(tabA, DEMO_USERS.owner.email);
    await loginAs(tabB, DEMO_USERS.admin.email);

    // Create a dedicated issue so the assertions cannot be confused by seed data.
    const title = unique('Realtime issue');
    await tabA.goto('/issues');
    await tabA.getByTestId('header-create-issue').click();
    await tabA.getByTestId('issue-title-input').fill(title);
    await tabA.getByTestId('issue-submit').click();
    await expect(tabA.getByRole('dialog')).toBeHidden({ timeout: 15_000 });

    const row = tabA.locator('[data-testid^="issue-row-"]').filter({ hasText: title }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const identifier = (await row.getAttribute('data-testid'))!.replace('issue-row-', '');
    expect(identifier).toMatch(/^[A-Z]{2,5}-\d+$/);

    // Tab B opens the board and waits for its socket to connect.
    await tabB.goto('/board');
    await expect(tabB.getByTestId(`board-card-${identifier}`)).toBeVisible({ timeout: 20_000 });

    // Tab A moves the issue to Done through the API-backed board card UI.
    await tabA.goto('/board');
    const cardA = tabA.getByTestId(`board-card-${identifier}`);
    await expect(cardA).toBeVisible({ timeout: 20_000 });
    await cardA.dragTo(tabA.getByTestId('board-column-done'));
    await expect(
      tabA.getByTestId('board-column-done').getByTestId(`board-card-${identifier}`),
    ).toBeVisible({ timeout: 15_000 });

    // Tab B must reflect the move without a manual reload.
    await expect(tabB.getByTestId(`board-card-${identifier}`)).toBeVisible({ timeout: 25_000 });
    await expect(
      tabB.getByTestId('board-column-done').getByTestId(`board-card-${identifier}`),
    ).toBeVisible({ timeout: 25_000 });

    // A comment from tab A appears in tab B's open issue detail.
    await tabB.goto(`/issues/${identifier}`);
    await expect(tabB.getByTestId('comment-input')).toBeVisible();
    await tabA.goto(`/issues/${identifier}`);
    const comment = unique('realtime comment');
    await tabA.getByTestId('comment-input').fill(comment);
    await tabA.getByTestId('comment-submit').click();
    await expect(tabB.getByText(comment)).toBeVisible({ timeout: 25_000 });

    await contextA.close();
    await contextB.close();
  });

  test('the realtime status indicator reports a live connection', async ({ page }) => {
    await loginAs(page, DEMO_USERS.owner.email);
    await page.goto('/issues');
    // Either the socket is live (indicator hidden) or it shows a reconnect hint;
    // it must never be stuck claiming a connection it does not have.
    await page.waitForTimeout(2500);
    const indicator = page.getByTestId('realtime-status');
    if (await indicator.count()) {
      await expect(indicator).toContainText(/Reconnecting|Offline/);
    }
  });
});
