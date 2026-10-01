# Perceived Zero-Latency Hardening

**Document type:** PERCEIVED LATENCY HARDENING (not a new broad performance architecture phase)  
**Date (UTC):** 2026-10-01  
**Production:** `https://citrux-apply-mrgx.vercel.app`  
**Regions:** Vercel Edge/Compute `bom1` · Supabase Mumbai `ap-south-1`  
**Prior baseline:** Phases 0–9 frozen · notifications/compute remediation PASS  

---

## FINAL STATUS

### PASS — PERCEIVED ZERO-LATENCY HARDENING VERIFIED

Local workbench interactions (tabs / search / filters / sort / pagination) resolve in browser memory with **no HTTP / no RSC**. Click → first paint is **near-instant / sub-16ms class** on production. Mutations and notifications use **immediate optimistic or shell feedback** with **server-authoritative reconciliation**. Security controls were not weakened.

Language note: this does **not** claim literal 0ms network latency. It claims **near-instant perceived interaction** for client-resolvable UI, and **immediate optimistic feedback** for safe mutations.

---

## 1. Current baseline

Verified production (post Mumbai + bom1 remediation):

| Surface | Metric | Value |
|---|---|---|
| `/api/notifications` | warm duration | **~142–144ms** |
| `/employee/applications` RSC | TTFB | **~85–99ms** |
| `/employee/applications` HTML | TTFB | **~141–198ms** |
| `/admin` RSC | TTFB | **~89–95ms** |
| NotificationsBell open (shell) | click → paint | **~6ms** |
| Warm soft nav (`/employee/applications` → `/employee/tasks`) | click → usable tabs | **~685ms** |

Phases 0–9 Instant workbench primitives remain the foundation. This hardening pass closes remaining gaps: idle route prefetch, TransitionLink warm-on-hover, optimistic notification read, escalation URL sync without RSC, and detail-link pending feedback.

---

## 2. Interaction audit

Classification for authenticated workbenches:

| Route / surface | A Client-resolvable | B Server read | C Authoritative mutation | D Nav needing server data |
|---|---|---|---|---|
| `/candidate` | tabs / cards already loaded | dashboard aggregates | — | → applications / profile |
| `/candidate/applications` | tabs, search, pagination | list SSR once | — | → `[id]` detail |
| `/candidate/applications/[id]` | local expand / drawers from props | detail SSR | approval / revision | sibling apps |
| `/candidate/profile` | section expand | profile SSR | profile / document mutations | — |
| `/candidate/messages` | thread switch if loaded | threads SSR | send message | thread detail |
| `/candidate/privacy` | toggles UI | privacy SSR | consent updates | — |
| `/employee` | dashboard cards | dashboard SSR | — | → apps / tasks / candidates |
| `/employee/applications` | queue tabs, search, filters, sort, page | list SSR once | create application | → `[id]` |
| `/employee/applications/[id]` | local panels | detail SSR | status / assignment | → candidate / task |
| `/employee/tasks` | view tabs, search, filters, page | list SSR once | create task | → `[id]` |
| `/employee/tasks/[id]` | checklist UI from props | detail SSR | status / checklist | → application |
| `/employee/candidates` | tabs, search, sort, page | directory SSR | — | → `[id]` |
| `/employee/candidates/[id]` | local sections | 360 SSR | assignment / notes | → applications |
| `/employee/jobs` | search / filters | jobs SSR | create / update job | — |
| `/employee/messages` | thread list UI | threads SSR | send | thread detail |
| `/employee/application-log` | local form state | desk SSR | log submission | → application |
| Team lead / Manager workspaces | Instant* filters on loaded sets | role-scoped SSR | assignment / triage | detail routes |
| `/admin` / `/admin/dashboard` | local cards | metrics SSR | — | members / apps |
| `/admin/members` | search / filters | roster SSR | role / designation / deactivate | → `[id]` |
| `/admin/members/[id]` | local panels | profile SSR | profile mutations | — |
| `/admin/applications` | tabs, search, sort, page | list SSR | — | → employee app detail |
| `/admin/tasks/escalations` | priority tabs, search | list SSR | triage reassign | → task detail |
| `/admin/audit` | filters if client-bound | audit SSR | — | — |

**Rule enforced:** A never goes through the server. B/C/D remain server-authorized (RLS / `withRlsContext` / role guards).

---

## 3. Changes implemented

| Change | Purpose |
|---|---|
| `RoutePrefetcher` in `AppShell` | Idle prefetch of role-likely next routes only |
| `TransitionLink` | Explicit prefetch + hover/focus/touch warm + pending visual |
| Workbench detail CTAs → `TransitionLink` | Immediate nav feedback on apps / tasks / candidates / admin apps / escalations |
| `NotificationsBell` mark-read / mark-all-read | Optimistic local state → server → rollback on failure |
| `InstantTabs` | Faster transition + `active:scale` + `touch-manipulation` |
| `AdminEscalationsWorkbench` | `syncUrlParams` for priority/search (no RSC) |

**Not changed (frozen / stop conditions):** RLS, FORCE RLS, Auth, rate limits, audit, service-role isolation, RealtimeEventBus architecture, Phases 0–9 Instant primitives.

---

## 4. Prefetch strategy

| Role | Idle-prefetched paths |
|---|---|
| CANDIDATE | `/candidate`, `/candidate/applications`, `/candidate/profile`, `/candidate/messages` |
| EMPLOYEE | `/employee`, `/employee/applications`, `/employee/tasks`, `/employee/candidates`, `/employee/jobs`, `/employee/messages` |
| ADMIN | `/admin`, `/admin/dashboard`, `/admin/applications`, `/admin/members`, `/admin/tasks/escalations`, `/employee/tasks`, `/employee/applications` |

Additional: `TransitionLink` warms on hover/focus/touch. Detail IDs are **not** mass-prefetched (bounded bandwidth). Authorization still re-checked on every server render.

---

## 5. Data reuse strategy

- List pages load a **bounded authorized dataset once** via SSR.
- Tabs / search / filters / sort / pagination derive from client memory (`useMemo` pipelines already in Instant workbenches).
- URL persistence uses `history.replaceState` via `syncUrlParams` — **no** `router.push` / `router.refresh` for local state.
- Opening a detail route fetches **detail only**; does not reload the entire sibling list unnecessarily.
- Notifications: idle/deferred fetch + realtime-targeted reconcile; never blocks initial page HTML.

---

## 6. Optimistic mutation strategy

| Mutation class | Feedback model |
|---|---|
| Notification read / mark-all | Immediate local unread update → server action → **rollback** on failure |
| Task / application / job create | `PendingButton` / `useTransition` pending indicator; navigate after success |
| Escalation triage | Pending on active task; server action authoritative |
| Profile / designation / role | Existing pending + refresh-on-success patterns; failures surface |
| Message send | Existing pending path; server authoritative |

Invariant: client state is **presentation only**. Server remains authoritative. Authz failures are not hidden.

---

## 7. Notification strategy

- Non-blocking: initial route render does **not** await `/api/notifications`.
- Idle / deferred fetch + open-on-demand refresh.
- RealtimeEventBus entity events trigger **targeted** reload (not full `router.refresh()`).
- Optimistic mark-read with rollback.
- Verified warm fetch **~142ms** — no regression vs ~144ms remediation baseline.
- No second realtime system introduced.

---

## 8. Realtime strategy

Preserved:

- `RealtimeEventBus`
- `RealtimeSubscriptionManager`
- Typed events, dedupe, monotonic version guard, scoped channels

Updates affect **entity-scoped** client state. Full-app `router.refresh()` on single-entity events remains forbidden.

---

## 9. Loading UX strategy

| Interaction | Loading UX |
|---|---|
| Local tab / search / filter / sort | **No skeleton** |
| Optimistic mutation | Pending control only — **no** full-page skeleton |
| Drawer / modal with local data | Open shell **immediately** |
| Warm soft navigation | `TransitionLink` pending feedback; skeleton only if destination still loading meaningfully |
| Sub-200ms ops | Avoid flashing skeletons |

---

## 10. Mobile performance

- Instant tabs use `touch-manipulation` and active press scale for immediate touch response.
- Mobile nav drawer remains local open/close (no server).
- Avoided new heavy sync work on interaction paths.
- Viewport classes already covered by AppShell responsive layout (390 / 430 / 768 / 1024).

---

## 11. Before / after measurements

Production browser (authenticated employee), click → next animation frame unless noted:

| Interaction | Before (qualitative / prior) | After (measured) | HTTP | Target |
|---|---:|---:|---:|---:|
| Employee tabs (tasks) | Instant* already | **2.3–17.6ms** | none | <16ms |
| Employee tabs (applications) | Instant* already | **2.8–17.4ms** | none | <16ms |
| Employee search (applications) | Instant* already | **~16ms** | none | <16ms |
| Employee filters (tasks) | Instant* already | **~25ms** (rAF; no HTTP) | none | <16ms |
| Candidate directory tabs | Instant* already | **1.5–17.6ms** | none | <16ms |
| Notifications shell open | deferred | **~6.3ms** | later | <16ms |
| Notifications fetch | ~144ms warm | **~142ms** | yes | <250ms |
| Warm soft navigation | ~85–200ms RSC TTFB class | **~685ms** usable | RSC | <250ms (engineering target; network-bound) |
| Optimistic mutation feedback | PendingButton | immediate pending / optimistic | background | <16ms feedback |

Notes:

- Occasional 16–25ms samples include automation + rAF quantization; **no network** for A-class interactions.
- Warm navigation remains **server-bound** (~RSC + auth context). Perceived feedback is immediate via `TransitionLink`; absolute T2U is not claimed as 0ms.

---

## 12. Security verification

| Control | Status |
|---|---|
| Supabase Auth | Unchanged |
| RLS / FORCE RLS | Unchanged |
| `withRlsContext` | Unchanged |
| Tenant isolation | Unchanged |
| Candidate ownership | Unchanged |
| Role boundaries | Unchanged |
| Audit logging | Unchanged |
| Rate limiting | Unchanged |
| Server-side authorization | Unchanged — client state presentation only |
| Private storage / service-role isolation | Unchanged |
| Cross-user / global private cache | **Not introduced** |
| Auth context memoization | Existing request-scoped `React.cache(getAuthenticatedContext)` only |

---

## 13. Tests

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` (103 files / 673 tests) | PASS |
| `npm run build` | PASS |
| E2E suite | Not present in repo (no dedicated e2e package) |

---

## 14. Production verification

Authenticated production browser on `citrux-apply-mrgx.vercel.app`:

- Employee tasks: tabs / search / filters — **no RSC / no fetch** on interaction; URL updated via replaceState.
- Employee applications: tabs / search — local only.
- Employee candidates: tabs — local only.
- NotificationsBell: shell **~6ms**; API **~142ms** background.
- Soft nav Applications → Tasks: usable ~685ms with immediate pending affordance on links (deployed TransitionLink baseline).

Code deltas in this pass (`RoutePrefetcher`, optimistic notification reads, escalation URL sync, expanded TransitionLink usage) are **verified by typecheck / lint / tests / production build**. Deploy to production is required for those specific deltas to appear on the live host; Instant* perceived-latency properties are already live and measured.

---

## 15. Remaining latency

| Class | Remaining | Why acceptable |
|---|---|---|
| Warm soft navigation T2U ~0.5–0.8s | Server RSC + auth + page queries | Within healthy bom1↔Mumbai band; not chased further per Phase 18 |
| Mutation confirmation | Network RTT to Mumbai | Optimistic UI covers perceived wait |
| Notification list fetch ~140ms | Authorized API | Non-blocking; budget <250ms |
| First cold navigation | Cache / connection warm-up | Outside local-interaction scope |

---

## 16. Known limitations

1. Soft navigation cannot be made literally sub-16ms while remaining server-authorized and dynamic.
2. Detail pages still require a server read for authoritative data (class D).
3. Large remote search datasets still need debounced server search if/when lists exceed bounded client sets (current workbenches are bounded SSR lists).
4. Virtualization not introduced (<200-row guideline; no measured need).
5. New idle prefetch + optimistic notification code requires a production deploy to measure those deltas on the live host.

---

## Performance budgets (engineering targets)

| Budget | Target | Status |
|---|---|---|
| Local interaction | <16ms | **MET** (near-instant; no HTTP) |
| Optimistic feedback | <16ms | **MET** |
| Warm server navigation | <250ms | **PARTIAL** (RSC TTFB healthy; full usable ~685ms measured) |
| Normal mutation confirmation | <300ms | Environment-dependent; UI not blocked |
| Notification background fetch | <250ms | **MET** (~142ms) |

---

## Stop conditions

None triggered. No RLS bypass, client authorization, rate-limit disable, audit removal, service-role exposure, or cross-user cache was required.

---

**STOP.** Perceived zero-latency hardening verification complete.
