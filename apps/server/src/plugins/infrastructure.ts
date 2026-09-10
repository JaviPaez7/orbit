import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { existsSync, mkdirSync } from 'node:fs';
import { SESSION_COOKIE, env } from '../config/env.js';
import { resolveSession } from '../services/auth.service.js';

/**
 * Registers infrastructure plugins and resolves the session on every request.
 * Authentication is *not* enforced here — routes opt in via `requireUser` /
 * `requireWorkspace`, which keeps public endpoints (login, health) simple.
 */
async function infrastructure(app: FastifyInstance): Promise<void> {
  await app.register(cookie, { secret: env.AUTH_SECRET });

  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow same-origin/no-origin (curl, tests, server-rendered fetches).
      if (!origin || env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  await app.register(rateLimit, {
    global: false,
    max: 300,
    timeWindow: '1 minute',
  });

  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  await app.register(websocket, {
    options: { maxPayload: 1024 * 1024, clientTracking: true },
  });

  if (!existsSync(env.uploadDirAbsolute)) {
    mkdirSync(env.uploadDirAbsolute, { recursive: true });
  }

  await app.register(fastifyStatic, {
    root: env.uploadDirAbsolute,
    prefix: '/uploads/',
    decorateReply: false,
  });

  app.decorateRequest('currentUser', null);

  app.addHook('preHandler', async (request) => {
    const raw = request.cookies[SESSION_COOKIE];
    request.currentUser = await resolveSession(raw);
  });
}

export default fp(infrastructure, { name: 'orbit-infrastructure' });
