# OOS Supabase Seoul → Mumbai
# Phase 2 Database Migration Report

**Date:** 2026-10-01  
**Scope:** Public application database dump/restore only  
**Auth migration:** NOT EXECUTED  
**Storage object migration:** NOT EXECUTED  
**Production cutover:** NOT EXECUTED  

---

## Final Status

### 🟢 PHASE 2 DATABASE MIGRATION — VERIFIED

---

## 1. Source / Target Identity

| Item | Value |
|---|---|
| Source project (redacted) | `auzikqap…` |
| Source region | `ap-northeast-2` (Seoul) |
| Target project (redacted) | `vgrvijug…` |
| Target region | `ap-south-1` (Mumbai) |
| Source ≠ Target | **PASS** |
| Main `.env` still Seoul | **YES** |
| Vercel | **UNCHANGED** |
| Seoul modified | **NO** |

---

## 2. Phase 2A Pre-flight

| Check | Result |
|---|---|
| Source connectivity | PASS |
| Target connectivity | PASS (TLS on) |
| Target empty before restore | PASS (0 public tables, 0 auth users, 0 storage objects) |
| Migration tests | 16/16 PASS |
| `.migration-mumbai.env` gitignored | YES |

---

## 3. Dump Method

| Item | Detail |
|---|---|
| Tool | `pg_dump` (Supabase CLI unavailable; equivalent to approved plan for **public** schema) |
| Source connection | Seoul Session `:5432` via application `DIRECT_URL` (**read-only dump**; `.env` not modified) |
| Artifacts | `/tmp/oos-migrate-p2/schema.sql`, `data.sql` (mode `600`) |
| Roles strategy | Full Seoul `roles.sql` **not** applied (platform role conflicts). Target `oos_app_runtime` created explicitly. |
| Auth data | **Excluded** (`--schema=public` only) |
| Storage objects | **Excluded** |

### Dump inspection

| Metric | Value |
|---|---|
| CREATE TABLE | 32 |
| COPY tables | 32 |
| Enums | 26 |
| Functions (app) | 16 (+ skipped platform `rls_auto_enable`) |
| Policies | 76 |
| FORCE RLS statements | 30 |
| Indexes | 67+ |
| FK mentions | 68 |
| Destructive SQL | None |
| Includes `auth.*` data | **NO** |
| Includes `storage.*` | **NO** |

---

## 4. Restore Method

### Role preparation

| Item | Result |
|---|---|
| `oos_app_runtime` | **CREATED** |
| Attributes | `LOGIN` / `NOSUPERUSER` / `NOBYPASSRLS` / `NOCREATEDB` / `NOCREATEROLE` |
| Password | **NEW** random password stored only in gitignored `.migration-mumbai.env` (`OOS_APP_RUNTIME_PASSWORD`) |
| Password printed | **NO** |
| Seoul password reused | **NO** |

### Schema restore

| Item | Detail |
|---|---|
| Target | Mumbai `NEW_DIRECT_URL` (`:5432`) |
| Mode | `psql --single-transaction -v ON_ERROR_STOP=1` |
| Platform adjustments (non-destructive) | Skipped `CREATE SCHEMA public`; skipped managed `rls_auto_enable`; skipped `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …` (permission denied as `postgres`) |
| Result | **PASS** |

Post-schema object counts: tables **32**, policies **76**, functions **17**, enums **26**, indexes **104**, FKs **68**.

### Data restore

| Item | Detail |
|---|---|
| Mode | FK-ordered `pg_dump --data-only` + `psql --single-transaction` |
| `session_replication_role=replica` | **Not used** — Supabase rejects disabling system RI triggers |
| Auth / Storage | Not included |
| Result | **PASS** |

---

## 5. Tables Migrated / Row-count Comparison

All **32** public tables: **MATCH** (count + `id` digest where applicable).

| Table | Source | Target | IDs | Status |
|---|---:|---:|---|---|
| `_prisma_migrations` | 18 | 18 | SAME | MATCH |
| `application_materials` | 9 | 9 | SAME | MATCH |
| `application_qa_checklists` | 63 | 63 | SAME | MATCH |
| `application_qa_reviews` | 7 | 7 | SAME | MATCH |
| `application_state_history` | 56 | 56 | SAME | MATCH |
| `application_submissions` | 5 | 5 | SAME | MATCH |
| `applications` | 13 | 13 | SAME | MATCH |
| `audit_events` | 157 | 157 | SAME | MATCH |
| `candidate_certifications` | 8 | 8 | SAME | MATCH |
| `candidate_documents` | 5 | 5 | SAME | MATCH |
| `candidate_educations` | 0 | 0 | SAME | MATCH |
| `candidate_experiences` | 0 | 0 | SAME | MATCH |
| `candidate_projects` | 0 | 0 | SAME | MATCH |
| `candidate_skills` | 8 | 8 | SAME | MATCH |
| `candidates` | 3 | 3 | SAME | MATCH |
| `conversations` | 3 | 3 | SAME | MATCH |
| `designations` | 2 | 2 | SAME | MATCH |
| `email_delivery_logs` | 29 | 29 | SAME | MATCH |
| `internal_notes` | 1 | 1 | SAME | MATCH |
| `jobs` | 11 | 11 | SAME | MATCH |
| `memberships` | 6 | 6 | SAME | MATCH |
| `messages` | 23 | 23 | SAME | MATCH |
| `notifications` | 27 | 27 | SAME | MATCH |
| `organizations` | 1 | 1 | SAME | MATCH |
| `privacy_requests` | 0 | 0 | SAME | MATCH |
| `rate_limit_buckets` | 1 | 1 | SAME | MATCH |
| `staff_activation_tokens` | 1 | 1 | SAME | MATCH |
| `task_checklist_items` | 0 | 0 | SAME | MATCH |
| `task_governance_policies` | 0 | 0 | SAME | MATCH |
| `task_state_history` | 3 | 3 | SAME | MATCH |
| `tasks` | 1 | 1 | SAME | MATCH |
| `users` | 6 | 6 | SAME | MATCH |

**Mismatch count:** 0

---

## 6. UUID / FK Integrity

| Check | Result |
|---|---|
| UUID/`id` set digests | **PRESERVED** (all tables with `id`) |
| FK constraints present | **68** |
| Orphans: memberships→users | 0 |
| Orphans: memberships→organizations | 0 |
| Orphans: candidates→users | 0 |
| Orphans: applications→candidates | 0 |
| Orphans: messages→conversations | 0 |

---

## 7. Indexes / Constraints / Enums

| Item | Result |
|---|---|
| Indexes (target) | 104 |
| Foreign keys | 68 |
| Enums | 26 |
| Prisma migrations rows | 18 source = 18 target |

---

## 8. RLS / Security Verification

| Check | Result |
|---|---|
| Tables with RLS enabled | 32 / 32 |
| FORCE RLS | 30 / 32 |
| Without FORCE (expected) | `_prisma_migrations`, `rate_limit_buckets` |
| Policies | 76 |
| SECURITY DEFINER functions | 16 |
| Missing `search_path` on SECDEF | **NONE** |
| `request.jwt.claim.sub` → `current_user_id()` smoke | **PASS** |
| `oos_app_runtime` flags | login=true, super=false, bypassrls=false, createdb=false, createrole=false |
| Table grants to runtime role | 28 public tables (expected; not all tables are granted in source migrations) |

RLS was **not** weakened.

---

## 9. Prisma / Application Compatibility

| Check | Result |
|---|---|
| `prisma validate` | PASS |
| Expected tables present | PASS |
| Migration-specific env only for target | PASS |
| Production app still on Seoul | PASS |
| Auth users on Mumbai | **0** (Phase 3 not started) |

---

## 10. Test Results

| Suite | Result |
|---|---|
| Storage migration unit tests | **16/16 PASS** (mock-only; no production copy) |

Full IDOR/RLS integration suites against Mumbai were not re-pointed in this phase (would require temporary app env overrides). Core DB RLS objects and claim smoke test passed.

---

## 11. Warnings

1. Supabase CLI/Docker unavailable — used `pg_dump`/`psql` equivalents scoped to `public`.  
2. Platform-managed objects/ACLs skipped on restore (`public` schema exists; `rls_auto_enable`; `supabase_admin` default privileges).  
3. Data restore could not use `session_replication_role=replica` (system trigger permission); FK-ordered dump succeeded.  
4. Private Storage buckets still **not created** (Phase 1 manual follow-up).  
5. `public.users` restored without `auth.users` twins — expected until Phase 3 Auth. Login will not work on Mumbai until Auth migration.  
6. Workstation disk was critically low before Phase 2; npm/pip caches cleaned to free space for artifacts.

---

## 12. Safety Confirmation

| Item | Status |
|---|---|
| SOURCE Seoul | **UNCHANGED** |
| TARGET Mumbai | **DATABASE RESTORED** |
| AUTH | **NOT MIGRATED YET** |
| STORAGE OBJECTS | **NOT MIGRATED YET** |
| APPLICATION | **STILL POINTING TO SEOUL** |
| VERCEL | **UNCHANGED** |
| PRODUCTION | **NOT CUT OVER** |

---

## 13. Remaining Migration Phases

1. **Phase 3 — Auth migration** (`auth.users` + `auth.identities`, password hashes, UUID continuity)  
2. **Phase 4 — Storage** (create private buckets if missing; METHOD B object copy + verify)  
3. **Phase 5 — Staging / Preview soak** on Mumbai  
4. **Phase 6 — Production cutover** (Vercel env + redeploy) — only after GO  

**Phase 3 must NOT start automatically from this report.**

---

## FINAL STATUS

**🟢 PHASE 2 DATABASE MIGRATION — VERIFIED**

**AUTH:** NOT MIGRATED  
**STORAGE OBJECTS:** NOT MIGRATED  
**VERCEL:** UNCHANGED  
**MAIN .env:** UNCHANGED  
**SEOUL:** UNCHANGED  
**CUTOVER:** NOT EXECUTED  

**STOP.**
