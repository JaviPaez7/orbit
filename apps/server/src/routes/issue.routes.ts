import type { WorkspaceRole } from '@orbit/shared';
import {
  bulkIssueSchema,
  can,
  createIssueSchema,
  issueQuerySchema,
  issueRelationSchema,
  updateIssueSchema,
} from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { NotFoundError } from '../lib/errors.js';
import { requireIssueAccess, requireWorkspace } from '../lib/guards.js';
import { normalizeQuery, parseOrThrow } from '../lib/http.js';
import { issueDetailInclude, issueListInclude, serializeActivity, serializeIssue } from '../lib/serialize.js';
import {
  activityInclude,
  describeActivity,
} from '../services/activity.service.js';
import {
  addIssueRelation,
  bulkDeleteIssues,
  bulkUpdateIssues,
  createIssue,
  deleteIssue,
  duplicateIssue,
  listIssues,
  removeIssueRelation,
  updateIssue,
} from '../services/issue.service.js';
import { notify, resolveMentions } from '../services/notification.service.js';
import { realtimeHub } from '../services/realtime.service.js';

export async function issueRoutes(app: FastifyInstance): Promise<void> {
  /** Paginated, filterable, groupable issue list scoped to one workspace. */
  app.get('/workspaces/:workspaceId/issues', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);
    const query = parseOrThrow(issueQuerySchema, normalizeQuery(request.query as Record<string, unknown>));
    const result = await listIssues(workspaceId, query);
    return reply.send({ ...result, role: ctx.role });
  });

  app.post('/workspaces/:workspaceId/issues', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const ctx = await requireWorkspace(request, workspaceId, 'issue:create');
      const input = parseOrThrow(createIssueSchema, request.body);
      const issue = await createIssue(workspaceId, ctx.user.id, input);
      realtimeHub.broadcast({
        type: 'issue.created',
        workspaceId,
        actorId: ctx.user.id,
        payload: { issue },
      });
      return reply.status(201).send({ issue });
    },
  });

  app.get('/workspaces/:workspaceId/issues/:issueId', async (request, reply) => {
    const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
    const ctx = await requireWorkspace(request, workspaceId);
    const issue = await prisma.issue.findFirst({
      where: { id: issueId, workspaceId },
      include: issueDetailInclude,
    });
    if (!issue) throw new NotFoundError('Issue');
    return reply.send({
      issue: serializeIssue(issue as never),
      role: ctx.role,
      permissions: {
        canEdit: can(ctx.role, 'issue:update'),
        canDelete: can(ctx.role, 'issue:delete'),
        canComment: can(ctx.role, 'issue:comment'),
      },
    });
  });

  app.patch('/workspaces/:workspaceId/issues/:issueId', async (request, reply) => {
    const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:update');
    const input = parseOrThrow(updateIssueSchema, request.body);
    const issue = await updateIssue(workspaceId, ctx.user.id, issueId, input);
    realtimeHub.broadcast({
      type: 'issue.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { issue },
    });
    return reply.send({ issue });
  });

  app.delete('/workspaces/:workspaceId/issues/:issueId', async (request, reply) => {
    const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:delete');
    const deleted = await deleteIssue(workspaceId, ctx.user.id, issueId);
    realtimeHub.broadcast({
      type: 'issue.deleted',
      workspaceId,
      actorId: ctx.user.id,
      payload: { issueId: deleted.id, identifier: deleted.identifier },
    });
    return reply.send({ ok: true, issueId: deleted.id });
  });

  app.post('/workspaces/:workspaceId/issues/:issueId/duplicate', async (request, reply) => {
    const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:create');
    const issue = await duplicateIssue(workspaceId, ctx.user.id, issueId);
    realtimeHub.broadcast({
      type: 'issue.created',
      workspaceId,
      actorId: ctx.user.id,
      payload: { issue },
    });
    return reply.status(201).send({ issue });
  });

  /** Bulk status/priority/assignee/project/cycle/label mutations from the list view. */
  app.post('/workspaces/:workspaceId/issues/bulk', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:update');
    const input = parseOrThrow(bulkIssueSchema, request.body);
    const result = await bulkUpdateIssues(workspaceId, ctx.user.id, input);
    realtimeHub.broadcast({
      type: 'issue.bulk_updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { issues: result.issues, ids: input.ids },
    });
    return reply.send(result);
  });

  app.post('/workspaces/:workspaceId/issues/bulk-delete', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:delete');
    const body = request.body as { ids?: unknown };
    const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : [];
    if (ids.length === 0) {
      return reply.status(422).send({
        error: { code: 'validation_error', message: 'Select at least one issue', fields: { ids: ['Required'] } },
      });
    }
    const result = await bulkDeleteIssues(workspaceId, ctx.user.id, ids.slice(0, 500));
    realtimeHub.broadcast({
      type: 'issue.deleted',
      workspaceId,
      actorId: ctx.user.id,
      payload: { issueIds: result.ids, bulk: true },
    });
    return reply.send(result);
  });

  /** Kanban drop target: persists the column and the fractional sort order. */
  app.post('/workspaces/:workspaceId/issues/:issueId/move', async (request, reply) => {
    const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:update');
    const body = (request.body ?? {}) as { status?: unknown; position?: unknown; boardOrder?: unknown };

    const status = typeof body.status === 'string' ? body.status : undefined;
    const position = typeof body.position === 'number' ? body.position : undefined;
    const explicitOrder = typeof body.boardOrder === 'number' ? body.boardOrder : undefined;

    if (!status && explicitOrder === undefined) {
      return reply.status(422).send({
        error: { code: 'validation_error', message: 'Provide a status or boardOrder' },
      });
    }

    const current = await prisma.issue.findFirst({
      where: { id: issueId, workspaceId },
      select: { id: true, status: true, boardOrder: true },
    });
    if (!current) throw new NotFoundError('Issue');

    let boardOrder = explicitOrder;
    if (boardOrder === undefined) {
      // Compute a midpoint between the neighbours at `position`.
      const neighbours = await prisma.issue.findMany({
        where: { workspaceId, status: status ?? current.status, id: { not: issueId } },
        orderBy: { boardOrder: 'asc' },
        select: { boardOrder: true },
      });
      const index = Math.max(0, Math.min(position ?? neighbours.length, neighbours.length));
      const previous = index > 0 ? neighbours[index - 1]!.boardOrder : null;
      const next = index < neighbours.length ? neighbours[index]!.boardOrder : null;
      if (previous === null && next === null) boardOrder = 1000;
      else if (previous === null) boardOrder = next! - 100;
      else if (next === null) boardOrder = previous + 100;
      else boardOrder = (previous + next) / 2;
    }

    const issue = await updateIssue(
      workspaceId,
      ctx.user.id,
      issueId,
      { ...(status ? { status: status as never } : {}), boardOrder },
      {},
    );

    realtimeHub.broadcast({
      type: 'issue.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { issue, moved: true },
    });
    return reply.send({ issue });
  });

  // ---- relations ----------------------------------------------------------

  app.post('/workspaces/:workspaceId/issues/:issueId/relations', async (request, reply) => {
    const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:update');
    const input = parseOrThrow(issueRelationSchema, request.body);
    const relation = await addIssueRelation(
      workspaceId,
      ctx.user.id,
      issueId,
      input.relatedIssueId,
      input.type,
    );
    realtimeHub.broadcast({
      type: 'issue.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { issueId },
    });
    return reply.status(201).send({ relation });
  });

  app.delete('/workspaces/:workspaceId/relations/:relationId', async (request, reply) => {
    const { workspaceId, relationId } = request.params as { workspaceId: string; relationId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:update');
    await removeIssueRelation(workspaceId, ctx.user.id, relationId);
    return reply.send({ ok: true });
  });

  // ---- comments -----------------------------------------------------------

  app.get('/workspaces/:workspaceId/issues/:issueId/comments', async (request, reply) => {
    const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
    await requireWorkspace(request, workspaceId);
    const comments = await prisma.comment.findMany({
      where: { issueId, issue: { workspaceId } },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, handle: true, avatarUrl: true } },
        _count: { select: { replies: true } },
      },
    });
    return reply.send({ comments });
  });

  app.post('/workspaces/:workspaceId/issues/:issueId/comments', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
      const ctx = await requireWorkspace(request, workspaceId, 'issue:comment');
      const body = request.body as { body?: unknown; parentId?: unknown };
      const text = typeof body?.body === 'string' ? body.body.trim() : '';
      if (!text) {
        return reply.status(422).send({
          error: { code: 'validation_error', message: 'Comment cannot be empty', fields: { body: ['Required'] } },
        });
      }
      if (text.length > 10000) {
        return reply.status(422).send({
          error: {
            code: 'validation_error',
            message: 'Comment is too long',
            fields: { body: ['Maximum 10000 characters'] },
          },
        });
      }

      const issue = await prisma.issue.findFirst({
        where: { id: issueId, workspaceId },
        select: { id: true, identifier: true, title: true, assigneeId: true, creatorId: true, projectId: true },
      });
      if (!issue) throw new NotFoundError('Issue');

      const comment = await prisma.comment.create({
        data: {
          issueId,
          authorId: ctx.user.id,
          body: text,
          parentId: typeof body.parentId === 'string' ? body.parentId : null,
        },
        include: {
          author: { select: { id: true, name: true, handle: true, avatarUrl: true } },
          _count: { select: { replies: true } },
        },
      });

      await prisma.activity.create({
        data: {
          workspaceId,
          actorId: ctx.user.id,
          entityType: 'comment',
          entityId: comment.id,
          action: 'commented',
          entityLabel: issue.identifier,
          issueId,
          projectId: issue.projectId,
          changes: '{}',
        },
      });

      // Mentions first, then a general heads-up to the assignee/creator.
      const mentioned = await resolveMentions(workspaceId, text);
      const actor = { id: ctx.user.id, name: ctx.user.name, avatarUrl: ctx.user.avatarUrl };
      const base = { issueId, identifier: issue.identifier, workspaceId, commentId: comment.id };

      await notify({
        workspaceId,
        userIds: mentioned,
        type: 'comment_mention',
        title: `${ctx.user.name} mentioned you on ${issue.identifier}`,
        body: text.slice(0, 140),
        issueId,
        actor,
        data: base,
      });

      const others = [issue.assigneeId, issue.creatorId].filter(
        (id): id is string => Boolean(id) && !mentioned.includes(id as string),
      );
      await notify({
        workspaceId,
        userIds: others,
        excludeUserId: ctx.user.id,
        type: 'issue_comment',
        title: `${ctx.user.name} commented on ${issue.identifier}`,
        body: text.slice(0, 140),
        issueId,
        actor,
        data: base,
      });

      realtimeHub.broadcast({
        type: 'comment.created',
        workspaceId,
        actorId: ctx.user.id,
        payload: { comment, issueId },
      });

      return reply.status(201).send({ comment });
    },
  });

  app.patch('/workspaces/:workspaceId/comments/:commentId', async (request, reply) => {
    const { workspaceId, commentId } = request.params as { workspaceId: string; commentId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:comment');
    const body = request.body as { body?: unknown };
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!text) {
      return reply.status(422).send({
        error: { code: 'validation_error', message: 'Comment cannot be empty', fields: { body: ['Required'] } },
      });
    }

    const existing = await prisma.comment.findFirst({
      where: { id: commentId, issue: { workspaceId } },
      select: { id: true, authorId: true, issueId: true },
    });
    if (!existing) throw new NotFoundError('Comment');
    if (existing.authorId !== ctx.user.id) {
      return reply.status(403).send({
        error: { code: 'forbidden', message: 'You can only edit your own comments' },
      });
    }

    const comment = await prisma.comment.update({
      where: { id: commentId },
      data: { body: text, editedAt: new Date() },
      include: {
        author: { select: { id: true, name: true, handle: true, avatarUrl: true } },
        _count: { select: { replies: true } },
      },
    });

    await prisma.activity.create({
      data: {
        workspaceId,
        actorId: ctx.user.id,
        entityType: 'comment',
        entityId: commentId,
        action: 'comment_updated',
        issueId: existing.issueId,
        changes: '{}',
      },
    });

    realtimeHub.broadcast({
      type: 'comment.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { comment, issueId: existing.issueId },
    });

    return reply.send({ comment });
  });

  app.delete('/workspaces/:workspaceId/comments/:commentId', async (request, reply) => {
    const { workspaceId, commentId } = request.params as { workspaceId: string; commentId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:comment');

    const existing = await prisma.comment.findFirst({
      where: { id: commentId, issue: { workspaceId } },
      select: { id: true, authorId: true, issueId: true },
    });
    if (!existing) throw new NotFoundError('Comment');
    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin';
    if (existing.authorId !== ctx.user.id && !isAdmin) {
      return reply.status(403).send({
        error: { code: 'forbidden', message: 'You can only delete your own comments' },
      });
    }

    await prisma.$transaction([
      prisma.activity.create({
        data: {
          workspaceId,
          actorId: ctx.user.id,
          entityType: 'comment',
          entityId: commentId,
          action: 'comment_deleted',
          issueId: existing.issueId,
          changes: '{}',
        },
      }),
      prisma.comment.delete({ where: { id: commentId } }),
    ]);

    realtimeHub.broadcast({
      type: 'comment.deleted',
      workspaceId,
      actorId: ctx.user.id,
      payload: { commentId, issueId: existing.issueId },
    });

    return reply.send({ ok: true });
  });

  // ---- activity -----------------------------------------------------------

  app.get('/workspaces/:workspaceId/issues/:issueId/activity', async (request, reply) => {
    const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
    await requireWorkspace(request, workspaceId);
    const rows = await prisma.activity.findMany({
      where: { issueId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: activityInclude,
    });
    const issue = await prisma.issue.findUnique({ where: { id: issueId }, select: { identifier: true } });
    return reply.send({
      activity: rows.map((row) => {
        const serialized = serializeActivity(row as never);
        return {
          ...serialized,
          description: describeActivity(
            row.action,
            row.entityType,
            (serialized.changes ?? {}) as never,
            { entityLabel: row.entityLabel, actorName: row.actor?.name },
          ),
          issueIdentifier: issue?.identifier ?? null,
        };
      }),
    });
  });

  app.get('/workspaces/:workspaceId/activity', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspace(request, workspaceId);
    const rows = await prisma.activity.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: {
        ...activityInclude,
        issue: { select: { id: true, identifier: true, title: true } },
      },
    });
    return reply.send({
      activity: rows.map((row) => {
        const serialized = serializeActivity(row as never);
        return {
          ...serialized,
          description: describeActivity(
            row.action,
            row.entityType,
            (serialized.changes ?? {}) as never,
            { entityLabel: row.entityLabel, actorName: row.actor?.name },
          ),
        };
      }),
    });
  });

  /** Issues the caller is involved in — powers the "My issues" view. */
  app.get('/workspaces/:workspaceId/my-issues', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ctx = await requireWorkspace(request, workspaceId);
    const issues = await prisma.issue.findMany({
      where: {
        workspaceId,
        OR: [{ assigneeId: ctx.user.id }, { creatorId: ctx.user.id }],
      },
      include: issueListInclude,
      orderBy: [{ status: 'asc' }, { boardOrder: 'asc' }],
      take: 100,
    });
    return reply.send({ issues: issues.map((issue) => serializeIssue(issue as never)) });
  });

  /** Assignable members (viewers excluded) for assignee pickers. */
  app.get('/workspaces/:workspaceId/assignable', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspace(request, workspaceId);
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, status: 'active', NOT: { role: 'viewer' } },
      select: { role: true, user: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return reply.send({
      members: members.map((member) => ({ ...member.user, role: member.role as WorkspaceRole })),
    });
  });

  /** Verifies the caller can see an issue before an upload is attached to it. */
  app.get('/workspaces/:workspaceId/issues/:issueId/attachments', async (request, reply) => {
    const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
    const { issue } = await requireIssueAccess(request, issueId);
    if (issue.workspaceId !== workspaceId) throw new NotFoundError('Issue');
    const attachments = await prisma.attachment.findMany({
      where: { issueId },
      orderBy: { createdAt: 'desc' },
      include: { uploader: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return reply.send({ attachments });
  });

  app.post('/workspaces/:workspaceId/issues/:issueId/attachments', async (request, reply) => {
    const { workspaceId, issueId } = request.params as { workspaceId: string; issueId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:update');
    const { issue } = await requireIssueAccess(request, issueId, 'issue:update');
    if (issue.workspaceId !== workspaceId) throw new NotFoundError('Issue');

    const body = (request.body ?? {}) as { filename?: unknown; url?: unknown; mimeType?: unknown; size?: unknown };
    if (typeof body.url !== 'string' || typeof body.filename !== 'string') {
      return reply.status(422).send({
        error: {
          code: 'validation_error',
          message: 'filename and url are required',
          fields: { url: ['Required'] },
        },
      });
    }
    const attachment = await prisma.attachment.create({
      data: {
        issueId,
        uploaderId: ctx.user.id,
        filename: body.filename.slice(0, 200),
        url: body.url.slice(0, 2048),
        mimeType: typeof body.mimeType === 'string' ? body.mimeType.slice(0, 120) : null,
        size: typeof body.size === 'number' ? body.size : null,
      },
      include: { uploader: { select: { id: true, name: true, avatarUrl: true } } },
    });

    await prisma.activity.create({
      data: {
        workspaceId,
        actorId: ctx.user.id,
        entityType: 'issue',
        entityId: issueId,
        action: 'attachment_added',
        issueId,
        changes: JSON.stringify({ attachment: { from: null, to: attachment.filename } }),
      },
    });

    realtimeHub.broadcast({
      type: 'issue.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { issueId },
    });

    return reply.status(201).send({ attachment });
  });

  app.delete('/workspaces/:workspaceId/attachments/:attachmentId', async (request, reply) => {
    const { workspaceId, attachmentId } = request.params as { workspaceId: string; attachmentId: string };
    const ctx = await requireWorkspace(request, workspaceId, 'issue:update');
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, issue: { workspaceId } },
      select: { id: true, issueId: true, filename: true },
    });
    if (!attachment) throw new NotFoundError('Attachment');
    await prisma.$transaction([
      prisma.activity.create({
        data: {
          workspaceId,
          actorId: ctx.user.id,
          entityType: 'issue',
          entityId: attachment.issueId,
          action: 'attachment_removed',
          issueId: attachment.issueId,
          changes: JSON.stringify({ attachment: { from: attachment.filename, to: null } }),
        },
      }),
      prisma.attachment.delete({ where: { id: attachmentId } }),
    ]);
    realtimeHub.broadcast({
      type: 'issue.updated',
      workspaceId,
      actorId: ctx.user.id,
      payload: { issueId: attachment.issueId },
    });
    return reply.send({ ok: true });
  });
}
