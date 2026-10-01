# Phase 6 — Rollback Plan (Seoul)

**Document type:** ROLLBACK PROCEDURE (NO SECRETS)  
**Rollback target:** Seoul Supabase `auzikqapcgtgqwotnldq` / `ap-northeast-2`  
**Production domain:** `https://citrux-apply.vercel.app`  
**Prerequisite:** Access to the Vercel project that **owns** the production domain

---

## 1. Intent

If Mumbai cutover fails critically, restore Vercel Production environment variables to Seoul and redeploy so traffic again uses Seoul Supabase.  

**Do not** delete Mumbai.  
**Do not** modify Seoul data, Auth, or Storage during rollback.

---

## 2. Variables expected to differ (region-specific)

Confirm exact names on the real Production project, then revert these categories to Seoul values:

| Category | Typical names (verify on Vercel) | Rollback source |
|---|---|---|
| Public Supabase URL | `NEXT_PUBLIC_SUPABASE_URL` | Seoul project URL |
| Public anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Seoul anon key |
| Service role | `SUPABASE_SERVICE_ROLE_KEY` | Seoul service role |
| Pooled DB | `DATABASE_URL` | Seoul pooler URL (`ap-northeast-2`) as used in prod |
| Direct DB | `DIRECT_URL` | Seoul session/direct URL as used in prod |

### Variables that usually should **not** change on rollback

| Category | Typical names |
|---|---|
| Cron auth | `CRON_SECRET` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
| Tenant constant | `OPERATING_ORGANIZATION_ID` |
| Node | `NODE_ENV` (if set) |

---

## 3. Rollback procedure (operator)

1. Open the Vercel project that owns `citrux-apply.vercel.app` (must match Production domain).  
2. Production → Environment Variables.  
3. Restore Seoul values for the region-specific variables in §2 (from the pre-cutover export / password manager / prior Vercel revision).  
4. Ensure scope = **Production** only.  
5. Redeploy Production (promote existing Seoul-compatible deployment or trigger new deploy from the last known-good commit).  
6. Smoke-test `https://citrux-apply.vercel.app`:
   - `/api/health` → pass  
   - `/login` loads  
   - candidate / employee / admin login (JWT re-login expected)  
7. Confirm app is **not** using Mumbai host (`vgrvijug…`) in runtime diagnostics if available.  
8. Record execution in `PHASE_6_ROLLBACK_EXECUTION_REPORT.md` if rollback is used.

---

## 4. Seoul preservation checklist

| Asset | Required state |
|---|---|
| Seoul Supabase project | **EXISTS / UNCHANGED** |
| Seoul database | **UNCHANGED** |
| Seoul Auth | **UNCHANGED** |
| Seoul Storage | **UNCHANGED** |
| Mumbai project | **RETAIN** (do not delete) |

---

## 5. Current blocker note

As of 2026-10-01, the agent’s Vercel login **cannot** read or write the Production project for `citrux-apply.vercel.app`.  

Rollback cannot be executed by this agent until an operator authenticates to the correct Vercel account/team and confirms project identity.
