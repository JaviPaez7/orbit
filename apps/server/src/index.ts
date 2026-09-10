import { env } from './config/env.js';
import { buildApp } from './app.js';
import { prisma } from './db/client.js';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      `Orbit API ready on http://localhost:${env.PORT} (realtime: ws://localhost:${env.PORT}/api/realtime)`,
    );
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
