# Route Navigation 5-Second Forensic Audit

**Document type:** FORENSIC PROFILING ONLY — no application code, schema, RLS, auth, or region changes were made.  
**Date:** 2026-10-01  
**Trigger:** Real-user observation that Phase 10 skeletons appear, but destination routes still take ~5 seconds to become usable.  
**Production app identified:** `https://citrux-apply.vercel.app`

---

## Executive Summary

Same-page interactions are instant because they never leave the browser.

Cross-sidebar navigations take ~5 seconds because **every soft navigation re-executes a dynamic server tree that opens two interactive Prisma/RLS transactions against a Postgres database in a different region from Vercel**, and each SQL statement inside those transactions pays a full network round-trip (~120–140ms measured). `Promise.all` inside `withRlsContext()` does **not** parallelize those statements on one connection — they serialize.

**Measured (India → Seoul DB, same geography class as Vercel `bom1`):**

| Scenario | Measured |
|---|---|
| Per SQL statement RTT | **120–140ms** |
| Layout-like auth RLS txn | **~740–790ms** |
| `/employee/applications`-like page RLS txn | **~1970–2020ms** |
| Dual-txn total (auth + apps page) | **~2710–2810ms** |
| `/employee`-home-like page txn (10 queries) | **~1610ms** |
| `/admin`-like page txn (~20 ops) | **~3300ms** |
| `/admin/members`-like page txn | **~950ms** |
| `/employee/tasks`-like page txn | **~1980ms** |
| Cold new client first txn | **~1000ms** |

**Verified regions:**

| Component | Region | Evidence |
|---|---|---|
| Vercel | **`bom1` (Mumbai, India)** | `x-vercel-id: bom1::…` on `citrux-apply.vercel.app` |
| Supabase Postgres | **`ap-northeast-2` (Seoul)** | `DATABASE_URL` host `aws-0-ap-northeast-2.pooler.supabase.com:6543` |

**Root cause class:** **NETWORK** (cross-region RTT) amplified by **DATABASE/RLS architecture** (chatty interactive transactions + dual txn per nav).  
Not primarily hydration, skeletons, InstantTabs, or missing loading UI.

Authenticated browser Network waterfalls on production: **NOT MEASURED** (login wall; no credentials in this session). The ~5s user report is explained by measured server/DB timing + unmeasured getUser/RSC/hydrate remainder.

---

## User Observation

| Interaction | Observed |
|---|---|
| Same-page tabs / search / filter / sort | Smooth / instant |
| `/employee` → `/employee/applications` | ~5s to usable (skeleton shows first) |
| `/employee/applications` → `/employee/tasks` | ~5s |
| `/admin` → `/admin/members` | ~5s |

Phase 10 loading UI confirms the wait is **after click acknowledgment**, during destination RSC completion.

---

## Test Environment

| Item | Value |
|---|---|
| Production URL | `https://citrux-apply.vercel.app` (confirmed OOS login + `/employee` → login redirect) |
| Vercel region | `bom1` (Mumbai) — **KNOWN** |
| Supabase DB | `aws-0-ap-northeast-2.pooler.supabase.com` — **KNOWN** (Seoul) |
| `DATABASE_URL` | Port **6543** (transaction-mode pooler) |
| `DIRECT_URL` | Port **5432** (session-mode pooler) — present but **Prisma runtime uses `DATABASE_URL`** |
| Auth for browser RSC | **Blocked** — no session cookies available to automation |
| Local probe machine | IST timezone / India path to Seoul (~125ms TCP) |
| App code changes | **None** (temporary timing ran outside repo and was deleted) |

---

## Production Measurements

### Browser / Network (authenticated)

| Metric | Value |
|---|---|
| Click → RSC request timing | **NOT MEASURED** (requires authenticated session) |
| RSC TTFB | **NOT MEASURED** |
| RSC size | **NOT MEASURED** |
| Hydration duration | **NOT MEASURED** |
| Time to Usable | User-reported **~5000ms**; instrumented production capture **NOT MEASURED** |

### Unauthenticated production probes

| Probe | Result |
|---|---|
| `GET /login` | 200, `x-vercel-id: bom1::…`, warm TTFB ~100–400ms |
| `GET /employee` | 307 → `/login?redirectTo=/employee` |
| Prefetch headers | App advertises RSC vary headers; authenticated prefetch **NOT MEASURED** |

### Database / RLS statement timing (measured)

From probe machine to production DB pooler (representative of Vercel `bom1` → Seoul path):

| Step | Duration |
|---|---|
| TCP connect to `:6543` | min 124 / median ~136 / max 185 ms |
| Pool/client acquire (cold) | **~730–825ms** (raw pg) / **~999ms** (new Prisma client first txn) |
| BEGIN | ~120–137ms |
| `set_config(request.jwt.claim.sub)` | ~120–137ms |
| Simple `COUNT(*)` | ~120–138ms |
| COMMIT | ~120–137ms |

**Conclusion:** Almost all “query time” for trivial SQL is **network RTT**, not Postgres CPU.

### Prisma dual-transaction mimic of real pages (measured)

Using the same pattern as production: `prisma.$transaction` + `set_config` + page queries (fake user UUID; RLS returns empty/limited rows — **RTT still paid**).

| Route shape | Auth txn | Page txn | Combined |
|---|---:|---:|---:|
| Applications (`Promise.all` ×4 deep includes) | 736–793ms | 1973–2018ms | **2710–2811ms** |
| Employee home (10 ops) | (separate) | **1613ms** | ~740+1613 ≈ **2350ms** DB-only |
| Tasks (5 ops w/ includes) | (separate) | **1983ms** | ~740+1983 ≈ **2720ms** DB-only |
| Admin dashboard (~20 ops) | (separate) | **3302ms** | ~740+3302 ≈ **4040ms** DB-only |
| Admin members (2 ops) | (separate) | **951ms** | ~740+951 ≈ **1690ms** DB-only |

**These are already 1.7–4.0 seconds of DB/RLS work before getUser, RSC serialize, transfer, and hydration.**

That is sufficient to explain a ~5 second Time-to-Usable once the remaining unmeasured layers are included.

---

## Same-Page vs Cross-Page Comparison

| Dimension | Same-page tab (Applications → Submitted) | Cross-page (Applications → Tasks) |
|---|---|---|
| Network request | **0** | Soft RSC navigation to server |
| Middleware | No | Yes (`getSession`) |
| Layout `getAuthenticatedContext` | No | Yes (`getUser` + RLS membership txn) |
| Page `withRlsContext` | No | Yes (full page queries) |
| Prisma | No | Yes |
| Hydration of new workbench props | No (local state) | Yes |
| Measured cost | Client filter ≪ 50ms (architecture) | DB dual-txn alone **~2.7s** for apps/tasks shapes |

**Why A is instant and B is ~5s:** B re-enters the full server/auth/RLS/DB pipeline over Mumbai↔Seoul latency; A does not.

---

## Navigation Waterfalls

Exact authenticated browser milliseconds: **NOT MEASURED**.  
Below: **architecture + measured DB components**. Values marked `≈` are measured; others `NOT MEASURED`.

### Waterfall 1 — `/employee` → `/employee/applications`

```
CLICK
 ↓
TransitionLink pending + loading.tsx skeleton          [perceived immediate]
 ↓
Middleware getSession()                                [NOT MEASURED; expected <<100ms local JWT]
 ↓
Layout getAuthenticatedContext
   ├─ supabase.auth.getUser()                          [NOT MEASURED]
   └─ withRlsContext membership                        ≈ 740–790ms (measured)
 ↓
Page withRlsContext
   ├─ BEGIN + set_config                               ≈ 250ms (2×RTT)
   ├─ application.findMany take 250 + deep includes    ⎤
   ├─ candidate.findMany take 100                      ⎥ Promise.all but
   ├─ job.findMany OPEN take 100                       ⎥ SERIAL on 1 conn
   ├─ job distinct sources                             ⎦ ≈ 1970–2020ms total page txn
   └─ COMMIT
 ↓
RSC serialize + transfer                               [NOT MEASURED]
 ↓
Hydrate EmployeeApplicationsWorkbench                  [NOT MEASURED]
 ↓
USABLE                                                 user ≈ 5000ms
```

**Where ~5s go (best evidenced split):**

| Bucket | ms | Confidence |
|---|---:|---|
| Dual RLS/DB interactive txns | **~2700–2800** | High (measured) |
| getUser + middleware + RSC + hydrate + misc | **~2200–2300** remainder to hit ~5000 | Medium (inferred from user total − measured DB) |
| SQL CPU on 13-row tenant | small vs RTT | High (simple queries ≈ one RTT) |

### Waterfall 2 — `/employee/applications` → `/employee/tasks`

```
CLICK → skeleton
 ↓
Middleware getSession                                  [NOT MEASURED]
 ↓
Layout auth RLS                                        ≈ 740–790ms
 ↓
Page withRlsContext
   Promise.all([canCreate, tasks×250+includes, staff, cands, jobs, apps])
   → serialized on one connection                      ≈ 1983ms page txn measured
 ↓
RSC + hydrate                                          [NOT MEASURED]
 ↓
USABLE ≈ 5000ms
```

DB floor alone ≈ **740 + 1983 ≈ 2720ms**.

### Waterfall 3 — `/admin` → `/admin/members`

```
CLICK → skeleton
 ↓
Layout auth RLS                                        ≈ 740–790ms
 ↓
Page withRlsContext Promise.all([memberships, designations])
                                                       ≈ 951ms measured
 ↓
RSC + hydrate                                          [NOT MEASURED]
 ↓
USABLE ≈ 5000ms (user-reported)
```

DB floor ≈ **~1700ms**. Remaining ~3s on this lighter page is **NOT FULLY ATTRIBUTED** without authenticated RSC traces — candidates: getUser latency, cold acquire, RSC, or concurrent notification poll. Still dominated by server round-trips, not InstantTabs.

### Waterfall note — `/admin` dashboard itself

Admin page txn alone measured **~3302ms**. Dual-txn floor ≈ **~4040ms** before RSC. This route can exceed 5s from DB/RLS alone.

---

## Middleware Timing

| Step | Behavior | Measured |
|---|---|---|
| Bot UA check | Sync | negligible |
| `createServerClient` | Edge | NOT MEASURED |
| `getSession()` | Local JWT read (Phase 10) | Expected fast; **NOT MEASURED on Edge** |
| Redirect logic | Sync | negligible |

**Verdict:** Middleware is **unlikely** to be the 5-second consumer after Phase 10 (`getSession` vs `getUser`).  
Classification: **not primary**.

---

## Authentication Timing

Per navigation (dynamic dashboard layout + page):

| Op | Where | Dup? | Measured |
|---|---|---|---|
| `getSession` | Middleware | once | NOT MEASURED (expected low) |
| `getUser` | `getAuthenticatedContext` | once per RSC request (React.cache) | **NOT MEASURED** with real session |
| Membership + user + org include | same helper via RLS txn | once per request | **≈740–790ms** |

**Duplication:** Layout and page both call `getAuthenticatedContext`, but React `cache()` collapses to **one** getUser + **one** membership txn per request.  
Page then opens a **second** `withRlsContext` for data.

**Verdict:** Auth identity resolution is required once; **membership RLS txn is expensive due to RTT**, not because of triple getUser.

---

## RLS Timing

`withRlsContext` = interactive `$transaction` + `set_config` + callback.

| Component | Cost |
|---|---|
| Connection acquire (cold) | **~700–1000ms** measured |
| BEGIN | ~1 RTT (~125ms) |
| SET LOCAL jwt claim | ~1 RTT (~125ms) |
| Each Prisma query | ≥1 RTT (+ SQL) |
| COMMIT | ~1 RTT (~125ms) |

**RLS setup vs query execution:** For this tenant size, **setup and statement overhead dominate**; Postgres CPU on COUNT/small finds is not the bottleneck — **RTT is**.

**Do not weaken RLS.** The issue is **how often / how chattily** RLS context is established across a high-latency path.

---

## Prisma Timing

### Critical finding: false parallelism

`Promise.all([...])` **inside** `prisma.$transaction` still uses **one connection**. Statements serialize.  
Runtime emitted: *“Calling client.query() when the client is already executing a query is deprecated…”* — evidence of concurrent query attempts on one client.

So “parallelized Prisma” from earlier phases **does not buy wall-clock parallelism** under interactive RLS.

### Route statement counts (architecture)

| Route | Auth stmts (approx) | Page stmts (approx) | RTT-only @125ms |
|---|---:|---:|---:|
| Applications | 4 | 7 | ~1375ms |
| Tasks | 4 | ≥8 | ≥1500ms |
| Employee home | 4 | 12 | ~2000ms |
| Admin dashboard | 4 | ~22 | ~3250ms |
| Members | 4 | 5 | ~1125ms |

Measured Prisma times exceed pure RTT-only budgets because includes/metadata add extra statements/overhead.

---

## Database Connection Timing

| Item | Value |
|---|---|
| Runtime URL | `DATABASE_URL` **:6543** transaction pooler |
| Alternate | `DIRECT_URL` **:5432** session pooler (unused by `prisma.ts`) |
| Pool max | 10 |
| Interactive txn maxWait | 15000ms |
| Cold acquire | **~0.7–1.0s** measured |
| Warm reuse | Global Prisma singleton helps **within** a warm isolate; new isolates re-pay acquire |

**Connection acquisition can add ~1s on cold isolates**, but user reports ~5s on **repeated** navigations → primary issue is **per-navigation statement RTT**, not only cold acquire.

**Risk note (not changed):** Interactive transactions on transaction-mode poolers (6543) are discouraged by Prisma/Supabase docs. Latency pattern was similar on 5432 for single-connection probes; correctness/pooling behavior under concurrency remains a concern.

---

## Vercel Cold Start Analysis

| Test | Result |
|---|---|
| Login warm/cold TTFB | cold-ish ~400ms, warm ~100ms (unauthenticated) |
| Authenticated nav cold vs warm | **NOT MEASURED** in browser |
| User report | ~5s on **repeated** route changes |

**Verdict:** Cold start may worsen first hit, but **is NOT the primary explanation** for every sidebar navigation ≈5s. Warm path DB dual-txn alone is already multi-second.

---

## Vercel/Supabase Region Analysis

| | |
|---|---|
| Vercel | **KNOWN: `bom1` (Mumbai)** |
| Supabase Postgres | **KNOWN: `ap-northeast-2` (Seoul)** |
| Measured RTT | **~120–140ms per statement** from India path |
| Material contribution? | **YES — dominant amplifier** |

Cross-region architecture turns every interactive RLS statement into a ~125ms tax. Ten to twenty statements per navigation → multi-second floors.

---

## RSC Payload Analysis

| Item | Status |
|---|---|
| Production RSC byte size | **NOT MEASURED** |
| Tenant row counts observed in probe | applications ≈ **13** rows (small) |
| Caps in code | take 100–250 (apps/tasks), admin workload take 2000 |

With only ~13 applications, **payload size is unlikely to be the 5s root cause**. Serialization still adds some time (**NOT MEASURED**), but measured DB/RLS already accounts for most of a multi-second wait.

---

## Hydration Analysis

| Item | Status |
|---|---|
| Hydration ms | **NOT MEASURED** |
| Likelihood as primary 5s cause | **Low** — skeletons wait on RSC; same-page client work is instant; DB floor already 1.7–4.0s |

---

## React Rendering Analysis

| Item | Status |
|---|---|
| Main-thread long tasks on nav | **NOT MEASURED** |
| Same-page rendering | Fast (user + prior phases) |
| Cross-page | Blocked on server RSC first |

Rendering is **not** the first place to look for the 5s.

---

## Layout Re-execution Analysis

`(dashboard)/layout.tsx` always:

1. `await getAuthenticatedContext()` (getUser + RLS membership)
2. Mounts `RealtimeProvider`, `RealtimeRefresher`, `NavigationPerfProbe`, `AppShell`

On each soft navigation to a child page, the **server request still resolves dynamic layout work** (cookies/auth) plus page data. Client shell may stay mounted (Phase 10 skeletons), but **server auth/RLS cost still runs**.

**Expensive shared layout data fetching:** Yes — membership RLS on every nav.

---

## Prefetch Analysis

| Item | Finding |
|---|---|
| Sidebar | `TransitionLink` wraps `next/link` (prefetch still possible on viewport) |
| Click path | `preventDefault` + `router.push` |
| Dynamic routes | Auth/cookies force dynamic rendering |
| Verified prefetch network | **NOT MEASURED** authenticated |

Even perfect prefetch cannot eliminate Mumbai↔Seoul interactive txn cost; it can only hide it before click. User still sees ~5s → prefetch is **not saving** them (missing, incomplete, or still dynamic-expensive).

---

## Realtime Analysis

| Item | Finding |
|---|---|
| `RealtimeProvider` in layout | Subscribes once per scope key |
| Remount every nav? | Client layout persistence should keep provider; **NOT MEASURED** if soft nav remounts |
| Contribution to 5s RSC | Unlikely primary; subscription is client-side after paint |

---

## Notification Polling Analysis

| Item | Finding |
|---|---|
| Interval | 60s fallback / 5min when connected (Phase 10) |
| During navigation | May overlap `/api/notifications` (auth+RLS+rate limit) |
| Contended pool | Possible contributor under concurrency |
| Primary 5s cause? | **No** — dual-txn page cost alone explains multi-second waits |

---

## Required Timing Table

Authenticated production browser cells are **NOT MEASURED**. DB columns use measured Prisma mimics.

| Route | Navigation | TTFB | RSC | DB (measured mimic) | Auth RLS | Page RLS | Hydration | T2U |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Emp → Applications | soft | NOT MEASURED | NOT MEASURED | **2710–2811** | **736–793** | **1973–2018** | NOT MEASURED | ~5000 (user) |
| Apps → Tasks | soft | NOT MEASURED | NOT MEASURED | ~2720 (740+1983) | ~740 | **1983** | NOT MEASURED | ~5000 (user) |
| Admin → Members | soft | NOT MEASURED | NOT MEASURED | ~1690 (740+951) | ~740 | **951** | NOT MEASURED | ~5000 (user) |
| Employee home | soft | NOT MEASURED | NOT MEASURED | ~2350 (740+1613) | ~740 | **1613** | NOT MEASURED | NOT MEASURED |
| Admin dashboard | soft | NOT MEASURED | NOT MEASURED | ~4040 (740+3302) | ~740 | **3302** | NOT MEASURED | NOT MEASURED |

---

## Root Cause

**NETWORK + DATABASE/RLS architecture (cross-region interactive transactions).**

Not MIXED for its own sake: frontend/hydration are secondary. The verified multi-second floor is **server-side DB round-trips between Vercel `bom1` and Supabase `ap-northeast-2`**, multiplied by **two interactive RLS transactions** and **serialized statements**.

---

## Evidence

1. **Region mismatch KNOWN:** `bom1` vs `aws-0-ap-northeast-2`.  
2. **Per-statement latency ≈125ms** even for `SELECT COUNT(*)` / `set_config`.  
3. **Dual-txn applications mimic ≈2.7s** with Prisma.  
4. **Admin page mimic ≈3.3s** page txn alone.  
5. **Promise.all inside `$transaction` does not parallelize** (pg deprecation warning).  
6. **Same-page instant** proves client workbenches are not the 5s source.  
7. **Phase 10 skeletons** prove wait is destination RSC/server, not missing click feedback.  
8. Tenant data volume is small (~13 apps) → not “huge SQL scan” primary.

---

## Top Bottlenecks

| Rank | Bottleneck | Approx contribution | Confidence |
|---|---|---|---|
| 1 | Cross-region Vercel↔Postgres RTT × chatty interactive RLS | **~2–4s** of every nav | **High** |
| 2 | Dual transactions (layout membership + page data) | **~0.7–0.8s** extra fixed | **High** |
| 3 | False parallelism / high statement counts inside page txn | Turns N queries into N×RTT | **High** |
| 4 | Cold connection acquire on new isolates | **~0.7–1.0s** intermittent | Medium |
| 5 | getUser + RSC serialize/transfer/hydrate | Remainder to ~5s | Medium (partly unmeasured) |

---

## Recommended Fixes

**Recommendations only — not implemented.**

1. **FIRST: Co-locate compute and database**  
   - Move Vercel region to `icn1` / `ap-northeast-2`, **or** move Supabase to `ap-south-1` (Mumbai).  
   - Expected: slash per-statement RTT from ~125ms toward ~5–20ms → dual-txn floors drop by ~5–10×.  
   - Risk: ops/DNS; measure after.

2. **Collapse dual RLS transactions** without weakening RLS  
   - Resolve membership + page reads in **one** interactive transaction per request where safe.  
   - Expected: remove ~4 RTTs (~500ms at current distance; still helps after co-location).

3. **Stop relying on Promise.all inside interactive transactions for wall-clock speed**  
   - Prefer fewer round-trips: single SQL with joins, `$queryRaw` aggregates, or non-interactive batched reads with equivalent RLS guarantees (security review required).  

4. **Use session-mode/direct DB URL for interactive transactions**  
   - Align Prisma with `DIRECT_URL`/:5432 or session pooler per Supabase+Prisma guidance.

5. **Then** measure authenticated RSC waterfalls on production; only then trim payloads/hydration.

---

## Unknowns

- Authenticated production Network waterfall (RSC TTFB/size)  
- Exact `getUser()` latency with real session from Vercel `bom1`  
- Whether layout client remounts RealtimeProvider every nav  
- Whether prefetch ever completes for dynamic routes  
- Exact hydrate ms  
- Whether 6543 transaction mode adds extra failures under concurrency  

---

## Final Verdict

### Direct answers

1. **Why ~5s cross-page?** Each sidebar nav re-runs dynamic auth + **two interactive RLS/Prisma transactions** against **Seoul** Postgres from **Mumbai** Vercel; each SQL statement costs ~125ms RTT and Promise.all does not parallelize them.  
2. **Where are the 5 seconds?** Roughly **~2.7–4.0s verified in DB/RLS**, remainder **NOT FULLY MEASURED** (getUser/RSC/hydrate/cold acquire).  
3. **Middleware?** Unlikely primary (getSession).  
4. **Auth?** Partially — membership RLS txn ≈0.75s; getUser unmeasured.  
5. **RLS?** Yes — interactive context setup + per-statement RTT.  
6. **Prisma?** Yes — interactive `$transaction` chatty protocol + serialized Promise.all.  
7. **Connection acquisition?** Can add ~1s cold; not sole cause of every nav.  
8. **Vercel cold start?** Not primary for repeated ~5s nav.  
9. **Vercel↔Supabase region?** **YES — primary amplifier (KNOWN mismatch).**  
10. **RSC payload?** Unlikely primary (small tenant); unmeasured.  
11. **Hydration?** Unlikely primary.  
12. **Layout re-execution?** Yes — re-pays auth/RLS every nav.  
13. **Prefetch missing?** Possible incomplete help; not root cause.  
14. **Realtime?** Unlikely primary.  
15. **Notification polling?** Minor possible contention; not primary.  
16. **Single biggest verified bottleneck?** **Cross-region interactive RLS/Prisma round-trips.**  
17. **Top 3?** (1) Region RTT × interactive txn chatter (2) Dual RLS txns per nav (3) Serialized multi-query page transactions.  
18. **Fix FIRST?** **Co-locate Vercel and Supabase regions**, then re-measure; then collapse dual RLS txns / reduce statement count.

---

**End of forensic audit. No fixes implemented.**
