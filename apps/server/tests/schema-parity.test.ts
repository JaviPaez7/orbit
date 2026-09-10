import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard against schema drift.
 *
 * `schema.prisma` (SQLite, the zero-setup default) and
 * `schema.postgres.prisma` (production) must describe the same data model.
 * They are allowed to differ only in ways the datasource forces:
 *
 *   * the `provider` / datasource block
 *   * enum definitions, which SQLite has no concept of (the PostgreSQL schema
 *     declares them and references them by name; SQLite stores the same values
 *     as short strings)
 *   * `Json` vs `String` for JSON-encoded columns
 *
 * Everything else — every model, every field, every attribute and every index —
 * must match, otherwise switching a deployment to PostgreSQL could silently
 * change behaviour.
 */

const here = dirname(fileURLToPath(import.meta.url));
const prismaDir = join(here, '..', 'prisma');

interface Field {
  name: string;
  type: string;
  attributes: string;
}

interface Model {
  name: string;
  fields: Field[];
  blockAttributes: string[];
}

/** Minimal, dependency-free Prisma schema reader (enough for this parity check). */
function parseSchema(source: string): { models: Model[]; enums: string[] } {
  const withoutComments = source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  const enums: string[] = [];

  const models: Model[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  for (const match of withoutComments.matchAll(modelRegex)) {
    const name = match[1]!;
    const body = match[2]!;
    const fields: Field[] = [];
    const blockAttributes: string[] = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      if (line.startsWith('@@')) {
        // Normalise whitespace inside block attributes so formatting differences
        // do not fail the comparison.
        blockAttributes.push(line.replace(/\s+/g, ' '));
        continue;
      }

      const fieldMatch = line.match(/^(\w+)\s+([\w[\]?]+)(.*)$/);
      if (!fieldMatch) continue;
      fields.push({
        name: fieldMatch[1]!,
        type: fieldMatch[2]!,
        attributes: (fieldMatch[3] ?? '').trim().replace(/\s+/g, ' '),
      });
    }

    models.push({ name, fields, blockAttributes: blockAttributes.sort() });
  }

  const enumRegex = /enum\s+(\w+)\s*\{/g;
  for (const match of withoutComments.matchAll(enumRegex)) enums.push(match[1]!);

  return { models, enums };
}

/** Maps a PostgreSQL-native type back to the SQLite representation. */
function normalizeType(type: string, postgresEnums: Set<string>): string {
  if (postgresEnums.has(type)) return 'String';
  if (type === 'Json') return 'String';
  return type;
}

/**
 * Normalises attribute text so the comparison ignores syntax the datasource
 * forces. Two documented differences exist:
 *
 *   * SQLite writes enum defaults as `@default("member")`; PostgreSQL writes the
 *     native enum form `@default(member)`. Both store `member`.
 *   * SQLite stores JSON columns as `String` with `@default("[]")`; PostgreSQL
 *     uses the native `Json` type where the same literal is written
 *     `@default("[]")` too — but Prisma also accepts the bare literal form, so
 *     the quotes are stripped before comparing.
 */
function normalizeAttributes(attributes: string): string {
  return attributes
    .replace(/@default\("([^"]*)"\)/g, '@default($1)')
    .replace(/@default\(\{\}\)/, '@default({})');
}

/** Normalises a JSON literal default so `[]`, `{}` and their quoted forms match. */
function normalizeJsonDefault(attributes: string): string {
  return attributes.replace(/@default\("?(\[\]|\{\})"?\)/, '@default($1)');
}

const sqlite = parseSchema(readFileSync(join(prismaDir, 'schema.prisma'), 'utf8'));
const postgres = parseSchema(readFileSync(join(prismaDir, 'schema.postgres.prisma'), 'utf8'));
const postgresEnums = new Set(postgres.enums);

describe('Prisma schema parity (SQLite vs PostgreSQL)', () => {
  it('declares the same models', () => {
    const sqliteModels = sqlite.models.map((model) => model.name).sort();
    const postgresModels = postgres.models.map((model) => model.name).sort();
    expect(postgresModels).toEqual(sqliteModels);
    expect(sqliteModels.length).toBeGreaterThanOrEqual(15);
  });

  it('declares the same fields, in the same order, on every model', () => {
    const byName = new Map(postgres.models.map((model) => [model.name, model]));

    for (const model of sqlite.models) {
      const counterpart = byName.get(model.name);
      expect(counterpart, `model ${model.name} missing from the PostgreSQL schema`).toBeDefined();

      const sqliteFields = model.fields.map((field) => ({
        name: field.name,
        type: field.type,
        attributes: normalizeJsonDefault(normalizeAttributes(field.attributes)),
      }));
      const postgresFields = counterpart!.fields.map((field) => ({
        name: field.name,
        type: normalizeType(field.type, postgresEnums),
        attributes: normalizeJsonDefault(normalizeAttributes(field.attributes)),
      }));

      expect(postgresFields, `field mismatch on model ${model.name}`).toEqual(sqliteFields);
    }
  });

  it('declares the same indexes, unique constraints and ids', () => {
    const byName = new Map(postgres.models.map((model) => [model.name, model]));
    for (const model of sqlite.models) {
      expect(
        byName.get(model.name)!.blockAttributes,
        `block attribute mismatch on model ${model.name}`,
      ).toEqual(model.blockAttributes);
    }
  });

  it('only lets the datasource provider differ', () => {
    const sqliteProvider = /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/.exec(
      readFileSync(join(prismaDir, 'schema.prisma'), 'utf8'),
    )?.[1];
    const postgresProvider = /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/.exec(
      readFileSync(join(prismaDir, 'schema.postgres.prisma'), 'utf8'),
    )?.[1];

    expect(sqliteProvider).toBe('sqlite');
    expect(postgresProvider).toBe('postgresql');
  });

  it('mirrors every workflow constant as a PostgreSQL enum', () => {
    // The string values stored on SQLite are the enum members on PostgreSQL.
    for (const enumName of [
      'IssueStatus',
      'IssuePriority',
      'ProjectStatus',
      'CycleStatus',
      'WorkspaceRole',
      'IssueRelationType',
      'NotificationType',
      'ActivityAction',
      'ActivityEntityType',
    ]) {
      expect(postgresEnums.has(enumName), `missing enum ${enumName}`).toBe(true);
    }
  });
});
