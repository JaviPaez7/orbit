import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Rendered without the header chrome (used by the command palette). */
  bare?: boolean;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}
const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Accessible modal: focus is trapped, Escape closes, background scroll is
 * locked and the overlay is click-dismissable.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  bare,
  className,
  initialFocusRef,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusTarget =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select, [data-autofocus], button:not([data-skip-focus])',
      );
    focusTarget?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 pt-[10vh]">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[1px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        className={cn(
          'relative w-full rounded-xl border border-line bg-elevated shadow-popover animate-scale-in',
          sizeMap[size],
          className,
        )}
      >
        {!bare && title && (
          <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-fg">{title}</h2>
              {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              title="Close (Esc)"
              data-skip-focus
              className="btn btn-ghost btn-icon-sm shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
        )}
        <div className={cn(!bare && 'px-4 py-4')}>{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
