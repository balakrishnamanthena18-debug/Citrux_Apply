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
