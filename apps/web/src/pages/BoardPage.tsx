import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { ISSUE_STATUSES, ISSUE_STATUS_LABELS, type IssueStatus } from '@orbit/shared';
import { useAuth, usePermissions } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { ApiError, api, buildQuery } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { cn } from '../lib/utils';
import type { Issue, IssueListResponse } from '../lib/types';
import { Header } from '../components/layout/Header';
import { IssueRow } from '../components/issues/IssueRow';
import { IssueComposer } from '../components/issues/IssueComposer';
import { BulkActionsBar } from '../components/issues/BulkActionsBar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { StatusIcon } from '../components/ui/Icons';
import { BoardSkeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState, Spinner } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { useIssueFilters } from '../hooks/useIssueFilters';
import { MultiSelect } from '../components/ui/Select';

interface Columns {
  [status: string]: Issue[];
}

const DRAG_MIME = 'application/x-orbit-issue';

function buildColumns(issues: Issue[]): Columns {
  const columns: Columns = {};
  for (const status of ISSUE_STATUSES) columns[status] = [];
  for (const issue of issues) (columns[issue.status] ??= []).push(issue);
  for (const status of Object.keys(columns)) {
    columns[status]!.sort((a, b) => a.boardOrder - b.boardOrder || a.number - b.number);
  }
  return columns;
}

/**
 * Kanban board.
 *
 * Drag & drop uses the native HTML5 drag API (no pointer-event library), which
 * keeps the board testable with Playwright's `dragTo` and works with the
 * keyboard-accessible status picker on each card.
 *
 * A drop persists immediately through `POST /issues/:id/move`, which stores the
 * new column plus a fractional `boardOrder`. The React Query cache is patched
 * optimistically before the request and rolled back (by refetching) on failure.
 */
export default function BoardPage() {
  const { workspace } = useAuth();
  const { canEditIssues } = usePermissions();
  const { subscribe } = useRealtime();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const workspaceId = workspace?.id ?? '';

  const { state, update, toggleInList, clearAll, activeCount, query } = useIssueFilters({ group: 'none' });
  const [selected, setSelected] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerStatus, setComposerStatus] = useState<IssueStatus>('todo');
  const dragCounter = useRef(0);

  const boardQuery = useQuery({
    queryKey: queryKeys.issues(workspaceId, { ...query, board: true }),
    queryFn: () =>
      api.get<IssueListResponse>(
        `/workspaces/${workspaceId}/issues${buildQuery({ ...query, limit: 200, group: 'none' } as never)}`,
      ),
    enabled: Boolean(workspaceId),
    placeholderData: (previous) => previous,
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

  const issues = boardQuery.data?.items ?? [];
  const columns = useMemo(() => buildColumns(issues), [issues]);
  const total = boardQuery.data?.total ?? 0;

  // Realtime: another tab moving an issue updates this board.
  useEffect(() => {
    return subscribe((event) => {
      if (event.workspaceId !== workspaceId) return;
      if (event.type.startsWith('issue.') || event.type.startsWith('comment.')) {
        void queryClient.invalidateQueries({ queryKey: ['issues'] });
      }
    });
  }, [subscribe, workspaceId, queryClient]);

  const patchCache = useCallback(
    (mutate: (columns: Columns) => Columns) => {
      // Snapshot first so a failed request can restore the exact previous order.
      const snapshot = queryClient.getQueriesData<IssueListResponse>({ queryKey: ['issues'] });
      queryClient.setQueriesData<IssueListResponse>({ queryKey: ['issues'] }, (current) => {
        if (!current || !Array.isArray(current.items)) return current;
        const next = mutate(buildColumns(current.items));
        const flat = ISSUE_STATUSES.flatMap((status) => next[status] ?? []);
        return { ...current, items: flat };
      });
      return snapshot;
    },
    [queryClient],
  );

  const moveMutation = useMutation({
    mutationFn: ({
      issueId,
      status,
      position,
    }: {
      issueId: string;
      status: string;
      position: number;
      previousStatus: string;
      snapshot: ReturnType<typeof queryClient.getQueriesData<IssueListResponse>>;
    }) =>
      api.post<{ issue: Issue }>(`/workspaces/${workspaceId}/issues/${issueId}/move`, {
        status,
        position,
      }),
    onError: (error, variables) => {
      // Error rollback: restore the cache snapshot, then re-sync with the server.
      for (const [key, value] of variables.snapshot) queryClient.setQueryData(key, value);
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      toast.error(
        'Could not move the issue',
        error instanceof ApiError
          ? `${error.message} — restored to ${variables.previousStatus.replace(/_/g, ' ')}`
          : 'The board was restored',
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  /** Computes the insertion index from the card the pointer is over. */
  const computePosition = (targetStatus: string, overIssueId: string | null, movingId: string) => {
    const column = (columns[targetStatus] ?? []).filter((issue) => issue.id !== movingId);
    if (!overIssueId) return column.length;
    const index = column.findIndex((issue) => issue.id === overIssueId);
    return index === -1 ? column.length : index;
  };

  const performMove = (issueId: string, targetStatus: string, overIssueId: string | null) => {
    const issue = issues.find((entry) => entry.id === issueId);
    if (!issue || !canEditIssues) return;

    const position = computePosition(targetStatus, overIssueId, issueId);
    const currentIndex = (columns[issue.status] ?? []).findIndex((entry) => entry.id === issueId);
    if (issue.status === targetStatus && currentIndex === position) return;

    const snapshot = patchCache((current) => {
      for (const status of ISSUE_STATUSES) {
        current[status] = (current[status] ?? []).filter((entry) => entry.id !== issueId);
      }
      const moved: Issue = { ...issue, status: targetStatus };
      const list = [...(current[targetStatus] ?? [])];
      list.splice(Math.max(0, Math.min(position, list.length)), 0, moved);
      current[targetStatus] = list;
      return current;
    });

    moveMutation.mutate({
      issueId,
      status: targetStatus,
      position,
      previousStatus: issue.status,
      snapshot,
    });
  };

  const onDrop = (event: React.DragEvent, targetStatus: string) => {
    event.preventDefault();
    dragCounter.current = 0;
    const issueId = event.dataTransfer.getData(DRAG_MIME) || draggingId;
    const overCard = (event.target as HTMLElement).closest('[data-issue-id]');
    const overIssueId =
      overCard && overCard.getAttribute('data-issue-id') !== issueId
        ? overCard.getAttribute('data-issue-id')
        : null;
    setDraggingId(null);
    setOverStatus(null);
    if (issueId) performMove(issueId, targetStatus, overIssueId);
  };

  const toggleSelect = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Board"
        onCreateIssue={() => {
          setComposerStatus('todo');
          setComposerOpen(true);
        }}
        onOpenSearch={() => update({ q: state.q })}
        filters={
          <>
            <div className="relative w-48">
              <Input
                value={state.q}
                onChange={(event) => update({ q: event.target.value })}
                placeholder="Filter cards…"
                aria-label="Filter cards"
                data-testid="board-search"
              />
            </div>
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
              width={240}
            />
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            )}
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', boardQuery.isFetching && 'animate-spin')} />}
              onClick={() => void boardQuery.refetch()}
            >
              Refresh
            </Button>
            {moveMutation.isPending && <Spinner className="h-3.5 w-3.5" data-testid="board-saving" />}
          </>
        }
      />

      <div className="flex items-center gap-3 border-b border-line px-3 py-1.5 text-2xs text-subtle">
        <span data-testid="board-count">{total} issues</span>
        {!canEditIssues && (
          <span className="rounded border border-line px-1.5 py-0.5" data-testid="board-readonly">
            Read-only — your role cannot move issues
          </span>
        )}
        <span className="ml-auto">Drag a card between columns · ⌘/Ctrl-click to multi-select</span>
      </div>

      {boardQuery.isLoading ? (
        <BoardSkeleton columns={4} />
      ) : boardQuery.isError ? (
        <ErrorState
          title="Could not load the board"
          error={boardQuery.error}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : issues.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Nothing on the board yet"
          description="Create an issue or clear the filters to see the workflow columns."
          action={
            <Button size="sm" variant="primary" onClick={() => setComposerOpen(true)}>
              Create issue
            </Button>
          }
        />
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full min-h-0 gap-3 p-3">
            {ISSUE_STATUSES.map((status) => {
              const columnIssues = columns[status] ?? [];
              const isOver = overStatus === status;
              return (
                <section
                  key={status}
                  data-testid={`board-column-${status}`}
                  data-status={status}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    dragCounter.current += 1;
                    setOverStatus(status);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDragLeave={() => {
                    dragCounter.current = Math.max(0, dragCounter.current - 1);
                    if (dragCounter.current === 0) setOverStatus(null);
                  }}
                  onDrop={(event) => onDrop(event, status)}
                  className={cn(
                    'flex h-full w-[19rem] shrink-0 flex-col rounded-xl border bg-sunken/40 transition-colors',
                    isOver ? 'border-accent/60 bg-accent/5' : 'border-line',
                  )}
                  aria-label={`${ISSUE_STATUS_LABELS[status]} column`}
                >
                  <header className="flex items-center gap-2 px-3 py-2">
                    <StatusIcon status={status} className="h-3.5 w-3.5" />
                    <h2 className="text-xs font-semibold text-fg">{ISSUE_STATUS_LABELS[status]}</h2>
                    <span
                      className="rounded-full bg-selected px-1.5 text-2xs text-muted"
                      data-testid={`board-column-count-${status}`}
                    >
                      {columnIssues.length}
                    </span>
                    {columnIssues.length > 0 && (
                      <span className="text-2xs text-subtle">
                        {columnIssues.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0)} pts
                      </span>
                    )}
                    {canEditIssues && (
                      <button
                        type="button"
                        aria-label={`Add issue to ${ISSUE_STATUS_LABELS[status]}`}
                        onClick={() => {
                          setComposerStatus(status);
                          setComposerOpen(true);
                        }}
                        className="ml-auto rounded p-0.5 text-subtle transition-colors hover:bg-hover hover:text-fg"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </header>

                  <div
                    className="flex min-h-[3rem] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3"
                    data-testid={`board-column-body-${status}`}
                    data-column-body={status}
                  >
                    {columnIssues.map((issue) => (
                      <div
                        key={issue.id}
                        draggable={canEditIssues}
                        data-testid={`board-card-${issue.identifier}`}
                        data-issue-id={issue.id}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(DRAG_MIME, issue.id);
                          event.dataTransfer.setData('text/plain', issue.identifier);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggingId(issue.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setOverStatus(null);
                          dragCounter.current = 0;
                        }}
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey) {
                            toggleSelect(issue.id);
                            return;
                          }
                          navigate(`/issues/${issue.identifier}`);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') navigate(`/issues/${issue.identifier}`);
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${issue.identifier} ${issue.title}`}
                        className={cn(
                          'relative cursor-grab active:cursor-grabbing',
                          draggingId === issue.id && 'opacity-50',
                        )}
                      >
                        <IssueRow
                          issue={issue}
                          selected={selected.includes(issue.id)}
                          focused={false}
                          onToggle={(id) => toggleSelect(id)}
                          onFocus={() => undefined}
                          variant="card"
                          dragging={draggingId === issue.id}
                        />
                        {selected.includes(issue.id) && (
                          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" aria-hidden />
                        )}
                      </div>
                    ))}
                    {columnIssues.length === 0 && (
                      <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-2xs text-subtle">
                        Drop issues here
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <BulkActionsBar
        selectedIds={selected}
        onClear={() => setSelected([])}
        onUpdated={() => void boardQuery.refetch()}
      />

      <IssueComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        defaultStatus={composerStatus}
      />
    </div>
  );
}
