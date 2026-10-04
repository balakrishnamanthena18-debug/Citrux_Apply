# OOS Performance Remediation Phase 2 — Results

**Date:** 2026-10-04  
**Source of truth (before):** `docs/performance/OOS_FORENSIC_LATENCY_AUDIT.md`  
**Production:** https://citrux-apply-mrgx.vercel.app/  
**Local after:** `http://localhost:3000` (Turbopack/dev, Mumbai Auth)

## What shipped

| ID | Fix | Status |
|----|-----|--------|
| P0-1 | Controlled TransitionLink prefetch allowlist | Done |
| P0-2 | Single-request membership reuse via `withAuthenticatedData` + auth seed store | Done |
| P1-3 | Slim Application Operations Console projection | Done |
| P1-4 | Slim Application Desk + server-side selector search | Done |
| P1-5 | Soft-nav pending shell (sidebar/header preserved) | Done |
| P2-6 | Notifications deferred further; RoutePrefetcher removed | Done |
| P2-7 | Desk search/filter moved server-side (bounded) | Done |

Security posture unchanged: Supabase `getUser()`, FORCE RLS `set_config`, org membership gate, no service-role shortcut.

## Soft-nav before / after (LOCAL DEV)

Before values from forensic audit. After values measured in-session post-fix (click → `h1` match).

| Route | Before useful | After useful | Improvement | Feedback after |
|-------|---------------|--------------|-------------|----------------|
| `/employee/applications` | 5,566 ms | 3,412 ms | **−39%** | 18 ms |
| `/employee/application-log` | 3,582 ms | 2,536 ms | **−29%** | ≤28 ms* |
| `/employee/jobs` | 3,238 ms | 1,943 ms | **−40%** | 28 ms |
| `/employee/candidates` | ~304 ms (prod) | see note | — | — |
| `/employee/tasks` | not in local audit table | 6,289 ms | (dev variance / heavy page; out of P1 slim scope) | 18 ms |
| `/employee/messages` | not in local audit table | 4,311 ms | (messages layout still dual-loads; out of P1 slim scope) | 18 ms |

\*First desk hop after instrument start did not capture pending paint; subsequent hops saw pending shell ≤28 ms.

### Warm repeat (LOCAL after)

| Route | Useful | Feedback | RSC duration | RSC transfer |
|-------|--------|----------|--------------|--------------|
| Applications | 3,064 ms | 25 ms | 3,011 ms | ~9.3 KB |
| Application Desk | 2,975 ms | ≤30 ms* | 2,947 ms | ~4.6 KB |
| Candidates (`/admin/candidates` for admin session) | 4,847 ms | 26 ms | 4,798 ms | ~5.9 KB |

Local absolute times remain multi-second under Turbopack/dev; the architectural wins are feedback &lt;100 ms and reduced server work / payload.

## Architecture deltas (request shape)

| Metric | Before | After |
|--------|--------|-------|
| Soft-nav visual feedback | link dim only; stale page frozen | pending shell + active nav ≤30 ms |
| Prefetch | `prefetch={false}` everywhere + idle RoutePrefetcher storm | allowlisted Link prefetch only; RoutePrefetcher removed |
| Soft-nav RLS txns (page-only Flight) | getUser + membership txn + data txn (**2**) | getUser + **1** txn (membership+data when unseeded) |
| Full document RLS txns | layout membership + page data (**2**) | same count; membership query not re-run inside data txn |
| Console apps query | `take: 250`, `job: true` (+ description), submissions + stateHistory | `take: 150`, slim job fields, latest submission only, no stateHistory; server `groupBy` counts |
| Desk candidates/jobs | `take: 500` each, jobs include `jobDescription` | `take: 40` each, no list `jobDescription`; search via server actions |
| Desk submitted hydrate | `take: 2000` lean rows for metrics | `COUNT` + `COUNT(DISTINCT candidateId)` |
| Notifications vs nav | idle timeout 1.5s / 250ms | idle timeout 4s / 1.2s; still authorized |

## Gates

| Gate | Result |
|------|--------|
| `tsc --noEmit` | pass |
| `eslint .` | pass (0 errors) |
| `vitest run` | **112 files / 727 tests passed** |
| `next build` | pass |
| Security regression suite (RLS / RBAC / desk / admin / candidate isolation tests in suite) | included in 727 pass |

## Production note

Phase 2 code is **not claimed live on production** until deploy. Forensic PROD before baselines remain:

| Route | PROD before useful |
|-------|--------------------|
| Applications | 562 ms |
| Application Desk | 667 ms |
| Jobs | 610 ms |
| Candidates / Tasks | ~304–305 ms |
| Messages | 407 ms |

Re-measure PROD soft-nav after deploy with the same click→`h1` harness before declaring production target success.
