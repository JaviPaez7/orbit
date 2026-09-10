import {
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE, env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { parseOrThrow } from '../lib/http.js';
import { requireUser } from '../lib/guards.js';
import { hashToken } from '../lib/crypto.js';
import {
  authenticate,
  destroySession,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from '../services/auth.service.js';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.isProduction,
  path: '/',
};

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const input = parseOrThrow(registerSchema, request.body);
      const session = await registerUser({
        ...input,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
      reply.setCookie(SESSION_COOKIE, session.token, {
        ...cookieOptions,
        expires: session.expiresAt,
      });
      return reply.status(201).send({
        user: session.user,
        workspaceId: session.workspaceId,
      });
    },
  });

  app.post('/auth/login', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const input = parseOrThrow(loginSchema, request.body);
      const session = await authenticate({
        ...input,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
      reply.setCookie(SESSION_COOKIE, session.token, {
        ...cookieOptions,
        expires: session.expiresAt,
      });
      return reply.send({ user: session.user });
    },
  });

  app.post('/auth/logout', async (request, reply) => {
    await destroySession(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/auth/me', async (request, reply) => {
    const user = request.currentUser;
    if (!user) return reply.send({ user: null });
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id, status: 'active' },
      orderBy: { joinedAt: 'asc' },
      select: {
        role: true,
        workspace: { select: { id: true, name: true, slug: true, key: true, logoColor: true } },
      },
    });
    const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
    return reply.send({
      user,
      unreadNotifications: unread,
      workspaces: memberships.map((membership) => ({
        ...membership.workspace,
        role: membership.role,
      })),
    });
  });

  app.post('/auth/password/request', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const input = parseOrThrow(requestPasswordResetSchema, request.body);
      const result = await requestPasswordReset(input.email);
      // Identical response whether or not the account exists.
      const body: Record<string, unknown> = {
        ok: true,
        message: 'If an account exists for that email, a reset link is on its way.',
      };
      if (result && (env.EXPOSE_RESET_TOKEN || !env.isProduction)) {
        // Demo/dev convenience: the reset link is returned instead of emailed.
        body.resetToken = result.token;
        body.resetUrl = `${env.APP_URL}/reset-password?token=${result.token}`;
        request.log.info({ userId: result.userId }, 'password reset token issued');
      }
      return reply.send(body);
    },
  });

  app.post('/auth/password/reset', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const input = parseOrThrow(resetPasswordSchema, request.body);
      await resetPassword(input.token, input.password);
      return reply.send({ ok: true, message: 'Password updated — you can sign in now.' });
    },
  });

  app.get('/auth/sessions', async (request, reply) => {
    const user = await requireUser(request);
    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        tokenHash: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      take: 20,
    });
    const currentToken = request.cookies[SESSION_COOKIE];
    const currentHash = currentToken ? hashToken(currentToken) : null;
    return reply.send({
      sessions: sessions.map(({ tokenHash, ...session }) => ({
        ...session,
        current: currentHash !== null && tokenHash === currentHash,
      })),
    });
  });

  app.delete('/auth/sessions/:id', async (request, reply) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    await prisma.session.deleteMany({ where: { id, userId: user.id } });
    return reply.send({ ok: true });
  });
}
