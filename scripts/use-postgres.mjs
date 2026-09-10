#!/usr/bin/env node
/**
 * Switches the Prisma datasource between SQLite (default, zero setup) and
 * PostgreSQL (production). Both schema files are maintained in lock-step and
 * `apps/server/tests/schema-parity.test.ts` asserts they cannot drift.
 *
 *   node scripts/use-postgres.mjs          # switch to postgresql
 *   node scripts/use-postgres.mjs sqlite   # switch back
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prismaDir = join(root, 'apps', 'server', 'prisma');
const target = join(prismaDir, 'schema.prisma');

const mode = (process.argv[2] ?? 'postgres').toLowerCase();
const source = mode === 'sqlite' ? join(prismaDir, 'schema.sqlite.prisma') : join(prismaDir, 'schema.postgres.prisma');

// The SQLite schema is the checked-in `schema.prisma`; keep a pristine copy the
// first time we switch away so switching back is lossless.
const sqliteSnapshot = join(prismaDir, 'schema.sqlite.prisma');
if (mode !== 'sqlite' && !existsSync(sqliteSnapshot)) {
  copyFileSync(target, sqliteSnapshot);
}

if (!existsSync(source)) {
  console.error(`✖ Missing ${source}`);
  process.exit(1);
}

copyFileSync(source, target);
console.log(`✔ prisma/schema.prisma now uses ${mode === 'sqlite' ? 'SQLite' : 'PostgreSQL'}`);
console.log('  next: pnpm db:generate && pnpm db:migrate (or pnpm db:push)');
if (mode !== 'sqlite') {
  console.log('  ensure DATABASE_URL points at your PostgreSQL instance, e.g.');
  console.log('  postgresql://orbit:orbit@localhost:5432/orbit?schema=public');
}
