import { AlertTriangle, Loader2, RefreshCw, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ApiError } from '../../lib/api';
import { Button } from './Button';

/**
 * Renders a readable failure. API validation errors include the per-field
 * messages so "Please fix the highlighted fields" is never shown bare.
 */
function describeError(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    const fields = error.fields
      ? Object.entries(error.fields)
          .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
          .join(' · ')
      : '';
    return fields ? `${error.message} — ${fields}` : error.message;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return undefined;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-8' : 'gap-3 py-16',
        className,
      )}
    >
      {Icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-sunken text-subtle">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description && <p className="mx-auto max-w-sm text-xs text-muted">{description}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
  error,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
  error?: unknown;
}) {
  const detail = description ?? describeError(error);

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-14 text-center', className)}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        {detail && <p className="mx-auto max-w-md text-xs text-muted">{detail}</p>}
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cn('h-4 w-4 animate-spin text-muted', className)} aria-label="Loading" />
  );
}

export function LoadingOverlay({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-app/60">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-1.5 shadow-panel">
        <Spinner />
        <span className="text-xs text-muted">{label}</span>
      </div>
    </div>
  );
}
