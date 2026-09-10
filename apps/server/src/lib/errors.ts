import { ZodError } from 'zod';

export type ErrorCode =
  | 'bad_request'
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error'
  | 'payload_too_large';

export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly fields?: FieldErrors;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { fields?: FieldErrors; details?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.fields = options.fields;
    this.details = options.details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(400, 'bad_request', message, { details });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', fields?: FieldErrors, details?: unknown) {
    super(422, 'validation_error', message, { fields, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'You must be signed in to do that') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Your workspace role does not allow this action') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'not_found', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'That change conflicts with the current state') {
    super(409, 'conflict', message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests — slow down for a moment') {
    super(429, 'rate_limited', message);
  }
}

/** Maps a ZodError into stable, client-consumable field errors. */
export function zodToFieldErrors(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/** Narrows a caught value to something carrying an HTTP status + code. */
export function isAppError(
  error: unknown,
): error is Error & { statusCode: number; code: string; fields?: FieldErrors } {
  return (
    error instanceof Error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number' &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

export function isPrismaKnownError(
  error: unknown,
): error is { code: string; meta?: { target?: string[]; field_name?: string } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('P')
  );
}

/** Turns Prisma failures into user-meaningful API errors. */
export function translatePrismaError(error: unknown): AppError | null {
  if (!isPrismaKnownError(error)) return null;
  switch (error.code) {
    case 'P2002': {
      const target = error.meta?.target?.join(', ') ?? 'value';
      return new ConflictError(`That ${target} is already taken`);
    }
    case 'P2003':
      return new BadRequestError('Referenced record does not exist');
    case 'P2025':
      return new NotFoundError();
    case 'P2014':
      return new BadRequestError('That change would break a required relation');
    default:
      return null;
  }
}
