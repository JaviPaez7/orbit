import { useEffect, useMemo, useRef, useState } from 'react';
import { useIssueComposer } from '../context/IssueComposerContext';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Box, Hash, Repeat, Search, Tag, UserCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, buildQuery } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { cn } from '../lib/utils';
import type { Issue, SearchResult } from '../lib/types';
import { Header } from '../components/layout/Header';
import { Avatar } from '../components/ui/Avatar';
import { StatusIcon } from '../components/ui/Icons';
import { EmptyState, ErrorState } from '../components/ui/States';
import { Skeleton } from '../components/ui/Skeleton';

const TYPE_LABELS: Record<SearchResult['type'], string> = {
  issue: 'Issues',
  project: 'Projects',
  user: 'People',
  cycle: 'Cycles',
  label: 'Labels',
};

const TYPE_ICONS: Record<SearchResult['type'], React.ReactNode> = {
  issue: <StatusIcon status="todo" className="h-4 w-4" />,
  project: <Box className="h-4 w-4" />,
  user: <UserCircle2 className="h-4 w-4" />,
  cycle: <Repeat className="h-4 w-4" />,
  label: <Tag className="h-4 w-4" />,
};

/**
 * Full-page search. The header input is debounced (200ms) and each keystroke
 * cancels the previous request via React Query keys.
 */
export default function SearchPage() {
  const { openComposer, openSearch } = useIssueComposer();
  const { workspace } = useAuth();
  const navigate = useNavigate();
  const workspaceId = workspace?.id ?? '';
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [types, setTypes] = useState<SearchResult['type'][]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (debounced.length === 0) {
      // Show recently updated issues as a starting point.
      inputRef.current?.focus();
    }
  }, [debounced]);

  const resultsQuery = useQuery({
    queryKey: queryKeys.search(workspaceId, `${debounced}|${types.join(',')}`),
    queryFn: () =>
      api.get<{ results: SearchResult[] }>(
        `/workspaces/${workspaceId}/search${buildQuery({
          q: debounced,
          limit: 20,
          types: types.length > 0 ? types : undefined,
        })}`,
      ),
    enabled: Boolean(workspaceId) && debounced.length > 0,
  });

  const recentQuery = useQuery({
    queryKey: queryKeys.issues(workspaceId, { recent: true }),
    queryFn: () =>
      api.get<{ items: Issue[] }>(
        `/workspaces/${workspaceId}/issues${buildQuery({ limit: 10, sort: 'updatedAt' })}`,
      ),
    enabled: Boolean(workspaceId) && debounced.length === 0,
    select: (data) => data.items,
  });

  const grouped = useMemo(() => {
    const results = resultsQuery.data?.results ?? [];
    const map = new Map<SearchResult['type'], SearchResult[]>();
    for (const result of results) {
      const list = map.get(result.type) ?? [];
      list.push(result);
      map.set(result.type, list);
    }
    return map;
  }, [resultsQuery.data]);

  const totalResults = resultsQuery.data?.results.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Search"
        crumbs={[{ label: 'Search' }]}
        onCreateIssue={() => undefined}
        onOpenSearch={() => inputRef.current?.focus()}
        showPresence={false}
      />

      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 focus-within:border-accent">
          <Search className="h-4 w-4 shrink-0 text-subtle" />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search issues, projects, people, cycles and labels…"
            aria-label="Search"
            data-testid="global-search"
            className="w-full bg-transparent text-base outline-none placeholder:text-subtle"
            autoFocus
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              className="text-2xs text-subtle transition-colors hover:text-fg"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(Object.keys(TYPE_LABELS) as SearchResult['type'][]).map((type) => {
            const active = types.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() =>
                  setTypes((current) =>
                    current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type],
                  )
                }
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs transition-colors',
                  active ? 'border-accent text-fg' : 'border-line text-muted hover:text-fg',
                )}
              >
                {TYPE_LABELS[type]}
              </button>
            );
          })}
          {types.length > 0 && (
            <button type="button" onClick={() => setTypes([])} className="text-2xs text-accent hover:underline">
              Reset
            </button>
          )}
          {debounced.length > 0 && (
            <span className="ml-auto text-2xs text-subtle">
              {resultsQuery.isFetching ? 'Searching…' : `${totalResults} result${totalResults === 1 ? '' : 's'}`}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {debounced.length === 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
              Recently updated
            </h2>
            {recentQuery.isLoading && <Skeleton className="h-40" />}
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {(recentQuery.data ?? []).map((issue) => (
                <li key={issue.id}>
                  <Link
                    to={`/issues/${issue.identifier}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-hover"
                  >
                    <StatusIcon status={issue.status} className="h-3.5 w-3.5" />
                    <span className="font-mono text-2xs text-subtle">{issue.identifier}</span>
                    <span className="min-w-0 flex-1 truncate text-fg">{issue.title}</span>
                    {issue.project && (
                      <span className="hidden text-2xs text-subtle sm:inline">{issue.project.name}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-2xs text-subtle">
              Tip: search accepts identifiers like <span className="kbd">ORB-12</span>, project names, and
              @handles.
            </p>
          </div>
        )}

        {debounced.length > 0 && resultsQuery.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        )}

        {debounced.length > 0 && resultsQuery.isError && (
          <ErrorState
            title="Search failed"
            error={resultsQuery.error}
            onRetry={() => void resultsQuery.refetch()}
          />
        )}

        {debounced.length > 0 && !resultsQuery.isLoading && totalResults === 0 && (
          <EmptyState
            icon={Search}
            title={`No results for “${debounced}”`}
            description="Try a shorter term, a different spelling, or clear the type filters."
          />
        )}

        {[...grouped.entries()].map(([type, results]) => (
          <section key={type} className="mb-5">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              <Hash className="h-3 w-3" />
              {TYPE_LABELS[type]} <span className="text-subtle">({results.length})</span>
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {results.map((result) => (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    type="button"
                    onClick={() => navigate(result.url)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-hover"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-subtle">
                      {result.type === 'project' ? (
                        <span
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: String(result.meta?.color ?? '#6366f1') }}
                        />
                      ) : result.type === 'user' ? (
                        <Avatar
                          name={result.title}
                          src={(result.meta?.avatarUrl as string | null) ?? null}
                          size="xs"
                        />
                      ) : result.type === 'issue' ? (
                        <StatusIcon status={String(result.meta?.status ?? 'todo')} className="h-3.5 w-3.5" />
                      ) : (
                        TYPE_ICONS[result.type]
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{result.title}</span>
                    {result.subtitle && (
                      <span className="hidden max-w-[14rem] truncate text-2xs text-subtle sm:inline">
                        {result.subtitle}
                      </span>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
