import type { WorkspaceRole } from '@orbit/shared';

export interface User {
  id: string;
  email: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  title: string | null;
  timezone: string | null;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  key: string;
  description: string | null;
  logoColor: string | null;
  ownerId: string;
  role: WorkspaceRole;
  memberCount?: number;
  projectCount?: number;
  issueCount?: number;
}

export interface WorkspaceMember {
  id: string;
  role: WorkspaceRole;
  status: string;
  joinedAt: string;
  user: UserSummary & { email: string; title: string | null; assignedIssueCount?: number };
}

export interface Label {
  id: string;
  name: string;
  color: string;
  issueCount?: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  status: string;
  leadId: string | null;
  lead: UserSummary | null;
  startDate: string | null;
  targetDate: string | null;
  archived: boolean;
  issueCount: number;
  completedIssueCount: number;
  estimateTotal: number;
  progress: number;
  members: UserSummary[];
  memberIds: string[];
  daysRemaining: number | null;
  cycles?: Cycle[];
}

export interface Issue {
  id: string;
  identifier: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  boardOrder: number;
  projectId: string | null;
  project: { id: string; name: string; icon: string; color: string } | null;
  cycleId: string | null;
  cycle: { id: string; name: string; number: number; status: string } | null;
  assigneeId: string | null;
  assignee: UserSummary | null;
  creatorId: string;
  creator: UserSummary | null;
  parentId: string | null;
  parent: { id: string; identifier: string; title: string } | null;
  children?: {
    id: string;
    identifier: string;
    title: string;
    status: string;
    priority: string;
    assignee: UserSummary | null;
    projectId: string | null;
  }[];
  relationsFrom?: {
    id: string;
    type: string;
    relatedIssue: { id: string; identifier: string; title: string; status: string };
  }[];
  relationsTo?: {
    id: string;
    type: string;
    issue: { id: string; identifier: string; title: string; status: string };
  }[];
  attachments?: Attachment[];
  labels: Label[];
  estimate: number | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  counts: { subIssues: number; comments: number; attachments: number };
  workspace?: { id: string; key: string; name: string; slug: string };
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
  uploader: UserSummary | null;
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  author: UserSummary;
  body: string;
  parentId: string | null;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { replies: number };
}

export interface Activity {
  id: string;
  actorId: string | null;
  actor: UserSummary | null;
  entityType: string;
  entityId: string;
  action: string;
  entityLabel: string | null;
  changes: Record<string, { from?: unknown; to?: unknown }>;
  description: string;
  issueId: string | null;
  issue?: { id: string; identifier: string; title: string } | null;
  issueIdentifier?: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  issueId: string | null;
  issue?: { id: string; identifier: string; title: string; status: string } | null;
  actorId: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface Cycle {
  id: string;
  name: string;
  number: number;
  status: string;
  startDate: string;
  endDate: string;
  projectId: string | null;
  project: { id: string; name: string; color: string } | null;
  totalIssues: number;
  completedIssues: number;
  cancelledIssues: number;
  startedIssues: number;
  reviewIssues: number;
  points: number;
  totalPoints: number;
  progress: number;
  days: number;
  elapsed: number;
  timeProgress: number;
  issueIds?: string[];
}

export interface IssueGroup {
  key: string;
  label: string;
  count: number;
  issueIds: string[];
}

export interface IssueListResponse {
  items: Issue[];
  total: number;
  limit: number;
  offset: number;
  groups?: IssueGroup[];
  role: WorkspaceRole;
}

export interface Analytics {
  totals: {
    issues: number;
    open: number;
    completed: number;
    cancelled: number;
    overdue: number;
    projects: number;
    cycles: number;
    members: number;
    estimatePoints: number;
    completedPoints: number;
  };
  completionRate: number;
  byStatus: { key: string; label: string; count: number }[];
  byPriority: { key: string; count: number }[];
  trend: { date: string; created: number; completed: number }[];
  workload: {
    userId: string;
    name: string;
    avatarUrl: string | null;
    open: number;
    completed: number;
    estimate: number;
  }[];
  projects: {
    id: string;
    name: string;
    color: string;
    icon: string;
    status: string;
    total: number;
    completed: number;
    progress: number;
    leadId: string | null;
    targetDate: string | null;
  }[];
  velocity: {
    cycleId: string;
    name: string;
    number: number;
    status: string;
    startDate: string;
    endDate: string;
    completedPoints: number;
    completedIssues: number;
    totalIssues: number;
    totalPoints: number;
  }[];
  cycleBurndown: { date: string; remaining: number; ideal: number }[];
  throughput: { date: string; completed: number }[];
  labels: { id: string; name: string; color: string; count: number }[];
}

export interface SearchResult {
  type: 'issue' | 'project' | 'user' | 'cycle' | 'label';
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  meta?: Record<string, unknown>;
}

export interface Presence {
  userId: string;
  name: string;
  connections: number;
}

export interface ImportResult {
  dryRun: boolean;
  imported: number;
  failed: number;
  totalRows: number;
  errors: { row: number; identifier: string; message: string; fields?: Record<string, string> }[];
  warnings: { row: number; identifier: string; message: string }[];
  issues: Record<string, unknown>[];
}

/** Realtime event envelope mirrored from the server. */
export interface RealtimeEvent {
  seq?: number;
  type: string;
  workspaceId: string;
  actorId?: string | null;
  at?: string;
  payload: Record<string, unknown>;
}
