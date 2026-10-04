# OOS FORENSIC PERFORMANCE AUDIT

**Phase:** 1 — AUDIT ONLY (no code changes)  
**Date:** 2026-10-04  
**Production:** `https://citrux-apply-mrgx.vercel.app/`  
**Local:** `http://localhost:3000` (Mumbai Auth + Turbopack/dev)  
**Method:** Chrome DevTools Protocol Resource Timing + click→useful wall clocks; static code path analysis; unauthenticated document TTFB via curl.

> Legend: values marked **NOT MEASURED** were not instrumented with server-side spans in this pass. Soft-nav “click → useful” = time from navigation click until target page `<h1>` matches. Soft-nav “settle” = useful + ~500–800ms network settle wait used by the harness.

---

## Executive Summary

### Why the app feels ~2–3 seconds slow

The dominant user-visible delay is **soft navigation waiting on a full authenticated RSC render** (layout auth + page `withRlsContext` query work) **before the previous page is replaced**. Sidebar links intentionally disable Next.js prefetch (`TransitionLink` `prefetch={false}`), so **almost every click starts a cold RSC flight**.

| Environment | Soft-nav Applications (click → useful) | Soft-nav Applications (settle) |
|-------------|----------------------------------------|--------------------------------|
| **LOCAL DEV** | **5,566 ms** | **6,068 ms** |
| **PRODUCTION (warm soft)** | **562 ms** | **1,364 ms** |
| **PRODUCTION (warm hard reload, cached assets)** | Document TTFB **26–27 ms**, DCL **~350–495 ms** | Interactive ~400–500 ms |

**Conclusion:** The “2–3 second” complaint matches **LOCAL** soft navigation (3–6 s) and can still occur on PRODUCTION when the RSC path is cold or contended (measured Applications RSC flight up to **896 ms**; settle ~1.4 s). Phase 9’s ~100–175 ms TTFB claims were **local production-runtime / server TTFB**, not soft-nav Time-to-Useful — they understate what users feel.

### Current measured (PRODUCTION soft-nav, employee session, ~766px viewport)

| Metric | Value |
|--------|-------|
| Cold unauthenticated `/login` document TTFB | **132–348 ms** (curl) |
| Soft-nav click → useful (Applications) | **562 ms** |
| Soft-nav click → settle (Applications) | **1,364 ms** |
| Soft-nav click → useful (Application Desk) | **667 ms** |
| Soft-nav click → useful (Jobs) | **610 ms** |
| Soft-nav click → useful (Candidates / Tasks) | **~304–305 ms** |
| Soft-nav click → useful (Messages) | **407 ms** |
| Warm-repeat Applications click → useful | **561 ms** (no material warm win) |
| Notifications API (parallel, non-blocking SSR) | **171–633 ms** |

### Current measured (LOCAL DEV soft-nav)

| Route | Click → useful | RSC flight duration |
|-------|----------------|---------------------|
| `/employee/applications` | **5,566 ms** | **5,290 ms** (`transfer≈9.4 KB`) |
| `/employee/application-log` | **3,582 ms** | **3,338 ms** |
| `/employee/jobs` | **3,238 ms** | **2,942 ms** |
| `/employee/applications` (repeat) | **4,296 ms** | **4,043 ms** |

### Budget evaluation

| Budget | Target | PROD soft Applications | LOCAL soft Applications |
|--------|--------|------------------------|-------------------------|
| Click → visual feedback | &lt;100 ms | Partial (link `opacity`/ring only; **main content unchanged**) | Same |
| Useful page shell | &lt;300 ms | **FAIL** (562 ms) | **FAIL** |
| Meaningful content | &lt;800 ms | **FAIL** (562–667 ms core; settle 1.4 s) | **FAIL** (3–6 s) |
| Fully interactive | &lt;1.2 s | Borderline / fail on settle | **FAIL** |

---

## Critical Bottlenecks

1. **P0 — Soft-nav RSC is the critical path; prefetch disabled on all sidebar links**  
   Evidence: `TransitionLink` defaults `prefetch={false}` and uses `router.push` (`src/components/ui/TransitionLink.tsx`). PROD Applications RSC `?_rsc=` duration **896 ms**; LOCAL **5,290 ms**.

2. **P0 — Dual interactive RLS transactions per navigation**  
   Evidence: `(dashboard)/layout.tsx` awaits `getAuthenticatedContext()` → Supabase `getUser()` + `withRlsContext(membership)`. Every page then opens a **second** `withRlsContext` for data. React `cache()` dedupes auth JS calls, **not** DB transactions.

3. **P0 — LOCAL query/render path for Application Operations Console is multi-second**  
   Evidence: LOCAL click→useful **5.5 s** with RSC payload only ~9 KB → latency is **server work**, not download.

4. **P1 — Over-fetch on Console + Desk**  
   Evidence: `/employee/applications` loads `take: 250` apps with `job: true` (full job incl. `jobDescription`) + submissions/history (`page.tsx`). Desk loads up to **500 jobs with `jobDescription`** + lean submitted **take 2000**.

5. **P1 — Perceived dead air: previous page stays visible until RSC completes**  
   Evidence: Soft navigations do not swap to `loading.tsx` skeleton for the whole shell; only sidebar link pending styles change. User stares at stale content for the full RSC duration.

6. **P2 — Notifications + idle prefetch compete for pool/CPU after paint**  
   Evidence: `/api/notifications` **171–633 ms** PROD / **1,575 ms** LOCAL; `RoutePrefetcher` sequentially prefetches apps/tasks/candidates after idle (can contend with session-mode pool of **max 3** Prisma connections).

---

## Navigation Waterfalls

### Soft navigation (sidebar click) — measured sequence

```
T0  User clicks TransitionLink (prefetch=false)
T1  onClick → preventDefault → startTransition → router.push   (~0–16ms UI: link dims)
T2  Browser starts RSC fetch  GET {route}?_rsc=…
T3  Middleware getSession()                                   (presence only)
T4  Server: layout getAuthenticatedContext
       → createServerClient / cookies
       → supabase.auth.getUser()                              [network]
       → withRlsContext #1: set_config + membership.findFirst [DB txn]
T5  Server: page getAuthenticatedContext (React cache hit)
T6  Server: withRlsContext #2: set_config + page queries      [DB txn; Promise.all serializes on 1 conn]
T7  RSC / Flight payload streams to browser
T8  React swaps page children; <h1> matches  ← "useful" in this audit
T9  Client hydrate / workbench useMemo filters
T10 NotificationsBell idle fetch /api/notifications (parallel, after paint)
T11 RoutePrefetcher idle sequential router.prefetch(...)
```

### Observed PROD resource waterfall (employee soft-nav session)

| Request | Duration | Waiting (TTFB) | Transfer | Notes |
|---------|----------|----------------|----------|-------|
| `/employee/applications?_rsc=…` | **896 ms** | 204 ms | 5,953 B | Slowest Applications flight |
| `/employee/tasks?scope=mine&…&_rsc=` | 751 ms | 745 ms | 899 B | Prefetch / dashboard remnant |
| `/employee/candidates?scope=mine&_rsc=` | 666 ms | 664 ms | 1,739 B | Prefetch remnant |
| `/api/notifications?limit=15` | 633 ms | 629 ms | 1,434 B | Non-blocking for SSR |
| Large JS chunk `3v4mdarg35zn-.js` | 609 ms | 566 ms | 136,910 B | First soft session |

### Auth stack (every protected navigation)

| Step | Parallelizable with page data? | Notes |
|------|--------------------------------|-------|
| Middleware `getSession()` | Yes (edge) | Local JWT read; not cryptographic |
| Layout `getUser()` | **No** — gates AppShell | Cryptographic Auth API |
| Layout membership RLS txn | **No** — after getUser | Full `user`+`organization` include |
| Page RLS txn | After auth (cache) | Separate interactive transaction |

---

## Database Findings

| Item | Finding |
|------|---------|
| Query count (Applications Console) | Auth txn (~2 ops) + page txn: **4** Prisma finds inside `Promise.all` + relation fan-out for includes |
| Query count (Application Desk) | **6** in phase A; **+4** sequential phase B if `?candidateId` |
| Query count (Employee dashboard) | **10** `Promise.all` slots (heavy includes on tasks) |
| Query count (Jobs) | **1** findMany `take: 200` with `_count` + full columns |
| Slowest observed path | LOCAL Applications RSC **5.3 s** (server-bound) |
| Duplicate queries | Membership resolved every request (cached per-request only); notifications re-auth separately |
| N+1 in app code | **NO** classic per-row awaits |
| False parallelism | `Promise.all` inside `withRlsContext` runs on **one** interactive connection → statements **serialize** (`rls.ts`, pool `max: 3`) |

### Application Operations Console — initial load queries (code)

1. `application.findMany` org-wide, `take: 250`, includes candidate.user, **`job: true`**, assignedEmployee, submissions(+user), stateHistory(+user)  
2. `candidate.findMany` `take: 100` (create form)  
3. `job.findMany` OPEN `take: 100`  
4. `job.findMany` distinct sources  

Filters/search/queue tabs are **client-only** after this payload lands.

### Application Desk — initial load queries (code)

1. candidates `take: 500`  
2. OPEN jobs `take: 500` **including `jobDescription`**  
3–5. submitted application counts (today/week/month)  
6. lean submitted apps `take: 2000` (histogram in JS)  
7–10. (optional, sequential after A) candidate-specific counts + recent apps  

---

## Supabase Findings

| Call | When | Blocks first paint? | Measured |
|------|------|---------------------|----------|
| Middleware `getSession()` | Every matched request | Yes (middleware) | NOT MEASURED ms (local JWT) |
| Layout `auth.getUser()` | Every dashboard render | **Yes** | Nested in RSC flight; not separately spanned |
| Membership via Postgres RLS | After getUser | **Yes** | Nested in RLS txn #1 |
| Notifications API auth+query | Client idle / poll | **No** for HTML | PROD **171–633 ms**; LOCAL **1,575 ms** |
| Realtime subscribe | Client mount | **No** | NOT MEASURED |

Storage: no storage calls on the audited soft-nav paths.

---

## Server Findings

| Layer | Evidence | Measured |
|-------|----------|----------|
| Middleware | `getSession` only (Phase 10) | Unauth redirect TTFB **~126 ms** PROD |
| Authorization | `requireEmployeeOrAdmin` sync after ctx | Negligible vs DB |
| Dual RLS tax | layout txn + page txn | Structural; exact split **NOT MEASURED** (needs server spans) |
| Service layer | Mostly inline Prisma in pages | — |
| Rendering / RSC | Soft-nav flight durations | PROD Apps **159–896 ms**; LOCAL Apps **4.0–5.3 s** |
| Serialization | Apps RSC transfer ~6–9 KB | Download rarely the bottleneck |

Phase 9 local-runtime warm TTFB (~100–175 ms) is **not** the same metric as soft-nav Time-to-Useful measured here.

---

## Client Findings

| Item | Evidence |
|------|----------|
| Hydration | Hard reload DCL **~350–495 ms** PROD with cached assets |
| JS (build chunks on disk) | **~2.0 MB** total under `.next/static/chunks`; largest **~489 KB** |
| Prod CSS | **85,295 B** (`45a199_uvtpj7.css`) |
| Font | 1 woff2 referenced from login HTML |
| Renders | Workbenches filter/sort up to 250 rows in `useMemo` after hydrate — secondary vs RSC wait |
| Navigation feedback | Link opacity/ring only; **no main-shell skeleton during soft nav** |
| Prefetch | Sidebar: **off**. Idle `RoutePrefetcher`: sequential apps/tasks/candidates |

---

## Route-by-Route Results

### PRODUCTION soft-nav (employee, measured 2026-10-04)

| Route | Cold soft useful | Warm soft useful | Settle | Interactive (approx) |
|------|------------------|------------------|--------|----------------------|
| `/employee/applications` | **562 ms** (first in sequence; RSC up to 896 ms earlier in session) | **561 ms** | **1,364 ms** | ≈ settle |
| `/employee/application-log` | **667 ms** | — | **1,468 ms** | ≈ settle |
| `/employee/jobs` | **610 ms** | — | **1,411 ms** | ≈ settle |
| `/employee/candidates` | **304 ms** | — | **1,106 ms** | ≈ settle |
| `/employee/messages` | **407 ms** | — | **1,209 ms** | ≈ settle |
| `/employee/tasks` | **305 ms** | — | **1,106 ms** | ≈ settle |
| Hard reload Applications | Document TTFB **26 ms**, DCL **495 ms** | — | — | ~500 ms (cached assets) |
| Hard navigate Application Desk | Document TTFB **27 ms**, DCL **356 ms**, load **406 ms** | — | — | ~400 ms |

### LOCAL DEV soft-nav (employee, measured 2026-10-04)

| Route | Useful | Settle |
|------|--------|--------|
| `/employee/applications` | **5,566 ms** | **6,068 ms** |
| `/employee/application-log` | **3,582 ms** | **4,084 ms** |
| `/employee/jobs` | **3,238 ms** | **3,739 ms** |
| `/employee/applications` (repeat) | **4,296 ms** | **4,797 ms** |

### Candidate / Admin

| Path | Status |
|------|--------|
| Candidate Dashboard → Applications (PROD) | **NOT MEASURED** this session (employee login used) |
| Admin → Applications Console | Canonical route is `/employee/applications` (same Console); expect same RSC class |

Unauthenticated document TTFB PROD `/login`: **132–348 ms** (curl). LOCAL `/login`: **~98–103 ms**.

---

## Root Cause Ranking

### P0 — Critical latency blockers

1. Soft-nav **must wait for full RSC** (auth + RLS txn + page queries) with **prefetch disabled** on primary nav.  
2. **LOCAL** Applications/Desk/Jobs soft-nav **3–6 s** — primary experiential match to “2–3 seconds” (worse than stated).  
3. **Dual interactive RLS transactions** + pool `max: 3` under concurrent prefetch/notifications.

### P1 — Major contributors

1. Over-fetch: Applications `job: true` ×250; Desk 500 jobs with descriptions + 2000 lean submitted rows.  
2. False `Promise.all` parallelism inside a single interactive transaction.  
3. Soft-nav **dead air** (stale UI until Flight completes); skeleton mainly for hard loads.  
4. Employee dashboard **10** heavy includes on every visit (when navigating from/to home).

### P2 — Moderate

1. Notifications API **0.2–1.6 s** competing after paint.  
2. Idle RoutePrefetcher RSC storms (sequential but still costly).  
3. Client workbench processing large in-memory lists.

### P3 — Minor

1. CSS ~85 KB; font load.  
2. Largest JS chunk ~137 KB transferred on first PROD soft session.  
3. Cosmetic link pending styles.

---

## Recommended Fix Plan (DO NOT IMPLEMENT IN THIS PHASE)

| # | Problem | Evidence | Expected improvement | Risk | Difficulty |
|---|---------|----------|----------------------|------|------------|
| 1 | Prefetch off + soft-nav waits for full RSC | `TransitionLink` + PROD RSC 0.6–0.9 s / LOCAL 3–5 s | Cut click→useful toward prefetched warm path; hide latency | Prefetch storms vs pool_size 15 — must stay sequential/limited | Medium |
| 2 | Dual RLS txn per nav | layout + page `withRlsContext` | Save one `set_config`+round-trip (~tens–hundreds ms) | Must not weaken auth | Medium–Hard |
| 3 | Slim Applications select (no full `job` text) | `job: true` take 250 | Smaller Flight + less DB IO | Break UI if fields missing | Low–Medium |
| 4 | Desk: don’t load 500×`jobDescription` / 2000 submitted for metrics | application-log page | Large LOCAL Desk win | Metrics accuracy | Medium |
| 5 | Soft-nav shell: keep AppShell, stream/suspend page with visible skeleton | Dead air observation | Perceived useful shell &lt;300 ms | UX consistency | Medium |
| 6 | True server spans (OpenTelemetry) for getUser / RLS / queries | Split NOT MEASURED | Enables precise P0 targeting | Ops | Medium |
| 7 | Cap concurrent RLS (prefetch + notifications) | pool max 3 | Fewer 0.6–0.7 s waiting spikes | Stale badges | Low |

---

## Security note

No authorization checks should be removed. Any future coalescing of auth/membership must preserve cryptographic `getUser()` and RLS tenant isolation.

---

## Appendix A — Instrumentation notes

- Soft-nav timings: CDP `Runtime.evaluate` harness; useful = target `<h1>` text match.  
- Resource timings: `PerformanceResourceTiming` for `?_rsc=` and `/api/notifications`.  
- Hard reload Navigation Timing can show **cached** asset `transferSize=0`; document timings still valid.  
- Server-side per-function ms (middleware vs getUser vs each Prisma call) require APM — **NOT MEASURED** in this audit.  
- Viewport for soft-nav series: **~766 px** width (mobile chrome). Desktop width series not re-run; soft-nav bottleneck is server RSC, not layout width.

## Appendix B — Code anchors

| Area | Path |
|------|------|
| Prefetch disabled | `src/components/ui/TransitionLink.tsx` |
| Dual auth | `src/app/(dashboard)/layout.tsx`, `src/lib/auth/context.ts` |
| RLS txn | `src/lib/db/rls.ts` |
| Pool | `src/lib/db/prisma.ts` (`max: 3`) |
| Console queries | `src/app/(dashboard)/employee/applications/page.tsx` |
| Desk queries | `src/app/(dashboard)/employee/application-log/page.tsx` |
| Idle prefetch | `src/components/navigation/RoutePrefetcher.tsx` |
| Notifications | `src/components/NotificationsBell.tsx` → `/api/notifications` |
