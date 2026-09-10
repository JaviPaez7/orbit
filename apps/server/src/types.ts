import type { WorkspaceRole } from '@orbit/shared';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  title: string | null;
  timezone: string | null;
  createdAt: Date;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  key: string;
  role: WorkspaceRole;
  logoColor: string | null;
  memberCount: number;
  issueCount: number;
  projectCount: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: SessionUser | null;
  }
}

/** Event envelope pushed over the realtime channel. */
export interface RealtimeEvent<T = unknown> {
  /** Monotonic per-connection sequence number. */
  seq?: number;
  type:
    | 'hello'
    | 'pong'
    | 'issue.created'
    | 'issue.updated'
    | 'issue.deleted'
    | 'issue.bulk_updated'
    | 'comment.created'
    | 'comment.updated'
    | 'comment.deleted'
    | 'project.created'
    | 'project.updated'
    | 'project.deleted'
    | 'cycle.created'
    | 'cycle.updated'
    | 'cycle.deleted'
    | 'member.updated'
    | 'member.removed'
    | 'label.created'
    | 'label.updated'
    | 'label.deleted'
    | 'notification.created'
    | 'notification.read'
    | 'presence.sync'
    | 'activity.created';
  workspaceId: string;
  actorId?: string | null;
  at?: string;
  payload: T;
}
