import { useEffect, useState } from 'react';
import { useIssueComposer } from '../context/IssueComposerContext';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, Bell, Check, CheckCheck, Inbox, Trash2, UserPlus, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { cn, relativeTime, renderMarkdown } from '../lib/utils';
import type { Activity, Notification } from '../lib/types';
import { Header } from '../components/layout/Header';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  issue_assigned: <UserPlus className="h-3.5 w-3.5 text-accent" />,
  issue_unassigned: <UserPlus className="h-3.5 w-3.5 text-subtle" />,
  issue_status_changed: <Zap className="h-3.5 w-3.5 text-warning" />,
  issue_priority_changed: <Zap className="h-3.5 w-3.5 text-danger" />,
  issue_comment: <Bell className="h-3.5 w-3.5 text-muted" />,
  comment_mention: <AtSign className="h-3.5 w-3.5 text-accent" />,
  workspace_invite: <UserPlus className="h-3.5 w-3.5 text-success" />,
  issue_due_soon: <Bell className="h-3.5 w-3.5 text-warning" />,
};

type Tab = 'all' | 'unread' | 'mentions' | 'activity';

export default function InboxPage() {
  const { openComposer, openSearch } = useIssueComposer();
  const { workspace, setUnreadNotifications } = useAuth();
  const { subscribe } = useRealtime();
  const queryClient = useQueryClient();
  const toast = useToast();
  const workspaceId = workspace?.id ?? '';
  const [tab, setTab] = useState<Tab>('all');

  const inboxQuery = useQuery({
    queryKey: queryKeys.inbox(workspaceId),
    queryFn: () =>
      api.get<{ notifications: Notification[]; activity: Activity[]; unread: number }>(
        `/workspaces/${workspaceId}/inbox`,
      ),
    enabled: Boolean(workspaceId),
  });

  // Live: a notification created elsewhere appears here immediately.
  useEffect(() => {
    return subscribe((event) => {
      if (event.workspaceId !== workspaceId) return;
      if (event.type === 'notification.created' || event.type === 'activity.created') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.inbox(workspaceId) });
      }
    });
  }, [subscribe, workspaceId, queryClient]);

  const markMutation = useMutation({
    mutationFn: (payload: { ids?: string[]; all?: boolean }) =>
      api.post<{ unread: number }>(`/workspaces/${workspaceId}/notifications/read`, payload),
    onSuccess: (data) => {
      setUnreadNotifications(data.unread);
      void queryClient.invalidateQueries({ queryKey: queryKeys.inbox(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspaceId}/notifications`),
    onSuccess: () => {
      toast.success('Read notifications cleared');
      void queryClient.invalidateQueries({ queryKey: queryKeys.inbox(workspaceId) });
    },
    onError: () => toast.error('Could not clear notifications'),
  });

  const notifications = inboxQuery.data?.notifications ?? [];
  const activity = inboxQuery.data?.activity ?? [];
  const unread = inboxQuery.data?.unread ?? 0;

  const visible = notifications.filter((notification) => {
    if (tab === 'unread') return notification.readAt === null;
    if (tab === 'mentions') return notification.type === 'comment_mention';
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Inbox"
        crumbs={[{ label: 'Inbox' }]}
        onCreateIssue={() => openComposer()}
        onOpenSearch={openSearch}
        showPresence={false}
        filters={
          <>
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'all', label: `All (${notifications.length})` },
                  { id: 'unread', label: `Unread (${unread})` },
                  { id: 'mentions', label: 'Mentions' },
                  { id: 'activity', label: 'Workspace activity' },
                ] as { id: Tab; label: string }[]
              ).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-xs transition-colors',
                    tab === entry.id ? 'bg-selected text-fg' : 'text-muted hover:bg-hover hover:text-fg',
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<CheckCheck className="h-3.5 w-3.5" />}
              disabled={unread === 0}
              loading={markMutation.isPending}
              onClick={() => markMutation.mutate({ all: true })}
              data-testid="mark-all-read"
            >
              Mark all read
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              loading={clearMutation.isPending}
              onClick={() => clearMutation.mutate()}
            >
              Clear read
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {inboxQuery.isLoading && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex gap-3 rounded-xl border border-line p-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <SkeletonText lines={2} className="flex-1" />
              </div>
            ))}
          </div>
        )}

        {inboxQuery.isError && (
          <ErrorState
            title="Could not load your inbox"
            error={inboxQuery.error}
            onRetry={() => void inboxQuery.refetch()}
          />
        )}

        {!inboxQuery.isLoading && !inboxQuery.isError && tab !== 'activity' && (
          <div className="divide-y divide-line">
            {visible.length === 0 && (
              <EmptyState
                icon={Inbox}
                title={tab === 'unread' ? 'No unread notifications' : 'Your inbox is empty'}
                description="Assignments, mentions and status changes on issues you follow land here."
              />
            )}
            {visible.map((notification) => (
              <article
                key={notification.id}
                data-testid={`inbox-item-${notification.id}`}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-hover/50',
                  notification.readAt === null && 'bg-accent/[0.04]',
                )}
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-sunken">
                  {TYPE_ICONS[notification.type] ?? <Bell className="h-3.5 w-3.5 text-muted" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm text-fg">{notification.title}</p>
                    {notification.readAt === null && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                    )}
                  </div>
                  {notification.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{notification.body}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2 text-2xs text-subtle">
                    {notification.actorAvatar !== undefined && notification.actorName && (
                      <span className="flex items-center gap-1">
                        <Avatar
                          name={notification.actorName}
                          src={notification.actorAvatar}
                          size="xs"
                        />
                        {notification.actorName}
                      </span>
                    )}
                    <span>{relativeTime(notification.createdAt)}</span>
                    {notification.issue && (
                      <Link
                        to={`/issues/${notification.issue.identifier}`}
                        className="font-mono text-subtle transition-colors hover:text-accent"
                      >
                        {notification.issue.identifier}
                      </Link>
                    )}
                  </div>
                </div>

                {notification.readAt === null && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Mark as read"
                    onClick={() => markMutation.mutate({ ids: [notification.id] })}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}

        {!inboxQuery.isLoading && tab === 'activity' && (
          <ol className="divide-y divide-line" data-testid="workspace-activity">
            {activity.length === 0 && (
              <EmptyState icon={Zap} title="No activity yet" description="Changes across the workspace appear here." />
            )}
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-2.5">
                {entry.actor ? (
                  <Avatar name={entry.actor.name} src={entry.actor.avatarUrl} size="md" />
                ) : (
                  <span className="h-6 w-6 shrink-0 rounded-full bg-selected" />
                )}
                <div className="min-w-0">
                  <p
                    className="text-xs text-muted [&_strong]:font-medium [&_strong]:text-fg"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(entry.description).replace(/<\/?p>/g, ''),
                    }}
                  />
                  <p className="mt-0.5 flex items-center gap-2 text-2xs text-subtle">
                    {entry.issue && (
                      <Link to={`/issues/${entry.issue.identifier}`} className="font-mono hover:text-accent">
                        {entry.issue.identifier}
                      </Link>
                    )}
                    <span>{relativeTime(entry.createdAt)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
