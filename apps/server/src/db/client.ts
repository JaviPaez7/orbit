import { PrismaClient } from '@prisma/client';

/**
 * A single Prisma client per process. `tsx watch` reloads modules, so the
 * instance is cached on globalThis to avoid exhausting database connections.
 */
const globalForPrisma = globalThis as unknown as { __orbitPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__orbitPrisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__orbitPrisma = prisma;

/**
 * JSON column helpers live in `lib/db-values` and are re-exported here for the
 * call sites that already import them from the client module. They exist because
 * JSON columns are `String` on SQLite and `Json` on PostgreSQL.
 */
export { readJsonColumn, writeJsonColumn } from '../lib/db-values.js';
