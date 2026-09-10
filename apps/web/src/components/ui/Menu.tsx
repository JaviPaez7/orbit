import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { usePopover } from '../../hooks/usePopover';

interface MenuProps {
  trigger: (props: {
    onClick: (event: React.MouseEvent) => void;
    'aria-expanded': boolean;
    'aria-haspopup': 'menu' | 'dialog' | 'listbox';
    ref: (node: HTMLElement | null) => void;
  }) => React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end' | 'center';
  side?: 'bottom' | 'top';
  width?: number;
  className?: string;
  panelClassName?: string;
  /** `data-testid` for the floating panel (tests scope menu items through it). */
  testId?: string;
}

export function Menu({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  width,
  panelClassName,
  testId = 'menu-panel',
}: MenuProps) {
  const popover = usePopover({ align, side });

  return (
    <>
      {trigger(popover.triggerProps)}
      {popover.open &&
        createPortal(
          <div
            ref={popover.panelRef}
            role="menu"
            data-testid={testId}
            aria-orientation="vertical"
            style={{ ...popover.style, width }}
            className={cn('menu animate-scale-in', panelClassName)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  selected?: boolean;
}

export function MenuItem({
  icon,
  shortcut,
  danger,
  selected,
  className,
  children,
  ...props
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'menu-item',
        danger && 'text-danger hover:bg-danger/10',
        selected && 'bg-hover',
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate text-left">{children}</span>
      {shortcut && <span className="ml-2 shrink-0 font-mono text-2xs text-subtle">{shortcut}</span>}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="menu-label">{children}</div>;
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" role="separator" />;
}
