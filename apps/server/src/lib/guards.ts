import type { WorkspaceRole } from '@orbit/shared';
import { can, type Permission } from '@orbit/shared';
import type { FastifyRequest } from 'fastify';
import { prisma, fromJsonColumn } from '../db/client.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.js';
import type { SessionUser } from '../types.js';

export interface RequestContext {
  user: SessionUser;
  workspaceId: string;
  role: WorkspaceRole;
}

/** Public shape of a user — passwordHash never leaves the server. */
export const userPublicSelect = {
  id: true,
  email: true,
  name: true,
  handle: true,
  avatarUrl: true,
  title: true,
  timezone: true,
  createdAt: true,
} as const;

export async function requireUser(request: FastifyRequest): Promise<SessionUser> {
  if (!request.currentUser) throw new UnauthorizedError();
  return request.currentUser;
}

/**
 * Loads the workspace and the caller's membership, enforcing that the caller is
 * a member of it. Every workspace-scoped route goes through here, so a user can
 * never read or mutate entities outside their own workspaces.
 */
export async function requireWorkspace(
  request: FastifyRequest,
  workspaceId: string,
  required: Permission | Permission[] = 'workspace:read',
): Promise<RequestContext> {
  const user = await requireUser(request);

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: { role: true, status: true },
  });

  if (!membership || membership.status !== 'active') {
    // Deliberately 404 to avoid leaking the existence of other workspaces.
    throw new NotFoundError('Workspace');
  }

  const role = membership.role as WorkspaceRole;
  const permissions = Array.isArray(required) ? required : [required];
  if (!permissions.every((permission) => can(role, permission))) {
    throw new ForbiddenError(
      `A ${role} in this workspace cannot perform this action (requires: ${permissions.join(', ')})`,
    );
  }

  return { user, workspaceId, role };
}

/** Resolves the workspace for a project and verifies membership + permission. */
export async function requireProjectAccess(
  request: FastifyRequest,
  projectId: string,
  required: Permission | Permission[] = 'workspace:read',
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true, name: true, archived: true },
  });
  if (!project) throw new NotFoundError('Project');
  const ctx = await requireWorkspace(request, project.workspaceId, required);
  return { project, ctx };
}

/** Resolves the workspace for an issue and verifies membership + permission. */
export async function requireIssueAccess(
  request: FastifyRequest,
  issueId: string,
  required: Permission | Permission[] = 'workspace:read',
) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { id: true, workspaceId: true, identifier: true, title: true, projectId: true },
  });
  if (!issue) throw new NotFoundError('Issue');
  const ctx = await requireWorkspace(request, issue.workspaceId, required);
  return { issue, ctx };
}

export async function requireCycleAccess(
  request: FastifyRequest,
  cycleId: string,
  required: Permission | Permission[] = 'workspace:read',
) {
  const cycle = await prisma.cycle.findUnique({
    where: { id: cycleId },
    select: { id: true, workspaceId: true, name: true },
  });
  if (!cycle) throw new NotFoundError('Cycle');
  const ctx = await requireWorkspace(request, cycle.workspaceId, required);
  return { cycle, ctx };
}

export function parsePendingInvites(raw: string | null | undefined) {
  return fromJsonColumn<{ email: string; role: WorkspaceRole; token: string }[]>(raw, []);
}

/** Asserts the target user is an active member of the workspace. */
export async function assertMemberOfWorkspace(workspaceId: string, userId: string): Promise<void> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { status: true },
  });
  if (!membership || membership.status !== 'active') {
    throw new NotFoundError('Workspace member');
  }
}
