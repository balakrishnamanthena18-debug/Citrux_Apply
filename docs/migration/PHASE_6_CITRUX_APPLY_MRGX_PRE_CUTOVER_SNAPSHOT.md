# Phase 6 — Pre-Cutover Snapshot (citrux-apply-mrgx)

**Document type:** PRE-CUTOVER SNAPSHOT (NO SECRETS) — ACCESS BLOCKED  
**Timestamp (UTC):** 2026-10-01T09:59:00Z  
**Target URL (human-confirmed):** `https://citrux-apply-mrgx.vercel.app/`  
**Excluded URL:** `https://citrux-apply.vercel.app/`  
**Cutover status:** **NOT STARTED** — Vercel project not accessible to CLI user `balumanthena`

---

## 1. Public production observation

| Item | Value |
|---|---|
| `/api/health` | HTTP 200 · `status=pass` · `service=oos` · `phase=0` |
| Edge / compute hint | `x-vercel-id: bom1::iad1::…` |
| Supabase project ref from health | **Not exposed** |

---

## 2. Vercel identity (this agent)

| Item | Value |
|---|---|
| CLI user | `balumanthena` |
| Team | `balakrishnas-projects-1cd73668` |
| Owns `citrux-apply-mrgx`? | **NO** (403 / not_found) |
| Project name / ID | **UNKNOWN** |
| Production env var names on Vercel | **UNKNOWN** |

---

## 3. Expected application variable names (repository)

Region-specific (must swap Seoul → Mumbai on cutover; rollback reverses):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`

Usually leave unchanged:

- `CRON_SECRET`
- `OPERATING_ORGANIZATION_ID`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

**No secret values recorded.**

---

## 4. Rollback

Use `PHASE_6_ROLLBACK_PLAN.md` against the **owning** Vercel project for `citrux-apply-mrgx` once access exists. Keep Seoul and Mumbai projects intact.
