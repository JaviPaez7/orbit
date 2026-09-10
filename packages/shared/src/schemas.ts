import { z } from 'zod';
import {
  ACTIVITY_ACTIONS,
  CYCLE_STATUSES,
  ESTIMATE_OPTIONS,
  ISSUE_PRIORITIES,
  ISSUE_RELATION_TYPES,
  ISSUE_STATUSES,
  NOTIFICATION_TYPES,
  PROJECT_ICONS,
  PROJECT_STATUSES,
  WORKSPACE_ROLES,
} from './constants';

/* -------------------------------------------------------------------------- */
/*  Primitives                                                                */
/* -------------------------------------------------------------------------- */

export const cuidSchema = z.string().min(1).max(64);

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color like #3b82f6');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Email is required')
  .max(254)
  .email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password must be at most 200 characters')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const nameSchema = z.string().trim().min(1, 'Name is required').max(80);

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')
  .transform((v) => new Date(v));

const optionalIsoDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return new Date(v);
  })
  .refine((v) => v === undefined || v === null || !Number.isNaN(v.getTime()), 'Invalid date');

const optionalText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null ? null : v.trim().slice(0, max) || null));

/* -------------------------------------------------------------------------- */
/*  Auth                                                                      */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
  workspaceName: z.string().trim().min(1).max(60).optional(),
  inviteToken: z.string().min(8).max(200).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const requestPasswordResetSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(8).max(200),
  password: passwordSchema,
});

export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    avatarUrl: z.string().trim().max(2048).nullable().optional(),
    title: optionalText(80),
    timezone: optionalText(64),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

/* -------------------------------------------------------------------------- */
/*  Workspaces + members                                                      */
/* -------------------------------------------------------------------------- */

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3-40 lowercase letters, numbers or dashes')
    .optional(),
  description: optionalText(280),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: optionalText(280),
  logoColor: hexColorSchema.nullable().optional(),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(WORKSPACE_ROLES).exclude(['owner']).default('member'),
  name: z.string().trim().min(1).max(80).optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES),
});

/* -------------------------------------------------------------------------- */
/*  Projects                                                                  */
/* -------------------------------------------------------------------------- */

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  description: optionalText(2000),
  icon: z.enum(PROJECT_ICONS).default('box'),
  color: hexColorSchema.default('#6366f1'),
  status: z.enum(PROJECT_STATUSES).default('planned'),
  leadId: cuidSchema.nullable().optional(),
  memberIds: z.array(cuidSchema).max(200).optional(),
  startDate: optionalIsoDate,
  targetDate: optionalIsoDate,
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: optionalText(2000),
    icon: z.enum(PROJECT_ICONS).optional(),
    color: hexColorSchema.optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    leadId: cuidSchema.nullable().optional(),
    memberIds: z.array(cuidSchema).max(200).optional(),
    startDate: optionalIsoDate,
    targetDate: optionalIsoDate,
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/* -------------------------------------------------------------------------- */
/*  Labels                                                                    */
/* -------------------------------------------------------------------------- */

export const createLabelSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  color: hexColorSchema.default('#6366f1'),
});
export const updateLabelSchema = createLabelSchema.partial();

/* -------------------------------------------------------------------------- */
/*  Issues                                                                    */
/* -------------------------------------------------------------------------- */

export const createIssueSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(280),
  description: optionalText(20000),
  status: z.enum(ISSUE_STATUSES).default('todo'),
  priority: z.enum(ISSUE_PRIORITIES).default('none'),
  projectId: cuidSchema.nullable().optional(),
  cycleId: cuidSchema.nullable().optional(),
  assigneeId: cuidSchema.nullable().optional(),
  parentId: cuidSchema.nullable().optional(),
  labelIds: z.array(cuidSchema).max(30).optional(),
  estimate: z
    .union([z.number().int().min(0).max(1000), z.null()])
    .optional()
    .refine((v) => v === undefined || v === null || ESTIMATE_OPTIONS.includes(v as never), 'Invalid estimate'),
  dueDate: optionalIsoDate,
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = z
  .object({
    title: z.string().trim().min(1).max(280).optional(),
    description: optionalText(20000),
    status: z.enum(ISSUE_STATUSES).optional(),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
    projectId: cuidSchema.nullable().optional(),
    cycleId: cuidSchema.nullable().optional(),
    assigneeId: cuidSchema.nullable().optional(),
    parentId: cuidSchema.nullable().optional(),
    labelIds: z.array(cuidSchema).max(30).optional(),
    estimate: z.union([z.number().int().min(0).max(1000), z.null()]).optional(),
    dueDate: optionalIsoDate,
    /** Position within its kanban column; used by drag & drop reordering. */
    boardOrder: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

export const ISSUE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'priority',
  'dueDate',
  'title',
  'identifier',
  'estimate',
  'status',
] as const;

export const ISSUE_GROUP_FIELDS = [
  'status',
  'priority',
  'assignee',
  'project',
  'cycle',
  'label',
  'none',
] as const;

export const issueQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.array(z.enum(ISSUE_STATUSES)).optional(),
  priority: z.array(z.enum(ISSUE_PRIORITIES)).optional(),
  assigneeId: z.array(z.union([cuidSchema, z.literal('unassigned')])).optional(),
  projectId: z.array(z.union([cuidSchema, z.literal('none')])).optional(),
  cycleId: z.array(z.union([cuidSchema, z.literal('none')])).optional(),
  labelId: z.array(cuidSchema).optional(),
  creatorId: z.array(cuidSchema).optional(),
  parentId: z.union([cuidSchema, z.literal('none')]).optional(),
  includeSubIssues: z.boolean().optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  sort: z.enum(ISSUE_SORT_FIELDS).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  group: z.enum(ISSUE_GROUP_FIELDS).default('status'),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type IssueQuery = z.infer<typeof issueQuerySchema>;

export const bulkIssueSchema = z
  .object({
    ids: z.array(cuidSchema).min(1, 'Select at least one issue').max(500),
    status: z.enum(ISSUE_STATUSES).optional(),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
    assigneeId: z.union([cuidSchema, z.null()]).optional(),
    projectId: z.union([cuidSchema, z.null()]).optional(),
    cycleId: z.union([cuidSchema, z.null()]).optional(),
    addLabelIds: z.array(cuidSchema).max(30).optional(),
    removeLabelIds: z.array(cuidSchema).max(30).optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.priority !== undefined ||
      v.assigneeId !== undefined ||
      v.projectId !== undefined ||
      v.cycleId !== undefined ||
      (v.addLabelIds?.length ?? 0) > 0 ||
      (v.removeLabelIds?.length ?? 0) > 0,
    'Choose at least one change',
  );
export type BulkIssueInput = z.infer<typeof bulkIssueSchema>;

export const issueRelationSchema = z.object({
  relatedIssueId: cuidSchema,
  type: z.enum(ISSUE_RELATION_TYPES),
});

/* -------------------------------------------------------------------------- */
/*  Comments                                                                  */
/* -------------------------------------------------------------------------- */

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(10000),
  parentId: cuidSchema.nullable().optional(),
});
export const updateCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(10000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/* -------------------------------------------------------------------------- */
/*  Cycles                                                                    */
/* -------------------------------------------------------------------------- */

export const createCycleSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    startDate: isoDate,
    endDate: isoDate,
    projectId: cuidSchema.nullable().optional(),
    status: z.enum(CYCLE_STATUSES).optional(),
  })
  .refine((v) => v.endDate > v.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });
export type CreateCycleInput = z.infer<typeof createCycleSchema>;

export const updateCycleSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    status: z.enum(CYCLE_STATUSES).optional(),
    projectId: cuidSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/* -------------------------------------------------------------------------- */
/*  Notifications                                                             */
/* -------------------------------------------------------------------------- */

export const notificationQuerySchema = z.object({
  unreadOnly: z.boolean().default(false),
  type: z.array(z.enum(NOTIFICATION_TYPES)).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const markNotificationsSchema = z
  .object({
    ids: z.array(cuidSchema).max(500).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, 'Provide ids or all: true');

/* -------------------------------------------------------------------------- */
/*  Attachments                                                               */
/* -------------------------------------------------------------------------- */

export const createAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(2048),
  mimeType: z.string().trim().max(120).optional(),
  size: z.number().int().min(0).optional(),
});

/* -------------------------------------------------------------------------- */
/*  Import / export                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A single CSV import row. Deliberately permissive on cell contents and strict
 * on shape so we can report helpful per-row errors instead of failing the file.
 */
export const csvIssueRowSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(280),
  description: z.string().max(20000).optional(),
  status: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  assignee: z.string().trim().optional(),
  project: z.string().trim().optional(),
  cycle: z.string().trim().optional(),
  labels: z.string().trim().optional(),
  estimate: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
});
export type CsvIssueRow = z.infer<typeof csvIssueRowSchema>;

export const CSV_COLUMNS = [
  'title',
  'description',
  'status',
  'priority',
  'assignee',
  'project',
  'cycle',
  'labels',
  'estimate',
  'dueDate',
] as const;

/* -------------------------------------------------------------------------- */
/*  Generic API envelope                                                      */
/* -------------------------------------------------------------------------- */

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const idParamSchema = z.object({ id: cuidSchema });

/** Activity action + entity validators reused by the realtime layer. */
export const activityEventSchema = z.object({
  action: z.enum(ACTIVITY_ACTIONS),
  entityType: z.enum(['issue', 'project', 'cycle', 'workspace', 'comment', 'member', 'label']),
  entityId: cuidSchema,
});
