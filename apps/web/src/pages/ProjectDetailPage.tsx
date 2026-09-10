import { useState } from 'react';
import { useIssueComposer } from '../context/IssueComposerContext';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Box, CalendarDays, ListChecks, Settings, Target, Users } from 'lucide-react';
import {
  PROJECT_ICONS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from '@orbit/shared';
import { useAuth, usePermissions } from '../context/AuthContext';
import { ApiError, api, buildQuery } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { cn, formatDate, toDateInput } from '../lib/utils';
import type { Cycle, IssueListResponse, Project } from '../lib/types';
import { Header } from '../components/layout/Header';
import { useProjectCrumb } from '../components/layout/Header';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Field, Input, ProgressBar, Textarea } from '../components/ui/Field';
import { IssueRow } from '../components/issues/IssueRow';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { Switch } from '../components/ui/Field';

const STATUS_COLORS: Record<string, string> = {
  planned: '#8a909c',
  in_progress: '#e2a83e',
  paused: '#f97316',
  completed: '#42c284',
  cancelled: '#6c7280',
};

type Tab = 'overview' | 'issues' | 'cycles' | 'settings';

export default function ProjectDetailPage({ settingsMode = false }: { settingsMode?: boolean }) {
  const { openComposer, openSearch } = useIssueComposer();
  const { projectId } = useParams<{ projectId: string }>();
  const { workspace, user } = useAuth();
  const { canManageProjects } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const workspaceId = workspace?.id ?? '';
  const [tab, setTab] = useState<Tab>(settingsMode ? 'settings' : 'overview');

  const projectQuery = useQuery({
    queryKey: queryKeys.project(projectId ?? ''),
    queryFn: () =>
      api.get<{ project: Project; workspaceId: string; role: string }>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });

  const issuesQuery = useQuery({
    queryKey: queryKeys.issues(workspaceId, { projectId, limit: 50 }),
    queryFn: () =>
      api.get<IssueListResponse>(
        `/workspaces/${workspaceId}/issues${buildQuery({ projectId, limit: 50, sort: 'updatedAt' })}`,
      ),
    enabled: Boolean(workspaceId && projectId),
  });

  const members = useQuery({
    queryKey: queryKeys.members(workspaceId),
    queryFn: () =>
      api.get<{
        members: {
          id: string;
          role: string;
          user: { id: string; name: string; avatarUrl: string | null };
        }[];
      }>(`/workspaces/${workspaceId}/members`),
    enabled: Boolean(workspaceId),
    select: (data) => data.members,
  });

  const project = projectQuery.data?.project;
  const crumb = useProjectCrumb(projectId, workspaceId);

  const [draft, setDraft] = useState<Partial<Project>>({});
  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch<{ project: Project }>(`/projects/${projectId}`, payload),
    onSuccess: () => {
      toast.success('Project updated');
      void queryClient.invalidateQueries({ queryKey: ['project'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDraft({});
    },
    onError: (error) =>
      toast.error(
        'Could not update the project',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}`),
    onSuccess: () => {
      toast.success('Project deleted');
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (error) =>
      toast.error(
        'Could not delete the project',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  if (projectQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="p-6">
        <ErrorState
          title="Project not found"
          description={
            projectQuery.error instanceof ApiError
              ? projectQuery.error.message
              : 'It may have been deleted or belong to another workspace.'
          }
          onRetry={() => void projectQuery.refetch()}
        />
        <div className="mt-4 text-center">
          <Link to="/projects" className="link text-xs">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const issues = issuesQuery.data?.items ?? [];
  const openIssues = issues.filter(
    (issue) => issue.status !== 'done' && issue.status !== 'cancelled',
  );

  return (
    <div className="flex h-full flex-col">
      <Header
        crumbs={crumb}
        title={project.name}
        onCreateIssue={() => openComposer()}
        onOpenSearch={openSearch}
        showPresence={false}
        filters={
          <>
            <div className="flex items-center gap-3 text-2xs text-subtle">
              <span className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: STATUS_COLORS[project.status] }}
                />
                {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}
              </span>
              <span>{project.issueCount} issues</span>
              <span>{project.progress}% complete</span>
              {project.targetDate && <span>Target {formatDate(project.targetDate)}</span>}
            </div>
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<BarChart3 className="h-3.5 w-3.5" />}
              onClick={() => navigate(`/projects/${project.id}/analytics`)}
            >
              Analytics
            </Button>
            {canManageProjects && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Settings className="h-3.5 w-3.5" />}
                onClick={() => setTab(tab === 'settings' ? 'overview' : 'settings')}
              >
                Settings
              </Button>
            )}
          </>
        }
      />

      <nav
        className="flex items-center gap-1 border-b border-line px-3 py-1.5"
        aria-label="Project sections"
      >
        {(
          [
            { id: 'overview', label: 'Overview', icon: Box },
            { id: 'issues', label: 'Issues', icon: ListChecks },
            { id: 'cycles', label: 'Cycles', icon: Target },
            ...(canManageProjects ? [{ id: 'settings', label: 'Settings', icon: Settings }] : []),
          ] as { id: Tab; label: string; icon: typeof Box }[]
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
              tab === entry.id ? 'bg-selected text-fg' : 'text-muted hover:bg-hover hover:text-fg',
            )}
          >
            <entry.icon className="h-3.5 w-3.5" />
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <section className="card p-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
                  About
                </h2>
                <p className="text-sm text-fg">{project.description ?? 'No description yet.'}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-subtle">Start</dt>
                    <dd className="text-fg">{formatDate(project.startDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Target</dt>
                    <dd className="text-fg">{formatDate(project.targetDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Lead</dt>
                    <dd className="flex items-center gap-1.5 text-fg">
                      {project.lead ? (
                        <>
                          <Avatar name={project.lead.name} src={project.lead.avatarUrl} size="xs" />
                          {project.lead.name}
                        </>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Days remaining</dt>
                    <dd
                      className={cn('text-fg', (project.daysRemaining ?? 0) < 0 && 'text-danger')}
                    >
                      {project.daysRemaining === null
                        ? '—'
                        : project.daysRemaining < 0
                          ? `${Math.abs(project.daysRemaining)} days overdue`
                          : `${project.daysRemaining} days`}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">
                    Open issues
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setTab('issues')}>
                    View all
                  </Button>
                </div>
                {issuesQuery.isLoading && <Skeleton className="h-24" />}
                {openIssues.length === 0 && !issuesQuery.isLoading && (
                  <EmptyState
                    compact
                    title="No open issues"
                    description="Everything in this project is done or cancelled."
                  />
                )}
                <div className="-mx-4">
                  {openIssues.slice(0, 8).map((issue) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      selected={false}
                      focused={false}
                      onToggle={() => undefined}
                      onFocus={() => undefined}
                      showProject={false}
                      selectable={false}
                    />
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <section className="card p-4">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">
                  Progress
                </h2>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted">
                    {project.completedIssueCount}/{project.issueCount} done
                  </span>
                  <span className="text-fg">{project.progress}%</span>
                </div>
                <ProgressBar value={project.progress} color={project.color} height="h-2" />
                <p className="mt-3 text-2xs text-subtle">
                  {project.estimateTotal} story points completed
                </p>
              </section>

              <section className="card p-4">
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
                  <Users className="h-3.5 w-3.5" /> Members
                </h2>
                <ul className="space-y-2">
                  {project.members.map((member) => (
                    <li key={member.id} className="flex items-center gap-2">
                      <Avatar name={member.name} src={member.avatarUrl} size="md" />
                      <span className="text-xs text-fg">{member.name}</span>
                      {member.id === project.leadId && <span className="chip ml-auto">Lead</span>}
                      {member.id === user?.id && <span className="chip ml-auto">You</span>}
                    </li>
                  ))}
                  {project.members.length === 0 && (
                    <li className="text-xs text-subtle">No members assigned yet.</li>
                  )}
                </ul>
              </section>
            </div>
          </div>
        )}

        {tab === 'issues' && (
          <div className="overflow-hidden rounded-xl border border-line">
            {issuesQuery.isLoading && <Skeleton className="h-32" />}
            {issues.length === 0 && !issuesQuery.isLoading && (
              <EmptyState
                title="No issues in this project"
                description="Create an issue and assign it to this project to see it here."
              />
            )}
            {issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                selected={false}
                focused={false}
                onToggle={() => undefined}
                onFocus={() => undefined}
                showProject={false}
                selectable={false}
              />
            ))}
          </div>
        )}

        {tab === 'cycles' && <ProjectCycles projectId={project.id} workspaceId={workspaceId} />}

        {tab === 'settings' && canManageProjects && (
          <div className="max-w-2xl space-y-5">
            <section className="card p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">
                Project details
              </h2>
              <div className="space-y-3">
                <Field label="Name">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={draft.name ?? project.name}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  )}
                </Field>
                <Field label="Description">
                  {({ id }) => (
                    <Textarea
                      id={id}
                      value={draft.description ?? project.description ?? ''}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, description: event.target.value }))
                      }
                      rows={3}
                    />
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    {() => (
                      <Select
                        options={PROJECT_STATUSES.map((status) => ({
                          value: status,
                          label: PROJECT_STATUS_LABELS[status],
                          color: STATUS_COLORS[status],
                        }))}
                        value={draft.status ?? project.status}
                        onChange={(value) =>
                          setDraft((current) => ({ ...current, status: value as ProjectStatus }))
                        }
                        width={200}
                        ariaLabel="Status"
                      />
                    )}
                  </Field>
                  <Field label="Lead">
                    {() => (
                      <Select
                        clearable
                        clearLabel="No lead"
                        searchable
                        options={(members.data ?? []).map((member) => ({
                          value: member.user.id,
                          label: member.user.name,
                          avatar: { name: member.user.name, avatarUrl: member.user.avatarUrl },
                        }))}
                        value={draft.leadId ?? project.leadId ?? ''}
                        onChange={(value) =>
                          setDraft((current) => ({ ...current, leadId: value || null }))
                        }
                        width={220}
                        ariaLabel="Lead"
                      />
                    )}
                  </Field>
                  <Field label="Start date">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="date"
                        value={toDateInput(draft.startDate ?? project.startDate)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            startDate: event.target.value || null,
                          }))
                        }
                      />
                    )}
                  </Field>
                  <Field label="Target date">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="date"
                        value={toDateInput(draft.targetDate ?? project.targetDate)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            targetDate: event.target.value || null,
                          }))
                        }
                      />
                    )}
                  </Field>
                </div>

                <Field label="Icon">
                  {() => (
                    <div className="flex flex-wrap gap-1.5">
                      {PROJECT_ICONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setDraft((current) => ({ ...current, icon }))}
                          className={cn(
                            'rounded-md border px-2 py-1 text-xs capitalize',
                            (draft.icon ?? project.icon) === icon
                              ? 'border-accent text-fg'
                              : 'border-line text-muted hover:text-fg',
                          )}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  )}
                </Field>

                <Field label="Members">
                  {() => (
                    <div className="flex flex-wrap gap-1.5">
                      {(members.data ?? []).map((member) => {
                        const current = draft.memberIds ?? project.memberIds;
                        const active = current.includes(member.user.id);
                        return (
                          <button
                            key={member.user.id}
                            type="button"
                            onClick={() =>
                              setDraft((state) => ({
                                ...state,
                                memberIds: active
                                  ? current.filter((id) => id !== member.user.id)
                                  : [...current, member.user.id],
                              }))
                            }
                            className={cn(
                              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                              active
                                ? 'border-accent bg-accent/10 text-fg'
                                : 'border-line text-muted',
                            )}
                          >
                            <Avatar name={member.user.name} src={member.user.avatarUrl} size="xs" />
                            {member.user.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Field>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={updateMutation.isPending}
                    disabled={Object.keys(draft).length === 0}
                    onClick={() => updateMutation.mutate(draft as Record<string, unknown>)}
                  >
                    Save changes
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDraft({})}>
                    Reset
                  </Button>
                </div>
              </div>
            </section>

            <section className="card p-4">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-subtle">
                Danger zone
              </h2>
              <p className="mb-3 text-xs text-muted">
                Deleting a project keeps its issues — they simply become unassigned.
              </p>
              <div className="flex items-center gap-3">
                <Switch
                  checked={draft.archived ?? project.archived}
                  onChange={(checked) => updateMutation.mutate({ archived: checked })}
                  label="Archive this project"
                  description="Archived projects are hidden from the sidebar and project list."
                />
              </div>
              <Button
                variant="danger"
                size="sm"
                className="mt-4"
                loading={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Delete "${project.name}"? Issues will be kept.`)) {
                    deleteMutation.mutate();
                  }
                }}
              >
                Delete project
              </Button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCycles({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const cycles = useQuery({
    queryKey: queryKeys.cycles(workspaceId),
    queryFn: () => api.get<{ cycles: Cycle[] }>(`/workspaces/${workspaceId}/cycles`),
    enabled: Boolean(workspaceId),
    select: (data) => data.cycles.filter((cycle) => cycle.projectId === projectId),
  });

  if (cycles.isLoading) return <Skeleton className="h-32" />;

  if ((cycles.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No cycles for this project"
        description="Cycles are workspace-wide; assign one to this project from the cycles screen."
        action={
          <Link to="/cycles" className="btn btn-secondary btn-sm">
            Go to cycles
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {(cycles.data ?? []).map((cycle) => (
        <Link
          key={cycle.id}
          to={`/cycles/${cycle.id}`}
          className="card p-4 transition-colors hover:border-line-strong"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-fg">{cycle.name}</h3>
            <span className="chip">{cycle.status}</span>
          </div>
          <p className="mt-1 text-2xs text-subtle">
            {formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}
          </p>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-2xs text-subtle">
              <span>
                {cycle.completedIssues}/{cycle.totalIssues} issues
              </span>
              <span>{cycle.progress}%</span>
            </div>
            <ProgressBar value={cycle.progress} />
          </div>
          <p className="mt-2 text-2xs text-subtle">
            {cycle.points}/{cycle.totalPoints} points
          </p>
        </Link>
      ))}
    </div>
  );
}
