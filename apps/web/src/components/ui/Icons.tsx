import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  Eye,
  Minus,
  SignalHigh,
  SignalLow,
  SignalMedium,
  TriangleAlert,
} from 'lucide-react';
import type { IssuePriority, IssueStatus } from '@orbit/shared';
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS } from '@orbit/shared';
import { cn } from '../../lib/utils';

export const STATUS_COLORS: Record<string, string> = {
  backlog: '#8a909c',
  todo: '#9aa1ad',
  in_progress: '#e2a83e',
  in_review: '#6c7df6',
  done: '#42c284',
  cancelled: '#6c7280',
};

export function StatusIcon({ status, className }: { status: string; className?: string }) {
  const shared = cn('h-4 w-4 shrink-0', className);
  const color = STATUS_COLORS[status] ?? '#8a909c';
  switch (status) {
    case 'backlog':
      return <CircleDashed className={shared} style={{ color }} aria-label="Backlog" />;
    case 'todo':
      return <Circle className={shared} style={{ color }} aria-label="Todo" />;
    case 'in_progress':
      return <CircleDot className={shared} style={{ color }} aria-label="In Progress" />;
    case 'in_review':
      return <Eye className={shared} style={{ color }} aria-label="In Review" />;
    case 'done':
      return <CheckCircle2 className={shared} style={{ color }} aria-label="Done" />;
    case 'cancelled':
      return <Ban className={shared} style={{ color }} aria-label="Cancelled" />;
    default:
      return <Circle className={shared} style={{ color }} />;
  }
}

export function PriorityIcon({ priority, className }: { priority: string; className?: string }) {
  const shared = cn('h-4 w-4 shrink-0', className);
  switch (priority) {
    case 'urgent':
      return <TriangleAlert className={cn(shared, 'text-[#f97316]')} aria-label="Urgent" />;
    case 'high':
      return <SignalHigh className={cn(shared, 'text-[#ec5e5e]')} aria-label="High" />;
    case 'medium':
      return <SignalMedium className={cn(shared, 'text-[#e2a83e]')} aria-label="Medium" />;
    case 'low':
      return <SignalLow className={cn(shared, 'text-[#6c7df6]')} aria-label="Low" />;
    case 'none':
    default:
      return <Minus className={cn(shared, 'text-subtle')} aria-label="No priority" />;
  }
}

export function statusLabel(status: string): string {
  return ISSUE_STATUS_LABELS[status as IssueStatus] ?? status;
}

export function priorityLabel(priority: string): string {
  return ISSUE_PRIORITY_LABELS[priority as IssuePriority] ?? priority;
}

export const STATUS_OPTIONS = (['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'] as const).map(
  (status) => ({
    value: status,
    label: ISSUE_STATUS_LABELS[status],
    color: STATUS_COLORS[status],
  }),
);

export const PRIORITY_OPTIONS = (['urgent', 'high', 'medium', 'low', 'none'] as const).map((priority) => ({
  value: priority,
  label: ISSUE_PRIORITY_LABELS[priority],
}));

export function StatusLabel({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {statusLabel(status)}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <PriorityIcon priority={priority} className="h-3.5 w-3.5" />
      {priorityLabel(priority)}
    </span>
  );
}

export function AlertIcon() {
  return <AlertCircle className="h-4 w-4" />;
}
