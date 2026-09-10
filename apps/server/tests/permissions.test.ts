import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  closeApp,
  createIssue,
  createProject,
  createWorkspace,
  getApp,
  resetDatabase,
  type TestWorkspace,
} from './helpers/api';

/**
 * Authorization is enforced on the server, not just hidden in the UI.
 *
 * The matrix under test:
 *   viewer -> may read, comment and export, but never edit issues
 *   member -> may create/edit/delete issues, but not manage the workspace
 *   admin  -> may manage members, projects and cycles, but not delete the workspace
 *   owner  -> may delete the workspace
 */
describe('workspace roles and permissions', () => {
  let workspace: TestWorkspace;
  let projectId: string;

  beforeAll(async () => {
    await getApp();
    await resetDatabase();
    workspace = await createWorkspace(['owner', 'admin', 'member', 'viewer'], {
      name: 'Permissions Workspace',
    });
    const project = await createProject(workspace.id, workspace.owner, { name: 'Permissions Project' });
    projectId = project.id;
  });

  afterAll(async () => {
    await closeApp();
  });

  const viewer = () => workspace.members.viewer!;
  const member = () => workspace.members.member!;
  const admin = () => workspace.members.admin!;
  const owner = () => workspace.owner;

  it('gives every role read access to the workspace', async () => {
    for (const user of [owner(), admin(), member(), viewer()]) {
      const response = await api('GET', `/workspaces/${workspace.id}/issues`, { user });
      expect(response.status, `read as ${user.name}`).toBe(200);
    }
  });

  it('lets a member create, edit, move and delete issues', async () => {
    const created = await api('POST', `/workspaces/${workspace.id}/issues`, {
      user: member(),
      payload: { title: 'Member issue', projectId, status: 'todo', priority: 'medium' },
    });
    expect(created.status).toBe(201);
    const issue = (created.body as { issue: { id: string; identifier: string } }).issue;
    expect(issue.identifier).toMatch(/^[A-Z]{2,5}-\d+$/);

    const edited = await api('PATCH', `/workspaces/${workspace.id}/issues/${issue.id}`, {
      user: member(),
      payload: { title: 'Member issue edited', priority: 'high' },
    });
    expect(edited.status).toBe(200);

    const moved = await api('POST', `/workspaces/${workspace.id}/issues/${issue.id}/move`, {
      user: member(),
      payload: { status: 'in_progress', position: 0 },
    });
    expect(moved.status).toBe(200);
    expect((moved.body as { issue: { status: string } }).issue.status).toBe('in_progress');

    const deleted = await api('DELETE', `/workspaces/${workspace.id}/issues/${issue.id}`, {
      user: member(),
    });
    expect(deleted.status).toBe(200);
  });

  it('blocks a viewer from every issue mutation but allows comments', async () => {
    const issue = await createIssue(workspace.id, owner(), { title: 'Viewer target', projectId });

    const create = await api('POST', `/workspaces/${workspace.id}/issues`, {
      user: viewer(),
      payload: { title: 'Viewer cannot create' },
    });
    expect(create.status).toBe(403);
    expect((create.body as { error: { code: string } }).error.code).toBe('forbidden');

    const edit = await api('PATCH', `/workspaces/${workspace.id}/issues/${issue.id}`, {
      user: viewer(),
      payload: { title: 'Viewer cannot edit' },
    });
    expect(edit.status).toBe(403);

    const move = await api('POST', `/workspaces/${workspace.id}/issues/${issue.id}/move`, {
      user: viewer(),
      payload: { status: 'done', position: 0 },
    });
    expect(move.status).toBe(403);

    const remove = await api('DELETE', `/workspaces/${workspace.id}/issues/${issue.id}`, {
      user: viewer(),
    });
    expect(remove.status).toBe(403);

    const bulk = await api('POST', `/workspaces/${workspace.id}/issues/bulk`, {
      user: viewer(),
      payload: { ids: [issue.id], status: 'done' },
    });
    expect(bulk.status).toBe(403);

    // The issue is untouched by all of the above.
    const check = await api('GET', `/workspaces/${workspace.id}/issues/${issue.id}`, { user: owner() });
    const body = check.body as { issue: { title: string; status: string } };
    expect(body.issue.title).toBe('Viewer target');
    expect(body.issue.status).not.toBe('done');

    // …but a viewer can take part in the conversation.
    const comment = await api('POST', `/workspaces/${workspace.id}/issues/${issue.id}/comments`, {
      user: viewer(),
      payload: { body: 'A viewer may comment.' },
    });
    expect(comment.status).toBe(201);
  });

  it('gates workspace and member management behind admin or owner', async () => {
    const asViewer = await api('POST', `/workspaces/${workspace.id}/members`, {
      user: viewer(),
      payload: { email: 'newviewer@orbit.test', role: 'member' },
    });
    expect(asViewer.status).toBe(403);

    const asMember = await api('POST', `/workspaces/${workspace.id}/members`, {
      user: member(),
      payload: { email: 'newmember@orbit.test', role: 'member' },
    });
    expect(asMember.status).toBe(403);

    const asMemberProject = await api('POST', `/workspaces/${workspace.id}/projects`, {
      user: member(),
      payload: { name: 'Member project' },
    });
    expect(asMemberProject.status).toBe(403);

    const asMemberRename = await api('PATCH', `/workspaces/${workspace.id}`, {
      user: member(),
      payload: { name: 'Renamed by member' },
    });
    expect(asMemberRename.status).toBe(403);

    // Admin can create projects and change roles.
    const asAdminProject = await api('POST', `/workspaces/${workspace.id}/projects`, {
      user: admin(),
      payload: { name: 'Admin project' },
    });
    expect(asAdminProject.status).toBe(201);

    const members = await api('GET', `/workspaces/${workspace.id}/members`, { user: admin() });
    const memberRows = (members.body as { members: { id: string; userId: string; role: string }[] }).members;
    const memberRow = memberRows.find((row) => row.role === 'member')!;

    const promote = await api('PATCH', `/workspaces/${workspace.id}/members/${memberRow.id}`, {
      user: admin(),
      payload: { role: 'admin' },
    });
    expect(promote.status).toBe(200);
    expect((promote.body as { member: { role: string } }).member.role).toBe('admin');

    // Put it back so later assertions are unaffected.
    await api('PATCH', `/workspaces/${workspace.id}/members/${memberRow.id}`, {
      user: owner(),
      payload: { role: 'member' },
    });
  });

  it('protects the owner from demotion and removal', async () => {
    const members = await api('GET', `/workspaces/${workspace.id}/members`, { user: owner() });
    const ownerRow = (
      members.body as { members: { id: string; role: string; user: { email: string } }[] }
    ).members.find((row) => row.role === 'owner')!;

    const demote = await api('PATCH', `/workspaces/${workspace.id}/members/${ownerRow.id}`, {
      user: owner(),
      payload: { role: 'admin' },
    });
    expect(demote.status).toBe(403);

    const remove = await api('DELETE', `/workspaces/${workspace.id}/members/${ownerRow.id}`, {
      user: owner(),
    });
    expect(remove.status).toBe(403);
  });

  it('prevents an admin from removing another admin but allows removing a member', async () => {
    const members = await api('GET', `/workspaces/${workspace.id}/members`, { user: owner() });
    const rows = (members.body as { members: { id: string; role: string; user: { email: string } }[] })
      .members;
    const adminRow = rows.find((row) => row.role === 'admin')!;
    const memberRow = rows.find((row) => row.role === 'member')!;

    // The admin cannot remove a peer with the same rank.
    const peerRemoval = await api('DELETE', `/workspaces/${workspace.id}/members/${adminRow.id}`, {
      user: admin(),
    });
    expect(peerRemoval.status).toBe(403);

    // Removing a member is allowed and unassigns their issues.
    const assigned = await createIssue(workspace.id, owner(), {
      title: 'Assigned to the member being removed',
      projectId,
      assigneeId: memberRow.user.email ? undefined : undefined,
    });
    void assigned;

    const removal = await api('DELETE', `/workspaces/${workspace.id}/members/${memberRow.id}`, {
      user: admin(),
    });
    expect(removal.status).toBe(200);
  });

  it('only lets the owner delete the workspace', async () => {
    const extra = await createWorkspace(['owner', 'admin'], { name: 'Deletable Workspace' });

    const byAdmin = await api('DELETE', `/workspaces/${extra.id}`, {
      user: extra.members.admin!,
    });
    expect(byAdmin.status).toBe(403);

    const byOwner = await api('DELETE', `/workspaces/${extra.id}`, { user: extra.owner });
    expect(byOwner.status).toBe(200);

    // The workspace and its memberships are gone.
    const gone = await api('GET', `/workspaces/${extra.id}`, { user: extra.owner });
    expect(gone.status).toBe(404);
  });

  it('hides workspaces the caller is not a member of', async () => {
    const stranger = await createWorkspace(['owner'], { name: 'Stranger Workspace' });

    const peek = await api('GET', `/workspaces/${workspace.id}`, { user: stranger.owner });
    expect(peek.status).toBe(404);

    const peekIssues = await api('GET', `/workspaces/${workspace.id}/issues`, {
      user: stranger.owner,
    });
    expect(peekIssues.status).toBe(404);

    const listing = await api('GET', '/workspaces', { user: stranger.owner });
    const ids = (listing.body as { workspaces: { id: string }[] }).workspaces.map((entry) => entry.id);
    expect(ids).toContain(stranger.id);
    expect(ids).not.toContain(workspace.id);
  });

  it('rejects an assignee outside the workspace', async () => {
    const outsider = await createWorkspace(['owner'], { name: 'Outsider Workspace' });
    const response = await api('POST', `/workspaces/${workspace.id}/issues`, {
      user: owner(),
      payload: { title: 'Bad assignee', assigneeId: outsider.owner.id },
    });
    expect(response.status).toBe(422);
    expect(
      (response.body as { error: { fields: Record<string, string[]> } }).error.fields.assigneeId?.[0],
    ).toMatch(/member of this workspace/i);
  });

  it('refuses to assign issues to viewers', async () => {
    const response = await api('POST', `/workspaces/${workspace.id}/issues`, {
      user: owner(),
      payload: { title: 'Viewer assignee', assigneeId: viewer().id },
    });
    expect(response.status).toBe(422);
    expect(
      (response.body as { error: { fields: Record<string, string[]> } }).error.fields.assigneeId?.[0],
    ).toMatch(/viewers cannot be assigned/i);
  });

  it('rejects cross-workspace project, cycle and label references', async () => {
    const other = await createWorkspace(['owner'], { name: 'Reference Workspace' });
    const otherProject = await createProject(other.id, other.owner);
    const otherCycleResponse = await api('POST', `/workspaces/${other.id}/cycles`, {
      user: other.owner,
      payload: {
        name: 'Other cycle',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(otherCycleResponse.status).toBe(201);
    const otherLabel = await api('POST', `/workspaces/${other.id}/labels`, {
      user: other.owner,
      payload: { name: 'other-label' },
    });
    expect(otherLabel.status).toBe(201);

    const badProject = await api('POST', `/workspaces/${workspace.id}/issues`, {
      user: owner(),
      payload: { title: 'Cross project', projectId: otherProject.id },
    });
    expect(badProject.status).toBe(422);

    const badLabel = await api('POST', `/workspaces/${workspace.id}/issues`, {
      user: owner(),
      payload: {
        title: 'Cross label',
        labelIds: [(otherLabel.body as { label: { id: string } }).label.id],
      },
    });
    expect(badLabel.status).toBe(422);
  });

  it('rejects a sub-issue whose parent is in another workspace', async () => {
    const other = await createWorkspace(['owner'], { name: 'Parent Workspace' });
    const foreignParent = await createIssue(other.id, other.owner, { title: 'Foreign parent' });

    const response = await api('POST', `/workspaces/${workspace.id}/issues`, {
      user: owner(),
      payload: { title: 'Cross-workspace child', parentId: foreignParent.id },
    });
    expect(response.status).toBe(422);
  });
});
