import { describe, it, expect } from "vitest";
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InvalidStateTransitionError,
  DatabaseError,
  ExternalServiceError,
  UnexpectedError,
  formatErrorResponse,
} from "@/lib/errors";

describe("Standardized Error Taxonomy (src/lib/errors/index.ts)", () => {
  it("correctly instantiates and serializes ValidationError (HTTP 400)", () => {
    const err = new ValidationError("Invalid email address", [{ field: "email", message: "Invalid format" }]);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.toResponse()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid email address",
        details: [{ field: "email", message: "Invalid format" }],
      },
    });
  });

  it("correctly maps AuthenticationError to HTTP 401", () => {
    const err = new AuthenticationError("Invalid authentication credentials");
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("AUTHENTICATION_ERROR");
  });

  it("correctly maps AuthorizationError to HTTP 403", () => {
    const err = new AuthorizationError("Access denied");
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("AUTHORIZATION_ERROR");
  });

  it("correctly maps NotFoundError to HTTP 404", () => {
    const err = new NotFoundError("Resource not found");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("correctly maps ConflictError to HTTP 409", () => {
    const err = new ConflictError("Resource already exists");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });

  it("correctly maps InvalidStateTransitionError to HTTP 422", () => {
    const err = new InvalidStateTransitionError("Transition disallowed");
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("correctly maps DatabaseError to HTTP 500", () => {
    const err = new DatabaseError("Database failure");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("DATABASE_ERROR");
  });

  it("correctly maps ExternalServiceError to HTTP 502", () => {
    const err = new ExternalServiceError("Upstream provider failure");
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe("EXTERNAL_SERVICE_ERROR");
  });

  it("correctly maps UnexpectedError to HTTP 500", () => {
    const err = new UnexpectedError("Internal error");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("sanitizes untyped raw errors via formatErrorResponse", () => {
    const rawError = new Error("FATAL: database connection password=secret leaked in raw error");
    const formatted = formatErrorResponse(rawError);

    expect(formatted.status).toBe(500);
    expect(formatted.body).toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected internal server error occurred.",
      },
    });
  });
});
