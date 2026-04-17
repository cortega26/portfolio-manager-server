// server/types/errors.ts
// Unified error domain used by all Fastify handlers.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly expose: boolean;

  constructor(
    message: string,
    {
      statusCode = 500,
      code = 'INTERNAL_ERROR',
      details,
      expose,
    }: {
      statusCode?: number;
      code?: string;
      details?: unknown;
      expose?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose ?? statusCode < 500;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, { statusCode: 404, code, expose: true });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(
    message = 'Validation failed',
    details?: unknown,
    code = 'VALIDATION_ERROR',
  ) {
    super(message, { statusCode: 400, code, details, expose: true });
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, { statusCode: 401, code, expose: true });
    this.name = 'AuthError';
  }
}
