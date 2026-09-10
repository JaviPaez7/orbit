import { cn } from '../../lib/utils';

/**
 * Lightweight tooltip. Uses the native `title` attribute for accessibility and
 * a CSS-only visual hint on hover — no portal, no layout thrash, works inside
 * virtualized rows.
 */
export function Tooltip({
  label,
  children,
  side = 'top',
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  if (!label) return <>{children}</>;
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-[90] hidden whitespace-nowrap rounded-md border border-line bg-elevated px-2 py-1 text-2xs text-fg shadow-popover group-hover/tooltip:block',
          side === 'top' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
          side === 'bottom' && 'left-1/2 top-full mt-1.5 -translate-x-1/2',
          side === 'left' && 'right-full top-1/2 mr-1.5 -translate-y-1/2',
          side === 'right' && 'left-full top-1/2 ml-1.5 -translate-y-1/2',
        )}
      >
        {label}
      </span>
    </span>
  );
}
