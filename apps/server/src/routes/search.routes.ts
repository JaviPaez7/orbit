import { issueIdentifierSchema } from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { NotFoundError } from '../lib/errors.js';
import { requireWorkspace } from '../lib/guards.js';
import { normalizeQuery } from '../lib/http.js';
import { issueListInclude, serializeIssue, userSummarySelect } from '../lib/serialize.js';

interface SearchResult {
  type: 'issue' | 'project' | 'user' | 'cycle' | 'label';
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  meta?: Record<string, unknown>;
}

/**
 * Global search across issues, projects and people inside one workspace.
 * Debounced on the client; bounded on the server by `take` limits.
 */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/workspaces/:workspaceId/search', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspace(request, workspaceId);

    const query = normalizeQuery(request.query as Record<string, unknown>) as {
      q?: string;
      limit?: number;
      types?: string[];
    };
    const term = (query.q ?? '').trim();
    const limit = Math.min(Math.max(Number(query.limit ?? 8), 1), 25);
    const types = new Set(query.types ?? ['issue', 'project', 'user', 'cycle', 'label']);

    if (term.length === 0) {
      return reply.send({ results: [], term, groups: {} });
    }

    const lower = term.toLowerCase();
    const upper = term.toUpperCase();
    const identifierMatch = issueIdentifierSchema.safeParse(upper).success;

    const [issues, projects, users, cycles, labels] = await Promise.all([
      types.has('issue')
        ? prisma.issue.findMany({
            where: {
              workspaceId,
              OR: [
                { title: { contains: lower } },
                { description: { contains: lower } },
                ...(identifierMatch ? [{ identifier: upper }] : []),
                { identifier: { contains: upper } },
              ],
            },
            include: issueListInclude,
            orderBy: { updatedAt: 'desc' },
            take: limit,
          })
        : Promise.resolve([]),
      types.has('project')
        ? prisma.project.findMany({
            where: {
              workspaceId,
              OR: [{ name: { contains: lower } }, { description: { contains: lower } }],
            },
            orderBy: { updatedAt: 'desc' },
            take: limit,
          })
        : Promise.resolve([]),
      types.has('user')
        ? prisma.user.findMany({
            where: {
              memberships: { some: { workspaceId, status: 'active' } },
              OR: [
                { name: { contains: lower } },
                { handle: { contains: lower } },
                { email: { contains: lower } },
              ],
            },
            select: userSummarySelect,
            take: limit,
          })
        : Promise.resolve([]),
      types.has('cycle')
        ? prisma.cycle.findMany({
            where: { workspaceId, name: { contains: lower } },
            orderBy: { number: 'desc' },
            take: limit,
          })
        : Promise.resolve([]),
      types.has('label')
        ? prisma.label.findMany({
            where: { workspaceId, name: { contains: lower } },
            take: limit,
          })
        : Promise.resolve([]),
    ]);

    const results: SearchResult[] = [
      ...issues.map((issue) => {
        const serialized = serializeIssue(issue as never);
        return {
          type: 'issue' as const,
          id: String(serialized.id),
          title: `${String(serialized.identifier)} ${String(serialized.title)}`,
          subtitle: (serialized.project as { name?: string } | null)?.name ?? null,
          url: `/issues/${String(serialized.identifier)}`,
          meta: {
            status: serialized.status,
            priority: serialized.priority,
            assignee: serialized.assignee,
            identifier: serialized.identifier,
          },
        };
      }),
      ...projects.map((project) => ({
        type: 'project' as const,
        id: project.id,
        title: project.name,
        subtitle: project.description?.slice(0, 80) ?? null,
        url: `/projects/${project.id}`,
        meta: { color: project.color, icon: project.icon, status: project.status },
      })),
      ...users.map((user) => ({
        type: 'user' as const,
        id: user.id,
        title: user.name,
        subtitle: `@${user.handle}`,
        url: `/settings/profile`,
        meta: { avatarUrl: user.avatarUrl },
      })),
      ...cycles.map((cycle) => ({
        type: 'cycle' as const,
        id: cycle.id,
        title: cycle.name,
        subtitle: `${cycle.startDate.toISOString().slice(0, 10)} → ${cycle.endDate.toISOString().slice(0, 10)}`,
        url: `/cycles/${cycle.id}`,
        meta: { status: cycle.status },
      })),
      ...labels.map((label) => ({
        type: 'label' as const,
        id: label.id,
        title: label.name,
        subtitle: 'Label',
        url: `/issues?labelId=${label.id}`,
        meta: { color: label.color },
      })),
    ];

    return reply.send({
      term,
      results,
      groups: {
        issue: results.filter((r) => r.type === 'issue').length,
        project: results.filter((r) => r.type === 'project').length,
        user: results.filter((r) => r.type === 'user').length,
        cycle: results.filter((r) => r.type === 'cycle').length,
        label: results.filter((r) => r.type === 'label').length,
      },
    });
  });

  /** Resolves an `ORB-123` identifier (used by deep links and the palette). */
  app.get('/workspaces/:workspaceId/issues/by-identifier/:identifier', async (request, reply) => {
    const { workspaceId, identifier } = request.params as {
      workspaceId: string;
      identifier: string;
    };
    await requireWorkspace(request, workspaceId);
    const parsed = issueIdentifierSchema.safeParse(identifier.toUpperCase());
    if (!parsed.success) throw new NotFoundError('Issue');
    const issue = await prisma.issue.findFirst({
      where: { workspaceId, identifier: identifier.toUpperCase() },
      include: issueListInclude,
    });
    if (!issue) throw new NotFoundError('Issue');
    return reply.send({ issue: serializeIssue(issue as never) });
  });
}
