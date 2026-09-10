import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDate,
  formatDateShort,
  isOverdue,
  pluralize,
  relativeTime,
  renderMarkdown,
  toDateInput,
} from '../lib/utils';

describe('markdown renderer', () => {
  it('escapes raw HTML so injected markup cannot execute', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"> and <script>alert(2)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img');
  });

  it('renders headings, emphasis and inline code', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** and _italic_ and `code`.');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders lists and blockquotes', () => {
    const html = renderMarkdown('- one\n- two\n\n1. first\n2. second\n\n> quoted');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>first</li>');
    expect(renderMarkdown('> quoted')).toContain('<blockquote>quoted</blockquote>');
  });

  it('renders fenced code blocks untouched by inline rules', () => {
    const html = renderMarkdown('```\nconst a = **not bold**;\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('const a = **not bold**;');
    expect(html).not.toContain('<strong>');
  });

  it('linkifies urls and formats @mentions', () => {
    const html = renderMarkdown('see https://example.com and @maria');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('@maria');
  });
});

describe('date helpers', () => {
  // Formatting intentionally follows the viewer's locale, so assertions check
  // shape and graceful degradation rather than a hard-coded month name.
  it('formats and tolerates invalid input', () => {
    const short = formatDateShort('2026-01-15T10:00:00.000Z');
    expect(short).not.toBe('—');
    expect(short.length).toBeGreaterThan(1);
    expect(short).toMatch(/\d/);

    const long = formatDate('2026-01-15T10:00:00.000Z');
    expect(long).toMatch(/2026/);

    expect(formatDateShort(null)).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDateShort('not-a-date')).toBe('—');

    expect(toDateInput(null)).toBe('');
    expect(toDateInput('2026-01-15T10:00:00.000Z')).toBe('2026-01-15');
  });

  it('flags overdue issues but ignores completed ones', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect(isOverdue(yesterday, 'todo')).toBe(true);
    expect(isOverdue(yesterday, 'done')).toBe(false);
    expect(isOverdue(yesterday, 'cancelled')).toBe(false);
    expect(isOverdue(null, 'todo')).toBe(false);
  });

  it('produces relative timestamps', () => {
    expect(relativeTime(new Date())).toBe('just now');
    expect(relativeTime(null)).toBe('—');
    expect(relativeTime(new Date(Date.now() - 3 * 3_600_000))).toBe('3h ago');
  });
});

describe('formatting helpers', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('pluralizes', () => {
    expect(pluralize(1, 'issue')).toBe('1 issue');
    expect(pluralize(2, 'issue')).toBe('2 issues');
    expect(pluralize(0, 'cycle')).toBe('0 cycles');
  });
});
