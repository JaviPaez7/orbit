import type { WorkspaceRole } from '@orbit/shared';
import { deriveWorkspaceKey, emailSchema, slugify } from '@orbit/shared';
import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { generateToken, hashPassword, hashToken, toHandle, verifyPassword } from '../lib/crypto.js';
import { BadRequestError, ConflictError, UnauthorizedError } from '../lib/errors.js';
import { userPublicSelect } from '../lib/guards.js';
import type { SessionUser } from '../types.js';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  user: SessionUser;
}

async function uniqueHandle(name: string, email: string): Promise<string> {
  const base = toHandle(name, email);
  let candidate = base;
  let attempt = 0;
  // Handles are unique across the whole instance because mentions are global-ish.
  while (await prisma.user.findUnique({ where: { handle: candidate }, select: { id: true } })) {
    attempt += 1;
    candidate = `${base}${attempt}`.slice(0, 32);
    if (attempt > 50) candidate = `${base}${Math.random().toString(36).slice(2, 6)}`;
  }
  return candidate;
}

async function uniqueWorkspaceSlug(name: string): Promise<string> {
  const base = slugify(name) || 'workspace';
  let candidate = base;
  let attempt = 0;
  while (await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}

export async function issueSession(
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<IssuedSession> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + env.sessionTtlMs);
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 250) ?? null,
      ip: meta.ip?.slice(0, 60) ?? null,
    },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: userPublicSelect,
  });
  return { token, expiresAt, user };
}

export async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, expiresAt: true, user: { select: userPublicSelect } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  // Best-effort touch; failures must never break a request.
  void prisma.session
    .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
  return session.user as SessionUser;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
  workspaceName?: string;
  inviteToken?: string;
  userAgent?: string;
  ip?: string;
}): Promise<IssuedSession & { workspaceId: string | null }> {
  const email = emailSchema.parse(input.email);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new ConflictError('An account with that email already exists');

  const passwordHash = await hashPassword(input.password);
  const handle = await uniqueHandle(input.name, email);
  const workspaceName = input.workspaceName?.trim() || `${input.name.split(' ')[0]}'s Workspace`;

  const { user, workspaceId } = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, name: input.name.trim(), handle, passwordHash },
      select: userPublicSelect,
    });

    const slug = await uniqueWorkspaceSlug(workspaceName);
    const workspace = await tx.workspace.create({
      data: {
        name: workspaceName,
        slug,
        key: deriveWorkspaceKey(workspaceName),
        ownerId: created.id,
        logoColor: '#6366f1',
        issueCounter: 0,
      },
      select: { id: true },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: created.id,
        role: 'owner' satisfies WorkspaceRole,
      },
    });

    return { user: created as SessionUser, workspaceId: workspace.id };
  });

  const session = await issueSession(user.id, { userAgent: input.userAgent, ip: input.ip });
  return { ...session, workspaceId };
}

export async function authenticate(input: {
  email: string;
  password: string;
  userAgent?: string;
  ip?: string;
}): Promise<IssuedSession> {
  const email = emailSchema.parse(input.email);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, deactivatedAt: true },
  });
  // Same message for unknown user and wrong password (no account enumeration).
  const invalid = new UnauthorizedError('Incorrect email or password');
  if (!user || user.deactivatedAt) {
    // Still burn time so response timing does not leak account existence.
    await verifyPassword(
      input.password,
      '$2a$11$0000000000000000000000000000000000000000000000000000',
    );
    throw invalid;
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw invalid;
  return issueSession(user.id, { userAgent: input.userAgent, ip: input.ip });
}

export async function updateProfile(
  userId: string,
  input: {
    name?: string;
    email?: string;
    avatarUrl?: string | null;
    title?: string | null;
    timezone?: string | null;
  },
): Promise<SessionUser> {
  if (input.email) {
    const email = emailSchema.parse(input.email);
    const clash = await prisma.user.findFirst({
      where: { email, NOT: { id: userId } },
      select: { id: true },
    });
    if (clash) throw new ConflictError('That email is already in use');
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.email !== undefined) data.email = emailSchema.parse(input.email);
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  if (input.title !== undefined) data.title = input.title;
  if (input.timezone !== undefined) data.timezone = input.timezone;

  return (await prisma.user.update({
    where: { id: userId },
    data,
    select: userPublicSelect,
  })) as SessionUser;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepSessionToken?: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new BadRequestError('Your current password is incorrect');
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  // Sign out every other device, keep the caller signed in.
  await prisma.session.deleteMany({
    where: keepSessionToken
      ? { userId, NOT: { tokenHash: hashToken(keepSessionToken) } }
      : { userId },
  });
}

/**
 * Password reset. The raw token is returned exactly once so the caller can
 * deliver it (email in production, the API response in dev/demo mode).
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ token: string; userId: string } | null> {
  const user = await prisma.user.findUnique({
    where: { email: emailSchema.parse(email) },
    select: { id: true },
  });
  if (!user) return null; // Caller responds identically either way.
  const token = generateToken(32);
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + env.resetTokenTtlMs),
    },
  });
  return { token, userId: user.id };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new BadRequestError('That reset link is invalid or has expired');
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
}
