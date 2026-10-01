# PHASE 7 — Production Navigation Latency Forensic (Post-Mumbai Cutover Claim)

**Document type:** FORENSICS ONLY — no application code, schema, RLS, Auth, Vercel, env, or caching changes were made.  
**Date:** 2026-10-01  
**Production:** `https://citrux-apply.vercel.app`  
**Trigger:** Cross-page/sidebar navigation still feels ~3 seconds after claimed Mumbai cutover; skeletons improved perception but not underlying wait.

---

## FINAL VERDICT

### 🟡 LATENCY PARTIALLY IDENTIFIED — MORE INSTRUMENTATION REQUIRED

**What is identified with measured evidence:** the multi-second floor is **server-side**, driven by **chatty dual interactive Prisma/RLS transactions** whose statements **serialize on one PostgreSQL connection** (including inside `Promise.all`), paid at **full network RTT per statement**, against a **Vercel serverless compute region that is not Mumbai**.

**What is not closed:** authenticated production navigation waterfalls (login blocked), and a definitive runtime fingerprint of which Supabase project Production `DATABASE_URL` / Auth URL currently point to.

**Do not start Phase 8. Do not implement fixes from this document.**

---

## 1. Production environment

| Item | Finding | Evidence |
|---|---|---|
| URL | `https://citrux-apply.vercel.app` | Live HTTPS probes |
| App identity | OOS (`/api/health` → `service:"oos"`, `status:"pass"`) | `GET /api/health` |
| Claimed state | “Deployed against Mumbai Supabase” | User Phase 7 brief |
| Agent Phase 6 cutover | **Did not change Production env / did not deploy** | `docs/migration/PHASE_6_PRODUCTION_CUTOVER_REPORT.md` |
| Runtime Supabase project ref in client bundles | **Not present** on `/login` JS (server-action login; `NEXT_PUBLIC_SUPABASE_*` not embedded in scanned chunks) | Browser deep scan of all `/_next/static/**/*.js` linked from `/login` |
| Production login | **Fails** for `admin@citrux.com` / `Password123!` with server-action error | Browser: `success:false`, `"An unexpected error occurred during sign in. Please try again."` |
| Same credentials vs Auth APIs | **Succeed** on both Mumbai and Seoul Auth (`grant_type=password` → 200 + token) | Direct Auth API probes from forensic host |

**Implication:** This session **cannot prove** Production is on Mumbai. Phase 6 record says cutover never ran. Live Auth accepts the password on both projects; Production app login still fails upstream of a successful dashboard session.

---

## 2. Vercel region

| Layer | Region | Evidence |
|---|---|---|
| Edge / CDN receive | **`bom1` (Mumbai)** | `x-vercel-id: bom1::…` on `/login`, middleware redirects |
| Serverless / Node execution (dynamic) | **`iad1` (Washington, D.C.)** | `x-vercel-id: bom1::iad1::…` on `GET /api/health` **and** on `POST /login` server action (`text/x-component`) |
| `vercel.json` region pin | **None** | Repo `vercel.json` has framework + cron only — **no `regions`** |

**Conclusion:** Production is **not** “running in bom1” for RSC/server-action/database work. Edge is bom1; **compute that talks to Postgres/Auth for navigation is iad1.** Prior Phase audits that assumed “Vercel bom1 → DB” for statement RTT understated the true function→DB path.

Representative IDs captured:

- Health: `bom1::iad1::58bjg-…` / earlier `bom1::iad1::p685x-…`
- Sign-in server action: `bom1::iad1::f5rwr-1790848077678-6d80241273f7`

---

## 3. Supabase region

| Project | Region / host | Role in this phase |
|---|---|---|
| Seoul `auzikqapcgtgqwotnldq` | `ap-northeast-2` / `aws-0-ap-northeast-2.pooler.supabase.com` | Local `.env`; Phase 6 source; Auth accepts test password |
| Mumbai `vgrvijugljzlpohsbmjg` | `ap-south-1` / `aws-0-ap-south-1.pooler.supabase.com` | `.migration-mumbai.env`; migration target; Auth accepts test password |
| **Production binding** | **UNVERIFIED at runtime** | No client URL leak; Vercel env inaccessible (Phase 6 ACL 403); login cannot open data plane |

TCP connect samples from forensic host (India):

| Target | TCP connect (ms) |
|---|---|
| Mumbai `:5432` / `:6543` | ~30–37 (warm) |
| Seoul `:5432` / `:6543` | ~118–147 |

---

## 4. Browser test environment

| Item | Value |
|---|---|
| Tooling | Cursor IDE browser (Chromium) + CDP `Runtime.evaluate` / Performance resource timings |
| Target | Production only (no localhost) |
| Session | Unauthenticated except failed login attempts |
| Auth matrix | **BLOCKED** — cannot complete Sign in |
| Prefetch / soft-nav architecture | Inspected in source (`TransitionLink` → `router.push`, not full reload) |

---

## 5. Route matrix (requested)

Authenticated soft navigations **not executed** (no session). Matrix status:

| # | Navigation | Authenticated runs | Status |
|---|---|---|---|
| 1 | `/candidate` → `/candidate/applications` | 0 | BLOCKED |
| 2 | `/candidate/applications` → `/candidate/profile` | 0 | BLOCKED |
| 3 | `/employee` → `/employee/applications` | 0 | BLOCKED |
| 4 | `/employee/applications` → `/employee/tasks` | 0 | BLOCKED |
| 5 | `/employee/tasks` → `/employee/candidates` | 0 | BLOCKED |
| 6 | `/admin` → `/admin/applications` | 0 | BLOCKED |
| 7 | `/admin/applications` → `/admin/members` | 0 | BLOCKED |
| 8 | `/admin/members` → `/admin/tasks/escalations` | 0 | BLOCKED |

Unauthenticated substitutes measured:

| Probe | Result |
|---|---|
| `GET /employee*` / `/admin*` | `307` → `/login?redirectTo=…`, `x-vercel-id: bom1::…` |
| Unauth RSC `fetch` with `RSC:1` | `200`, ~6.3KB, `x-vercel-cache: HIT/PRERENDER`, TTFB ~200–770ms — **login shell / cached stub, not authenticated page data** |
| `/login` HTML | Warm TTFB ~136–141ms, `x-vercel-cache: HIT` |

---

## 6–7. Median / fastest / slowest navigation latency

| Metric | Value |
|---|---|
| Authenticated sidebar median | **NOT MEASURED** |
| Fastest / slowest authenticated nav | **NOT MEASURED** |
| User-reported class | **~3s** (2–3s / >3s boundary) |
| Prior forensic (Seoul RTT, India probe) dual-txn apps floor | **~2.7–2.8s DB alone** (`ROUTE_NAVIGATION_5_SECOND_FORENSIC_AUDIT.md`) |
| This phase Seoul dual-txn mimic (auth-like + apps-like, reconnecting clients) | median **3502ms** |
| This phase Mumbai dual-txn mimic (same shape) | median **919ms** |

Classification against user report: observed product behavior sits in **2–3s / >3s**, consistent with **Seoul-class per-statement RTT × dual serialized txns**, not with an India→Mumbai ~30ms RTT floor.

---

## 8. Browser Network waterfall findings

### Measured (login attempt)

| Event | Timing |
|---|---|
| Click Sign in → server action `/login` fetch | **445–1528ms** end-to-end |
| TTFB of action response | Dominates duration (e.g. 1524ms on cold-ish attempt; 445ms warm) |
| Response type | `text/x-component` (Next.js Server Action / RSC) |
| Payload | `success:false` + unexpected-error string |
| Other requests during click | **No** browser call to `*.supabase.co` (Auth is server-side) |
| Document navigation | **None** (stayed on `/login`) |

### Architecture (sidebar — from code, not live auth waterfall)

| Item | Finding |
|---|---|
| Link type | `TransitionLink` → `preventDefault` + `router.push` → **client soft navigation** |
| Full document reload on sidebar click | **No** (by design) |
| Prefetch | `next/link` preserved; unauth prefetch hits cached stubs only |
| loading.tsx | Present under dashboard routes — **masks** slow RSC; does not remove it |
| Duplicate RSC | Not observed unauthenticated; authenticated duplicate check **NOT MEASURED** |

---

## 9. Vercel server timing

| Signal | Finding |
|---|---|
| Function region | **iad1** for dynamic Node (`/api/health`, login server action) |
| Edge region | **bom1** |
| Cold vs warm | Login action 1528ms then 445ms → warm path exists; still fails |
| Server-Timing header | Not exposed on probed responses |
| Function duration metrics (Vercel dashboard) | **Unavailable** (Phase 6 ACL) |

**Dominant implication:** Co-locating Supabase to Mumbai **without** pinning serverless to `bom1` leaves Function→DB on a **US-East → Asia** path. That alone can preserve multi-hundred-ms statement RTT and multi-second navigations.

---

## 10. Auth timing

| Stage | Where | Measured / inferred |
|---|---|---|
| Middleware `getSession()` | Edge middleware | Local JWT cookie read (no network Auth by design — code comment Phase 10) |
| Layout/page `getUser()` | `getAuthenticatedContext` via `createServerClient` | **Network Auth** on every dynamic render that resolves context; live authenticated cost **NOT MEASURED** |
| React `cache()` | Dedupes `getAuthenticatedContext` within one RSC request | Layout + page share one identity resolution **per request** |
| Login `signInWithPassword` | Server action | Runs on **iad1**; failure returns global catch message (not “invalid credentials”, not “Failed to establish user context”) |
| Direct Auth password grant | Mumbai ~108–595ms; Seoul ~199–955ms for same email | Forensic host → Auth API |

**Duplicate identity:** Middleware session check + layout `getUser` + page `getAuthenticatedContext` (cached with layout) = **middleware local + one cryptographic getUser per navigation request**, not three independent getUser calls inside one render — but **every navigation still pays getUser + membership RLS txn**.

---

## 11. RLS timing

| Step | Behavior |
|---|---|
| Mechanism | `withRlsContext` → `prisma.$transaction` → `set_config('request.jwt.claim.sub', userId, true)` then queries |
| Per navigation | **Txn A:** membership in `getAuthenticatedContext`. **Txn B:** page `withRlsContext` (separate connection/txn) |
| Setup cost | At least **BEGIN + set_config (+ COMMIT)** RTTs **twice** per nav |
| Measured stmt RTT (India probe) | Mumbai median **~31–34ms**; Seoul median **~121–135ms** per trivial `SELECT 1` / `set_config` |

RLS CPU is not the bottleneck; **RLS interactive protocol × RTT** is.

---

## 12–13. SQL timing and query counts

### Per-statement RTT (psycopg2, interactive txn, India host)

| DB | Median stmt | Auth-like txn (3 stmts) | Apps-like (8 stmts) | Admin-like (20 stmts) |
|---|---|---|---|---|
| Mumbai | **34ms** | ~210ms | ~342ms | ~628–841ms |
| Seoul | **121ms** | ~726ms | ~1482ms | **~2795ms** |

**Serialization proof:** inside one connection, N statements ≈ N × RTT (stmt times flat ~RTT each). `Promise.all` in page code **does not** yield parallel Postgres execution on a single interactive transaction client.

### Static page query counts (Prisma `tx.*` ops in page files; excludes auth txn + `set_config` + `canUserCreateTask` extras)

| Route | Approx page ops inside `withRlsContext` |
|---|---|
| `/employee` | ~10 |
| `/employee/applications` | 4 (`Promise.all`) |
| `/employee/tasks` | 5+ governance lookups |
| `/employee/candidates` | 1 |
| `/admin` | **~20** |
| `/admin/applications` | 3 |
| `/admin/members` | 2 |
| `/admin/tasks/escalations` | 2 |
| `/candidate` | ~3 |
| `/candidate/applications` | 2 |
| `/candidate/profile` | ~3 |

Plus **every** dashboard nav: auth membership txn (~1–3 statements after set_config).

### Unnecessary / repeated patterns (code evidence)

- Dual txn every navigation (layout auth + page) even when `cache()` collapses duplicate membership reads **within** one request — **second txn still opens for page data**.
- Reference-data `findMany` (candidates/jobs/sources/staff) bundled with primary list on apps/tasks.
- Admin home: dense count waterfall (~20 parallel-looking awaits → serial RTTs).
- Notifications: `RealtimeRefresher` default **does not** poll; visibility sync only after >60s hidden. `/api/notifications` exists but was **not** observed on failed login page.

---

## 14–15. RSC / React timing

| Question | Answer |
|---|---|
| Full document vs client nav | **Client soft nav** via `TransitionLink`/`router.push` |
| RSC payload | Yes for destination segments; unauth stubs cached |
| Layout reuse | Client shell persists; **server layout still dynamic** (cookies/auth) so identity work re-runs on server for navigations |
| loading.tsx masking | **Yes** — skeleton paints while RSC/DB unfinished (matches user report) |
| router.refresh / revalidatePath on nav | Not required for sidebar; RealtimeRefresher does **not** call `router.refresh` by default |
| Prefetch | Link prefetch present; **does not** warm authenticated DB work when logged out; authenticated prefetch efficacy **NOT MEASURED** |

React commit / hydration on authenticated destinations: **NOT MEASURED**.

Same-page client filters/tabs (prior audit + architecture): **≪100ms** — no server dual-txn — confirms latency is **navigation/server**, not general UI jank.

---

## 16–17. Realtime / notification findings

| Check | Finding |
|---|---|
| `RealtimeProvider` in dashboard layout | Subscribes once per `scopeKey`; remount on identity change |
| Navigation-triggered full refresh | **Not by design** |
| Periodic notification polling | **Disabled** by default (`enablePeriodicRefresh=false`) |
| Navigation-triggered notification SQL | **NOT MEASURED** authenticated; no evidence on login page |
| Duplicate Realtime subscriptions | Possible if layout remounts with new scope object identity; not observed live |

**Not the ~3s primary cause** based on code path review.

---

## 18. Root cause (evidence-based)

**Primary class: combination — (I)** dominated by:

1. **(F) Prisma/query waterfall** — dual `withRlsContext` interactive transactions per navigation; `Promise.all` **serializes** on one connection.  
2. **(B)+(C) Vercel server execution × database RTT** — serverless runs in **`iad1`**, not `bom1`; each SQL statement pays cross-region RTT.  
3. **Likely still Seoul data plane on Production** — Phase 6 cutover never applied; Mumbai cutover **unverified**. Seoul-class stmt RTT (~120ms) × (auth stmts + page stmts) reproduces **~1.6–3.5s** DB floors before RSC/hydrate — matching the ~3s report.

**Not primary:**

- **(H)** Skeleton-only perception — skeletons acknowledge wait; wait remains server/DB.  
- **(A)** Browser bandwidth/DNS for static assets — login/static are fast; action TTFB is server.  
- Pure **(G)** React render CPU — same-page UI is fast.  
- **(D)** Session refresh storms — middleware uses local `getSession`; getUser is once/`cache` per request (still real cost, secondary).  
- **(E)** RLS policy CPU — setup is RTT-bound, not CPU-bound at this tenant size.

---

## 19. Secondary contributors

1. `getUser()` Auth round-trip from **iad1** on each soft navigation request.  
2. High statement counts on `/admin` and employee home.  
3. Cold connection acquire on new isolates (hundreds of ms–~1s) — worsens first hit; warm path still multi-second on Seoul-class RTT.  
4. Incomplete Mumbai cutover / possible env mismatch contributing to login failure (blocks deeper measurement).

---

## 20. Exact evidence (anchors)

1. `x-vercel-id: bom1::iad1::…` on `/api/health` and login server action → **compute ≠ bom1**.  
2. `withRlsContext` implementation: single `$transaction` + `set_config` then callback (`src/lib/db/rls.ts`).  
3. Dashboard layout always `getAuthenticatedContext()`; pages open a **second** `withRlsContext` (`src/app/(dashboard)/layout.tsx` + route pages).  
4. `Promise.all` inside apps/tasks/admin page txns (`employee/applications/page.tsx`, etc.).  
5. psycopg2 measurements: Seoul ~121ms/stmt, admin-like txn ~2.8s; Mumbai ~32ms/stmt, same shape ~0.6–0.8s.  
6. Phase 6 report: **no Production env change**.  
7. Browser login: action body `success:false` unexpected error; Auth API password grant OK on both projects.  
8. `TransitionLink` soft navigation — problem is RSC/server, not accidental full reload.  
9. Prior `ROUTE_NAVIGATION_5_SECOND_FORENSIC_AUDIT.md` dual-txn apps ~2.7s Seoul floor.

### Synthetic production trace (best-evidence; authenticated T0–T11 not captured)

Illustrative for `/employee/applications` soft nav **if** Production DB remains Seoul-class RTT ~120ms and function in iad1 (order-of-magnitude):

| Mark | Phase | Est. |
|---|---|---|
| T0 | Click sidebar | 0 |
| T1 | RSC/server request starts | ~0–50ms |
| T2 | Middleware `getSession` | ≪50ms |
| T3 | `getUser()` | ~50–200ms+ |
| T4–T6 | Auth RLS txn + page RLS txn (serialized stmts) | **~1.5–3.0s** |
| T7–T8 | Server render + RSC bytes | tens–hundreds ms |
| T9–T11 | Browser receive + commit + usable | tens–hundreds ms |
| **T0→T11** | Perceived nav | **~2–4s** |

Split: **database/RTT+serialization ≈ majority**; auth network secondary; browser/render minority; skeleton only covers T1→T9 visually.

---

## 21. Recommended next fix (DO NOT IMPLEMENT IN THIS PHASE)

Ordered by measured leverage:

1. **Pin Vercel serverless `regions` to `bom1`** and redeploy; re-measure `x-vercel-id` until dynamic routes show `bom1` **without** `iad1`.  
2. **Complete Phase 6 Mumbai cutover** on the Vercel project that owns `citrux-apply.vercel.app` (correct account); confirm Production Auth URL + `DATABASE_URL` hosts are `vgrvijug…` / `ap-south-1`.  
3. **Re-run this Phase 7 matrix authenticated** (3× per route) with Network + `oos:navigation-metric` / server logs.  
4. Only after co-location: collapse dual RLS txns / reduce statement count / stop treating `Promise.all` as parallel SQL.  
5. Unblock login failure separately (forensic: unexpected global catch — inspect Production logs for thrown stage).

Expected: after **bom1 compute + Mumbai DB**, dual-txn floors should fall from multi-second toward **sub-second** for apps/tasks shapes (India-probe Mumbai mimic ~0.9s including reconnect overhead; pooled warm path should be lower).

---

## 22. What MUST NOT be changed (this phase / until directed)

- Application code  
- Database schema / data  
- RLS policies  
- Vercel configuration (including region pin — recommend only, **do not apply here**)  
- Supabase configuration  
- Environment variables  
- Caching behavior  
- Authentication architecture  

**Do not start Phase 8. Stop after this report.**

---

## Comparison A/B/C/D (Most Important Test)

| Mode | Result |
|---|---|
| A. Sidebar navigation | Architecture = soft RSC + dual RLS; **live timing BLOCKED** |
| B. Direct URL | Unauth → login redirect ~middleware; auth **BLOCKED** |
| C. Browser reload | Would re-run full document + same server tree; **BLOCKED** |
| D. Same-page client interaction | Prior evidence + InstantTabs/filter pattern: **instant / ≪100ms** — no dual RLS page fetch |

**Interpretation:** Latency is **navigation architecture + server/DB**, not client rendering. Skeletons prove the wait is after click acknowledgment during destination RSC completion.

---

## Performance classification (by evidence class)

| Route family | Latency class if Seoul RTT @ ~120ms | Latency class if Mumbai RTT @ ~32ms **and** compute local | Dominant contributor |
|---|---|---|---|
| Employee apps/tasks | **1–2s to >3s** | **250–500ms to 1s** | Serial dual RLS txs |
| Admin home (~20 ops) | **>3s** | **500ms–1s** | Statement count × RTT |
| Admin members / light pages | **1–2s** | **250–500ms** | Auth txn + few queries |
| Same-page UI | **<100ms** | **<100ms** | Client only |

Production user report (~3s) aligns with **Seoul-class or iad1↔Asia RTT**, not with completed bom1↔Mumbai co-location.

---

## Gaps requiring instrumentation (why 🟡)

1. Authenticated Network waterfall (RSC TTFB, byte size, duplicate fetches).  
2. Production env fingerprint (`NEXT_PUBLIC_SUPABASE_URL`, DB host) from the owning Vercel account.  
3. Server logs for login unexpected exception stage.  
4. Vercel function duration / `Server-Timing` on authenticated RSC.  
5. Confirm post-region-pin `x-vercel-id` no longer contains `iad1`.

---

*End of Phase 7 forensic report. No fixes applied.*
