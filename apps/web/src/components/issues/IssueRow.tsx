import { memo } from 'react';
import { CalendarDays, GitBranch, MessageSquare, Paperclip, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Issue } from '../../lib/types';
import { cn, formatDateShort, isOverdue } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import { PriorityIcon, StatusIcon } from '../ui/Icons';
import { Tooltip } from '../ui/Tooltip';

interface IssueRowProps {
  issue: Issue;
  selected: boolean;
  focused: boolean;
  onToggle: (issueId: string, shiftKey: boolean) => void;
  onFocus: (issueId: string) => void;
  showStatus?: boolean;
  showProject?: boolean;
  selectable?: boolean;
  /** Rendered in the kanban card style instead of a table row. */
  variant?: 'row' | 'card';
  dragging?: boolean;
}

/**
 * One issue in a list. Memoized because a board/list of 100+ rows re-renders
 * often (selection, realtime updates) and this is the hot path.
 */
export const IssueRow = memo(function IssueRow({
  issue,
  selected,
  focused,
  onToggle,
  onFocus,
  showStatus = true,
  showProject = true,
  selectable = true,
  variant = 'row',
  dragging,
}: IssueRowProps) {
  const overdue = isOverdue(issue.dueDate, issue.status);

  if (variant === 'card') {
    return (
      <article
        data-testid={`issue-card-${issue.identifier}`}
        data-issue-id={issue.id}
        className={cn(
          'group cursor-grab rounded-lg border border-line bg-surface p-2.5 shadow-sm transition-colors hover:border-line-strong',
          dragging && 'opacity-60',
        )}
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 font-mono text-2xs text-subtle">{issue.identifier}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {issue.priority !== 'none' && (
              <PriorityIcon priority={issue.priority} className="h-3.5 w-3.5" />
            )}
            {issue.assignee ? (
              <Avatar name={issue.assignee.name} src={issue.assignee.avatarUrl} size="sm" />
            ) : (
              <span
                className="h-5 w-5 rounded-full border border-dashed border-line-strong"
                title="Unassigned"
              />
            )}
          </div>
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm text-fg">{issue.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {issue.labels.slice(0, 3).map((label) => (
            <span
              key={label.id}
              className="rounded px-1.5 py-0.5 text-2xs"
              style={{ backgroundColor: `${label.color}22`, color: label.color }}
            >
              {label.name}
            </span>
          ))}
          {issue.dueDate && (
            <span
              className={cn(
                'flex items-center gap-1 text-2xs',
                overdue ? 'text-danger' : 'text-subtle',
              )}
            >
              <CalendarDays className="h-3 w-3" />
              {formatDateShort(issue.dueDate)}
            </span>
          )}
          {issue.counts.comments > 0 && (
            <span className="flex items-center gap-1 text-2xs text-subtle">
              <MessageSquare className="h-3 w-3" />
              {issue.counts.comments}
            </span>
          )}
          {issue.counts.subIssues > 0 && (
            <span className="flex items-center gap-1 text-2xs text-subtle">
              <GitBranch className="h-3 w-3" />
              {issue.counts.subIssues}
            </span>
          )}
          {issue.estimate !== null && (
            <span className="ml-auto font-mono text-2xs text-subtle">{issue.estimate}</span>
          )}
        </div>
      </article>
    );
  }

  return (
    <div
      data-testid={`issue-row-${issue.identifier}`}
      data-issue-id={issue.id}
      aria-selected={selected}
      onMouseEnter={() => onFocus(issue.id)}
      className={cn(
        'group flex items-center gap-2 border-b border-line/60 px-3 py-2 transition-colors',
        selected ? 'bg-accent/10' : focused ? 'bg-hover/70' : 'hover:bg-hover/50',
      )}
    >
      {selectable && (
        <input
          type="checkbox"
          aria-label={`Select ${issue.identifier}`}
          checked={selected}
          onChange={(event) => onToggle(issue.id, (event.nativeEvent as MouseEvent).shiftKey)}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-line-strong bg-transparent accent-[rgb(var(--accent))]"
        />
      )}

      <PriorityIcon priority={issue.priority} className="h-3.5 w-3.5 shrink-0" />

      {showStatus && (
        <Tooltip label={issue.status.replace(/_/g, ' ')}>
          <StatusIcon status={issue.status} className="h-3.5 w-3.5 shrink-0" />
        </Tooltip>
      )}

      <Link
        to={`/issues/${issue.identifier}`}
        className="shrink-0 font-mono text-2xs text-subtle transition-colors hover:text-accent"
      >
        {issue.identifier}
      </Link>

      <Link
        to={`/issues/${issue.identifier}`}
        className="min-w-0 flex-1 truncate text-sm text-fg hover:text-accent"
        title={issue.title}
      >
        {issue.title}
      </Link>

      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        {issue.labels.slice(0, 2).map((label) => (
          <span
            key={label.id}
            className="rounded px-1.5 py-0.5 text-2xs"
            style={{ backgroundColor: `${label.color}22`, color: label.color }}
            title={label.name}
          >
            {label.name}
          </span>
        ))}
        {issue.labels.length > 2 && (
          <span className="text-2xs text-subtle">+{issue.labels.length - 2}</span>
        )}
      </div>

      {showProject && issue.project && (
        <Tooltip label={issue.project.name}>
          <Link
            to={`/projects/${issue.project.id}`}
            className="hidden shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-muted transition-colors hover:bg-hover lg:flex"
          >
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: issue.project.color }} />
            <span className="max-w-[8rem] truncate">{issue.project.name}</span>
          </Link>
        </Tooltip>
      )}

      {issue.dueDate && (
        <span
          className={cn(
            'hidden shrink-0 items-center gap-1 text-2xs lg:flex',
            overdue ? 'text-danger' : 'text-subtle',
          )}
          title={overdue ? 'Overdue' : 'Due date'}
        >
          <CalendarDays className="h-3 w-3" />
          {formatDateShort(issue.dueDate)}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1.5 text-2xs text-subtle">
        {issue.counts.comments > 0 && (
          <span className="hidden items-center gap-0.5 sm:flex">
            <MessageSquare className="h-3 w-3" />
            {issue.counts.comments}
          </span>
        )}
        {issue.counts.attachments > 0 && (
          <span className="hidden items-center gap-0.5 sm:flex">
            <Paperclip className="h-3 w-3" />
            {issue.counts.attachments}
          </span>
        )}
        {issue.counts.subIssues > 0 && (
          <span className="hidden items-center gap-0.5 sm:flex">
            <GitBranch className="h-3 w-3" />
            {issue.counts.subIssues}
          </span>
        )}
      </div>

      <span className="w-7 shrink-0 text-right font-mono text-2xs text-subtle">
        {issue.estimate !== null ? issue.estimate : ''}
      </span>

      <span className="shrink-0">
        {issue.assignee ? (
          <Avatar name={issue.assignee.name} src={issue.assignee.avatarUrl} size="sm" />
        ) : (
          <span
            className="block h-5 w-5 rounded-full border border-dashed border-line-strong"
            title="Unassigned"
          />
        )}
      </span>

      <button
        type="button"
        aria-label={`Delete ${issue.identifier}`}
        className="btn btn-ghost btn-icon-sm shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        data-delete-issue={issue.id}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});
