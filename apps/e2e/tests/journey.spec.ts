import type { Page } from '@playwright/test';
import { dragAndDrop, expect, loginAs, test, DEMO_USERS, unique } from './helpers';

/**
 * The mandated end-to-end journey: login → create project → create issue →
 * edit issue → drag on the kanban → comment → reload to verify persistence →
 * search → role permissions → logout.
 *
 * These tests exercise the real API and database (no network stubbing), so they
 * are the strongest signal that the product actually works.
 */
test.describe('core product journey', () => {
  test('login, create project, create issue, edit, drag, comment, persist, search, permissions, logout', async ({
    page,
    consoleErrors,
  }) => {
    const projectName = unique('E2E Project');
    const issueTitle = unique('E2E issue');

    // ---------------------------------------------------------------- 1. login
    await test.step('1. login with a seeded account', async () => {
      await loginAs(page, DEMO_USERS.owner.email);
      await expect(page.getByTestId('workspace-switcher')).toContainText('Orbit Labs');
    });

    // ------------------------------------------------------- 2. create project
    await test.step('2. create a project', async () => {
      await page.goto('/projects');
      await page.getByTestId('create-project').click();
      await page.getByTestId('project-name-input').fill(projectName);
      await page
        .getByRole('dialog')
        .getByPlaceholder('What is this project responsible for?')
        .fill('Created by the Playwright end-to-end journey.');
      await page.getByTestId('create-project-submit').click();

      // The dialog closes and the new project appears in the list.
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 15_000 });
    });

    // --------------------------------------------------------- 3. create issue
    await test.step('3. create an issue inside the project', async () => {
      await page.goto('/issues');
      await page.getByTestId('header-create-issue').click();
      await page.getByTestId('issue-title-input').fill(issueTitle);
      await page
        .getByTestId('issue-description-input')
        .fill('## Context\n\nCreated by the E2E journey so the flow is covered end to end.');
      await page.getByTestId('issue-submit').click();

      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText(issueTitle).first()).toBeVisible({ timeout: 15_000 });
    });

    // Grab the generated identifier so later steps can deep-link to it.
    const issueLink = page.getByRole('link', { name: new RegExp(issueTitle) }).first();
    const issueRow = page
      .locator('[data-testid^="issue-row-"]')
      .filter({ hasText: issueTitle })
      .first();
    const identifier =
      (await issueRow.getAttribute('data-testid'))?.replace('issue-row-', '') ?? '';
    expect(identifier, 'created issue should expose an ORB-style identifier').toMatch(
      /^[A-Z]{2,5}-\d+$/,
    );
    void issueLink;

    // ----------------------------------------------------------- 4. edit issue
    await test.step('4. open the issue, edit the title and metadata', async () => {
      await page.goto(`/issues/${identifier}`);
      await expect(page.getByTestId('issue-detail-title')).toBeVisible();

      const editedTitle = `${issueTitle} (edited)`;
      const titleInput = page.getByTestId('issue-detail-title');
      await titleInput.fill(editedTitle);

      // Autosave fires on blur; wait for the PATCH to be acknowledged before
      // reloading, otherwise the assertion can race the request.
      const saved = page.waitForResponse(
        (response) => response.request().method() === 'PATCH' && response.status() === 200,
        { timeout: 20_000 },
      );
      await titleInput.blur();
      await saved;

      // Reload to prove the title came from the database, not local state.
      await page.reload();
      await expect(page.getByTestId('issue-detail-title')).toHaveValue(editedTitle);

      // Change the status through the metadata sidebar (also persisted).
      const statusSaved = page.waitForResponse(
        (response) => response.request().method() === 'PATCH' && response.status() === 200,
        { timeout: 20_000 },
      );
      await page.getByLabel('Status', { exact: true }).click();
      await page.getByTestId('menu-panel').getByRole('menuitem', { name: 'In Progress' }).click();
      await statusSaved;

      await page.reload();
      await expect(page.getByLabel('Status', { exact: true })).toContainText('In Progress');
    });

    // -------------------------------------------------------------- 5. comment
    await test.step('5. add a comment', async () => {
      await page
        .getByTestId('comment-input')
        .fill('End-to-end comment: this must survive a reload.');
      await page.getByTestId('comment-submit').click();
      await expect(page.getByText('End-to-end comment: this must survive a reload.')).toBeVisible({
        timeout: 15_000,
      });
      // The activity feed records the comment.
      await expect(page.getByTestId('activity-feed')).toContainText('commented');
    });

    // ------------------------------------------------------------- 6. drag card
    await test.step('6. drag the issue between kanban columns', async () => {
      // Put the issue in a column that is on screen next to Done. The board
      // scrolls horizontally, so a card in the first column would be pushed out
      // of the viewport once Done is scrolled into view — and a pointer drag
      // cannot start on an element that is off screen.
      await page.goto(`/issues/${identifier}`);
      await page.getByLabel('Status', { exact: true }).click();
      await page.getByTestId('menu-panel').getByRole('menuitem', { name: 'In Progress' }).click();
      await expect(page.getByLabel('Status', { exact: true })).toContainText('In Progress', {
        timeout: 15_000,
      });

      await page.goto('/board');
      const card = page.getByTestId(`board-card-${identifier}`);
      await expect(card).toBeVisible({ timeout: 20_000 });

      const target = page.getByTestId('board-column-done');
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await expect(card).toBeVisible();

      await dragAndDrop(page, card, target);

      // The card must land in the Done column and the move must persist.
      await expect(
        page.getByTestId('board-column-done').getByTestId(`board-card-${identifier}`),
      ).toBeVisible({
        timeout: 20_000,
      });

      await page.reload();
      await expect(
        page.getByTestId('board-column-done').getByTestId(`board-card-${identifier}`),
      ).toBeVisible({
        timeout: 20_000,
      });

      // The move is persisted server-side, not just in the local cache.
      const persisted = await apiStatus(page, await currentIssueId(page, identifier));
      expect(persisted).toBe('done');
    });

    // ----------------------------------------------------- 7. verify persistence
    await test.step('7. verify persistence after a fresh reload', async () => {
      await page.goto(`/issues/${identifier}`);
      await expect(page.getByTestId('issue-detail-title')).toHaveValue(`${issueTitle} (edited)`);
      await expect(page.getByLabel('Status', { exact: true })).toContainText('Done');
      await expect(page.getByText('End-to-end comment: this must survive a reload.')).toBeVisible();
    });

    // ------------------------------------------------------------- 8. search
    await test.step('8. search for the issue globally', async () => {
      await page.goto('/search');
      await page.getByTestId('global-search').fill(issueTitle);
      await expect(page.getByText(new RegExp(issueTitle)).first()).toBeVisible({ timeout: 15_000 });

      // Identifier search also resolves.
      await page.getByTestId('global-search').fill(identifier);
      await expect(page.getByText(new RegExp(identifier)).first()).toBeVisible({ timeout: 15_000 });

      // The command palette finds it too.
      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();
      await page.getByLabel('Command palette search').fill(identifier);
      await expect(page.getByRole('option', { name: new RegExp(identifier) }).first()).toBeVisible({
        timeout: 15_000,
      });
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('command-palette')).toBeHidden();
    });

    // ------------------------------------------------------- 9. role permissions
    await test.step('9. a viewer can read and comment but cannot edit', async () => {
      // Owner first: the issue is editable.
      await page.goto(`/issues/${identifier}`);
      await expect(page.getByTestId('issue-detail-title')).not.toHaveAttribute('readonly', '');

      // Switch to the seeded viewer.
      await page.goto('/settings/profile');
      await page.getByLabel('Account menu').click();
      await page.getByRole('menuitem', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

      await loginAs(page, DEMO_USERS.viewer.email);

      // Viewer can open the issue and can comment…
      await page.goto(`/issues/${identifier}`);
      await expect(page.getByTestId('issue-detail-title')).toBeVisible();
      await expect(page.getByTestId('comment-input')).toBeVisible();

      // …but the title is read-only and the "New issue" CTA is gone.
      await expect(page.getByTestId('issue-detail-title')).toHaveAttribute('readonly', '');
      await expect(page.getByTestId('header-create-issue')).toHaveCount(0);

      // The board tells the viewer it is read-only.
      await page.goto('/board');
      await expect(page.getByTestId('board-readonly')).toBeVisible();

      // Backend enforcement: the raw API must reject the change with 403.
      const workspaceId = await currentWorkspaceId(page);
      const issueId = await currentIssueId(page, identifier);
      const response = await page.request.patch(
        `${API_URL}/api/workspaces/${workspaceId}/issues/${issueId}`,
        {
          data: { title: 'hacked by a viewer' },
        },
      );
      expect(response.status()).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe('forbidden');
    });

    // -------------------------------------------------------------- 10. logout
    await test.step('10. logout clears the session', async () => {
      await page.goto('/issues');
      await page.getByLabel('Account menu').click();
      await page.getByRole('menuitem', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

      // Protected routes now redirect to the login screen.
      await page.goto('/issues');
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

      // The session cookie is gone: the API reports no user.
      const me = await page.request.get(`${API_URL}/api/auth/me`);
      expect(me.status()).toBe(200);
      const payload = (await me.json()) as { user: unknown };
      expect(payload.user).toBeNull();

      // A protected endpoint is rejected.
      const protectedResponse = await page.request.get(`${API_URL}/api/workspaces`);
      expect(protectedResponse.status()).toBe(401);
    });

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });
});

/**
 * Base URL of the API under test. Playwright's `page.request` resolves relative
 * URLs against the *web* baseURL, which would return the SPA shell.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4100';

/** Resolves the active workspace id through the real API. */
async function currentWorkspaceId(page: Page): Promise<string> {
  const response = await page.request.get(`${API_URL}/api/workspaces`);
  const payload = (await response.json()) as { workspaces: { id: string; slug: string }[] };
  const workspace =
    payload.workspaces.find((entry) => entry.slug === 'orbit-labs') ?? payload.workspaces[0];
  if (!workspace) throw new Error('no workspace available for the E2E user');
  return workspace.id;
}

/** Reads an issue's persisted status straight from the API. */
async function apiStatus(page: Page, issueId: string): Promise<string> {
  const workspaceId = await currentWorkspaceId(page);
  const response = await page.request.get(
    `${API_URL}/api/workspaces/${workspaceId}/issues/${issueId}`,
  );
  const payload = (await response.json()) as { issue: { status: string } };
  return payload.issue.status;
}

/** Resolves an issue's internal id from its identifier. */
async function currentIssueId(page: Page, identifier: string): Promise<string> {
  const workspaceId = await currentWorkspaceId(page);
  const response = await page.request.get(
    `${API_URL}/api/workspaces/${workspaceId}/issues/by-identifier/${identifier}`,
  );
  const payload = (await response.json()) as { issue: { id: string } };
  return payload.issue.id;
}
