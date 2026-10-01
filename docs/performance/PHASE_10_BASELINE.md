# Phase 10 — Baseline (Pre-Implementation)

**Status:** BASELINE ONLY  
**Date:** 2026-10-01  
**Source of truth:** `docs/performance/CURRENT_FORENSIC_PERFORMANCE_AUDIT.md` + current repository inspection  
**Latency measurements:** NOT MEASURED (no production browser capture in this baseline)

---

## Objective of this document

Capture the navigation Time-to-Usable state **before** Phase 10 code changes, so before/after comparisons remain honest.

---

## Current navigation architecture

```
Browser Link click (AppSidebar next/link)
  → middleware: supabase.auth.getUser()
  → (dashboard)/layout: getAuthenticatedContext()
       cookies + getUser + withRlsContext(membership)
  → AppShell (client) + RealtimeRefresher + NotificationsBell@10s
  → page: getAuthenticatedContext() [React.cache hit]
       + withRlsContext(page queries)
  → RSC payload → hydrate workbench
  → Time to Usable
```

- Soft RSC navigation (not full document reload) for dashboard↔dashboard.
- `TransitionLink` exists but is **unused**.
- AppShell is a client wrapper around `{children}` inside dashboard layout.

---

## Affected routes

| Role surface | Routes |
|---|---|
| Candidate | `/candidate`, `/applications`, `/messages`, `/profile`, `/privacy` |
| Employee | `/employee`, `/applications`, `/tasks`, `/candidates`, `/jobs`, `/application-log`, `/messages` |
| Admin | `/admin`, `/dashboard`, `/applications`, `/members`, `/tasks/escalations`, `/audit`, `/privacy`, `/settings/*` |

---

## Existing loading boundaries

| Boundary | Status |
|---|---|
| `src/app/**/loading.tsx` | **ABSENT (0 files)** |
| Suspense around page data | Not used for route segments |
| `WorkbenchLoadingState` | Client-only; does not cover route transitions |
| `error.tsx` | Present at `(dashboard)/error.tsx` only |

**Dead air:** Click → no skeleton → wait for full RSC.

---

## Existing refresh mechanisms

| Mechanism | Locations | Notes |
|---|---|---|
| `revalidatePath(..., "layout")` | application, submission, qa, communication, candidate, task actions | Broad invalidation |
| Path-scoped `revalidatePath` | admin actions, specific entity paths | Narrower |
| `router.refresh()` | ApplicationLogWorkbench, CandidateCareerWorkspace, StaffRosterManager, EmployeeProfileManager, CandidateProfileManager, SubmissionForm | Full tree refresh after some mutations |
| RealtimeRefresher periodic refresh | Disabled (`enablePeriodicRefresh=false`) | Dispatches bus events with no listeners |

---

## Auth flow

1. Middleware: `getUser()` on matched requests (network to Auth).
2. Layout: `getAuthenticatedContext()` → `getUser()` + RLS membership txn.
3. Page: same via React.cache (deduped within request).
4. API notifications: same auth path per poll.

**Security invariant to preserve:** authenticated user + org + membership + role + RLS for protected data.

---

## RLS flow

Every `withRlsContext` = interactive `$transaction` + `set_config('request.jwt.claim.sub')`.

Per navigation: **membership txn (layout)** + **page data txn**.

Pool: PrismaPg `max: 10`, txn `maxWait: 15000`, `timeout: 30000`.

---

## Notification polling

- `NotificationsBell`: `setInterval(..., 10000)` always-on while dashboard mounted.
- No `visibilitychange` pause.
- Each tick: `/api/notifications` → auth + abuse `consumeRateLimit` (DB upsert) + RLS `findMany`.

---

## Realtime subscribers

| Layer | Status |
|---|---|
| `RealtimeEventBus` | Implemented (dedupe, version, fan-out) |
| `RealtimeSubscriptionManager` | Implemented; **no UI callers** |
| UI bus subscribers | **None** in production components |
| Server broadcast publish | **Not found** in `src/lib` |

---

## Heavy queries / waterfalls

| Route | Issue |
|---|---|
| `/admin` | ~20 parallel queries; unbounded task/app fetches for workload |
| `/employee/application-log` | 6–10 **sequential** awaits; full SUBMITTED scan for sources |
| `/employee/applications`, `/employee/tasks`, `/admin/applications` | `take: 250` + deep includes |
| `/admin/tasks/escalations` | No `take`; heavy per-row UI |
| `/admin/audit` | Sequential findMany + count |

---

## Known measurements (pre-Phase 10)

| Metric | Value |
|---|---|
| Production TTFB | NOT MEASURED |
| Time to Usable | NOT MEASURED |
| Vercel region | UNKNOWN (`vercel.json` has no `regions`) |
| Supabase region | UNKNOWN |
| Cold vs warm Vercel | NOT MEASURED |
| In-page filter latency | Prior phases claimed <16ms / 0 HTTP (architecture still present) |

---

## Phase 10 intended deltas (preview)

1. Route-level skeletons / loading.tsx (zero dead air).
2. Immediate nav pending feedback; stable AppShell.
3. Safe auth middleware session check (layout still `getUser` + RLS).
4. Parallelize application-log; lean/bound admin workload queries.
5. Narrow layout-wide revalidation where safe.
6. Wire realtime UI subscribers; rationalize notification polling.
7. Navigation instrumentation + documentation.

**No RLS/RBAC weakening. No workbench rewrite.**
