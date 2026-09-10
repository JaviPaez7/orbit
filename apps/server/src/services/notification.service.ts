import type { NotificationType } from '@orbit/shared';
import { extractMentions, timeAgo } from '@orbit/shared';
import { prisma, toJsonColumn } from '../db/client.js';
import type { RealtimeEvent } from '../types.js';

export interface NotifyInput {
  workspaceId: string;
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  issueId?: string | null;
  actor?: { id: string; name: string; avatarUrl: string | null } | null;
  data?: Record<string, unknown>;
  /** Skip delivering to the person who caused the event. */
  excludeUserId?: string | null;
}

/** Fan-out hook installed by the realtime layer to avoid a circular import. */
type Publisher = (event: RealtimeEvent) => void;
let publish: Publisher | null = null;

export function setNotificationPublisher(publisher: Publisher): void {
  publish = publisher;
}

/**
 * Creates notification rows for a set of recipients. Returns the created rows
 * so callers can also mirror them over the realtime channel.
 */
export async function notify(input: NotifyInput) {
  const recipients = [...new Set(input.userIds)].filter(
    (id) => id && id !== (input.excludeUserId ?? null),
  );
  if (recipients.length === 0) return [];

  const createdAt = new Date();
  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      workspaceId: input.workspaceId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      issueId: input.issueId ?? null,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? null,
      actorAvatar: input.actor?.avatarUrl ?? null,
      data: toJsonColumn(input.data ?? {}),
      createdAt,
    })),
  });

  const rows = await prisma.notification.findMany({
    where: { workspaceId: input.workspaceId, userId: { in: recipients }, createdAt },
    orderBy: { createdAt: 'desc' },
  });

  if (publish) {
    for (const row of rows) {
      publish({
        type: 'notification.created',
        workspaceId: input.workspaceId,
        actorId: input.actor?.id ?? null,
        payload: { notification: row, userId: row.userId },
      });
    }
  }
  return rows;
}

/** Everyone who should hear about changes to an issue (assignee + creator + followers). */
export async function issueAudience(issueId: string): Promise<string[]> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      assigneeId: true,
      creatorId: true,
      comments: { select: { authorId: true }, distinct: ['authorId'] },
      activities: { select: { actorId: true }, distinct: ['actorId'], take: 25 },
    },
  });
  if (!issue) return [];
  const ids = new Set<string>();
  if (issue.assigneeId) ids.add(issue.assigneeId);
  ids.add(issue.creatorId);
  for (const comment of issue.comments) ids.add(comment.authorId);
  for (const activity of issue.activities) if (activity.actorId) ids.add(activity.actorId);
  return [...ids];
}

/**
 * Resolves `@handle` mentions inside a comment body to workspace member ids.
 * Only members of the workspace can be mentioned.
 */
export async function resolveMentions(workspaceId: string, body: string): Promise<string[]> {
  const handles = extractMentions(body);
  if (handles.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      handle: { in: handles },
      memberships: { some: { workspaceId, status: 'active' } },
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/** Currently online user ids per workspace, maintained by the realtime layer. */
export function summarizeNotifications(rows: { createdAt: Date; readAt: Date | null }[]): {
  total: number;
  unread: number;
  lastAt: Date | null;
} {
  const unread = rows.filter((row) => row.readAt === null).length;
  const lastAt = rows.length > 0 ? rows[0]!.createdAt : null;
  return { total: rows.length, unread, lastAt };
}

export function relativeNotificationTime(createdAt: Date): string {
  return timeAgo(createdAt);
}
