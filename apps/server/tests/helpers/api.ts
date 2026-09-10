import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { hashPassword } from '../../src/lib/crypto';
import type { WorkspaceRole } from '@orbit/shared';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  cookie: string;
  handle: string;
}

export const TEST_PASSWORD = 'OrbitTest123';

let app: FastifyInstance | null = null;
let uniqueCounter = 0;

/** Builds (once) the Fastify app backed by the test database. */
export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
    app = await buildApp({ logger: false });
    await app.ready();
  }
  return app;
}

export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
  await prisma.$disconnect();
}

/** Wipes all rows so each test file starts from a known state. */
export async function resetDatabase(): Promise<void> {
  await prisma.notification.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issueLabel.deleteMany();
  await prisma.issueRelation.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.cycle.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.label.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.session.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
}

/** Creates a user and returns a logged-in cookie for that user. */
export async function createUser(
  overrides: { email?: string; name?: string; password?: string } = {},
): Promise<TestUser> {
  uniqueCounter += 1;
  const email = overrides.email ?? `user${uniqueCounter}.${Date.now().toString(36)}@orbit.test`;
  const name = overrides.name ?? `Test User ${uniqueCounter}`;
  const password = overrides.password ?? TEST_PASSWORD;

  const user = await prisma.user.create({
    data: {
      email,
      name,
      handle: `tester${uniqueCounter}${Date.now().toString(36).slice(-4)}`,
      passwordHash: await hashPassword(password),
    },
    select: { id: true, email: true, name: true, handle: true },
  });

  const instance = await getApp();
  const response = await instance.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`login failed for ${email}: ${response.statusCode} ${response.body}`);
  }
  const cookie = String(response.headers['set-cookie']).split(';')[0]!;
  return { ...user, cookie };
}

export interface TestWorkspace {
  id: string;
  key: string;
  owner: TestUser;
  members: Partial<Record<WorkspaceRole, TestUser>>;
}

/**
 * Creates a workspace with one user per requested role. The first role in the
 * list becomes the owner; additional roles are invited through the real API so
 * the membership rows match production exactly.
 */
export async function createWorkspace(
  roles: WorkspaceRole[] = ['owner'],
  options: { name?: string } = {},
): Promise<TestWorkspace> {
  uniqueCounter += 1;
  const name = options.name ?? `Test Workspace ${uniqueCounter}`;
  const users: Partial<Record<WorkspaceRole, TestUser>> = {};

  for (const role of roles) {
    users[role] = await createUser({ name: `${role} ${uniqueCounter}` });
  }

  const owner = users.owner ?? users.admin ?? users.member ?? users.viewer;
  if (!owner) throw new Error('createWorkspace requires at least one role');

  const instance = await getApp();
  const created = await instance.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: { cookie: owner.cookie },
    payload: { name },
  });
  if (created.statusCode !== 201) {
    throw new Error(`workspace creation failed: ${created.statusCode} ${created.body}`);
  }
  const workspace = JSON.parse(created.body) as { workspace: { id: string; key: string } };

  // Invite the remaining users with their requested role.
  const currentOwner = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.workspace.id, role: 'owner' },
    select: { userId: true },
  });
  const ownerUser = Object.values(users).find((user) => user.id === currentOwner?.userId);
  if (!ownerUser) throw new Error('owner membership missing after creation');
  users.owner = users.owner ?? ownerUser;

  for (const [role, user] of Object.entries(users) as [WorkspaceRole, TestUser][]) {
    if (role === 'owner') continue;
    const invited = await instance.inject({
      method: 'POST',
      url: `/api/workspaces/${workspace.workspace.id}/members`,
      headers: { cookie: ownerUser.cookie },
      payload: { email: user.email, role },
    });
    if (invited.statusCode !== 201) {
      throw new Error(`invite failed for ${role}: ${invited.statusCode} ${invited.body}`);
    }
  }

  return {
    id: workspace.workspace.id,
    key: workspace.workspace.key,
    owner: ownerUser,
    members: users,
  };
}

/** Helper around `app.inject` with the auth cookie pre-applied. */
export async function api(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  options: { user?: TestUser; payload?: unknown; headers?: Record<string, string> } = {},
) {
  const instance = await getApp();
  const headers: Record<string, string> = { ...options.headers };
  if (options.user) headers.cookie = options.user.cookie;
  const response = await instance.inject({
    method,
    url: `/api${url}`,
    headers,
    payload: options.payload as never,
  });
  return {
    status: response.statusCode,
    body: response.body ? (JSON.parse(response.body) as Record<string, unknown>) : {},
    raw: response,
  };
}

export async function createProject(
  workspaceId: string,
  user: TestUser,
  overrides: Record<string, unknown> = {},
) {
  const response = await api('POST', `/workspaces/${workspaceId}/projects`, {
    user,
    payload: { name: `Project ${Date.now().toString(36)}`, ...overrides },
  });
  if (response.status !== 201)
    throw new Error(`project creation failed: ${JSON.stringify(response.body)}`);
  return response.body.project as { id: string; name: string };
}

export async function createIssue(
  workspaceId: string,
  user: TestUser,
  overrides: Record<string, unknown> = {},
) {
  const response = await api('POST', `/workspaces/${workspaceId}/issues`, {
    user,
    payload: { title: `Issue ${Date.now().toString(36)}`, ...overrides },
  });
  if (response.status !== 201)
    throw new Error(`issue creation failed: ${JSON.stringify(response.body)}`);
  return response.body.issue as {
    id: string;
    identifier: string;
    title: string;
    status: string;
    priority: string;
    boardOrder: number;
  };
}
