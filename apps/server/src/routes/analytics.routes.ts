import { requireWorkspace } from '../lib/guards.js';
import { getProjectAnalytics, getWorkspaceAnalytics } from '../services/analytics.service.js';
import type { FastifyInstance } from 'fastify';
import { requireProjectAccess } from '../lib/guards.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/workspaces/:workspaceId/analytics', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspace(request, workspaceId);
    const query = request.query as { days?: string };
    const days = Math.min(Math.max(Number(query.days ?? 90) || 90, 7), 365);
    const analytics = await getWorkspaceAnalytics(workspaceId, days);
    return reply.send({ analytics, windowDays: days });
  });

  app.get('/projects/:projectId/analytics', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { project, ctx } = await requireProjectAccess(request, projectId);
    const analytics = await getProjectAnalytics(project.id, ctx.workspaceId);
    return reply.send({ analytics, project: { id: project.id, name: project.name } });
  });
}
