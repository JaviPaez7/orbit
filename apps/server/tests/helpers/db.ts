import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
export const serverRoot = join(here, '..');
export const migrationsDir = join(serverRoot, 'prisma', 'migrations');

/**
 * Creates a fresh SQLite database for a test module.
 *
 * Prisma's `migrate`/`db push` CLIs drive a Rust schema-engine subprocess over
 * piped stdio, which is unavailable in some sandboxes, so the canonical SQL
 * produced by `prisma migrate diff` is applied here with Node's built-in
 * `node:sqlite`. Identical DDL, no subprocess.
 */
export function createTestDatabase(name: string): string {
  const file = join(serverRoot, 'prisma', `${name}.db`);
  for (const candidate of [file, `${file}-journal`]) {
    if (existsSync(candidate)) rmSync(candidate, { force: true });
  }

  const db = new DatabaseSync(file);
  const folders = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const folder of folders) {
    const sqlFile = join(migrationsDir, folder, 'migration.sql');
    if (!existsSync(sqlFile)) continue;
    db.exec(readFileSync(sqlFile, 'utf8').replace(/^\uFEFF/, ''));
  }
  db.close();
  return file;
}

export function removeTestDatabase(file: string): void {
  for (const candidate of [file, `${file}-journal`]) {
    if (existsSync(candidate)) rmSync(candidate, { force: true });
  }
}
