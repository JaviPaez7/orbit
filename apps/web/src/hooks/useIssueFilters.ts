import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { IssueQuery } from '@orbit/shared';

export interface IssueFilterState {
  q: string;
  status: string[];
  priority: string[];
  assigneeId: string[];
  projectId: string[];
  cycleId: string[];
  labelId: string[];
  sort: string;
  direction: 'asc' | 'desc';
  group: string;
}

const DEFAULTS: IssueFilterState = {
  q: '',
  status: [],
  priority: [],
  assigneeId: [],
  projectId: [],
  cycleId: [],
  labelId: [],
  sort: 'updatedAt',
  direction: 'desc',
  group: 'status',
};

/** Comma-joined list params keep the URL short and shareable. */
function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Issue filters persisted in the URL so any view is shareable and the browser
 * back button behaves. `projectId` may be fixed by the page (project detail).
 */
export function useIssueFilters(fixed?: Partial<IssueFilterState>) {
  const [params, setParams] = useSearchParams();

  const state = useMemo<IssueFilterState>(() => {
    const merged: IssueFilterState = { ...DEFAULTS };
    const target = merged as unknown as Record<string, unknown>;
    for (const key of Object.keys(DEFAULTS) as (keyof IssueFilterState)[]) {
      const raw = params.get(key);
      if (raw === null) continue;
      if (Array.isArray(DEFAULTS[key])) {
        target[key] = parseList(raw);
      } else if (key === 'direction') {
        merged.direction = raw === 'asc' ? 'asc' : 'desc';
      } else {
        target[key] = raw;
      }
    }
    return { ...merged, ...fixed };
  }, [params, fixed]);

  const update = (patch: Partial<IssueFilterState>, options: { replace?: boolean } = {}) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (Array.isArray(value)) {
            if (value.length === 0) next.delete(key);
            else next.set(key, value.join(','));
          } else if (value === '' || value === null || value === undefined) {
            next.delete(key);
          } else {
            next.set(key, String(value));
          }
        }
        return next;
      },
      { replace: options.replace ?? true },
    );
  };

  const toggleInList = (
    key: 'status' | 'priority' | 'assigneeId' | 'projectId' | 'cycleId' | 'labelId',
    value: string,
  ) => {
    const current = state[key];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    update({ [key]: next } as Partial<IssueFilterState>);
  };

  const clearAll = () => {
    const next = new URLSearchParams();
    setParams(next, { replace: true });
  };

  const activeCount =
    state.status.length +
    state.priority.length +
    state.assigneeId.length +
    (fixed?.projectId ? 0 : state.projectId.length) +
    state.cycleId.length +
    state.labelId.length +
    (state.q ? 1 : 0);

  /** Shape sent to the API (arrays + pagination). */
  const query: Partial<IssueQuery> & { limit: number; offset: number } = useMemo(
    () => ({
      q: state.q || undefined,
      status: (state.status.length ? state.status : undefined) as never,
      priority: (state.priority.length ? state.priority : undefined) as never,
      assigneeId: (state.assigneeId.length ? state.assigneeId : undefined) as never,
      projectId: (state.projectId.length ? state.projectId : undefined) as never,
      cycleId: (state.cycleId.length ? state.cycleId : undefined) as never,
      labelId: state.labelId.length ? state.labelId : undefined,
      sort: state.sort as never,
      direction: state.direction,
      group: state.group as never,
      limit: 100,
      offset: 0,
    }),
    [state],
  );

  return { state, update, toggleInList, clearAll, activeCount, query };
}

export const ISSUE_SORT_OPTIONS = [
  { value: 'updatedAt', label: 'Last updated' },
  { value: 'createdAt', label: 'Created date' },
  { value: 'priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'title', label: 'Title' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'status', label: 'Status' },
];

export const ISSUE_GROUP_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'project', label: 'Project' },
  { value: 'cycle', label: 'Cycle' },
  { value: 'label', label: 'Label' },
  { value: 'none', label: 'No grouping' },
];
