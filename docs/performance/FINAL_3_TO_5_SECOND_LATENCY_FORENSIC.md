# FINAL PRODUCTION 3–5 SECOND LATENCY FORENSIC

**Document type:** READ-ONLY FORENSIC DIAGNOSTIC — no application code, Vercel, Supabase, schema, index, RLS, or env changes were made to improve performance.  
**Date (UTC):** 2026-10-01  
**Production URL under test:** `https://citrux-apply-mrgx.vercel.app`  
**Method:** Live headers + Vercel inspect/API + authenticated Chromium Network/fetch timing + static request-path analysis  
**Explicit non-goals:** No optimizations, no region pin applied, no query rewrites, no temporary production instrumentation left behind

---

## 1. Executive Summary

Post–Mumbai cutover on `citrux-apply-mrgx`, **soft-navigation RSC TTFB is often already ~270–500ms**, but users can still experience **~3–5s** because:

1. **Dynamic Node compute still runs in `iad1` (US East), not `bom1`**, while edge is `bom1`.  
2. **Full HTML document responses** for authenticated pages show **TTFB ~2.2–3.3s** (and total ~5.5–6.6s).  
3. **`GET /api/notifications?limit=15`** (AppShell / `NotificationsBell` initial load) consistently costs **~2.8–3.9s TTFB** for a **44-byte** JSON body — a standalone ~3s tax on dashboard shell mount.  
4. Page data still uses **dual `withRlsContext` transactions** (layout auth + page) with **serialized SQL** inside each txn; this remains architecturally expensive when multiplied by cross-region RTT from `iad1`.

Mumbai Auth URL is **verified** (`vgrvijugljzlpohsbmjg`). Soft-nav page TTFB improvement vs the old Seoul ~3s dual-txn floor is real; the remaining 3–5s feel is **not** “Mumbai migration failed,” nor primarily client hydration.

### FINAL VERDICT

**G. MULTIPLE CONTRIBUTING FACTORS**

Dominant measured contributors (ordered):

1. **`/api/notifications` auth + RLS + rate-limit waterfall (~3s)** — AppShell path  
2. **Authenticated full-document SSR TTFB (~2–3s+)** — hard load / full render path  
3. **Vercel function region `iad1` (not `bom1`)** — amplifies every server DB/Auth round-trip  
4. **Dual interactive RLS transactions + serialized Prisma queries** — structural multiplier  

Confidence: **HIGH** on (1)(2)(3); **HIGH** on architecture for (4); **MEDIUM** on exact per-statement ms inside Vercel (no production query probes installed by design).

---

## 2. Production Deployment Identity

| Field | Value | Evidence |
|---|---|---|
| Production URL | `https://citrux-apply-mrgx.vercel.app` | Live + Vercel aliases |
| Vercel user/team | `balakrishnamanthena18-1344` | CLI `whoami` / `teams ls` |
| Project name | `citrux-apply-mrgx` | CLI project list |
| Project ID | `prj_gLxqo9Lc47KZLHKFWziwb1esInRy` | Vercel API |
| Deployment ID | `dpl_6ZpgRWdiGrbj2yKAHesxx4AyG9ce` | `vercel inspect` |
| Deployment URL | `citrux-apply-mrgx-pgdhzkjej-balakrishnamanthena18-1344.vercel.app` | inspect |
| Git | `balakrishnamanthena18-debug/Citrux_Apply` · branch `main` | deployment meta |
| Commit SHA | `9c7ffd97ce188944cb94e40d2506162203ecce1e` | deployment meta |
| Commit message | Phase 10 navigation TTU / skeletons | meta |
| Created (local inspect) | 2026-10-01 ~15:03 IST (~2h before this forensic) | inspect |
| Framework / Node | Next.js · Node 24.x | project API |
| Ready state | Ready | inspect |
| Build machine region | Washington, D.C. (`iad1`) | build logs |

---

## 3. Actual Vercel Compute Region

| Layer | Region | Evidence |
|---|---|---|
| Edge receive | **`bom1`** | `x-vercel-id: bom1::…` on cached HTML |
| Middleware | Multi-region incl. `bom1` | inspect: `_middleware … [bom1, …, iad1, …]` |
| Dynamic server functions | **`iad1` only** | inspect: `λ index … [iad1]`; deployment `regions: ["iad1"]` |
| Live dynamic proof | **`bom1::iad1::…`** | `/api/health`, RSC MISS, `/api/notifications`, HTML document |

**Conclusion:** Edge bom1 ≠ compute bom1. Production dynamic work is **iad1**.

Repo `vercel.json` has **no** `regions` pin (unchanged this phase).

---

## 4. Actual Supabase Project / Region

| Check | Result | Evidence |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Mumbai** `vgrvijugljzlpohsbmjg.supabase.co` | `vercel env pull` fingerprint; sha8 matches migration `TARGET_SUPABASE_URL` |
| Expected region | **`ap-south-1`** | Mumbai project from migration artifacts |
| `DATABASE_URL` / `DIRECT_URL` values | **Not decryptable** via env pull (Secret placeholders) | Vercel Secret type |
| Seoul host in public config | **Not present** | URL fingerprint |
| Runtime login | Admin session succeeded on mrgx | Browser |

**Safe reportable identity**

- Project ref: `vgrvijugljzlpohsbmjg`  
- Hostname: `vgrvijugljzlpohsbmjg.supabase.co`  
- Region class: Mumbai / `ap-south-1` (Auth URL proven; DB URL secret but cutover + working app strongly imply Mumbai data plane)

No secrets printed.

---

## 5. Public Baseline (n=5)

### `GET /`

| Metric | Samples (ms) | Median |
|---|---|---|
| DNS | 16.6, 1.8, 1.8, 2.1, 2.3 | 2.1 |
| TCP | 25.5, 10.4, 10.4, 10.5, 11.9 | 10.5 |
| TLS | 86.6, 69.3, 70.9, 72.3, 74.7 | 72.3 |
| TTFB | 147.9, 137.1, 126.7, 131.9, 146.0 | **137.1** |
| Total | ~127–148 | **137.7** |
| Cache | HIT | |
| `x-vercel-id` | `bom1::…` (no iad1) | |

### `GET /login`

| Metric | Median |
|---|---|
| TTFB / Total | **~135–136ms** |
| Cache | HIT · `bom1::…` |

### `GET /api/health`

| Metric | Samples (ms) | Median |
|---|---|---|
| TTFB | 331, 319, 325, 334, 321 | **325** |
| Total | ~320–334 | **326** |
| Cache | MISS | |
| `x-vercel-id` | **`bom1::iad1::…`** | |

**Interpretation:** Static/public HTML is fast at edge. Even a no-DB JSON health function costs ~250–350ms from India via **iad1**.

---

## 6. Authenticated Route Measurements

Session: `admin@citrux.com` on production (browser).

### Soft navigation (TransitionLink)

| Navigation | Observed |
|---|---|
| `/employee/applications` → `/employee/tasks` (clean) | **~715ms** usable; RSC fetch wrapper **275–364ms**; `bom1::iad1`; cache MISS |
| Repeated tasks navigations | RSC **~275–398ms** |

### Authenticated fetch forensics (sequential, credentials included)

#### `/api/notifications?limit=15` (critical)

| Run | TTFB | Total | Bytes | Region |
|---|---:|---:|---:|---|
| 1 | 3901 | 3902 | 44 | bom1::iad1 |
| 2 | 3024 | 3025 | 44 | bom1::iad1 |
| 3 | 3398 | 3398 | 44 | bom1::iad1 |
| Earlier set | 2722–3379 | same | 44 | bom1::iad1 |

**Median class: ~3.0–3.4s** for an empty/small notifications payload.

#### Full HTML document `GET /employee/applications`

| Run | TTFB | Total | Bytes |
|---|---:|---:|---:|
| 1 | 3346 | 6576 | 146679 |
| 2 | 2266 | 5667 | 146679 |
| 3 | 2242 | 5590 | 146679 |

**TTFB class: ~2.2–3.3s** · **Total class: ~5.5–6.6s**

#### RSC soft payloads (prefetch headers)

| Route | TTFB range | Total range | Bytes |
|---|---|---|---|
| `/employee/applications` | 279–350 | 1781–2060 | ~14617 |
| `/employee/tasks` | 269–365 | 1693–2237 | ~14610 |
| `/admin` | 269–314 | 1745–2412 | ~14543 |
| `/admin/members` | 285–456 | 1926–2208 | ~14609 |

**TTFB class: typically <500ms** · **Complete transfer often ~1.7–2.4s** under this measurement harness (streaming/flight + iad1). Clean UI soft-nav still measured ~0.7s apps→tasks.

### Contended / incidental waterfall notes

When many RSC prefetches + notifications overlapped, Resource Timing showed multi-second `duration` with short `ttfb` on some entries, and notifications **4.3–7.7s** under contention. Parallelism on the client **does not** remove server cost; it can worsen queueing.

---

## 7. Browser Waterfall Findings

For slow experiences, the waterfall waits on:

| Hypothesis | Supported? |
|---|---|
| A. Document / RSC response | **YES** for full HTML (TTFB 2–3s+); soft RSC TTFB often OK |
| B. Server action on nav | **NO** evidence for initial soft nav |
| C. API endpoint | **YES — `/api/notifications` ~3s** on shell load |
| D. Browser→Supabase direct | **Not observed** on nav (Auth is server-side) |
| E. Client JS primary | **NO** for 3s TTFB cases |
| F. Multiple sequential/parallel server requests | **YES** — layout/page RLS + notifications + optional prefetches |

**Classification of the ~3s feel:** primarily **server waiting** (document SSR and/or notifications API), not hydration-only.

---

## 8. Auth Timing

| Stage | Where | Finding |
|---|---|---|
| Middleware `getSession()` | Edge middleware | Local JWT presence; multi-region middleware |
| `getUser()` | `getAuthenticatedContext` (React `cache`) | Network Auth verification per request needing identity |
| Login server action | Works on mrgx | Admin reached `/admin` |
| Notifications path | Calls `getAuthenticatedContext` again in Route Handler | **Extra getUser + membership RLS** independent of page RSC |

No production Auth RTT probe from inside `iad1` was installed (forbidden). India→Mumbai Auth health median ~94ms (underestimates iad1→Mumbai).

---

## 9. RLS Context Timing

| Path | RLS usage |
|---|---|
| Dashboard layout | `withRlsContext` for membership |
| Each page | Second `withRlsContext` for page queries |
| `/api/notifications` | Third pattern: membership via context + **another** `withRlsContext` for `notification.findMany` |
| Rate limit on notifications | `consumeRateLimit` → Prisma `rateLimitBucket` (additional DB), outside RLS helper |

Per-statement RLS ms inside Vercel: **not instrumented** (no code changes). Architecture implies multiple interactive transactions per shell+page load.

---

## 10–11. Prisma Query Timing & Sequential Waterfalls

### Static inventory (page txn ops; excludes layout membership + `set_config`)

| Route | Approx page ops | Notes |
|---|---:|---|
| `/candidate*` | 2 | light |
| `/employee` | 10 | heavy home |
| `/employee/applications` | 4 | `Promise.all` still serial on one connection |
| `/employee/tasks` | 5+ | + governance lookups |
| `/employee/candidates` | 1 | light |
| `/admin` (= `/admin/dashboard`) | **20** | count/find waterfall |
| `/admin/applications` | 3 | |
| `/admin/members` | 2 | |

### Notifications route sequential work (code path)

```
getAuthenticatedContext
  → getUser()
  → withRlsContext(membership)
verifyAbuseProtection
  → consumeRateLimit → prisma.rateLimitBucket.*
withRlsContext(notification.findMany)
```

This is a **multi-stage server waterfall**. Measured wall clock ~3s with tiny response ⇒ time is **server/DB/Auth**, not payload size.

### Synthetic statement (no Vercel probe)

Cannot honestly claim exact T5/T6/T7 ms from production without instrumentation. Architectural expectation from `iad1`→Mumbai RTT class (~180–250ms literature; **not measured inside iad1 here**): N sequential statements ≈ N × RTT.

---

## 12. Layout / AppShell Timing

| Component | Work on navigation |
|---|---|
| `(dashboard)/layout.tsx` | Always `getAuthenticatedContext()` (getUser + membership RLS) |
| `AppShell` / `AppHeader` | Renders `NotificationsBell` |
| `NotificationsBell` | `useEffect` → **initial `fetch('/api/notifications?limit=15')`** (~3s) |
| `RealtimeProvider` | Client subscribe (not primary 3s TTFB) |
| `RealtimeRefresher` | No default polling refresh |

**Every first mount of the authenticated shell pays notifications ~3s.** Soft navigations that keep the client shell mounted should not re-run that effect; hard loads / remounts will.

---

## 13. RSC / Server Rendering Timing

| Mode | TTFB | Complete |
|---|---|---|
| Soft RSC (apps/tasks/admin) | often **250–500ms** | often **1.7–2.4s** in fetch harness; **~0.7s** clean UI nav apps→tasks |
| Full HTML document (apps) | **2.2–3.3s** | **5.5–6.6s** |
| Prefetch cache | MISS on dynamic authenticated | |

Navigation type: **client soft nav via `TransitionLink`/`router.push`** (not full reload) for sidebar; full document cost appears on hard load / first HTML.

---

## 14. Client Hydration Timing

Same-page InstantTabs / filters remain architecture-level **≪100ms** (no server dual-txn).  
No evidence that 3s TTFB is hydration. Client contributes after server returns; notifications fetch can **extend perceived readiness** of the header/bell after navigation paint.

---

## 15. Cold vs Warm

| Surface | Cold-ish | Warm |
|---|---|---|
| `/api/health` | ~330–410ms | ~230–300ms |
| `/api/notifications` | ~2.7–3.9s | **still ~2.8–3.4s** |
| Soft RSC TTFB | ~300–500ms+ | ~270–350ms |
| Full HTML apps | first 3.3s TTFB | still **~2.2s TTFB** |

**Warm notifications remaining ~3s ⇒ not a cold-start-only problem.**

---

## 16. Candidate / Employee / Admin Comparison

| Route | Role | TTFB | Total | DB (arch.) | Auth | Render | Requests |
|---|---|---:|---:|---|---|---|---|
| `/candidate` | (admin session probe earlier) | ~275–1271 | ~1.7–4.2 | light page + layout | getUser+RLS | RSC | RSC (+ notif on shell) |
| `/employee/applications` | Admin acting in employee routes | RSC ~280–350; HTML ~2.2–3.3 | RSC ~1.8–2.1; HTML ~5.5–6.6 | 4 page ops + layout | yes | SSR/RSC | RSC + `/api/notifications` on mount |
| `/admin` / dashboard | Admin | RSC ~270–310 | ~1.7–2.4 | **~20 page ops** | yes | SSR/RSC | same |
| `/api/notifications` | All dashboard roles | **~3.0–3.4** | **~3.0–3.4** | membership + rate limit + notifications | yes | JSON | 1 API |

**Problem class:** **global to authenticated dashboard shell** (notifications + iad1), with **route-specific amplification** on heavy pages / full HTML, not candidate-only or client-only.

---

## 17. Root Cause

**Multiple contributing factors**, with measured dominance:

1. **AppShell notifications API waterfall (~3s warm)** — strongest single isolated ~3s signal.  
2. **Authenticated full-document SSR TTFB (~2–3s)** — matches classic “page takes 3–5s” on reload/first entry.  
3. **Function placement `iad1` while Supabase is Mumbai** — every Auth/DB hop pays US–India distance.  
4. **Dual RLS interactive transactions + serialized Prisma `Promise.all`** — structural multiplier (especially admin 20-op pages).

Not primarily: fonts, hydration, Realtime subscribe setup, or “Mumbai cutover didn’t happen” (Auth URL is Mumbai).

---

## 18. Evidence (anchors)

1. `vercel inspect`: deployment regions `["iad1"]`; functions `[iad1]`.  
2. Live headers: `bom1::iad1::…` on health, RSC MISS, notifications, HTML.  
3. Env fingerprint: `NEXT_PUBLIC_SUPABASE_URL` → `vgrvijugljzlpohsbmjg.supabase.co`.  
4. Notifications n≥8: **~2.8–3.9s TTFB**, 44 bytes, cache MISS.  
5. HTML `/employee/applications` n=3: TTFB **2.2–3.3s**, total **5.5–6.6s**.  
6. Soft nav apps→tasks: **~715ms** usable; RSC **~300ms** class.  
7. Code: `NotificationsBell` initial fetch; notifications route = getUser + RLS + rate limit + RLS.  
8. Code: layout + page dual `withRlsContext`; `Promise.all` inside one txn.

---

## 19. Confidence Level

| Claim | Confidence |
|---|---|
| Compute is `iad1` | **HIGH** |
| Auth project is Mumbai | **HIGH** |
| Notifications API ≈3s warm | **HIGH** |
| Full HTML SSR ≈2–3s TTFB | **HIGH** |
| Soft RSC TTFB often <500ms | **HIGH** |
| Exact per-SQL ms inside Vercel | **LOW** (not instrumented) |
| DB URL host string | **MEDIUM** (secret; inferred) |

---

## 20. Recommended Fix (DO NOT IMPLEMENT IN THIS PHASE)

Ordered by measured leverage:

1. **Pin Vercel serverless `regions` to `bom1`** and redeploy; prove `x-vercel-id` no longer contains `iad1` for dynamic routes.  
2. **Re-profile `/api/notifications`**: remove duplicate identity/RLS/rate-limit waterfalls where safe; avoid blocking shell usability on a 3s fetch; do **not** weaken auth.  
3. After bom1: re-measure HTML TTFB + notifications; then collapse dual RLS txns / reduce admin statement count if still > target.  
4. Re-run authenticated sidebar matrix (3×) and publish before/after table.

---

## 21. Risks

| Risk | Note |
|---|---|
| Pinning `bom1` on Hobby | Confirm plan supports region pin |
| Touching notifications/auth | Must preserve RLS + abuse controls |
| Misreading soft-nav as “fixed” | Full HTML / shell mount still slow |
| Assuming DB URL without decrypt | Confirm `DATABASE_URL` host in Vercel UI before claiming 100% |

---

## 22. What MUST NOT Be Changed (until directed)

- Do not remove `withRlsContext` / RLS  
- Do not weaken `getUser()` authenticity  
- Do not disable rate limiting without a security review  
- Do not add Redis/caching as a blind fix  
- Do not rewrite architecture without re-measure after region pin  
- Do not modify Seoul/Mumbai data to “fix perf”

---

## 23. Next Implementation Step

**Step A (infra):** Set function region `bom1` on `citrux-apply-mrgx`, redeploy, verify `x-vercel-id`.  
**Step B (measure):** Repeat this forensic’s notifications + HTML + soft-nav tables.  
**Step C (only if still >1s):** Targeted notifications/auth-path and dual-txn reductions with security review.

---

## FINAL VERDICT (required label)

### G. MULTIPLE CONTRIBUTING FACTORS

Primary measured story: **`iad1` compute + multi-txn Auth/RLS/rate-limit waterfalls**, with the **notifications API (~3s)** and **full-document SSR TTFB (~2–3s)** explaining the user-visible 3–5s class; soft RSC TTFB is often already sub-500ms after Mumbai, so this is **not** a failed Mumbai Auth URL cutover and **not** primarily client hydration.

**STOP.** Do not implement the fix in this phase.
