# Current OOS Forensic Performance Audit

**Document type:** AUDIT ONLY — no code, schema, UI, or infrastructure changes were made.  
**Audit date:** 2026-10-01  
**Scope:** Current repository (`apply_citrux`) as source of truth  
**Primary question:** Why does the Operations Operating System (OOS) still feel slow to a real user?  
**Measurement posture:** Where browser/Vercel/live timings could not be obtained, values are marked **NOT MEASURED**. No fabricated numbers.

---

## Executive Summary

Previous performance phases (0–9) successfully optimized **in-page client interactions** (tabs, search, filters, sort, pagination) so they resolve without HTTP/RSC. That work is real and visible in the current workbench code.

It does **not** explain away the owner’s current complaint.

The remaining slowness is primarily **route-transition Time to Usable**, not local tab click latency. Every protected navigation still pays a stacked cost:

```
Click nav link
  → middleware supabase.auth.getUser()
  → dashboard layout getAuthenticatedContext()
       (cookies + getUser + withRlsContext membership txn)
  → page getAuthenticatedContext() [React.cache hit]
  → page withRlsContext() [second interactive Prisma transaction]
  → N Prisma queries (parallel on some routes, sequential on others)
  → RSC payload + large "use client" workbench hydration
  → NotificationsBell starts/continues 10s polling
```

During that wait, **there is no `loading.tsx` anywhere in `src/app`**. The UI provides almost no route-level acknowledgment beyond default browser/Next behavior. That produces “dead air” — the dominant user-perceived failure mode.

Additionally, Phase 7/9 claims about targeted realtime replacing polling are **not true in the current codebase**: `RealtimeSubscriptionManager` has zero UI callers; `RealtimeEventBus` has zero production subscribers; `NotificationsBell` still polls `/api/notifications` every 10 seconds, each hit re-running auth + abuse rate-limit DB write + RLS notification query.

**Verdict in one sentence:** OOS still feels slow because navigation and first paint remain a multi-auth, dual-RLS, fully-dynamic server render with no loading UX, while prior work mostly made filters feel instant *after* the heavy page had already loaded.

---

## User-Perceived Performance Verdict

| Claim from prior phases | Current code reality | User impact |
|---|---|---|
| Local tabs/filters/sort <16ms, 0 HTTP | Largely **TRUE** for in-memory workbench state | Helps once page is loaded; does not fix nav delay |
| Parallel Prisma queries | **PARTIALLY TRUE** — dashboards parallelized; several routes still sequential | Application log, audit, many detail pages still waterfall |
| Targeted realtime, no refresh storms | **FALSE for live path** — bus/manager unwired; 10s poll remains | Background DB/auth work competes with navigation |
| Server TTFB <250ms (Phase 9) | Measured on **local production runtime**, warm | Does not equal Vercel cold start or Time to Usable |
| Zero-perceived-latency architecture | **FALSE for route changes** — 0 `loading.tsx`, full RSC wait | Click → silence → page |

**Primary perceived failure:** Click sidebar → wait with no skeleton → page becomes usable.

---

## Current Architecture

### Stack (verified)

| Layer | Evidence |
|---|---|
| Next.js App Router 16.3.6 | `package.json` |
| React 19 | `package.json` |
| Supabase Auth SSR | `src/middleware.ts`, `src/lib/supabase/server.ts` |
| Prisma 7 + `@prisma/adapter-pg` pool `max: 10` | `src/lib/db/prisma.ts` |
| Strict RLS via interactive `$transaction` + `set_config('request.jwt.claim.sub', …, true)` | `src/lib/db/rls.ts` |
| Server Actions + `revalidatePath` | `src/lib/**/actions.ts` |
| Workbench client system | `src/components/workbench/*`, `*Workbench.tsx` |
| Realtime scaffolding | `src/lib/realtime/*` (not connected to UI) |
| Vercel | `vercel.json` (framework + cron only; **no `regions`**) |

### Performance dependency map (every dashboard navigation)

```
Browser
  └─ next/link (AppSidebar)  [default prefetch when in viewport]
       └─ RSC soft navigation (not full document reload)
            └─ Edge/Node middleware
                 └─ supabase.auth.getUser()          [AUTH network]
            └─ app/(dashboard)/layout.tsx
                 └─ getAuthenticatedContext()
                      ├─ cookies() → fully dynamic
                      ├─ createServerClient + getUser()
                      └─ withRlsContext → membership include user+org
                 └─ AppShell (client) + RealtimeRefresher (client, no-op bus)
                      └─ NotificationsBell → poll /api/notifications @10s
            └─ page.tsx
                 └─ getAuthenticatedContext() [cache hit same request]
                 └─ withRlsContext → page queries
                 └─ serialize props into large client workbench
            └─ Browser hydrate + React render
            └─ Time to Usable
```

### Dynamic rendering drivers (verified)

- `cookies()` in `createServerClient` (`src/lib/supabase/server.ts`)
- Middleware auth on nearly all routes (`src/middleware.ts` matcher)
- `searchParams` on several workbench pages (applications, tasks, candidates, audit, application-log)
- No page-level `revalidate` / static caching for dashboard routes
- `force-dynamic` only on API health/cron — pages are dynamic via cookies/auth anyway

---

## Route Performance Matrix

> **Legend:** TTFB / JS / Hydration / Time to Usable / Perceived = **NOT MEASURED** in this audit (no live Vercel/browser instrumentation run against production).  
> DB Queries = Prisma operations inside the **page** `withRlsContext` (excludes layout auth membership txn and middleware).  
> RSC = soft navigation triggers Server Component re-execution for layout+page.

| Route | TTFB | Requests | RSC | DB Queries (page) | JS | Hydration | Time to Usable | Perceived |
|------|------|----------|-----|-------------------|----|-----------|----------------|-----------|
| `/login` | NOT MEASURED | middleware getUser | client page | 0 | NOT MEASURED | NOT MEASURED | NOT MEASURED | Auth form; middleware still runs |
| `/candidate` | NOT MEASURED | 1 nav + polls | yes | ~2 sequential (+ optional create) | NOT MEASURED | NOT MEASURED | NOT MEASURED | Dead air until RSC |
| `/candidate/applications` | NOT MEASURED | 1 nav + polls | yes | ~2 sequential; `take: 100` | NOT MEASURED | client workbench | NOT MEASURED | Dead air |
| `/candidate/messages` | NOT MEASURED | 1 nav + polls | yes | ~2 sequential | NOT MEASURED | NOT MEASURED | NOT MEASURED | Dead air |
| `/candidate/profile` | NOT MEASURED | 1 nav + polls | yes | ~2 sequential; fat includes + audit 20 | NOT MEASURED | large client workspace | NOT MEASURED | Dead air; heavy hydrate |
| `/employee` | NOT MEASURED | 1 nav + polls | yes | **10** parallel | NOT MEASURED | large RSC HTML | NOT MEASURED | Dead air |
| `/employee/applications` | NOT MEASURED | 1 nav + polls | yes | **4** parallel; apps `take: 250` deep include | NOT MEASURED | 806-LOC workbench | NOT MEASURED | Dead air + heavy payload |
| `/employee/tasks` | NOT MEASURED | 1 nav + polls | yes | **6** parallel; tasks `take: 250` | NOT MEASURED | 688-LOC workbench | NOT MEASURED | Dead air |
| `/employee/candidates` | NOT MEASURED | 1 nav + polls | yes | **1**; `take: 200` | NOT MEASURED | client workbench | NOT MEASURED | Dead air |
| `/employee/jobs` | NOT MEASURED | 1 nav + polls | yes | **1**; `take: 200` | NOT MEASURED | client workbench | NOT MEASURED | Dead air |
| `/employee/application-log` | NOT MEASURED | 1 nav + polls | yes | **6–10 sequential** | NOT MEASURED | form workbench | NOT MEASURED | High server cost + dead air |
| `/admin` / `/admin/dashboard` | NOT MEASURED | 1 nav + polls | yes | **20** parallel; **unbounded** tasks/apps for workload | NOT MEASURED | large RSC | NOT MEASURED | Highest query fan-out |
| `/admin/applications` | NOT MEASURED | 1 nav + polls | yes | **3** parallel; `take: 250` | NOT MEASURED | client workbench | NOT MEASURED | Dead air |
| `/admin/members` | NOT MEASURED | 1 nav + polls | yes | **2** parallel | NOT MEASURED | StaffRoster no pagination | NOT MEASURED | Dead air |
| `/admin/tasks/escalations` | NOT MEASURED | 1 nav + polls | yes | **2** parallel; **no take** | NOT MEASURED | card+form per row | NOT MEASURED | Unbounded list risk |
| `/admin/audit` | NOT MEASURED | 1 nav + polls | yes | **2 sequential** (findMany + count) | NOT MEASURED | server UI | NOT MEASURED | Dead air |

**Fixed per-navigation tax (all dashboard routes):**

| Step | Cost class |
|---|---|
| Middleware `getUser()` | AUTH / NETWORK |
| Layout `getAuthenticatedContext` | AUTH + RLS txn #1 |
| Page `withRlsContext` | RLS txn #2 + page queries |
| `NotificationsBell` poll | every 10s: AUTH + rate-limit upsert + RLS query |

---

## Navigation Audit

### Mechanism

| Path | Mechanism | Evidence |
|---|---|---|
| Sidebar links | `next/link` (default prefetch) | `AppSidebar.tsx` |
| `TransitionLink` | Exists; dims on pending via `useTransition` + `router.push` | `TransitionLink.tsx` |
| `TransitionLink` usage | **UNUSED** (definition only; no imports) | repo-wide grep |
| Full document navigations | Not the primary pattern for dashboard↔dashboard | App Router soft nav |
| `router.refresh()` after mutations | Still present in several managers/forms | see Bottleneck Inventory |

### Cost of a typical click: `/employee` → `/employee/applications`

1. Soft RSC navigation (not full reload).
2. Middleware runs matcher → `getUser()`.
3. Dashboard layout re-resolves auth (required for shell props).
4. Applications page opens second RLS transaction; loads up to 250 applications with nested `job`, `candidate.user`, `assignedEmployee`, latest `submissions`, latest `stateHistory`, plus candidates/jobs/sources.
5. Client hydrates `EmployeeApplicationsWorkbench` (~806 lines).
6. No `loading.tsx` → previous page content / blank wait until RSC completes (**dead air**).

### Prefetch

- Sidebar uses standard `Link` → Next.js viewport prefetch applies.
- Prefetch still requires eventual full dynamic render on click; it can hide some latency when warm, but **cannot eliminate** dual RLS + query work when the prefetched RSC is stale or cold.
- Prefetch effectiveness on Vercel/production: **NOT MEASURED**.

---

## Server Rendering Audit

### Findings

1. **All dashboard pages are effectively dynamic** because auth reads cookies/session.
2. **Layout blocks children on auth** — `getAuthenticatedContext()` must complete before `AppShell` renders (`src/app/(dashboard)/layout.tsx`).
3. **No Suspense/`loading.tsx` boundaries** under `src/app` (glob: **0 files**).
4. **Parallelization exists** on key list/dashboard pages (`Promise.all` in admin/employee home, applications, tasks, escalations, members).
5. **Waterfalls remain** on:
   - `employee/application-log/page.tsx` — candidates → 3 counts → distinct candidates → all submitted apps for source histogram → optional 4 more candidate metrics (**fully sequential awaits**).
   - `admin/audit/page.tsx` — findMany then count.
   - Many `[id]` detail pages — sequential fetches inside one transaction.
   - Candidate home/profile/applications — sequential candidate then applications/audit.

6. **Admin dashboard** runs **20** queries in one `Promise.all`, including unbounded `task.findMany` and `application.findMany` for in-memory workload mapping (`admin/page.tsx` lines 155–183). Parallel ≠ cheap.

7. **Mutation invalidation is broad:** multiple actions call `revalidatePath("/employee"|"/candidate"|"/admin", "layout")`, forcing layout-level invalidation across role trees.

---

## Prisma Audit

### Pool / client

| Item | Value | Evidence |
|---|---|---|
| Adapter | `PrismaPg` | `src/lib/db/prisma.ts` |
| Pool `max` | **10** | same |
| Interactive txn defaults | `maxWait: 15000`, `timeout: 30000` | `src/lib/db/rls.ts` |
| TLS | `NODE_TLS_REJECT_UNAUTHORIZED = "0"` | prisma.ts (security note; not latency) |

### Expensive / risky query patterns

| Pattern | Where | Risk |
|---|---|---|
| `take: 250` + deep `include` | Employee/Admin applications, Employee tasks | Large RSC JSON + hydrate cost |
| `take: 200` | Candidates, jobs | Moderate |
| Unbounded task/application fetch for workload | Admin dashboard | Grows with org size |
| Unbounded escalations | Admin escalations page | No `take`; card+`<select>` per row |
| Full submitted-apps scan for source counts | Application log | Loads all SUBMITTED apps + job.source |
| N separate `count()` queries | Admin dashboard (~12 counts) | Parallel OK; still many round-trips inside one txn |
| Filtering after fetch | Admin workload `staffWorkload` maps filter in JS | Correct for small N; scales poorly |

### Indexes

Schema/migrations include solid composite indexes for common org/status/assignee paths (`applications_organizationId_status_idx`, tasks, candidates, notifications, memberships, etc.). Index coverage for org-scoped list queries appears **adequate**. Remaining cost is **volume + includes + dual transactions**, not obviously missing primary filters.

### N+1

Classic ORM N+1 is largely avoided via `include`/`select`. Cost shifted to **wide includes** and **many parallel counts**.

---

## RLS Audit

**Do not weaken RLS.** Findings are latency mechanics only.

| Observation | Evidence | Impact |
|---|---|---|
| Every `withRlsContext` opens interactive `$transaction` | `rls.ts` | Connection held for entire callback |
| Auth membership is its own transaction | `context.ts` | Txn #1 every navigation |
| Every page opens another transaction | page.tsx pattern | Txn #2 every navigation |
| `set_config` per txn | `rls.ts` | Small fixed overhead + must run before queries |
| Pool max 10 + long interactive txns | prisma.ts + rls.ts | Under concurrent SSR (prefetch + nav + 10s polls), waiters can hit `maxWait` |
| React `cache()` dedupes auth within one RSC request | `context.ts` | Prevents triple membership lookup in layout+page; **does not** merge page data txn |

**Confidence:** High that dual interactive RLS transactions are a structural latency tax on every navigation. Exact ms: **NOT MEASURED**.

---

## Supabase Audit

| Call site | Behavior |
|---|---|
| Middleware | `createServerClient` + `auth.getUser()` every matched request |
| `getAuthenticatedContext` | New server client + `auth.getUser()` again |
| Browser client | `src/lib/supabase/client.ts` for client features |
| `auth.getSession()` | Not used in app paths (good) |
| Storage signed URLs | Used for documents/submissions (on-demand) |

**Repeated `getUser` on same navigation:** middleware + layout/page auth = **at least 2** Supabase auth validations per protected HTML navigation (page shares React.cache with layout, so not a third within RSC).

API `/api/notifications` also calls `getAuthenticatedContext` → another getUser + RLS on every poll.

---

## Authentication Audit

```
Request
  → middleware getUser                    [1]
  → layout getAuthenticatedContext
       → getUser                          [2]
       → withRlsContext membership        [RLS A]
  → page getAuthenticatedContext          [cache → skip 2/A]
  → page withRlsContext data              [RLS B]
```

Role/org/membership are resolved once per request (good). They are **not** reused as a page-level data context to avoid opening RLS B with the same user id — every page still starts a fresh interactive transaction.

Login path: client page + server actions; middleware still validates session on `/login` and redirects authenticated users to `/candidate` (role-agnostic redirect — functional quirk, not primary latency).

---

## Client Bundle Audit

| Signal | Evidence |
|---|---|
| `"use client"` TSX files | **73** under `src/` |
| Largest static chunks (existing `.next` build) | ~262KB, ~224KB, ~162KB, ~110KB (uncompressed file sizes) |
| Total `.next/static/chunks` | ~1.6MB on disk |
| Chart/animation libs | **None** in dependencies |
| Icon libs | Inline SVGs (good) |
| `docx-preview` | Dynamic import in document modal (good) |
| `xlsx` / `jszip` | In `package.json`; **no `src/` imports found** — likely unused install weight |
| Unnecessary client markers | e.g. presentational workbench shells; `TelemetryGauge` reported as client without hooks |

First-load JS / route JS exact transfer sizes on Vercel: **NOT MEASURED**.

Largest interactive surfaces (line counts approximate from audit):

| Component | ~LOC | Role |
|---|---|---|
| `CandidateProfileManager` | 1533 | Client |
| `CandidateDocumentVault` | 866 | Client |
| `ApplicationLogWorkbench` | 828 | Client |
| `EmployeeApplicationsWorkbench` | 806 | Client |
| `EmployeeProfileManager` | 779 | Client |
| `StaffRosterManager` | 669 | Client |
| `EmployeeTasksWorkbench` | 688 | Client |

These do not need to be “slow” alone, but they **hydrate after** the already-expensive RSC wait.

---

## React Rendering Audit

| Finding | Evidence | Severity |
|---|---|---|
| No React Context providers in `src/` | grep | Avoids global context thrash (good) |
| Workbench state is local; search updates refilter full arrays | InstantSearch → parent setState → useMemo filter | P3 at ≤250 rows |
| InstantSearch **no debounce** | `onChange={(e) => onChange(e.target.value)}` | P3 |
| Shared `useInstantFilter` / `useInstantSearch` hooks **unused** by workbenches | lib/client vs components | INFO / maintainability |
| No `React.memo` under workbench | components/workbench | Not automatically a bug |
| Staff roster renders all filtered members, no pagination | StaffRosterManager | P2 as roster grows |
| Escalations: form + staff `<select>` per row, no pagination | AdminEscalationsWorkbench | P2 |

Main-thread ms for tab/search: **NOT MEASURED**; at current caps, likely not the user’s primary “app feels slow” complaint versus navigation dead air.

---

## Workbench Audit

| Capability | Claimed | Actual |
|---|---|---|
| Instant tabs/search/filter/sort | 0 HTTP | **TRUE** — client state + optional `history.replaceState` URL sync |
| Instant = fast perceived nav | — | **FALSE** — workbenches only help after data arrives |
| URL sync without RSC refetch | `urlSync.ts` replaceState | **TRUE** when used from client |
| Debounced search | — | **FALSE** |
| Virtualization | — | **Not implemented**; not required at 25 visible rows if caps hold |
| Optimistic pending buttons | `PendingButton` used in several workbenches | Partial coverage |

**Critical distinction:** 0 HTTP interactions can still feel fine while **route entry** feels slow. Prior phases measured the former and declared victory.

---

## Table Rendering Audit

| Surface | Cap | Page size | Est. visible DOM complexity |
|---|---|---|---|
| Employee applications | 250 loaded / 25 shown | 25 | ~25 rows × ~15–25 nested nodes ≈ **~400–600** nodes in table body |
| Employee tasks | 250 / 20 | 20 | card list ~300 nodes |
| Admin applications | 250 / 25 | 25 | simpler columns |
| Candidates/jobs | 200 | 15–25 | moderate |
| Escalations | unbounded | none | **worst** — heavy interactive cards |
| Staff roster | all members | none | grows with headcount |

Virtualization would materially help **escalations** and **staff roster** if those lists grow; for paginated 25-row tables it is lower priority than navigation/loading UX.

---

## Realtime Audit

### What exists

- `RealtimeEventBus` — dedupe LRU 500, version gating, entity/type/global fan-out (`src/lib/realtime/event-bus.ts`)
- `RealtimeSubscriptionManager` — Supabase broadcast channel → bus (`subscription-manager.ts`)
- `RealtimeRefresher` mounted in dashboard layout — visibility pulse → `realtimeBus.dispatch` (periodic refresh **disabled**)

### What is actually wired

| Expected (Phase 7/9) | Current code |
|---|---|
| UI subscribes to bus / manager | **No callers** of `subscribe`, `subscribeGlobal`, `subscribeToEntity*` outside definitions |
| Notifications via bus | **Still HTTP poll @10s** |
| Workbenches reconcile from events | **Not found** |
| Eliminate refresh storms | `router.refresh()` still used after several mutations |

**Conclusion:** Realtime is an **unintegrated scaffold**. Phase 7/9 verification claims for live targeted sync are **not supported by current source**.

---

## Polling Audit

| Source | Interval | Work per tick |
|---|---|---|
| `NotificationsBell` | **10_000 ms**, always while dashboard mounted | `GET /api/notifications` → `getAuthenticatedContext` → `verifyAbuseProtection` → `consumeRateLimit` (Postgres upsert) → `withRlsContext` notification `findMany` |
| `RealtimeRefresher` periodic | disabled (`enablePeriodicRefresh = false`) | n/a |
| Document upload progress timers | local only | negligible |

**Approximate background frequency (one open dashboard tab):** 6 notification API cycles/minute ≈ **6 auth + 6 rate-limit writes + 6 RLS reads / minute / tab**, with no `document.visibilityState` pause.

This competes with user navigations for the Prisma pool (max 10) and adds constant “busy” network noise.

---

## Vercel / Serverless Audit

| Item | Status |
|---|---|
| `vercel.json` regions | **Not set** → deployment region **UNKNOWN** from repo |
| Phase 0 historical note | Mentions `iad1` — treat as **unverified** for current project |
| Runtime | Node serverless for RSC/actions; middleware Edge-compatible |
| Cold start | Prisma client + pg adapter + generated client import cost on cold isolate — **NOT MEASURED** |
| Connection pooling | App pool max 10; `.env.example` documents Supavisor/PgBouncer port 6543 — good intent |
| Cron | rate-limit cleanup daily 02:00 |

Serverless implication: warm TTFB from Phase 9 local runtime **understates** cold isolate + remote DB latency on Vercel.

---

## Region / Network Audit

| Endpoint | Region in repo |
|---|---|
| Vercel | **UNKNOWN** (`vercel.json` has no `regions`) |
| Supabase / Postgres | **UNKNOWN** (URL is env-only; no region encoded in committed config) |

### Why cross-region hurts (general, not measured here)

```
User → Vercel region → Supabase Auth + Postgres region
```

Each navigation already performs multiple serial network dependencies (Auth getUser, then DB txn). If Vercel and Supabase are in different continents, those hops multiply into hundreds of ms before HTML/RSC is useful — **APPLICATION LATENCY** (auth×2 + RLS×2 + queries) stacked on **INFRASTRUCTURE LATENCY** (RTT).

Split:

- **APPLICATION LATENCY:** dual getUser, dual RLS txn, heavy queries, no streaming UI  
- **INFRASTRUCTURE LATENCY:** UNKNOWN until regions confirmed  

---

## Cold vs Warm Analysis

| Class | What happens | Prior measurement coverage |
|---|---|---|
| Cold serverless | Module init Prisma/pg, TLS, first connections | Phase 9 focused warm local |
| Warm serverless | Cached prisma global, warm pool | Phase 9 warm TTFB claims |
| Browser interaction (in-page) | Client filter/sort | Phase 9 <16ms claims — largely valid |
| Browser navigation | Full pipeline above | **Under-measured**; feels slow |

---

## Loading UX / Perceived Latency

### Critical finding

**Zero `loading.tsx` files** in the entire App Router tree.

| User action | Visible feedback |
|---|---|
| Click sidebar `Link` | Default Next transition; **no route skeleton** |
| `TransitionLink` (unused) | Would only dim the link (`opacity-70`) |
| Workbench internal tab | Instant local state (good) |
| Mutation pending | `PendingButton` in some flows (good where used) |
| Notifications | Silent background fetch |

### Dead air inventory (structural)

Every dashboard route transition listed in the matrix has **dead air** between click and usable content because the server tree (layout auth + page RLS + queries) must finish before streaming UI replaces the view, and no loading boundary exists to paint immediately.

This alone can make a 300–800ms technical navigation feel like “the app is slow,” independent of database speed.

---

## Route Prefetch Analysis

| Area | Behavior |
|---|---|
| AppSidebar | Many `Link`s; default prefetch when links enter viewport |
| Admin nav | ~10+ destinations may prefetch dynamic RSC |
| Risk | Prefetch can amplify background auth+RLS+DB load (same pipeline) while user is idle |
| Benefit | Warm click may be faster if prefetch completed |
| Measurement | **NOT MEASURED** whether prefetch helps or hurts pool contention with 10s notification polls |

---

## Bottleneck Inventory

### BOT-001
- **ID:** BOT-001  
- **Severity:** P1 — CRITICAL USER-PERCEIVED LATENCY  
- **Area:** UX/PERCEIVED  
- **Route:** All `(dashboard)/**`  
- **Evidence:** Glob for `loading.tsx` = 0; layout awaits auth before children  
- **Current behavior:** Click → no skeleton → wait for full RSC  
- **Measured latency:** NOT MEASURED  
- **Likely root cause:** Missing loading/Suspense strategy for dynamic routes  
- **Confidence:** High  
- **Potential impact:** Largest single improvement to “feels slow” without changing security model  

### BOT-002
- **ID:** BOT-002  
- **Severity:** P1  
- **Area:** AUTH + SERVER  
- **Route:** All protected navigations  
- **Evidence:** `middleware.ts` getUser; `context.ts` getUser + RLS; pages open second `withRlsContext`  
- **Current behavior:** ≥2 Auth validations + 2 interactive DB transactions per navigation  
- **Measured latency:** NOT MEASURED  
- **Likely root cause:** Layered auth design without request-level data-txn reuse  
- **Confidence:** High  
- **Potential impact:** Tens–hundreds of ms per nav depending on Auth/DB RTT  

### BOT-003
- **ID:** BOT-003  
- **Severity:** P1  
- **Area:** DATABASE + SERVER  
- **Route:** `/admin`, `/admin/dashboard`  
- **Evidence:** 20 parallel queries; unbounded task/application fetches for workload (`admin/page.tsx`)  
- **Current behavior:** Heavy dashboard payload every visit  
- **Measured latency:** NOT MEASURED (Phase 9 claimed ~110ms warm local TTFB — not Time to Usable)  
- **Likely root cause:** Metric fan-out + in-memory aggregation over unbounded rows  
- **Confidence:** High  
- **Potential impact:** Scales poorly with org size; dominates admin first paint  

### BOT-004
- **ID:** BOT-004  
- **Severity:** P1  
- **Area:** DATABASE + SERVER  
- **Route:** `/employee/application-log`  
- **Evidence:** Sequential awaits for candidates, 3 counts, distinct submitted, full submitted list for sources, optional 4 more (`application-log/page.tsx`)  
- **Current behavior:** Waterfall inside one long interactive transaction  
- **Measured latency:** NOT MEASURED  
- **Likely root cause:** Sequential metric derivation + full-table submitted scan  
- **Confidence:** High  
- **Potential impact:** One of the worst single-page server paths  

### BOT-005
- **ID:** BOT-005  
- **Severity:** P1  
- **Area:** REALTIME / SERVER / NETWORK  
- **Route:** Global dashboard shell  
- **Evidence:** `NotificationsBell` `setInterval(..., 10000)`; `/api/notifications` auth + rate limit upsert + RLS; realtime manager unused  
- **Current behavior:** Continuous background load; Phase 7 claim unmet  
- **Measured latency:** NOT MEASURED  
- **Likely root cause:** Polling fallback never replaced by wired realtime  
- **Confidence:** Very high  
- **Potential impact:** Pool contention + competing latency during user actions  

### BOT-006
- **ID:** BOT-006  
- **Severity:** P2  
- **Area:** SERVER + BUNDLE/RENDERING  
- **Route:** `/employee/applications`, `/employee/tasks`, `/admin/applications`  
- **Evidence:** `take: 250` with deep includes → large client workbenches  
- **Current behavior:** Fast filters after load; slow entry + hydrate  
- **Measured latency:** NOT MEASURED  
- **Likely root cause:** Bounded but still heavy initial workspace payload  
- **Confidence:** High  
- **Potential impact:** High transfer + hydration cost on every entry  

### BOT-007
- **ID:** BOT-007  
- **Severity:** P2  
- **Area:** SERVER  
- **Route:** Mutations across application/task/communication/submission  
- **Evidence:** `revalidatePath(..., "layout")` + multiple `router.refresh()` call sites  
- **Current behavior:** Post-mutation full tree refresh feel  
- **Measured latency:** NOT MEASURED  
- **Likely root cause:** Broad cache invalidation instead of targeted reconciliation  
- **Confidence:** High  
- **Potential impact:** Mutations feel as slow as navigations  

### BOT-008
- **ID:** BOT-008  
- **Severity:** P2  
- **Area:** RENDERING  
- **Route:** `/admin/tasks/escalations`, `/admin/members`  
- **Evidence:** No take/pagination; heavy per-row interactive UI / full roster render  
- **Current behavior:** DOM cost grows linearly  
- **Measured latency:** NOT MEASURED  
- **Likely root cause:** Missing list virtualization/pagination  
- **Confidence:** Medium–high  

### BOT-009
- **ID:** BOT-009  
- **Severity:** P3  
- **Area:** FRONTEND  
- **Route:** Workbenches  
- **Evidence:** InstantSearch no debounce; full-array refilter each keystroke  
- **Current behavior:** Extra main-thread work  
- **Measured latency:** NOT MEASURED (likely small at N≤250)  
- **Likely root cause:** Instant UX prioritized over coalescing  
- **Confidence:** Medium  

### BOT-010
- **ID:** BOT-010  
- **Severity:** P3  
- **Area:** INFRASTRUCTURE  
- **Route:** All  
- **Evidence:** Regions UNKNOWN; Phase 9 local-only verification  
- **Current behavior:** Possible multi-region RTT multiplier  
- **Measured latency:** NOT MEASURED  
- **Likely root cause:** Unconfirmed co-location of Vercel ↔ Supabase  
- **Confidence:** Medium (hypothesis until measured)  

### BOT-011
- **ID:** BOT-011  
- **Severity:** INFO  
- **Area:** BUNDLE  
- **Evidence:** `xlsx`/`jszip` unused in `src/`; TransitionLink unused  
- **Current behavior:** Minor dead weight / unfinished UX affordance  
- **Confidence:** High  

---

## Top 10 Root Causes

Ranked by technical severity/impact on user-perceived slowness:

1. **No route-level loading UI** — dead air on every navigation (BOT-001).  
2. **Stacked auth + dual interactive RLS transactions per navigation** (BOT-002).  
3. **Heavy dynamic page data fans** — especially admin 20-query dashboard and application-log waterfall (BOT-003, BOT-004).  
4. **Notifications 10s polling with full auth/RLS/rate-limit path; realtime unwired** (BOT-005).  
5. **Large bounded list payloads (`take: 250` + deep includes) + heavy client hydrate** (BOT-006).  
6. **Broad `revalidatePath(layout)` + lingering `router.refresh()` after mutations** (BOT-007).  
7. **Fully dynamic App Router surface** (cookies/auth) with no caching tier for shell data.  
8. **Unbounded admin escalations / unpaginated staff roster render risk** (BOT-008).  
9. **Possible Vercel↔Supabase region RTT** (UNKNOWN, BOT-010).  
10. **Prior program optimized in-page 0-HTTP interactions, which are not the remaining bottleneck.**

---

## Recommended Remediation Roadmap

**Recommendations only. Do not implement until explicitly approved.**

### R1 — Route loading / perceived latency (FIRST)
- **Problem:** Dead air on navigation.  
- **Proposed solution:** Add `(dashboard)/loading.tsx` and segment-level skeletons matching shell chrome; consider Suspense around page data while shell paints.  
- **Expected impact:** Immediate perceived speedup even if TTFB unchanged.  
- **Risk:** Low.  
- **Effort:** Low–medium.  
- **Dependencies:** Design tokens for skeletons.  
- **Measurement:** Time to first visual feedback after click; Time to Usable.

### R2 — Confirm and co-locate regions
- **Problem:** Unknown infra RTT multiplier.  
- **Proposed solution:** Record Vercel region + Supabase region; co-locate if mismatched.  
- **Expected impact:** Reduces every Auth/DB hop.  
- **Risk:** Low–medium (ops).  
- **Effort:** Low.  
- **Measurement:** Multi-region ping, TTFB cold/warm on production.

### R3 — Replace notification polling with wired realtime (or pause when hidden)
- **Problem:** 10s full-stack polls; bus unused.  
- **Proposed solution:** Either wire `RealtimeSubscriptionManager` + bus listeners as Phase 7 described, or at minimum pause polling when `document.hidden` and raise interval; avoid rate-limit DB write on read polls if possible.  
- **Expected impact:** Less pool/auth contention.  
- **Risk:** Medium (missed notifications if wrong).  
- **Effort:** Medium–high for true realtime; low for visibility pause.  
- **Measurement:** Background req/min; nav latency under load.

### R4 — Reduce per-navigation auth/DB tax without weakening RLS
- **Problem:** Dual getUser + dual interactive txn.  
- **Proposed solution:** Explore middleware session stamp patterns safe for RLS; combine membership + page reads in one txn where possible; cache membership briefly at request scope only (already partially via React.cache).  
- **Expected impact:** Cut fixed nav overhead.  
- **Risk:** High if done carelessly (security).  
- **Effort:** High.  
- **Measurement:** Server span tracing per request.

### R5 — Fix application-log waterfall + admin unbounded workload queries
- **Problem:** Sequential metrics; unbounded scans.  
- **Proposed solution:** `Promise.all` metrics; SQL groupBy for sources; bounded/aggregated workload queries.  
- **Expected impact:** Large on those routes.  
- **Risk:** Low–medium.  
- **Effort:** Medium.  
- **Measurement:** Query count, txn duration, TTFB.

### R6 — Narrow mutation revalidation
- **Problem:** Layout-wide revalidate + refresh.  
- **Proposed solution:** Path-specific revalidate; prefer returned records for workbench patch; reserve `router.refresh()` for hard cases.  
- **Expected impact:** Mutations feel instant more often.  
- **Risk:** Medium (stale UI).  
- **Effort:** Medium.  
- **Measurement:** Mutation → usable latency.

### R7 — Trim list payload / progressive load
- **Problem:** 250-row deep graphs on entry.  
- **Proposed solution:** Leaner selects; server pagination for first page; keep client instant ops on loaded page window.  
- **Expected impact:** Faster Time to Usable on workbenches.  
- **Risk:** Medium (UX of “load more”).  
- **Effort:** Medium–high.

### R8 — Paginate escalations & staff roster
- **Problem:** Unbounded interactive lists.  
- **Expected impact:** Stable admin DOM.  
- **Risk:** Low.  
- **Effort:** Low–medium.

### What NOT to do first
- Do not weaken RLS.  
- Do not rewrite workbench instant filters (already OK).  
- Do not add virtualization to 25-row tables before fixing navigation dead air.  
- Do not trust Phase 9 “0 P0/P1” as current truth.

---

## What Previous Performance Work Successfully Solved

Verified against current code:

| Prior work | Status |
|---|---|
| Client-side tabs/filters/sort/search without HTTP | **Working** in workbenches |
| URL sync via `history.replaceState` (avoid RSC on filter tweaks) | **Working** where used |
| Bounded `take` on many list pages (100–250) | **Working** (vs unbounded everywhere) |
| `Promise.all` on major employee/admin list/dashboard pages | **Working** on those routes |
| React `cache()` for `getAuthenticatedContext` | **Working** within a request |
| Reduced unconditional RealtimeRefresher `router.refresh` interval | **Working** (periodic disabled) |
| Pending/optimistic affordances in places (`PendingButton`) | **Partially working** |
| Index coverage for org/status queries | **Present** in schema/migrations |
| Prisma singleton + pg pool | **Present** |

---

## What Previous Performance Work Did NOT Solve

| Gap | Evidence |
|---|---|
| Navigation Time to Usable / dead air | No `loading.tsx` |
| Dual auth + dual RLS txn fixed cost | Still in middleware/layout/page |
| Application-log sequential waterfall | Still sequential |
| Admin unbounded workload fetches | Still present |
| Realtime actually connected | Manager/bus unused; 10s poll remains |
| Phase 7 claim that NotificationsBell uses bus | Code still polls |
| Broad layout `revalidatePath` | Still in actions |
| Remaining `router.refresh()` mutation paths | Still present |
| Production/Vercel/cold/region measurement | Phase 9 was local warm production runtime |
| Role-aware login redirect | Middleware always sends authed users to `/candidate` |

---

## Unknowns / Missing Measurements

All of the following are **NOT MEASURED** in this audit and must be captured before claiming production performance:

1. Production TTFB (cold and warm) per route on Vercel  
2. Time to Usable / Time to Interactive per route (desktop + mobile)  
3. Main-thread long tasks during workbench search/tab switches  
4. RSC payload sizes per route  
5. Exact Auth `getUser` latency and DB RTT  
6. Vercel region and Supabase region  
7. Prisma pool wait time under concurrent prefetch + polling  
8. Lighthouse/Web Vitals on deployed URL  
9. Real user monitoring (if any)  

**Deployed production URL:** not confirmed in-repo for live browser automation during this audit.

---

## Final Verdict

### Why does OOS still feel slow?

Because the user-facing critical path is still **navigate → wait through middleware auth + layout auth/RLS + page RLS/queries → hydrate a large client workbench**, with **no loading acknowledgment**. Prior phases made **in-page** filtering feel instant and parallelized some queries, but left the **route entry pipeline**, **background notification polling**, and **several heavy/sequential server pages** intact. Phase 7/9 realtime “victory” is not reflected in the live wiring.

Warm local TTFB and “0 HTTP for tabs” can both be true while the product still feels slow.

---

## Final Decision Answers

### 1. Is the remaining latency primarily FRONTEND / SERVER / DATABASE / NETWORK / INFRASTRUCTURE / UX/PERCEIVED / or MIXED?

**MIXED** — dominated by **UX/PERCEIVED (dead air) + SERVER/AUTH/RLS (per-navigation tax) + DATABASE volume on heavy routes**, with **NETWORK/INFRASTRUCTURE** as an unquantified multiplier (regions UNKNOWN).

### 2. What are the top 5 verified bottlenecks?

1. No `loading.tsx` / no route-level pending UI (dead air).  
2. Middleware `getUser` + layout auth/RLS + page RLS on every dashboard navigation.  
3. Heavy pages: admin 20-query/unbounded workload dashboard; application-log sequential waterfall; `take: 250` deep list payloads.  
4. `NotificationsBell` 10s polling (auth + rate-limit DB + RLS) while realtime remains unwired.  
5. Broad mutation `revalidatePath(..., "layout")` / `router.refresh()` re-running the full pipeline.

### 3. Which previous performance optimizations are actually working?

Client instant tabs/filters/sort/search (0 HTTP); URL replaceState sync; many list bounds; `Promise.all` on key pages; React.cache auth dedupe; disabled periodic full refresh in `RealtimeRefresher`; schema indexes; Prisma pooling.

### 4. Which previous optimizations do NOT address the user’s current slowness?

In-page <16ms interactions; claims of targeted realtime replacing polls; warm local TTFB as a proxy for Time to Usable; “0 P0/P1 blockers” from Phase 9.

### 5. What should be fixed FIRST?

**Route loading UX (skeletons / Suspense)** so clicks acknowledge immediately, then measure production regions + nav spans — before another large “instant workbench” phase.

### 6. What should NOT be touched?

RLS strength; RBAC guards; working client filter model; security headers; auth cookie httpOnly model; schema churn without measurement.

### 7. Is another performance implementation phase justified?

**Yes** — but only as a **navigation Time-to-Usable + loading UX + polling/realtime truth + heavy-query** phase, explicitly scoped against this audit. Another phase that only tunes already-instant client filters is **not** justified.

---

**End of audit. No code was modified.**
