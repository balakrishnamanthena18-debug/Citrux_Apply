import { ProviderError } from "./errors";

const FORBIDDEN_CONTEXT_KEYS = [
  "apiKey",
  "api_key",
  "authorization",
  "password",
  "secret",
  "token",
  "NVIDIA_API_KEY",
  "internalNotes",
  "internal_notes",
  "staffNotes",
  "conversationMessages",
  "allCandidates",
  "allJobs",
  "tenantDump",
] as const;

const MAX_CONTEXT_JSON_CHARS = 24_000;

/**
 * Gate 3 context boundary: only minimum scoped fields may reach the provider.
 * Rejects secrets, tenant-wide dumps, and oversized payloads.
 */
export function assertProviderScopedContextAllowed(
  scopedContext: Record<string, unknown>
): void {
  for (const key of Object.keys(scopedContext)) {
    if (
      FORBIDDEN_CONTEXT_KEYS.some((b) => key.toLowerCase() === b.toLowerCase())
    ) {
      throw new ProviderError(
        "CONTEXT_BOUNDARY_VIOLATION",
        "Provider context contains a forbidden key",
        { retryable: false, details: { key } }
      );
    }
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(scopedContext);
  } catch {
    throw new ProviderError(
      "CONTEXT_BOUNDARY_VIOLATION",
      "Provider context is not serializable",
      { retryable: false }
    );
  }

  if (serialized.length > MAX_CONTEXT_JSON_CHARS) {
    throw new ProviderError(
      "CONTEXT_BOUNDARY_VIOLATION",
      "Provider context exceeds size limit",
      { retryable: false, details: { size: serialized.length } }
    );
  }
}

/**
 * Strip forbidden keys defensively before transport.
 * Does not invent fields.
 */
export function sanitizeProviderScopedContext(
  scopedContext: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(scopedContext)) {
    if (FORBIDDEN_CONTEXT_KEYS.some((b) => k.toLowerCase() === b.toLowerCase())) {
      continue;
    }
    out[k] = v;
  }
  assertProviderScopedContextAllowed(out);
  return out;
}
