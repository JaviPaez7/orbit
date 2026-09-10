import { Link } from 'react-router-dom';
import { useIssueComposer } from '../context/IssueComposerContext';
import { useQuery } from '@tanstack/react-query';
import { ListChecks, UserCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import type { Issue } from '../lib/types';
import { Header } from '../components/layout/Header';
import { IssueRow } from '../components/issues/IssueRow';
import { IssueListSkeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { StatusIcon } from '../components/ui/Icons';

/** Everything assigned to or created by the current user, grouped by status. */
export default function MyIssuesPage() {
  const { openComposer, openSearch } = useIssueComposer();
  const { workspace, user } = useAuth();
  const workspaceId = workspace?.id ?? '';

  const query = useQuery({
    queryKey: [...queryKeys.issues(workspaceId, { mine: user?.id }), 'my-issues'],
    queryFn: () => api.get<{ issues: Issue[] }>(`/workspaces/${workspaceId}/my-issues`),
    enabled: Boolean(workspaceId),
  });

  const issues = query.data?.issues ?? [];
  const assigned = issues.filter((issue) => issue.assigneeId === user?.id);
  const created = issues.filter((issue) => issue.creatorId === user?.id && issue.assigneeId !== user?.id);
  const openAssigned = assigned.filter((issue) => issue.status !== 'done' && issue.status !== 'cancelled');

  const groups = [
    { title: 'Assigned to you', issues: assigned, icon: <UserCircle2 className="h-3.5 w-3.5" /> },
    { title: 'Created by you', issues: created, icon: <ListChecks className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex h-full flex-col">
      <Header
        title="My issues"
        crumbs={[{ label: 'My issues' }]}
        onCreateIssue={() => openComposer()}
        onOpenSearch={openSearch}
        showPresence={false}
        filters={
          <span className="text-2xs text-subtle">
            {openAssigned.length} open assigned · {assigned.length} total assigned · {created.length} reported
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {query.isLoading && <IssueListSkeleton rows={8} />}
        {query.isError && (
          <ErrorState title="Could not load your issues" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {!query.isLoading && !query.isError && issues.length === 0 && (
          <EmptyState
            icon={UserCircle2}
            title="Nothing assigned to you"
            description="Issues you are assigned to or report will show up here."
            action={
              <Link to="/issues" className="btn btn-secondary btn-sm">
                Browse all issues
              </Link>
            }
          />
        )}

        {groups.map((group) =>
          group.issues.length === 0 ? null : (
            <section key={group.title}>
              <header className="flex items-center gap-2 border-b border-line bg-sunken/70 px-3 py-1.5">
                <span className="text-subtle">{group.icon}</span>
                <h2 className="text-xs font-medium text-fg">{group.title}</h2>
                <span className="text-2xs text-subtle">{group.issues.length}</span>
              </header>
              {group.issues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  selected={false}
                  focused={false}
                  onToggle={() => undefined}
                  onFocus={() => undefined}
                  selectable={false}
                />
              ))}
            </section>
          ),
        )}

        {!query.isLoading && issues.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 text-2xs text-subtle">
            <StatusIcon status="in_progress" className="h-3.5 w-3.5" />
            <span>
              Tip: press <span className="kbd">/</span> to search, or <span className="kbd">C</span> to create
              an issue.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
