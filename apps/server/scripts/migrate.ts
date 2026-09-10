/**
 * Minimal, dependency-free SQLite migration runner.
 *
 * Prisma's `migrate` CLI drives a Rust schema-engine subprocess over piped
 * stdio, which is unavailable in restricted sandboxes and CI images that forbid
 * named pipes. The *generated* SQL is still authored with Prisma
 * (`prisma migrate diff`), so the migrations stay canonical — only the apply
 * step is handled here with Node's built-in `node:sqlite` module.
 *
 * Usage:
 *   tsx scripts/migrate.ts           # apply pending migrations
 *   tsx scripts/migrate.ts --reset   # drop everything, then apply
 *   tsx scripts/migrate.ts --status  # print applied/pending migrations
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');
const migrationsDir = join(serverRoot, 'prisma', 'migrations');

for (const candidate of [join(serverRoot, '.env'), join(serverRoot, '..', '..', '.env')]) {
  if (existsSync(candidate)) loadDotenv({ path: candidate });
}

const url = process.env.DATABASE_URL ?? 'file:./dev.db';

function resolveDatabaseFile(connectionString: string): string {
  if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
    throw new Error(
      'migrate.ts only drives SQLite. For PostgreSQL run `pnpm db:use-postgres` and use `prisma migrate deploy`.',
    );
  }
  const raw = connectionString.replace(/^file:/, '');
  const absolute = /^([a-zA-Z]:[\\/]|\/)/.test(raw) ? raw : resolve(serverRoot, 'prisma', raw);
  return absolute;
}

function migrationFolders(): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const databaseFile = resolveDatabaseFile(url);
  const db = new DatabaseSync(databaseFile);

  db.exec(`
    CREATE TABLE IF NOT EXISTS "_orbit_migrations" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "appliedAt" TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  if (args.has('--reset')) {
    // SQLite cannot drop all tables in one statement; disable FKs and iterate.
    db.exec('PRAGMA foreign_keys = OFF;');
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all() as { name: string }[];
    for (const table of tables) {
      db.exec(`DROP TABLE IF EXISTS "${table.name}";`);
    }
    db.exec('PRAGMA foreign_keys = ON;');
    // The bookkeeping table was dropped along with everything else.
    db.exec(`
      CREATE TABLE IF NOT EXISTS "_orbit_migrations" (
        "name" TEXT NOT NULL PRIMARY KEY,
        "appliedAt" TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    console.log(`↺ Dropped ${tables.length} tables in ${databaseFile}`);
  }

  const applied = new Set(
    (db.prepare('SELECT name FROM "_orbit_migrations"').all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  const folders = migrationFolders();
  const pending = folders.filter((folder) => !applied.has(folder));

  if (args.has('--status')) {
    for (const folder of folders) {
      console.log(`${applied.has(folder) ? '✔ applied' : '· pending'}  ${folder}`);
    }
    db.close();
    return;
  }

  if (pending.length === 0) {
    console.log(`✔ Database is up to date (${folders.length} migrations) — ${databaseFile}`);
    db.close();
    return;
  }

  for (const folder of pending) {
    const file = join(migrationsDir, folder, 'migration.sql');
    if (!existsSync(file)) continue;
    const sql = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    db.exec('BEGIN');
    try {
      // node:sqlite executes multi-statement scripts directly.
      db.exec(sql);
      db.prepare('INSERT INTO "_orbit_migrations" ("name") VALUES (?)').run(folder);
      db.exec('COMMIT');
      const created = db
        .prepare(
          `SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
        )
        .get() as { n: number };
      console.log(`✔ applied ${folder} (${created.n} tables present)`);
    } catch (error) {
      db.exec('ROLLBACK');
      console.error(`✖ failed ${folder}`);
      throw error;
    }
  }

  db.close();
  console.log(`✔ Database ready — ${databaseFile}`);
}

main();
