import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
  rounded?: boolean;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 && 'w-2/3')} />
      ))}
    </div>
  );
}

export function IssueListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line/60">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className={cn('h-3', index % 3 === 0 ? 'w-64' : index % 3 === 1 ? 'w-80' : 'w-48')} />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BoardSkeleton({ columns = 3 }: { columns?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden p-4">
      {Array.from({ length: columns }).map((_, columnIndex) => (
        <div key={columnIndex} className="w-72 shrink-0 space-y-2 rounded-xl border border-line bg-sunken/40 p-2">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 3 + (columnIndex % 2) }).map((__, cardIndex) => (
            <div key={cardIndex} className="space-y-2 rounded-lg border border-line bg-surface p-3">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <Skeleton className="h-4 w-40" />
      <div className="flex h-48 items-end gap-1.5">
        {Array.from({ length: 24 }).map((_, index) => (
          <Skeleton
            key={index}
            className="flex-1 rounded-t"
            // Deterministic pseudo-random heights keep the skeleton stable.
            {...{ style: { height: `${25 + ((index * 37) % 70)}%` } }}
          />
        ))}
      </div>
    </div>
  );
}
