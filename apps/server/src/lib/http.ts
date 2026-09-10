import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeAny, z } from 'zod';
import { AppError, ValidationError, zodToFieldErrors } from '../lib/errors.js';

/** Parses a Zod schema or throws a 422 with per-field messages. */
export function parseOrThrow<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Please fix the highlighted fields', zodToFieldErrors(result.error));
  }
  return result.data;
}

/**
 * Query strings arrive flat (`?status=todo&status=done`). This expands
 * comma-separated values and coerces booleans/numbers before Zod sees them.
 */
export function normalizeQuery(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value.flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : entry));
      continue;
    }
    if (typeof value === 'string') {
      if (value.includes(',')) {
        out[key] = value.split(',').filter((entry) => entry.length > 0);
        continue;
      }
      if (value === 'true') {
        out[key] = true;
        continue;
      }
      if (value === 'false') {
        out[key] = false;
        continue;
      }
      if (/^-?\d+$/.test(value) && ['limit', 'offset', 'days', 'number'].includes(key)) {
        out[key] = Number(value);
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

export function sendError(reply: FastifyReply, error: unknown) {
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
  throw error;
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send({
    error: {
      code: 'not_found',
      message: `No API route matches ${request.method} ${request.url}`,
    },
  });
}

/**
 * Drops `undefined` entries so a Prisma `update` payload never accidentally
 * clears a column, and returns the value typed as the caller's target shape.
 */
export function stripUndefined<T extends object>(input: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}
