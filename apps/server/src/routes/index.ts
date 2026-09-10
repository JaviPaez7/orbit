import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.routes.js';
import { workspaceRoutes } from './workspace.routes.js';
import { projectRoutes } from './project.routes.js';
import { issueRoutes } from './issue.routes.js';
import { labelRoutes } from './label.routes.js';
import { cycleRoutes } from './cycle.routes.js';
import { notificationRoutes } from './notification.routes.js';
import { analyticsRoutes } from './analytics.routes.js';
import { searchRoutes } from './search.routes.js';
import { dataRoutes } from './data.routes.js';
import { userRoutes } from './user.routes.js';
import { uploadRoutes } from './upload.routes.js';
import { realtimeRoutes } from './realtime.routes.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(uploadRoutes);
  await app.register(workspaceRoutes);
  await app.register(projectRoutes);
  await app.register(issueRoutes);
  await app.register(labelRoutes);
  await app.register(cycleRoutes);
  await app.register(notificationRoutes);
  await app.register(analyticsRoutes);
  await app.register(searchRoutes);
  await app.register(dataRoutes);
  await app.register(realtimeRoutes);
}
