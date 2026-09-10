import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** "3h ago" style relative timestamps. */
export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
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

export function isOverdue(dueDate: string | null | undefined, status: string): boolean {
  if (!dueDate) return false;
  if (status === 'done' || status === 'cancelled') return false;
  return new Date(dueDate).getTime() < Date.now();
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Escapes user text before it reaches the tiny markdown renderer. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Deliberately small markdown subset (no raw HTML, no external dependency):
 * headings, bold, italics, strikethrough, inline code, fenced code, links,
 * ordered/unordered lists and blockquotes.
 */
export function renderMarkdown(input: string): string {
  const escaped = escapeHtml(input);
  const codeBlocks: string[] = [];

  const withCode = escaped.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
    codeBlocks.push(`<pre><code>${code.replace(/^\n/, '')}</code></pre>`);
    return `\u0000BLOCK${codeBlocks.length - 1}\u0000`;
  });

  const inline = (text: string) =>
    text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
      )
      .replace(
        /(^|\s)(https?:\/\/[^\s<]+)/g,
        '$1<a href="$2" target="_blank" rel="noreferrer noopener">$2</a>',
      )
      .replace(/@([a-zA-Z0-9][a-zA-Z0-9._-]{1,38})/g, '<span class="text-accent">@$1</span>');

  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of withCode.split('\n')) {
    const line = rawLine.trimEnd();
    if (/^\u0000BLOCK\d+\u0000$/.test(line)) {
      closeList();
      html.push(line);
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      closeList();
      const level = line.match(/^#+/)![0].length;
      html.push(`<h${level}>${inline(line.replace(/^#+\s*/, ''))}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeList();
      html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${inline(line.replace(/^\d+[.)]\s+/, ''))}</li>`);
      continue;
    }
    if (line.trim() === '') {
      closeList();
      continue;
    }
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();

  return html
    .join('\n')
    .replace(/\u0000BLOCK(\d+)\u0000/g, (_match, index: string) => codeBlocks[Number(index)] ?? '');
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

export function STATUS_ORDER(): string[] {
  return ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];
}
