import { z } from 'zod';
import {
  COMPLETED_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_WEIGHT,
  ISSUE_STATUSES,
  type IssuePriority,
  type IssueStatus,
} from './constants';

/* -------------------------------------------------------------------------- */
/*  Domain helpers shared by client + server                                  */
/* -------------------------------------------------------------------------- */

export function isCompletedStatus(status: IssueStatus): boolean {
  return COMPLETED_STATUSES.includes(status);
}

export function sortStatuses(statuses: IssueStatus[]): IssueStatus[] {
  return [...statuses].sort((a, b) => ISSUE_STATUSES.indexOf(a) - ISSUE_STATUSES.indexOf(b));
}

export function compareIssuePriority(a: IssuePriority, b: IssuePriority): number {
  return ISSUE_PRIORITY_WEIGHT[b] - ISSUE_PRIORITY_WEIGHT[a];
}

/** `ORB-123` style identifier from a workspace key and issue number. */
export function formatIssueIdentifier(workspaceKey: string, number: number): string {
  return `${workspaceKey.toUpperCase()}-${number}`;
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Deterministic 2-4 char uppercase workspace key, e.g. "Orbit Labs" -> ORL. */
export function deriveWorkspaceKey(name: string): string {
  const words = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toUpperCase());
  if (words.length === 0) return 'WRK';
  if (words.length === 1) {
    const word = words[0]!;
    return word.length >= 3 ? word.slice(0, 3) : word.padEnd(3, 'X');
  }
  const initials = words.map((w) => w[0]!).join('');
  return initials.length >= 3 ? initials.slice(0, 4) : initials.padEnd(3, 'X');
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}

/**
 * @mentions: matches `@javi`, `@javi.perez`, `@javi_perez`.
 *
 * The negative lookbehind skips email addresses (`ada@example.com`) and
 * `foo@bar` style text, which would otherwise parse as a mention.
 */
export const MENTION_REGEX = /(?<![\w.+-])@([a-zA-Z0-9][a-zA-Z0-9._-]{1,38})/g;

export function extractMentions(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION_REGEX)) {
    if (match[1]) found.add(match[1].toLowerCase());
  }
  return [...found];
}

/** Handle used by mention autocomplete — derived from name + email local part. */
export function mentionHandle(name: string, email: string): string {
  const base = slugify(name).replace(/-/g, '.') || email.split('@')[0] || 'user';
  return base.slice(0, 38);
}

/** Human readable relative time, e.g. "3h ago". */
export function timeAgo(input: Date | string, now: Date = new Date()): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  const minutes = seconds / 60;
  if (Math.abs(minutes) < 60) return `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (Math.abs(hours) < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  if (Math.abs(days) < 7) return `${Math.round(days)}d ago`;
  const weeks = days / 7;
  if (Math.abs(weeks) < 5) return `${Math.round(weeks)}w ago`;
  const months = days / 30.44;
  if (Math.abs(months) < 12) return `${Math.round(months)}mo ago`;
  return `${Math.round(days / 365.25)}y ago`;
}

export function formatDate(input: Date | string | null | undefined): string {
  if (!input) return '—';
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(input: Date | string | null | undefined): string {
  if (!input) return '—';
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function toDateInputValue(input: Date | string | null | undefined): string {
  if (!input) return '';
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const d1 = typeof a === 'string' ? new Date(a) : a;
  const d2 = typeof b === 'string' ? new Date(b) : b;
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* -------------------------------------------------------------------------- */
/*  CSV                                                                       */
/* -------------------------------------------------------------------------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const input = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(rows: Record<string, unknown>[], columns: readonly string[]): string {
  const header = columns.join(',');
  const body = rows.map((row) => columns.map((c) => toCsvValue(row[c])).join(',')).join('\n');
  return `${header}\n${body}${body.length > 0 ? '\n' : ''}`;
}

/* -------------------------------------------------------------------------- */
/*  Misc                                                                      */
/* -------------------------------------------------------------------------- */

export function groupBy<T, K extends string | number>(
  items: T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export const issueIdentifierSchema = z
  .string()
  .regex(/^[A-Za-z]{2,10}-\d+$/, 'Identifier must look like ORB-123');

export const ISSUE_PRIORITY_ORDER: IssuePriority[] = [...ISSUE_PRIORITIES].reverse();
