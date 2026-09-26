export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE_TRANSITION"
  | "DATABASE_ERROR"
  | "EXTERNAL_SERVICE_ERROR"
  | "INTERNAL_SERVER_ERROR";

export interface SafeErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown[];
  };
}

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly statusCode: number;
  readonly details?: unknown[];

  constructor(message: string, details?: unknown[]) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toResponse(): SafeErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && this.details.length > 0 ? { details: this.details } : {}),
      },
    };
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR";
  readonly statusCode = 400;
}

export class AuthenticationError extends AppError {
  readonly code = "AUTHENTICATION_ERROR";
  readonly statusCode = 401;
}

export class AuthorizationError extends AppError {
  readonly code = "AUTHORIZATION_ERROR";
  readonly statusCode = 403;
}

export { AuthenticationError as UnauthorizedError, AuthorizationError as ForbiddenError };

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";
  readonly statusCode = 404;
}

export class ConflictError extends AppError {
  readonly code = "CONFLICT";
  readonly statusCode = 409;
}

export class InvalidStateTransitionError extends AppError {
  readonly code = "INVALID_STATE_TRANSITION";
  readonly statusCode = 422;
}

export class DatabaseError extends AppError {
  readonly code = "DATABASE_ERROR";
  readonly statusCode = 500;
}

export class ExternalServiceError extends AppError {
  readonly code = "EXTERNAL_SERVICE_ERROR";
  readonly statusCode = 502;
}

export class UnexpectedError extends AppError {
  readonly code = "INTERNAL_SERVER_ERROR";
  readonly statusCode = 500;
}

export function formatErrorResponse(error: unknown): { status: number; body: SafeErrorResponse } {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: error.toResponse(),
    };
  }

  // Fallback for untyped unexpected exceptions (sanitize internal details)
  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected internal server error occurred.",
      },
    },
  };
}
