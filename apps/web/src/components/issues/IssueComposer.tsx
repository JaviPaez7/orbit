import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Box, CalendarDays, Flag, Repeat, Tag, UserCircle2 } from 'lucide-react';
import {
  ESTIMATE_OPTIONS,
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  type IssuePriority,
  type IssueStatus,
} from '@orbit/shared';
import { useAuth, usePermissions } from '../../context/AuthContext';
import { ApiError, api, buildQuery } from '../../lib/api';
import { queryKeys } from '../../lib/query-client';
import { toDateInput } from '../../lib/utils';
import type { Cycle, Issue, Label, Project } from '../../lib/types';
import { Button } from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { useToast } from '../ui/Toast';

interface IssueComposerProps {
  open: boolean;
  onClose: () => void;
  /** Prefills the project when creating from a project page. */
  defaultProjectId?: string | null;
  defaultStatus?: IssueStatus;
  defaultCycleId?: string | null;
  /** Editing an existing issue instead of creating one. */
  issue?: Issue | null;
  onCreated?: (issue: Issue) => void;
}

/**
 * Create/edit issue dialog. Optimistically paints a toast and invalidates the
 * relevant queries; server errors (including 403 from role checks) surface as
 * field-level messages.
 */
export function IssueComposer({
  open,
  onClose,
  defaultProjectId,
  defaultStatus = 'todo',
  defaultCycleId,
  issue,
  onCreated,
}: IssueComposerProps) {
  const { workspace, user } = useAuth();
  const { canCreateIssues } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const workspaceId = workspace?.id ?? '';
  const isEditing = Boolean(issue);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>(defaultStatus);
  const [priority, setPriority] = useState<string>('none');
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? '');
  const [cycleId, setCycleId] = useState<string>(defaultCycleId ?? '');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [estimate, setEstimate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (issue) {
      setTitle(issue.title);
      setDescription(issue.description ?? '');
      setStatus(issue.status);
      setPriority(issue.priority);
      setProjectId(issue.projectId ?? '');
      setCycleId(issue.cycleId ?? '');
      setAssigneeId(issue.assigneeId ?? '');
      setEstimate(issue.estimate === null ? '' : String(issue.estimate));
      setDueDate(toDateInput(issue.dueDate));
      setLabelIds(issue.labels.map((label) => label.id));
    } else {
      setTitle('');
      setDescription('');
      setStatus(defaultStatus);
      setPriority('none');
      setProjectId(defaultProjectId ?? '');
      setCycleId(defaultCycleId ?? '');
      setAssigneeId('');
      setEstimate('');
      setDueDate('');
      setLabelIds([]);
    }
  }, [open, issue, defaultProjectId, defaultCycleId, defaultStatus]);

  const projects = useQuery({
    queryKey: queryKeys.projects(workspaceId),
    queryFn: () => api.get<{ projects: Project[] }>(`/workspaces/${workspaceId}/projects`),
    enabled: open && Boolean(workspaceId),
    select: (data) => data.projects,
  });

  const cycles = useQuery({
    queryKey: queryKeys.cycles(workspaceId),
    queryFn: () => api.get<{ cycles: Cycle[] }>(`/workspaces/${workspaceId}/cycles`),
    enabled: open && Boolean(workspaceId),
    select: (data) => data.cycles,
  });

  const labels = useQuery({
    queryKey: queryKeys.labels(workspaceId),
    queryFn: () => api.get<{ labels: Label[] }>(`/workspaces/${workspaceId}/labels`),
    enabled: open && Boolean(workspaceId),
    select: (data) => data.labels,
  });

  const assignable = useQuery({
    queryKey: queryKeys.assignable(workspaceId),
    queryFn: () =>
      api.get<{ members: { id: string; name: string; handle: string; avatarUrl: string | null }[] }>(
        `/workspaces/${workspaceId}/assignable`,
      ),
    enabled: open && Boolean(workspaceId),
    select: (data) => data.members,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        projectId: projectId || null,
        cycleId: cycleId || null,
        assigneeId: assigneeId || null,
        estimate: estimate === '' ? null : Number(estimate),
        dueDate: dueDate || null,
        labelIds,
      };
      if (isEditing && issue) {
        return api.patch<{ issue: Issue }>(
          `/workspaces/${workspaceId}/issues/${issue.id}`,
          payload,
        );
      }
      return api.post<{ issue: Issue }>(`/workspaces/${workspaceId}/issues`, payload);
    },
    onSuccess: (data) => {
      const created = data.issue;
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['issue'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceId) });
      toast.success(
        isEditing ? `${created.identifier} updated` : `${created.identifier} created`,
        created.title,
        isEditing
          ? undefined
          : { label: 'Open issue', onClick: () => navigate(`/issues/${created.identifier}`) },
      );
      onCreated?.(created);
      onClose();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.fields) {
          const flat: Record<string, string> = {};
          for (const [key, messages] of Object.entries(error.fields)) {
            if (messages[0]) flat[key] = messages[0];
          }
          setErrors(flat);
        }
        toast.error(isEditing ? 'Could not update issue' : 'Could not create issue', error.message);
      } else {
        toast.error('Unexpected error', error instanceof Error ? error.message : undefined);
      }
    },
  });

  const statusOptions = useMemo(
    () => ISSUE_STATUSES.map((value) => ({ value, label: ISSUE_STATUS_LABELS[value] })),
    [],
  );
  const priorityOptions = useMemo(
    () => ISSUE_PRIORITIES.map((value) => ({ value, label: ISSUE_PRIORITY_LABELS[value] })),
    [],
  );

  const submit = () => {
    if (!title.trim()) {
      setErrors({ title: 'Title is required' });
      return;
    }
    mutation.mutate();
  };

  const readOnly = !isEditing && !canCreateIssues;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `Edit ${issue?.identifier}` : 'New issue'}
      description={
        isEditing ? 'Changes are saved to the workspace immediately.' : `Creating in ${workspace?.name}`
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={mutation.isPending}
            disabled={readOnly}
            data-testid="issue-submit"
          >
            {isEditing ? 'Save changes' : 'Create issue'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title" required error={errors.title}>
          {({ id, ...rest }) => (
            <Input
              id={id}
              {...rest}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Short, actionable summary"
              data-autofocus
              data-testid="issue-title-input"
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
              }}
            />
          )}
        </Field>

        <Field label="Description" hint="Markdown supported. Cmd/Ctrl+Enter to submit." error={errors.description}>
          {({ id, ...rest }) => (
            <Textarea
              id={id}
              {...rest}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={6}
              placeholder="Context, acceptance criteria, links…"
              data-testid="issue-description-input"
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Status" error={errors.status}>
            {() => (
              <Select
                options={statusOptions}
                value={status}
                onChange={setStatus}
                width={200}
                ariaLabel="Status"
              />
            )}
          </Field>

          <Field label="Priority" error={errors.priority}>
            {() => (
              <Select
                options={priorityOptions}
                value={priority}
                onChange={setPriority}
                width={200}
                ariaLabel="Priority"
                trigger={
                  <>
                    <Flag className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {ISSUE_PRIORITY_LABELS[priority as IssuePriority] ?? priority}
                    </span>
                  </>
                }
              />
            )}
          </Field>

          <Field label="Assignee" error={errors.assigneeId}>
            {() => (
              <Select
                options={(assignable.data ?? []).map((member) => ({
                  value: member.id,
                  label: member.name,
                  avatar: { name: member.name, avatarUrl: member.avatarUrl },
                }))}
                value={assigneeId}
                onChange={setAssigneeId}
                clearable
                clearLabel="Unassigned"
                searchable
                width={220}
                ariaLabel="Assignee"
                placeholder="Unassigned"
                trigger={
                  <>
                    <UserCircle2 className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {assignable.data?.find((member) => member.id === assigneeId)?.name ?? 'Unassigned'}
                    </span>
                  </>
                }
              />
            )}
          </Field>

          <Field label="Project" error={errors.projectId}>
            {() => (
              <Select
                options={(projects.data ?? []).map((project) => ({
                  value: project.id,
                  label: project.name,
                  color: project.color,
                }))}
                value={projectId}
                onChange={setProjectId}
                clearable
                clearLabel="No project"
                searchable
                width={240}
                ariaLabel="Project"
                placeholder="No project"
                trigger={
                  <>
                    <Box className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {projects.data?.find((project) => project.id === projectId)?.name ?? 'No project'}
                    </span>
                  </>
                }
              />
            )}
          </Field>

          <Field label="Cycle" error={errors.cycleId}>
            {() => (
              <Select
                options={(cycles.data ?? []).map((cycle) => ({
                  value: cycle.id,
                  label: cycle.name,
                  hint: cycle.status,
                }))}
                value={cycleId}
                onChange={setCycleId}
                clearable
                clearLabel="No cycle"
                width={220}
                ariaLabel="Cycle"
                placeholder="No cycle"
                trigger={
                  <>
                    <Repeat className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {cycles.data?.find((cycle) => cycle.id === cycleId)?.name ?? 'No cycle'}
                    </span>
                  </>
                }
              />
            )}
          </Field>

          <Field label="Estimate" error={errors.estimate}>
            {() => (
              <Select
                options={[
                  { value: '', label: 'No estimate' },
                  ...ESTIMATE_OPTIONS.map((value) => ({ value: String(value), label: `${value} points` })),
                ]}
                value={estimate}
                onChange={setEstimate}
                width={180}
                ariaLabel="Estimate"
              />
            )}
          </Field>

          <Field label="Due date" error={errors.dueDate}>
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                leading={<CalendarDays className="h-3.5 w-3.5" />}
              />
            )}
          </Field>
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Tag className="h-3.5 w-3.5" /> Labels
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(labels.data ?? []).map((label) => {
              const active = labelIds.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() =>
                    setLabelIds((current) =>
                      current.includes(label.id)
                        ? current.filter((id) => id !== label.id)
                        : [...current, label.id],
                    )
                  }
                  className="rounded-md border px-2 py-0.5 text-xs transition-colors"
                  style={{
                    borderColor: active ? label.color : 'rgb(var(--border-default))',
                    backgroundColor: active ? `${label.color}22` : 'transparent',
                    color: active ? label.color : 'rgb(var(--fg-muted))',
                  }}
                >
                  {label.name}
                </button>
              );
            })}
            {(labels.data ?? []).length === 0 && (
              <p className="text-xs text-subtle">
                No labels yet.{' '}
                <Link to="/settings/labels" className="link" onClick={onClose}>
                  Create one
                </Link>
              </p>
            )}
          </div>
        </div>

        {!isEditing && (
          <p className="text-2xs text-subtle">
            Created by {user?.name}. Press <span className="kbd">⌘</span>
            <span className="kbd">↵</span> to submit.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Small helper for the "create issue from anywhere" flow with a preset filter. */
export function issueFilterQuery(filters: Record<string, unknown>): string {
  return buildQuery(filters as never);
}
