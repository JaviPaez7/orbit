import { changePasswordSchema, updateProfileSchema } from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { createWriteStream } from 'node:fs';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { generateToken } from '../lib/crypto.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { requireWorkspace, requireUser, userPublicSelect } from '../lib/guards.js';
import { parseOrThrow } from '../lib/http.js';
import { changePassword, updateProfile } from '../services/auth.service.js';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users/me', async (request, reply) => {
    const user = await requireUser(request);
    const full = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: userPublicSelect,
    });
    return reply.send({ user: full });
  });

  app.patch('/users/me', async (request, reply) => {
    const user = await requireUser(request);
    const input = parseOrThrow(updateProfileSchema, request.body);
    const updated = await updateProfile(user.id, input);
    return reply.send({ user: updated });
  });

  app.post('/users/me/password', async (request, reply) => {
    const user = await requireUser(request);
    const input = parseOrThrow(changePasswordSchema, request.body);
    await changePassword(
      user.id,
      input.currentPassword,
      input.newPassword,
      request.cookies.orbit_session,
    );
    return reply.send({ ok: true, message: 'Password updated' });
  });

  /** Avatar upload. Files land in UPLOAD_DIR and are served from /uploads. */
  app.post('/users/me/avatar', async (request, reply) => {
    const user = await requireUser(request);
    const file = await request.file();
    if (!file) throw new BadRequestError('No file was uploaded');
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestError('Avatars must be a PNG, JPEG, WEBP, GIF or SVG image');
    }

    const extension = extname(file.filename).toLowerCase().slice(0, 8) || '.png';
    const filename = `avatar-${user.id}-${generateToken(6)}${extension}`;
    const target = join(env.uploadDirAbsolute, filename);

    await pipeline(file.file, createWriteStream(target));
    if (file.file.truncated) throw new BadRequestError('That image is larger than the 5MB limit');

    const url = `/uploads/${filename}`;
    const updated = await updateProfile(user.id, { avatarUrl: url });
    return reply.status(201).send({ user: updated, url });
  });

  /** Clears the avatar and falls back to initials. */
  app.delete('/users/me/avatar', async (request, reply) => {
    const user = await requireUser(request);
    const updated = await updateProfile(user.id, { avatarUrl: null });
    return reply.send({ user: updated });
  });

  app.get('/users/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    await requireUser(request);
    const found = await prisma.user.findUnique({
      where: { id: userId },
      select: { ...userPublicSelect, memberships: { select: { workspaceId: true, role: true } } },
    });
    if (!found) throw new NotFoundError('User');
    return reply.send({ user: found });
  });

  /** Members of a workspace that can be @mentioned, for the mention picker. */
  app.get('/workspaces/:workspaceId/mentionable', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspace(request, workspaceId);
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, status: 'active' },
      select: { user: { select: { id: true, name: true, handle: true, avatarUrl: true } } },
      orderBy: { joinedAt: 'asc' },
      take: 200,
    });
    return reply.send({ users: members.map((member) => member.user) });
  });
}
