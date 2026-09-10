import { SESSION_COOKIE } from '../config/env.js';
import { prisma } from '../db/client.js';
import { resolveSession } from '../services/auth.service.js';
import { realtimeHub } from '../services/realtime.service.js';
import type { FastifyInstance } from 'fastify';

interface SocketLike {
  send: (data: string) => void;
  close: () => void;
  readyState: number;
  on: (event: string, handler: (...args: never[]) => void) => void;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * Realtime channel.
 *
 * `GET /api/realtime` upgrades to a WebSocket. Authentication reuses the
 * session cookie (browsers send it on the upgrade request), so there is no
 * separate ticket exchange. Events are scoped to the workspaces the user is an
 * active member of.
 */
export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/realtime', { websocket: true }, async (socket, request) => {
    const raw = (socket as unknown as SocketLike) ?? request;
    const ws = socket as unknown as SocketLike;

    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const user = await resolveSession(token);
    void raw;

    if (!user) {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'unauthorized' } }));
      ws.close();
      return;
    }

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id, status: 'active' },
      select: { workspaceId: true },
    });
    const workspaceIds = memberships.map((membership) => membership.workspaceId);

    const query = request.query as { workspaceId?: string };
    const activeWorkspaceId =
      query.workspaceId && workspaceIds.includes(query.workspaceId)
        ? query.workspaceId
        : (workspaceIds[0] ?? '');

    const meta = realtimeHub.register({
      userId: user.id,
      userName: user.name,
      workspaceIds,
      activeWorkspaceId,
      socket: ws,
    });

    realtimeHub.sendToUser(user.id, {
      type: 'hello',
      workspaceId: activeWorkspaceId,
      payload: {
        clientId: meta.id,
        userId: user.id,
        workspaceIds,
        presence: realtimeHub.presence(activeWorkspaceId),
      },
    });

    // Fan out presence so other tabs can show who is connected.
    if (activeWorkspaceId) {
      realtimeHub.broadcast({
        type: 'presence.sync',
        workspaceId: activeWorkspaceId,
        actorId: user.id,
        payload: { presence: realtimeHub.presence(activeWorkspaceId) },
      });
    }

    ws.on('message', (rawMessage: unknown) => {
      let parsed: { type?: string; workspaceId?: string } = {};
      try {
        parsed = JSON.parse(String(rawMessage)) as { type?: string; workspaceId?: string };
      } catch {
        return;
      }

      if (parsed.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', at: new Date().toISOString(), payload: {} }));
        return;
      }

      if (
        parsed.type === 'subscribe' &&
        parsed.workspaceId &&
        workspaceIds.includes(parsed.workspaceId)
      ) {
        realtimeHub.setActiveWorkspace(meta.id, parsed.workspaceId);
        realtimeHub.sendToUser(user.id, {
          type: 'presence.sync',
          workspaceId: parsed.workspaceId,
          payload: { presence: realtimeHub.presence(parsed.workspaceId) },
        });
      }
    });

    ws.on('close', () => {
      realtimeHub.unregister(meta.id, ws);
      if (activeWorkspaceId) {
        realtimeHub.broadcast({
          type: 'presence.sync',
          workspaceId: activeWorkspaceId,
          actorId: user.id,
          payload: { presence: realtimeHub.presence(activeWorkspaceId) },
        });
      }
    });

    ws.on('error', () => {
      realtimeHub.unregister(meta.id, ws);
    });
  });

  /** Presence snapshot for the avatars shown in the header. */
  app.get('/workspaces/:workspaceId/presence', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    return reply.send({ presence: realtimeHub.presence(workspaceId) });
  });

  /**
   * Fallback for environments where WebSockets are blocked (proxies, some CI
   * sandboxes): the client long-polls this endpoint for events after a cursor.
   */
  app.get('/workspaces/:workspaceId/events', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const query = request.query as { since?: string };
    const since = query.since ? new Date(query.since) : new Date(Date.now() - 60_000);
    const rows = await prisma.activity.findMany({
      where: { workspaceId, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, action: true, entityId: true, issueId: true, createdAt: true },
    });
    return reply.send({
      events: rows.map((row) => ({
        type: 'activity.created',
        workspaceId,
        at: row.createdAt.toISOString(),
        payload: row,
      })),
      cursor: new Date().toISOString(),
    });
  });
}
