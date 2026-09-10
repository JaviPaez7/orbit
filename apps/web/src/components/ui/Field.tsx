import { forwardRef, useId } from 'react';
import { cn } from '../../lib/utils';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => React.ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const describedBy = error || hint ? `${id}-desc` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-muted">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {(error || hint) && (
        <p id={`${id}-desc`} className={cn('text-xs', error ? 'text-danger' : 'text-subtle')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Leading adornment (icon). Named to avoid clashing with the HTML `prefix`. */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leading, trailing, ...props },
  ref,
) {
  if (leading || trailing) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/40',
          invalid && 'border-danger',
          className,
        )}
      >
        {leading && <span className="text-subtle [&>svg]:h-4 [&>svg]:w-4">{leading}</span>}
        <input
          ref={ref}
          className="w-full bg-transparent py-1.5 text-base outline-none placeholder:text-subtle disabled:opacity-60"
          {...props}
        />
        {trailing}
      </div>
    );
  }
  return (
    <input ref={ref} className={cn('input', invalid && 'border-danger', className)} {...props} />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'input min-h-[80px] resize-y leading-relaxed',
        invalid && 'border-danger',
        className,
      )}
      {...props}
    />
  );
});

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', disabled && 'opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 h-4 w-7 shrink-0 rounded-full border transition-colors',
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-sunken',
        )}
      >
        <span
          className={cn(
            'block h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function ProgressBar({
  value,
  color,
  className,
  height = 'h-1.5',
}: {
  value: number;
  color?: string;
  className?: string;
  height?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-selected', height, className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${clamped}%`, backgroundColor: color ?? 'rgb(var(--accent))' }}
      />
    </div>
  );
}
