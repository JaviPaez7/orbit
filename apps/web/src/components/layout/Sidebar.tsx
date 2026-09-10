import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Box,
  Check,
  ChevronDown,
  Inbox,
  LayoutGrid,
  ListChecks,
  Plus,
  RefreshCw,
  Repeat,
  Settings,
  Target,
  UserCircle2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, usePermissions } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/query-client';
import { cn } from '../../lib/utils';
import type { Cycle, Project } from '../../lib/types';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';

interface SidebarProps {
  onCreateIssue: () => void;
  onCreateProject: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSearch: () => void;
  onOpenShortcuts: () => void;
}

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
    isActive ? 'bg-selected text-fg' : 'text-muted hover:bg-hover hover:text-fg',
  );

export function Sidebar({
  onCreateIssue,
  onCreateProject,
  collapsed,
  onToggleCollapse,
  onOpenSearch,
  onOpenShortcuts,
}: SidebarProps) {
  const { workspace, workspaces, setWorkspaceId, user, logout, unreadNotifications } = useAuth();
  const { canManageProjects, canManageCycles } = usePermissions();
  const { status: socketStatus } = useRealtime();

  const navigate = useNavigate();
  const workspaceId = workspace?.id ?? '';

  const projects = useQuery({
    queryKey: queryKeys.projects(workspaceId),
    queryFn: () => api.get<{ projects: Project[] }>(`/workspaces/${workspaceId}/projects`),
    enabled: Boolean(workspaceId),
    select: (data) => data.projects,
  });

  const cycles = useQuery({
    queryKey: queryKeys.cycles(workspaceId),
    queryFn: () =>
      api.get<{ cycles: Cycle[]; current: Cycle | null }>(`/workspaces/${workspaceId}/cycles`),
    enabled: Boolean(workspaceId),
    select: (data) => ({ cycles: data.cycles, current: data.current }),
  });

  if (!workspace) return null;

  const activeProjects = (projects.data ?? []).filter((project) => !project.archived).slice(0, 8);
  const currentCycle = cycles.data?.current ?? null;

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-app transition-[width] duration-150',
        collapsed ? 'w-[52px]' : 'w-[236px]',
      )}
      data-testid="sidebar"
    >
      {/* Workspace switcher */}
      <div className="flex items-center gap-1 p-2">
        <Menu
          align="start"
          width={256}
          trigger={(triggerProps) => (
            <button
              type="button"
              data-testid="workspace-switcher"
              aria-label="Switch workspace"
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 text-left transition-colors hover:border-line hover:bg-hover',
              )}
              {...triggerProps}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-2xs font-bold text-white"
                style={{ backgroundColor: workspace.logoColor ?? 'rgb(var(--accent))' }}
              >
                {workspace.name.slice(0, 2).toUpperCase()}
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {workspace.name}
                    </span>
                    <span className="block truncate text-2xs text-subtle">
                      {workspace.role} · {workspace.key}
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
                </>
              )}
            </button>
          )}
        >
          <MenuLabel>Workspaces</MenuLabel>
          {workspaces.map((entry) => (
            <MenuItem
              key={entry.id}
              selected={entry.id === workspace.id}
              icon={
                <span
                  className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white"
                  style={{ backgroundColor: entry.logoColor ?? '#6366f1' }}
                >
                  {entry.name.slice(0, 1).toUpperCase()}
                </span>
              }
              onClick={() => setWorkspaceId(entry.id)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">{entry.name}</span>
                {entry.id === workspace.id && <Check className="h-3 w-3 text-accent" />}
              </span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => {
              navigate('/workspaces/new');
            }}
          >
            Create workspace
          </MenuItem>
          <MenuItem
            icon={<Settings className="h-3.5 w-3.5" />}
            onClick={() => {
              navigate('/settings/workspace');
            }}
          >
            Workspace settings
          </MenuItem>
        </Menu>

        {!collapsed && (
          <Tooltip label="New issue (C)">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Create issue"
              onClick={onCreateIssue}
              data-testid="sidebar-create-issue"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="Main">
        <ul className="space-y-0.5">
          <li>
            <NavLink
              to="/search"
              className={navItemClass}
              onClick={(event) => {
                event.preventDefault();
                onOpenSearch();
              }}
            >
              <SearchIcon />
              {!collapsed && <span className="flex-1">Search</span>}
              {!collapsed && <span className="kbd">/</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to="/inbox" className={navItemClass} data-testid="nav-inbox">
              <Inbox className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">Inbox</span>}
              {!collapsed && unreadNotifications > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-2xs font-semibold text-accent-fg">
                  {unreadNotifications}
                </span>
              )}
            </NavLink>
          </li>
          <li>
            <NavLink to="/my-issues" className={navItemClass} data-testid="nav-my-issues">
              <UserCircle2 className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">My issues</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to="/issues" className={navItemClass} data-testid="nav-issues">
              <ListChecks className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">All issues</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to="/board" className={navItemClass} data-testid="nav-board">
              <LayoutGrid className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">Board</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to="/projects" className={navItemClass} data-testid="nav-projects">
              <Box className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">Projects</span>}
              {!collapsed && <span className="kbd">G P</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to="/analytics" className={navItemClass} data-testid="nav-analytics">
              <BarChart3 className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">Analytics</span>}
            </NavLink>
          </li>
        </ul>

        {!collapsed && (
          <>
            <div className="mt-4 flex items-center justify-between px-2">
              <span className="text-2xs font-semibold uppercase tracking-wider text-subtle">
                Cycles
              </span>
              {canManageCycles && (
                <Tooltip label="New cycle">
                  <a
                    href="/cycles"
                    className="text-subtle transition-colors hover:text-fg"
                    aria-label="Manage cycles"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </a>
                </Tooltip>
              )}
            </div>
            <ul className="mt-1 space-y-0.5">
              <li>
                <NavLink to="/cycles" className={navItemClass}>
                  <Repeat className="h-4 w-4 shrink-0" />
                  <span className="flex-1">All cycles</span>
                </NavLink>
              </li>
              {currentCycle && (
                <li>
                  <NavLink to={`/cycles/${currentCycle.id}`} className={navItemClass}>
                    <Target className="h-4 w-4 shrink-0 text-accent" />
                    <span className="flex-1 truncate">{currentCycle.name}</span>
                    <span className="text-2xs text-subtle">{currentCycle.progress}%</span>
                  </NavLink>
                </li>
              )}
            </ul>

            <div className="mt-4 flex items-center justify-between px-2">
              <span className="text-2xs font-semibold uppercase tracking-wider text-subtle">
                Projects
              </span>
              {canManageProjects && (
                <Tooltip label="New project">
                  <button
                    type="button"
                    onClick={onCreateProject}
                    className="text-subtle transition-colors hover:text-fg"
                    aria-label="Create project"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
              )}
            </div>
            <ul className="mt-1 space-y-0.5">
              {projects.isLoading &&
                Array.from({ length: 3 }).map((_, index) => (
                  <li key={index} className="px-2 py-1.5">
                    <div className="skeleton h-3 w-full" />
                  </li>
                ))}
              {activeProjects.map((project) => (
                <li key={project.id}>
                  <NavLink to={`/projects/${project.id}`} className={navItemClass}>
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                      style={{ backgroundColor: project.color }}
                    >
                      {project.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate">{project.name}</span>
                    <span className="text-2xs text-subtle">{project.issueCount}</span>
                  </NavLink>
                </li>
              ))}
              {!projects.isLoading && activeProjects.length === 0 && (
                <li className="px-2 py-1.5 text-xs text-subtle">No projects yet</li>
              )}
              <li>
                <NavLink
                  to="/projects"
                  className={cn(navItemClass({ isActive: false }), 'text-subtle')}
                >
                  <span className="w-4" />
                  <span className="flex-1">View all</span>
                </NavLink>
              </li>
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-line p-2">
        <div className="flex items-center gap-1">
          <NavLink
            to="/settings/profile"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-hover"
            title={user?.name}
          >
            <Avatar name={user?.name ?? 'User'} src={user?.avatarUrl} size="md" />
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-fg">{user?.name}</span>
                <span className="block truncate text-2xs text-subtle">
                  {socketStatus === 'open'
                    ? 'Live'
                    : socketStatus === 'reconnecting'
                      ? 'Reconnecting…'
                      : 'Offline'}
                </span>
              </span>
            )}
          </NavLink>
          {!collapsed && (
            <Menu
              align="end"
              width={208}
              trigger={(triggerProps) => (
                <button
                  type="button"
                  aria-label="Account menu"
                  className="btn btn-ghost btn-icon-sm"
                  {...triggerProps}
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
            >
              <MenuItem
                icon={<UserCircle2 className="h-3.5 w-3.5" />}
                onClick={() => {
                  navigate('/settings/profile');
                }}
              >
                Profile
              </MenuItem>
              <MenuItem
                icon={<Settings className="h-3.5 w-3.5" />}
                onClick={() => {
                  navigate('/settings/workspace');
                }}
              >
                Workspace settings
              </MenuItem>
              <MenuItem
                icon={<Bell className="h-3.5 w-3.5" />}
                onClick={() => {
                  navigate('/settings/notifications');
                }}
              >
                Notifications
              </MenuItem>
              <MenuItem onClick={onOpenShortcuts} shortcut="?">
                Keyboard shortcuts
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger onClick={() => void logout()}>
                Sign out
              </MenuItem>
            </Menu>
          )}
          <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Toggle sidebar"
              onClick={onToggleCollapse}
            >
              {collapsed ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 rotate-90" />
              )}
            </Button>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  );
}
