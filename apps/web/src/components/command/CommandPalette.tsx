import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Box,
  CircleDot,
  Clock3,
  CornerDownLeft,
  Hash,
  Inbox,
  LayoutGrid,
  ListChecks,
  Moon,
  Plus,
  Repeat,
  Search,
  Settings,
  Sun,
  Tag,
  User,
  UserCircle2,
} from 'lucide-react';
import { ISSUE_STATUS_LABELS, type IssueStatus } from '@orbit/shared';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { api, buildQuery } from '../../lib/api';
import { queryKeys } from '../../lib/query-client';
import { cn } from '../../lib/utils';
import type { Issue, Project, SearchResult } from '../../lib/types';
import { StatusIcon } from '../ui/Icons';
import { Avatar } from '../ui/Avatar';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onCreateIssue: () => void;
  onOpenShortcuts: () => void;
  onOpenImport: () => void;
}

/**
 * Ctrl/Cmd+K palette: fuzzy issue search, project navigation, workspace
 * switching, issue creation and app commands. Fully keyboard driven
 * (↑ ↓ Enter Esc) and grouped like Linear's.
 */
export function CommandPalette({
  open,
  onClose,
  onCreateIssue,
  onOpenShortcuts,
  onOpenImport,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const { workspace, workspaces, setWorkspaceId, role } = useAuth();
  const { resolved, toggle } = useTheme();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const workspaceId = workspace?.id ?? '';

  useEffect(() => {
    if (!open) {
      setTerm('');
      setDebounced('');
      setIndex(0);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Debounced so typing does not hammer the search endpoint.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [term]);

  const searchQuery = useQuery({
    queryKey: queryKeys.search(workspaceId, debounced),
    queryFn: () =>
      api.get<{ results: SearchResult[] }>(
        `/workspaces/${workspaceId}/search${buildQuery({ q: debounced, limit: 6 })}`,
      ),
    enabled: open && Boolean(workspaceId) && debounced.length > 0,
    staleTime: 10_000,
  });

  const recentIssues = useQuery({
    queryKey: queryKeys.issues(workspaceId, { palette: true }),
    queryFn: () =>
      api.get<{ items: Issue[] }>(
        `/workspaces/${workspaceId}/issues${buildQuery({ limit: 6, sort: 'updatedAt', direction: 'desc' })}`,
      ),
    enabled: open && Boolean(workspaceId) && debounced.length === 0,
    select: (data) => data.items,
  });

  const projects = useQuery({
    queryKey: queryKeys.projects(workspaceId),
    queryFn: () => api.get<{ projects: Project[] }>(`/workspaces/${workspaceId}/projects`),
    enabled: open && Boolean(workspaceId),
    select: (data) => data.projects,
  });

  const commands = useMemo<PaletteAction[]>(() => {
    const base: PaletteAction[] = [
      {
        id: 'create-issue',
        label: 'Create new issue',
        group: 'Actions',
        shortcut: 'C',
        icon: <Plus className="h-4 w-4" />,
        run: onCreateIssue,
      },
      {
        id: 'nav-issues',
        label: 'Go to All issues',
        group: 'Navigation',
        shortcut: 'G I',
        icon: <ListChecks className="h-4 w-4" />,
        run: () => navigate('/issues'),
      },
      {
        id: 'nav-board',
        label: 'Go to Board',
        group: 'Navigation',
        icon: <LayoutGrid className="h-4 w-4" />,
        run: () => navigate('/board'),
      },
      {
        id: 'nav-projects',
        label: 'Go to Projects',
        group: 'Navigation',
        shortcut: 'G P',
        icon: <Box className="h-4 w-4" />,
        run: () => navigate('/projects'),
      },
      {
        id: 'nav-cycles',
        label: 'Go to Cycles',
        group: 'Navigation',
        shortcut: 'G C',
        icon: <Repeat className="h-4 w-4" />,
        run: () => navigate('/cycles'),
      },
      {
        id: 'nav-analytics',
        label: 'Go to Analytics',
        group: 'Navigation',
        icon: <BarChart3 className="h-4 w-4" />,
        run: () => navigate('/analytics'),
      },
      {
        id: 'nav-inbox',
        label: 'Go to Inbox',
        group: 'Navigation',
        shortcut: 'G N',
        icon: <Inbox className="h-4 w-4" />,
        run: () => navigate('/inbox'),
      },
      {
        id: 'nav-my-issues',
        label: 'Go to My issues',
        group: 'Navigation',
        icon: <UserCircle2 className="h-4 w-4" />,
        run: () => navigate('/my-issues'),
      },
      {
        id: 'nav-profile',
        label: 'Profile settings',
        group: 'Navigation',
        icon: <User className="h-4 w-4" />,
        run: () => navigate('/settings/profile'),
      },
      {
        id: 'nav-workspace-settings',
        label: 'Workspace settings',
        group: 'Navigation',
        shortcut: 'G S',
        icon: <Settings className="h-4 w-4" />,
        run: () => navigate('/settings/workspace'),
      },
      {
        id: 'toggle-theme',
        label: resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        group: 'Preferences',
        icon: resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        run: toggle,
      },
      {
        id: 'shortcuts',
        label: 'Show keyboard shortcuts',
        group: 'Preferences',
        shortcut: '?',
        icon: <Hash className="h-4 w-4" />,
        run: onOpenShortcuts,
      },
    ];

    if (role === 'owner' || role === 'admin') {
      base.push({
        id: 'nav-members',
        label: 'Manage members',
        group: 'Navigation',
        icon: <User className="h-4 w-4" />,
        run: () => navigate('/settings/members'),
      });
      base.push({
        id: 'nav-labels',
        label: 'Manage labels',
        group: 'Navigation',
        icon: <Tag className="h-4 w-4" />,
        run: () => navigate('/settings/labels'),
      });
      base.push({
        id: 'import-csv',
        label: 'Import issues from CSV',
        group: 'Actions',
        icon: <ArrowRight className="h-4 w-4" />,
        run: onOpenImport,
      });
    }

    for (const entry of workspaces) {
      if (entry.id === workspaceId) continue;
      base.push({
        id: `switch-${entry.id}`,
        label: `Switch to ${entry.name}`,
        hint: entry.key,
        group: 'Workspaces',
        icon: (
          <span
            className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white"
            style={{ backgroundColor: entry.logoColor ?? '#6366f1' }}
          >
            {entry.name.slice(0, 1).toUpperCase()}
          </span>
        ),
        run: () => {
          setWorkspaceId(entry.id);
          navigate('/issues');
        },
      });
    }
    return base;
  }, [
    navigate,
    onCreateIssue,
    onOpenShortcuts,
    onOpenImport,
    resolved,
    toggle,
    workspaces,
    workspaceId,
    setWorkspaceId,
    role,
  ]);

  const results = useMemo(() => searchQuery.data?.results ?? [], [searchQuery.data]);

  const items = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [];

    if (debounced.length > 0) {
      for (const result of results) {
        list.push({
          id: `result-${result.type}-${result.id}`,
          label: result.title,
          hint: result.subtitle ?? result.type,
          group: result.type === 'issue' ? 'Issues' : result.type === 'project' ? 'Projects' : 'Results',
          icon:
            result.type === 'issue' ? (
              <StatusIcon status={String(result.meta?.status ?? 'todo')} />
            ) : result.type === 'project' ? (
              <span
                className="h-3 w-3 rounded"
                style={{ backgroundColor: String(result.meta?.color ?? '#6366f1') }}
              />
            ) : result.type === 'user' ? (
              <Avatar
                name={result.title}
                src={(result.meta?.avatarUrl as string | null) ?? null}
                size="xs"
              />
            ) : result.type === 'label' ? (
              <Tag className="h-4 w-4" style={{ color: String(result.meta?.color ?? '#6366f1') }} />
            ) : (
              <Clock3 className="h-4 w-4" />
            ),
          run: () => navigate(result.url),
        });
      }
    } else {
      for (const issue of recentIssues.data ?? []) {
        list.push({
          id: `recent-${issue.id}`,
          label: `${issue.identifier} ${issue.title}`,
          hint: ISSUE_STATUS_LABELS[issue.status as IssueStatus] ?? issue.status,
          group: 'Recently updated',
          icon: <StatusIcon status={issue.status} />,
          run: () => navigate(`/issues/${issue.identifier}`),
        });
      }
      for (const project of (projects.data ?? []).slice(0, 5)) {
        list.push({
          id: `project-${project.id}`,
          label: project.name,
          hint: `${project.issueCount} issues`,
          group: 'Projects',
          icon: (
            <span
              className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white"
              style={{ backgroundColor: project.color }}
            >
              {project.name.slice(0, 1).toUpperCase()}
            </span>
          ),
          run: () => navigate(`/projects/${project.id}`),
        });
      }
    }

    const needle = debounced.toLowerCase();
    const matchingCommands = needle
      ? commands.filter((command) => command.label.toLowerCase().includes(needle))
      : commands;

    return [...list, ...matchingCommands];
  }, [debounced, results, recentIssues.data, projects.data, commands, navigate]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteAction[]>();
    for (const item of items) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [items]);

  const flat = useMemo(() => grouped.flatMap(([, groupItems]) => groupItems), [grouped]);

  useEffect(() => {
    setIndex(0);
  }, [debounced]);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [index, flat.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Capture phase so the palette closes even while the input has focus.
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setIndex((current) => (flat.length === 0 ? 0 : (current + 1) % flat.length));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setIndex((current) => (flat.length === 0 ? 0 : (current - 1 + flat.length) % flat.length));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const target = flat[index];
        if (target) {
          onClose();
          target.run();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, flat, index, onClose]);

  if (!open) return null;

  const activeId = flat[index]?.id;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="command-palette"
        className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-elevated shadow-popover animate-scale-in"
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-subtle" />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search issues, projects or run a command…"
            aria-label="Command palette search"
            className="w-full bg-transparent text-base outline-none placeholder:text-subtle"
          />
          <span className="kbd">esc</span>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-1.5">
          {debounced.length > 0 && results.length === 0 && commands.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-subtle">
              No results for “{debounced}”
              {searchQuery.isFetching ? ' — searching…' : ''}
            </p>
          )}
          {grouped.map(([group, groupItems]) => (
            <div key={group} className="mb-1">
              <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-subtle">
                {group}
              </p>
              {groupItems.map((item) => {
                const globalIndex = flat.indexOf(item);
                const active = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onMouseEnter={() => setIndex(globalIndex)}
                    onClick={() => {
                      onClose();
                      item.run();
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                      active ? 'bg-hover text-fg' : 'text-muted hover:bg-hover/60 hover:text-fg',
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && (
                      <span className="max-w-[10rem] shrink-0 truncate text-2xs text-subtle">{item.hint}</span>
                    )}
                    {item.shortcut && <span className="kbd shrink-0">{item.shortcut}</span>}
                    {active && <CornerDownLeft className="h-3 w-3 shrink-0 text-subtle" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <footer className="flex items-center gap-3 border-t border-line px-3 py-2 text-2xs text-subtle">
          <span className="flex items-center gap-1">
            <CircleDot className="h-3 w-3" /> {workspace?.name}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
