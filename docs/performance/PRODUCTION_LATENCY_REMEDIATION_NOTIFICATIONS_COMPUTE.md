# Production Latency Remediation — Notifications + Compute Region

**Document type:** TARGETED REMEDIATION (not a new broad performance phase)  
**Date (UTC):** 2026-10-01  
**Production:** `https://citrux-apply-mrgx.vercel.app`  
**Forensic basis:** `docs/performance/FINAL_3_TO_5_SECOND_LATENCY_FORENSIC.md`  
**Deployment after fix:** `dpl_2EoUmxmDzyZzsm5Qv2ekzFcjbGq5`

---

## FINAL STATUS

### PASS — TARGETED LATENCY REMEDIATION VERIFIED

Production browser measurements show large improvements on `/api/notifications`, authenticated RSC routes, and full HTML document TTFB. Dynamic compute moved from **`iad1` → `bom1`**. Security controls were not weakened.

---

## 1. Baseline (pre-change, authenticated production)

Captured on `citrux-apply-mrgx` before remediation (compute `bom1::iad1`):

| Route | Metric | Before (n=3) |
|---|---|---|
| `/api/notifications?limit=15` | TTFB | **2756 / 3093 / 3535 ms** (median **~3093**) |
| `/api/health` | TTFB | **248 / 387 / 435 ms** |
| `/employee/applications` (RSC) | TTFB / total | **~287–494 / ~1.6–2.2 s** |
| `/admin` (RSC) | TTFB / total | **~285–320 / ~1.6–2.1 s** |
| `/candidate` (RSC) | TTFB / total | **~283–468 / ~1.7–3.1 s** |
| `/employee/applications` (full HTML, prior forensic) | TTFB / total | **~2.2–3.3 s / ~5.5–6.6 s** |
| Regions | Edge / compute | **bom1 / iad1** |
| Supabase Auth | Project | Mumbai `vgrvijugljzlpohsbmjg` |

---

## 2. `/api/notifications` root cause

Request path **before**:

1. `getAuthenticatedContext()` → `getUser()` + **interactive RLS txn** (membership)  
2. `verifyAbuseProtection` → `consumeRateLimit` → **`findUnique` + atomic UPSERT** (2 DB round-trips)  
3. Second **`withRlsContext`** → notification `findMany`

Plus production functions in **`iad1`** talking to Mumbai Postgres ⇒ each round-trip expensive.

Why 44 bytes took ~3s: **Auth + multi-txn / multi-statement DB waterfall × cross-region RTT**, not payload size, not hydration.

---

## 3. Full-document SSR root cause

| Mode | Before | Why |
|---|---|---|
| Soft RSC TTFB | often 270–500ms | Partial flight; still dynamic but lighter than full HTML |
| Full HTML TTFB | 2.2–3.3s | Full authenticated SSR tree: layout `getAuthenticatedContext` + page second RLS txn + serialize large HTML, all on **iad1** |

Root layout (`src/app/layout.tsx`) has no DB work. Cost is **dashboard layout auth + page queries + iad1↔Mumbai**, not fonts alone.

Notifications were **not** in the HTML TTFB path (client `useEffect`), but competed for UX after paint and amplified perceived latency.

---

## 4. Compute-region findings

| Item | Finding |
|---|---|
| Supported mechanism | `vercel.json` → `"regions": ["bom1"]` (Vercel Functions project default) |
| `preferredRegion` in Next route files | Deprecated / not used (avoid unsupported values) |
| Applied | **Yes** — `"regions": ["bom1"]` |
| Cron | Same region; still hits Mumbai DB (acceptable) |
| After deploy proof | `λ index … [bom1]`; live `x-vercel-id: bom1::bom1::…` |

---

## 5. Changes implemented

| Change | File(s) | Security impact |
|---|---|---|
| Collapse notifications to **one** `getUser` + **one** RLS txn (membership + list) | `src/app/api/notifications/route.ts` | Auth + membership + RLS retained |
| `consumeRateLimit` → single atomic UPSERT (remove redundant `findUnique`) | `src/lib/auth/rate-limiter.ts` | Rate limiting retained (still enforced) |
| Defer NotificationsBell initial fetch (`requestIdleCallback` / timeout) | `src/components/NotificationsBell.tsx` | Realtime + polling + auth on open retained |
| Pin functions to Mumbai | `vercel.json` `regions: ["bom1"]` | No auth/RLS change |
| Unit test mocks updated for atomic consume | `tests/unit/abuse-protection.test.ts` | Tests only |

**Not changed:** RLS policies, FORCE RLS, `withRlsContext` usage for tenant data, service-role exposure, caching of personalized HTML, Redis, new infra.

---

## 6. Security invariants verified

| Invariant | Status |
|---|---|
| Supabase Auth `getUser()` on notifications | **Kept** |
| ACTIVE membership gate inside RLS txn | **Kept** |
| `withRlsContext` for notification rows | **Kept** |
| Abuse / rate limiting on notifications | **Kept** (atomic consume) |
| Bot UA block | **Kept** |
| No service-role on client | **Kept** |
| No global HTML cache of authed pages | **Kept** |
| Unit abuse-protection tests | **8/8 pass** |
| Rate-limit unit tests | **19/19 pass** |

---

## 7. Before / after measurements (production browser)

All after values from authenticated session on `https://citrux-apply-mrgx.vercel.app` post-deploy `dpl_2EoUmxmDzyZzsm5Qv2ekzFcjbGq5`.

| Route | Before | After | Improvement |
|---|---:|---:|---:|
| `/api/notifications` TTFB (warm median) | **~3093 ms** | **~144 ms** (126 / 162 / later 152–189) | **~95%** (−~2.9 s) |
| `/api/notifications` first post-deploy | ~3093 ms class | **1208 ms** cold then sub-200 warm | Large |
| `/candidate` RSC TTFB (warm) | ~283–468 ms | **~86–91 ms** | **~70%+** |
| `/employee/applications` RSC TTFB | ~287–494 ms | **~85–99 ms** | **~75%+** |
| `/employee/applications` RSC total | ~1.6–2.2 s | **~123–139 ms** | **~90%+** |
| `/admin` RSC TTFB | ~285–320 ms | **~89–95 ms** | **~70%+** |
| `/employee/applications` full HTML TTFB | **~2.2–3.3 s** | **~141–198 ms** | **~90%+** |
| `/employee/applications` full HTML total | **~5.5–6.6 s** | **~170–284 ms** | **~95%+** |
| `/api/health` TTFB | ~250–435 ms (`iad1`) | **~58–98 ms** (`bom1`) | **~75%+** |

### Region after

| Layer | Before | After |
|---|---|---|
| Edge | bom1 | bom1 |
| Dynamic compute | **iad1** (`bom1::iad1::…`) | **bom1** (`bom1::bom1::…`) |
| Supabase | Mumbai Auth (`vgrvijug…`) | Mumbai Auth (unchanged) |

---

## 8. Browser verification

- Authenticated fetches with credentials after deploy  
- Notifications still HTTP 200 with expected JSON envelope  
- Soft navigation to `/employee/tasks` completed (scripted; link-matching noise on admin “Applications” label caused some 10s timeouts — RSC fetch numbers above are the authoritative route timings)  
- Notification bell still present; initial load deferred (non-blocking)

---

## 9. Production verification

| Check | Result |
|---|---|
| Production URL | `https://citrux-apply-mrgx.vercel.app` |
| New deployment | `dpl_2EoUmxmDzyZzsm5Qv2ekzFcjbGq5` |
| Function region in inspect | **`[bom1]`** for `λ index` |
| Live health header | `x-vercel-id: bom1::bom1::…` |
| Login / dashboard usable | Yes (admin session) |

---

## 10. Remaining latency

| Item | Notes |
|---|---|
| Dual RLS txn on layout+page | Still present; less painful now that compute is bom1 |
| Admin pages with many serial queries | Still architectural cost under heavy load |
| Notifications cold start | Occasional ~0.4–1.2 s first hit after idle; warm ≪200 ms |
| Soft-nav UX | Much improved; not every sidebar label maps 1:1 in automation |

Further dual-txn / query-count work is optional and **out of scope** for this targeted remediation.

---

## 11. Recommendation

1. **Keep** `regions: ["bom1"]` as production default while Supabase remains Mumbai.  
2. Treat notifications as **non-critical shell UI** (already deferred); continue reconciling via realtime + idle/poll.  
3. Only if further gains are needed: collapse layout+page dual `withRlsContext` carefully under security review (separate change).  
4. Do **not** start a broad Phase 11 rewrite based on this pass alone.

---

## FINAL STATUS

### PASS — TARGETED LATENCY REMEDIATION VERIFIED

Evidence: production `bom1::bom1` compute, `/api/notifications` warm TTFB from ~3.1s → ~0.15s, full HTML applications TTFB from ~2–3s → ~0.15–0.20s, RSC route TTFBs typically under 100ms warm.
