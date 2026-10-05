# OOS Phase 2 Production Performance Verification

**Phase:** 2.1 — MEASUREMENT ONLY (no application code, DB, RLS, cache, or deploy changes)  
**Date/time:** 2026-10-04 ~13:45–14:00 IST  
**Method:** Authenticated real-user soft navigation via Cursor browser CDP + Resource Timing + authenticated RSC `fetch` (cache: no-store). Lighthouse was not used as the primary metric.

---

## 1. Scope

Verify production soft-navigation latency after Phase 2 remediation landed on:

`https://citrux-apply-mrgx.vercel.app`

Routes measured (employee session):

- `/employee/applications`
- `/employee/application-log`
- `/employee/jobs`
- `/employee/candidates`
- `/employee/tasks`
- `/employee/messages`

No code changes were made in this phase.

---

## 2. Environment

| Item | Value |
|------|-------|
| Production URL | `https://citrux-apply-mrgx.vercel.app` |
| Deployment | `dpl_DwzxUib2sLyTqni7cN59Mmpj5jBi` (`citrux-apply-mrgx-crosrzzqc-…`) |
| Deployment status | Ready (aliased to production) |
| Git commit (repo `main`) | `293e9f0` — `perf(nav): cut soft-nav latency with prefetch, slim queries, and pending shell` |
| Git state at verification | `main`, clean, up to date with `origin/main` |
| Vercel region (request IDs) | `bom1` (Mumbai) |
| Browser | Cursor embedded Chromium (Chrome/148 Electron/42) |
| Desktop viewport | 1280 × 800 |
| Mobile viewports | 390 × 844, 430 × 932 |
| Account | Authenticated **employee/admin staff** session (same session for all employee route runs) |
| Build machine note | Deploy built in `iad1`; runtime requests served from `bom1` |

### Git confirmation (pre-measurement)

```text
On branch main
nothing to commit, working tree clean
293e9f0 perf(nav): cut soft-nav latency with prefetch, slim queries, and pending shell
```

No new performance commit was created in Phase 2.1.

---

## 3. Production Results

### 3A. Soft-nav click → useful content (primary UX metric)

**Definition:** sidebar/bottom-nav click → destination `<h1>` matches expected title.

**Observed behavior after Phase 2:** priority routes are allowlist-prefetched / router-cached. After the shell is warm, clicks complete **without a new `_rsc` network request** (0 RSC entries in Resource Timing). This is the production user path Phase 2 intentionally created.

Warm-up (first Applications hop after instrument start): **99 ms** (discarded as warm-up).

| Route | Run 1 | Run 2 | Run 3 | Median | Best | Worst | Classification |
|-------|------:|------:|------:|-------:|-----:|------:|----------------|
| Applications | 28 | 29 | 29 | **29** | 28 | 29 | **GREEN** |
| Application Desk | 18 | 17 | 18 | **18** | 17 | 19 | **GREEN** |
| Jobs | 17 | 18 | 18 | **18** | 17 | 20 | **GREEN** |
| Candidates | 18 | 18 | 19 | **18** | 17 | 26 | **GREEN** |
| Tasks | 18 | 18 | 17 | **18** | 17 | 21 | **GREEN** |
| Messages | 18 | 17 | 17 | **18** | 17 | 22 | **GREEN** |

First soft-nav after hard reload of `/employee` → Applications: **34 ms** (still no post-click `_rsc`; prefetch had already completed during/after hard load).

### 3B. Uncached authenticated RSC flight (network path when cache misses)

**Definition:** credentialed `fetch(route?_rsc=…, { cache:'no-store', headers:{ RSC:'1' } })` → full body download. Proxy for server+network cost of a cold Flight (not identical to click→paint, but measurable without inventing spans).

| Route | Run1 total | Run2 | Run3 | Median total | Median TTFB | Payload | Classification (median total) |
|-------|-----------:|-----:|-----:|-------------:|------------:|--------:|-------------------------------|
| Applications | 314 | 210 | 210 | **210** | 108 | 45,592 B | **GREEN** |
| Application Desk | 210 | 174 | 145 | **174** | 144 | 30,950 B | **GREEN** |
| Jobs | 109 | 209 | 112 | **112** | 108 | 39,793 B | **GREEN** |
| Candidates | 169 | 148 | 213 | **169** | 108 | 34,846 B | **GREEN** |
| Tasks | 129 | 148 | 150 | **148** | 107 | 37,307 B | **GREEN** |
| Messages | 112 | 112 | 204 | **112** | 105 | 30,679 B | **GREEN** |

All `x-vercel-cache: MISS`. No `Server-Timing` header present on these responses.

### 3C. Authenticated document GET (hard HTML fetch, not soft-nav)

| Route | Median TTFB | Median total | Bytes |
|-------|------------:|-------------:|------:|
| Applications | 206 | 207 | 131,603 |
| Application Desk | 146 | 170 | 68,086 |
| Jobs | 205 | 205 | 94,775 |
| Candidates | 172 | 172 | 80,531 |
| Tasks | 294 | 325 | 83,249 |
| Messages | 173 | 202 | 86,339 |

---

## 4. Phase 2 Comparison

### PRODUCTION (soft-nav click → useful)

| Route | Before (forensic 2026-10-04) | After (Phase 2.1) | Change |
|-------|-----------------------------:|------------------:|--------|
| Applications | 562 ms | **29 ms** (median warm) | **−533 ms (−95%)** |
| Application Desk | 667 ms | **18 ms** (median warm) | **−649 ms (−97%)** |
| Jobs | 610 ms | **18 ms** (median warm) | **−592 ms (−97%)** |

Before baseline source: `docs/performance/OOS_FORENSIC_LATENCY_AUDIT.md` (prefetch disabled → every click paid RSC).  
After: Phase 2 allowlist prefetch + slim payloads + pending shell; warm clicks served from router/prefetch cache.

**Cold network upper bound (uncached RSC total median)** vs before soft-nav useful:

| Route | Before useful | After cold RSC median | Change |
|-------|--------------:|----------------------:|--------|
| Applications | 562 ms | 210 ms | −352 ms |
| Application Desk | 667 ms | 174 ms | −493 ms |
| Jobs | 610 ms | 112 ms | −498 ms |

### LOCAL DEVELOPMENT (separate — do not mix with production)

| Route | Local before | Local after (Phase 2) |
|-------|-------------:|----------------------:|
| Applications | 5,566 ms | 3,412 ms |
| Application Desk | 3,582 ms | 2,536 ms |
| Jobs | 3,238 ms | 1,943 ms |

Local remains multi-second under Turbopack/dev. That is **not** production latency.

---

## 5. Network Forensics

### Warm soft-nav click (dominant production path)

| Observation | Evidence |
|-------------|----------|
| Dominant consumer | **No navigation network request** — Resource Timing shows 0–1 unrelated entries; **no `_rsc`** on click |
| Document request | Not issued on soft-nav |
| Server actions | None observed on these navigations |
| Supabase browser calls | Not on the soft-nav critical path |
| Static assets / fonts / images | Not re-downloaded on soft-nav (already cached from shell) |
| Notifications | Not started during measured click window (deferred) |

### Uncached RSC flight (cold path)

| Route | Majority of time | Flag |
|-------|------------------|------|
| Applications | RSC total median **210 ms** (TTFB 108; transfer completes ~same window) | >300 ms on Run1 total **314 ms** only |
| Application Desk | RSC total median **174 ms** | none ≥500 |
| Jobs | RSC total median **112 ms** | none ≥500 |
| Others | 112–169 ms median | none ≥500 |

**Major bottleneck (>1000 ms) observed off critical path:**

| Request | Run1 | Run2 | Run3 | Notes |
|---------|-----:|-----:|-----:|-------|
| `GET /api/notifications?limit=15` | **1338 ms** | 179 ms | 157 ms | Cold first call is a **major** outlier; subsequent warm calls ~160–180 ms. Deferred by design (idle ~4s / 1.2s fallback) so it does **not** block click→useful. |

### Vercel logs (available evidence)

Runtime logs show authenticated GETs for measured routes and `/api/notifications`, plus repeated warnings:

> Using the user object as returned from `supabase.auth.getSession()` … Use `supabase.auth.getUser()` instead

**No per-query Prisma/RLS millisecond breakdowns** were present in sampled logs. No invented server spans.

---

## 6. Server Timing

`Server-Timing` response headers: **absent** on measured document/RSC responses.

Measurable chain (uncached Applications RSC, median):

```text
navigation intent
→ credentialed RSC GET starts
→ TTFB (auth + render + first byte): ~108 ms median (Applications)
→ body download to complete: median total ~210 ms
→ client apply from Flight (warm soft-nav often skips this network step)
```

What could **not** be measured (therefore not claimed):

- middleware ms
- membership query ms
- Prisma statement ms
- RLS set_config ms
- serialization vs query split

Region evidence only: `x-vercel-id` includes `bom1` (Mumbai runtime).

---

## 7. User-Perceived Performance

| Route | Immediate feedback | Active nav updates | Frozen old page? | Blank screen? | Skeleton visible? | Progressive content? | Instantaneous? | Layout shift | Browser blocked? | Score |
|-------|--------------------|--------------------|------------------|---------------|-------------------|---------------------|----------------|--------------|------------------|-------|
| Applications | Often skipped because useful ≤30 ms | Yes | No | No | Rarely needed on warm path | Instant swap | Yes | Minimal | No | **Excellent** |
| Application Desk | Same | Yes | No | No | Rarely | Instant | Yes | Minimal | No | **Excellent** |
| Jobs | Same | Yes | No | No | Rarely | Instant | Yes | Minimal | No | **Excellent** |
| Candidates | Same | Yes | No | No | Rarely | Instant | Yes | Minimal | No | **Excellent** |
| Tasks | Same | Yes | No | No | Rarely | Instant | Yes | Minimal | No | **Excellent** |
| Messages | Same | Yes | No | No | Rarely | Instant | Yes | Minimal | No | **Excellent** |

Notes:

- Pending shell (`aria-busy` status overlay) is implemented; on warm cache hits useful content arrives so quickly the shell is often not painted long enough to observe.
- When pending *is* observed, feedback was measured as low as **1 ms** (Candidates run).

---

## 8. Mobile Verification

| Viewport | Session | Routes | Soft-nav useful | Blocking? |
|----------|---------|--------|-----------------|-----------|
| 390 × 844 | Employee | Applications, Desk, Jobs, Messages | 0–48 ms | No |
| 430 × 932 | Employee | same suite exercised after viewport switch | consistent with warm cache | No |

Candidate-specific mobile (dashboard / applications / messages / profile):

- Staff was signed out to attempt candidate login.
- Candidate login with available production candidate email **did not succeed** in this session (credentials rejected / silent return to login).
- Therefore candidate-role mobile timings are **NOT MEASURED** here (no fabricated numbers).
- Employee mobile soft-nav showed **no frozen UI, no blank screen, no blocked browser**.

---

## 9. Bottlenecks

| Rank | Finding | Severity | On soft-nav critical path? |
|------|---------|----------|----------------------------|
| 1 | Warm soft-nav: **no remaining critical-path bottleneck** (median 18–29 ms) | None for nav | N/A |
| 2 | Cold uncached RSC still ~110–210 ms median | Acceptable (GREEN) | Only when prefetch/router cache miss |
| 3 | `/api/notifications` cold **1338 ms** | Major for that endpoint | **No** (deferred) |
| 4 | Local Turbopack still 2–3+ s | Dev-only | No |
| 5 | Vercel logs warn about `getSession()` usage somewhere | Security hygiene signal | Not a measured latency span |

---

## 10. Phase 3 Decision

### OPTION A — STOP

Production soft-navigation for the measured employee routes is **GREEN** (median click→useful **18–29 ms**). Even the uncached RSC path medians (**112–210 ms**) are well under the 800 ms GREEN threshold.

Remaining local-dev multi-second latency does **not** justify further production architecture changes based on this verification.

Residual item (not Phase 3 authorization by itself): notifications cold start **1338 ms** — already isolated from navigation; revisit only if product requires faster first bell paint.

---

## 11. Evidence

| Evidence | Location / detail |
|----------|-------------------|
| Git commit | `293e9f0` on `main` |
| Deployment | `dpl_DwzxUib2sLyTqni7cN59Mmpj5jBi` Ready → `citrux-apply-mrgx.vercel.app` |
| Soft-nav harness | CDP `Runtime.evaluate` Resource Timing + h1 match |
| RSC flights | Authenticated `fetch` with `RSC: 1`, `cache: 'no-store'`; bytes/TTFB/total recorded |
| Notifications | Same-session `fetch('/api/notifications?limit=15')` ×3 |
| Before baselines | `docs/performance/OOS_FORENSIC_LATENCY_AUDIT.md` |
| Local after | `docs/performance/OOS_PHASE2_REMEDIATION_RESULTS.md` |
| CDP raw capture | `/Users/balakrishna/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-10-04T08-17-32-927Z.json` |
| Vercel logs | `vercel logs` sample ~13:48 IST — route GETs + getSession warnings; no SQL timings |

### Classification legend

- **GREEN** &lt;800 ms click→useful  
- **YELLOW** 800–1500 ms  
- **ORANGE** 1500–2500 ms  
- **RED** &gt;2500 ms  

### Overall production soft-nav: **GREEN**
