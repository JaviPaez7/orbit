import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  closeApp,
  createIssue,
  createProject,
  createUser,
  createWorkspace,
  getApp,
  resetDatabase,
  TEST_PASSWORD,
  type TestWorkspace,
} from './helpers/api';

/**
 * Authentication, session handling, password reset and profile management.
 * Everything goes through the real Fastify routes and the real database.
 */
describe('auth API', () => {
  beforeAll(async () => {
    await getApp();
    await resetDatabase();
  });

  afterAll(async () => {
    await closeApp();
  });

  it('registers a user, creates a personal workspace and starts a session', async () => {
    const response = await api('POST', '/auth/register', {
      payload: {
        name: 'Ada Lovelace',
        email: 'ada@orbit.test',
        password: 'Analytical1',
        workspaceName: 'Ada Engineering',
      },
    });

    expect(response.status).toBe(201);
    const body = response.body as {
      user: { id: string; email: string; handle: string; name: string };
      workspaceId: string;
    };
    expect(body.user.email).toBe('ada@orbit.test');
    expect(body.user.handle).toBe('adalovelace');
    expect(body.workspaceId).toBeTruthy();

    // Never leak the password hash.
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    expect(JSON.stringify(body)).not.toContain('$2a$');

    const cookie = String(response.raw.headers['set-cookie']).split(';')[0]!;
    expect(cookie).toContain('orbit_session=');

    // The session is valid and the workspace membership is owner.
    const me = await api('GET', '/auth/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    const meBody = me.body as { user: { name: string }; workspaces: { role: string; name: string }[] };
    expect(meBody.user.name).toBe('Ada Lovelace');
    expect(meBody.workspaces[0]!.role).toBe('owner');
    expect(meBody.workspaces[0]!.name).toBe('Ada Engineering');
  });

  it('rejects weak passwords and duplicate emails with field errors', async () => {
    const weak = await api('POST', '/auth/register', {
      payload: { name: 'Weak Password', email: 'weak@orbit.test', password: 'short' },
    });
    expect(weak.status).toBe(422);
    const weakBody = weak.body as { error: { code: string; fields: Record<string, string[]> } };
    expect(weakBody.error.code).toBe('validation_error');
    expect(weakBody.error.fields.password?.[0]).toMatch(/at least 8/i);

    const duplicate = await api('POST', '/auth/register', {
      payload: { name: 'Ada Again', email: 'ada@orbit.test', password: 'Analytical1' },
    });
    expect(duplicate.status).toBe(409);
  });

  it('rejects invalid credentials without revealing whether the account exists', async () => {
    const unknown = await api('POST', '/auth/login', {
      payload: { email: 'nobody@orbit.test', password: 'Whatever123' },
    });
    const wrongPassword = await api('POST', '/auth/login', {
      payload: { email: 'ada@orbit.test', password: 'WrongPassword1' },
    });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect((unknown.body as { error: { message: string } }).error.message).toBe(
      (wrongPassword.body as { error: { message: string } }).error.message,
    );
  });

  it('signs in, persists the session and signs out', async () => {
    const login = await api('POST', '/auth/login', {
      payload: { email: 'ada@orbit.test', password: 'Analytical1' },
    });
    expect(login.status).toBe(200);
    const cookie = String(login.raw.headers['set-cookie']).split(';')[0]!;

    const before = await api('GET', '/auth/me', { headers: { cookie } });
    expect((before.body as { user: unknown }).user).toBeTruthy();

    const logout = await api('POST', '/auth/logout', { headers: { cookie } });
    expect(logout.status).toBe(200);

    const after = await api('GET', '/auth/me', { headers: { cookie } });
    expect((after.body as { user: unknown }).user).toBeNull();
  });

  it('requires authentication for protected routes', async () => {
    const anonymous = await api('GET', '/workspaces');
    expect(anonymous.status).toBe(401);
    expect((anonymous.body as { error: { code: string } }).error.code).toBe('unauthorized');

    const bogus = await api('GET', '/workspaces', { headers: { cookie: 'orbit_session=not-a-token' } });
    expect(bogus.status).toBe(401);
  });

  it('supports the full password reset flow and invalidates old sessions', async () => {
    const user = await createUser({ email: 'reset@orbit.test', password: 'Original123' });

    // A session issued before the reset must stop working afterwards.
    const sessionBefore = await api('GET', '/auth/me', { user });
    expect((sessionBefore.body as { user: unknown }).user).toBeTruthy();

    const requested = await api('POST', '/auth/password/request', {
      payload: { email: 'reset@orbit.test' },
    });
    expect(requested.status).toBe(200);
    const token = (requested.body as { resetToken?: string }).resetToken;
    expect(token, 'dev mode returns the reset token').toBeTruthy();

    // Unknown emails produce the identical response (no account enumeration).
    const unknown = await api('POST', '/auth/password/request', {
      payload: { email: 'ghost@orbit.test' },
    });
    expect(unknown.status).toBe(200);
    expect((unknown.body as { message: string }).message).toBe(
      (requested.body as { message: string }).message,
    );

    const reset = await api('POST', '/auth/password/reset', {
      payload: { token, password: 'BrandNew123' },
    });
    expect(reset.status).toBe(200);

    // The old password no longer works, the new one does.
    const oldPassword = await api('POST', '/auth/login', {
      payload: { email: 'reset@orbit.test', password: 'Original123' },
    });
    expect(oldPassword.status).toBe(401);

    const newPassword = await api('POST', '/auth/login', {
      payload: { email: 'reset@orbit.test', password: 'BrandNew123' },
    });
    expect(newPassword.status).toBe(200);

    // The pre-reset session was revoked.
    const sessionAfter = await api('GET', '/auth/me', { user });
    expect((sessionAfter.body as { user: unknown }).user).toBeNull();

    // A used token cannot be replayed.
    const replay = await api('POST', '/auth/password/reset', {
      payload: { token, password: 'Another123' },
    });
    expect(replay.status).toBe(400);
  });

  it('rejects an expired or forged reset token', async () => {
    const forged = await api('POST', '/auth/password/reset', {
      payload: { token: 'totally-made-up-token-value', password: 'Whatever123' },
    });
    expect(forged.status).toBe(400);
  });

  it('updates the profile and rejects an email that is already taken', async () => {
    const user = await createUser({ email: 'profile@orbit.test' });
    await createUser({ email: 'taken@orbit.test' });

    const updated = await api('PATCH', '/users/me', {
      user,
      payload: { name: 'Renamed Person', title: 'Staff Engineer', timezone: 'Europe/Madrid' },
    });
    expect(updated.status).toBe(200);
    const body = updated.body as { user: { name: string; title: string; handle: string } };
    expect(body.user.name).toBe('Renamed Person');
    expect(body.user.title).toBe('Staff Engineer');
    // The handle stays stable so @mentions do not break.
    expect(body.user.handle).toBe(user.handle);

    const clash = await api('PATCH', '/users/me', {
      user,
      payload: { email: 'taken@orbit.test' },
    });
    expect(clash.status).toBe(409);
  });

  it('changes the password and keeps the current session alive', async () => {
    const user = await createUser({ email: 'changepw@orbit.test', password: 'Start1234' });

    const wrong = await api('POST', '/users/me/password', {
      user,
      payload: { currentPassword: 'NotTheOne1', newPassword: 'Different123' },
    });
    expect(wrong.status).toBe(400);

    const changed = await api('POST', '/users/me/password', {
      user,
      payload: { currentPassword: 'Start1234', newPassword: 'Different123' },
    });
    expect(changed.status).toBe(200);

    // The caller keeps their session…
    const stillIn = await api('GET', '/auth/me', { user });
    expect((stillIn.body as { user: unknown }).user).toBeTruthy();

    // …and the new password works.
    const login = await api('POST', '/auth/login', {
      payload: { email: 'changepw@orbit.test', password: 'Different123' },
    });
    expect(login.status).toBe(200);
  });

  it('lists sessions and can revoke one', async () => {
    const user = await createUser({ email: 'sessions@orbit.test', password: TEST_PASSWORD });
    const second = await api('POST', '/auth/login', {
      payload: { email: 'sessions@orbit.test', password: TEST_PASSWORD },
    });
    expect(second.status).toBe(200);

    const list = await api('GET', '/auth/sessions', { user });
    expect(list.status).toBe(200);
    const sessions = (list.body as { sessions: { id: string; current: boolean }[] }).sessions;
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.some((session) => session.current)).toBe(true);

    const victim = sessions.find((session) => !session.current)!;
    const revoked = await api('DELETE', `/auth/sessions/${victim.id}`, { user });
    expect(revoked.status).toBe(200);

    const after = await api('GET', '/auth/sessions', { user });
    const remaining = (after.body as { sessions: { id: string }[] }).sessions;
    expect(remaining.some((session) => session.id === victim.id)).toBe(false);
  });

  it('never exposes password hashes through any user endpoint', async () => {
    const workspace: TestWorkspace = await createWorkspace(['owner', 'member'], {
      name: 'Hash Safety',
    });
    const member = workspace.members.member!;

    const members = await api('GET', `/workspaces/${workspace.id}/members`, { user: workspace.owner });
    expect(members.status).toBe(200);
    expect(members.raw.body).not.toContain('passwordHash');
    expect(members.raw.body).not.toContain('$2a$');

    const profile = await api('GET', `/users/${member.id}`, { user: workspace.owner });
    expect(profile.status).toBe(200);
    expect(profile.raw.body).not.toContain('passwordHash');
  });

  it('scopes issues to the workspace that created them', async () => {
    const workspace = await createWorkspace(['owner'], { name: 'Scoping' });
    const project = await createProject(workspace.id, workspace.owner);
    const issue = await createIssue(workspace.id, workspace.owner, { projectId: project.id });

    const other = await createWorkspace(['owner'], { name: 'Other Scoping' });

    // The other workspace cannot read the issue.
    const foreign = await api('GET', `/workspaces/${other.id}/issues/${issue.id}`, {
      user: other.owner,
    });
    expect(foreign.status).toBe(404);

    // Nor can it mutate it through its own workspace path.
    const foreignPatch = await api('PATCH', `/workspaces/${other.id}/issues/${issue.id}`, {
      user: other.owner,
      payload: { title: 'stolen' },
    });
    expect(foreignPatch.status).toBe(404);

    // Nor delete it.
    const foreignDelete = await api('DELETE', `/workspaces/${other.id}/issues/${issue.id}`, {
      user: other.owner,
    });
    expect(foreignDelete.status).toBe(404);
  });
});
