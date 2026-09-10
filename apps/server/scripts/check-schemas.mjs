import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Verifies the API still compiles against **both** Prisma schemas.
 *
 * The two schemas describe the same data model with different Prisma types
 * (native enums and `Json` columns on PostgreSQL, `String` on SQLite). A change
 * that type-checks locally against the SQLite default can therefore still break
 * the production build — which is exactly what happened before this guard
 * existed. Run it after touching `apps/server/src` or either schema:
 *
 *   pnpm --filter @orbit/server build:check-schemas
 */

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..');
const prismaDir = join(serverRoot, 'prisma');
const liveSchema = join(prismaDir, 'schema.prisma');

const startedWithPostgres = readFileSync(liveSchema, 'utf8').includes('provider = "postgresql"');

const variants = [
  {
    label: 'SQLite (development default)',
    file: join(prismaDir, 'schema.sqlite.prisma'),
    url: 'file:./dev.db',
  },
  {
    label: 'PostgreSQL (production)',
    file: join(prismaDir, 'schema.postgres.prisma'),
    url: 'postgresql://check:check@127.0.0.1:5432/check?schema=public',
  },
];

function run(command, args, databaseUrl) {
  execFileSync(command, args, {
    cwd: serverRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

let failed = false;
try {
  for (const variant of variants) {
    copyFileSync(variant.file, liveSchema);
    process.stdout.write(`\n▶ generate + typecheck with ${variant.label}\n`);
    run('pnpm', ['exec', 'prisma', 'generate'], variant.url);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json', '--noEmit'], variant.url);
  }
} catch {
  failed = true;
} finally {
  // Leave the checkout exactly as it was found.
  copyFileSync(startedWithPostgres ? variants[1].file : variants[0].file, liveSchema);
  run('pnpm', ['exec', 'prisma', 'generate'], variants[0].url);
}

if (failed) {
  console.error('\n✖ The API does not compile against both Prisma schemas.');
  process.exit(1);
}
console.log('\n✔ The API compiles against the SQLite and PostgreSQL Prisma clients.');
