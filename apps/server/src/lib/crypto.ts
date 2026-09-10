import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

const BCRYPT_ROUNDS = env.isTest ? 4 : 11;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** URL-safe random token; the raw value is only ever sent to the client. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Tokens are stored hashed so a database leak cannot be replayed.
 * SHA-256 is appropriate here because the input is already high-entropy.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(`${token}${env.AUTH_SECRET}`).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Normalizes any free-form name into a unique-ish @mention handle. */
export function toHandle(name: string, fallbackSeed: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  const seed = fallbackSeed.replace(/[^a-z0-9]+/gi, '').slice(0, 4).toLowerCase();
  return (base || `user${seed}`).slice(0, 30);
}
