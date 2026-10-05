/**
 * Normalized provider failures. Never embed API keys or raw auth headers.
 */

export const PROVIDER_ERROR_CODES = [
  "CONFIGURATION_ERROR",
  "CONFIGURATION_REQUIRED",
  "AUTHENTICATION_ERROR",
  "RATE_LIMITED",
  "TIMEOUT",
  "NETWORK_ERROR",
  "PROVIDER_ERROR",
  "INVALID_RESPONSE",
  "SCHEMA_VALIDATION_ERROR",
  "TRUTH_VALIDATION_ERROR",
  "CONTEXT_BOUNDARY_VIOLATION",
  "FEATURE_NOT_AUTHORIZED",
  "PERMANENT_CLIENT_ERROR",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly requestId?: string | null;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ProviderErrorCode,
    message: string,
    options?: {
      retryable?: boolean;
      httpStatus?: number;
      requestId?: string | null;
      details?: Record<string, unknown>;
      cause?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.httpStatus = options?.httpStatus;
    this.requestId = options?.requestId ?? null;
    this.details = sanitizeProviderErrorDetails(options?.details);
  }
}

export function sanitizeProviderErrorDetails(
  details?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const banned = [
    "apiKey",
    "api_key",
    "authorization",
    "Authorization",
    "password",
    "secret",
    "token",
    "NVIDIA_API_KEY",
  ];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (banned.some((b) => k.toLowerCase().includes(b.toLowerCase()))) continue;
    if (typeof v === "string" && /nvapi-|bearer\s+/i.test(v)) continue;
    out[k] = v;
  }
  return out;
}

export function isTransientProviderFailure(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return false;
  return error.retryable;
}
