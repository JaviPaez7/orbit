import { useEffect, useRef, useState } from 'react';

interface ShortcutHandlers {
  onCommandPalette: () => void;
  onCreateIssue: () => void;
  onSearch: () => void;
  onToggleTheme: () => void;
  onShortcutsHelp: () => void;
  onNavigate?: (key: string) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    element.isContentEditable ||
    element.getAttribute('role') === 'textbox'
  );
}

/**
 * Global keyboard layer.
 *
 * * Modifier combos (⌘/Ctrl+K, ⌘↵) always work.
 * * Single-key shortcuts are ignored while typing or while a dialog is open.
 * * `G` prefixes a navigation chord (G then I/P/B/C/N/A/S).
 */
export function useGlobalShortcuts(handlers: ShortcutHandlers): void {
  const pendingPrefix = useRef<string | null>(null);
  const prefixTimer = useRef<number | null>(null);
  const [prefix, setPrefix] = useState<string | null>(null);

  useEffect(() => {
    const clearPrefix = () => {
      pendingPrefix.current = null;
      setPrefix(null);
      if (prefixTimer.current) window.clearTimeout(prefixTimer.current);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const typing = isTypingTarget(event.target);
      const dialogOpen = document.querySelector('[role="dialog"][aria-modal="true"]') !== null;

      // --- modifier combos --------------------------------------------------
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        handlers.onCommandPalette();
        return;
      }

      if (typing) return;

      if (event.key === 'Escape') {
        clearPrefix();
        return;
      }

      if (dialogOpen) return;

      // --- chords -----------------------------------------------------------
      if (pendingPrefix.current === 'g') {
        const key = event.key.toLowerCase();
        clearPrefix();
        if ('ipbcnas'.includes(key)) {
          event.preventDefault();
          handlers.onNavigate?.(key);
        }
        return;
      }

      if (event.key === 'g' && !meta) {
        pendingPrefix.current = 'g';
        setPrefix('g');
        prefixTimer.current = window.setTimeout(clearPrefix, 1600);
        return;
      }

      // --- single keys ------------------------------------------------------
      if (event.shiftKey && event.key === '?') {
        event.preventDefault();
        handlers.onShortcutsHelp();
        return;
      }

      switch (event.key) {
        case 'c':
          event.preventDefault();
          handlers.onCreateIssue();
          break;
        case '/':
          event.preventDefault();
          handlers.onSearch();
          break;
        case '?':
          event.preventDefault();
          handlers.onShortcutsHelp();
          break;
        case 't':
          event.preventDefault();
          handlers.onToggleTheme();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (prefixTimer.current) window.clearTimeout(prefixTimer.current);
    };
  }, [handlers]);

  void prefix;
}
