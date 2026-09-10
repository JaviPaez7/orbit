import { useState } from 'react';
import { useIssueComposer } from '../context/IssueComposerContext';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, LayoutGrid, List, Plus, Search } from 'lucide-react';
import {
  PROJECT_ICONS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from '@orbit/shared';
import { useAuth, usePermissions } from '../context/AuthContext';
import { ApiError, api } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { cn, formatDateShort } from '../lib/utils';
import type { Project } from '../lib/types';
import { Header } from '../components/layout/Header';
import { Avatar, AvatarStack } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Field, Input, ProgressBar, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { CardGridSkeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';

const PROJECT_COLOR_CHOICES = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
];

const STATUS_COLORS: Record<string, string> = {
  planned: '#8a909c',
  in_progress: '#e2a83e',
  paused: '#f97316',
  completed: '#42c284',
  cancelled: '#6c7280',
};

export default function ProjectsPage() {
  const { openComposer, openSearch } = useIssueComposer();
  const { workspace } = useAuth();
  const { canManageProjects } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const workspaceId = workspace?.id ?? '';
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [includeArchived, setIncludeArchived] = useState(false);

  const createOpen = params.get('new') === '1';
  const setCreateOpen = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('new', '1');
    else next.delete('new');
    setParams(next, { replace: true });
  };

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(workspaceId, includeArchived),
    queryFn: () =>
      api.get<{ projects: Project[] }>(
        `/workspaces/${workspaceId}/projects${includeArchived ? '?includeArchived=true' : ''}`,
      ),
    enabled: Boolean(workspaceId),
    select: (data) => data.projects,
  });

  const members = useQuery({
    queryKey: queryKeys.members(workspaceId),
    queryFn: () =>
      api.get<{
        members: { id: string; user: { id: string; name: string; avatarUrl: string | null } }[];
      }>(`/workspaces/${workspaceId}/members`),
    enabled: Boolean(workspaceId),
    select: (data) => data.members.map((member) => member.user),
  });

  const [form, setForm] = useState({
    name: '',
    description: '',
    icon: 'box',
    color: '#6366f1',
    status: 'planned' as ProjectStatus,
    leadId: '',
    startDate: '',
    targetDate: '',
    memberIds: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ project: Project }>(`/workspaces/${workspaceId}/projects`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        icon: form.icon,
        color: form.color,
        status: form.status,
        leadId: form.leadId || null,
        startDate: form.startDate || null,
        targetDate: form.targetDate || null,
        memberIds: form.memberIds,
      }),
    onSuccess: (data) => {
      toast.success('Project created', data.project.name);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setCreateOpen(false);
      setForm({
        name: '',
        description: '',
        icon: 'box',
        color: '#6366f1',
        status: 'planned',
        leadId: '',
        startDate: '',
        targetDate: '',
        memberIds: [],
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        const flat: Record<string, string> = {};
        for (const [key, messages] of Object.entries(error.fields))
          if (messages[0]) flat[key] = messages[0];
        setErrors(flat);
      }
      toast.error(
        'Could not create the project',
        error instanceof ApiError ? error.message : undefined,
      );
    },
  });

  const projects = (projectsQuery.data ?? []).filter((project) => {
    if (statusFilter.length > 0 && !statusFilter.includes(project.status)) return false;
    if (search && !project.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const header = (
    <Header
      title="Projects"
      onCreateIssue={() => openComposer()}
      onOpenSearch={openSearch}
      crumbs={[{ label: 'Projects' }]}
      filters={
        <>
          <div className="relative w-52">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter projects…"
              aria-label="Filter projects"
              style={{ paddingLeft: '1.75rem' }}
            />
          </div>
          {PROJECT_STATUSES.map((status) => {
            const active = statusFilter.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() =>
                  setStatusFilter((current) =>
                    current.includes(status)
                      ? current.filter((entry) => entry !== status)
                      : [...current, status],
                  )
                }
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs transition-colors',
                  active ? 'border-accent text-fg' : 'border-line text-muted hover:text-fg',
                )}
                style={active ? { backgroundColor: `${STATUS_COLORS[status]}22` } : undefined}
              >
                {PROJECT_STATUS_LABELS[status]}
              </button>
            );
          })}
          <label className="ml-1 flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-line-strong accent-[rgb(var(--accent))]"
            />
            Archived
          </label>
        </>
      }
      actions={
        <>
          <div className="flex items-center rounded-md border border-line">
            <button
              type="button"
              aria-label="Grid view"
              onClick={() => setView('grid')}
              className={cn('p-1.5', view === 'grid' ? 'text-fg' : 'text-subtle hover:text-fg')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="List view"
              onClick={() => setView('list')}
              className={cn('p-1.5', view === 'list' ? 'text-fg' : 'text-subtle hover:text-fg')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          {canManageProjects && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setCreateOpen(true)}
              data-testid="create-project"
            >
              New project
            </Button>
          )}
        </>
      }
    />
  );

  return (
    <div className="flex h-full flex-col">
      {header}

      <div className="flex-1 overflow-y-auto p-4">
        {projectsQuery.isLoading &&
          (view === 'grid' ? <CardGridSkeleton /> : <Skeleton className="h-40" />)}
        {projectsQuery.isError && (
          <ErrorState
            title="Could not load projects"
            error={projectsQuery.error}
            onRetry={() => void projectsQuery.refetch()}
          />
        )}
        {!projectsQuery.isLoading && !projectsQuery.isError && projects.length === 0 && (
          <EmptyState
            icon={Box}
            title={search || statusFilter.length > 0 ? 'No projects match' : 'No projects yet'}
            description={
              search || statusFilter.length > 0
                ? 'Adjust the filters to see more projects.'
                : 'Projects group related issues, cycles and reporting.'
            }
            action={
              canManageProjects ? (
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => setCreateOpen(true)}
                >
                  Create project
                </Button>
              ) : undefined
            }
          />
        )}

        {view === 'grid' && projects.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}

        {view === 'list' && projects.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-sunken text-2xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Project</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Lead</th>
                  <th className="px-3 py-2 text-left font-medium">Issues</th>
                  <th className="px-3 py-2 text-left font-medium">Progress</th>
                  <th className="px-3 py-2 text-left font-medium">Target</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="table-row">
                    <td className="px-3 py-2">
                      <Link
                        to={`/projects/${project.id}`}
                        className="flex items-center gap-2 hover:text-accent"
                      >
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-white"
                          style={{ backgroundColor: project.color }}
                        >
                          {project.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate">{project.name}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="chip" style={{ color: STATUS_COLORS[project.status] }}>
                        {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {project.lead ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted">
                          <Avatar name={project.lead.name} src={project.lead.avatarUrl} size="xs" />
                          {project.lead.name}
                        </span>
                      ) : (
                        <span className="text-xs text-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {project.completedIssueCount}/{project.issueCount}
                    </td>
                    <td className="w-32 px-3 py-2">
                      <ProgressBar value={project.progress} color={project.color} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {formatDateShort(project.targetDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New project"
        description="Projects group issues and cycles, and power their own analytics."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createMutation.isPending}
              onClick={() => {
                if (!form.name.trim()) {
                  setErrors({ name: 'Name is required' });
                  return;
                }
                createMutation.mutate();
              }}
              data-testid="create-project-submit"
            >
              Create project
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" required error={errors.name}>
            {({ id, ...rest }) => (
              <Input
                id={id}
                {...rest}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Payments Platform"
                data-autofocus
                data-testid="project-name-input"
              />
            )}
          </Field>

          <Field label="Description" error={errors.description}>
            {({ id, ...rest }) => (
              <Textarea
                id={id}
                {...rest}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
                placeholder="What is this project responsible for?"
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
                  value={form.status}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, status: value as ProjectStatus }))
                  }
                  width={200}
                  ariaLabel="Status"
                />
              )}
            </Field>

            <Field label="Lead">
              {() => (
                <Select
                  options={(members.data ?? []).map((member) => ({
                    value: member.id,
                    label: member.name,
                    avatar: { name: member.name, avatarUrl: member.avatarUrl },
                  }))}
                  value={form.leadId}
                  onChange={(value) => setForm((current) => ({ ...current, leadId: value }))}
                  clearable
                  clearLabel="No lead"
                  searchable
                  width={220}
                  ariaLabel="Lead"
                  placeholder="No lead"
                />
              )}
            </Field>

            <Field label="Start date">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              )}
            </Field>

            <Field label="Target date">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={form.targetDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, targetDate: event.target.value }))
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
                    onClick={() => setForm((current) => ({ ...current, icon }))}
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs capitalize transition-colors',
                      form.icon === icon
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

          <Field label="Color">
            {() => (
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_COLOR_CHOICES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Color ${color}`}
                    onClick={() => setForm((current) => ({ ...current, color }))}
                    className={cn(
                      'h-6 w-6 rounded-md border-2 transition-transform',
                      form.color === color ? 'scale-110 border-fg' : 'border-transparent',
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </Field>

          <Field label="Members" hint="Everyone you add can be assigned issues in this project.">
            {() => (
              <div className="flex flex-wrap gap-1.5">
                {(members.data ?? []).map((member) => {
                  const active = form.memberIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          memberIds: active
                            ? current.memberIds.filter((id) => id !== member.id)
                            : [...current.memberIds, member.id],
                        }))
                      }
                      className={cn(
                        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                        active
                          ? 'border-accent bg-accent/10 text-fg'
                          : 'border-line text-muted hover:text-fg',
                      )}
                    >
                      <Avatar name={member.name} src={member.avatarUrl} size="xs" />
                      {member.name}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      data-testid={`project-card-${project.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ backgroundColor: project.color }}
        >
          {project.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-fg group-hover:text-accent">
            {project.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-subtle">
            <span style={{ color: STATUS_COLORS[project.status] }}>
              {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}
            </span>
            {project.archived && <span className="chip">archived</span>}
          </p>
        </div>
        {project.lead && <Avatar name={project.lead.name} src={project.lead.avatarUrl} size="md" />}
      </div>

      <p className="line-clamp-2 min-h-[2.1rem] text-xs text-muted">
        {project.description ?? 'No description yet.'}
      </p>

      <div>
        <div className="mb-1 flex items-center justify-between text-2xs text-subtle">
          <span>
            {project.completedIssueCount}/{project.issueCount} issues
          </span>
          <span>{project.progress}%</span>
        </div>
        <ProgressBar value={project.progress} color={project.color} />
      </div>

      <div className="flex items-center justify-between">
        <AvatarStack people={project.members} size="sm" />
        <span className="text-2xs text-subtle">
          {project.targetDate ? `Target ${formatDateShort(project.targetDate)}` : 'No target date'}
        </span>
      </div>
    </Link>
  );
}
