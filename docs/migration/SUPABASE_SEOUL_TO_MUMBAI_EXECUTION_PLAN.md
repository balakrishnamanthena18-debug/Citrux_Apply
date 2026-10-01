# OOS Supabase Seoul → Mumbai Execution Plan

**Document type:** READ-ONLY EXECUTION RUNBOOK (PLAN ONLY)  
**Date:** 2026-10-01  
**Inventory prerequisite:** `docs/migration/SUPABASE_SEOUL_TO_MUMBAI_MIGRATION_INVENTORY.md`  
**Source:** Production Supabase Free — `ap-northeast-2` (Seoul) — **DO NOT MODIFY**  
**Target:** Empty Supabase Free — `ap-south-1` (Mumbai)  

---

## MIGRATION EXECUTION AUTHORIZATION

**NOT REQUESTED**

## CURRENT STATE

**READ-ONLY PLAN COMPLETE**

This document must not be treated as permission to run dumps, restores, Storage copies, Auth changes, or Vercel cutover.

---

## 1. Executive Summary

Migrate OOS backend infrastructure from Seoul Supabase to Mumbai Supabase so Vercel `bom1` and Postgres share South Asia, while preserving:

- UUID identity invariant: `auth.users.id === public.users.id`
- All `public.*` operational/compliance data
- FORCE RLS + SECURITY DEFINER architecture
- Private Storage objects at **identical paths**
- Realtime broadcast capability
- Rollback via Vercel env reversion to Seoul

**Recommended primary method:** Supabase-supported **logical dump/restore via Supabase CLI + `psql`** for database (roles + schema + data, including Auth), then **separate private Storage object copy** preserving keys, then Auth/Storage dashboard parity, then staging verification, then Vercel Production env cutover.

**Do not** apply Prisma migrations *on top of* a full schema restore (double-DDL conflict).  
**Do not** dump using transaction-mode pooler `:6543`.

**Remediation (2026-10-01):** Auth, `oos_app_runtime`, and Storage METHOD B gaps from the pre-execution safety review are remediated below. Migration remains **NOT AUTHORIZED**.

---

## 1A. PREFLIGHT GATES (MANDATORY)

Migration **must not proceed** until every gate is **PASS**. Gates are evaluated at execution time (this document only defines them).

### AUTH PREFLIGHT GATE

| Check | PASS criteria |
|---|---|
| Managed Auth DDL | Confirm Mumbai already has platform `auth` schema; **do not** restore Auth DDL from `schema.sql` |
| Explicit Auth data dump | Produce `auth_data.sql` via `supabase db dump --data-only --schema auth` (Session `:5432`) |
| Password hash presence | Inspect dump (metadata only): `COPY auth.users` includes `encrypted_password` column with non-null values for password users |
| Identities | Dump includes `auth.identities` rows for email provider linked to same user UUIDs |
| UUID continuity | Sample: every `public.users.id` has matching `auth.users.id` in dump; no UUID rewrite |
| Session tables | `auth.sessions` / `auth.refresh_tokens` / `auth.flow_state` / `auth.one_time_tokens` **excluded or discarded** (JWT Option B) |
| Target compatibility | Spot-check Mumbai Auth table columns accept source COPY (no hard schema mismatch) |
| Duplicate risk | Target Auth empty of production users before restore |

**Gate result:** `PASS` or `BLOCKED`  
If password hashes are absent/unusable in the dump → **🔴 AUTH PASSWORD MIGRATION BLOCKED** — stop. Do not invent workarounds.

### DATABASE ROLE PREFLIGHT GATE

| Check | PASS criteria |
|---|---|
| Role DDL | `oos_app_runtime` created `WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE` (from Prisma Phase 1) |
| Password | **GENERATE NEW RANDOM PASSWORD DURING TARGET CONFIGURATION** — never copy/print Seoul password |
| Grants | Schema/table/function grants match migration SQL (see §3A) |
| Runtime URL | Confirm live Seoul `DATABASE_URL` role (`oos_app_runtime` vs `postgres.*`) and mirror intentionally on Mumbai |
| `roles.sql` edits | Comment known-bad `supabase_admin` / `cli_login_postgres` lines per Supabase troubleshooting before restore |

**Gate result:** `PASS` or `BLOCKED`

### STORAGE PREFLIGHT GATE

| Check | PASS criteria |
|---|---|
| Buckets | Target has private `candidate-documents` and `submission-evidence` (`public=false`) — **manual create first**; scripts do not auto-create |
| Policies | Seoul Storage policies exported/documented and applied on Mumbai (not in Prisma) |
| Scripts | `scripts/migration/supabase-storage-migrate.ts` + `supabase-storage-verify.ts` present; unit tests PASS |
| Safety flags | Copy requires `CONFIRM_STORAGE_MIGRATE=YES`; verify requires `CONFIRM_STORAGE_VERIFY=YES` |
| Path contract | No rename / flatten / regenerate document IDs |
| Credentials | Only `SOURCE_*` / `TARGET_*` env placeholders; never committed |

**Gate result:** `PASS` or `BLOCKED`

**Aggregate:** All three gates **PASS** required before any dump/restore/copy authorization.

---

## 2. Exact Migration Architecture

```
┌─────────────────────────────┐
│ SOURCE (Seoul) PRODUCTION   │
│ ap-northeast-2              │
│ READ-ONLY during migrate    │
└──────────────┬──────────────┘
               │ supabase db dump (Session :5432)
               │   roles.sql / schema.sql / data.sql
               │ + Storage object export/copy
               ▼
┌─────────────────────────────┐
│ ARTIFACTS (local secure)    │
│ Never commit to git         │
└──────────────┬──────────────┘
               │ psql restore + Storage upload
               ▼
┌─────────────────────────────┐
│ TARGET (Mumbai) EMPTY       │
│ ap-south-1                  │
│ Verify → Stage → Cutover    │
└──────────────┬──────────────┘
               │ Vercel env swap (after GO)
               ▼
┌─────────────────────────────┐
│ Vercel Production bom1      │
│ Points to Mumbai            │
│ Seoul retained for rollback │
└─────────────────────────────┘
```

### Placeholders (never real secrets)

| Placeholder | Meaning |
|---|---|
| `$OLD_PROJECT_REF` | Seoul Supabase project reference id |
| `$NEW_PROJECT_REF` | Mumbai Supabase project reference id |
| `$OLD_DB_PASSWORD` | Seoul database password (**REDACTED** in docs) |
| `$NEW_DB_PASSWORD` | Mumbai database password (**REDACTED**) |
| `$OLD_DB_URL` | Seoul **Session pooler** URL port **5432** (or Direct if IPv6/`db.` available) |
| `$NEW_DB_URL` | Mumbai **Session pooler** URL port **5432** (or Direct) |
| `$OLD_SUPABASE_URL` | `https://$OLD_PROJECT_REF.supabase.co` |
| `$NEW_SUPABASE_URL` | `https://$NEW_PROJECT_REF.supabase.co` |
| `$OLD_SERVICE_ROLE_KEY` | Seoul service role (**REDACTED**) |
| `$NEW_SERVICE_ROLE_KEY` | Mumbai service role (**REDACTED**) |
| `$OLD_ANON_KEY` | Seoul anon (**REDACTED**) |
| `$NEW_ANON_KEY` | Mumbai anon (**REDACTED**) |
| `$MIGRATE_WORKDIR` | Local encrypted/secure directory for dump files (not in git) |

**Example shapes only (not real credentials):**

```text
$OLD_DB_URL = postgresql://postgres.$OLD_PROJECT_REF:$OLD_DB_PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
$NEW_DB_URL = postgresql://postgres.$NEW_PROJECT_REF:$NEW_DB_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

**Connection rule (ADR-003 + Supabase docs):**

| Use | Port / mode |
|---|---|
| Dump / restore / DDL | **Session pooler `:5432` or Direct `:5432`** |
| App runtime after cutover | Transaction pooler `:6543` (`DATABASE_URL`) |
| Never for dump/restore | Transaction pooler `:6543` |

---

## 3. Database Procedure

### 3.1 Required tools

| Tool | Purpose |
|---|---|
| Supabase CLI (current stable) | `supabase db dump` |
| Docker Desktop | Required by CLI dump pipeline |
| `psql` (PostgreSQL 15+ / 17 client) | Restore |
| Secure local disk | Hold `roles.sql`, `schema.sql`, `data.sql` |

### 3.2 Pre-flight (source untouched beyond read dump)

1. Confirm Mumbai project empty and region `ap-south-1`.  
2. Enable extensions on Mumbai that Seoul uses (`pgcrypto` at minimum — verify in Seoul dashboard).  
3. If Database Webhooks used in Seoul (OOS repo: **not found**), enable on Mumbai.  
4. Reset/know `$NEW_DB_PASSWORD` via dashboard (do not print).  
5. Create `$MIGRATE_WORKDIR` outside the git repo; ensure `.gitignore` / no commit.

### 3.3 Exact dump commands (SOURCE — read-only dump)

```bash
# Work only in secure local directory
cd "$MIGRATE_WORKDIR"

# 1) Roles only
supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only

# 2) Schema — public / non-managed objects only.
#    CLI EXCLUDES managed auth/storage DDL (platform already has those on Mumbai).
supabase db dump --db-url "$OLD_DB_URL" -f schema.sql

# 3) Data only (COPY format). Exclude vector storage internals per Supabase docs.
#    May include some auth/storage rows depending on CLI version — prefer explicit auth_data.sql (§4).
supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes"

# 4) EXPLICIT Auth data for password UUID migration (required — see AUTH PREFLIGHT)
supabase db dump --db-url "$OLD_DB_URL" -f auth_data.sql --use-copy --data-only --schema auth
```

**What this captures for OOS:**

- `public.*` tables (all Prisma entities) via schema+data  
- `auth.users` / `auth.identities` (and other auth data) via **`auth_data.sql`** — then trim sessions per §4  
- `storage.*` **metadata** may appear in data dump — prefer METHOD B API metadata for objects; do not treat SQL as file bytes  
- Roles/grants including `oos_app_runtime`  
- RLS policies / FORCE RLS / SECURITY DEFINER functions in **public** schema dump  
- `_prisma_migrations` if present in source

**What this does NOT capture:**

- Managed Auth/Storage **DDL** (excluded from schema dump — correct)  
- Storage **file bytes**  
- Dashboard Auth email templates / Site URL settings  
- Vercel env / JWT secrets  

### 3.4 Exact restore commands (TARGET)

Per Supabase “No Vault or column encryption” path (see §6 — OOS has no Vault dependency).

**Before restore:** edit `roles.sql` per Supabase troubleshooting; ensure AUTH PREFLIGHT PASS on `auth_data.sql`.

```bash
cd "$MIGRATE_WORKDIR"

psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file auth_data.sql \
  --file data.sql \
  --dbname "$NEW_DB_URL"
```

If `data.sql` also contains Auth COPY blocks, restore Auth once only (prefer `auth_data.sql`; strip Auth sections from `data.sql`).

Then set new role password (never commit):

```sql
ALTER ROLE oos_app_runtime WITH PASSWORD '<NEW_RANDOM_PASSWORD_NOT_IN_REPO>';
```

### 3.5 Dump / restore order

1. `roles.sql` (edited)  
2. `schema.sql` (public; no managed Auth DDL)  
3. `SET session_replication_role = replica`  
4. `auth_data.sql` (users + identities; sessions discarded)  
5. `data.sql` (public)  

### 3.6 Prisma interaction (critical)

| Approach | Decision for this plan |
|---|---|
| A. Full CLI dump/restore | **PRIMARY** — preserves Auth + public + RLS exactly |
| B. `prisma migrate deploy` on empty Mumbai then data-only import | Alternate / fallback only |

**Do not** run `prisma migrate deploy` after a successful full `schema.sql` restore — duplicate objects / migration conflicts.

**After restore:** Verify `_prisma_migrations` rows match repo’s 15 migrations. If missing, **do not** blindly re-apply; reconcile carefully in a later controlled step.

### 3.7 Source safety

- Dump is read-only.  
- **Do not** pause/delete Seoul.  
- Prefer dump during low traffic; optional short write freeze only at final cutover delta (§16).

---

## 4. Auth Procedure (REMEDIATED)

### 4.1 Invariant

```text
auth.users.id === public.users.id === memberships.userId (and all FKs)
```

Broken UUIDs = total auth/RLS failure. Employees are memberships with staff roles (no separate `employees` table).

### 4.2 What Auth objects OOS actually needs

| Auth object | Migrate? | Reason |
|---|---|---|
| `auth.users` | **YES (data only)** | UUID, email, `email_confirmed_at`, `encrypted_password`, metadata, timestamps |
| `auth.identities` | **YES (data only)** | Email/password login identity rows must match user UUIDs |
| `auth.sessions` | **NO** | JWT Option B — sessions invalid; discard |
| `auth.refresh_tokens` | **NO** | JWT Option B — discard |
| `auth.mfa_factors` | **ONLY IF present in source** | Repo has no MFA UI; inspect dump; migrate only if rows exist and columns compatible |
| `auth.flow_state` | **NO** | Ephemeral Auth flows |
| `auth.one_time_tokens` | **NO** | Ephemeral; password-reset tokens should be re-issued |
| `auth.instances` / platform config tables | **NO** | Target-managed |
| Auth DDL / types / functions | **NO** | Platform-managed on Mumbai; schema dump excludes managed Auth DDL |

### 4.3 Exact Auth migration method (data into existing Auth schema)

**Do not rely on default `schema.sql` for Auth.** CLI schema dump **excludes** managed `auth` DDL.

```bash
# Public schema/data (unchanged high-level flow)
supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes"

# EXPLICIT Auth data (required)
supabase db dump --db-url "$OLD_DB_URL" -f auth_data.sql --use-copy --data-only --schema auth
```

**AUTH PREFLIGHT (before restore):**

1. Confirm `auth_data.sql` contains `COPY auth.users` (or equivalent) including **`encrypted_password`**.  
2. Confirm non-empty password hashes for password-based users (inspect counts only; do not print hashes).  
3. Confirm `auth.identities` present and user_id values match `auth.users.id`.  
4. Strip/ignore COPY blocks for sessions/refresh_tokens/flow_state/one_time_tokens (or leave unrestored).  
5. If `encrypted_password` missing/unusable → **🔴 AUTH PASSWORD MIGRATION BLOCKED** — STOP.

**Restore order (target):**

1. Edited `roles.sql`  
2. `schema.sql` (public)  
3. `SET session_replication_role = replica`  
4. `auth_data.sql` (users + identities only as preflighted)  
5. `data.sql` (public data; if it also contains auth rows, skip duplicate Auth COPY to avoid conflicts)

### 4.4 What MUST NOT be done

| Forbidden | Why |
|---|---|
| Recreate users with new UUIDs | Breaks `public.users` FKs / RLS |
| Re-hash passwords in app code | Breaks Auth |
| Copy only `public.users` | Login impossible |
| Migrate sessions to “keep users logged in” under JWT B | Useless / misleading |
| Print password hashes / JWT / service keys | Security violation |
| Disable RLS for migrate | Forbidden |

### 4.5 Custom Auth schema modifications in OOS

| Item | Finding |
|---|---|
| Custom triggers on `auth.users` in Prisma migrations | **None** |
| Custom RLS on `auth` in Prisma migrations | **None** |
| App writes to `auth.users` | Yes — `src/lib/supabase/admin.ts` (Admin API preferred; SQL/`pgcrypto` fallback) |

### 4.6 Post-Auth restore checklist

1. Counts: `auth.users` vs `public.users`  
2. Orphan SQL (see §14)  
3. Password login for CANDIDATE / EMPLOYEE / ADMIN  
4. Mumbai Auth Site URL + redirect allow-list  
5. Email templates if needed (app SMTP remains Nodemailer)

### 4.7 Sessions (JWT Option B)

All existing Seoul sessions invalid after cutover. Users re-login with **same passwords** if Auth hash preflight PASSes.

---

## 3A. Database Role Procedure (REMEDIATED) — `oos_app_runtime`

### Role definition (from `prisma/migrations/20260924000000_phase1_identity_rbac/migration.sql`)

```sql
CREATE ROLE oos_app_runtime WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO oos_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oos_app_runtime;
-- Plus per-migration table/function GRANTs (see Prisma migrations)
```

| Attribute | Value |
|---|---|
| LOGIN | **YES** |
| SUPERUSER | NO |
| BYPASSRLS | **NO** (required for FORCE RLS) |
| Password | **B — intentionally recreated with a NEW password** |
| Password handling | **GENERATE NEW RANDOM PASSWORD DURING TARGET CONFIGURATION** — never copy/print Seoul password; never commit |

### Grants required (summary)

- `USAGE` on `public`  
- Table DML grants as created across 15 migrations (`oos_app_runtime`; some also `authenticated`)  
- `EXECUTE` on SECURITY DEFINER helpers (`current_user_id`, org/candidate/application/task helpers, etc.)  
- No sequence grants explicitly in migrations (UUID defaults via `gen_random_uuid()`)  

### Connection URLs

| URL | Intent |
|---|---|
| `DATABASE_URL` (`:6543`) | Runtime Prisma — engineering specs require `oos_app_runtime` |
| `DIRECT_URL` (`:5432`) | Migrations / admin SQL |

**Preflight:** Verify live Seoul connection role; configure Mumbai identically. If Seoul currently uses `postgres.[ref]` contrary to specs, **do not silently “fix” during migration** — document findings and get human decision before cutover.

### `roles.sql` restore caution

Before applying `roles.sql` to Mumbai, apply Supabase troubleshooting edits (comment `OWNER TO supabase_admin` / bad `cli_login_postgres` grants if present). Then:

```sql
ALTER ROLE oos_app_runtime WITH PASSWORD '<NEW_RANDOM_PASSWORD_NOT_IN_REPO>';
```

(Password supplied only via secure local/ops channel.)

---

## 5. JWT Decision

### OPTION A — Reuse old JWT secret in Mumbai

| Aspect | Effect |
|---|---|
| Existing sessions | May remain valid if secret + issuer assumptions align (often still break on project URL/ref change) |
| User login | Possibly seamless; still fragile |
| Security | Couples two projects’ crypto; harder rotation; Free-plan custom JWT may be unsupported/limited |
| API keys | Anon/service keys still **new** per project — must rotate in Vercel regardless |
| Complexity | High (dashboard support, secret handling, verification ambiguity) |
| Rollback | Confusing session validity across projects |

### OPTION B — Use Mumbai project’s native JWT secret

| Aspect | Effect |
|---|---|
| Existing sessions | **Invalid** — users must sign in again |
| User login | Clean; passwords unchanged if Auth data migrated |
| Security | Standard isolation; no secret sharing |
| API keys | Naturally new; replace in Vercel |
| Complexity | Low |
| Rollback | Clear: revert Vercel env → Seoul sessions may still work for users who didn’t migrate mid-flight |

### RECOMMENDED: **OPTION B**

**Why for OOS:**

1. Cutover already requires new `NEXT_PUBLIC_SUPABASE_URL` + anon/service keys.  
2. Free-plan JWT reuse is operationally unreliable.  
3. Forced re-login is acceptable for a region migration maintenance window.  
4. Cleaner security boundary and rollback story.  
5. Auth **password hashes** still migrate via dump — users keep passwords; only sessions reset.

**Never print JWT secrets.**

---

## 6. Encryption / Vault Decision

Repository inspection:

- No Supabase Vault usage in application schema/migrations  
- No `pgsodium` / encrypted column patterns in Prisma  
- `pgcrypto` used for `gen_random_uuid` / admin password `crypt()` fallbacks — standard, not Vault root-key encryption  
- “Document vault” in UI is product naming, not Supabase Vault  

### NO VAULT/ENCRYPTED-DATA DEPENDENCY FOUND

Therefore: use the Supabase restore path **without** root encryption key transfer.

If a future dashboard check finds Vault secrets in Seoul, **STOP** and follow Supabase Vault key migration before data use — not currently indicated by OOS code.

---

## 7. Prisma Procedure

### Safe order (aligned with §3)

1. **Do not** initialize Mumbai via `prisma migrate deploy` if using full CLI schema restore.  
2. Restore `roles.sql` → `schema.sql` → `data.sql` from Seoul.  
3. Confirm `_prisma_migrations` present and matches 15 repo migrations.  
4. Future schema changes: continue using Prisma migrations against Mumbai `DIRECT_URL` **after** cutover.  

### Conflict avoidance

| Schema | Prisma migrations touch? | Dump/restore? |
|---|---|---|
| `public` | YES | YES |
| `auth` | NO (except admin runtime SQL) | YES via CLI dump |
| `storage` | NO DDL in Prisma | Metadata YES via dump; binaries separate |
| `realtime` | NO | As included by CLI |

**Do not** apply Prisma SQL that creates `auth`/`storage` objects.

---

## 8. RLS Procedure

### Goal

Preserve authorization architecture **exactly** — no redesign, no weakening.

### How it is preserved

Full `schema.sql` restore recreates:

- `ENABLE` / `FORCE ROW LEVEL SECURITY`  
- All `CREATE POLICY` statements  
- SECURITY DEFINER helpers + `search_path`  
- Grants to `oos_app_runtime`  
- `current_user_id()` / `request.jwt.claim.sub` pattern  

### Application runtime (unchanged)

`withRlsContext()` continues:

```text
BEGIN → set_config('request.jwt.claim.sub', userId, true) → queries → COMMIT
```

### Verification order after restore

1. Confirm FORCE RLS flags on core tables.  
2. Run repo security suites (RLS/IDOR/auth-negative).  
3. Manual role probes (candidate/employee/admin).  

**No permission redesign in this migration.**

---

## 9. Storage Procedure (REMEDIATED)

### Buckets (must exist, private) — MANUAL TARGET PREP

| Bucket | Public | Path contract |
|---|---|---|
| `candidate-documents` | **false** | `tenants/{orgId}/candidates/{candidateId}/documents/{docId}-v{n}-{file}` |
| `submission-evidence` | **false** | `tenants/{orgId}/applications/{applicationId}/submissions/{submissionId}-{file}` |

**Scripts do NOT auto-create buckets.** If missing → output `TARGET BUCKET REQUIRED` and stop that bucket.

### Storage policies (NOT in Prisma migrations)

Policies **cannot** be recreated from repository SQL. Manual Mumbai configuration required, matching Seoul dashboard:

| Policy intent | `candidate-documents` | `submission-evidence` |
|---|---|---|
| Bucket privacy | `public=false` | `public=false` |
| Upload | Server signed upload after app authz | Staff signed upload after app authz |
| Download/View | Signed URLs only; never public | Staff signed URLs only; candidates denied by app |
| Delete | Authorized app paths only | Staff-only via app |
| Path isolation | Canonical tenant paths enforced in app (`isCanonicalCandidateDocumentPath`) | Deterministic tenant paths in app |

**Preflight:** Export Seoul Storage policies from dashboard / `pg_policies` on `storage.objects` / `storage.buckets` and recreate equivalently on Mumbai. Do not weaken. Do not make public.

### Preferred metadata path

METHOD B API upload creates `storage.objects` rows. Prefer **API metadata** during object copy. Avoid double-inserting Storage metadata from SQL dump unless conflict analysis is complete.

### Exact procedure (A–O)

| Step | Action |
|---|---|
| A Create buckets | **Manual** on Mumbai; exact names; before script |
| B Private status | `public = false` |
| C Policies | Manual recreate from Seoul export |
| D Copy objects | `scripts/migration/supabase-storage-migrate.ts` |
| E Paths | Exact keys; no rename |
| F–H Counts/sizes/MIME | Manifest + verify script |
| I–J Path spot-checks | Against `candidate_documents.storagePath` / `application_submissions.storagePath` |
| K–O Signed URL flows | App-level after env points to Mumbai staging |

---

## 10. Storage Copy Method (REMEDIATED — METHOD B)

### Artifacts (NOT EXECUTED)

| File | Purpose |
|---|---|
| `scripts/migration/supabase-storage-migrate.ts` | Service-role copy CLI |
| `scripts/migration/supabase-storage-verify.ts` | Metadata integrity compare |
| `scripts/migration/lib/storage-migrate-core.ts` | Pure logic (mock-tested) |
| `scripts/migration/lib/supabase-storage-adapter.ts` | Supabase adapter (no delete API) |
| `tests/unit/migration/supabase-storage-migrate.test.ts` | Mock-only tests (16 PASS) |

### Env placeholders

```text
SOURCE_SUPABASE_URL
SOURCE_SUPABASE_SERVICE_ROLE_KEY
TARGET_SUPABASE_URL
TARGET_SUPABASE_SERVICE_ROLE_KEY
CONFIRM_STORAGE_MIGRATE=YES   # migrate only
CONFIRM_STORAGE_VERIFY=YES    # verify only
```

### Behavior guarantees

- Enumerates `candidate-documents` + `submission-evidence`  
- Refuses public buckets  
- Does not create buckets  
- Does not delete/modify source  
- Idempotent skip when size (+ MIME when known) match  
- Upsert only when missing/mismatch  
- Manifest: path, sizes, content type, status  
- No body / signed URL / credential logging  
- Supports 50MB candidate docs / 10MB evidence via byte copy (no public URLs)

### RECOMMENDED: METHOD B (unchanged)

Official Supabase Storage migration approach adapted for OOS path/privacy constraints.

---

## 11. Realtime Procedure

### App behavior

- Channels: `candidate:{id}`, `team:{org}:{teamId}`, `org:{orgId}`  
- Transport: Supabase **Broadcast** event `oos-operational-event`  
- Publish: service role (`publishRealtimeEvent`)  
- Subscribe: browser client via `RealtimeSubscriptionManager`

### Not required from repo

- Postgres publication / CDC table config (not used as primary path)

### Mumbai configuration checklist

1. Realtime enabled on project (default usually on).  
2. Ensure Broadcast allowed for authenticated/service clients per dashboard defaults.  
3. Place `$NEW_SERVICE_ROLE_KEY` in server env for publish.  
4. No application code change for region move.

### Verification

1. Login as employee + candidate.  
2. Send message → notification path.  
3. Confirm bell refresh (realtime and/or fallback poll).  
4. Confirm no cross-tenant channel leakage (channel naming + client filters).

---

## 12. Cron Procedure

| Item | Change needed? |
|---|---|
| `vercel.json` schedule `0 2 * * *` | **No** |
| Route `/api/cron/rate-limit-cleanup` | **No code change** |
| `CRON_SECRET` | Keep or rotate; not region-specific |
| After Vercel points to Mumbai DB | Cron automatically cleans Mumbai `rate_limit_buckets` |

**Cron can remain unchanged** after Production env switch.

---

## 13. Environment Variable Procedure

Never print secrets — use `<REDACTED>`.

| Variable | Current Source | Target Value | Change Required | When |
|---|---|---|---|---|
| `DATABASE_URL` | Seoul `:6543` pooler | Mumbai `:6543` pooler | YES | Production cutover (+ Preview/staging earlier) |
| `DIRECT_URL` | Seoul `:5432` | Mumbai `:5432` | YES | Same |
| `NEXT_PUBLIC_SUPABASE_URL` | `$OLD_SUPABASE_URL` | `$NEW_SUPABASE_URL` | YES | Same (requires redeploy) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Seoul anon | Mumbai anon `<REDACTED>` | YES | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | Seoul `<REDACTED>` | Mumbai `<REDACTED>` | YES | Same |
| `CRON_SECRET` | Vercel `<REDACTED>` | Same or rotated `<REDACTED>` | OPTIONAL | Any time |
| `SMTP_*` / `EMAIL_FROM` | SMTP provider | Unchanged | NO | — |
| `OPERATING_ORGANIZATION_ID` | Org UUID | **Same UUID** after data migrate | NO (keep) | Verify exists in Mumbai |
| `NEXT_PUBLIC_APP_URL` | Production URL | Same production URL | VERIFY | Auth redirects |
| `NODE_ENV` | production | production | NO | — |

### Environment separation

| Env | Action |
|---|---|
| Local `.env` | Point to Mumbai **only** on migration workstation; never commit |
| Vercel Preview | Optional early switch for soak testing |
| Vercel Production | Switch **last**, after GO checklist |

---

## 14. Verification Procedures

### AUTH

- [ ] Candidate / Employee / Admin password login  
- [ ] Logout  
- [ ] Session refresh / cookie SSR  
- [ ] Password reset request + completion  
- [ ] Staff activation (if tokens still valid)

### IDENTITY

```sql
-- Orphans
SELECT u.id FROM public.users u
LEFT JOIN auth.users a ON a.id = u.id
WHERE a.id IS NULL;

SELECT a.id FROM auth.users a
LEFT JOIN public.users u ON u.id = a.id
WHERE u.id IS NULL;

-- Role preservation sample
SELECT m.role, COUNT(*) FROM public.memberships m GROUP BY m.role ORDER BY 1;
```

### DATABASE

Run count matrix (§15) source vs target.  
Verify FKs, enums, critical indexes exist.

### RLS (manual + automated)

- [ ] Candidate cannot read another candidate  
- [ ] Employee cannot cross org  
- [ ] Admin org scope  
- [ ] Task / application / notification / document ownership  
- [ ] Run: existing `tests/integration/*rls*`, IDOR matrix, auth-negative suites against Mumbai-backed staging

### STORAGE

- [ ] Buckets exist, private  
- [ ] Object key parity  
- [ ] Signed view/download/upload/delete  
- [ ] Canonical path validator rejects traversal  

### REALTIME

- [ ] Candidate ↔ employee message notification path  
- [ ] Optional task/application event publish if used  

### AUDIT

- [ ] Historical `audit_events` counts match  
- [ ] New login/action writes new audit row  

### RATE LIMITING

- [ ] Table + unique `key_hash` index  
- [ ] Manual authorized cron hit returns 200  
- [ ] Failed auth increments bucket  

---

## 15. Data Integrity Checks (SQL templates)

**Do not invent counts.** Fill at execution time.

```sql
-- Run on SOURCE and TARGET; compare. Do not invent counts.
SELECT 'auth.users' AS entity, COUNT(*) AS n FROM auth.users
UNION ALL SELECT 'public.users', COUNT(*) FROM public.users
UNION ALL SELECT 'organizations', COUNT(*) FROM public.organizations
UNION ALL SELECT 'memberships', COUNT(*) FROM public.memberships
UNION ALL SELECT 'designations', COUNT(*) FROM public.designations
UNION ALL SELECT 'staff_activation_tokens', COUNT(*) FROM public.staff_activation_tokens
UNION ALL SELECT 'task_governance_policies', COUNT(*) FROM public.task_governance_policies
UNION ALL SELECT 'candidates', COUNT(*) FROM public.candidates
UNION ALL SELECT 'candidate_experiences', COUNT(*) FROM public.candidate_experiences
UNION ALL SELECT 'candidate_educations', COUNT(*) FROM public.candidate_educations
UNION ALL SELECT 'candidate_skills', COUNT(*) FROM public.candidate_skills
UNION ALL SELECT 'candidate_projects', COUNT(*) FROM public.candidate_projects
UNION ALL SELECT 'candidate_certifications', COUNT(*) FROM public.candidate_certifications
UNION ALL SELECT 'candidate_documents', COUNT(*) FROM public.candidate_documents
UNION ALL SELECT 'jobs', COUNT(*) FROM public.jobs
UNION ALL SELECT 'applications', COUNT(*) FROM public.applications
UNION ALL SELECT 'application_materials', COUNT(*) FROM public.application_materials
UNION ALL SELECT 'application_submissions', COUNT(*) FROM public.application_submissions
UNION ALL SELECT 'application_state_history', COUNT(*) FROM public.application_state_history
UNION ALL SELECT 'application_qa_reviews', COUNT(*) FROM public.application_qa_reviews
UNION ALL SELECT 'application_qa_checklists', COUNT(*) FROM public.application_qa_checklists
UNION ALL SELECT 'tasks', COUNT(*) FROM public.tasks
UNION ALL SELECT 'task_checklist_items', COUNT(*) FROM public.task_checklist_items
UNION ALL SELECT 'task_state_history', COUNT(*) FROM public.task_state_history
UNION ALL SELECT 'conversations', COUNT(*) FROM public.conversations
UNION ALL SELECT 'messages', COUNT(*) FROM public.messages
UNION ALL SELECT 'internal_notes', COUNT(*) FROM public.internal_notes
UNION ALL SELECT 'notifications', COUNT(*) FROM public.notifications
UNION ALL SELECT 'email_delivery_logs', COUNT(*) FROM public.email_delivery_logs
UNION ALL SELECT 'privacy_requests', COUNT(*) FROM public.privacy_requests
UNION ALL SELECT 'audit_events', COUNT(*) FROM public.audit_events
UNION ALL SELECT 'rate_limit_buckets', COUNT(*) FROM public.rate_limit_buckets
ORDER BY 1;
```

| Entity | SOURCE COUNT | TARGET COUNT | MATCH |
|---|---:|---:|---|
| auth.users | _TBD_ | _TBD_ | |
| public.users | _TBD_ | _TBD_ | |
| organizations | _TBD_ | _TBD_ | |
| memberships | _TBD_ | _TBD_ | |
| candidates | _TBD_ | _TBD_ | |
| candidate_documents | _TBD_ | _TBD_ | |
| jobs | _TBD_ | _TBD_ | |
| applications | _TBD_ | _TBD_ | |
| application_state_history | _TBD_ | _TBD_ | |
| application_submissions | _TBD_ | _TBD_ | |
| application_qa_reviews | _TBD_ | _TBD_ | |
| tasks | _TBD_ | _TBD_ | |
| task_checklist_items | _TBD_ | _TBD_ | |
| conversations | _TBD_ | _TBD_ | |
| messages | _TBD_ | _TBD_ | |
| notifications | _TBD_ | _TBD_ | |
| audit_events | _TBD_ | _TBD_ | |
| rate_limit_buckets | _TBD_ | _TBD_ | |
| _(remaining public tables from query)_ | _TBD_ | _TBD_ | |

**Note:** No separate `employees` / `submission_evidence` tables — employees are `memberships` with staff roles; evidence binaries live in Storage bucket `submission-evidence` with metadata on `application_submissions.storagePath`.
---

## 16. Storage Integrity Check (plan for future script)

Compare listings (metadata only; **no file body logging**):

| Field | Compare |
|---|---|
| bucket | equal |
| object path/key | equal |
| size | equal |
| contentType / MIME | equal |

Detect: missing, extra, duplicate key, wrong size, wrong MIME, wrong path.

Output report: `storage_integrity_report.json` locally — **not committed** if it contains paths considered sensitive in your policy (paths include org/candidate UUIDs).

---

## 17. Performance Benchmark

### BEFORE (known)

| Metric | Seoul |
|---|---:|
| Vercel region | bom1 |
| Supabase region | ap-northeast-2 |
| DB statement RTT | ~120–140ms |
| Applications dual-txn mimic | ~2.7s |
| Admin page txn mimic | ~3.3s |
| Sidebar nav T2U (user) | ~5s |

### AFTER (fill only after measurement)

| Metric | Seoul | Mumbai | Improvement |
|---|---:|---:|---:|
| DB statement RTT | ~120–140ms | NOT MEASURED | — |
| Applications dual-txn | ~2.7s | NOT MEASURED | — |
| Admin page txn | ~3.3s | NOT MEASURED | — |
| Sidebar nav T2U | ~5s | NOT MEASURED | — |

**Do not invent Mumbai numbers.**

---

## 18. Cutover Procedure

1. Seoul remains production; Mumbai migration completed offline.  
2. Mumbai DB restore verified (counts, orphans, RLS flags).  
3. Storage object copy + integrity report PASS.  
4. Auth login matrix PASS.  
5. Realtime smoke PASS.  
6. Security test suites PASS against Mumbai staging env.  
7. Performance benchmark recorded (Mumbai columns).  
8. Production readiness review / GO decision.  
9. **Short write freeze** on production (announce).  
10. **Final delta sync** (recommended): re-dump `--data-only` for high-churn tables **or** full data re-dump if freeze allows; re-copy Storage objects modified since first copy (by `updated_at` / list diff).  
11. Update **Vercel Production** env to Mumbai placeholders (no secret printing).  
12. Redeploy Production.  
13. Smoke: login all roles, one document view, one message, cron auth check, admin dashboard load.  
14. Monitor errors 24–72h.  
15. Keep Seoul **read-only available** for rollback soak period.  
16. Seoul decommission = **separate future approval**.

### Is final delta sync required?

**YES, recommended** if any production writes occur between first dump and cutover. With a true freeze from first dump → cutover, a single dump may suffice — still verify Storage diffs.

---

## 19. Rollback Procedure

### ROLLBACK TRIGGERS

- Login failure across roles  
- RLS/authorization regressions  
- Missing critical rows or Storage objects  
- Realtime total failure with unacceptable product impact  
- Severe performance regression vs Seoul baseline  
- Data corruption indicators  

### Rollback steps

```text
Mumbai (leave intact)
   ↓
Revert Vercel Production env → Seoul values
   ↓
Redeploy
   ↓
Smoke test Seoul
```

- **Do not delete Mumbai** during rollback.  
- **Do not modify Seoul** during rollback.  
- Communicate possible double-write risk if Mumbai received writes during failed cutover.

---

## 20. Security Controls

**Prohibited:**

- Printing or committing secrets / `.env`  
- Exposing service role or JWT secrets  
- Disabling RLS / FORCE RLS  
- Making private buckets public  
- Copying documents via public URLs  
- Weakening authorization “temporarily”  
- Putting production secrets in client bundles  

**Required:**

- Credentials only via local env / Vercel encrypted env  
- Dump files outside git; destroy securely after soak  
- Service role only on server for Storage copy  

---

## 21. Known Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Auth UUID drift | Total outage | Dump/restore Auth+public together; orphan SQL |
| Storage path mismatch | Broken docs/evidence | Key-preserving copy + integrity script |
| Dual schema apply (Prisma + dump) | Restore failure | Use one DDL path |
| Free plan limits | Dump/restore/storage quotas | Pre-check sizes |
| Session reset (JWT B) | User friction | Announce re-login |
| Write during migrate | Data loss/skew | Freeze + delta sync |
| Connection via `:6543` for dump | Corrupt/incomplete dump | Session `:5432` only |

---

## 22. Blockers (before execution authorization)

1. Explicit human **GO** to execute (this doc is not GO).  
2. Storage copy script/tooling approved.  
3. Maintenance window + user communication for re-login.  
4. Confirmed Mumbai empty + region `ap-south-1`.  
5. Secure workstation with CLI/Docker/`psql`.  
6. Live SOURCE/TARGET counts captured at execution time.

---

## 23. Final Go/No-Go Checklist

| Gate | Status |
|---|---|
| Inventory reviewed | YES (prior doc) |
| Execution plan reviewed | THIS DOC |
| Secrets handling agreed | REQUIRED |
| JWT strategy accepted (Option B) | PENDING HUMAN |
| Vault N/A confirmed on dashboard | PENDING HUMAN |
| Dump/restore dry-run on non-prod | PENDING |
| Storage integrity method approved | PENDING |
| Staging Vercel verification | PENDING |
| Performance AFTER measured | PENDING |
| Rollback drill understood | YES (plan) |
| **Authorize production cutover** | **NO — NOT REQUESTED** |

---

## FINAL STATUS

**MIGRATION EXECUTION AUTHORIZATION:** NOT REQUESTED  

**CURRENT STATE:** READ-ONLY PLAN COMPLETE + BLOCKER REMEDIATION ARTIFACTS ADDED  

**PREFLIGHT GATES:** Defined — Auth / Role / Storage — must be PASS before any future GO  

**STOP.**

Do not execute migration commands.  
Do not modify production.  
Do not modify either Supabase project.  
Do not modify Vercel.
