import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { RealtimeProvider } from '../../context/RealtimeContext';
import { IssueComposerProvider } from '../../context/IssueComposerContext';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Spinner } from '../ui/States';
import { Sidebar } from './Sidebar';
import { ShortcutsModal } from './ShortcutsModal';
import { CommandPalette } from '../command/CommandPalette';
import { IssueComposer } from '../issues/IssueComposer';
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts';
import { useTheme } from '../../context/ThemeContext';
import type { IssueStatus } from '@orbit/shared';

const IssuesPage = lazy(() => import('../../pages/IssuesPage'));
const IssueDetailPage = lazy(() => import('../../pages/IssueDetailPage'));
const BoardPage = lazy(() => import('../../pages/BoardPage'));
const ProjectsPage = lazy(() => import('../../pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('../../pages/ProjectDetailPage'));
const ProjectAnalyticsPage = lazy(() => import('../../pages/ProjectAnalyticsPage'));
const CyclesPage = lazy(() => import('../../pages/CyclesPage'));
const CycleDetailPage = lazy(() => import('../../pages/CycleDetailPage'));
const AnalyticsPage = lazy(() => import('../../pages/AnalyticsPage'));
const InboxPage = lazy(() => import('../../pages/InboxPage'));
const MyIssuesPage = lazy(() => import('../../pages/MyIssuesPage'));
const SearchPage = lazy(() => import('../../pages/SearchPage'));
const ImportPage = lazy(() => import('../../pages/ImportPage'));
const NewWorkspacePage = lazy(() => import('../../pages/NewWorkspacePage'));
const LoginPage = lazy(() => import('../../pages/LoginPage'));
const RegisterPage = lazy(() => import('../../pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../../pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../../pages/ResetPasswordPage'));
const SettingsLayout = lazy(() => import('../../pages/settings/SettingsLayout'));
const ProfileSettingsPage = lazy(() => import('../../pages/settings/ProfileSettingsPage'));
const WorkspaceSettingsPage = lazy(() => import('../../pages/settings/WorkspaceSettingsPage'));
const MembersSettingsPage = lazy(() => import('../../pages/settings/MembersSettingsPage'));
const LabelsSettingsPage = lazy(() => import('../../pages/settings/LabelsSettingsPage'));
const NotificationSettingsPage = lazy(() => import('../../pages/settings/NotificationSettingsPage'));
const NotFoundPage = lazy(() => import('../../pages/NotFoundPage'));

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center py-24">
      <Spinner className="h-5 w-5" />
    </div>
  );
}

function lazyPage(element: React.ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

/** Redirects unauthenticated visitors to /login. */
function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-app">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-5 w-5" />
          <p className="text-xs text-subtle">Loading workspace…</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Application chrome: sidebar + the lazy page body. Owns the global overlays
 * (command palette, issue composer, shortcuts help) and exposes the composer
 * through context so any page's header can open it.
 */
function AppShell() {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDefaults, setComposerDefaults] = useState<{
    status?: IssueStatus;
    projectId?: string | null;
  }>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openComposer = useCallback(() => setComposerOpen(true), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);

  const handleNavigate = useCallback(
    (key: string) => {
      const routes: Record<string, string> = {
        i: '/issues',
        b: '/board',
        p: '/projects',
        c: '/cycles',
        n: '/inbox',
        a: '/analytics',
        s: '/settings/workspace',
      };
      const target = routes[key];
      if (target) navigate(target);
    },
    [navigate],
  );

  const shortcuts = useMemo(
    () => ({
      onCommandPalette: openPalette,
      onCreateIssue: openComposer,
      onSearch: openPalette,
      onToggleTheme: toggle,
      onShortcutsHelp: () => setShortcutsOpen(true),
      onNavigate: handleNavigate,
    }),
    [openPalette, openComposer, toggle, handleNavigate],
  );

  useGlobalShortcuts(shortcuts);

  const composerControls = useMemo(
    () => ({
      openComposer: (options?: { status?: string; projectId?: string | null }) => {
        setComposerDefaults({
          status: options?.status as IssueStatus | undefined,
          projectId: options?.projectId ?? null,
        });
        setComposerOpen(true);
      },
      openSearch: () => setPaletteOpen(true),
      openShortcuts: () => setShortcutsOpen(true),
    }),
    [],
  );

  return (
    <RealtimeProvider workspaceId={workspace?.id ?? null} enabled={Boolean(workspace)}>
      <IssueComposerProvider value={composerControls}>
        <div className="flex h-screen overflow-hidden bg-app">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((value) => !value)}
            onCreateIssue={openComposer}
            onCreateProject={() => navigate('/projects?new=1')}
            onOpenSearch={openPalette}
            onOpenShortcuts={() => setShortcutsOpen(true)}
          />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Each page renders its own <Header> with route-specific breadcrumbs. */}
            <div className="flex-1 overflow-y-auto" id="main-scroll">
              <ErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                  <Outlet />
                </Suspense>
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </IssueComposerProvider>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onCreateIssue={openComposer}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenImport={() => navigate('/import')}
      />
      <IssueComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        defaultStatus={composerDefaults.status}
        defaultProjectId={composerDefaults.projectId ?? undefined}
      />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </RealtimeProvider>
  );
}

function IssueByIdentifier() {
  const { identifier } = useParams<{ identifier: string }>();
  return <IssueDetailPage identifier={identifier ?? ''} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={lazyPage(<LoginPage />)} />
      <Route path="/register" element={lazyPage(<RegisterPage />)} />
      <Route path="/forgot-password" element={lazyPage(<ForgotPasswordPage />)} />
      <Route path="/reset-password" element={lazyPage(<ResetPasswordPage />)} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/issues" replace />} />
          <Route path="/issues" element={lazyPage(<IssuesPage />)} />
          <Route path="/issues/:identifier" element={<IssueByIdentifier />} />
          <Route path="/board" element={lazyPage(<BoardPage />)} />
          <Route path="/projects" element={lazyPage(<ProjectsPage />)} />
          <Route path="/projects/:projectId" element={lazyPage(<ProjectDetailPage />)} />
          <Route path="/projects/:projectId/settings" element={lazyPage(<ProjectDetailPage settingsMode />)} />
          <Route path="/projects/:projectId/analytics" element={lazyPage(<ProjectAnalyticsPage />)} />
          <Route path="/cycles" element={lazyPage(<CyclesPage />)} />
          <Route path="/cycles/:cycleId" element={lazyPage(<CycleDetailPage />)} />
          <Route path="/analytics" element={lazyPage(<AnalyticsPage />)} />
          <Route path="/inbox" element={lazyPage(<InboxPage />)} />
          <Route path="/my-issues" element={lazyPage(<MyIssuesPage />)} />
          <Route path="/search" element={lazyPage(<SearchPage />)} />
          <Route path="/import" element={lazyPage(<ImportPage />)} />
          <Route path="/workspaces/new" element={lazyPage(<NewWorkspacePage />)} />
          <Route path="/settings" element={lazyPage(<SettingsLayout />)}>
            <Route index element={<Navigate to="/settings/profile" replace />} />
            <Route path="profile" element={lazyPage(<ProfileSettingsPage />)} />
            <Route path="workspace" element={lazyPage(<WorkspaceSettingsPage />)} />
            <Route path="members" element={lazyPage(<MembersSettingsPage />)} />
            <Route path="labels" element={lazyPage(<LabelsSettingsPage />)} />
            <Route path="notifications" element={lazyPage(<NotificationSettingsPage />)} />
          </Route>
          <Route path="*" element={lazyPage(<NotFoundPage />)} />
        </Route>
      </Route>
    </Routes>
  );
}
