import type { Page } from '@playwright/test';
import { dragAndDrop, expect, loginAs, test, DEMO_USERS, unique } from './helpers';

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
    const issueId = (await row.getAttribute('data-issue-id'))!;
    expect(identifier).toMatch(/^[A-Z]{2,5}-\d+$/);

    // Put the issue in a column that is on screen next to Done. The board
    // scrolls horizontally, so a card in the first column starts the drag from
    // a position that is pushed out of the viewport once Done is in view.
    const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4100';
    const workspaceId = await apiWorkspaceId(tabA);
    const moved = await tabA.request.patch(
      `${apiUrl}/api/workspaces/${workspaceId}/issues/${issueId}`,
      { data: { status: 'in_progress' } },
    );
    expect(moved.status()).toBe(200);

    // Tab B opens the board and waits for its socket to connect.
    await tabB.goto('/board');
    await expect(tabB.getByTestId(`board-card-${identifier}`)).toBeVisible({ timeout: 20_000 });

    // Tab A moves the issue to Done by dragging the card.
    await tabA.goto('/board');
    const cardA = tabA.getByTestId(`board-card-${identifier}`);
    await expect(cardA).toBeVisible({ timeout: 20_000 });
    await tabA.getByTestId('board-column-done').scrollIntoViewIfNeeded();
    await expect(cardA).toBeVisible();
    await dragAndDrop(tabA, cardA, tabA.getByTestId('board-column-done'));
    await expect(
      tabA.getByTestId('board-column-done').getByTestId(`board-card-${identifier}`),
    ).toBeVisible({ timeout: 20_000 });

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

  test('the realtime socket connects to the API and stays open', async ({ page }) => {
    const sockets: string[] = [];
    page.on('websocket', (socket) => sockets.push(socket.url()));

    await loginAs(page, DEMO_USERS.owner.email);
    await page.goto('/issues');

    // A live connection hides the "Reconnecting"/"Offline" badge entirely.
    await expect(page.getByTestId('realtime-status')).toHaveCount(0, { timeout: 20_000 });

    // The socket must target the API's realtime path, not the client origin.
    const realtime = sockets.filter((url) => url.includes('/api/realtime'));
    expect(realtime.length, `sockets seen: ${sockets.join(', ')}`).toBeGreaterThan(0);
    expect(realtime.every((url) => url.includes('workspaceId='))).toBe(true);
  });
});

/** Resolves the active workspace id through the API. */
async function apiWorkspaceId(page: Page): Promise<string> {
  const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4100';
  const response = await page.request.get(`${apiUrl}/api/workspaces`);
  const payload = (await response.json()) as { workspaces: { id: string; slug: string }[] };
  const workspace =
    payload.workspaces.find((entry) => entry.slug === 'orbit-labs') ?? payload.workspaces[0];
  if (!workspace) throw new Error('no workspace available for the E2E user');
  return workspace.id;
}
