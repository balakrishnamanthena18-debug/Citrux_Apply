/**
 * Input Sanitization & Security Utilities
 *
 * Enforces strict sanitization to prevent:
 * 1. Script Injection & Stored XSS (HTML escaping)
 * 2. Path Traversal & Unsafe File Uploads (Filename sanitization)
 * 3. Open Redirects (URL sanitization)
 * 4. Resource Exhaustion / Denial of Service (Pagination & string bounds)
 * 5. Sensitive data exposure in logs (Metadata redaction)
 */

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
  "servicerolekey",
  "service_role_key",
  "database_url",
  "direct_url",
]);

/**
 * HTML entities mapping for XSS prevention.
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
};

/**
 * Escapes dangerous HTML characters to prevent cross-site scripting (XSS).
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";
  return input.replace(/[&<>"'/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Sanitizes input strings by stripping null bytes, ANSI escapes, and dangerous control characters.
 */
export function sanitizeString(input: string | null | undefined, maxLength: number = 5000): string {
  if (!input || typeof input !== "string") return "";
  // Strip null bytes and non-printable control characters (except newline, tab, carriage return)
  const cleaned = input
    .replace(/\0/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
  return cleaned.slice(0, maxLength);
}

/**
 * Sanitizes uploaded filenames to prevent path traversal attacks and arbitrary file overwrites.
 * Strips directory separators, null bytes, parent traversal (".."), and dangerous script extensions.
 */
export function sanitizeFilename(filename: string | null | undefined): string {
  if (!filename || typeof filename !== "string") return "document";

  // 1. Strip null bytes and path separators
  let name = filename
    .replace(/\0/g, "")
    .replace(/\\/g, "/")
    .split("/")
    .pop() || "document";

  // 2. Remove path traversal sequences and non-whitelisted characters
  name = name
    .replace(/\.\.+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .trim();

  // 3. Prevent hidden files or extension-only names
  if (name.startsWith(".") || name.length === 0) {
    name = `file_${name.replace(/^\.+/, "") || "doc"}`;
  }

  return name.slice(0, 255);
}

/**
 * Validates and sanitizes redirect destination paths to prevent Open Redirect vulnerabilities.
 * Ensures the target is strictly an internal relative path on the same origin.
 */
export function sanitizeRedirectUrl(
  targetUrl: string | null | undefined,
  defaultFallback: string = "/"
): string {
  if (!targetUrl || typeof targetUrl !== "string") {
    return defaultFallback;
  }

  const trimmed = targetUrl.trim();

  // Must start with a single "/" and NOT start with "//" or contain backslashes / protocol schemes
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\") &&
    !trimmed.includes("://") &&
    !trimmed.toLowerCase().startsWith("javascript:") &&
    !trimmed.toLowerCase().startsWith("data:")
  ) {
    return trimmed;
  }

  return defaultFallback;
}

/**
 * Validates and bounds pagination limits to prevent memory exhaustion / DoS.
 */
export function sanitizePaginationLimit(
  rawLimit: string | number | null | undefined,
  defaultValue: number = 15,
  maxLimit: number = 100
): number {
  const parsed = typeof rawLimit === "number" ? rawLimit : parseInt(String(rawLimit || defaultValue), 10);
  if (isNaN(parsed) || parsed < 1) {
    return defaultValue;
  }
  return Math.min(parsed, maxLimit);
}

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
