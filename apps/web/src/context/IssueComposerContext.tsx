import { createContext, useContext } from 'react';

export interface IssueComposerControls {
  /** Opens the global "new issue" dialog, optionally pre-filled. */
  openComposer: (options?: { status?: string; projectId?: string | null }) => void;
  /** Opens the command palette (global search). */
  openSearch: () => void;
  /** Opens the keyboard-shortcuts dialog. */
  openShortcuts: () => void;
}

const IssueComposerContext = createContext<IssueComposerControls | null>(null);

export const IssueComposerProvider = IssueComposerContext.Provider;

/**
 * Exposes the shell's global overlays so every page header can wire its
 * "New issue" / search buttons without prop drilling.
 */
export function useIssueComposer(): IssueComposerControls {
  const context = useContext(IssueComposerContext);
  if (!context) throw new Error('useIssueComposer must be used inside <IssueComposerProvider>');
  return context;
}
