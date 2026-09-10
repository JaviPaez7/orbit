import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Copy,
  GitBranch,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Send,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ESTIMATE_OPTIONS,
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_RELATION_LABELS,
  ISSUE_RELATION_TYPES,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  type IssueRelationType,
} from '@orbit/shared';
import { useAuth, usePermissions } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { ApiError, api, apiUpload } from '../lib/api';
import { queryKeys } from '../lib/query-client';
import { cn, formatDateTime, formatBytes, relativeTime, renderMarkdown, toDateInput } from '../lib/utils';
import type { Activity, Cycle, Issue, Label, Project } from '../lib/types';
import type { Comment } from '../lib/types';
import { Header } from '../components/layout/Header';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Field';
import { StatusIcon, PriorityIcon } from '../components/ui/Icons';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../components/ui/Menu';
import { Modal } from '../components/ui/Modal';
import { Select, MultiSelect } from '../components/ui/Select';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/States';
import { Tooltip } from '../components/ui/Tooltip';
import { useToast } from '../components/ui/Toast';
import { useIssueCrumb } from '../components/layout/Header';

export default function IssueDetailPage({ identifier }: { identifier: string }) {
  const { workspace, user } = useAuth();
  const { canEditIssues, canDeleteIssues, canComment } = usePermissions();
  const { subscribe } = useRealtime();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const workspaceId = workspace?.id ?? '';

  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState('');
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [relationModalOpen, setRelationModalOpen] = useState(false);
  const [relationTarget, setRelationTarget] = useState('');
  const [relationType, setRelationType] = useState<IssueRelationType>('related');
  const commentBoxRef = useRef<HTMLTextAreaElement>(null);

  const issueQuery = useQuery({
    queryKey: queryKeys.issue(workspaceId, identifier),
    queryFn: () =>
      api.get<{ issue: Issue; role: string; permissions: Record<string, boolean> }>(
        `/workspaces/${workspaceId}/issues/by-identifier/${identifier}`,
      ),
    enabled: Boolean(workspaceId && identifier),
  });

  const issue = issueQuery.data?.issue;

  // A second fetch (by id) provides the detail-only relations/children payload.
  const detailQuery = useQuery({
    queryKey: queryKeys.issue(workspaceId, issue?.id ?? 'pending'),
    queryFn: () =>
      api.get<{ issue: Issue }>(`/workspaces/${workspaceId}/issues/${issue!.id}`),
    enabled: Boolean(workspaceId && issue?.id),
    staleTime: 5000,
  });

  const detail = detailQuery.data?.issue ?? issue;

  const commentsQuery = useQuery({
    queryKey: queryKeys.comments(workspaceId, detail?.id ?? 'pending'),
    queryFn: () => api.get<{ comments: Comment[] }>(`/workspaces/${workspaceId}/issues/${detail!.id}/comments`),
    enabled: Boolean(workspaceId && detail?.id),
  });

  const activityQuery = useQuery({
    queryKey: queryKeys.activity(workspaceId, detail?.id ?? 'pending'),
    queryFn: () => api.get<{ activity: Activity[] }>(`/workspaces/${workspaceId}/issues/${detail!.id}/activity`),
    enabled: Boolean(workspaceId && detail?.id),
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

  useEffect(() => {
    if (detail) {
      setTitleDraft(detail.title);
      setDescriptionDraft(detail.description ?? '');
    }
  }, [detail?.id, detail?.title, detail?.description, detail]);

  // Realtime: refresh this issue when anyone touches it.
  useEffect(() => {
    return subscribe((event) => {
      if (event.workspaceId !== workspaceId) return;
      const payload = event.payload as { issue?: Issue; issueId?: string };
      if (event.type === 'comment.created' && payload.issueId === detail?.id) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.comments(workspaceId, detail!.id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.activity(workspaceId, detail!.id) });
      }
      if (event.type.startsWith('issue.')) {
        const relevant =
          !payload.issueId ||
          payload.issueId === detail?.id ||
          payload.issue?.identifier === identifier;
        if (relevant) {
          void queryClient.invalidateQueries({ queryKey: ['issue'] });
          void queryClient.invalidateQueries({ queryKey: ['activity'] });
        }
      }
    });
  }, [subscribe, workspaceId, detail?.id, identifier, queryClient]);

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch<{ issue: Issue }>(`/workspaces/${workspaceId}/issues/${detail!.id}`, payload),
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ['issue'] });
      toast.error('Could not save the change', error instanceof ApiError ? error.message : undefined);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['issue'] });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspaceId}/issues/${detail!.id}`),
    onSuccess: () => {
      toast.success('Issue deleted');
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      navigate('/issues');
    },
    onError: (error) =>
      toast.error('Delete failed', error instanceof ApiError ? error.message : undefined),
  });

  const duplicateMutation = useMutation({
    mutationFn: () =>
      api.post<{ issue: Issue }>(`/workspaces/${workspaceId}/issues/${detail!.id}/duplicate`),
    onSuccess: (data) => {
      toast.success(`Created ${data.issue.identifier}`, data.issue.title, {
        label: 'Open',
        onClick: () => navigate(`/issues/${data.issue.identifier}`),
      });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      api.post(`/workspaces/${workspaceId}/issues/${detail!.id}/comments`, { body }),
    onSuccess: () => {
      setCommentDraft('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(workspaceId, detail!.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity(workspaceId, detail!.id) });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
    onError: (error) =>
      toast.error('Could not post the comment', error instanceof ApiError ? error.message : undefined),
  });

  const commentEditMutation = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      api.patch(`/workspaces/${workspaceId}/comments/${commentId}`, { body }),
    onSuccess: () => {
      setEditingCommentId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(workspaceId, detail!.id) });
    },
    onError: (error) =>
      toast.error('Could not edit the comment', error instanceof ApiError ? error.message : undefined),
  });

  const commentDeleteMutation = useMutation({
    mutationFn: (commentId: string) => api.delete(`/workspaces/${workspaceId}/comments/${commentId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(workspaceId, detail!.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity(workspaceId, detail!.id) });
    },
    onError: (error) =>
      toast.error('Could not delete the comment', error instanceof ApiError ? error.message : undefined),
  });

  const relationMutation = useMutation({
    mutationFn: () =>
      api.post(`/workspaces/${workspaceId}/issues/${detail!.id}/relations`, {
        relatedIssueId: relationTarget,
        type: relationType,
      }),
    onSuccess: () => {
      setRelationModalOpen(false);
      setRelationTarget('');
      void queryClient.invalidateQueries({ queryKey: ['issue'] });
      toast.success('Issue linked');
    },
    onError: (error) =>
      toast.error('Could not link the issue', error instanceof ApiError ? error.message : undefined),
  });

  const relationDeleteMutation = useMutation({
    mutationFn: (relationId: string) =>
      api.delete(`/workspaces/${workspaceId}/relations/${relationId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['issue'] }),
  });

  const attachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await apiUpload<{ url: string }>(`/workspaces/${workspaceId}/uploads`, file);
      return api.post(`/workspaces/${workspaceId}/issues/${detail!.id}/attachments`, {
        filename: file.name,
        url: uploaded.url,
        mimeType: file.type,
        size: file.size,
      });
    },
    onSuccess: () => {
      toast.success('Attachment added');
      void queryClient.invalidateQueries({ queryKey: ['issue'] });
    },
    onError: (error) =>
      toast.error('Upload failed', error instanceof ApiError ? error.message : undefined),
  });

  const attachmentDeleteMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete(`/workspaces/${workspaceId}/attachments/${attachmentId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['issue'] }),
  });

  // Keyboard: E edits the title, M focuses the comment box.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.key === 'e') {
        event.preventDefault();
        document.getElementById('issue-title-input')?.focus();
      }
      if (event.key === 'm') {
        event.preventDefault();
        commentBoxRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const crumbs = useIssueCrumb(detail, workspaceId);

  const relations = useMemo(() => {
    if (!detail) return [];
    const out: { id: string; type: string; issue: { id: string; identifier: string; title: string } }[] = [];
    for (const relation of detail.relationsFrom ?? []) {
      out.push({ id: relation.id, type: relation.type, issue: relation.relatedIssue });
    }
    for (const relation of detail.relationsTo ?? []) {
      out.push({ id: relation.id, type: relation.type, issue: relation.issue });
    }
    return out;
  }, [detail]);

  if (issueQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-2/3" />
        <SkeletonText lines={6} />
      </div>
    );
  }

  if (issueQuery.isError || !detail) {
    return (
      <div className="p-6">
        <ErrorState
          title={`Could not load ${identifier}`}
          description={
            issueQuery.error instanceof ApiError
              ? issueQuery.error.message
              : 'The issue may have been deleted or belongs to another workspace.'
          }
          onRetry={() => void issueQuery.refetch()}
        />
        <div className="mt-4 text-center">
          <Link to="/issues" className="link text-xs">
            Back to all issues
          </Link>
        </div>
      </div>
    );
  }

  const commentCount = commentsQuery.data?.comments.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <Header
        crumbs={crumbs}
        title={detail.identifier}
        onCreateIssue={() => undefined}
        onOpenSearch={() => undefined}
        showPresence={false}
      />

      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row">
        {/* Main column */}
        <div className="min-w-0 flex-1 px-4 py-5 lg:px-8">
          <div className="mb-3 flex items-center gap-2 text-2xs text-subtle">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-hover hover:text-fg"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
            <span>·</span>
            <span>Created {relativeTime(detail.createdAt)}</span>
            <span>·</span>
            <span>Updated {relativeTime(detail.updatedAt)}</span>
          </div>

          <div className="flex items-start gap-3">
            <StatusIcon status={detail.status} className="mt-1.5 h-4 w-4" />
            <input
              id="issue-title-input"
              value={titleDraft}
              readOnly={!canEditIssues}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                if (!canEditIssues) return;
                const next = titleDraft.trim();
                if (next && next !== detail.title) updateMutation.mutate({ title: next });
                else setTitleDraft(detail.title);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  (event.target as HTMLInputElement).blur();
                }
                if (event.key === 'Escape') setTitleDraft(detail.title);
              }}
              className="w-full border-0 bg-transparent text-2xl font-semibold tracking-tight text-fg outline-none focus:bg-hover/40 focus:px-1.5 focus:rounded-lg"
              aria-label="Issue title"
              data-testid="issue-detail-title"
            />
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">Description</h2>
              {canEditIssues && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={editingDescription ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  onClick={() => {
                    if (editingDescription && descriptionDraft !== (detail.description ?? '')) {
                      updateMutation.mutate({ description: descriptionDraft || null });
                    }
                    setEditingDescription((value) => !value);
                  }}
                >
                  {editingDescription ? 'Done' : 'Edit'}
                </Button>
              )}
            </div>

            {editingDescription ? (
              <div className="space-y-2">
                <Textarea
                  value={descriptionDraft}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  rows={12}
                  placeholder="Add context, acceptance criteria, links… Markdown is supported."
                  data-testid="issue-description"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={updateMutation.isPending}
                    onClick={() => {
                      updateMutation.mutate({ description: descriptionDraft || null });
                      setEditingDescription(false);
                    }}
                  >
                    Save description
                  </Button>
                  <span className="text-2xs text-subtle">
                    Autosaves when you press “Done” as well.
                  </span>
                </div>
              </div>
            ) : detail.description ? (
              <div
                className="prose-orbit rounded-lg border border-line bg-surface p-3"
                data-testid="issue-description-rendered"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(detail.description) }}
              />
            ) : (
              <button
                type="button"
                disabled={!canEditIssues}
                onClick={() => setEditingDescription(true)}
                className="w-full rounded-lg border border-dashed border-line px-3 py-6 text-left text-xs text-subtle transition-colors hover:border-line-strong hover:text-muted disabled:cursor-not-allowed"
              >
                Add a description…
              </button>
            )}
          </div>

          {/* Sub-issues */}
          <section className="mt-8">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">
                Sub-issues
              </h2>
              <span className="text-2xs text-subtle">{detail.children?.length ?? 0}</span>
            </div>
            {detail.children && detail.children.length > 0 ? (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {detail.children.map((child) => (
                  <li key={child.id}>
                    <Link
                      to={`/issues/${child.identifier}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-hover"
                    >
                      <StatusIcon status={child.status} className="h-3.5 w-3.5" />
                      <PriorityIcon priority={child.priority} className="h-3.5 w-3.5" />
                      <span className="font-mono text-2xs text-subtle">{child.identifier}</span>
                      <span className="min-w-0 flex-1 truncate text-fg">{child.title}</span>
                      {child.assignee && (
                        <Avatar name={child.assignee.name} src={child.assignee.avatarUrl} size="sm" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-subtle">
                No sub-issues. Break this issue down from the parent picker in the sidebar.
              </p>
            )}
          </section>

          {/* Related issues */}
          <section className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">
                Related issues
              </h2>
              {canEditIssues && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Link2 className="h-3.5 w-3.5" />}
                  onClick={() => setRelationModalOpen(true)}
                >
                  Link issue
                </Button>
              )}
            </div>
            {relations.length > 0 ? (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {relations.map((relation) => (
                  <li key={relation.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="chip shrink-0">
                      {ISSUE_RELATION_LABELS[relation.type as IssueRelationType] ?? relation.type}
                    </span>
                    <Link
                      to={`/issues/${relation.issue.identifier}`}
                      className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:text-accent"
                    >
                      <span className="font-mono text-2xs text-subtle">{relation.issue.identifier}</span>
                      <span className="truncate">{relation.issue.title}</span>
                    </Link>
                    {canEditIssues && (
                      <button
                        type="button"
                        aria-label="Remove link"
                        onClick={() => relationDeleteMutation.mutate(relation.id)}
                        className="btn btn-ghost btn-icon-sm"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-subtle">
                Nothing linked yet.
              </p>
            )}
          </section>

          {/* Attachments */}
          <section className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">
                Attachments
              </h2>
              {canEditIssues && (
                <label className="btn btn-ghost btn-sm cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                  <input
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) attachmentMutation.mutate(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            {detail.attachments && detail.attachments.length > 0 ? (
              <ul className="space-y-1.5">
                {detail.attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-subtle" />
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-xs text-fg hover:text-accent"
                    >
                      {attachment.filename}
                    </a>
                    <span className="text-2xs text-subtle">{formatBytes(attachment.size)}</span>
                    {canEditIssues && (
                      <button
                        type="button"
                        aria-label={`Remove ${attachment.filename}`}
                        onClick={() => attachmentDeleteMutation.mutate(attachment.id)}
                        className="btn btn-ghost btn-icon-sm"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-subtle">
                No attachments.
              </p>
            )}
          </section>

          {/* Comments */}
          <section className="mt-8">
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-subtle">
              <MessageSquare className="h-3.5 w-3.5" /> Comments
              <span className="text-2xs">{commentCount}</span>
            </h2>

            <div className="space-y-3">
              {commentsQuery.isLoading && <SkeletonText lines={3} />}
              {(commentsQuery.data?.comments ?? []).map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  canEdit={comment.authorId === user?.id}
                  canModerate={canComment}
                  editing={editingCommentId === comment.id}
                  draft={commentEditDraft}
                  onDraftChange={setCommentEditDraft}
                  onStartEdit={() => {
                    setEditingCommentId(comment.id);
                    setCommentEditDraft(comment.body);
                  }}
                  onCancelEdit={() => setEditingCommentId(null)}
                  onSaveEdit={() =>
                    commentEditMutation.mutate({ commentId: comment.id, body: commentEditDraft })
                  }
                  onDelete={() => commentDeleteMutation.mutate(comment.id)}
                  saving={commentEditMutation.isPending}
                />
              ))}
              {commentCount === 0 && !commentsQuery.isLoading && (
                <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-subtle">
                  No comments yet — start the discussion.
                </p>
              )}
            </div>

            {canComment ? (
              <div className="mt-4 rounded-lg border border-line bg-surface p-3">
                <Textarea
                  ref={commentBoxRef}
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Write a comment… Use @handle to mention a teammate."
                  rows={4}
                  aria-label="New comment"
                  data-testid="comment-input"
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && commentDraft.trim()) {
                      commentMutation.mutate(commentDraft.trim());
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-2xs text-subtle">
                    Markdown supported · <span className="kbd">⌘</span>
                    <span className="kbd">↵</span> to send
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Send className="h-3.5 w-3.5" />}
                    loading={commentMutation.isPending}
                    disabled={!commentDraft.trim()}
                    onClick={() => commentMutation.mutate(commentDraft.trim())}
                    data-testid="comment-submit"
                  >
                    Comment
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-muted">
                Your role does not allow commenting in this workspace.
              </p>
            )}
          </section>

          {/* Activity */}
          <section className="mt-8 pb-16">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">
              Activity
            </h2>
            {activityQuery.isLoading && <SkeletonText lines={4} />}
            <ol className="space-y-3" data-testid="activity-feed">
              {(activityQuery.data?.activity ?? []).map((entry) => (
                <li key={entry.id} className="flex items-start gap-2.5">
                  {entry.actor ? (
                    <Avatar name={entry.actor.name} src={entry.actor.avatarUrl} size="sm" />
                  ) : (
                    <span className="h-5 w-5 shrink-0 rounded-full bg-selected" />
                  )}
                  <div className="min-w-0">
                    <p
                      className="text-xs text-muted [&_strong]:font-medium [&_strong]:text-fg"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(entry.description).replace(/<\/?p>/g, ''),
                      }}
                    />
                    <p className="mt-0.5 text-2xs text-subtle" title={formatDateTime(entry.createdAt)}>
                      {relativeTime(entry.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Metadata sidebar */}
        <aside className="w-full shrink-0 border-t border-line bg-app/60 px-4 py-5 lg:w-[19rem] lg:border-l lg:border-t-0">
          <div className="space-y-3.5">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-subtle">
              Properties
            </h2>

            <MetaRow label="Status">
              <Select
                compact
                disabled={!canEditIssues}
                options={ISSUE_STATUSES.map((status) => ({
                  value: status,
                  label: ISSUE_STATUS_LABELS[status],
                  icon: <StatusIcon status={status} className="h-3.5 w-3.5" />,
                }))}
                value={detail.status}
                onChange={(value) => updateMutation.mutate({ status: value })}
                width={210}
                align="end"
                ariaLabel="Status"
                trigger={
                  <>
                    <StatusIcon status={detail.status} className="h-3.5 w-3.5" />
                    <span>{ISSUE_STATUS_LABELS[detail.status as never] ?? detail.status}</span>
                  </>
                }
              />
            </MetaRow>

            <MetaRow label="Priority">
              <Select
                compact
                disabled={!canEditIssues}
                options={ISSUE_PRIORITIES.map((priority) => ({
                  value: priority,
                  label: ISSUE_PRIORITY_LABELS[priority],
                  icon: <PriorityIcon priority={priority} className="h-3.5 w-3.5" />,
                }))}
                value={detail.priority}
                onChange={(value) => updateMutation.mutate({ priority: value })}
                width={210}
                align="end"
                ariaLabel="Priority"
                trigger={
                  <>
                    <PriorityIcon priority={detail.priority} className="h-3.5 w-3.5" />
                    <span>{ISSUE_PRIORITY_LABELS[detail.priority as never] ?? detail.priority}</span>
                  </>
                }
              />
            </MetaRow>

            <MetaRow label="Assignee">
              <Select
                compact
                disabled={!canEditIssues}
                clearable
                clearLabel="Unassigned"
                options={(members.data ?? []).map((member) => ({
                  value: member.id,
                  label: member.name,
                  avatar: { name: member.name, avatarUrl: member.avatarUrl },
                }))}
                value={detail.assigneeId ?? ''}
                onChange={(value) => updateMutation.mutate({ assigneeId: value || null })}
                width={210}
                align="end"
                searchable
                ariaLabel="Assignee"
                trigger={
                  <>
                    {detail.assignee ? (
                      <Avatar name={detail.assignee.name} src={detail.assignee.avatarUrl} size="xs" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-dashed border-line-strong" />
                    )}
                    <span>{detail.assignee?.name ?? 'Unassigned'}</span>
                  </>
                }
              />
            </MetaRow>

            <MetaRow label="Project">
              <Select
                compact
                disabled={!canEditIssues}
                clearable
                clearLabel="No project"
                options={(projects.data ?? []).map((project) => ({
                  value: project.id,
                  label: project.name,
                  color: project.color,
                }))}
                value={detail.projectId ?? ''}
                onChange={(value) => updateMutation.mutate({ projectId: value || null })}
                width={210}
                align="end"
                searchable
                ariaLabel="Project"
                placeholder="No project"
              />
            </MetaRow>

            <MetaRow label="Cycle">
              <Select
                compact
                disabled={!canEditIssues}
                clearable
                clearLabel="No cycle"
                options={(cycles.data ?? []).map((cycle) => ({
                  value: cycle.id,
                  label: cycle.name,
                  hint: cycle.status,
                }))}
                value={detail.cycleId ?? ''}
                onChange={(value) => updateMutation.mutate({ cycleId: value || null })}
                width={210}
                align="end"
                ariaLabel="Cycle"
                placeholder="No cycle"
              />
            </MetaRow>

            <MetaRow label="Estimate">
              <Select
                compact
                disabled={!canEditIssues}
                clearable
                clearLabel="No estimate"
                options={ESTIMATE_OPTIONS.map((value) => ({
                  value: String(value),
                  label: `${value} points`,
                }))}
                value={detail.estimate === null ? '' : String(detail.estimate)}
                onChange={(value) => updateMutation.mutate({ estimate: value === '' ? null : Number(value) })}
                width={180}
                align="end"
                ariaLabel="Estimate"
              />
            </MetaRow>

            <MetaRow label="Due date">
              {canEditIssues ? (
                <Input
                  type="date"
                  value={toDateInput(detail.dueDate)}
                  onChange={(event) =>
                    updateMutation.mutate({ dueDate: event.target.value || null })
                  }
                  aria-label="Due date"
                  className="h-7 border-0 bg-transparent px-1 text-xs hover:bg-hover"
                  leading={<CalendarDays className="h-3.5 w-3.5" />}
                />
              ) : (
                <span className="px-1 text-xs text-muted">
                  {detail.dueDate ? formatDateTime(detail.dueDate).split(',')[0] : '—'}
                </span>
              )}
            </MetaRow>

            <MetaRow label="Labels">
              <div className="flex flex-wrap items-center justify-end gap-1">
                {detail.labels.map((label) => (
                  <span
                    key={label.id}
                    className="rounded px-1.5 py-0.5 text-2xs"
                    style={{ backgroundColor: `${label.color}22`, color: label.color }}
                  >
                    {label.name}
                  </span>
                ))}
                {canEditIssues && (
                  <button
                    type="button"
                    onClick={() => setLabelModalOpen(true)}
                    aria-label="Edit labels"
                    className="rounded p-0.5 text-subtle transition-colors hover:bg-hover hover:text-fg"
                  >
                    <Tag className="h-3.5 w-3.5" />
                  </button>
                )}
                {detail.labels.length === 0 && !canEditIssues && (
                  <span className="text-xs text-subtle">None</span>
                )}
              </div>
            </MetaRow>

            <div className="border-t border-line pt-3">
              <MetaRow label="Parent">
                <Select
                  compact
                  disabled={!canEditIssues}
                  clearable
                  clearLabel="No parent"
                  options={[
                    {
                      value: detail.parentId ?? '',
                      label: detail.parent ? detail.parent.identifier : 'No parent',
                    },
                  ]}
                  value={detail.parentId ?? ''}
                  onChange={(value) => updateMutation.mutate({ parentId: value || null })}
                  width={200}
                  align="end"
                  ariaLabel="Parent issue"
                  placeholder="No parent"
                />
              </MetaRow>
              <MetaRow label="Reporter">
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  {detail.creator && (
                    <Avatar name={detail.creator.name} src={detail.creator.avatarUrl} size="xs" />
                  )}
                  {detail.creator?.name ?? '—'}
                </span>
              </MetaRow>
              <MetaRow label="Created">
                <span className="text-xs text-muted" title={formatDateTime(detail.createdAt)}>
                  {relativeTime(detail.createdAt)}
                </span>
              </MetaRow>
              <MetaRow label="Updated">
                <span className="text-xs text-muted" title={formatDateTime(detail.updatedAt)}>
                  {relativeTime(detail.updatedAt)}
                </span>
              </MetaRow>
              {detail.completedAt && (
                <MetaRow label="Completed">
                  <span className="flex items-center gap-1 text-xs text-success">
                    <Check className="h-3 w-3" />
                    {relativeTime(detail.completedAt)}
                  </span>
                </MetaRow>
              )}
            </div>

            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Copy className="h-3.5 w-3.5" />}
                onClick={() => {
                  void navigator.clipboard?.writeText(window.location.href);
                  toast.success('Link copied');
                }}
              >
                Copy link
              </Button>
              {canEditIssues && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<GitBranch className="h-3.5 w-3.5" />}
                  loading={duplicateMutation.isPending}
                  onClick={() => duplicateMutation.mutate()}
                >
                  Duplicate issue
                </Button>
              )}
              {canDeleteIssues && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger/10"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  loading={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete ${detail.identifier}? This cannot be undone.`)) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  Delete issue
                </Button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Labels modal */}
      <Modal
        open={labelModalOpen}
        onClose={() => setLabelModalOpen(false)}
        title="Labels"
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setLabelModalOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {(labels.data ?? []).map((label) => {
            const active = detail.labels.some((entry) => entry.id === label.id);
            return (
              <button
                key={label.id}
                type="button"
                onClick={() =>
                  updateMutation.mutate({
                    labelIds: active
                      ? detail.labels.filter((entry) => entry.id !== label.id).map((entry) => entry.id)
                      : [...detail.labels.map((entry) => entry.id), label.id],
                  })
                }
                className="rounded-md border px-2 py-1 text-xs transition-colors"
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
        </div>
      </Modal>

      {/* Relation modal */}
      <Modal
        open={relationModalOpen}
        onClose={() => setRelationModalOpen(false)}
        title="Link an issue"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRelationModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={relationMutation.isPending}
              disabled={!relationTarget.trim()}
              onClick={() => relationMutation.mutate()}
            >
              Link issue
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Relationship">
            {() => (
              <Select
                options={ISSUE_RELATION_TYPES.map((type) => ({
                  value: type,
                  label: ISSUE_RELATION_LABELS[type],
                }))}
                value={relationType}
                onChange={(value) => setRelationType(value as IssueRelationType)}
                width={220}
                ariaLabel="Relationship"
              />
            )}
          </Field>
          <Field label="Issue ID" hint="Paste the internal id or an identifier like ORB-12.">
            {({ id }) => (
              <Input
                id={id}
                value={relationTarget}
                onChange={(event) => setRelationTarget(event.target.value)}
                placeholder="ORB-12"
              />
            )}
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-xs text-subtle">{label}</span>
      <div className="flex min-w-0 items-center justify-end">{children}</div>
    </div>
  );
}

function CommentItem({
  comment,
  canEdit,
  canModerate,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  saving,
}: {
  comment: Comment;
  canEdit: boolean;
  canModerate: boolean;
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <article className="rounded-lg border border-line bg-surface p-3" data-testid={`comment-${comment.id}`}>
      <header className="mb-2 flex items-center gap-2">
        <Avatar name={comment.author.name} src={comment.author.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-fg">{comment.author.name}</p>
          <p className="text-2xs text-subtle">
            <span className="font-mono">@{comment.author.handle}</span> ·{' '}
            {relativeTime(comment.createdAt)}
            {comment.editedAt && ' · edited'}
          </p>
        </div>
        {(canEdit || canModerate) && !editing && (
          <Menu
            align="end"
            width={160}
            trigger={(triggerProps) => (
              <button
                type="button"
                aria-label="Comment actions"
                className="btn btn-ghost btn-icon-sm"
                {...triggerProps}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          >
            {canEdit && (
              <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} onClick={onStartEdit}>
                Edit comment
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem
              danger
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setConfirming(true)}
            >
              Delete comment
            </MenuItem>
          </Menu>
        )}
      </header>

      {editing ? (
        <div className="space-y-2">
          <Textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} rows={4} />
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" loading={saving} onClick={onSaveEdit}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="prose-orbit text-sm [&_p]:my-1"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }}
        />
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this comment?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false);
                onDelete();
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          The activity log keeps an immutable record that a comment was deleted.
        </p>
      </Modal>
    </article>
  );
}
