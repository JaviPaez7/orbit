import { createLabelSchema, updateLabelSchema } from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { requireWorkspace } from '../lib/guards.js';
import { parseOrThrow } from '../lib/http.js';
import { recordActivity } from '../services/activity.service.js';
import { realtimeHub } from '../services/realtime.service.js';

export async function labelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/workspaces/:workspaceId/labels', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspace(request, workspaceId);
    const labels = await prisma.label.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { issues: true } } },
    });
    return reply.send({
      labels: labels.map(({ _count, ...label }) => ({ ...label, issueCount: _count.issues })),
    });
  });

  app.post('/workspaces/:workspaceId/labels', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'label:manage');
    const input = parseOrThrow(createLabelSchema, request.body);

    const clash = await prisma.label.findFirst({
      where: { workspaceId, name: { equals: input.name } },
      select: { id: true },
    });
    if (clash) throw new ConflictError('A label with that name already exists');

    const label = await prisma.label.create({ data: { ...input, workspaceId } });
    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'label',
      entityId: label.id,
      action: 'created',
      entityLabel: label.name,
    });
    realtimeHub.broadcast({
      type: 'label.created',
      workspaceId,
      actorId: ctx.user.id,
      payload: { label },
    });
    return reply.status(201).send({ label });
  });

  app.patch('/workspaces/:workspaceId/labels/:labelId', async (request, reply) => {
    const { workspaceId, labelId } = request.params as { workspaceId: string; labelId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'label:manage');
    const input = parseOrThrow(updateLabelSchema, request.body);

    const existing = await prisma.label.findFirst({ where: { id: labelId, workspaceId } });
    if (!existing) throw new NotFoundError('Label');

    const label = await prisma.label.update({ where: { id: labelId }, data: input });
    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'label',
      entityId: label.id,
      action: 'updated',
      entityLabel: label.name,
    });
    realtimeHub.broadcast({
      type: 'label.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { label },
    });
    return reply.send({ label });
  });

  app.delete('/workspaces/:workspaceId/labels/:labelId', async (request, reply) => {
    const { workspaceId, labelId } = request.params as { workspaceId: string; labelId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'label:manage');
    const existing = await prisma.label.findFirst({ where: { id: labelId, workspaceId } });
    if (!existing) throw new NotFoundError('Label');

    await prisma.label.delete({ where: { id: labelId } });
    await recordActivity({
      workspaceId,
      actorId: ctx.user.id,
      entityType: 'label',
      entityId: labelId,
      action: 'deleted',
      entityLabel: existing.name,
    });
    realtimeHub.broadcast({
      type: 'label.deleted',
      workspaceId,
      actorId: ctx.user.id,
      payload: { labelId },
    });
    return reply.send({ ok: true });
  });
}
