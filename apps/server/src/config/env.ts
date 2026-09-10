import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
/** Repository layout: apps/server/src/config -> repo root is 4 levels up. */
const serverRoot = resolve(here, '..', '..');

// Load .env from the server package first, then fall back to the repo root.
for (const candidate of [resolve(serverRoot, '.env'), resolve(serverRoot, '..', '..', '.env')]) {
  if (existsSync(candidate)) loadDotenv({ path: candidate });
}

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('uploads'),
  EXPOSE_RESET_TOKEN: booleanish.default('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema> & {
  isProduction: boolean;
  isTest: boolean;
  corsOrigins: string[];
  uploadDirAbsolute: string;
  sessionTtlMs: number;
  resetTokenTtlMs: number;
};

function build(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    console.error(`\n✖ Invalid environment configuration:\n${details}\n`);
    console.error('  Copy apps/server/.env.example to apps/server/.env and try again.\n');
    process.exit(1);
  }
  const raw = parsed.data;

  if (raw.NODE_ENV === 'production' && raw.AUTH_SECRET.includes('dev-only-insecure')) {
    console.error('✖ Refusing to start in production with the default AUTH_SECRET. Set a real secret.');
    process.exit(1);
  }

  return {
    ...raw,
    isProduction: raw.NODE_ENV === 'production',
    isTest: raw.NODE_ENV === 'test',
    corsOrigins: raw.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    uploadDirAbsolute: resolve(serverRoot, raw.UPLOAD_DIR),
    sessionTtlMs: raw.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    resetTokenTtlMs: raw.RESET_TOKEN_TTL_MINUTES * 60 * 1000,
  };
}

export const env = build();
export const SESSION_COOKIE = 'orbit_session';
