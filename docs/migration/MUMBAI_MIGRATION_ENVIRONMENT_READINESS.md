# Mumbai Migration Environment Readiness

**Date:** 2026-10-01 (Phase 1 retry — target verification)  
**Mode:** Read-only target inspection + environment readiness  
**Data / Auth / Storage object migration:** NOT EXECUTED  

---

## Final Gate

### 🟢 MUMBAI MIGRATION ENVIRONMENT READY

With **manual follow-ups** required before object copy (private buckets + `oos_app_runtime` creation). Environment credentials, identity separation, region, DB emptiness, Auth, Realtime, and tests all pass.

---

## Source

| Item | Result |
|---|---|
| Region | `ap-northeast-2` (Seoul) |
| Project ref (redacted) | `auzikqap…` |
| Matches main `.env` | **YES** |
| Status | **UNCHANGED** |

## Target

| Item | Result |
|---|---|
| Region | **`ap-south-1` (Mumbai)** |
| Project ref (redacted) | `vgrvijug…` |
| Status | **REACHABLE / EMPTY APPLICATION STATE** |

## Source ≠ Target

**PASS** (`auzikqap…` ≠ `vgrvijug…`)

## Required Variables (values not shown)

| Variable | Status |
|---|---|
| `SOURCE_PROJECT_REF` | CONFIGURED |
| `TARGET_PROJECT_REF` | CONFIGURED |
| `NEW_DB_URL` | CONFIGURED (Mumbai `ap-south-1`, port `6543`, Prisma `pgbouncer` query param) |
| `NEW_DIRECT_URL` | CONFIGURED (Mumbai `ap-south-1`, port `5432`) |
| `TARGET_SUPABASE_URL` | CONFIGURED |
| `TARGET_SUPABASE_SERVICE_ROLE_KEY` | CONFIGURED |

Refs inside `NEW_DB_URL` / `NEW_DIRECT_URL` / `TARGET_SUPABASE_URL` match `TARGET_PROJECT_REF` after normalization.

## Target Database

| Check | Result |
|---|---|
| `NEW_DIRECT_URL` connection | **PASS** |
| TLS (`ssl=on`) | **PASS** |
| `NEW_DB_URL` connection | **PASS** after stripping Prisma-only `?pgbouncer=true` for `psql` |
| PostgreSQL | 17.x |
| Public tables | **0** (`[]`) |
| `auth.users` / `auth.identities` | **0 / 0** |
| `storage.buckets` / `storage.objects` | **0 / 0** |
| Unexpected Seoul application data | **NONE** |

## Target Auth

| Check | Result |
|---|---|
| Auth health | **PASS** |
| Service-role admin API | **PASS** |
| JWT | Mumbai native (not modified) |
| User migration | **NOT EXECUTED** |

## Target Storage

| Bucket | Result |
|---|---|
| `candidate-documents` | **MISSING** — create manually as **PRIVATE** |
| `submission-evidence` | **MISSING** — create manually as **PRIVATE** |
| Privacy requirement | **PRIVATE** (mandatory) |
| Objects copied | **NO** |

Storage API list authenticated successfully against Mumbai.

## Target Realtime

**PASS** (endpoint reachable; HTTP 401 without realtime auth is acceptable reachability signal)

## Extensions / Role Prerequisites

| Item | Result |
|---|---|
| `pgcrypto` | **PRESENT** (REQUIRED) |
| `uuid-ossp` | PRESENT |
| `supabase_vault` | Present (platform default; OOS app has no Vault encrypted-column dependency) |
| `oos_app_runtime` | **DOES NOT EXIST YET** |
| Can prepare safely | **YES** (connected as privileged DB user; `LOGIN NOSUPERUSER NOBYPASSRLS`; **NEW** password only — never reuse Seoul / never print) |

## Migration Tests

**16/16 PASS** (`tests/unit/migration/supabase-storage-migrate.test.ts`)

## Git / Secrets Safety

| Check | Result |
|---|---|
| `.migration-mumbai.env` gitignored | **PASS** |
| `.migration-mumbai.env` tracked | **NO** |
| Secrets printed | **NO** |
| Main `.env` modified | **NO** |

## Production Safety

| Item | Status |
|---|---|
| Main `.env` | **UNCHANGED** (still Seoul / `ap-northeast-2`) |
| Vercel | **UNCHANGED** |
| Seoul project | **UNCHANGED** |
| Database data migration | **NOT EXECUTED** |
| Auth migration | **NOT EXECUTED** |
| Storage object migration | **NOT EXECUTED** |
| Phase 2 | **NOT STARTED** |

---

## Manual actions before Phase 2 dump/restore / Storage copy

1. In Mumbai dashboard (or Storage API), create **private** buckets:
   - `candidate-documents` (`public=false`)
   - `submission-evidence` (`public=false`)
2. Create `oos_app_runtime` with a **new random password** (gitignored env only; never commit/print).
3. Prefer `NEW_DIRECT_URL` (`:5432`) for dump/restore tooling; keep `NEW_DB_URL` (`:6543`) for Prisma-style runtime URLs.
4. Re-run Phase 1 bucket/role checks after creation.

---

## PHASE 1

Target environment verification complete for this task.  

**Do not begin Phase 2 automatically.**
