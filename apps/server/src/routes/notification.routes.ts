import { notificationQuerySchema } from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { requireUser, requireWorkspace } from '../lib/guards.js';
import { normalizeQuery, parseOrThrow } from '../lib/http.js';
import { serializeActivity, serializeNotification } from '../lib/serialize.js';
import { describeActivity } from '../services/activity.service.js';
import { realtimeHub } from '../services/realtime.service.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/workspaces/:workspaceId/notifications', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);
    const query = parseOrThrow(
      notificationQuerySchema,
      normalizeQuery(request.query as Record<string, unknown>),
    );

    const where = {
      workspaceId,
      userId: ctx.user.id,
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(query.type?.length ? { type: { in: query.type } } : {}),
    };

    const [rows, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        include: {
          issue: { select: { id: true, identifier: true, title: true, status: true } },
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { workspaceId, userId: ctx.user.id, readAt: null } }),
    ]);

    return reply.send({
      notifications: rows.map((row) => serializeNotification(row as never)),
      total,
      unread,
    });
  });

  /** Badge count for the sidebar, across all workspaces. */
  app.get('/notifications/unread-count', async (request, reply) => {
    const user = await requireUser(request);
    const [total, byWorkspace] = await Promise.all([
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      prisma.notification.groupBy({
        by: ['workspaceId'],
        where: { userId: user.id, readAt: null },
        _count: { _all: true },
      }),
    ]);
    return reply.send({
      total,
      byWorkspace: byWorkspace.map((row) => ({
        workspaceId: row.workspaceId,
        count: row._count._all,
      })),
    });
  });

  app.post('/workspaces/:workspaceId/notifications/read', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);
    const body = (request.body ?? {}) as { ids?: unknown; all?: unknown };

    const where = body.all === true
      ? { workspaceId, userId: ctx.user.id, readAt: null }
      : {
          workspaceId,
          userId: ctx.user.id,
          id: { in: Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : [] },
        };

    const result = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });

    realtimeHub.sendToUser(ctx.user.id, {
      type: 'notification.read',
      workspaceId,
      actorId: ctx.user.id,
      payload: { all: body.all === true, ids: body.ids ?? [] },
    });

    const unread = await prisma.notification.count({
      where: { workspaceId, userId: ctx.user.id, readAt: null },
    });
    return reply.send({ ok: true, updated: result.count, unread });
  });

  app.delete('/workspaces/:workspaceId/notifications', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);
    const result = await prisma.notification.deleteMany({
      where: { workspaceId, userId: ctx.user.id, readAt: { not: null } },
    });
    return reply.send({ ok: true, deleted: result.count });
  });

  /** Combined inbox feed: notifications + recent workspace activity. */
  app.get('/workspaces/:workspaceId/inbox', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);

    const [notifications, activity, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { workspaceId, userId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: { issue: { select: { id: true, identifier: true, title: true, status: true } } },
      }),
      prisma.activity.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: {
          actor: { select: { id: true, name: true, avatarUrl: true, handle: true } },
          issue: { select: { id: true, identifier: true, title: true } },
        },
      }),
      prisma.notification.count({ where: { workspaceId, userId: ctx.user.id, readAt: null } }),
    ]);

    const serialized = {
      notifications: notifications.map((row) => serializeNotification(row as never)),
      activity: activity.map((row) => {
        const entry = serializeActivity(row as never);
        return {
          ...entry,
          description: describeActivity(
            row.action,
            row.entityType,
            (entry.changes ?? {}) as never,
            { entityLabel: row.entityLabel, actorName: row.actor?.name },
          ),
        };
      }),
      unread,
    };
    return reply.send(serialized);
  });
}
