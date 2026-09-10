/**
 * Global setup: prepares a dedicated SQLite database for the E2E run and seeds
 * it with the demo data, so tests never interfere with a developer's dev.db.
 *
 * The Prisma schema is applied by the repo's own migration runner
 * (`apps/server/scripts/migrate.ts`), which uses Node's built-in `node:sqlite`
 * instead of spawning Prisma's schema engine.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..', '..', 'server');
const databaseFile = join(serverRoot, 'prisma', 'e2e.db');

export default function globalSetup(): void {
  for (const file of [databaseFile, `${databaseFile}-journal`]) {
    if (existsSync(file)) rmSync(file, { force: true });
  }

  const env = {
    ...process.env,
    DATABASE_URL: 'file:./e2e.db',
    NODE_ENV: 'test',
    AUTH_SECRET: 'e2e-secret-0123456789abcdef0123456789abcdef',
  };

  const run = (script: string) =>
    execFileSync('pnpm', ['exec', 'tsx', script], {
      cwd: serverRoot,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

  run('scripts/migrate.ts');
  run('prisma/seed.ts');
}
