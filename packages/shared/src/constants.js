import { z } from 'zod';
/** Canonical issue workflow states, ordered as they appear on the board. */
export const ISSUE_STATUSES = [
    'backlog',
    'todo',
    'in_progress',
    'in_review',
    'done',
    'cancelled',
];
export const ISSUE_STATUS_LABELS = {
    backlog: 'Backlog',
    todo: 'Todo',
    in_progress: 'In Progress',
    in_review: 'In Review',
    done: 'Done',
    cancelled: 'Cancelled',
};
/** Statuses that count as "completed" for analytics + cycle progress. */
export const COMPLETED_STATUSES = ['done', 'cancelled'];
export const ISSUE_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];
export const ISSUE_PRIORITY_LABELS = {
    none: 'No priority',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
};
/** Sort weight — urgent first. */
export const ISSUE_PRIORITY_WEIGHT = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
    none: 0,
};
export const PROJECT_STATUSES = ['planned', 'in_progress', 'paused', 'completed', 'cancelled'];
export const PROJECT_STATUS_LABELS = {
    planned: 'Planned',
    in_progress: 'In Progress',
    paused: 'Paused',
    completed: 'Completed',
    cancelled: 'Cancelled',
};
export const CYCLE_STATUSES = ['upcoming', 'active', 'completed'];
export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'viewer'];
export const WORKSPACE_ROLE_LABELS = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
    viewer: 'Viewer',
};
export const ISSUE_RELATION_TYPES = ['related', 'blocks', 'blocked_by', 'duplicate'];
export const ISSUE_RELATION_LABELS = {
    related: 'Related to',
    blocks: 'Blocks',
    blocked_by: 'Blocked by',
    duplicate: 'Duplicates',
};
export const NOTIFICATION_TYPES = [
    'issue_assigned',
    'issue_unassigned',
    'issue_status_changed',
    'issue_comment',
    'comment_mention',
    'issue_priority_changed',
    'issue_due_soon',
    'workspace_invite',
];
export const ACTIVITY_ENTITY_TYPES = [
    'issue',
    'project',
    'cycle',
    'workspace',
    'comment',
    'member',
    'label',
];
export const ACTIVITY_ACTIONS = [
    'created',
    'updated',
    'deleted',
    'status_changed',
    'priority_changed',
    'assignee_changed',
    'project_changed',
    'cycle_changed',
    'estimate_changed',
    'due_date_changed',
    'title_changed',
    'description_changed',
    'label_added',
    'label_removed',
    'commented',
    'comment_updated',
    'comment_deleted',
    'relation_added',
    'relation_removed',
    'attachment_added',
    'attachment_removed',
    'parent_changed',
    'member_added',
    'member_removed',
    'role_changed',
    'archived',
];
export const LABEL_COLORS = [
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#eab308',
    '#84cc16',
    '#22c55e',
    '#10b981',
    '#14b8a6',
    '#06b6d4',
    '#0ea5e9',
    '#3b82f6',
    '#6366f1',
    '#8b5cf6',
    '#a855f7',
    '#d946ef',
    '#ec4899',
];
export const PROJECT_COLORS = LABEL_COLORS;
export const PROJECT_ICONS = [
    'rocket',
    'box',
    'layers',
    'bug',
    'sparkles',
    'globe',
    'shield',
    'zap',
    'book',
    'beaker',
    'palette',
    'gauge',
];
/** Value used by the "no estimate" option in the UI. */
export const ESTIMATE_OPTIONS = [0, 1, 2, 3, 5, 8, 13, 21];
/** Runtime-validated enums, handy for scripts and tests. */
export const issueStatusSchema = z.enum(ISSUE_STATUSES);
export const issuePrioritySchema = z.enum(ISSUE_PRIORITIES);
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
//# sourceMappingURL=constants.js.map