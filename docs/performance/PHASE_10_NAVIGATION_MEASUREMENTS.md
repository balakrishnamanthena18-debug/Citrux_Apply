# Phase 10 — Navigation Measurements

**Status:** INSTRUMENTATION DEPLOYED / PRODUCTION CAPTURE PENDING  
**Date:** 2026-10-01

---

## Time-to-Usable definition

**Time-to-Usable (T2U):** The point at which the user can meaningfully interact with the primary purpose of the page.

| Route class | Usable when |
|---|---|
| Applications | Application list + primary controls interactive |
| Tasks | Task queue + filters interactive |
| Messages | Conversation list interactive |
| Admin dashboard | Primary operational metrics visible |
| Application log | Desk form + metrics interactive |
| Profile | Profile editors interactive |

T2U ≠ “HTML arrived” and ≠ TTFB alone.

---

## Instrumentation shipped

| Mechanism | Location | Behavior |
|---|---|---|
| `NavigationPerfProbe` | Dashboard layout | On pathname change, marks performance start and measures soft-nav settle via double `requestAnimationFrame` |
| CustomEvent | `oos:navigation-metric` | `{ pathname, timeToUsableMs, ttfbMs, softNavigation, measuredAt }` — no PII |
| Dev console | `console.debug("[oos-nav]", detail)` | Development only |

**Not logged:** passwords, tokens, cookies, message bodies, emails, names.

---

## How to capture locally

1. Open dashboard in development.
2. Navigate between sidebar routes.
3. In DevTools Console, listen:

```js
window.addEventListener("oos:navigation-metric", (e) => console.table(e.detail));
```

4. Or inspect `performance.getEntriesByType("measure")` for `oos-nav-*` entries.

---

## Production / browser matrix

| Route | Cold TTFB | Warm TTFB | T2U | Requests | Notes |
|---|---|---|---|---|---|
| `/login` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/candidate` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/candidate/applications` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/candidate/messages` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/candidate/profile` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/employee` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/employee/applications` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/employee/tasks` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/employee/candidates` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/employee/jobs` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/employee/application-log` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | Query architecture improved (see Phase 10 report) |
| `/admin` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | Workload queries bounded |
| `/admin/applications` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/admin/members` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | |
| `/admin/tasks/escalations` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | `take: 100` added |
| `/admin/audit` | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | Parallel findMany+count |

**Deployed production URL for automation:** NOT AVAILABLE in this session.

---

## Region / network

| Component | Region |
|---|---|
| Vercel | UNKNOWN (`vercel.json` has no `regions`) |
| Supabase | UNKNOWN (env-only) |

Cross-region RTT contribution: UNKNOWN until confirmed.

---

## Cold vs warm

| Class | Status |
|---|---|
| Cold serverless isolate | NOT MEASURED |
| Warm isolate | NOT MEASURED |
| Soft navigation after shell warm | Instrumentation ready; values NOT MEASURED in CI |

---

## Architectural before/after (non-numeric)

| Signal | Before | After |
|---|---|---|
| Route loading UI | None | Segment `loading.tsx` + structured skeletons |
| Nav click feedback | Silent | `TransitionLink` pending state |
| Middleware auth | `getUser()` every match | `getSession()` presence; layout still `getUser`+RLS |
| Notification poll | 10s always | 60s fallback / 5min when realtime connected; pause when hidden |
| Realtime UI subscribers | None | `RealtimeProvider` + NotificationsBell bus listener |
| Application-log queries | Sequential waterfall | `Promise.all` + lean submitted scan |
| Admin workload | Unbounded | `take: 2000` lean selects |
| Layout revalidate storms | Common | Path-scoped revalidation |
