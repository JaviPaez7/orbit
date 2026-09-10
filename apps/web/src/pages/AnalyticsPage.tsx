import { useState } from 'react';
import { useIssueComposer } from '../context/IssueComposerContext';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Download, TrendingUp } from 'lucide-react';
import {
  ISSUE_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  type IssuePriority,
  type ProjectStatus,
} from '@orbit/shared';
import { useAuth } from '../context/AuthContext';
import { api, downloadText } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { cn, formatDateShort } from '../lib/utils';
import type { Analytics } from '../lib/types';
import { Header } from '../components/layout/Header';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/Field';
import { ChartSkeleton, Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';

const STATUS_COLORS: Record<string, string> = {
  backlog: '#8a909c',
  todo: '#9aa1ad',
  in_progress: '#e2a83e',
  in_review: '#6c7df6',
  done: '#42c284',
  cancelled: '#6c7280',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f97316',
  high: '#ec5e5e',
  medium: '#e2a83e',
  low: '#6c7df6',
  none: '#8a909c',
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  planned: '#8a909c',
  in_progress: '#e2a83e',
  paused: '#f97316',
  completed: '#42c284',
  cancelled: '#6c7280',
};

const CHART_TOOLTIP_STYLE = {
  background: 'rgb(var(--bg-elevated))',
  border: '1px solid rgb(var(--border-default))',
  borderRadius: 10,
  fontSize: 12,
  color: 'rgb(var(--fg-default))',
};

export default function AnalyticsPage() {
  const { openComposer, openSearch } = useIssueComposer();
  const { workspace } = useAuth();
  const toast = useToast();
  const workspaceId = workspace?.id ?? '';
  const [days, setDays] = useState(90);

  const analyticsQuery = useQuery({
    queryKey: queryKeys.analytics(workspaceId, days),
    queryFn: () =>
      api.get<{ analytics: Analytics; windowDays: number }>(
        `/workspaces/${workspaceId}/analytics?days=${days}`,
      ),
    enabled: Boolean(workspaceId),
  });

  const analytics = analyticsQuery.data?.analytics;

  const trend = (analytics?.trend ?? []).map((point) => ({
    ...point,
    label: formatDateShort(point.date),
  }));
  const throughput = (analytics?.throughput ?? []).map((point) => ({
    ...point,
    label: formatDateShort(point.date),
  }));
  const velocity = (analytics?.velocity ?? []).map((cycle) => ({
    name: cycle.name,
    completed: cycle.completedPoints,
    total: cycle.totalPoints,
    issues: cycle.completedIssues,
  }));

  const exportAnalytics = async () => {
    try {
      await downloadText(
        `/workspaces/${workspaceId}/export/issues.csv`,
        `orbit-analytics-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      toast.success('Raw issue data exported');
    } catch {
      toast.error('Export failed');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Analytics"
        crumbs={[{ label: 'Analytics' }]}
        onCreateIssue={() => openComposer()}
        onOpenSearch={openSearch}
        showPresence={false}
        filters={
          <>
            {[30, 90, 180].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDays(value)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs transition-colors',
                  days === value ? 'border-accent text-fg' : 'border-line text-muted hover:text-fg',
                )}
              >
                {value} days
              </button>
            ))}
            <span className="ml-2 text-2xs text-subtle">
              All charts are computed from live issue data in this workspace.
            </span>
          </>
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Download className="h-3.5 w-3.5" />}
            onClick={exportAnalytics}
          >
            Export raw data
          </Button>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {analyticsQuery.isLoading && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20" />
              ))}
            </div>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        )}

        {analyticsQuery.isError && (
          <ErrorState
            title="Could not load analytics"
            error={analyticsQuery.error}
            onRetry={() => void analyticsQuery.refetch()}
          />
        )}

        {analytics && analytics.totals.issues === 0 && (
          <EmptyState
            icon={BarChart3}
            title="No data yet"
            description="Analytics populate as soon as this workspace has issues."
          />
        )}

        {analytics && analytics.totals.issues > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Total issues"
                value={analytics.totals.issues}
                hint={`${analytics.totals.open} open`}
              />
              <Stat
                label="Completion rate"
                value={`${analytics.completionRate}%`}
                hint={`${analytics.totals.completed} done · ${analytics.totals.cancelled} cancelled`}
              />
              <Stat
                label="Story points"
                value={analytics.totals.completedPoints}
                hint={`of ${analytics.totals.estimatePoints} in scope`}
              />
              <Stat
                label="Overdue"
                value={analytics.totals.overdue}
                hint={
                  analytics.totals.overdue > 0 ? 'past due date and still open' : 'nothing overdue'
                }
                danger={analytics.totals.overdue > 0}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <ChartCard title="Issues created vs completed" className="xl:col-span-2">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6c7df6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#6c7df6" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#42c284" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#42c284" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="rgb(var(--border-default))"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }}
                      interval={Math.ceil(trend.length / 8)}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }}
                      allowDecimals={false}
                    />
                    <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="created"
                      stroke="#6c7df6"
                      strokeWidth={2}
                      fill="url(#createdFill)"
                      name="Created"
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      stroke="#42c284"
                      strokeWidth={2}
                      fill="url(#completedFill)"
                      name="Completed"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Completion">
                <ResponsiveContainer width="100%" height={280}>
                  <RadialBarChart
                    data={[{ name: 'Complete', value: analytics.completionRate, fill: '#42c284' }]}
                    innerRadius="62%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar dataKey="value" background cornerRadius={6} />
                    <text
                      x="50%"
                      y="50%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-current text-2xl font-semibold"
                      style={{ fill: 'rgb(var(--fg-default))', fontSize: 26 }}
                    >
                      {analytics.completionRate}%
                    </text>
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-2xs text-subtle">
                  <span>{analytics.totals.projects} projects</span>
                  <span>{analytics.totals.cycles} cycles</span>
                  <span>{analytics.totals.members} members</span>
                </div>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Issues by status">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={analytics.byStatus}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="rgb(var(--border-default))"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }}
                      allowDecimals={false}
                    />
                    <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Issues">
                      {analytics.byStatus.map((entry) => (
                        <Cell key={entry.key} fill={STATUS_COLORS[entry.key] ?? '#6c7df6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Issues by priority">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={analytics.byPriority.filter((entry) => entry.count > 0)}
                      dataKey="count"
                      nameKey="key"
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {analytics.byPriority.map((entry) => (
                        <Cell key={entry.key} fill={PRIORITY_COLORS[entry.key] ?? '#8a909c'} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number, name: string) => [
                        value,
                        ISSUE_PRIORITY_LABELS[name as IssuePriority] ?? name,
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value: string) =>
                        ISSUE_PRIORITY_LABELS[value as IssuePriority] ?? value
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Workload per member">
              <ResponsiveContainer
                width="100%"
                height={Math.max(200, analytics.workload.length * 32)}
              >
                <BarChart
                  data={analytics.workload}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 30, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="rgb(var(--border-default))"
                    strokeDasharray="3 3"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }}
                  />
                  <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="open" stackId="a" fill="#6c7df6" name="Open" />
                  <Bar
                    dataKey="completed"
                    stackId="a"
                    fill="#42c284"
                    name="Completed"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Cycle velocity (completed points)">
                {velocity.length === 0 ? (
                  <EmptyState
                    compact
                    title="No cycles yet"
                    description="Velocity appears once cycles exist."
                  />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={velocity} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid
                        stroke="rgb(var(--border-default))"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }}
                      />
                      <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} />
                      <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="completed"
                        fill="#42c284"
                        name="Completed points"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="total"
                        fill="#2b3140"
                        name="Total scope"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Throughput (issues completed per day)">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={throughput} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid
                      stroke="rgb(var(--border-default))"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }}
                      interval={Math.ceil(throughput.length / 8)}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }}
                      allowDecimals={false}
                    />
                    <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Line
                      type="monotone"
                      dataKey="completed"
                      stroke="#42c284"
                      strokeWidth={2}
                      dot={false}
                      name="Completed"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Project completion">
                <ul className="space-y-3">
                  {analytics.projects.map((project) => (
                    <li key={project.id}>
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-fg">{project.name}</span>
                        <span
                          className="chip"
                          style={{ color: PROJECT_STATUS_COLORS[project.status] }}
                        >
                          {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}
                        </span>
                        <span className="w-16 text-right text-subtle">
                          {project.completed}/{project.total}
                        </span>
                        <span className="w-9 text-right text-muted">{project.progress}%</span>
                      </div>
                      <ProgressBar value={project.progress} color={project.color} />
                    </li>
                  ))}
                  {analytics.projects.length === 0 && (
                    <li className="text-xs text-subtle">No active projects.</li>
                  )}
                </ul>
              </ChartCard>

              <ChartCard title="Labels in use">
                {analytics.labels.length === 0 ? (
                  <EmptyState
                    compact
                    title="No labels yet"
                    description="Create labels to categorise issues."
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {analytics.labels.slice(0, 10).map((label) => {
                      const max = analytics.labels[0]?.count ?? 1;
                      return (
                        <li key={label.id} className="flex items-center gap-2">
                          <span
                            className="w-24 shrink-0 truncate rounded px-1.5 py-0.5 text-2xs"
                            style={{ backgroundColor: `${label.color}22`, color: label.color }}
                          >
                            {label.name}
                          </span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-selected">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.round((label.count / Math.max(1, max)) * 100)}%`,
                                backgroundColor: label.color,
                              }}
                            />
                          </span>
                          <span className="w-8 text-right text-2xs text-subtle">{label.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ChartCard>
            </div>

            {analytics.cycleBurndown.length > 0 && (
              <ChartCard title="Active cycle burndown">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart
                    data={analytics.cycleBurndown.map((point) => ({
                      ...point,
                      label: formatDateShort(point.date),
                    }))}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="rgb(var(--border-default))"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} />
                    <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="remaining"
                      stroke="#6c7df6"
                      strokeWidth={2}
                      dot={false}
                      name="Remaining"
                    />
                    <Line
                      type="monotone"
                      dataKey="ideal"
                      stroke="#8a909c"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      name="Ideal"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            <section className="card p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
                <TrendingUp className="h-3.5 w-3.5" /> Team load
              </h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {analytics.workload.map((member) => (
                  <li
                    key={member.userId}
                    className="flex items-center gap-2 rounded-lg border border-line p-2"
                  >
                    <Avatar name={member.name} src={member.avatarUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-fg">{member.name}</span>
                      <span className="block text-2xs text-subtle">
                        {member.open} open · {member.completed} done
                      </span>
                    </span>
                    <span className="text-2xs text-muted">{member.estimate} pts</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string | number;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="card p-3">
      <p className="text-2xs uppercase tracking-wider text-subtle">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold', danger ? 'text-danger' : 'text-fg')}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-2xs text-subtle">{hint}</p>}
    </div>
  );
}

function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('card p-4', className)}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">{title}</h2>
      {children}
    </section>
  );
}
