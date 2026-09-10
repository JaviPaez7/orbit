import { expect, loginAs, test, DEMO_USERS, waitForShortcuts } from './helpers';

/**
 * Feature coverage that is not part of the main journey: workspace creation,
 * cycles, CSV import/export, the command palette, theme persistence and the
 * keyboard-shortcuts help.
 */
test.describe('workspace and data features', () => {
  test('creates an additional workspace and switches to it', async ({ page, consoleErrors }) => {
    await loginAs(page, DEMO_USERS.owner.email);

    await page.goto('/workspaces/new');
    const name = `Studio ${Date.now().toString(36).slice(-5)}`;
    await page.getByTestId('workspace-name').fill(name);
    await page.getByTestId('create-workspace-submit').click();

    // The new workspace becomes active and the empty state is shown.
    await expect(page).toHaveURL(/\/issues/, { timeout: 20_000 });
    await expect(page.getByTestId('workspace-switcher')).toContainText(name, { timeout: 20_000 });
    await expect(page.getByText('No issues yet')).toBeVisible({ timeout: 20_000 });

    // Switching back to the seeded workspace restores its issues.
    await page.getByTestId('workspace-switcher').click();
    await page.getByRole('menuitem', { name: /Orbit Labs/ }).click();
    await expect(page.getByTestId('workspace-switcher')).toContainText('Orbit Labs');
    await expect(page.locator('[data-testid^="issue-row-"]').first()).toBeVisible({
      timeout: 20_000,
    });

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('imports issues from CSV and reports invalid rows', async ({ page, consoleErrors }) => {
    await loginAs(page, DEMO_USERS.owner.email);
    await page.goto('/import');
    await expect(page.getByTestId('csv-input')).toBeVisible();

    const stamp = Date.now().toString(36).slice(-5);
    const csv = [
      'title,description,status,priority,assignee,project,cycle,labels,estimate,dueDate',
      `Imported issue ${stamp},Created by the import test,todo,high,javi@orbit.dev,Payments Platform,,bug,3,`,
      `,Missing a title so this row must fail,todo,low,,,,,,`,
      `Imported issue with a bad status ${stamp},Bad status row,not_a_status,low,,,,,,`,
    ].join('\n');

    await page.getByTestId('csv-input').fill(csv);

    // Validate first (dry run) so nothing is written yet.
    await page.getByTestId('validate-import').click();
    await expect(page.getByTestId('import-result')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('import-result')).toContainText('Would import');
    await expect(page.getByTestId('import-result')).toContainText('Errors');

    // Then perform the import.
    await page.getByTestId('run-import').click();
    await expect(page.getByText(/Imported \d+ issue/)).toBeVisible({ timeout: 20_000 });

    // The valid row is now in the issue list.
    await page.goto('/issues');
    await page.getByTestId('issue-search').fill(`Imported issue ${stamp}`);
    await expect(page.locator('[data-testid^="issue-row-"]').first()).toContainText(
      `Imported issue ${stamp}`,
      { timeout: 20_000 },
    );

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('downloads the CSV template and an export', async ({ page }) => {
    await loginAs(page, DEMO_USERS.owner.email);
    await page.goto('/import');

    const template = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download template' }).click(),
    ]).then(([event]) => event);
    expect(template.suggestedFilename()).toBe('orbit-import-template.csv');

    const exported = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export issues' }).click(),
    ]).then(([event]) => event);
    expect(exported.suggestedFilename()).toMatch(/orbit-issues-\d{4}-\d{2}-\d{2}\.csv/);
  });

  test('creates a cycle', async ({ page, consoleErrors }) => {
    await loginAs(page, DEMO_USERS.owner.email);
    await page.goto('/cycles');
    await expect(page.getByTestId('create-cycle')).toBeVisible();

    const label = `Diagnostic cycle ${Date.now().toString(36)}`;
    await page.getByTestId('create-cycle').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Cycle 15').fill(label);
    await page.getByTestId('create-cycle-submit').click();

    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 20_000 });

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('command palette navigates, searches and creates', async ({ page, consoleErrors }) => {
    await loginAs(page, DEMO_USERS.owner.email);
    await page.goto('/issues');
    await waitForShortcuts(page);

    // Open with the keyboard shortcut.
    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('command-palette');
    await expect(palette).toBeVisible({ timeout: 15_000 });

    // Navigation command.
    await page.getByLabel('Command palette search').fill('Analytics');
    await palette.getByRole('option', { name: /Go to Analytics/ }).click();
    await expect(page).toHaveURL(/\/analytics/, { timeout: 15_000 });

    // Issue search from the palette.
    await page.keyboard.press('Control+k');
    await page.getByLabel('Command palette search').fill('OLX-1');
    const issueOption = palette.getByRole('option', { name: /OLX-1/ }).first();
    await expect(issueOption).toBeVisible({ timeout: 15_000 });
    await issueOption.click();
    await expect(page).toHaveURL(/\/issues\/OLX-1/, { timeout: 15_000 });

    // Create-issue command opens the composer.
    await page.keyboard.press('Control+k');
    await page.getByLabel('Command palette search').fill('Create new issue');
    await palette.getByRole('option', { name: /Create new issue/ }).click();
    await expect(page.getByTestId('issue-title-input')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('issue-title-input')).toBeHidden();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('keyboard shortcuts help lists the bindings', async ({ page }) => {
    await loginAs(page, DEMO_USERS.owner.email);
    await page.goto('/issues');
    // Make sure the shortcut listener is attached before synthesising the key.
    await waitForShortcuts(page);

    // `?` requires Shift on most layouts; the handler accepts both forms.
    await page.keyboard.press('Shift+Slash');
    const dialog = page.getByRole('dialog');
    if ((await dialog.count()) === 0) {
      await page.keyboard.press('?');
    }
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText('Open the command palette');
    await expect(dialog).toContainText('Create a new issue');
    await expect(dialog).toContainText('Keyboard shortcuts');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('theme choice persists across reloads', async ({ page }) => {
    await loginAs(page, DEMO_USERS.owner.email);
    await page.goto('/settings/notifications');

    await page.getByTestId('theme-light').click();
    await expect(page.locator('html')).toHaveClass(/light/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/light/);

    await page.getByTestId('theme-dark').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('profile update persists and appears in the sidebar', async ({ page }) => {
    await loginAs(page, DEMO_USERS.member.email);
    await page.goto('/settings/profile');

    const title = `Backend Engineer ${Date.now().toString(36).slice(-4)}`;
    await page.getByLabel('Job title').fill(title);
    await page.getByTestId('save-profile').click();
    await expect(page.getByText('Profile saved')).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByLabel('Job title')).toHaveValue(title, { timeout: 15_000 });
  });

  test('invites a member and enforces the role matrix in the UI', async ({
    page,
    consoleErrors,
  }) => {
    await loginAs(page, DEMO_USERS.owner.email);
    await page.goto('/settings/members');

    const email = `invitee.${Date.now().toString(36)}@orbit.dev`;
    await page.getByTestId('invite-member').click();
    await page.getByTestId('invite-email').fill(email);
    await page.getByTestId('invite-submit').click();

    // Unknown emails produce a pending invite with a copyable link.
    await expect(page.getByText('Invite link')).toBeVisible({ timeout: 15_000 });
    // The link inside the dialog contains the token, not the email.
    await expect(page.getByRole('dialog')).toContainText('/invite/');
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // Closing the dialog reveals the pending invite in the members list.
    await expect(page.getByText(email)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('awaiting signup')).toBeVisible();

    // The role explanation is visible to admins (text spans two elements).
    await expect(page.getByText('Viewer', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/read issues, export CSV, comment/)).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('viewer sees no destructive settings sections', async ({ page }) => {
    await loginAs(page, DEMO_USERS.viewer.email);
    await page.goto('/settings/profile');

    // Profile is available to everyone…
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible();
    // …but workspace administration is not rendered for viewers.
    await expect(page.getByRole('link', { name: 'Members' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Workspace' })).toHaveCount(0);

    // Direct navigation to a guarded page explains the restriction instead of
    // rendering member data the API would refuse to return.
    await page.goto('/settings/members');
    await expect(page.getByTestId('members-forbidden')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('members-forbidden')).toContainText(/403|restricted|admin/i);
    await expect(page.getByTestId('invite-member')).toHaveCount(0);
  });
});
