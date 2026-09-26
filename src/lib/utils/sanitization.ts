const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "access_token",
  "refresh_token",
]);

/**
 * Recursively redacts sensitive keys from objects before logging or audit persistence.
 */
export function sanitizeObject(obj: unknown): Record<string, unknown> | undefined {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return undefined;
  }

  if (Array.isArray(obj)) {
    return { items: obj.map((item) => (typeof item === "object" ? sanitizeObject(item) : item)) };
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => (typeof item === "object" ? sanitizeObject(item) : item));
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export { sanitizeObject as sanitizeMetadata };
