import { createCycleSchema, percent, updateCycleSchema } from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { requireWorkspace } from '../lib/guards.js';
import { parseOrThrow } from '../lib/http.js';
import { recordActivity } from '../services/activity.service.js';
import { realtimeHub } from '../services/realtime.service.js';

function cycleStats(
  cycle: { id: string; startDate: Date; endDate: Date },
  issues: { status: string; estimate: number | null; cycleId: string | null }[],
) {
  const owned = issues.filter((issue) => issue.cycleId === cycle.id);
  const done = owned.filter((issue) => issue.status === 'done');
  const inReview = owned.filter((issue) => issue.status === 'in_review');
  const inProgress = owned.filter((issue) => issue.status === 'in_progress');
  const cancelled = owned.filter((issue) => issue.status === 'cancelled');
  const scope = owned.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0);
  const points = done.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0);
  const days = Math.max(1, Math.round((cycle.endDate.getTime() - cycle.startDate.getTime()) / 86400000));
  const elapsed = Math.min(
    days,
    Math.max(0, Math.round((Date.now() - cycle.startDate.getTime()) / 86400000)),
  );
  return {
    totalIssues: owned.length,
    completedIssues: done.length,
    cancelledIssues: cancelled.length,
    startedIssues: inProgress.length,
    reviewIssues: inReview.length,
    scope: owned.length,
    points,
    totalPoints: scope,
    progress: percent(done.length, owned.length - cancelled.length),
    days,
    elapsed,
    timeProgress: percent(elapsed, days),
  };
}

export async function cycleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/workspaces/:workspaceId/cycles', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspace(request, workspaceId);

    const [cycles, issues] = await Promise.all([
      prisma.cycle.findMany({
        where: { workspaceId },
        orderBy: { number: 'desc' },
        include: { project: { select: { id: true, name: true, color: true } } },
      }),
      prisma.issue.findMany({
        where: { workspaceId },
        select: { id: true, status: true, estimate: true, cycleId: true },
      }),
    ]);

    const enriched = cycles.map((cycle) => ({
      ...cycle,
      ...cycleStats(cycle, issues),
      issueIds: issues.filter((issue) => issue.cycleId === cycle.id).map((issue) => issue.id),
    }));

    return reply.send({
      cycles: enriched,
      current: enriched.find((cycle) => cycle.status === 'active') ?? null,
    });
  });

  app.get('/workspaces/:workspaceId/cycles/:cycleId', async (request, reply) => {
    const { workspaceId, cycleId } = request.params as { workspaceId: string; cycleId: string };
    await requireWorkspace(request, workspaceId);
    const cycle = await prisma.cycle.findFirst({
      where: { id: cycleId, workspaceId },
      include: { project: { select: { id: true, name: true, color: true } } },
    });
    if (!cycle) throw new NotFoundError('Cycle');
    const issues = await prisma.issue.findMany({
      where: { workspaceId },
      select: { id: true, status: true, estimate: true, cycleId: true },
    });
    return reply.send({ cycle: { ...cycle, ...cycleStats(cycle, issues) } });
  });

  app.post('/workspaces/:workspaceId/cycles', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'cycle:manage');
    const input = parseOrThrow(createCycleSchema, request.body);

    const last = await prisma.cycle.findFirst({
      where: { workspaceId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;

    const cycle = await prisma.cycle.create({
      data: {
        workspaceId,
        number,
        name: input.name ?? `Cycle ${number}`,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status ?? 'upcoming',
        projectId: input.projectId ?? null,
      },
    });

    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'cycle',
      entityId: cycle.id,
      action: 'created',
      entityLabel: cycle.name,
      cycleId: cycle.id,
    });
    realtimeHub.broadcast({
      type: 'cycle.created',
      workspaceId,
      actorId: ctx.user.id,
      payload: { cycle },
    });
    return reply.status(201).send({ cycle });
  });

  app.patch('/workspaces/:workspaceId/cycles/:cycleId', async (request, reply) => {
    const { workspaceId, cycleId } = request.params as { workspaceId: string; cycleId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'cycle:manage');
    const input = parseOrThrow(updateCycleSchema, request.body);

    const existing = await prisma.cycle.findFirst({ where: { id: cycleId, workspaceId } });
    if (!existing) throw new NotFoundError('Cycle');
    if (input.startDate && input.endDate && input.endDate <= input.startDate) {
      throw new ConflictError('End date must be after start date');
    }

    const cycle = await prisma.cycle.update({
      where: { id: cycleId },
      data: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status,
        projectId: input.projectId === undefined ? undefined : input.projectId,
      },
    });

    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'cycle',
      entityId: cycle.id,
      action: 'updated',
      entityLabel: cycle.name,
      cycleId: cycle.id,
      changes: input.status ? { status: { from: existing.status, to: input.status } } : {},
    });
    realtimeHub.broadcast({
      type: 'cycle.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { cycle },
    });
    return reply.send({ cycle });
  });

  app.delete('/workspaces/:workspaceId/cycles/:cycleId', async (request, reply) => {
    const { workspaceId, cycleId } = request.params as { workspaceId: string; cycleId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'cycle:manage');
    const existing = await prisma.cycle.findFirst({ where: { id: cycleId, workspaceId } });
    if (!existing) throw new NotFoundError('Cycle');

    await prisma.$transaction([
      // Issues survive the cycle; they simply fall out of scope.
      prisma.issue.updateMany({ where: { cycleId }, data: { cycleId: null } }),
      prisma.cycle.delete({ where: { id: cycleId } }),
    ]);

    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'cycle',
      entityId: cycleId,
      action: 'deleted',
      entityLabel: existing.name,
    });
    realtimeHub.broadcast({
      type: 'cycle.deleted',
      workspaceId,
      actorId: ctx.user.id,
      payload: { cycleId },
    });
    return reply.send({ ok: true });
  });

  /** Adds/removes issues in bulk from a cycle (drag or multi-select). */
  app.post('/workspaces/:workspaceId/cycles/:cycleId/issues', async (request, reply) => {
    const { workspaceId, cycleId } = request.params as { workspaceId: string; cycleId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'cycle:manage');
    const body = (request.body ?? {}) as { issueIds?: unknown; remove?: unknown };
    const issueIds = Array.isArray(body.issueIds)
      ? body.issueIds.filter((id): id is string => typeof id === 'string')
      : [];
    const remove = body.remove === true;
    if (issueIds.length === 0) {
      return reply.status(422).send({
        error: { code: 'validation_error', message: 'issueIds is required', fields: { issueIds: ['Required'] } },
      });
    }

    const cycle = await prisma.cycle.findFirst({ where: { id: cycleId, workspaceId } });
    if (!cycle) throw new NotFoundError('Cycle');

    await prisma.issue.updateMany({
      where: { id: { in: issueIds }, workspaceId },
      data: { cycleId: remove ? null : cycleId },
    });

    realtimeHub.broadcast({
      type: 'cycle.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { cycleId, issueIds, removed: remove },
    });
    return reply.send({ ok: true, updated: issueIds.length });
  });
}
