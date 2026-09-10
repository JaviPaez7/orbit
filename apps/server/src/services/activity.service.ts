import type { ActivityAction, ActivityEntityType, IssuePriority, IssueStatus } from '@orbit/shared';
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS } from '@orbit/shared';
import type { Prisma } from '@prisma/client';
import { prisma, toJsonColumn } from '../db/client.js';

export interface RecordActivityInput {
  workspaceId: string;
  actorId: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  entityLabel?: string | null;
  issueId?: string | null;
  projectId?: string | null;
  cycleId?: string | null;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

/**
 * Appends to the immutable activity log. Callers never update or delete rows.
 * Accepts an optional transaction client so activity is written atomically with
 * the mutation it describes.
 */
export async function recordActivity(
  input: RecordActivityInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await client.activity.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      entityLabel: input.entityLabel ?? null,
      issueId: input.issueId ?? null,
      projectId: input.projectId ?? null,
      cycleId: input.cycleId ?? null,
      changes: toJsonColumn(input.changes ?? {}),
    },
  });
}

export interface ActivityChange {
  from?: unknown;
  to?: unknown;
}

export const activityInclude = {
  actor: { select: { id: true, name: true, handle: true, avatarUrl: true } },
} as const;

const statusLabel = (value: unknown) =>
  typeof value === 'string' ? (ISSUE_STATUS_LABELS[value as IssueStatus] ?? value) : String(value ?? '—');

const priorityLabel = (value: unknown) =>
  typeof value === 'string'
    ? (ISSUE_PRIORITY_LABELS[value as IssuePriority] ?? value)
    : String(value ?? '—');

const short = (value: unknown, max = 60) => {
  if (value === null || value === undefined) return 'empty';
  if (typeof value === 'object' && value !== null && 'name' in value) {
    return String((value as { name: unknown }).name);
  }
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * Renders an activity row into the sentence shown in issue history / the inbox.
 * Kept on the server so both the API and any consumer agree on the wording.
 */
export function describeActivity(
  action: string,
  entityType: string,
  changes: Record<string, ActivityChange> = {},
  context: { entityLabel?: string | null; actorName?: string } = {},
): string {
  const who = context.actorName ?? 'Someone';
  const get = (field: string) => changes[field] ?? {};
  const target = context.entityLabel ? ` **${context.entityLabel}**` : '';

  switch (action) {
    case 'created':
      return entityType === 'comment' ? `${who} commented` : `${who} created${target}`;
    case 'deleted':
      return `${who} deleted${target}`;
    case 'status_changed':
      return `${who} changed status from **${statusLabel(get('status').from)}** to **${statusLabel(
        get('status').to,
      )}**`;
    case 'priority_changed':
      return `${who} changed priority from **${priorityLabel(get('priority').from)}** to **${priorityLabel(
        get('priority').to,
      )}**`;
    case 'assignee_changed': {
      const to = get('assignee').to;
      if (to === null || to === undefined) return `${who} unassigned the issue`;
      return `${who} assigned the issue to **${short(to)}**`;
    }
    case 'project_changed':
      return `${who} moved the issue to **${short(get('project').to, 40)}**`;
    case 'cycle_changed':
      return get('cycle').to
        ? `${who} added the issue to cycle **${short(get('cycle').to, 40)}**`
        : `${who} removed the issue from its cycle`;
    case 'estimate_changed':
      return `${who} set the estimate to **${get('estimate').to ?? 'none'}**`;
    case 'due_date_changed':
      return get('dueDate').to
        ? `${who} set the due date to **${short(get('dueDate').to, 20)}**`
        : `${who} cleared the due date`;
    case 'title_changed':
      return `${who} renamed the issue to **${short(get('title').to, 80)}**`;
    case 'description_changed':
      return `${who} updated the description`;
    case 'label_added':
      return `${who} added the label **${short(get('label').to ?? get('labels').to, 30)}**`;
    case 'label_removed':
      return `${who} removed the label **${short(get('label').from ?? get('labels').from, 30)}**`;
    case 'commented':
      return `${who} commented`;
    case 'comment_updated':
      return `${who} edited a comment`;
    case 'comment_deleted':
      return `${who} deleted a comment`;
    case 'relation_added':
      return `${who} linked a related issue`;
    case 'relation_removed':
      return `${who} removed a linked issue`;
    case 'attachment_added':
      return `${who} attached **${short(get('attachment').to, 40)}**`;
    case 'attachment_removed':
      return `${who} removed an attachment`;
    case 'parent_changed':
      return get('parent').to
        ? `${who} set the parent issue to **${short(get('parent').to, 40)}**`
        : `${who} removed the parent issue`;
    case 'member_added':
      return `${who} added **${short(get('member').to, 40)}** to the workspace`;
    case 'member_removed':
      return `${who} removed **${short(get('member').from, 40)}** from the workspace`;
    case 'role_changed':
      return `${who} changed **${short(get('member').to ?? 'a member', 30)}**'s role from ${short(
        get('role').from,
        20,
      )} to ${short(get('role').to, 20)}`;
    case 'archived':
      return `${who} archived${target}`;
    case 'updated':
    default:
      return `${who} updated${target || ' the issue'}`;
  }
}
