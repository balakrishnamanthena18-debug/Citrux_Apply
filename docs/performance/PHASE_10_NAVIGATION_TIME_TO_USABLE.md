# Phase 10 — Navigation Time-to-Usable

**Status:** IMPLEMENTED / VERIFIED (local quality gates)  
**Date:** 2026-10-01  
**Baseline:** `docs/performance/CURRENT_FORENSIC_PERFORMANCE_AUDIT.md` + `docs/performance/PHASE_10_BASELINE.md`  
**Measurements:** `docs/performance/PHASE_10_NAVIGATION_MEASUREMENTS.md`

---

## Objective

Eliminate **dead-air navigation** so that when a user clicks a dashboard route:

1. The click is acknowledged immediately.
2. The AppShell (sidebar/header) remains stable.
3. Route-appropriate skeletons appear in the content area.
4. Authoritative content replaces the skeleton when ready.
5. Security (auth, RBAC, RLS, tenancy) remains intact.

Phases 1–9 workbench instant interactions remain frozen and untouched in purpose.

---

## Baseline

See `PHASE_10_BASELINE.md`.

Key pre-state facts:

- **0** `loading.tsx` files
- Dual auth path: middleware `getUser` + layout `getAuthenticatedContext`
- Notifications polled every **10s**
- Realtime bus/manager had **no UI subscribers**
- Application log used **sequential** query waterfall
- Admin dashboard used **unbounded** workload fetches
- Broad `revalidatePath(..., "layout")` on many mutations
- Production TTFB/T2U: **NOT MEASURED**

---

## Changes Implemented

### A. Navigation loading UX
- Added shared `RouteSkeletons.tsx` matching OOS design tokens (`#F7F9F8`, white cards, soft borders, green accents).
- Added route-level `loading.tsx` for dashboard root + candidate/employee/admin major segments (applications, tasks, messages, profile, application-log, members, escalations, audit, jobs, candidates).

### B. Navigation feedback
- Wired unused `TransitionLink` into `AppSidebar` with immediate pending visual state (`aria-busy`, opacity/ring) while preserving Link prefetch semantics for unmodified clicks.

### C. App shell stability
- Skeletons render **inside** `{children}` of existing `AppShell`; sidebar/header are not blanked.
- `NavigationPerfProbe` + `RealtimeProvider` mount alongside shell without reconstructing nav chrome.

### D. Auth / RLS duplication (safe)
- Middleware: `getSession()` for presence/routing only (local JWT).
- Layout/page: unchanged `getAuthenticatedContext()` → `getUser()` + membership RLS (authoritative).
- React `cache()` dedupe of layout+page auth retained.
- **No RLS bypass. No RBAC bypass.**

### E. Heavy navigation query optimization
- **Application log:** parallel `Promise.all` for candidates + counts + lean submitted scan; parallel candidate summary queries; leaner `select`s; candidate list `take: 500`; submitted histogram `take: 2000`.
- **Admin dashboard:** workload task/app scans bounded `take: 2000` with lean selects; staff `take: 200`.
- **Admin escalations:** `take: 100`.
- **Admin audit:** `Promise.all` for findMany + count.

### F. Refresh / invalidation
- Replaced layout-wide `revalidatePath("/…", "layout")` with path-scoped revalidation in application, submission, QA, communication, candidate, and task action helpers.
- Left intentional `router.refresh()` where local workbenches still need authoritative full-page reconcile after complex mutations (documented as remaining).

### G. Notification polling
- Removed fixed 10s poll.
- Adaptive: **60s** when realtime disconnected; **5 minutes** when connected.
- Pauses while `document.hidden`; refreshes on visibility restore.
- Mark-read updates local state without forcing full list round-trips where possible.

### H. Realtime UI wiring
- `RealtimeProvider` mounts scoped `realtimeSubscriptionManager.subscribe(scope)`.
- `NotificationsBell` subscribes to `realtimeBus` Notification entity-type events and reconciles via authoritative `/api/notifications`.
- `publishRealtimeEvent` best-effort server broadcast (service role) after message/conversation notification creates.
- Channel helper extracted to `channels.ts` (server-safe).
- Broadcast payloads remain metadata-oriented; list content always loaded via RLS-scoped API.

### I. Instrumentation
- `NavigationPerfProbe` emits `oos:navigation-metric` CustomEvents / performance marks without PII.

### J. Tests
- `tests/unit/phase10-navigation-ttu.test.ts` covers loading coverage, TransitionLink wiring, middleware session check, polling rationalization, realtime channel + dedupe, query/revalidate invariants.

---

## Navigation Architecture

```
Click TransitionLink
  → immediate pending UI (client)
  → middleware getSession() (presence)
  → layout getAuthenticatedContext() [getUser + RLS membership]
  → AppShell STABLE
  → loading.tsx skeleton in main content
  → page withRlsContext queries
  → content replaces skeleton
  → NavigationPerfProbe records soft-nav T2U mark
```

---

## Loading UX

| Segment | Skeleton |
|---|---|
| `(dashboard)` | Generic workbench |
| Candidate home | Dashboard |
| Candidate applications | Card workbench |
| Candidate messages | Messages list |
| Candidate profile | Profile split |
| Employee home | Dashboard |
| Employee applications/tasks/candidates/jobs | Workbench table/cards |
| Application log | Desk split |
| Admin home | Dashboard |
| Admin applications/members/escalations/audit | Matching structures |

---

## Auth/RLS Optimization

| Layer | Before | After |
|---|---|---|
| Middleware | `getUser()` (Auth network) | `getSession()` (local) |
| Layout | `getUser` + RLS membership | Unchanged (required) |
| Page | cache hit + page RLS | Unchanged (required) |

**Invariant:** Every protected page still requires authenticated user + org + membership + role + RLS for data.

---

## Heavy Query Optimization

| Page | Before | After |
|---|---|---|
| Application log | 6–10 sequential awaits; full submitted include | Parallel metrics + lean submitted select |
| Admin dashboard | Unbounded workload finds | Bounded lean finds (`take: 2000`) |
| Escalations | Unbounded | `take: 100` |
| Audit | Sequential count | Parallel |

---

## Refresh/Revalidation Changes

Removed layout-scope revalidation storms from core mutation helpers; retained path-level revalidation of affected dashboards and entity pages.

Remaining `router.refresh()` call sites (complex editors/forms) are intentional authoritative reconciles — candidates for a future targeted-reconciliation pass, not removed blindly.

---

## Realtime Wiring

```
Supabase broadcast channel (scoped)
  → RealtimeSubscriptionManager
  → RealtimeEventBus (dedupe + version)
  → NotificationsBell subscriber
  → GET /api/notifications (RLS)
```

Publish path (best-effort): communication actions → `publishRealtimeEvent` when service role present.

---

## Notification Polling

| Mode | Interval |
|---|---|
| Realtime disconnected / reconnecting | 60s |
| Realtime connected | 5 min reconcile |
| Tab hidden | paused |
| Event received | immediate authoritative fetch |

---

## Production Measurements

See `PHASE_10_NAVIGATION_MEASUREMENTS.md`.

All production browser timings: **NOT MEASURED** (no deployed URL capture in this session).

---

## Cold vs Warm

| | |
|---|---|
| Cold | NOT MEASURED |
| Warm | NOT MEASURED |
| Soft nav perceived | Improved by skeletons + pending link (qualitative) |

---

## Browser Measurements

| Metric | Value |
|---|---|
| Main-thread long tasks | NOT MEASURED |
| Hydration duration | NOT MEASURED |
| RSC payload size | NOT MEASURED |
| DOM size | NOT MEASURED |

---

## Before vs After

| Route | Before TTFB | After TTFB | Before T2U | After T2U | Requests | Notes |
|------|--------------|------------|-------------|-----------|----------|-------|
| `/candidate` | NOT MEASURED | NOT MEASURED | Dead air | Skeleton + pending nav | NOT MEASURED | Perceived win |
| `/candidate/applications` | NOT MEASURED | NOT MEASURED | Dead air | Skeleton | NOT MEASURED | Perceived win |
| `/employee` | NOT MEASURED | NOT MEASURED | Dead air | Skeleton | NOT MEASURED | Perceived win |
| `/employee/applications` | NOT MEASURED | NOT MEASURED | Dead air | Skeleton | NOT MEASURED | Perceived win |
| `/employee/application-log` | NOT MEASURED | NOT MEASURED | Dead air + waterfall | Skeleton + parallel queries | NOT MEASURED | Perceived + actual |
| `/admin` | NOT MEASURED | NOT MEASURED | Dead air + unbounded | Skeleton + bounded workload | NOT MEASURED | Perceived + actual |
| `/admin/tasks/escalations` | NOT MEASURED | NOT MEASURED | Unbounded | `take: 100` + skeleton | NOT MEASURED | Actual bound |
| `/admin/audit` | NOT MEASURED | NOT MEASURED | Sequential | Parallel + skeleton | NOT MEASURED | Actual |

---

## Security Verification

| Invariant | Status |
|---|---|
| RLS not weakened | PASS |
| RBAC guards intact | PASS |
| Middleware still gates protected paths | PASS (session presence) |
| Layout still validates user via `getUser` + membership RLS | PASS |
| Notification list still RLS-scoped | PASS |
| Realtime channel scoping by org/candidate | PASS |
| No service-role exposure to browser | PASS |
| Rate limiting retained on notifications API | PASS |
| Audit logging retained | PASS |

Quality gates:

- `npm run typecheck` — PASS  
- `npm run lint` — PASS  
- `npm test` — PASS (655 tests)  
- `npm run build` — PASS  

---

## Regression Verification

| Feature | Status |
|---|---|
| InstantTabs / InstantSearch / InstantFilterBar / InstantSort / TablePagination | Untouched; still present |
| Workbench architecture | Preserved |
| Optimistic/pending mutation model | Preserved |
| Candidate approval / application / task governance | Not altered in business logic |
| RealtimeEventBus dedupe/version | Preserved + now subscribed |
| Database indexes | Untouched |

---

## Remaining Bottlenecks

1. Dual interactive RLS transactions (membership + page data) still exist — safe merge not done without security redesign.
2. Large `take: 250` application/task workbench payloads remain (bounded but heavy).
3. Some `router.refresh()` mutation paths remain.
4. Production TTFB/T2U/region still NOT MEASURED.
5. Realtime publish requires `SUPABASE_SERVICE_ROLE_KEY`; without it, polling fallback remains.
6. Org-channel notification events trigger refetch for all staff on the channel (safe via RLS API, but chatty).

---

## Known Unknowns

- Vercel region  
- Supabase region  
- Production cold/warm TTFB  
- Exact ms improvement on application-log / admin dashboard  
- Real-user Time-to-Usable under production RTT  

---

## Final Verdict

Phase 10 achieves **zero-dead-air navigation UX** through structured loading boundaries and immediate nav feedback, plus **real** server-side improvements on application-log parallelism, admin workload bounds, adaptive notification sync, and live realtime subscriber wiring.

It does **not** claim “performance fixed” in absolute milliseconds without production measurement.

### Answers to required questions

1. **Why slow before?** Dead-air route transitions + stacked auth/RLS + heavy pages + 10s polling; prior phases only made in-page filters instant.  
2. **Largest perceived delay?** Click → silence until full RSC (no loading UI).  
3. **Largest actual server delay?** Dual auth/RLS + heavy/sequential pages (application-log, admin dashboard).  
4. **Which paths improved?** All major dashboard navigations (perceived); application-log, admin dashboard/escalations/audit (server).  
5. **By how much?** NOT MEASURED in ms; architectural improvements verified in code + tests.  
6. **Perceived-only improvements?** Skeletons, TransitionLink pending state, shell stability.  
7. **Actual latency reductions?** Middleware session check; parallelized application-log; bounded admin/escalation queries; parallel audit; reduced poll frequency; path-scoped revalidation.  
8. **Duplicate auth/RLS reduced?** Partially — middleware no longer calls `getUser`; layout+page still share one authoritative context via React.cache; page RLS txn retained.  
9. **Application Log improved?** Yes — parallelized + lean selects.  
10. **Admin dashboard improved?** Yes — bounded workload scans.  
11. **Notification polling reduced/replaced?** Yes — adaptive 60s/5min + realtime-triggered fetch; paused when hidden.  
12. **Realtime connected to UI?** Yes — `RealtimeProvider` + NotificationsBell bus subscriber + best-effort publish.  
13. **Security boundary change?** Middleware presence check uses session JWT locally; authoritative `getUser`+RLS unchanged in layout/pages. No weakening.  
14. **Prior performance feature regress?** No — workbenches frozen; tests pass.  
15. **What remains slow?** Heavy list payloads, dual RLS txn, unmeasured production RTT, some refresh paths.  
16. **What remains NOT MEASURED?** Production TTFB/T2U/regions/cold starts.  
17. **Another phase justified?** Only after production measurement — candidate Phase 11 would be **measured latency reduction** (payload lean, dual-txn strategy with security review, remaining refresh elimination), not another skeleton phase.

---

**End of Phase 10 report.**
