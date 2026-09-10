import { describe, expect, it } from 'vitest';
import {
  deriveWorkspaceKey,
  extractMentions,
  formatIssueIdentifier,
  initialsOf,
  parseCsv,
  percent,
  slugify,
  timeAgo,
  toCsv,
} from './utils';

describe('slugify', () => {
  it('normalizes accents and separators', () => {
    expect(slugify('Plataforma de Pagos Ñoño')).toBe('plataforma-de-pagos-nono');
    expect(slugify('  Hello   World!!  ')).toBe('hello-world');
  });
});

describe('deriveWorkspaceKey', () => {
  it('uses the first three letters of a single word', () => {
    expect(deriveWorkspaceKey('Orbit')).toBe('ORB');
  });
  it('uses initials for multiple words', () => {
    expect(deriveWorkspaceKey('Northwind Labs')).toBe('NLX');
  });
  it('pads short initials', () => {
    expect(deriveWorkspaceKey('A B')).toBe('ABX');
  });
  it('falls back for empty names', () => {
    expect(deriveWorkspaceKey('***')).toBe('WRK');
  });
});

describe('initialsOf', () => {
  it('handles single and multi word names', () => {
    expect(initialsOf('Javi')).toBe('JA');
    expect(initialsOf('Javi Rodriguez')).toBe('JR');
    expect(initialsOf('Ana Maria Lopez')).toBe('AL');
    expect(initialsOf('  ')).toBe('?');
  });
});

describe('formatIssueIdentifier', () => {
  it('upper-cases the workspace key', () => {
    expect(formatIssueIdentifier('orb', 123)).toBe('ORB-123');
  });
});

describe('extractMentions', () => {
  it('finds unique handles', () => {
    expect(extractMentions('hey @Javi and @maria.lopez, also @javi')).toEqual(['javi', 'maria.lopez']);
  });
  it('ignores bare @ and email-ish text', () => {
    expect(extractMentions('mail me at a@b.com')).toEqual([]);
    expect(extractMentions('ping ada@example.com or carlos@orbit.dev')).toEqual([]);
    expect(extractMentions('a standalone @ symbol')).toEqual([]);
  });
  it('still matches a mention right after punctuation', () => {
    expect(extractMentions('(@ana) and [@carlos]')).toEqual(['ana', 'carlos']);
  });
});

describe('parseCsv', () => {
  it('parses quoted values, commas and escaped quotes', () => {
    const rows = parseCsv('title,description\n"Fix, bug","He said ""hi"""\nSecond,plain\n');
    expect(rows).toEqual([
      ['title', 'description'],
      ['Fix, bug', 'He said "hi"'],
      ['Second', 'plain'],
    ]);
  });

  it('ignores blank trailing lines', () => {
    expect(parseCsv('a,b\n1,2\n\n')).toHaveLength(2);
  });

  it('round-trips through toCsv', () => {
    const csv = toCsv([{ title: 'A, B', description: 'line1\nline2' }], ['title', 'description']);
    expect(csv).toBe('title,description\n"A, B","line1\nline2"\n');
    expect(parseCsv(csv)[1]).toEqual(['A, B', 'line1\nline2']);
  });
});

describe('percent', () => {
  it('guards against divide by zero', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(1, 3)).toBe(33);
    expect(percent(3, 3)).toBe(100);
  });
});

describe('timeAgo', () => {
  const now = new Date('2025-01-10T12:00:00.000Z');
  it('formats relative timestamps', () => {
    expect(timeAgo('2025-01-10T11:59:30.000Z', now)).toBe('just now');
    expect(timeAgo('2025-01-10T11:30:00.000Z', now)).toBe('30m ago');
    expect(timeAgo('2025-01-10T09:00:00.000Z', now)).toBe('3h ago');
    expect(timeAgo('2025-01-05T12:00:00.000Z', now)).toBe('5d ago');
    expect(timeAgo('2024-12-01T12:00:00.000Z', now)).toBe('1mo ago');
  });
});
