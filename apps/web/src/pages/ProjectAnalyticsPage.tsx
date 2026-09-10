import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeft } from 'lucide-react';
import { ISSUE_PRIORITY_LABELS, type IssuePriority } from '@orbit/shared';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { formatDateShort } from '../lib/utils';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { ChartSkeleton, Skeleton } from '../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../components/ui/States';

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

interface ProjectAnalytics {
  total: number;
  completed: number;
  open: number;
  progress: number;
  estimateTotal: number;
  estimateCompleted: number;
  byStatus: { key: string; label: string; count: number }[];
  byPriority: { key: string; count: number }[];
  trend: { date: string; created: number; completed: number }[];
  byAssignee: { userId: string; name: string; avatarUrl: string | null; open: number; completed: number }[];
}

export default function ProjectAnalyticsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { workspace } = useAuth();

  const analyticsQuery = useQuery({
    queryKey: queryKeys.projectAnalytics(projectId ?? ''),
    queryFn: () =>
      api.get<{ analytics: ProjectAnalytics; project: { id: string; name: string } }>(
        `/projects/${projectId}/analytics`,
      ),
    enabled: Boolean(projectId),
  });

  const project = analyticsQuery.data?.project;
  const analytics = analyticsQuery.data?.analytics;
  void workspace;

  const trendData = (analytics?.trend ?? []).map((point) => ({
    ...point,
    label: formatDateShort(point.date),
  }));

  return (
    <div className="flex h-full flex-col">
      <Header
        title={project ? `${project.name} analytics` : 'Project analytics'}
        crumbs={
          project
            ? [
                { label: 'Projects', to: '/projects' },
                { label: project.name, to: `/projects/${project.id}` },
                { label: 'Analytics' },
              ]
            : [{ label: 'Analytics' }]
        }
        onCreateIssue={() => undefined}
        onOpenSearch={() => undefined}
        showPresence={false}
        actions={
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
            onClick={() => window.history.back()}
          >
            Back
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
          </>
        )}

        {analyticsQuery.isError && (
          <ErrorState
            title="Could not load project analytics"
            error={analyticsQuery.error}
            onRetry={() => void analyticsQuery.refetch()}
          />
        )}

        {analytics && analytics.total === 0 && (
          <EmptyState
            title="No data yet"
            description="Add issues to this project to populate the charts."
            action={
              project && (
                <Link to={`/projects/${project.id}`} className="btn btn-secondary btn-sm">
                  Open project
                </Link>
              )
            }
          />
        )}

        {analytics && analytics.total > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Issues" value={analytics.total} hint={`${analytics.open} open`} />
              <StatCard
                label="Completion"
                value={`${analytics.progress}%`}
                hint={`${analytics.completed} done`}
              />
              <StatCard
                label="Story points"
                value={`${analytics.estimateCompleted}/${analytics.estimateTotal}`}
                hint="completed / total"
              />
              <StatCard
                label="Contributors"
                value={analytics.byAssignee.filter((entry) => entry.userId !== 'unassigned').length}
                hint="assigned members"
              />
            </div>

            <ChartCard title="Created vs completed (last 6 weeks)">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="rgb(var(--border-default))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} interval={4} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} allowDecimals={false} />
                  <ChartTooltip
                    contentStyle={{
                      background: 'rgb(var(--bg-elevated))',
                      border: '1px solid rgb(var(--border-default))',
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="created" stroke="#6c7df6" strokeWidth={2} dot={false} name="Created" />
                  <Line type="monotone" dataKey="completed" stroke="#42c284" strokeWidth={2} dot={false} name="Completed" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Issues by status">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={analytics.byStatus} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgb(var(--border-default))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} allowDecimals={false} />
                    <ChartTooltip
                      contentStyle={{
                        background: 'rgb(var(--bg-elevated))',
                        border: '1px solid rgb(var(--border-default))',
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
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
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {analytics.byPriority.map((entry) => (
                        <Cell key={entry.key} fill={PRIORITY_COLORS[entry.key] ?? '#8a909c'} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      contentStyle={{
                        background: 'rgb(var(--bg-elevated))',
                        border: '1px solid rgb(var(--border-default))',
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [
                        value,
                        ISSUE_PRIORITY_LABELS[name as IssuePriority] ?? name,
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value: string) => ISSUE_PRIORITY_LABELS[value as IssuePriority] ?? value}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Workload per member">
              <ResponsiveContainer width="100%" height={Math.max(180, analytics.byAssignee.length * 34)}>
                <BarChart
                  data={analytics.byAssignee}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 40, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgb(var(--border-default))" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 10, fill: 'rgb(var(--fg-subtle))' }}
                  />
                  <ChartTooltip
                    contentStyle={{
                      background: 'rgb(var(--bg-elevated))',
                      border: '1px solid rgb(var(--border-default))',
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="open" stackId="a" fill="#6c7df6" name="Open" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="completed" stackId="a" fill="#42c284" name="Completed" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-3">
      <p className="text-2xs uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-fg">{value}</p>
      {hint && <p className="mt-0.5 text-2xs text-subtle">{hint}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">{title}</h2>
      {children}
    </section>
  );
}
