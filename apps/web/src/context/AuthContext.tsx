import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { can, type Permission } from '@orbit/shared';
import { api, setUnauthorizedHandler } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import type { User, Workspace } from '../lib/types';

const ACTIVE_WORKSPACE_KEY = 'orbit.activeWorkspace';

interface BootstrapResponse {
  user: User | null;
  workspaces?: Workspace[];
  unreadNotifications?: number;
}

interface AuthContextValue {
  user: User | null;
  workspaces: Workspace[];
  workspace: Workspace | null;
  workspaceId: string | null;
  role: Workspace['role'] | null;
  unreadNotifications: number;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    name: string;
    password: string;
    workspaceName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  setWorkspaceId: (workspaceId: string) => void;
  refresh: () => Promise<void>;
  setUnreadNotifications: (count: number) => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredWorkspace(): string | null {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

/**
 * Session + active workspace. The workspace selection is persisted locally so a
 * reload lands the user back where they were; membership is always re-verified
 * by the API on every request.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(() => readStoredWorkspace());
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const bootstrap = useCallback(async () => {
    try {
      const data = await api.get<BootstrapResponse>('/auth/me');
      setUser(data.user);
      setWorkspaces(data.workspaces ?? []);
      setUnreadNotifications(data.unreadNotifications ?? 0);

      if (data.user && (data.workspaces?.length ?? 0) > 0) {
        const stored = readStoredWorkspace();
        const valid = data.workspaces!.some((workspace) => workspace.id === stored);
        if (!valid) {
          const next = data.workspaces![0]!.id;
          setWorkspaceIdState(next);
          try {
            localStorage.setItem(ACTIVE_WORKSPACE_KEY, next);
          } catch {
            /* ignore */
          }
        }
      }
      if (!data.user) {
        setWorkspaceIdState(null);
      }
    } catch {
      setUser(null);
      setWorkspaces([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // A 401 anywhere clears the session so guards can redirect to /login.
    setUnauthorizedHandler(() => {
      setUser(null);
      setWorkspaces([]);
      queryClient.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api.post('/auth/login', { email, password });
      await bootstrap();
      await queryClient.invalidateQueries();
    },
    [bootstrap, queryClient],
  );

  const register = useCallback(
    async (input: { email: string; name: string; password: string; workspaceName?: string }) => {
      const response = await api.post<{ workspaceId: string | null }>('/auth/register', input);
      if (response.workspaceId) {
        setWorkspaceIdState(response.workspaceId);
        try {
          localStorage.setItem(ACTIVE_WORKSPACE_KEY, response.workspaceId);
        } catch {
          /* ignore */
        }
      }
      await bootstrap();
    },
    [bootstrap],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setWorkspaces([]);
      setUnreadNotifications(0);
      queryClient.clear();
    }
  }, [queryClient]);

  const setWorkspaceId = useCallback(
    (next: string) => {
      setWorkspaceIdState(next);
      try {
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, next);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const workspace = useMemo(
    () => workspaces.find((entry) => entry.id === workspaceId) ?? workspaces[0] ?? null,
    [workspaces, workspaceId],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      workspaces,
      workspace,
      workspaceId: workspace?.id ?? null,
      role: workspace?.role ?? null,
      unreadNotifications,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      setWorkspaceId,
      refresh: bootstrap,
      setUnreadNotifications,
      updateUser: (next: User) => {
        setUser(next);
        void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      },
    }),
    [
      user,
      workspaces,
      workspace,
      unreadNotifications,
      isLoading,
      login,
      register,
      logout,
      setWorkspaceId,
      bootstrap,
      queryClient,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Role-aware helper used to hide *and* disable UI. The API re-checks anyway. */
export function usePermissions() {
  const { role } = useAuth();
  return useMemo(() => {
    const allowed = (permission: Permission): boolean => can(role, permission);
    return {
      role,
      can: allowed,
      canEditIssues: allowed('issue:update'),
      canCreateIssues: allowed('issue:create'),
      canDeleteIssues: allowed('issue:delete'),
      canComment: allowed('issue:comment'),
      canManageProjects: allowed('project:create'),
      canManageMembers: allowed('member:invite'),
      canManageWorkspace: allowed('workspace:update'),
      canDeleteWorkspace: allowed('workspace:delete'),
      canImport: allowed('import:run'),
      canManageCycles: allowed('cycle:manage'),
      canManageLabels: allowed('label:manage'),
    };
  }, [role]);
}
