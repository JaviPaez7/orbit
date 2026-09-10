/**
 * Vitest global setup: points the whole test run at a dedicated SQLite file and
 * creates its schema before any module imports the Prisma client.
 *
 * `globalSetup` runs in the parent process, so the environment variables set
 * here are inherited by every worker.
 */
import { createTestDatabase } from './helpers/db';

export default function setup(): void {
  const databaseFile = createTestDatabase('test');
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = `file:${databaseFile.replace(/\\/g, '/')}`;
  process.env.AUTH_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
  process.env.LOG_LEVEL = 'silent';
  process.env.EXPOSE_RESET_TOKEN = 'true';
  process.env.UPLOAD_DIR = 'uploads-test';
  process.env.SESSION_TTL_DAYS = '30';
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.APP_URL = 'http://localhost:5173';
}
