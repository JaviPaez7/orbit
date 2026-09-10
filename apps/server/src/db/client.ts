import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * A single Prisma client per process. `tsx watch` reloads modules, so the
 * instance is cached on globalThis to avoid exhausting SQLite connections.
 */
const globalForPrisma = globalThis as unknown as { __orbitPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__orbitPrisma ??
  new PrismaClient({
    log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!env.isProduction) globalForPrisma.__orbitPrisma = prisma;

/** Serializes a value for a String/Json column. */
export function toJsonColumn(value: unknown): string {
  return JSON.stringify(value ?? {});
}

/** Safely parses a JSON column, tolerating legacy/garbage values. */
export function fromJsonColumn<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
