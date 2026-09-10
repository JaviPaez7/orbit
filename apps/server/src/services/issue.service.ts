import type { IssuePriority, IssueStatus } from '@orbit/shared';
import { ISSUE_PRIORITY_WEIGHT, ISSUE_STATUS_LABELS, isCompletedStatus } from '@orbit/shared';
import type { Prisma } from '@prisma/client';
import { prisma, toJsonColumn } from '../db/client.js';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { issueListInclude, serializeIssue } from '../lib/serialize.js';
import { recordActivity } from './activity.service.js';
import { issueAudience, notify, resolveMentions } from './notification.service.js';
import type { RealtimeEvent } from '../types.js';

/** Safety valve so we never stream an unbounded workspace into memory. */
const MAX_SCAN = 2000;

export interface IssueFilters {
  q?: string;
  status?: IssueStatus[];
  priority?: IssuePriority[];
  assigneeId?: (string | 'unassigned')[];
  projectId?: (string | 'none')[];
  cycleId?: (string | 'none')[];
  labelId?: string[];
  creatorId?: string[];
  parentId?: string | 'none';
  includeSubIssues?: boolean;
  dueBefore?: string;
  dueAfter?: string;
  sort: string;
  direction: 'asc' | 'desc';
  group: string;
  limit: number;
  offset: number;
}

/** Translates UI filters into a Prisma `where` clause. */
export function buildIssueWhere(
  workspaceId: string,
  filters: Partial<IssueFilters>,
): Prisma.IssueWhereInput {
  const where: Prisma.IssueWhereInput = { workspaceId };
  const and: Prisma.IssueWhereInput[] = [];

  if (filters.parentId && filters.parentId !== 'none') {
    where.parentId = filters.parentId;
  } else if (filters.includeSubIssues === false) {
    where.parentId = null;
  }
  if (filters.parentId === 'none') where.parentId = null;

  if (filters.status?.length) where.status = { in: filters.status };
  if (filters.priority?.length) where.priority = { in: filters.priority };
  if (filters.creatorId?.length) where.creatorId = { in: filters.creatorId };
  if (filters.labelId?.length) {
    and.push({ labels: { some: { labelId: { in: filters.labelId } } } });
  }

  if (filters.assigneeId?.length) {
    const unassigned = filters.assigneeId.includes('unassigned');
    const ids = filters.assigneeId.filter((id) => id !== 'unassigned');
    const options: Prisma.IssueWhereInput[] = [];
    if (ids.length) options.push({ assigneeId: { in: ids } });
    if (unassigned) options.push({ assigneeId: null });
    and.push({ OR: options });
  }

  if (filters.projectId?.length) {
    const none = filters.projectId.includes('none');
    const ids = filters.projectId.filter((id) => id !== 'none');
    const options: Prisma.IssueWhereInput[] = [];
    if (ids.length) options.push({ projectId: { in: ids } });
    if (none) options.push({ projectId: null });
    and.push({ OR: options });
  }

  if (filters.cycleId?.length) {
    const none = filters.cycleId.includes('none');
    const ids = filters.cycleId.filter((id) => id !== 'none');
    const options: Prisma.IssueWhereInput[] = [];
    if (ids.length) options.push({ cycleId: { in: ids } });
    if (none) options.push({ cycleId: null });
    and.push({ OR: options });
  }

  if (filters.dueBefore) and.push({ dueDate: { lte: new Date(filters.dueBefore) } });
  if (filters.dueAfter) and.push({ dueDate: { gte: new Date(filters.dueAfter) } });

  if (filters.q) {
    const q = filters.q.trim();
    if (q) {
      // SQLite has no case-insensitive `mode`, so search lowercase columns of
      // the fields users actually type into.
      const lower = q.toLowerCase();
      and.push({
        OR: [
          { title: { contains: lower } },
          { description: { contains: lower } },
          { identifier: { contains: q.toUpperCase() } },
          { comments: { some: { body: { contains: lower } } } },
          { labels: { some: { label: { name: { contains: lower } } } } },
        ],
      });
    }
  }

  if (and.length) where.AND = and;
  return where;
}

function orderByFor(sort: string, direction: 'asc' | 'desc'): Prisma.IssueOrderByWithRelationInput[] {
  const dir = direction;
  switch (sort) {
    case 'createdAt':
      return [{ createdAt: dir }];
    case 'updatedAt':
      return [{ updatedAt: dir }];
    case 'title':
      return [{ title: dir }];
    case 'identifier':
      return [{ number: dir }];
    case 'dueDate':
      return [{ dueDate: { sort: dir, nulls: 'last' } }, { createdAt: 'desc' }];
    case 'estimate':
      return [{ estimate: { sort: dir, nulls: 'last' } }];
    case 'status':
      return [{ status: dir }, { boardOrder: 'asc' }];
    case 'priority':
      // priority is stored as a string; sort in memory after fetching.
      return [{ updatedAt: 'desc' }];
    default:
      return [{ updatedAt: dir }];
  }
}

export interface ListIssuesResult {
  items: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  groups?: { key: string; label: string; count: number; issueIds: string[] }[];
}

export async function listIssues(
  workspaceId: string,
  filters: IssueFilters,
): Promise<ListIssuesResult> {
  const where = buildIssueWhere(workspaceId, filters);
  const total = await prisma.issue.count({ where });

  const rows = await prisma.issue.findMany({
    where,
    include: issueListInclude,
    orderBy: orderByFor(filters.sort, filters.direction),
    take: MAX_SCAN,
  });

  let items = rows;
  if (filters.sort === 'priority') {
    const weight = (p: string) => ISSUE_PRIORITY_WEIGHT[p as IssuePriority] ?? 0;
    items = [...rows].sort((a, b) =>
      filters.direction === 'desc' ? weight(b.priority) - weight(a.priority) : weight(a.priority) - weight(b.priority),
    );
  }

  const serialized = items.map((row) => serializeIssue(row as never));
  const page = serialized.slice(filters.offset, filters.offset + filters.limit);

  return {
    items: page,
    total,
    limit: filters.limit,
    offset: filters.offset,
    groups: buildGroups(serialized, filters.group),
  };
}

function buildGroups(items: Record<string, unknown>[], group: string) {
  if (!group || group === 'none') return undefined;
  const map = new Map<string, { key: string; label: string; issueIds: string[] }>();

  const push = (key: string, label: string, id: string) => {
    const entry = map.get(key) ?? { key, label, issueIds: [] };
    entry.issueIds.push(id);
    map.set(key, entry);
  };

  for (const issue of items) {
    const id = String(issue.id);
    switch (group) {
      case 'status':
        push(`status:${issue.status}`, String(issue.status), id);
        break;
      case 'priority':
        push(`priority:${issue.priority}`, String(issue.priority), id);
        break;
      case 'assignee': {
        const assignee = issue.assignee as { id: string; name: string } | null;
        push(`assignee:${assignee?.id ?? 'none'}`, assignee?.name ?? 'Unassigned', id);
        break;
      }
      case 'project': {
        const project = issue.project as { id: string; name: string } | null;
        push(`project:${project?.id ?? 'none'}`, project?.name ?? 'No project', id);
        break;
      }
      case 'cycle': {
        const cycle = issue.cycle as { id: string; name: string } | null;
        push(`cycle:${cycle?.id ?? 'none'}`, cycle?.name ?? 'No cycle', id);
        break;
      }
      case 'label': {
        const labels = (issue.labels as { id: string; name: string }[]) ?? [];
        if (labels.length === 0) push('label:none', 'No label', id);
        for (const label of labels) push(`label:${label.id}`, label.name, id);
        break;
      }
      default:
        break;
    }
  }

  return [...map.values()].map((entry) => ({ ...entry, count: entry.issueIds.length }));
}

export interface CreateIssueData {
  title: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  projectId?: string | null;
  cycleId?: string | null;
  assigneeId?: string | null;
  parentId?: string | null;
  labelIds?: string[];
  estimate?: number | null;
  dueDate?: Date | null;
}

export async function createIssue(
  workspaceId: string,
  actorId: string,
  data: CreateIssueData,
) {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { key: true, name: true },
  });

  await validateRelations(workspaceId, data);

  const issue = await prisma.$transaction(async (tx) => {
    const updated = await tx.workspace.update({
      where: { id: workspaceId },
      data: { issueCounter: { increment: 1 } },
      select: { issueCounter: true },
    });
    const number = updated.issueCounter;

    const created = await tx.issue.create({
      data: {
        workspaceId,
        number,
        identifier: `${workspace.key}-${number}`,
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? 'todo',
        priority: data.priority ?? 'none',
        projectId: data.projectId ?? null,
        cycleId: data.cycleId ?? null,
        assigneeId: data.assigneeId ?? null,
        parentId: data.parentId ?? null,
        creatorId: actorId,
        estimate: data.estimate ?? null,
        dueDate: data.dueDate ?? null,
        completedAt: isCompletedStatus((data.status ?? 'todo') as IssueStatus) ? new Date() : null,
        boardOrder: Date.now() % 1_000_000,
        labels: data.labelIds?.length
          ? { create: data.labelIds.map((labelId) => ({ labelId })) }
          : undefined,
      },
      include: issueListInclude,
    });

    await recordActivity(
      {
        workspaceId,
        actorId,
        entityType: 'issue',
        entityId: created.id,
        action: 'created',
        entityLabel: created.identifier,
        issueId: created.id,
        projectId: created.projectId,
        cycleId: created.cycleId,
      },
      tx,
    );

    return created;
  });

  if (issue.assigneeId && issue.assigneeId !== actorId) {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, name: true, avatarUrl: true },
    });
    await notify({
      workspaceId,
      userIds: [issue.assigneeId],
      type: 'issue_assigned',
      title: `${actor?.name ?? 'Someone'} assigned you ${issue.identifier}`,
      body: issue.title,
      issueId: issue.id,
      actor,
      data: { issueId: issue.id, identifier: issue.identifier, workspaceId },
    });
  }

  return serializeIssue(issue as never);
}

async function validateRelations(
  workspaceId: string,
  data: {
    projectId?: string | null;
    cycleId?: string | null;
    assigneeId?: string | null;
    parentId?: string | null;
    labelIds?: string[];
  },
  excludeIssueId?: string,
) {
  const errors: Record<string, string[]> = {};

  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, workspaceId },
      select: { id: true },
    });
    if (!project) errors.projectId = ['Project does not belong to this workspace'];
  }

  if (data.cycleId) {
    const cycle = await prisma.cycle.findFirst({
      where: { id: data.cycleId, workspaceId },
      select: { id: true },
    });
    if (!cycle) errors.cycleId = ['Cycle does not belong to this workspace'];
  }

  if (data.assigneeId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: data.assigneeId } },
      select: { role: true, status: true },
    });
    if (!membership || membership.status !== 'active') {
      errors.assigneeId = ['Assignee must be a member of this workspace'];
    } else if (membership.role === 'viewer') {
      errors.assigneeId = ['Viewers cannot be assigned issues'];
    }
  }

  if (data.parentId) {
    if (data.parentId === excludeIssueId) {
      errors.parentId = ['An issue cannot be its own parent'];
    } else {
      const parent = await prisma.issue.findFirst({
        where: { id: data.parentId, workspaceId },
        select: { id: true, parentId: true },
      });
      if (!parent) errors.parentId = ['Parent issue not found in this workspace'];
      else if (parent.parentId) errors.parentId = ['Sub-issues cannot be nested more than one level'];
      else if (excludeIssueId) {
        const childCount = await prisma.issue.count({ where: { parentId: excludeIssueId } });
        if (childCount > 0) errors.parentId = ['An issue with sub-issues cannot become a sub-issue'];
      }
    }
  }

  if (data.labelIds?.length) {
    const found = await prisma.label.count({ where: { id: { in: data.labelIds }, workspaceId } });
    if (found !== new Set(data.labelIds).size) {
      errors.labelIds = ['One or more labels do not belong to this workspace'];
    }
  }

  if (Object.keys(errors).length > 0) throw new ValidationError('Invalid issue data', errors);
}

export interface UpdateIssueData extends Partial<CreateIssueData> {
  boardOrder?: number;
}

export async function updateIssue(
  workspaceId: string,
  actorId: string,
  issueId: string,
  data: UpdateIssueData,
  options: { silent?: boolean } = {},
) {
  const before = await prisma.issue.findFirst({
    where: { id: issueId, workspaceId },
    include: issueListInclude,
  });
  if (!before) throw new NotFoundError('Issue');

  await validateRelations(workspaceId, data, issueId);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const compare = (field: keyof UpdateIssueData, label = String(field)) => {
    if (data[field] === undefined) return;
    const from = (before as Record<string, unknown>)[field as string];
    const to = data[field];
    if (from === to) return;
    changes[label] = { from, to };
  };

  compare('title', 'title');
  compare('description', 'description');
  compare('status', 'status');
  compare('priority', 'priority');
  compare('projectId', 'project');
  compare('cycleId', 'cycle');
  compare('assigneeId', 'assignee');
  compare('parentId', 'parent');
  compare('estimate', 'estimate');
  compare('dueDate', 'dueDate');
  compare('boardOrder', 'boardOrder');

  const labelChange = data.labelIds ? await diffLabels(issueId, data.labelIds) : null;

  const updateData: Prisma.IssueUpdateInput = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) {
    updateData.status = data.status;
    updateData.completedAt = isCompletedStatus(data.status) ? new Date() : null;
  }
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.projectId !== undefined) {
    updateData.project = data.projectId ? { connect: { id: data.projectId } } : { disconnect: true };
  }
  if (data.cycleId !== undefined) {
    updateData.cycle = data.cycleId ? { connect: { id: data.cycleId } } : { disconnect: true };
  }
  if (data.assigneeId !== undefined) {
    updateData.assignee = data.assigneeId ? { connect: { id: data.assigneeId } } : { disconnect: true };
  }
  if (data.parentId !== undefined) {
    updateData.parent = data.parentId ? { connect: { id: data.parentId } } : { disconnect: true };
  }
  if (data.estimate !== undefined) updateData.estimate = data.estimate;
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
  if (data.boardOrder !== undefined) updateData.boardOrder = data.boardOrder;
  const updated = await prisma.$transaction(async (tx) => {
    if (labelChange) {
      if (labelChange.removed.length) {
        await tx.issueLabel.deleteMany({
          where: { issueId, labelId: { in: labelChange.removed } },
        });
      }
      if (labelChange.added.length) {
        await tx.issueLabel.createMany({
          data: labelChange.added.map((labelId) => ({ issueId, labelId })),
        });
      }
    }
    return tx.issue.update({ where: { id: issueId }, data: updateData, include: issueListInclude });
  });

  if (!options.silent) {
    const actions: { action: string; payload: Record<string, { from: unknown; to: unknown }> }[] = [];
    const simple: [keyof UpdateIssueData, string][] = [
      ['status', 'status_changed'],
      ['priority', 'priority_changed'],
      ['assigneeId', 'assignee_changed'],
      ['projectId', 'project_changed'],
      ['cycleId', 'cycle_changed'],
      ['estimate', 'estimate_changed'],
      ['dueDate', 'due_date_changed'],
      ['title', 'title_changed'],
      ['description', 'description_changed'],
      ['parentId', 'parent_changed'],
    ];
    for (const [field, action] of simple) {
      const key = field === 'assigneeId' ? 'assignee' : field === 'projectId' ? 'project' : field === 'cycleId' ? 'cycle' : field === 'parentId' ? 'parent' : String(field);
      if (changes[key]) actions.push({ action, payload: { [key]: changes[key]! } });
    }
    if (labelChange) {
      for (const id of labelChange.added) {
        const label = await prisma.label.findUnique({ where: { id }, select: { name: true } });
        actions.push({ action: 'label_added', payload: { label: { from: null, to: label?.name ?? id } } });
      }
      for (const id of labelChange.removed) {
        const label = await prisma.label.findUnique({ where: { id }, select: { name: true } });
        actions.push({ action: 'label_removed', payload: { label: { from: label?.name ?? id, to: null } } });
      }
    }
    if (Object.keys(changes).length > 0 || (labelChange && (labelChange.added.length || labelChange.removed.length))) {
      for (const entry of actions.length ? actions : [{ action: 'updated', payload: {} }]) {
        await recordActivity({
          workspaceId,
          actorId,
          entityType: 'issue',
          entityId: issueId,
          action: entry.action as never,
          entityLabel: updated.identifier,
          issueId,
          projectId: updated.projectId,
          cycleId: updated.cycleId,
          changes: entry.payload,
        });
      }
    }
  }

  // Notifications for the changes people care about.
  await notifyIssueChanges({
    workspaceId,
    actorId,
    issue: updated,
    changes,
    before,
  });

  return serializeIssue(updated as never);
}

async function diffLabels(issueId: string, nextLabelIds: string[]) {
  const current = await prisma.issueLabel.findMany({ where: { issueId }, select: { labelId: true } });
  const currentIds = new Set(current.map((row) => row.labelId));
  const nextIds = new Set(nextLabelIds);
  return {
    added: [...nextIds].filter((id) => !currentIds.has(id)),
    removed: [...currentIds].filter((id) => !nextIds.has(id)),
  };
}

async function notifyIssueChanges(input: {
  workspaceId: string;
  actorId: string;
  issue: { id: string; identifier: string; title: string; assigneeId: string | null; status: string };
  changes: Record<string, { from: unknown; to: unknown }>;
  before: { assigneeId: string | null; status: string };
}) {
  const { workspaceId, actorId, issue, changes } = input;
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, name: true, avatarUrl: true },
  });
  const base = { issueId: issue.id, identifier: issue.identifier, workspaceId };

  if (changes.assignee && issue.assigneeId && issue.assigneeId !== actorId) {
    await notify({
      workspaceId,
      userIds: [issue.assigneeId],
      type: 'issue_assigned',
      title: `${actor?.name ?? 'Someone'} assigned you ${issue.identifier}`,
      body: issue.title,
      issueId: issue.id,
      actor,
      data: base,
    });
  }

  if (changes.status) {
    const audience = await issueAudience(issue.id);
    await notify({
      workspaceId,
      userIds: audience,
      excludeUserId: actorId,
      type: 'issue_status_changed',
      title: `${issue.identifier} moved to ${ISSUE_STATUS_LABELS[changes.status.to as IssueStatus] ?? String(changes.status.to)}`,
      body: issue.title,
      issueId: issue.id,
      actor,
      data: base,
    });
  }
}

export async function deleteIssue(workspaceId: string, actorId: string, issueId: string) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, workspaceId },
    select: { id: true, identifier: true, title: true, projectId: true, cycleId: true },
  });
  if (!issue) throw new NotFoundError('Issue');

  // Record before deleting so the history survives (FK is ON DELETE CASCADE).
  await prisma.$transaction(async (tx) => {
    await recordActivity(
      {
        workspaceId,
        actorId,
        entityType: 'issue',
        entityId: issue.id,
        action: 'deleted',
        entityLabel: issue.identifier,
        projectId: issue.projectId,
        cycleId: issue.cycleId,
      },
      tx,
    );
    await tx.issue.delete({ where: { id: issue.id } });
  });

  return issue;
}

export async function duplicateIssue(workspaceId: string, actorId: string, issueId: string) {
  const source = await prisma.issue.findFirst({
    where: { id: issueId, workspaceId },
    include: { labels: { select: { labelId: true } } },
  });
  if (!source) throw new NotFoundError('Issue');

  const created = await createIssue(workspaceId, actorId, {
    title: `${source.title} (copy)`,
    description: source.description,
    status: source.status as IssueStatus,
    priority: source.priority as IssuePriority,
    projectId: source.projectId,
    cycleId: source.cycleId,
    assigneeId: source.assigneeId,
    parentId: source.parentId,
    labelIds: source.labels.map((label) => label.labelId),
    estimate: source.estimate,
    dueDate: source.dueDate,
  });
  return created;
}

export interface BulkUpdateInput {
  ids: string[];
  status?: IssueStatus;
  priority?: IssuePriority;
  assigneeId?: string | null;
  projectId?: string | null;
  cycleId?: string | null;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

export async function bulkUpdateIssues(
  workspaceId: string,
  actorId: string,
  input: BulkUpdateInput,
): Promise<{ updated: number; issues: Record<string, unknown>[] }> {
  const issues = await prisma.issue.findMany({
    where: { id: { in: input.ids }, workspaceId },
    select: { id: true, identifier: true, title: true, assigneeId: true },
  });
  if (issues.length === 0) throw new NotFoundError('Issues');
  if (issues.length !== new Set(input.ids).size) {
    throw new ConflictError('Some selected issues are not in this workspace');
  }

  await validateRelations(workspaceId, {
    assigneeId: input.assigneeId ?? undefined,
    projectId: input.projectId ?? undefined,
    cycleId: input.cycleId ?? undefined,
    labelIds: input.addLabelIds,
  });

  // `Unchecked` is required to set scalar foreign keys directly (assigneeId...).
  const data: Prisma.IssueUncheckedUpdateManyInput = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
  if (input.projectId !== undefined) data.projectId = input.projectId;
  if (input.cycleId !== undefined) data.cycleId = input.cycleId;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.issue.updateMany({ where: { id: { in: input.ids }, workspaceId }, data });
    }
    if (input.addLabelIds?.length) {
      await tx.issueLabel.createMany({
        data: input.ids.flatMap((issueId) => input.addLabelIds!.map((labelId) => ({ issueId, labelId }))),
      });
    }
    if (input.removeLabelIds?.length) {
      await tx.issueLabel.deleteMany({
        where: { issueId: { in: input.ids }, labelId: { in: input.removeLabelIds } },
      });
    }

    for (const issue of issues) {
      if (input.status !== undefined) {
        await recordActivity(
          {
            workspaceId,
            actorId,
            entityType: 'issue',
            entityId: issue.id,
            action: 'status_changed',
            entityLabel: issue.identifier,
            issueId: issue.id,
            changes: { status: { from: null, to: input.status } },
          },
          tx,
        );
      }
      if (input.priority !== undefined) {
        await recordActivity(
          {
            workspaceId,
            actorId,
            entityType: 'issue',
            entityId: issue.id,
            action: 'priority_changed',
            entityLabel: issue.identifier,
            issueId: issue.id,
            changes: { priority: { from: null, to: input.priority } },
          },
          tx,
        );
      }
      if (input.assigneeId !== undefined) {
        await recordActivity(
          {
            workspaceId,
            actorId,
            entityType: 'issue',
            entityId: issue.id,
            action: 'assignee_changed',
            entityLabel: issue.identifier,
            issueId: issue.id,
            changes: { assignee: { from: issue.assigneeId, to: input.assigneeId } },
          },
          tx,
        );
      }
    }
  });

  if (input.assigneeId) {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, name: true, avatarUrl: true },
    });
    await notify({
      workspaceId,
      userIds: [input.assigneeId],
      excludeUserId: actorId,
      type: 'issue_assigned',
      title: `${actor?.name ?? 'Someone'} assigned you ${issues.length} issue${issues.length === 1 ? '' : 's'}`,
      body: issues.map((issue) => issue.identifier).join(', '),
      issueId: issues[0]?.id ?? null,
      actor,
      data: { issueIds: issues.map((issue) => issue.id), workspaceId },
    });
  }

  const refreshed = await prisma.issue.findMany({
    where: { id: { in: input.ids } },
    include: issueListInclude,
  });

  return { updated: issues.length, issues: refreshed.map((row) => serializeIssue(row as never)) };
}

export async function bulkDeleteIssues(workspaceId: string, actorId: string, ids: string[]) {
  const found = await prisma.issue.findMany({
    where: { id: { in: ids }, workspaceId },
    select: { id: true, identifier: true },
  });
  if (found.length === 0) throw new NotFoundError('Issues');

  await prisma.$transaction(async (tx) => {
    await tx.activity.createMany({
      data: found.map((issue) => ({
        workspaceId,
        actorId,
        entityType: 'issue',
        entityId: issue.id,
        action: 'deleted',
        entityLabel: issue.identifier,
        changes: toJsonColumn({}),
      })),
    });
    await tx.issue.deleteMany({ where: { id: { in: found.map((issue) => issue.id) } } });
  });

  return { deleted: found.length, ids: found.map((issue) => issue.id) };
}

export async function addIssueRelation(
  workspaceId: string,
  actorId: string,
  issueId: string,
  relatedIssueId: string,
  type: string,
) {
  if (issueId === relatedIssueId) throw new BadRequestError('An issue cannot be related to itself');
  const both = await prisma.issue.findMany({
    where: { id: { in: [issueId, relatedIssueId] }, workspaceId },
    select: { id: true, identifier: true },
  });
  if (both.length !== 2) throw new NotFoundError('Issue');

  const existing = await prisma.issueRelation.findFirst({ where: { issueId, relatedIssueId, type } });
  if (existing) throw new ConflictError('Those issues are already linked');

  const relation = await prisma.issueRelation.create({
    data: { issueId, relatedIssueId, type },
    include: {
      relatedIssue: { select: { id: true, identifier: true, title: true, status: true } },
    },
  });

  await recordActivity({
    workspaceId,
    actorId,
    entityType: 'issue',
    entityId: issueId,
    action: 'relation_added',
    issueId,
    changes: { relation: { from: null, to: relation.relatedIssue.identifier } },
  });

  return relation;
}

export async function removeIssueRelation(workspaceId: string, actorId: string, relationId: string) {
  const relation = await prisma.issueRelation.findFirst({
    where: { id: relationId, issue: { workspaceId } },
    include: { relatedIssue: { select: { identifier: true } } },
  });
  if (!relation) throw new NotFoundError('Relation');

  await prisma.issueRelation.delete({ where: { id: relation.id } });
  await recordActivity({
    workspaceId,
    actorId,
    entityType: 'issue',
    entityId: relation.issueId,
    action: 'relation_removed',
    issueId: relation.issueId,
    changes: { relation: { from: relation.relatedIssue.identifier, to: null } },
  });
  return relation;
}

/** Comment creation + mention notifications, used by the comments route. */
export async function resolveCommentMentions(workspaceId: string, body: string) {
  return resolveMentions(workspaceId, body);
}

export function realtimeIssueEvent(
  type: RealtimeEvent['type'],
  workspaceId: string,
  actorId: string,
  payload: unknown,
): RealtimeEvent {
  return { type, workspaceId, actorId, at: new Date().toISOString(), payload };
}
