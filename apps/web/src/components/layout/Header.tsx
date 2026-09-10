import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Check, ChevronRight, Inbox, Moon, Plus, Search, Sun } from 'lucide-react';
import { useAuth, usePermissions } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/query-client';
import { cn, relativeTime } from '../../lib/utils';
import type { Cycle, Issue, Notification, Project } from '../../lib/types';
import { AvatarStack } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';

interface Crumb {
  label: string;
  to?: string;
}

interface HeaderProps {
  onCreateIssue: () => void;
  onOpenSearch: () => void;
  title?: string;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  /** Shows the presence avatars + realtime status. */
  showPresence?: boolean;
  filters?: React.ReactNode;
}

/**
 * Top bar: breadcrumbs, filter slot, presence, notifications and the primary
 * "new issue" action. Sticky so it stays available while lists scroll.
 */
export function Header({
  onCreateIssue,
  onOpenSearch,
  title,
  crumbs,
  actions,
  showPresence = true,
  filters,
}: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspace, user, unreadNotifications, setUnreadNotifications } = useAuth();
  const { canCreateIssues } = usePermissions();
  const { presence, status: socketStatus } = useRealtime();
  const { resolved, toggle } = useTheme();
  const [marking, setMarking] = useState(false);

  const workspaceId = workspace?.id ?? '';

  const notifications = useQuery({
    queryKey: queryKeys.notifications(workspaceId, { unreadOnly: true, limit: 8 }),
    queryFn: () =>
      api.get<{ notifications: Notification[]; unread: number }>(
        `/workspaces/${workspaceId}/notifications?unreadOnly=true&limit=8`,
      ),
    enabled: Boolean(workspaceId),
    refetchOnWindowFocus: true,
  });

  // Resolve dynamic id segments into readable labels for the breadcrumb trail.
  const projectId = location.pathname.match(/\/projects\/([^/]+)/)?.[1];
  const cycleId = location.pathname.match(/\/cycles\/([^/]+)/)?.[1];

  const usedCrumbs = useMemo<Crumb[]>(() => {
    if (crumbs) return crumbs;
    const segments = location.pathname.split('/').filter(Boolean);
    const built: Crumb[] = [];
    for (const segment of segments) {
      if (segment === projectId) {
        built.push({ label: 'Project' });
        continue;
      }
      if (segment === cycleId) {
        built.push({ label: 'Cycle' });
        continue;
      }
      if (/^[A-Z]{2,10}-\d+$/.test(segment)) {
        built.push({ label: segment });
        continue;
      }
      if (/^c[a-z0-9]{20,}$/.test(segment)) {
        built.push({ label: '…' });
        continue;
      }
      built.push({ label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ') });
    }
    return built;
  }, [crumbs, location.pathname, projectId, cycleId]);

  const presenceList = presence
    .map((entry) => ({ id: entry.userId, name: entry.name }))
    .filter((entry) => entry.id !== user?.id);

  const markAllRead = async () => {
    if (!workspaceId) return;
    setMarking(true);
    try {
      await api.post(`/workspaces/${workspaceId}/notifications/read`, { all: true });
      setUnreadNotifications(0);
      void notifications.refetch();
    } finally {
      setMarking(false);
    }
  };

  const unread = notifications.data?.unread ?? unreadNotifications;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-app/95 backdrop-blur">
      <div className="flex h-12 items-center gap-2 px-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1">
          <Link
            to="/issues"
            className="shrink-0 rounded px-1 text-xs text-subtle transition-colors hover:text-fg"
            title={workspace?.name}
          >
            {workspace?.key}
          </Link>
          {usedCrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="truncate rounded px-1 text-xs text-muted hover:text-fg"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate px-1 text-xs font-medium text-fg">
                  {title ?? crumb.label}
                </span>
              )}
            </span>
          ))}
          {!title && usedCrumbs.length === 0 && (
            <span className="px-1 text-xs font-medium text-fg">Issues</span>
          )}
        </nav>

        <div className="flex items-center gap-1">
          <Tooltip label="Search  /">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Search"
              onClick={onOpenSearch}
              data-testid="header-search"
            >
              <Search className="h-4 w-4" />
            </Button>
          </Tooltip>

          {showPresence && presenceList.length > 0 && (
            <Tooltip label={`${presenceList.length} online`}>
              <span className="mr-1 hidden sm:inline-flex">
                <AvatarStack people={presenceList} size="sm" max={3} />
              </span>
            </Tooltip>
          )}

          {socketStatus !== 'open' && (
            <Tooltip
              label={
                socketStatus === 'reconnecting'
                  ? 'Reconnecting to live updates…'
                  : 'Live updates unavailable'
              }
            >
              <span
                className={cn(
                  'hidden items-center gap-1 rounded-full border px-2 py-0.5 text-2xs sm:inline-flex',
                  socketStatus === 'reconnecting'
                    ? 'border-warning/40 text-warning'
                    : 'border-line text-subtle',
                )}
                data-testid="realtime-status"
              >
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" />
                {socketStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
              </span>
            </Tooltip>
          )}

          <Tooltip label={resolved === 'dark' ? 'Light theme' : 'Dark theme'}>
            <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggle}>
              {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </Tooltip>

          <Menu
            align="end"
            width={340}
            trigger={(triggerProps) => (
              <button
                type="button"
                aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
                data-testid="notification-bell"
                className="btn btn-ghost btn-icon-sm relative"
                {...triggerProps}
              >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-accent-fg">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            )}
          >
            <div className="flex items-center justify-between px-2 py-1">
              <MenuLabel>Notifications</MenuLabel>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={marking}
                  className="text-2xs text-accent hover:underline disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.isLoading && (
                <p className="px-2 py-4 text-center text-xs text-subtle">Loading…</p>
              )}
              {(notifications.data?.notifications ?? []).length === 0 &&
                !notifications.isLoading && (
                  <p className="px-2 py-6 text-center text-xs text-subtle">
                    You are all caught up.
                  </p>
                )}
              {(notifications.data?.notifications ?? []).map((notification) => (
                <MenuItem
                  key={notification.id}
                  onClick={() => {
                    void api.post(`/workspaces/${workspaceId}/notifications/read`, {
                      ids: [notification.id],
                    });
                    setUnreadNotifications(Math.max(0, unread - 1));
                    void notifications.refetch();
                  }}
                >
                  <span className="flex w-full items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-fg">{notification.title}</span>
                      {notification.body && (
                        <span className="mt-0.5 block truncate text-2xs text-muted">
                          {notification.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-2xs text-subtle">
                        {relativeTime(notification.createdAt)}
                      </span>
                    </span>
                  </span>
                </MenuItem>
              ))}
            </div>
            <MenuSeparator />
            <MenuItem icon={<Inbox className="h-3.5 w-3.5" />} onClick={() => navigate('/inbox')}>
              Open inbox
            </MenuItem>
            <MenuItem
              icon={<Check className="h-3.5 w-3.5" />}
              onClick={() => void markAllRead()}
              disabled={unread === 0}
            >
              Mark all as read
            </MenuItem>
          </Menu>

          {/* Viewers cannot create issues, so the CTA is not rendered at all
              (the API would reject it with 403). */}
          {canCreateIssues ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={onCreateIssue}
              data-testid="header-create-issue"
              className="ml-1"
            >
              <span className="hidden sm:inline">New issue</span>
            </Button>
          ) : (
            <span
              className="ml-1 rounded-md border border-line px-2 py-1 text-2xs text-subtle"
              data-testid="header-readonly-badge"
              title="Your role in this workspace is read-only"
            >
              Read-only
            </span>
          )}
        </div>
      </div>

      {(filters || actions) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 px-3 py-1.5">
          <div className="flex flex-1 flex-wrap items-center gap-1.5">{filters}</div>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
    </header>
  );
}

/** Re-exported so pages can render the same shaped breadcrumbs. */
export function useProjectCrumb(projectId: string | undefined, workspaceId: string | undefined) {
  const projects = useQuery({
    queryKey: queryKeys.projects(workspaceId ?? ''),
    queryFn: () => api.get<{ projects: Project[] }>(`/workspaces/${workspaceId}/projects`),
    enabled: Boolean(workspaceId && projectId),
    select: (data) => data.projects,
  });
  const project = projects.data?.find((entry) => entry.id === projectId);
  return project
    ? ([{ label: 'Projects', to: '/projects' }, { label: project.name }] as Crumb[])
    : undefined;
}

export function useCycleCrumb(cycleId: string | undefined, workspaceId: string | undefined) {
  const cycles = useQuery({
    queryKey: queryKeys.cycles(workspaceId ?? ''),
    queryFn: () => api.get<{ cycles: Cycle[] }>(`/workspaces/${workspaceId}/cycles`),
    enabled: Boolean(workspaceId && cycleId),
    select: (data) => data.cycles,
  });
  const cycle = cycles.data?.find((entry) => entry.id === cycleId);
  return cycle
    ? ([{ label: 'Cycles', to: '/cycles' }, { label: cycle.name }] as Crumb[])
    : undefined;
}

export function useIssueCrumb(issue: Issue | undefined) {
  return useMemo(() => {
    if (!issue) return undefined;
    const list: Crumb[] = [{ label: 'Issues', to: '/issues' }];
    if (issue.project)
      list.push({ label: issue.project.name, to: `/projects/${issue.project.id}` });
    list.push({ label: issue.identifier });
    return list;
  }, [issue]);
}
