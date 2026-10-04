/**
 * Controlled soft-nav prefetch allowlist.
 * Only high-traffic operational destinations — never blanket prefetch.
 */
export const EMPLOYEE_PREFETCH_ROUTES = [
  "/employee/applications",
  "/employee/application-log",
  "/employee/jobs",
  "/employee/candidates",
  "/employee/tasks",
  "/employee/messages",
] as const;

export const CANDIDATE_PREFETCH_ROUTES = [
  "/candidate",
  "/candidate/applications",
  "/candidate/messages",
] as const;

export const ADMIN_PREFETCH_ROUTES = [
  "/employee/applications",
  "/employee/application-log",
  "/employee/jobs",
  "/employee/candidates",
  "/employee/tasks",
  "/employee/messages",
  "/admin/dashboard",
  "/admin/members",
] as const;

const ALLOWED = new Set<string>([
  ...EMPLOYEE_PREFETCH_ROUTES,
  ...CANDIDATE_PREFETCH_ROUTES,
  ...ADMIN_PREFETCH_ROUTES,
]);

/** Exact path or first-segment list roots only (not deep dossier URLs). */
export function shouldPrefetchHref(href: string): boolean {
  if (!href || href.startsWith("#") || href.startsWith("http")) return false;
  const path = href.split("?")[0]?.split("#")[0] || "";
  return ALLOWED.has(path);
}
