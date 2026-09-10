import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Flag, Tag, Trash2, UserCircle2, X } from 'lucide-react';
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  type IssuePriority,
  type IssueStatus,
} from '@orbit/shared';
import { useAuth } from '../../context/AuthContext';
import { ApiError, api } from '../../lib/api';
import { queryKeys } from '../../lib/query-client';
import { cn } from '../../lib/utils';
import type { Cycle, Issue, Label, Project } from '../../lib/types';
import { Button } from '../ui/Button';
import { PriorityIcon, StatusIcon } from '../ui/Icons';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';

interface BulkActionsBarProps {
  selectedIds: string[];
  onClear: () => void;
  /** Called after a successful mutation with the updated issues. */
  onUpdated?: (issues: Issue[]) => void;
}

/**
 * Floating multi-select toolbar. Every action hits the bulk API so a single
 * request updates N issues and writes N activity entries server-side.
 */
export function BulkActionsBar({ selectedIds, onClear, onUpdated }: BulkActionsBarProps) {
  const { workspace } = useAuth();
  const workspaceId = workspace?.id ?? '';
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const projects = useQuery({
    queryKey: queryKeys.projects(workspaceId),
    queryFn: () => api.get<{ projects: Project[] }>(`/workspaces/${workspaceId}/projects`),
    enabled: Boolean(workspaceId),
    select: (data) => data.projects,
  });
  const cycles = useQuery({
    queryKey: queryKeys.cycles(workspaceId),
    queryFn: () => api.get<{ cycles: Cycle[] }>(`/workspaces/${workspaceId}/cycles`),
    enabled: Boolean(workspaceId),
    select: (data) => data.cycles,
  });
  const labels = useQuery({
    queryKey: queryKeys.labels(workspaceId),
    queryFn: () => api.get<{ labels: Label[] }>(`/workspaces/${workspaceId}/labels`),
    enabled: Boolean(workspaceId),
    select: (data) => data.labels,
  });
  const assignable = useQuery({
    queryKey: queryKeys.assignable(workspaceId),
    queryFn: () =>
      api.get<{ members: { id: string; name: string; avatarUrl: string | null }[] }>(
        `/workspaces/${workspaceId}/assignable`,
      ),
    enabled: Boolean(workspaceId),
    select: (data) => data.members,
  });

  /** Optimistically patch the cached issue lists so the UI reacts instantly. */
  const patchCaches = (patch: (issue: Issue) => Issue) => {
    queryClient.setQueriesData<{ items: Issue[]; total: number }>(
      { queryKey: ['issues'] },
      (current) =>
        current && Array.isArray(current.items)
          ? {
              ...current,
              items: current.items.map((issue) =>
                selectedIds.includes(issue.id) ? patch(issue) : issue,
              ),
            }
          : current,
    );
  };

  const bulkMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ updated: number; issues: Issue[] }>(
        `/workspaces/${workspaceId}/issues/bulk`,
        { ids: selectedIds, ...payload },
      ),
    onError: (error) => {
      // Roll back the optimistic patch by refetching the authoritative state.
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      toast.error(
        'Bulk update failed',
        error instanceof ApiError ? `${error.message} — the change was rolled back` : undefined,
      );
    },
    onSuccess: (data) => {
      toast.success(`Updated ${data.updated} issue${data.updated === 1 ? '' : 's'}`);
      onUpdated?.(data.issues);
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      onClear();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.post<{ deleted: number }>(`/workspaces/${workspaceId}/issues/bulk-delete`, {
        ids: selectedIds,
      }),
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} issue${data.deleted === 1 ? '' : 's'}`);
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      setConfirmDelete(false);
      onClear();
    },
    onError: (error) => {
      toast.error('Delete failed', error instanceof ApiError ? error.message : undefined);
    },
  });

  const count = selectedIds.length;
  const summary = useMemo(() => `${count} selected`, [count]);

  if (count === 0) return null;

  const apply = (payload: Record<string, unknown>, optimistic: (issue: Issue) => Issue) => {
    patchCaches(optimistic);
    bulkMutation.mutate(payload);
  };

  return (
    <>
      <div
        data-testid="bulk-actions"
        className="pointer-events-auto fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-line bg-elevated px-2 py-1.5 shadow-popover"
      >
        <span className="px-2 text-xs font-medium text-fg">{summary}</span>
        <span className="mx-1 h-5 w-px bg-line" />

        <Menu
          align="center"
          side="top"
          width={200}
          trigger={(triggerProps) => (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<StatusIcon status="todo" className="h-3.5 w-3.5" />}
              {...triggerProps}
            >
              Status
            </Button>
          )}
        >
          <MenuLabel>Change status</MenuLabel>
          {ISSUE_STATUSES.map((status) => (
            <MenuItem
              key={status}
              icon={<StatusIcon status={status} className="h-3.5 w-3.5" />}
              onClick={() =>
                apply({ status }, (issue) => ({ ...issue, status: status as IssueStatus }))
              }
            >
              {ISSUE_STATUS_LABELS[status]}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          align="center"
          side="top"
          width={200}
          trigger={(triggerProps) => (
            <Button variant="ghost" size="sm" leftIcon={<Flag className="h-3.5 w-3.5" />} {...triggerProps}>
              Priority
            </Button>
          )}
        >
          <MenuLabel>Change priority</MenuLabel>
          {ISSUE_PRIORITIES.map((priority) => (
            <MenuItem
              key={priority}
              icon={<PriorityIcon priority={priority} className="h-3.5 w-3.5" />}
              onClick={() =>
                apply({ priority }, (issue) => ({ ...issue, priority: priority as IssuePriority }))
              }
            >
              {ISSUE_PRIORITY_LABELS[priority]}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          align="center"
          side="top"
          width={230}
          trigger={(triggerProps) => (
            <Button variant="ghost" size="sm" leftIcon={<UserCircle2 className="h-3.5 w-3.5" />} {...triggerProps}>
              Assign
            </Button>
          )}
        >
          <MenuLabel>Assign to</MenuLabel>
          <MenuItem
            icon={<span className="h-3.5 w-3.5 rounded-full border border-dashed border-line-strong" />}
            onClick={() => apply({ assigneeId: null }, (issue) => ({ ...issue, assignee: null, assigneeId: null }))}
          >
            Unassigned
          </MenuItem>
          <MenuSeparator />
          {(assignable.data ?? []).map((member) => (
            <MenuItem
              key={member.id}
              onClick={() =>
                apply({ assigneeId: member.id }, (issue) => ({
                  ...issue,
                  assigneeId: member.id,
                  assignee: { id: member.id, name: member.name, handle: '', avatarUrl: member.avatarUrl },
                }))
              }
            >
              {member.name}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          align="center"
          side="top"
          width={240}
          trigger={(triggerProps) => (
            <Button variant="ghost" size="sm" leftIcon={<Tag className="h-3.5 w-3.5" />} {...triggerProps}>
              Labels
            </Button>
          )}
        >
          <MenuLabel>Add label</MenuLabel>
          {(labels.data ?? []).map((label) => (
            <MenuItem
              key={label.id}
              icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />}
              onClick={() =>
                apply({ addLabelIds: [label.id] }, (issue) =>
                  issue.labels.some((entry) => entry.id === label.id)
                    ? issue
                    : { ...issue, labels: [...issue.labels, label] },
                )
              }
            >
              {label.name}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuLabel>Remove label</MenuLabel>
          {(labels.data ?? []).map((label) => (
            <MenuItem
              key={`remove-${label.id}`}
              icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />}
              onClick={() =>
                apply({ removeLabelIds: [label.id] }, (issue) => ({
                  ...issue,
                  labels: issue.labels.filter((entry) => entry.id !== label.id),
                }))
              }
            >
              {label.name}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          align="center"
          side="top"
          width={220}
          trigger={(triggerProps) => (
            <Button variant="ghost" size="sm" {...triggerProps}>
              More
            </Button>
          )}
        >
          <MenuLabel>Move to project</MenuLabel>
          <MenuItem
            onClick={() =>
              apply({ projectId: null }, (issue) => ({ ...issue, projectId: null, project: null }))
            }
          >
            No project
          </MenuItem>
          {(projects.data ?? []).map((project) => (
            <MenuItem
              key={project.id}
              icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />}
              onClick={() =>
                apply({ projectId: project.id }, (issue) => ({
                  ...issue,
                  projectId: project.id,
                  project: { id: project.id, name: project.name, icon: project.icon, color: project.color },
                }))
              }
            >
              {project.name}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuLabel>Move to cycle</MenuLabel>
          <MenuItem
            onClick={() => apply({ cycleId: null }, (issue) => ({ ...issue, cycleId: null, cycle: null }))}
          >
            No cycle
          </MenuItem>
          {(cycles.data ?? []).map((cycle) => (
            <MenuItem
              key={cycle.id}
              onClick={() =>
                apply({ cycleId: cycle.id }, (issue) => ({
                  ...issue,
                  cycleId: cycle.id,
                  cycle: { id: cycle.id, name: cycle.name, number: cycle.number, status: cycle.status },
                }))
              }
            >
              {cycle.name}
              <span className="ml-2 text-2xs text-subtle">{cycle.status}</span>
            </MenuItem>
          ))}
        </Menu>

        <span className="mx-1 h-5 w-px bg-line" />

        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger/10"
          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          onClick={onClear}
          className={cn('ml-1')}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${count} issue${count === 1 ? '' : 's'}?`}
        description="This cannot be undone. Activity history for these issues is removed too."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              data-testid="confirm-bulk-delete"
            >
              Delete {count}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Type-safe confirmation: the API re-checks that every issue belongs to your workspace before
          deleting anything.
        </p>
      </Modal>
    </>
  );
}
