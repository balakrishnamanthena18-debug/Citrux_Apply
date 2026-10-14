/**
 * Deterministic date formatting for application cards.
 *
 * Uses UTC calendar parts (not locale/timezone defaults) so the SSR
 * markup matches the client's first paint and avoids hydration warnings.
 */

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type FormatApplicationCardDateOptions = {
  /** Include year (default true). */
  year?: boolean;
};

export function formatApplicationCardDate(
  value: string | Date,
  options: FormatApplicationCardDateOptions = {}
): string {
  const includeYear = options.year !== false;
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  const month = SHORT_MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();

  if (!includeYear) {
    return `${month} ${day}`;
  }

  return `${month} ${day}, ${date.getUTCFullYear()}`;
}

/**
 * Human-friendly relative or calendar date for application cards.
 * e.g. "Just now", "15m ago", "2h ago", "Yesterday", "Oct 6"
 */
export function formatApplicationRelativeDate(
  value: string | Date,
  nowMs: number = Date.now()
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  const diffMs = Math.max(0, nowMs - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return "Just now";
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return formatApplicationCardDate(date, { year: false });
}

/**
 * Deterministic time formatting for activity feed and event cards.
 * Uses UTC parts to guarantee SSR and client HTML match identically.
 */
export function formatApplicationCardTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${minutes} ${period} UTC`;
}

/**
 * Deterministic combined date and time formatting (e.g. "Oct 6, 2026 · 5:42 PM UTC").
 * Guarantees zero SSR hydration divergence.
 */
export function formatApplicationDateTime(
  value: string | Date,
  options: { includeTime?: boolean } = {}
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  const datePart = formatApplicationCardDate(date, { year: true });
  if (options.includeTime === false) {
    return datePart;
  }
  const timePart = formatApplicationCardTime(date);
  return timePart ? `${datePart} · ${timePart}` : datePart;
}
