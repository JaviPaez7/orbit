import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Monitor, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/query-client';
import { cn, relativeTime } from '../../lib/utils';
import type { Notification } from '../../lib/types';
import { Switch } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';

const PREFS_KEY = 'orbit.notificationPrefs';

interface Prefs {
  assigned: boolean;
  mentions: boolean;
  statusChanges: boolean;
  comments: boolean;
  dueSoon: boolean;
}

const DEFAULT_PREFS: Prefs = {
  assigned: true,
  mentions: true,
  statusChanges: true,
  comments: true,
  dueSoon: false,
};

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS;
}

export default function NotificationSettingsPage() {
  const { workspace } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const workspaceId = workspace?.id ?? '';
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications(workspaceId, { limit: 20 }),
    queryFn: () =>
      api.get<{ notifications: Notification[]; total: number; unread: number }>(
        `/workspaces/${workspaceId}/notifications?limit=20`,
      ),
    enabled: Boolean(workspaceId),
  });

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    toast.success('Preference saved');
  };

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
          <Bell className="h-4 w-4" /> In-app notifications
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Choose what lands in your inbox. Mentions and assignments are usually worth keeping on.
        </p>
        <div className="mt-4 space-y-3">
          <Switch
            checked={prefs.assigned}
            onChange={(value) => update({ assigned: value })}
            label="Someone assigns me an issue"
          />
          <Switch
            checked={prefs.mentions}
            onChange={(value) => update({ mentions: value })}
            label="I am mentioned in a comment"
          />
          <Switch
            checked={prefs.statusChanges}
            onChange={(value) => update({ statusChanges: value })}
            label="Status changes on issues I follow"
          />
          <Switch
            checked={prefs.comments}
            onChange={(value) => update({ comments: value })}
            label="New comments on issues I am involved in"
          />
          <Switch
            checked={prefs.dueSoon}
            onChange={(value) => update({ dueSoon: value })}
            label="Issues are close to their due date"
            description="A daily digest of issues due in the next 48 hours."
          />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
          {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} Appearance
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          The theme is stored locally and applied before first paint.
        </p>
        <div className="mt-3 flex items-center gap-2">
          {(
            [
              { id: 'light', label: 'Light', icon: Sun },
              { id: 'dark', label: 'Dark', icon: Moon },
              { id: 'system', label: 'System', icon: Monitor },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTheme(option.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors',
                theme === option.id
                  ? 'border-accent text-fg'
                  : 'border-line text-muted hover:text-fg',
              )}
              data-testid={`theme-${option.id}`}
            >
              <option.icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-medium text-fg">Recent notifications</h2>
        <p className="mt-0.5 text-xs text-muted">
          {notificationsQuery.data?.unread ?? 0} unread of {notificationsQuery.data?.total ?? 0}
        </p>
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          {notificationsQuery.isLoading && <Skeleton className="h-24" />}
          {!notificationsQuery.isLoading &&
            (notificationsQuery.data?.notifications.length ?? 0) === 0 && (
              <EmptyState
                compact
                title="Nothing here yet"
                description="Notifications appear as work happens."
              />
            )}
          <ul className="divide-y divide-line">
            {(notificationsQuery.data?.notifications ?? []).map((notification) => (
              <li key={notification.id} className="flex items-start gap-2 px-3 py-2">
                <span
                  className={cn(
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    notification.readAt === null ? 'bg-accent' : 'bg-line-strong',
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate text-xs text-fg">{notification.title}</p>
                  <p className="text-2xs text-subtle">{relativeTime(notification.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
