import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Never retry auth/permission failures — they will not get better.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Central query keys so invalidation stays predictable. */
export const queryKeys = {
  me: ['me'] as const,
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  members: (workspaceId: string) => ['members', workspaceId] as const,
  assignable: (workspaceId: string) => ['assignable', workspaceId] as const,
  mentionable: (workspaceId: string) => ['mentionable', workspaceId] as const,
  projects: (workspaceId: string, includeArchived = false) =>
    ['projects', workspaceId, { includeArchived }] as const,
  project: (projectId: string) => ['project', projectId] as const,
  projectAnalytics: (projectId: string) => ['project-analytics', projectId] as const,
  issues: (workspaceId: string, filters: unknown) => ['issues', workspaceId, filters] as const,
  issue: (workspaceId: string, issueId: string) => ['issue', workspaceId, issueId] as const,
  comments: (workspaceId: string, issueId: string) => ['comments', workspaceId, issueId] as const,
  activity: (workspaceId: string, issueId: string) => ['activity', workspaceId, issueId] as const,
  workspaceActivity: (workspaceId: string) => ['workspace-activity', workspaceId] as const,
  labels: (workspaceId: string) => ['labels', workspaceId] as const,
  cycles: (workspaceId: string) => ['cycles', workspaceId] as const,
  cycle: (workspaceId: string, cycleId: string) => ['cycle', workspaceId, cycleId] as const,
  notifications: (workspaceId: string, filters: unknown) =>
    ['notifications', workspaceId, filters] as const,
  unreadCount: ['notifications', 'unread'] as const,
  inbox: (workspaceId: string) => ['inbox', workspaceId] as const,
  analytics: (workspaceId: string, days: number) => ['analytics', workspaceId, days] as const,
  search: (workspaceId: string, term: string) => ['search', workspaceId, term] as const,
  presence: (workspaceId: string) => ['presence', workspaceId] as const,
};
