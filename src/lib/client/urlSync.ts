/**
 * urlSync.ts
 *
 * Provides non-destructive, zero-latency URL query parameter synchronization
 * using window.history.replaceState.
 *
 * This allows deep-linking and browser navigation state to remain synchronized
 * without triggering Next.js React Server Component (RSC) round-trips or
 * full-page server re-renders for purely client-resolvable UI state.
 */

export function syncUrlParams(params: Record<string, string | number | boolean | null | undefined>): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const newRelativePathQuery = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "");
  window.history.replaceState(null, "", newRelativePathQuery);
}

export function getInitialParam(key: string, defaultValue: string = ""): string {
  if (typeof window === "undefined") return defaultValue;
  const url = new URL(window.location.href);
  return url.searchParams.get(key) || defaultValue;
}
