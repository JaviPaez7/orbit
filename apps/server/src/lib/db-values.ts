import {
  activityActionSchema,
  activityEntityTypeSchema,
  cycleStatusSchema,
  issuePrioritySchema,
  issueRelationTypeSchema,
  issueStatusSchema,
  notificationTypeSchema,
  projectStatusSchema,
  workspaceRoleSchema,
} from '@orbit/shared';
import type { z } from 'zod';
import { BadRequestError } from './errors';

/**
 * Datasource-portable column helpers.
 *
 * Orbit ships two Prisma schemas that describe the *same* data model:
 *
 *   * `schema.prisma` (SQLite) — no native enums, so workflow columns are plain
 *     `String`, and JSON columns are `String` holding serialised JSON.
 *   * `schema.postgres.prisma` — native enums and `Json` columns.
 *
 * The generated client types therefore differ between the two, but the runtime
 * values are identical: enum columns always hold the short string, and JSON
 * columns always hold a JSON document. These helpers state that invariant once,
 * with runtime validation, so route/service code compiles and behaves the same
 * against either schema.
 */

/** Validates an incoming value against an enum schema and returns it typed. */
function enumValue<T extends z.ZodTypeAny>(schema: T, value: unknown, field: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestError(`Invalid value for ${field}`);
  }
  return parsed.data as z.infer<T>;
}

export const asIssueStatus = (value: unknown) => enumValue(issueStatusSchema, value, 'status');
export const asIssuePriority = (value: unknown) =>
  enumValue(issuePrioritySchema, value, 'priority');
export const asProjectStatus = (value: unknown) =>
  enumValue(projectStatusSchema, value, 'project status');
export const asCycleStatus = (value: unknown) =>
  enumValue(cycleStatusSchema, value, 'cycle status');
export const asWorkspaceRole = (value: unknown) => enumValue(workspaceRoleSchema, value, 'role');
export const asNotificationType = (value: unknown) =>
  enumValue(notificationTypeSchema, value, 'notification type');
export const asIssueRelationType = (value: unknown) =>
  enumValue(issueRelationTypeSchema, value, 'relation type');
export const asActivityAction = (value: unknown) =>
  enumValue(activityActionSchema, value, 'action');
export const asActivityEntityType = (value: unknown) =>
  enumValue(activityEntityTypeSchema, value, 'entity type');

/** Casts a validated workflow value to whatever the generated client expects. */
export function toColumn<T>(value: unknown): T {
  return value as T;
}

/**
 * Reads a JSON column that is `String` on SQLite and `Json` on PostgreSQL.
 * Returns `fallback` for null, malformed, or unexpected values.
 */
export function readJsonColumn<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Serialises a value for a JSON column. Always returns the string form, which is
 * what SQLite stores and what PostgreSQL accepts for a `Json` field.
 */
export function writeJsonColumn(value: unknown): string {
  return JSON.stringify(value ?? {});
}
