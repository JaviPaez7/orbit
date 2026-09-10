import { createProjectSchema, percent, updateProjectSchema } from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { requireWorkspace } from '../lib/guards.js';
import { parseOrThrow, stripUndefined } from '../lib/http.js';
import { recordActivity } from '../services/activity.service.js';
import { realtimeHub } from '../services/realtime.service.js';

/** Derived fields are computed in one place so list/detail/analytics agree. */
function decorateProject<
  T extends {
    id: string;
    startDate: Date | null;
    targetDate: Date | null;
    status: string;
    _count?: { issues: number };
    lead?: { id: string; name: string; avatarUrl: string | null } | null;
    members?: { user: { id: string; name: string; avatarUrl: string | null } }[];
  },
>(project: T, issueStats: Map<string, { total: number; completed: number; estimate: number }>) {
  const stats = issueStats.get(project.id) ?? { total: 0, completed: 0, estimate: 0 };
  const { _count, members, ...rest } = project;
  const total = _count?.issues ?? stats.total;
  return {
    ...rest,
    issueCount: total,
    completedIssueCount: stats.completed,
    estimateTotal: stats.estimate,
    progress: percent(stats.completed, total),
    members: (members ?? []).map((member) => member.user),
    memberIds: (members ?? []).map((member) => member.user.id),
    daysRemaining: project.targetDate
      ? Math.round((project.targetDate.getTime() - Date.now()) / 86400000)
      : null,
  };
}

async function issueStatsFor(workspaceId: string) {
  const grouped = await prisma.issue.groupBy({
    by: ['projectId', 'status'],
    where: { workspaceId, projectId: { not: null } },
    _count: { _all: true },
    _sum: { estimate: true },
  });
  const map = new Map<string, { total: number; completed: number; estimate: number }>();
  for (const row of grouped) {
    if (!row.projectId) continue;
    const entry = map.get(row.projectId) ?? { total: 0, completed: 0, estimate: 0 };
    entry.total += row._count._all;
    if (row.status === 'done') {
      entry.completed += row._count._all;
      entry.estimate += row._sum.estimate ?? 0;
    }
    map.set(row.projectId, entry);
  }
  return map;
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/workspaces/:workspaceId/projects', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);
    const query = request.query as { includeArchived?: string };

    const [projects, stats] = await Promise.all([
      prisma.project.findMany({
        where: {
          workspaceId,
          ...(query.includeArchived === 'true' ? {} : { archived: false }),
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        include: {
          lead: { select: { id: true, name: true, avatarUrl: true } },
          members: { select: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          _count: { select: { issues: true } },
        },
      }),
      issueStatsFor(workspaceId),
    ]);

    return reply.send({
      projects: projects.map((project) => decorateProject(project, stats)),
      role: ctx.role,
    });
  });

  app.post('/workspaces/:workspaceId/projects', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'project:create');
    const input = parseOrThrow(createProjectSchema, request.body);

    const duplicate = await prisma.project.findFirst({
      where: { workspaceId, name: input.name },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictError('A project with that name already exists in this workspace');

    if (input.leadId) await assertMember(workspaceId, input.leadId, 'leadId');
    for (const memberId of input.memberIds ?? []) {
      await assertMember(workspaceId, memberId, 'memberIds');
    }

    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: input.name,
        description: input.description ?? null,
        icon: input.icon,
        color: input.color,
        status: input.status,
        leadId: input.leadId ?? null,
        startDate: input.startDate ?? null,
        targetDate: input.targetDate ?? null,
        members: input.memberIds?.length
          ? { create: [...new Set(input.memberIds)].map((userId) => ({ userId })) }
          : undefined,
      },
      include: {
        lead: { select: { id: true, name: true, avatarUrl: true } },
        members: { select: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        _count: { select: { issues: true } },
      },
    });

    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'project',
      entityId: project.id,
      action: 'created',
      entityLabel: project.name,
      projectId: project.id,
    });

    realtimeHub.broadcast({
      type: 'project.created',
      workspaceId,
      actorId: ctx.user.id,
      payload: { project: decorateProject(project, new Map()) },
    });

    return reply.status(201).send({ project: decorateProject(project, new Map()) });
  });

  app.get('/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) throw new NotFoundError('Project');
    const ctx = await requireWorkspace(request, project.workspaceId);

    const full = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        lead: { select: { id: true, name: true, avatarUrl: true, handle: true } },
        members: { select: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        cycles: { orderBy: { number: 'desc' }, take: 12 },
        _count: { select: { issues: true } },
      },
    });
    const stats = await issueStatsFor(ctx.workspaceId);
    return reply.send({
      project: decorateProject(full, stats),
      workspaceId: ctx.workspaceId,
      role: ctx.role,
    });
  });

  app.patch('/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true, name: true, status: true },
    });
    if (!existing) throw new NotFoundError('Project');
    const ctx = await requireWorkspace(request, existing.workspaceId, 'project:update');
    const input = parseOrThrow(updateProjectSchema, request.body);

    const duplicate = await prisma.project.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        name: input.name ?? undefined,
        NOT: { id: projectId },
      },
      select: { id: true },
    });
    if (input.name && duplicate) throw new ConflictError('Another project already uses that name');

    if (input.leadId) await assertMember(ctx.workspaceId, input.leadId, 'leadId');
    for (const memberId of input.memberIds ?? []) {
      await assertMember(ctx.workspaceId, memberId, 'memberIds');
    }

    const project = await prisma.$transaction(async (tx) => {
      if (input.memberIds) {
        await tx.projectMember.deleteMany({ where: { projectId } });
        if (input.memberIds.length) {
          await tx.projectMember.createMany({
            data: [...new Set(input.memberIds)].map((userId) => ({ projectId, userId })),
          });
        }
      }
      return tx.project.update({
        where: { id: projectId },
        data: stripUndefined<Prisma.ProjectUncheckedUpdateInput>({
          name: input.name,
          description: input.description,
          icon: input.icon,
          color: input.color,
          status: input.status,
          leadId: input.leadId,
          startDate: input.startDate,
          targetDate: input.targetDate,
          archived: input.archived,
        }),
        include: {
          lead: { select: { id: true, name: true, avatarUrl: true } },
          members: { select: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          _count: { select: { issues: true } },
        },
      });
    });

    await recordActivity({
      workspaceId: ctx.workspaceId,
      actorId: ctx.user.id,
      entityType: 'project',
      entityId: projectId,
      action: input.archived ? 'archived' : 'updated',
      entityLabel: project.name,
      projectId,
      changes: input.status ? { status: { from: existing.status, to: input.status } } : {},
    });

    const stats = await issueStatsFor(ctx.workspaceId);
    const decorated = decorateProject(project, stats);
    realtimeHub.broadcast({
      type: 'project.updated',
      workspaceId: ctx.workspaceId,
      actorId: ctx.user.id,
      payload: { project: decorated },
    });
    return reply.send({ project: decorated });
  });

  app.delete('/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true, name: true },
    });
    if (!existing) throw new NotFoundError('Project');
    const ctx = await requireWorkspace(request, existing.workspaceId, 'project:delete');

    await prisma.$transaction(async (tx) => {
      // Issues and cycles survive; they just lose the project association.
      await tx.issue.updateMany({ where: { projectId }, data: { projectId: null } });
      await tx.cycle.updateMany({ where: { projectId }, data: { projectId: null } });
      await tx.activity.create({
        data: {
          workspaceId: ctx.workspaceId,
          actorId: ctx.user.id,
          entityType: 'project',
          entityId: projectId,
          action: 'deleted',
          entityLabel: existing.name,
          changes: '{}',
        },
      });
      await tx.project.delete({ where: { id: projectId } });
    });

    realtimeHub.broadcast({
      type: 'project.deleted',
      workspaceId: ctx.workspaceId,
      actorId: ctx.user.id,
      payload: { projectId },
    });
    return reply.send({ ok: true });
  });
}

async function assertMember(workspaceId: string, userId: string, field: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { status: true },
  });
  if (!membership || membership.status !== 'active') {
    throw new ValidationError('Invalid project data', {
      [field]: ['That person is not a member of this workspace'],
    });
  }
}
