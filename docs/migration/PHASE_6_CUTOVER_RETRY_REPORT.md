# Phase 6 Cutover Retry Report — Vercel Ownership, Mumbai & bom1 Compute

**Document type:** CONTROLLED PRODUCTION CUTOVER RETRY / HARD STOP  
**Date (UTC):** 2026-10-01  
**Production domain under test:** `https://citrux-apply.vercel.app`  
**Intended target:** Mumbai Supabase `vgrvijugljzlpohsbmjg` / `ap-south-1`  
**Intended source remain (rollback):** Seoul `auzikqapcgtgqwotnldq` / `ap-northeast-2`  
**Related prior docs:**  
`PHASE_6_PRE_CUTOVER_SNAPSHOT.md`, `PHASE_6_ROLLBACK_PLAN.md`, `PHASE_6_PRODUCTION_CUTOVER_REPORT.md`, `docs/performance/PHASE_7_PRODUCTION_NAVIGATION_FORENSIC.md`

---

## FINAL STATUS

### 🔴 CUTOVER BLOCKED — VERCEL ACCESS

**No Production environment variables were changed.**  
**No Production deployment was performed.**  
**No repository `vercel.json` / region configuration was changed.**  
**Seoul was not modified.**  
**Mumbai was not deleted.**  
**No application code optimization was performed.**

Cutover stopped at **Step 1 (Vercel account / project ownership)** under the absolute rule: if current credentials cannot access the production project, **STOP** and do not modify anything.

---

## 1. Vercel ownership verification

| Check | Result |
|---|---|
| CLI authenticated user | `balumanthena` |
| Accessible team | `balakrishnas-projects-1cd73668` (“balakrishna's projects”, Hobby) |
| Team ID | `team_K6nO6TQUk1ANJMZOvCHWdDXg` |
| `vercel inspect citrux-apply.vercel.app` | **FAIL** — deployment not found under this context |
| API `GET /v6/domains/citrux-apply.vercel.app` (personal) | **403 forbidden** — no access |
| API `GET /v6/domains/citrux-apply.vercel.app` (team) | **403 forbidden** — no access |
| Domain listed under team `vercel domains ls` | **NO** |
| Any accessible project alias = `citrux-apply.vercel.app` | **NO** |

### Project identity for production domain

| Field | Value |
|---|---|
| Vercel team that owns `citrux-apply.vercel.app` | **UNKNOWN** (inaccessible to this login) |
| Vercel project name | **UNKNOWN** |
| Project ID | **UNKNOWN** |
| Git repository linked on Vercel | **UNKNOWN** |
| Production deployment ID | **UNKNOWN** |
| Production commit on Vercel | **UNKNOWN** |

### Nearby projects under this login (NOT used)

Safety rule honored: **do not** treat similarly named projects as production unless independently proven.

| Project | ID | Production URL(s) | Linked repo (from API) | Owns `citrux-apply.vercel.app`? |
|---|---|---|---|---|
| `citruxapply` | `prj_r673q5O1L1p6NnMNZQfGQ8YEZxw8` | `citruxapply.vercel.app` | `balumanthena/CitruxApply` | **NO** (different hostname) |
| `citruxapplysite` | `prj_xn5tRqWVDoyCF9na8qYEEhP5ysop` | _(none listed)_ | `balumanthena/Apply_citrux` | **NO** (no prod URL; domain ACL still not this hostname) |

**Neither project was modified.**

### Local git context (this workspace)

| Item | Value |
|---|---|
| Remote | `https://github.com/balakrishnamanthena18-debug/Citrux_Apply.git` |
| Local HEAD | `9c7ffd97ce188944cb94e40d2506162203ecce1e` |
| Latest message | `feat(perf): Phase 10 navigation Time-to-Usable and perceived latency` |

This remote does **not** by itself prove Vercel project ownership of `citrux-apply.vercel.app`.

---

## 2. Pre-cutover snapshot validity

| Document | Status |
|---|---|
| `PHASE_6_PRE_CUTOVER_SNAPSHOT.md` | **Still valid** as a blocked-state snapshot |
| `PHASE_6_ROLLBACK_PLAN.md` | **Still valid** — Seoul restore procedure; requires owning-project access |
| Prior `PHASE_6_PRODUCTION_CUTOVER_REPORT.md` | Consistent: first attempt also blocked on ACL |

### Currently active production (public observation only)

| Item | Value |
|---|---|
| Domain | `https://citrux-apply.vercel.app` |
| `/api/health` | HTTP 200 · `{"status":"pass","service":"oos","phase":"0"}` |
| `/login` | HTTP 200 |
| Edge `x-vercel-id` | `bom1::…` |
| Dynamic compute `x-vercel-id` (health) | `bom1::iad1::…` (**iad1 compute still present**) |
| Production env var **names** on Vercel | **UNKNOWN** (ACL) — expected set from repo below |
| Rollback path to Seoul | Documented; **not executable** without owning-project access |

### Authoritative application variable names (from repository)

Confirmed by `.env.example` and runtime imports (`src/lib/supabase/*`, Prisma):

| Application variable | Role |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role |
| `DATABASE_URL` | Runtime pooled Prisma (`:6543`) |
| `DIRECT_URL` | Migrations / direct (`:5432`) |

Migration file aliases (`.migration-mumbai.env`) are **not** runtime names; they would map as:

| Migration name | → Production name |
|---|---|
| `TARGET_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| `TARGET_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `TARGET_SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` |
| `NEW_DB_URL` | `DATABASE_URL` |
| `NEW_DIRECT_URL` | `DIRECT_URL` |

**Mapping was prepared only; no values were written to Vercel.**

---

## 3. Current runtime database (pre-cutover)

| Check | Result |
|---|---|
| Safe runtime fingerprint endpoint exposing project ref / DB region | **Not present** on Production (`/api/health` returns only status/service/phase) |
| Client-bundle Supabase project ref | **Not found** on `/login` chunks (server-action login) |
| Inference from migration history + Phase 6 never applied | Production still expected on **Seoul** |
| Phase 7 forensic | ~3s nav consistent with Seoul-class RTT; cutover never applied |
| Definitive Production `DATABASE_URL` host | **UNVERIFIED** (requires Vercel env read or authenticated diagnostic) |

**No new public diagnostic was deployed** (would require write access to the owning project / a deploy we refuse without ownership proof).

---

## 4–6. Environment mapping / Mumbai keys / DB variables

| Step | Status |
|---|---|
| Map Mumbai values into Production app var names | **NOT EXECUTED** (blocked) |
| Set Production `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Mumbai anon (not service role) | **NOT EXECUTED** |
| Set `DATABASE_URL` / `DIRECT_URL` from `NEW_DB_URL` / `NEW_DIRECT_URL` | **NOT EXECUTED** |
| Preview / Development env changes | **NOT EXECUTED** (and not required) |

---

## 7. Vercel function region (`bom1`)

| Item | Finding |
|---|---|
| Why `iad1` today | Repo `vercel.json` has **no** `regions` pin; dynamic Node routes default to account/platform placement → observed **`iad1`** |
| Supported config mechanism | Vercel project `regions` / `vercel.json` `"regions": ["bom1"]` (or Next.js `preferredRegion` / route segment config where applicable) |
| Config change applied | **NO** — would not affect `citrux-apply.vercel.app` without ownership; also refused to change wrong projects |
| Post-deploy compute verification | **N/A** |

Public re-check still shows: health `x-vercel-id: bom1::iad1::…`.

---

## 8–10. Deployment / post-deploy fingerprint

| Item | Status |
|---|---|
| Deployment | **NOT PERFORMED** |
| Deployment ID / commit / timestamp | **N/A** |
| Runtime path `bom1` → `ap-south-1` | **NOT VERIFIED** |
| Confirmation Production leaves Seoul | **NOT VERIFIED** |

---

## 11–14. Auth / health / navigation / performance

| Gate | Status |
|---|---|
| Production login (candidate / employee / admin) | **NOT RUN** (cutover blocked; prior Phase 7 login already failed on current Production) |
| Authenticated navigation matrix | **NOT RUN** |
| Performance comparison vs Phase 7 | **NOT CLAIMED** — no post-cutover measurements |
| `/api/health` (current, pre-change) | Pass; edge `bom1`; compute still `iad1` |

---

## 15. Security

| Check | Status |
|---|---|
| Secrets printed in this report | **NO** |
| Service role exposed | **NO** (not touched) |
| Unrelated projects modified | **NO** |
| RLS / auth architecture changed | **NO** |

---

## 16. Rollback

| Item | Status |
|---|---|
| Cutover attempted | **NO** |
| Rollback executed | **NO** (nothing to roll back) |
| Seoul preserved | **YES** |
| Mumbai retained | **YES** |

---

## 17. Remaining warnings / operator actions required

To unblock the next retry, an operator must:

1. Sign in to the **Vercel account/team that owns** `https://citrux-apply.vercel.app` (not merely an account that owns `citruxapply.vercel.app`).  
2. Confirm project name, ID, linked Git repo, and that it serves this OOS application.  
3. Grant this CLI identity access **or** re-run Phase 6 from that authenticated context.  
4. Export Production env **names** and store Seoul secret **values** securely for rollback (password manager) **before** any Mumbai write.  
5. Then execute: Production-only Mumbai mapping → pin compute `bom1` → deploy → runtime fingerprint → auth → navigation measurement.

Until ownership is proven, **any** env change on `citruxapply` / `citruxapplysite` remains unsafe and is refused.

---

## Summary table

| Field | Previous | New (this retry) |
|---|---|---|
| Vercel ownership | Blocked (403) | **Still blocked (403)** |
| Runtime edge | `bom1` | `bom1` (unchanged) |
| Runtime dynamic compute | `iad1` | `iad1` (unchanged) |
| Database target | Inferred Seoul; cutover never applied | **Unchanged** |
| Mumbai live on Production | No | **No** |
| Deployment | None | **None** |

---

## FINAL STATUS

### 🔴 CUTOVER BLOCKED — VERCEL ACCESS

**Cause:** Authenticated Vercel identity `balumanthena` / team `balakrishnas-projects-1cd73668` cannot access domain or project for `citrux-apply.vercel.app` (HTTP 403). Ownership cannot be verified; Production must not be modified via similarly named projects.

**STOP.** Do not start another performance phase automatically. Do not delete Seoul. Do not delete Mumbai.
