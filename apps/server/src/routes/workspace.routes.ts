import type { WorkspaceRole } from '@orbit/shared';
import {
  createWorkspaceSchema,
  deriveWorkspaceKey,
  inviteMemberSchema,
  outranks,
  slugify,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
} from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { prisma, writeJsonColumn } from '../db/client.js';
import { generateToken } from '../lib/crypto.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import {
  assertMemberOfWorkspace,
  parsePendingInvites,
  requireUser,
  requireWorkspace,
  userPublicSelect,
} from '../lib/guards.js';
import { parseOrThrow } from '../lib/http.js';
import { recordActivity } from '../services/activity.service.js';
import { notify } from '../services/notification.service.js';
import { realtimeHub } from '../services/realtime.service.js';
import { serializeWorkspace } from '../lib/serialize.js';

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  /** Every workspace the caller belongs to, with counts for the switcher. */
  app.get('/workspaces', async (request, reply) => {
    const user = await requireUser(request);
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id, status: 'active' },
      orderBy: { joinedAt: 'asc' },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            key: true,
            logoColor: true,
            description: true,
            ownerId: true,
            _count: { select: { members: true, projects: true, issues: true } },
          },
        },
      },
    });
    return reply.send({
      workspaces: memberships.map(({ role, workspace }) => {
        const { _count, ...rest } = workspace;
        return {
          ...rest,
          role,
          memberCount: _count.members,
          projectCount: _count.projects,
          issueCount: _count.issues,
        };
      }),
    });
  });

  app.post('/workspaces', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const user = await requireUser(request);
      const input = parseOrThrow(createWorkspaceSchema, request.body);

      let slug = input.slug ?? slugify(input.name);
      if (!slug) slug = `workspace-${Date.now().toString(36)}`;
      let attempt = 0;
      while (await prisma.workspace.findUnique({ where: { slug }, select: { id: true } })) {
        attempt += 1;
        slug = `${slugify(input.name)}-${attempt}`;
        if (attempt > 50) throw new ConflictError('Could not allocate a unique workspace slug');
      }

      const workspace = await prisma.$transaction(async (tx) => {
        const created = await tx.workspace.create({
          data: {
            name: input.name,
            slug,
            key: deriveWorkspaceKey(input.name),
            description: input.description ?? null,
            ownerId: user.id,
            logoColor: '#6366f1',
          },
        });
        await tx.workspaceMember.create({
          data: { workspaceId: created.id, userId: user.id, role: 'owner' satisfies WorkspaceRole },
        });
        return created;
      });

      realtimeHub.grantWorkspace(user.id, workspace.id);
      return reply
        .status(201)
        .send({ workspace: serializeWorkspace(workspace as never), role: 'owner' });
    },
  });

  app.get('/workspaces/:workspaceId', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true, handle: true } },
        _count: { select: { members: true, projects: true, issues: true, cycles: true } },
      },
    });
    const payload = serializeWorkspace(workspace as never) as Record<string, unknown>;
    const { _count, ...rest } = payload as { _count: Record<string, number> };
    return reply.send({
      workspace: { ...rest, counts: _count },
      role: ctx.role,
    });
  });

  app.patch('/workspaces/:workspaceId', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'workspace:update');
    const input = parseOrThrow(updateWorkspaceSchema, request.body);

    if (
      input.name === undefined &&
      input.description === undefined &&
      input.logoColor === undefined
    ) {
      throw new BadRequestError('Nothing to update');
    }

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: input.name,
        description: input.description,
        logoColor: input.logoColor,
      },
    });

    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'workspace',
      entityId: workspaceId,
      action: 'updated',
      entityLabel: workspace.name,
      changes: input.name ? { name: { from: null, to: input.name } } : {},
    });

    realtimeHub.broadcast({
      type: 'member.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { workspaceId },
    });

    return reply.send({ workspace: serializeWorkspace(workspace as never) });
  });

  app.delete('/workspaces/:workspaceId', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'workspace:delete');
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { name: true },
    });

    realtimeHub.broadcast({
      type: 'member.removed',
      workspaceId,
      actorId: ctx.user.id,
      payload: { workspaceId, deleted: true },
    });

    await prisma.workspace.delete({ where: { id: workspaceId } });
    request.log.warn({ workspaceId, name: workspace.name }, 'workspace deleted');
    return reply.send({ ok: true, deletedWorkspaceId: workspaceId });
  });

  // ---- members -------------------------------------------------------------

  app.get('/workspaces/:workspaceId/members', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        user: { select: { ...userPublicSelect, _count: { select: { assignedIssues: true } } } },
      },
    });
    const roleOrder: Record<string, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };
    return reply.send({
      members: members
        .map(({ user, ...member }) => {
          const { _count, ...profile } = user;
          return { ...member, user: { ...profile, assignedIssueCount: _count.assignedIssues } };
        })
        .sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9)),
      role: ctx.role,
      pendingInvites: parsePendingInvites(
        (
          await prisma.workspace.findUniqueOrThrow({
            where: { id: workspaceId },
            select: { pendingInvites: true },
          })
        ).pendingInvites,
      ).map((invite) => ({ email: invite.email, role: invite.role })),
    });
  });

  /**
   * Adds a member. If the email has no account yet we create a pending invite
   * (returned with a one-time token so the flow is demoable without email).
   */
  app.post('/workspaces/:workspaceId/members', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'member:invite');
    const input = parseOrThrow(inviteMemberSchema, request.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, avatarUrl: true },
    });

    if (!existingUser) {
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { pendingInvites: true, name: true },
      });
      const invites = parsePendingInvites(workspace.pendingInvites);
      if (invites.some((invite) => invite.email === input.email)) {
        throw new ConflictError('That email already has a pending invite');
      }
      const token = generateToken(24);
      invites.push({ email: input.email, role: input.role as WorkspaceRole, token });
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { pendingInvites: writeJsonColumn(invites) },
      });
      return reply.status(202).send({
        pending: true,
        invite: { email: input.email, role: input.role, token, inviteUrl: `/invite/${token}` },
        message: 'No Orbit account uses that email yet — an invite link was generated.',
      });
    }

    const alreadyMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      select: { id: true },
    });
    if (alreadyMember) throw new ConflictError('That person is already a member of this workspace');

    const member = await prisma.workspaceMember.create({
      data: { workspaceId, userId: existingUser.id, role: input.role },
      select: { id: true, role: true, joinedAt: true },
    });

    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'member',
      entityId: existingUser.id,
      action: 'member_added',
      entityLabel: existingUser.name,
      changes: {
        member: { from: null, to: existingUser.name },
        role: { from: null, to: input.role },
      },
    });

    await notify({
      workspaceId,
      userIds: [existingUser.id],
      type: 'workspace_invite',
      title: `${ctx.user.name} added you to a workspace`,
      body: `You now have ${input.role} access.`,
      actor: { id: ctx.user.id, name: ctx.user.name, avatarUrl: ctx.user.avatarUrl },
      data: { workspaceId },
    });

    realtimeHub.grantWorkspace(existingUser.id, workspaceId);
    realtimeHub.broadcast({
      type: 'member.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { memberId: member.id, userId: existingUser.id },
    });

    return reply.status(201).send({ member: { ...member, user: existingUser } });
  });

  app.patch('/workspaces/:workspaceId/members/:memberId', async (request, reply) => {
    const { workspaceId, memberId } = request.params as { workspaceId: string; memberId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'member:update_role');
    const input = parseOrThrow(updateMemberRoleSchema, request.body);

    const target = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true, userId: true, role: true, user: { select: { name: true } } },
    });
    if (!target) throw new NotFoundError('Member');
    if (target.role === 'owner') throw new ForbiddenError('The workspace owner cannot be demoted');
    if (input.role === 'owner') throw new ForbiddenError('Ownership transfer is not supported yet');
    if (ctx.role !== 'owner' && !outranks(ctx.role, target.role as WorkspaceRole)) {
      throw new ForbiddenError('You cannot change the role of someone at or above your level');
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: input.role },
      select: { id: true, role: true },
    });

    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'member',
      entityId: target.userId,
      action: 'role_changed',
      entityLabel: target.user.name,
      changes: {
        role: { from: target.role, to: input.role },
        member: { from: null, to: target.user.name },
      },
    });

    realtimeHub.broadcast({
      type: 'member.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { memberId, role: input.role, userId: target.userId },
    });

    return reply.send({ member: updated });
  });

  app.delete('/workspaces/:workspaceId/members/:memberId', async (request, reply) => {
    const { workspaceId, memberId } = request.params as { workspaceId: string; memberId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'member:remove');

    const target = await prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true, userId: true, role: true, user: { select: { name: true } } },
    });
    if (!target) throw new NotFoundError('Member');
    if (target.role === 'owner') throw new ForbiddenError('The workspace owner cannot be removed');
    if (ctx.role !== 'owner' && !outranks(ctx.role, target.role as WorkspaceRole)) {
      throw new ForbiddenError('You cannot remove someone at or above your level');
    }

    await prisma.$transaction([
      // Unassign their issues so nothing dangles.
      prisma.issue.updateMany({
        where: { workspaceId, assigneeId: target.userId },
        data: { assigneeId: null },
      }),
      prisma.workspaceMember.delete({ where: { id: memberId } }),
    ]);

    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'member',
      entityId: target.userId,
      action: 'member_removed',
      entityLabel: target.user.name,
      changes: { member: { from: target.user.name, to: null } },
    });

    realtimeHub.revokeWorkspace(target.userId, workspaceId);
    realtimeHub.broadcast({
      type: 'member.removed',
      workspaceId,
      actorId: ctx.user.id,
      payload: { memberId, userId: target.userId },
    });

    return reply.send({ ok: true });
  });

  /** Leaves a workspace voluntarily (owners must hand over first). */
  app.post('/workspaces/:workspaceId/leave', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);
    if (ctx.role === 'owner') {
      throw new ForbiddenError(
        'Owners cannot leave their own workspace — delete it or transfer ownership',
      );
    }
    await prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: ctx.user.id } },
    });
    realtimeHub.revokeWorkspace(ctx.user.id, workspaceId);
    return reply.send({ ok: true });
  });

  /** Accepts a pending invite (used by the /invite/:token screen). */
  app.post('/workspaces/invites/:token/accept', async (request, reply) => {
    const { token } = request.params as { token: string };
    const user = await requireUser(request);
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, pendingInvites: true },
    });
    for (const workspace of workspaces) {
      const invites = parsePendingInvites(workspace.pendingInvites);
      const match = invites.find((invite) => invite.token === token);
      if (!match) continue;
      if (match.email !== user.email) {
        throw new ForbiddenError('This invite was issued to a different email address');
      }
      await assertMemberOfWorkspace(workspace.id, user.id).then(
        () => {
          throw new ConflictError('You are already a member of this workspace');
        },
        () => undefined,
      );
      await prisma.$transaction([
        prisma.workspaceMember.create({
          data: { workspaceId: workspace.id, userId: user.id, role: match.role },
        }),
        prisma.workspace.update({
          where: { id: workspace.id },
          data: {
            pendingInvites: writeJsonColumn(invites.filter((invite) => invite.token !== token)),
          },
        }),
      ]);
      realtimeHub.grantWorkspace(user.id, workspace.id);
      return reply.send({ ok: true, workspaceId: workspace.id });
    }
    throw new NotFoundError('Invite');
  });
}
