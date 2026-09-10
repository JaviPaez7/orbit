import { useEffect, useRef, useState } from 'react';

interface UsePopoverOptions {
  /** Gap between the trigger and the panel, in pixels. */
  offset?: number;
  align?: 'start' | 'end' | 'center';
  /** Preferred side; flips automatically when there is not enough room. */
  side?: 'bottom' | 'top';
}

export interface PopoverState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  panelRef: React.MutableRefObject<HTMLDivElement | null>;
  style: React.CSSProperties;
  /** Attach to the trigger button for keyboard/ARIA wiring. */
  triggerProps: {
    onClick: (event: React.MouseEvent) => void;
    'aria-expanded': boolean;
    'aria-haspopup': 'menu' | 'dialog' | 'listbox';
    ref: (node: HTMLElement | null) => void;
  };
}

/**
 * Positioning + dismissal behaviour shared by every floating surface
 * (menus, dropdowns, tooltips-free popovers). Renders into a fixed-position
 * container so it is never clipped by an `overflow: hidden` ancestor.
 */
export function usePopover(options: UsePopoverOptions = {}): PopoverState {
  const { offset = 6, align = 'start', side = 'bottom' } = options;
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({ position: 'fixed', top: 0, left: 0 });
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const reposition = () => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    const width = panelRect?.width ?? 220;
    const height = panelRect?.height ?? 240;

    let top = side === 'bottom' ? rect.bottom + offset : rect.top - height - offset;
    if (side === 'bottom' && top + height > window.innerHeight - 8) {
      const flipped = rect.top - height - offset;
      if (flipped > 8) top = flipped;
    } else if (side === 'top' && top < 8) {
      top = rect.bottom + offset;
    }
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));

    let left = rect.left;
    if (align === 'end') left = rect.right - width;
    else if (align === 'center') left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

    setStyle({ position: 'fixed', top, left, minWidth: Math.max(rect.width, 180) });
  };

  useEffect(() => {
    if (!open) return;

    reposition();
    // A second pass after paint measures the real panel size.
    const raf = requestAnimationFrame(reposition);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', reposition);
    // Capture phase so scrolls inside nested containers also close the panel.
    window.addEventListener('scroll', onScroll, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', onScroll, true);
    };
    // `reposition` is stable enough for this usage (refs + options only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, offset, align, side]);

  return {
    open,
    setOpen,
    toggle: () => setOpen((value) => !value),
    triggerRef,
    panelRef,
    style,
    triggerProps: {
      onClick: (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen((value) => !value);
      },
      'aria-expanded': open,
      'aria-haspopup': 'menu',
      ref: (node: HTMLElement | null) => {
        triggerRef.current = node;
      },
    },
  };
}
