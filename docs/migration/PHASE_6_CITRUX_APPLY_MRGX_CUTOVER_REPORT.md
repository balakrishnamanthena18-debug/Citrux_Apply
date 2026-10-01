# Phase 6 — citrux-apply-mrgx Cutover Report

**Document type:** CONTROLLED PRODUCTION CUTOVER RETRY (VERIFIED URL TARGET) / HARD STOP  
**Date (UTC):** 2026-10-01  
**Human-confirmed production URL:** `https://citrux-apply-mrgx.vercel.app/`  
**Explicitly excluded:** `https://citrux-apply.vercel.app/` (not the cutover target)  
**Intended Supabase target:** Mumbai `vgrvijugljzlpohsbmjg` / `ap-south-1`  
**Rollback Supabase source:** Seoul `auzikqapcgtgqwotnldq` / `ap-northeast-2`

---

## FINAL STATUS

### 🔴 PHASE 6 CUTOVER BLOCKED — ACCESS/IDENTITY

**No Production environment variables were changed.**  
**No deployment was performed.**  
**No `vercel.json` / region pin was applied.**  
**Projects `citruxapply` and `citruxapplysite` were not modified.**  
**Seoul was not modified.**  
**Mumbai was not deleted.**

Cutover stopped at **STEP 1 — VERIFY PROJECT**.

---

## 1. Verified Vercel project (attempted)

| Field | Result |
|---|---|
| Confirmed public URL | `https://citrux-apply-mrgx.vercel.app/` |
| Public `/api/health` | HTTP 200 · `{"status":"pass","service":"oos","phase":"0"}` |
| Public edge / compute hint | `x-vercel-id: bom1::iad1::…` (edge `bom1`, dynamic still `iad1`) |
| CLI user | `balumanthena` |
| Accessible team | `balakrishnas-projects-1cd73668` (`team_K6nO6TQUk1ANJMZOvCHWdDXg`) |
| `vercel inspect citrux-apply-mrgx.vercel.app` | **FAIL** — deployment not found under this context |
| API `GET /v9/projects/citrux-apply-mrgx` | **not_found** |
| API domain ACL | **403 forbidden** — no access to `citrux-apply-mrgx.vercel.app` |
| Project name / ID under this login | **UNKNOWN / NOT FOUND** |
| Git repository on Vercel | **UNKNOWN** |
| Production deployment ID | **UNKNOWN** |
| Production branch / commit on Vercel | **UNKNOWN** |
| Alias scan (team + personal, 100 aliases each page) | **No `mrgx` / `citrux-apply*` aliases owned by this account** |

**Conclusion:** The hostname is a live OOS deployment on the public internet, but it is **not owned** (or not shared) with the currently authenticated Vercel account. Ownership/identity cannot be verified; Production must not be modified.

---

## 2. Current production Supabase target

| Check | Result |
|---|---|
| Safe runtime fingerprint (project ref / DB region) | **Not available** without project write access to add a diagnostic, and `/api/health` does not expose it |
| Inferred from history | Still expected **Seoul** until a successful cutover on this project |
| Definitive confirmation | **BLOCKED** |

---

## 3. Pre-cutover snapshot (citrux-apply-mrgx)

| Item | Value |
|---|---|
| Snapshot for this hostname | Public observation only (below) |
| Prior docs reviewed | `PHASE_6_PRE_CUTOVER_SNAPSHOT.md`, `PHASE_6_ROLLBACK_PLAN.md`, `PHASE_6_CUTOVER_RETRY_REPORT.md` |
| Production env var **names** from Vercel | **UNKNOWN** (ACL) |
| Expected app var names (from repo) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL` (+ non-region: `CRON_SECRET`, SMTP_*, `OPERATING_ORGANIZATION_ID`) |
| Rollback to Seoul | Documented conceptually; **not executable** without owning-project access |
| Secret values recorded | **NONE** |

### Public snapshot (2026-10-01)

| Probe | Result |
|---|---|
| `GET /api/health` | pass / oos / phase 0 |
| TTFB (sample) | ~351ms |
| `x-vercel-id` | `bom1::iad1::…` |

---

## 4–7. Mapping / env update / bom1 / deploy

| Step | Status |
|---|---|
| Mumbai → app var mapping (conceptual) | Prepared earlier; **not applied** |
| Production-only env update on `citrux-apply-mrgx` | **NOT EXECUTED** |
| Function region `bom1` | **NOT EXECUTED** |
| Deploy | **NOT EXECUTED** |
| Deployment ID / commit | **N/A** |

---

## 8–11. Runtime / auth / smoke / performance

| Gate | Status |
|---|---|
| Mumbai runtime verification | **NOT RUN** |
| Auth (candidate / employee / admin) | **NOT RUN** |
| Smoke tests | **NOT RUN** |
| Navigation performance vs ~3s baseline | **NOT MEASURED** (no cutover) |

---

## 12. Rollback

| Item | Status |
|---|---|
| Cutover attempted | **NO** |
| Rollback executed | **NO** |
| Seoul preserved | **YES** |
| Mumbai retained | **YES** |

---

## Remaining warnings / required operator action

1. Log into the **Vercel account/team that owns** `https://citrux-apply-mrgx.vercel.app/`.  
2. Invite / grant `balumanthena` (or re-run this phase under that login).  
3. Confirm project name, ID, Git link, and Production env names.  
4. Export Seoul Production secrets to a password manager for rollback.  
5. Re-run Phase 6 against **only** that project (not `citrux-apply.vercel.app`, not `citruxapply`, not `citruxapplysite`).

---

## Summary

| Field | Value |
|---|---|
| Verified Vercel project | **NO** — access blocked |
| Project ID | **UNKNOWN** |
| Team (accessible CLI) | `balakrishnas-projects-1cd73668` (does **not** own target) |
| Production URL (human target) | `https://citrux-apply-mrgx.vercel.app/` |
| Previous Supabase target | Inferred Seoul / **unverified on this project** |
| New Supabase target | Mumbai — **not applied** |
| Runtime region | Still `iad1` (public health header) |
| Database region | **Unverified** |
| Deployment ID | **N/A** |
| Login / smoke / perf | **N/A** |
| Rollback status | Not needed |

---

## FINAL STATUS

### 🔴 PHASE 6 CUTOVER BLOCKED — ACCESS/IDENTITY

**STOP after Phase 6.** Do not start a performance phase. Do not modify other Vercel projects.
