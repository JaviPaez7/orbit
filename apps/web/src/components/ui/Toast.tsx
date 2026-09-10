import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  action?: ToastAction;
  duration: number;
}

interface ToastContextValue {
  toast: (
    input: Omit<Toast, 'id' | 'variant' | 'duration'> & {
      variant?: ToastVariant;
      duration?: number;
    },
  ) => string;
  success: (title: string, description?: string, action?: ToastAction) => string;
  error: (title: string, description?: string, action?: ToastAction) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, { icon: React.ReactNode; ring: string }> = {
  success: { icon: <Check className="h-4 w-4 text-success" />, ring: 'ring-success/30' },
  error: { icon: <AlertTriangle className="h-4 w-4 text-danger" />, ring: 'ring-danger/30' },
  warning: { icon: <AlertTriangle className="h-4 w-4 text-warning" />, ring: 'ring-warning/30' },
  info: { icon: <Info className="h-4 w-4 text-accent" />, ring: 'ring-accent/30' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const push = useCallback<ToastContextValue['toast']>(
    ({ title, description, variant = 'info', action, duration = 4500 }) => {
      const id = `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [
        ...current.slice(-4),
        { id, title, description, variant, action, duration },
      ]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: push,
      success: (title, description, action) =>
        push({ title, description, variant: 'success', action }),
      error: (title, description, action) =>
        push({ title, description, variant: 'error', duration: 7000, action }),
      info: (title, description) => push({ title, description, variant: 'info' }),
      warning: (title, description) => push({ title, description, variant: 'warning' }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
          role="region"
          aria-label="Notifications"
        >
          {toasts.map((entry) => (
            <div
              key={entry.id}
              role="status"
              aria-live="polite"
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-elevated p-3 shadow-popover ring-1 animate-slide-in-right',
                VARIANT_STYLES[entry.variant].ring,
              )}
            >
              <span className="mt-0.5">{VARIANT_STYLES[entry.variant].icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{entry.title}</p>
                {entry.description && (
                  <p className="mt-0.5 break-words text-xs text-muted">{entry.description}</p>
                )}
                {entry.action && (
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-accent hover:underline"
                    onClick={() => {
                      entry.action?.onClick();
                      dismiss(entry.id);
                    }}
                  >
                    {entry.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(entry.id)}
                className="btn btn-ghost btn-icon-sm shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
