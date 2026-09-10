/** Shared Prisma `select`/`include` shapes + API serializers. */

export const userSummarySelect = {
  id: true,
  name: true,
  handle: true,
  avatarUrl: true,
  email: true,
} as const;

export const userTinySelect = {
  id: true,
  name: true,
  handle: true,
  avatarUrl: true,
} as const;

export const labelSelect = { id: true, name: true, color: true } as const;

export const issueListInclude = {
  assignee: { select: userTinySelect },
  creator: { select: userTinySelect },
  project: { select: { id: true, name: true, icon: true, color: true } },
  cycle: { select: { id: true, name: true, number: true, status: true } },
  labels: { select: { label: { select: labelSelect } } },
  parent: { select: { id: true, identifier: true, title: true } },
  _count: { select: { children: true, comments: true, attachments: true } },
} as const;

export const issueDetailInclude = {
  ...issueListInclude,
  workspace: { select: { id: true, key: true, name: true, slug: true } },
  children: {
    select: {
      id: true,
      identifier: true,
      title: true,
      status: true,
      priority: true,
      assignee: { select: userTinySelect },
      projectId: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  relationsFrom: {
    select: {
      id: true,
      type: true,
      relatedIssue: { select: { id: true, identifier: true, title: true, status: true } },
    },
  },
  relationsTo: {
    select: {
      id: true,
      type: true,
      issue: { select: { id: true, identifier: true, title: true, status: true } },
    },
  },
  attachments: {
    select: {
      id: true,
      filename: true,
      url: true,
      mimeType: true,
      size: true,
      createdAt: true,
      uploader: { select: userTinySelect },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

type AnyRecord = Record<string, unknown>;

/** Prisma returns `labels: [{ label }]`; the client wants `labels: [...]`. */
export function serializeIssue<T extends AnyRecord>(issue: T): AnyRecord {
  const labels = Array.isArray(issue.labels)
    ? (issue.labels as { label: unknown }[]).map((entry) => entry.label)
    : [];
  const { _count, ...rest } = issue as AnyRecord & {
    _count?: { children?: number; comments?: number; attachments?: number };
  };
  return {
    ...rest,
    labels,
    counts: {
      subIssues: _count?.children ?? 0,
      comments: _count?.comments ?? 0,
      attachments: _count?.attachments ?? 0,
    },
  };
}

export function serializeComment<T extends AnyRecord>(comment: T): AnyRecord {
  return { ...comment };
}

export function serializeActivity<T extends AnyRecord>(activity: T): AnyRecord {
  let changes: unknown = {};
  const raw = activity.changes;
  if (typeof raw === 'string') {
    try {
      changes = JSON.parse(raw);
    } catch {
      changes = {};
    }
  } else if (raw && typeof raw === 'object') {
    changes = raw;
  }
  return { ...activity, changes };
}

export function serializeNotification<T extends AnyRecord>(notification: T): AnyRecord {
  let data: unknown = {};
  const raw = notification.data;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  } else if (raw && typeof raw === 'object') {
    data = raw;
  }
  return { ...notification, data };
}

export function serializeWorkspace<T extends AnyRecord>(workspace: T): AnyRecord {
  let pendingInvites: unknown = [];
  const raw = (workspace as AnyRecord).pendingInvites;
  if (typeof raw === 'string') {
    try {
      pendingInvites = JSON.parse(raw);
    } catch {
      pendingInvites = [];
    }
  }
  const { pendingInvites: _omit, ...rest } = workspace as AnyRecord;
  return { ...rest, pendingInvites };
}
