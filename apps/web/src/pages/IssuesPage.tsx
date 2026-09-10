import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownUp,
  ChevronDown,
  Download,
  Filter,
  Group,
  ListChecks,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
} from '@orbit/shared';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { ApiError, api, buildQuery, downloadText } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { cn } from '../lib/utils';
import {
  ISSUE_GROUP_OPTIONS,
  ISSUE_SORT_OPTIONS,
  useIssueFilters,
  type IssueFilterState,
} from '../hooks/useIssueFilters';
import type { Cycle, Issue, IssueListResponse, Label, Project } from '../lib/types';
import { Header } from '../components/layout/Header';
import { IssueRow } from '../components/issues/IssueRow';
import { BulkActionsBar } from '../components/issues/BulkActionsBar';
import { IssueComposer } from '../components/issues/IssueComposer';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../components/ui/Menu';
import { MultiSelect, Select } from '../components/ui/Select';
import { IssueListSkeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { StatusIcon } from '../components/ui/Icons';
import { useToast } from '../components/ui/Toast';

/**
 * Linear-style issue list: URL-persisted filters, grouping, sorting, keyboard
 * navigation, multi-select and bulk mutations.
 */
export default function IssuesPage({
  fixedFilters,
  embedded,
  title,
}: {
  fixedFilters?: Partial<IssueFilterState>;
  embedded?: boolean;
  title?: string;
} = {}) {
  const { workspace, role } = useAuth();
  const { subscribe } = useRealtime();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const workspaceId = workspace?.id ?? '';
  const fixed = useMemo(() => fixedFilters, [fixedFilters]);

  const { state, update, toggleInList, clearAll, activeCount, query } = useIssueFilters(fixed);
  const [selected, setSelected] = useState<string[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const lastClickedIndex = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const issuesQuery = useQuery({
    queryKey: queryKeys.issues(workspaceId, query),
    queryFn: () =>
      api.get<IssueListResponse>(`/workspaces/${workspaceId}/issues${buildQuery(query as never)}`),
    enabled: Boolean(workspaceId),
    placeholderData: (previous) => previous,
  });

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

  const members = useQuery({
    queryKey: queryKeys.assignable(workspaceId),
    queryFn: () =>
      api.get<{ members: { id: string; name: string; avatarUrl: string | null }[] }>(
        `/workspaces/${workspaceId}/assignable`,
      ),
    enabled: Boolean(workspaceId),
    select: (data) => data.members,
  });

  const issues = issuesQuery.data?.items ?? [];
  const groups = issuesQuery.data?.groups;

  // ---- realtime: keep the list fresh without a manual refresh --------------
  useEffect(() => {
    return subscribe((event) => {
      if (event.workspaceId !== workspaceId) return;
      if (!event.type.startsWith('issue.')) return;
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
    });
  }, [subscribe, workspaceId, queryClient]);

  // ---- keyboard navigation -------------------------------------------------
  const toggleSelect = useCallback(
    (issueId: string, shiftKey: boolean) => {
      const index = issues.findIndex((issue) => issue.id === issueId);
      if (shiftKey && lastClickedIndex.current !== null) {
        const start = Math.min(lastClickedIndex.current, index);
        const end = Math.max(lastClickedIndex.current, index);
        const range = issues.slice(start, end + 1).map((issue) => issue.id);
        setSelected((current) => [...new Set([...current, ...range])]);
      } else {
        setSelected((current) =>
          current.includes(issueId) ? current.filter((id) => id !== issueId) : [...current, issueId],
        );
        lastClickedIndex.current = index;
      }
    },
    [issues],
  );

  const selectAll = useCallback(() => {
    setSelected(issues.map((issue) => issue.id));
  }, [issues]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (issues.length === 0) return;

      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAll();
        return;
      }
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((index) => Math.min(index + 1, issues.length - 1));
        return;
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === 'x') {
        event.preventDefault();
        const issue = issues[focusedIndex];
        if (issue) toggleSelect(issue.id, false);
        return;
      }
      if (event.key === 'Enter') {
        const issue = issues[focusedIndex];
        if (issue) {
          event.preventDefault();
          navigate(`/issues/${issue.identifier}`);
        }
        return;
      }
      if (event.key === 'Escape') {
        setSelected([]);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [issues, focusedIndex, navigate, selectAll, toggleSelect]);

  useEffect(() => {
    setFocusedIndex((index) => (issues.length === 0 ? 0 : Math.min(index, issues.length - 1)));
  }, [issues.length]);

  /** Single-issue delete straight from the row (delegated click handler). */
  const deleteOne = useMutation({
    mutationFn: (issueId: string) => api.delete(`/workspaces/${workspaceId}/issues/${issueId}`),
    onSuccess: () => {
      toast.success('Issue deleted');
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
    onError: (error) =>
      toast.error('Delete failed', error instanceof ApiError ? error.message : undefined),
  });

  // Row-level delete button delegation (avoids a handler per row).
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest('[data-delete-issue]');
      if (!button) return;
      const issueId = button.getAttribute('data-delete-issue');
      if (issueId) deleteOne.mutate(issueId);
    };
    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [deleteOne]);

  const exportCsv = async () => {
    try {
      await downloadText(
        `/workspaces/${workspaceId}/export/issues.csv${buildQuery({ projectId: state.projectId.join(',') || undefined })}`,
        `orbit-issues-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      toast.success('Export ready', 'The CSV file was downloaded');
    } catch (error) {
      toast.error('Export failed', error instanceof ApiError ? error.message : undefined);
    }
  };

  const filtersBar = (
    <>
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
        <Input
          value={state.q}
          onChange={(event) => update({ q: event.target.value })}
          placeholder="Search issues…"
          aria-label="Search issues"
          data-testid="issue-search"
          className="pl-7"
          style={{ paddingLeft: '1.75rem' }}
        />
      </div>

      <MultiSelect
        options={ISSUE_STATUSES.map((status) => ({
          value: status,
          label: ISSUE_STATUS_LABELS[status],
          color: status === 'done' ? '#42c284' : status === 'in_progress' ? '#e2a83e' : undefined,
        }))}
        values={state.status}
        onToggle={(value) => toggleInList('status', value)}
        onClear={() => update({ status: [] })}
        placeholder="Status"
        renderTrigger={(selectedOptions) => (
          <>
            <Filter className="h-3.5 w-3.5" />
            {selectedOptions.length === 0 ? 'Status' : selectedOptions.map((o) => o.label).join(', ')}
          </>
        )}
      />

      <MultiSelect
        options={ISSUE_PRIORITIES.map((priority) => ({
          value: priority,
          label: ISSUE_PRIORITY_LABELS[priority],
        }))}
        values={state.priority}
        onToggle={(value) => toggleInList('priority', value)}
        onClear={() => update({ priority: [] })}
        placeholder="Priority"
      />

      <MultiSelect
        options={[
          { value: 'unassigned', label: 'Unassigned' },
          ...(members.data ?? []).map((member) => ({
            value: member.id,
            label: member.name,
            avatar: { name: member.name, avatarUrl: member.avatarUrl },
          })),
        ]}
        values={state.assigneeId}
        onToggle={(value) => toggleInList('assigneeId', value)}
        onClear={() => update({ assigneeId: [] })}
        placeholder="Assignee"
        width={260}
      />

      {!fixed?.projectId && (
        <MultiSelect
          options={[
            { value: 'none', label: 'No project' },
            ...(projects.data ?? []).map((project) => ({
              value: project.id,
              label: project.name,
              color: project.color,
            })),
          ]}
          values={state.projectId}
          onToggle={(value) => toggleInList('projectId', value)}
          onClear={() => update({ projectId: [] })}
          placeholder="Project"
          width={260}
        />
      )}

      {showFilters && (
        <>
          <MultiSelect
            options={[
              { value: 'none', label: 'No cycle' },
              ...(cycles.data ?? []).map((cycle) => ({
                value: cycle.id,
                label: cycle.name,
                hint: cycle.status,
              })),
            ]}
            values={state.cycleId}
            onToggle={(value) => toggleInList('cycleId', value)}
            onClear={() => update({ cycleId: [] })}
            placeholder="Cycle"
            width={240}
          />
          <MultiSelect
            options={(labels.data ?? []).map((label) => ({
              value: label.id,
              label: label.name,
              color: label.color,
            }))}
            values={state.labelId}
            onToggle={(value) => toggleInList('labelId', value)}
            onClear={() => update({ labelId: [] })}
            placeholder="Labels"
            width={240}
          />
        </>
      )}

      <Button
        variant="ghost"
        size="sm"
        leftIcon={<SlidersHorizontal className="h-3.5 w-3.5" />}
        onClick={() => setShowFilters((value) => !value)}
        className="text-muted"
      >
        {showFilters ? 'Less' : 'More filters'}
      </Button>

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} onClick={clearAll}>
          Clear {activeCount}
        </Button>
      )}
    </>
  );

  const displayActions = (
    <>
      <Menu
        align="end"
        width={200}
        trigger={(triggerProps) => (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Group className="h-3.5 w-3.5" />}
            {...triggerProps}
            data-testid="group-trigger"
          >
            {ISSUE_GROUP_OPTIONS.find((option) => option.value === state.group)?.label ?? 'Group'}
          </Button>
        )}
      >
        <MenuLabel>Group by</MenuLabel>
        {ISSUE_GROUP_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            selected={state.group === option.value}
            onClick={() => update({ group: option.value })}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        align="end"
        width={220}
        trigger={(triggerProps) => (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowDownUp className="h-3.5 w-3.5" />}
            {...triggerProps}
            data-testid="sort-trigger"
          >
            {ISSUE_SORT_OPTIONS.find((option) => option.value === state.sort)?.label ?? 'Sort'}
          </Button>
        )}
      >
        <MenuLabel>Sort by</MenuLabel>
        {ISSUE_SORT_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            selected={state.sort === option.value}
            onClick={() => update({ sort: option.value })}
          >
            {option.label}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem selected={state.direction === 'desc'} onClick={() => update({ direction: 'desc' })}>
          Descending
        </MenuItem>
        <MenuItem selected={state.direction === 'asc'} onClick={() => update({ direction: 'asc' })}>
          Ascending
        </MenuItem>
      </Menu>

      <Button variant="ghost" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv}>
        Export
      </Button>
    </>
  );

  const renderGroup = (groupKey: string, groupLabel: string, groupIssues: Issue[]) => (
    <section key={groupKey} className="border-b border-line">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-sunken/80 px-3 py-1.5 backdrop-blur">
        <ChevronDown className="h-3.5 w-3.5 text-subtle" />
        {groupKey.startsWith('status:') ? (
          <StatusIcon status={groupKey.split(':')[1] ?? 'todo'} className="h-3.5 w-3.5" />
        ) : null}
        <h2 className="text-xs font-medium capitalize text-fg">{groupLabel.replace(/_/g, ' ')}</h2>
        <span className="text-2xs text-subtle">{groupIssues.length}</span>
      </header>
      {groupIssues.map((issue) => (
        <IssueRow
          key={issue.id}
          issue={issue}
          selected={selected.includes(issue.id)}
          focused={issues[focusedIndex]?.id === issue.id}
          onToggle={toggleSelect}
          onFocus={(id) => setFocusedIndex(issues.findIndex((entry) => entry.id === id))}
          showProject={!fixed?.projectId}
        />
      ))}
    </section>
  );

  const renderList = () => {
    if (issuesQuery.isLoading) return <IssueListSkeleton rows={10} />;
    if (issuesQuery.isError) {
      return (
        <ErrorState
          title="Could not load issues"
          error={issuesQuery.error}
          onRetry={() => void issuesQuery.refetch()}
        />
      );
    }
    if (issues.length === 0) {
      const filtered = activeCount > 0;
      return (
        <EmptyState
          icon={ListChecks}
          title={filtered ? 'No issues match these filters' : 'No issues yet'}
          description={
            filtered
              ? 'Try widening the filters or clearing the search term.'
              : 'Create your first issue to start tracking work in this workspace.'
          }
          action={
            filtered ? (
              <Button size="sm" variant="secondary" onClick={clearAll}>
                Clear filters
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setComposerOpen(true)}
              >
                Create issue
              </Button>
            )
          }
        />
      );
    }

    if (state.group === 'none' || !groups) {
      return (
        <div>
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              selected={selected.includes(issue.id)}
              focused={issues[focusedIndex]?.id === issue.id}
              onToggle={toggleSelect}
              onFocus={(id) => setFocusedIndex(issues.findIndex((entry) => entry.id === id))}
              showProject={!fixed?.projectId}
            />
          ))}
        </div>
      );
    }

    return (
      <div>
        {groups.map((group) => {
          const groupIssues = group.issueIds
            .map((id) => issues.find((issue) => issue.id === id))
            .filter((issue): issue is Issue => Boolean(issue));
          return renderGroup(group.key, group.label, groupIssues);
        })}
      </div>
    );
  };

  const unassignedViewerHint = role === 'viewer';

  return (
    <div className="relative flex h-full flex-col">
      {!embedded && (
        <Header
          title={title}
          onCreateIssue={() => setComposerOpen(true)}
          onOpenSearch={() => update({ q: state.q })}
          filters={filtersBar}
          actions={displayActions}
        />
      )}

      {embedded && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5">
          {filtersBar}
          <div className="ml-auto flex items-center gap-1.5">{displayActions}</div>
        </div>
      )}

      <div className="flex items-center gap-3 border-b border-line px-3 py-1.5 text-2xs text-subtle">
        <span data-testid="issue-count">
          {issuesQuery.data?.total ?? 0} issue{(issuesQuery.data?.total ?? 0) === 1 ? '' : 's'}
        </span>
        {selected.length > 0 && <span className="text-accent">{selected.length} selected</span>}
        {unassignedViewerHint && (
          <span className="ml-auto rounded border border-line px-1.5 py-0.5">
            Viewing as {role} — editing is disabled
          </span>
        )}
        <span className="ml-auto hidden items-center gap-2 sm:flex">
          <span>
            <span className="kbd">J</span> <span className="kbd">K</span> navigate
          </span>
          <span>
            <span className="kbd">X</span> select
          </span>
          <span>
            <span className="kbd">↵</span> open
          </span>
        </span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto pb-24">
        {renderList()}
      </div>

      <BulkActionsBar
        selectedIds={selected}
        onClear={() => setSelected([])}
        onUpdated={() => void issuesQuery.refetch()}
      />

      <IssueComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        defaultProjectId={fixed?.projectId?.[0] ?? null}
        defaultCycleId={fixed?.cycleId?.[0] ?? null}
      />
    </div>
  );
}

export { StatusIcon, cn };
