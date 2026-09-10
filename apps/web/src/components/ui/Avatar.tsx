import { cn } from '../../lib/utils';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  title?: string;
}

const sizeMap = {
  xs: 'h-4 w-4 text-[8px]',
  sm: 'h-5 w-5 text-[9px]',
  md: 'h-6 w-6 text-[10px]',
  lg: 'h-8 w-8 text-xs',
  xl: 'h-16 w-16 text-xl',
};

/** Deterministic fallback colour so the same person always looks the same. */
const PALETTE = [
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f59e0b',
  '#8b5cf6',
  '#22c55e',
  '#0ea5e9',
  '#ef4444',
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  return PALETTE[hash % PALETTE.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}

export function Avatar({ name, src, size = 'md', className, title }: AvatarProps) {
  const label = title ?? name;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        title={label}
        loading="lazy"
        className={cn(
          'shrink-0 rounded-full object-cover ring-1 ring-line',
          sizeMap[size],
          className,
        )}
      />
    );
  }
  return (
    <span
      title={label}
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ring-1 ring-black/10',
        sizeMap[size],
        className,
      )}
      style={{ backgroundColor: colorFor(name) }}
    >
      {initials(name)}
    </span>
  );
}

interface AvatarStackProps {
  people: { id: string; name: string; avatarUrl?: string | null }[];
  max?: number;
  size?: AvatarProps['size'];
}

export function AvatarStack({ people, max = 4, size = 'md' }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((person, index) => (
        <span key={person.id} className={cn(index > 0 && '-ml-1.5')}>
          <Avatar name={person.name} src={person.avatarUrl} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className={cn(
            '-ml-1.5 inline-flex items-center justify-center rounded-full bg-selected font-medium text-muted ring-1 ring-line',
            sizeMap[size],
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
