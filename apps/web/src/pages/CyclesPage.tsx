import { useMemo, useState } from 'react';
import { useIssueComposer } from '../context/IssueComposerContext';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Check, Plus, Repeat, Trash2 } from 'lucide-react';
import type { CycleStatus } from '@orbit/shared';
import { useAuth, usePermissions } from '../context/AuthContext';
import { ApiError, api } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { cn, formatDate } from '../lib/utils';
import type { Cycle, Project } from '../lib/types';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Field, Input, ProgressBar } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { CardGridSkeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';

function dateInput(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export default function CyclesPage() {
  const { openComposer, openSearch } = useIssueComposer();
  const { workspace } = useAuth();
  const { canManageCycles } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const workspaceId = workspace?.id ?? '';
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | CycleStatus>('all');
  const [form, setForm] = useState({
    name: '',
    startDate: dateInput(0),
    endDate: dateInput(14),
    projectId: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const cyclesQuery = useQuery({
    queryKey: queryKeys.cycles(workspaceId),
    queryFn: () =>
      api.get<{ cycles: Cycle[]; current: Cycle | null }>(`/workspaces/${workspaceId}/cycles`),
    enabled: Boolean(workspaceId),
  });

  const projects = useQuery({
    queryKey: queryKeys.projects(workspaceId),
    queryFn: () => api.get<{ projects: Project[] }>(`/workspaces/${workspaceId}/projects`),
    enabled: Boolean(workspaceId),
    select: (data) => data.projects,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ cycle: Cycle }>(`/workspaces/${workspaceId}/cycles`, {
        name: form.name.trim() || undefined,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        projectId: form.projectId || null,
      }),
    onSuccess: (data) => {
      toast.success('Cycle created', data.cycle.name);
      void queryClient.invalidateQueries({ queryKey: ['cycles'] });
      setCreateOpen(false);
      setForm({ name: '', startDate: dateInput(0), endDate: dateInput(14), projectId: '' });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        const flat: Record<string, string> = {};
        for (const [key, messages] of Object.entries(error.fields))
          if (messages[0]) flat[key] = messages[0];
        setErrors(flat);
      }
      toast.error(
        'Could not create the cycle',
        error instanceof ApiError ? error.message : undefined,
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ cycleId, status }: { cycleId: string; status: CycleStatus }) =>
      api.patch(`/workspaces/${workspaceId}/cycles/${cycleId}`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cycles'] });
      toast.success('Cycle updated');
    },
    onError: (error) =>
      toast.error(
        'Could not update the cycle',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (cycleId: string) => api.delete(`/workspaces/${workspaceId}/cycles/${cycleId}`),
    onSuccess: () => {
      toast.success('Cycle deleted', 'Its issues were kept and unassigned from the cycle.');
      void queryClient.invalidateQueries({ queryKey: ['cycles'] });
    },
    onError: (error) =>
      toast.error(
        'Could not delete the cycle',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const cycles = useMemo(() => cyclesQuery.data?.cycles ?? [], [cyclesQuery.data]);
  const current = cyclesQuery.data?.current ?? null;

  const groups = useMemo(() => {
    const filtered = cycles.filter((cycle) => filter === 'all' || cycle.status === filter);
    return {
      active: filtered.filter((cycle) => cycle.status === 'active'),
      upcoming: filtered
        .filter((cycle) => cycle.status === 'upcoming')
        .slice()
        .reverse(),
      completed: filtered.filter((cycle) => cycle.status === 'completed'),
    };
  }, [cycles, filter]);

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Cycles"
        crumbs={[{ label: 'Cycles' }]}
        onCreateIssue={() => openComposer()}
        onOpenSearch={openSearch}
        showPresence={false}
        filters={
          <>
            {(['all', 'active', 'upcoming', 'completed'] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setFilter(entry)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs capitalize transition-colors',
                  filter === entry
                    ? 'border-accent text-fg'
                    : 'border-line text-muted hover:text-fg',
                )}
              >
                {entry}
              </button>
            ))}
            {current && (
              <span className="ml-2 text-2xs text-subtle">
                Current: {current.name} · {current.progress}% complete
              </span>
            )}
          </>
        }
        actions={
          canManageCycles ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setCreateOpen(true)}
              data-testid="create-cycle"
            >
              New cycle
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {cyclesQuery.isLoading && <CardGridSkeleton cards={6} />}
        {cyclesQuery.isError && (
          <ErrorState
            title="Could not load cycles"
            error={cyclesQuery.error}
            onRetry={() => void cyclesQuery.refetch()}
          />
        )}
        {!cyclesQuery.isLoading && cycles.length === 0 && (
          <EmptyState
            icon={Repeat}
            title="No cycles yet"
            description="Cycles are time-boxed sprints. Create one to plan the next two weeks of work."
            action={
              canManageCycles ? (
                <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                  Create cycle
                </Button>
              ) : undefined
            }
          />
        )}

        {(
          [
            ['active', 'Active'],
            ['upcoming', 'Upcoming'],
            ['completed', 'Completed'],
          ] as const
        ).map(([key, label]) => {
          const list = groups[key];
          if (list.length === 0) return null;
          return (
            <section key={key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
                {label} <span className="text-subtle">({list.length})</span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((cycle) => (
                  <article
                    key={cycle.id}
                    className="card p-4"
                    data-testid={`cycle-card-${cycle.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to={`/cycles/${cycle.id}`}
                          className="truncate text-sm font-medium text-fg hover:text-accent"
                        >
                          {cycle.name}
                        </Link>
                        <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-subtle">
                          <CalendarRange className="h-3 w-3" />
                          {formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}
                        </p>
                        {cycle.project && (
                          <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-subtle">
                            <span
                              className="h-2 w-2 rounded-sm"
                              style={{ backgroundColor: cycle.project.color }}
                            />
                            {cycle.project.name}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          'chip shrink-0',
                          cycle.status === 'active' && 'border-accent/40 text-accent',
                          cycle.status === 'completed' && 'border-success/40 text-success',
                        )}
                      >
                        {cycle.status}
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-2xs text-subtle">
                        <span>
                          {cycle.completedIssues}/{cycle.totalIssues} issues · {cycle.points}/
                          {cycle.totalPoints} pts
                        </span>
                        <span>{cycle.progress}%</span>
                      </div>
                      <ProgressBar value={cycle.progress} />
                    </div>

                    {cycle.status === 'active' && (
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between text-2xs text-subtle">
                          <span>Time elapsed</span>
                          <span>
                            day {cycle.elapsed} of {cycle.days}
                          </span>
                        </div>
                        <ProgressBar
                          value={cycle.timeProgress}
                          height="h-1"
                          color={
                            cycle.timeProgress > cycle.progress
                              ? 'rgb(var(--warning))'
                              : 'rgb(var(--success))'
                          }
                        />
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <Link to={`/cycles/${cycle.id}`} className="btn btn-secondary btn-sm">
                        Open
                      </Link>
                      {canManageCycles && (
                        <>
                          {cycle.status !== 'completed' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              leftIcon={<Check className="h-3.5 w-3.5" />}
                              onClick={() =>
                                statusMutation.mutate({ cycleId: cycle.id, status: 'completed' })
                              }
                            >
                              Complete
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                statusMutation.mutate({ cycleId: cycle.id, status: 'active' })
                              }
                            >
                              Reopen
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete ${cycle.name}`}
                            className="ml-auto text-danger hover:bg-danger/10"
                            onClick={() => {
                              if (window.confirm(`Delete ${cycle.name}? Issues are kept.`)) {
                                deleteMutation.mutate(cycle.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New cycle"
        description="Cycles are workspace-wide; they can optionally be scoped to a project."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createMutation.isPending}
              onClick={() => {
                if (new Date(form.endDate) <= new Date(form.startDate)) {
                  setErrors({ endDate: 'End date must be after the start date' });
                  return;
                }
                setErrors({});
                createMutation.mutate();
              }}
              data-testid="create-cycle-submit"
            >
              Create cycle
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" hint="Leave empty to auto-number the cycle." error={errors.name}>
            {({ id }) => (
              <Input
                id={id}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Cycle 15"
                data-autofocus
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" required error={errors.startDate}>
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
            <Field label="End date" required error={errors.endDate}>
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={form.endDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              )}
            </Field>
          </div>
          <Field label="Project">
            {() => (
              <Select
                clearable
                clearLabel="Workspace-wide"
                options={(projects.data ?? []).map((project) => ({
                  value: project.id,
                  label: project.name,
                  color: project.color,
                }))}
                value={form.projectId}
                onChange={(value) => setForm((current) => ({ ...current, projectId: value }))}
                width={260}
                ariaLabel="Project"
              />
            )}
          </Field>
        </div>
      </Modal>
    </div>
  );
}
