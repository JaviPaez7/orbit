import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import {
  AppError,
  RateLimitError,
  isAppError,
  translatePrismaError,
  zodToFieldErrors,
} from './lib/errors.js';
import { notFoundHandler } from './lib/http.js';
import infrastructure from './plugins/infrastructure.js';
import { setNotificationPublisher } from './services/notification.service.js';
import { realtimeHub } from './services/realtime.service.js';
import { registerRoutes } from './routes/index.js';

export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: env.isTest ? 'warn' : env.LOG_LEVEL,
            transport: env.isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
                },
          },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  // ---- error handling ------------------------------------------------------
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: {
          code: 'validation_error',
          message: 'Please fix the highlighted fields',
          fields: zodToFieldErrors(error),
        },
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          fields: error.fields,
          details: error.details,
        },
      });
    }

    if (isAppError(error) && error.statusCode === 429) {
      const rateError = new RateLimitError();
      return reply.status(429).send({
        error: { code: rateError.code, message: rateError.message },
      });
    }

    if (isAppError(error) && error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({
        error: { code: 'payload_too_large', message: 'Files must be 5MB or smaller' },
      });
    }

    const prismaError = translatePrismaError(error);
    if (prismaError) {
      return reply.status(prismaError.statusCode).send({
        error: { code: prismaError.code, message: prismaError.message },
      });
    }

    request.log.error({ err: error }, 'unhandled request error');
    const message = env.isProduction
      ? 'Something went wrong on our side'
      : error instanceof Error
        ? error.message
        : 'Unknown error';
    return reply.status(500).send({ error: { code: 'internal_error', message } });
  });

  app.setNotFoundHandler(notFoundHandler);

  await app.register(infrastructure);

  // Realtime notifications are delivered through the hub.
  setNotificationPublisher((event) => realtimeHub.broadcast(event));

  app.get('/health', async () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    connections: realtimeHub.connectionCount(),
    env: env.NODE_ENV,
  }));

  await app.register(registerRoutes, { prefix: '/api' });

  return app;
}
