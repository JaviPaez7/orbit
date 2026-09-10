import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { CalendarRange, Repeat } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, buildQuery } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { cn, formatDate, formatDateShort } from '../lib/utils';
import type { Cycle, Issue, IssueListResponse } from '../lib/types';
import { Header } from '../components/layout/Header';
import { useCycleCrumb } from '../components/layout/Header';
import { IssueRow } from '../components/issues/IssueRow';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/Field';
import { ChartSkeleton, IssueListSkeleton, Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { StatusIcon } from '../components/ui/Icons';

export default function CycleDetailPage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const { workspace } = useAuth();
  const workspaceId = workspace?.id ?? '';

  const cycleQuery = useQuery({
    queryKey: queryKeys.cycle(workspaceId, cycleId ?? ''),
    queryFn: () => api.get<{ cycle: Cycle }>(`/workspaces/${workspaceId}/cycles/${cycleId}`),
    enabled: Boolean(workspaceId && cycleId),
  });

  const issuesQuery = useQuery({
    queryKey: queryKeys.issues(workspaceId, { cycleId, limit: 200, group: 'status' }),
    queryFn: () =>
      api.get<IssueListResponse>(
        `/workspaces/${workspaceId}/issues${buildQuery({ cycleId, limit: 200, group: 'status', sort: 'status' })}`,
      ),
    enabled: Boolean(workspaceId && cycleId),
  });

  const cycle = cycleQuery.data?.cycle;
  const issues = issuesQuery.data?.items ?? [];
  const crumb = useCycleCrumb(cycleId, workspaceId);

  // Burndown is derived from the real completedAt timestamps of cycle issues.
  const burndown = (() => {
    if (!cycle) return [];
    const days: { label: string; remaining: number }[] = [];
    const start = new Date(cycle.startDate);
    const end = new Date(cycle.endDate);
    const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    for (let index = 0; index <= total; index += 1) {
      const day = new Date(start.getTime() + index * 86_400_000);
      const remaining = issues.filter(
        (issue) => !issue.completedAt || new Date(issue.completedAt) > day,
      );
      days.push({
        label: formatDateShort(day),
        remaining: remaining.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0),
      });
    }
    return days;
  })();

  if (cycleQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
        <IssueListSkeleton rows={6} />
      </div>
    );
  }

  if (cycleQuery.isError || !cycle) {
    return (
      <div className="p-6">
        <ErrorState
          title="Cycle not found"
          description="It may have been deleted, or it belongs to another workspace."
          onRetry={() => void cycleQuery.refetch()}
        />
        <div className="mt-4 text-center">
          <Link to="/cycles" className="link text-xs">
            Back to cycles
          </Link>
        </div>
      </div>
    );
  }

  const byStatus = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];

  return (
    <div className="flex h-full flex-col">
      <Header
        crumbs={crumb}
        title={cycle.name}
        onCreateIssue={() => undefined}
        onOpenSearch={() => undefined}
        showPresence={false}
        filters={
          <div className="flex items-center gap-3 text-2xs text-subtle">
            <span className="flex items-center gap-1">
              <CalendarRange className="h-3 w-3" />
              {formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}
            </span>
            <span
              className={cn(
                'chip',
                cycle.status === 'active' && 'border-accent/40 text-accent',
                cycle.status === 'completed' && 'border-success/40 text-success',
              )}
            >
              {cycle.status}
            </span>
            {cycle.project && (
              <Link to={`/projects/${cycle.project.id}`} className="flex items-center gap-1 hover:text-fg">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: cycle.project.color }} />
                {cycle.project.name}
              </Link>
            )}
          </div>
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Repeat className="h-3.5 w-3.5" />}
            onClick={() => window.history.back()}
          >
            All cycles
          </Button>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Issues" value={`${cycle.completedIssues}/${cycle.totalIssues}`} hint="completed / total" />
          <Stat label="Points" value={`${cycle.points}/${cycle.totalPoints}`} hint="completed / scope" />
          <Stat label="Progress" value={`${cycle.progress}%`} hint={`${cycle.cancelledIssues} cancelled`} />
          <Stat
            label="Timeline"
            value={`${cycle.elapsed}/${cycle.days}`}
            hint={cycle.status === 'active' ? 'days elapsed' : 'days total'}
          />
        </div>

        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">Completion</h2>
            <span className="text-muted">{cycle.progress}%</span>
          </div>
          <ProgressBar value={cycle.progress} height="h-2" />
          <div className="mt-3 flex flex-wrap gap-4 text-2xs text-subtle">
            <span>{cycle.startedIssues} in progress</span>
            <span>{cycle.reviewIssues} in review</span>
            <span>{cycle.completedIssues} done</span>
            <span>{cycle.cancelledIssues} cancelled</span>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">
            Burndown (remaining story points)
          </h2>
          {issues.length === 0 ? (
            <EmptyState compact title="No issues in this cycle" description="Assign issues to see a burndown." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={burndown} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgb(var(--border-default))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} />
                <ChartTooltip
                  contentStyle={{
                    background: 'rgb(var(--bg-elevated))',
                    border: '1px solid rgb(var(--border-default))',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="remaining"
                  stroke="#6c7df6"
                  strokeWidth={2}
                  dot={false}
                  name="Remaining points"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
            Issues in this cycle
          </h2>
          {issuesQuery.isLoading ? (
            <IssueListSkeleton rows={6} />
          ) : issues.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="No issues assigned"
              description="Add issues to this cycle from the issue list or the board."
              action={
                <Link to="/issues" className="btn btn-secondary btn-sm">
                  Browse issues
                </Link>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              {byStatus.map((status) => {
                const group = issues.filter((issue) => issue.status === status);
                if (group.length === 0) return null;
                return (
                  <div key={status}>
                    <div className="flex items-center gap-2 border-b border-line bg-sunken/70 px-3 py-1.5">
                      <StatusIcon status={status} className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium capitalize text-fg">
                        {status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-2xs text-subtle">{group.length}</span>
                      <span className="ml-auto text-2xs text-subtle">
                        {group.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0)} pts
                      </span>
                    </div>
                    {group.map((issue) => (
                      <IssueRow
                        key={issue.id}
                        issue={issue}
                        selected={false}
                        focused={false}
                        onToggle={() => undefined}
                        onFocus={() => undefined}
                        selectable={false}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {issuesQuery.isLoading && <ChartSkeleton />}

        <div className="h-8" />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
      <p className="text-2xs uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-1 text-xl font-semibold text-fg">{value}</p>
      {hint && <p className="mt-0.5 text-2xs text-subtle">{hint}</p>}
    </div>
  );
}

export type { Issue };
