import { Modal } from '../ui/Modal';

const SHORTCUT_GROUPS: { title: string; items: { keys: string[]; description: string }[] }[] = [
  {
    title: 'General',
    items: [
      { keys: ['⌘', 'K'], description: 'Open the command palette' },
      { keys: ['Ctrl', 'K'], description: 'Open the command palette (Windows/Linux)' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['?'], description: 'Show this help' },
      { keys: ['Esc'], description: 'Close the current dialog or palette' },
      { keys: ['Shift', '?'], description: 'Toggle the theme' },
    ],
  },
  {
    title: 'Issues',
    items: [
      { keys: ['C'], description: 'Create a new issue' },
      { keys: ['G', 'I'], description: 'Go to all issues' },
      { keys: ['G', 'B'], description: 'Go to the board' },
      { keys: ['G', 'P'], description: 'Go to projects' },
      { keys: ['G', 'C'], description: 'Go to cycles' },
      { keys: ['G', 'N'], description: 'Go to the inbox' },
      { keys: ['G', 'A'], description: 'Go to analytics' },
      { keys: ['G', 'S'], description: 'Go to workspace settings' },
    ],
  },
  {
    title: 'Issue list',
    items: [
      { keys: ['J'], description: 'Move selection down' },
      { keys: ['K'], description: 'Move selection up' },
      { keys: ['Enter'], description: 'Open the selected issue' },
      { keys: ['X'], description: 'Toggle selection of the focused row' },
      { keys: ['⌘', 'A'], description: 'Select every issue on the page' },
      { keys: ['S'], description: 'Change status of the selection' },
      { keys: ['P'], description: 'Change priority of the selection' },
      { keys: ['A'], description: 'Assign the selection' },
      { keys: ['⌫'], description: 'Delete the selection' },
    ],
  },
  {
    title: 'Issue detail',
    items: [
      { keys: ['E'], description: 'Edit the title' },
      { keys: ['M'], description: 'Focus the comment box' },
      { keys: ['⌘', '↵'], description: 'Submit a comment or form' },
    ],
  },
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" size="lg">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-subtle">
              {group.title}
            </h3>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li key={item.description} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted">{item.description}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key) => (
                      <kbd key={key} className="kbd">
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-5 border-t border-line pt-3 text-2xs text-subtle">
        Single-key shortcuts are disabled while typing in an input so they never interrupt writing.
      </p>
    </Modal>
  );
}
