import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  className?: string;
  variant?: 'solid' | 'soft' | 'outline';
  title?: string;
}

export function Badge({ children, color, className, variant = 'soft', title }: BadgeProps) {
  if (!color) {
    return (
      <span
        title={title}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-line bg-sunken px-1.5 py-0.5 text-xs font-medium text-muted',
          className,
        )}
      >
        {children}
      </span>
    );
  }

  const style =
    variant === 'solid'
      ? { backgroundColor: color, color: '#fff', borderColor: color }
      : variant === 'outline'
        ? { borderColor: color, color }
        : { backgroundColor: `${color}22`, color, borderColor: `${color}44` };

  return (
    <span
      title={title}
      style={style}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}
