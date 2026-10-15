/**
 * Server-Side Authentication Input Sanitization & Safety Utility
 *
 * Provides safe HTML tag, script block, style tag, null byte, and control
 * character detection and stripping for untrusted text inputs.
 *
 * CRITICAL SECURITY INVARIANT:
 * Passwords must NEVER be sanitized, stripped, or transformed in any way.
 * Legitimate complex passwords legitimately contain symbols, HTML characters
 * (<, >), spaces, quotes, braces, and backslashes. Passwords must be validated
 * strictly for type, null bytes, and length bounds without mutation.
 */

// Matches <script>...</script> blocks across multiple lines (case-insensitive)
const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;

// Matches <style>...</style> blocks across multiple lines (case-insensitive)
const STYLE_REGEX = /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi;

// Matches standard HTML/XML tags
const HTML_TAG_REGEX = /<[^>]+>/g;

// Matches ASCII control characters (excluding standard whitespace \t, \n, \r)
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Matches null bytes specifically
const NULL_BYTE_REGEX = /\0/g;

/**
 * Checks whether an untrusted input contains HTML or script tags.
 */
export function containsHtmlOrScripts(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  return (
    SCRIPT_REGEX.test(value) ||
    STYLE_REGEX.test(value) ||
    HTML_TAG_REGEX.test(value) ||
    NULL_BYTE_REGEX.test(value)
  );
}

/**
 * Strips HTML tags, script blocks, style tags, and dangerous control characters from raw strings.
 */
export function stripHtmlAndScripts(value: string): string {
  if (!value || typeof value !== "string") return "";
  return value
    .replace(NULL_BYTE_REGEX, "")
    .replace(SCRIPT_REGEX, "")
    .replace(STYLE_REGEX, "")
    .replace(HTML_TAG_REGEX, "")
    .replace(CONTROL_CHARS_REGEX, "");
}

/**
 * Sanitizes general display names while preserving legitimate international characters,
 * apostrophes (e.g. O'Connor, D'Souza), hyphens, periods, and accents (e.g. René, Müller).
 */
export function sanitizeDisplayName(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = stripHtmlAndScripts(value).trim();
  // Strip dangerous injection characters (<, >, ", `, /, \, ;, {, }, [, ], ^, |, ~)
  // Preserves letters (including unicode), numbers, spaces, apostrophes (' ’), hyphens, and periods
  return cleaned
    .replace(/[<>"'`/\\;{}\[\]^|~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
