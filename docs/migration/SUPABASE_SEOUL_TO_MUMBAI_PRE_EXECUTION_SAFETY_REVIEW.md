# OOS Supabase Seoul → Mumbai
# Pre-Execution Migration Safety Review

**Document type:** PRE-EXECUTION FORENSIC SAFETY REVIEW (READ-ONLY)  
**Date:** 2026-10-01  
**Reviewed plan:** `docs/migration/SUPABASE_SEOUL_TO_MUMBAI_EXECUTION_PLAN.md`  
**Inventory baseline:** `docs/migration/SUPABASE_SEOUL_TO_MUMBAI_MIGRATION_INVENTORY.md`  

**This review is NOT authorization to execute migration.**

---

## MIGRATION EXECUTION

**NOT EXECUTED**

## SOURCE

**SEOUL — UNCHANGED**

## TARGET

**MUMBAI — UNCHANGED**

## PRODUCTION

**UNCHANGED**

---

## 1. Executive Summary

The execution plan’s **overall strategy is aligned with current Supabase-supported within-platform migration** (CLI dump/restore + separate Storage object copy + Vercel env cutover + Seoul retained for rollback). The OOS-critical invariants — especially `auth.users.id === public.users.id`, FORCE RLS / SECURITY DEFINER preservation, and **exact private Storage paths** — are correctly recognized.

However, the plan contains **material inaccuracies and missing controls** that must be corrected before any execution authorization:

1. It incorrectly claims `schema.sql` includes Auth/Storage DDL (CLI **excludes** managed schemas from schema dump).
2. Auth password-hash migration is **plausible via `data.sql`**, but the plan does not require a **pre-restore dump inspection** proving `auth.users` / identities COPY sections exist.
3. `roles.sql` restore is incomplete without official troubleshooting edits and **`oos_app_runtime` LOGIN password** handling.
4. Storage METHOD B is directionally correct (and matches official Supabase Storage migration approach), but the plan ships **no hardened script requirements** for pagination, 50MB/10MB objects, resume, no-rename, no content logging, and Storage RLS export.
5. Bucket/object **metadata dual-path** (DB dump vs API upload) is ambiguous and can cause conflicts.

**Overall approach: salvageable. Current plan text: not execution-ready.**

---

## 2. Overall Verdict

### 🟡 APPROVED AFTER CORRECTIONS

Do **not** execute until §17–§18 corrections are incorporated into the execution plan and human GO is separately issued.

Even after corrections, this review still does **not** authorize execution.

---

## 3. Database Review

### 3.1 Connection model

| Item | Classification | Finding |
|---|---|---|
| Session pooler `:5432` for dump/restore | 🟢 SAFE | Matches Supabase backup-restore docs and ADR-003 (`DIRECT_URL` / session path). |
| Transaction pooler `:6543` for dump/restore | 🔴 DO NOT | Plan correctly forbids this. |
| Source dump as read-only | 🟢 SAFE | Logical dump does not mutate Seoul data. |
| Target restore into empty Mumbai | 🟡 MODIFY FIRST | Empty Supabase projects already contain managed `auth` / `storage` schemas — restore must not recreate platform DDL. |

### 3.2 Dump / restore ordering

| Step | Classification | Finding |
|---|---|---|
| `roles.sql` → `schema.sql` → `SET session_replication_role = replica` → `data.sql` | 🟢 SAFE | Matches official Supabase restore order. |
| `--use-copy --data-only` | 🟢 SAFE | Correct for data fidelity. |
| Exclude `storage.buckets_vectors` / `storage.vector_indexes` | 🟢 SAFE | Matches current official docs. |

### 3.3 What the plan gets wrong about schemas

**Plan claim (incorrect):** schema dump “includes public + auth + storage metadata structures.”

**Repository / CLI truth:**

- `supabase db dump` (schema mode) **excludes Supabase-managed schemas**, including **`auth` and `storage`**.
- Therefore `schema.sql` is primarily **`public` (+ related non-managed objects)** — which is what OOS Prisma DDL needs.
- Auth/Storage **DDL must not be blindly restored** onto Mumbai (already provisioned by platform).

| Item | Classification |
|---|---|
| Blind assumption that schema dump recreates Auth DDL | 🔴 BLOCKER (as written) |
| Using default schema dump for `public` OOS objects | 🟢 SAFE (correct CLI behavior) |
| Expecting Auth tables to be created by `schema.sql` | 🔴 BLOCKER (must correct plan text + procedure) |

### 3.4 Roles restoration

| Item | Classification | Finding |
|---|---|---|
| Dumping custom roles including `oos_app_runtime` | 🟢 SAFE intent | Required by OOS migrations. |
| Restoring `roles.sql` unmodified | 🟡 MODIFY FIRST | Official troubleshooting requires commenting certain `supabase_admin` / `cli_login_postgres` grant lines if present. |
| Custom LOGIN role passwords | 🟡 MODIFY FIRST | Supabase docs: custom LOGIN roles need password reset on target. `oos_app_runtime` is `WITH LOGIN`. |
| Runtime DB user alignment | 🟡 MODIFY FIRST | Specs require Prisma as `oos_app_runtime` (`NOBYPASSRLS`). `.env.example` shows `postgres.[PROJECT_REF]`. Inventory already flagged verification. **Must verify live Seoul `DATABASE_URL` role before cutover and mirror on Mumbai.** |

### 3.5 Preservation expectations (public schema via dump)

| Concern | Classification | Notes |
|---|---|---|
| Foreign keys | 🟢 SAFE | Preserved in schema dump of public. |
| UUIDs unchanged | 🟢 SAFE | Data COPY preserves PK/FK UUIDs. |
| Sequences / defaults | 🟢 SAFE | Included in schema dump for public objects. |
| Indexes / partial indexes | 🟢 SAFE | In schema dump if present in source. |
| Enums | 🟢 SAFE | Public enums from Prisma migrations. |
| Functions / SECURITY DEFINER / search_path | 🟢 SAFE | Present in public migrations → schema dump. |
| Triggers | 🟢 SAFE | Repo migrations: **none found**; none expected. |
| RLS + FORCE RLS + policies | 🟢 SAFE | Encoded in Prisma SQL → schema dump. |
| Grants | 🟡 MODIFY FIRST | CLI docs warn target default privileges may override; may need revoke-default-privileges step before restore. |

### 3.6 Must NOT copy blindly

| Object | Rule |
|---|---|
| Managed `auth` / `storage` platform DDL | Do not recreate types/tables already owned by platform |
| `supabase_admin` ownership alterations | Comment out per official troubleshooting |
| `cli_login_postgres` grants | Comment out if erroring |
| Storage binary bytes | Never via SQL dump |
| Vault root key | N/A for OOS app (see §6) |
| Making buckets public / disabling RLS | Forbidden |

---

## 4. Auth Review

### 4.1 Repository invariant (verified)

From `prisma/schema.prisma` and Phase 1 migration:

```text
public.users.id  (UUID PK, NO default)
        ↑
memberships.userId → users.id
candidates.userId → users.id
candidates.assignedEmployeeId → users.id
audit_events.actorId → users.id
(+ other user FKs)

Application Auth identity: Supabase auth.users.id must equal public.users.id
```

Employees are **not** a separate table; they are `memberships` with `EMPLOYEE` / `ADMIN` roles.

### 4.2 Does dump/restore preserve the invariant?

| Path | Classification | Finding |
|---|---|---|
| Preserve `public.users.id` via data COPY | 🟢 SAFE | Standard. |
| Preserve `auth.users.id` identical | 🟡 MODIFY FIRST | Only if `data.sql` actually contains Auth rows with same UUIDs. Plan asserts this without a mandatory dump-inspection gate. |
| Recreating Auth users via Admin API with new UUIDs | 🔴 DO NOT | Would break all FKs / RLS. Plan correctly forbids this. |
| Migrating only `public.users` | 🔴 DO NOT | Login fails / orphan identities. |

### 4.3 Failure modes if Auth data missing/wrong

- Duplicate email constraints on Auth recreate  
- Missing Auth twin → login impossible  
- New UUID → broken memberships / candidate ownership / RLS `current_user_id()`  
- Partial Auth restore → intermittent login / identity mismatch  

**Required correction:** After dump, **inspect** `data.sql` for `COPY auth.users` (and identities). If absent, add explicit:

```bash
supabase db dump --db-url "$OLD_DB_URL" -f auth_data.sql --use-copy --data-only --schema auth
```

…and restore Auth data into Mumbai’s existing Auth tables under `session_replication_role = replica`, then verify orphan queries.

### 4.4 Password / session safety

| Item | Migrates with proposed method? | Classification |
|---|---|---|
| `encrypted_password` | Yes **if** Auth rows are in data dump | 🟡 MODIFY FIRST (verify dump) |
| Email / confirmation timestamps | Yes if dumped | 🟡 MODIFY FIRST |
| Identities / providers | Yes if dumped | 🟡 MODIFY FIRST |
| `raw_user_meta_data` / app metadata | Yes if dumped | 🟡 MODIFY FIRST |
| Sessions / refresh tokens | May dump, but **useless under JWT Option B** | 🟢 SAFE to treat as discarded |
| MFA factors (if any) | Only if present in dump; repo does not implement MFA UI | 🟡 MODIFY FIRST (inspect Auth tables if MFA ever enabled in dashboard) |

**“Passwords migrate with hashes”** is **conditionally true**, not guaranteed by the current plan wording. It is supported by the official Supabase logical migration path **when Auth data is included in the data dump**, but OOS must **prove** it before restore.

Admin fallback in `src/lib/supabase/admin.ts` writes Auth via SQL/`pgcrypto` when service role fails — confirms Auth rows are normal Postgres rows and dumpable; does **not** replace the need for dump verification.

### 4.5 Custom Auth schema mods in repo

| Item | Finding | Classification |
|---|---|---|
| Custom triggers on `auth.users` in Prisma migrations | None | 🟢 SAFE |
| Custom RLS on `auth` in Prisma migrations | None | 🟢 SAFE |
| Dashboard-only Auth settings | Site URL, redirects, templates | 🟡 MODIFY FIRST — must recreate manually on Mumbai |

---

## 5. JWT Review

### OPTION B (Mumbai native JWT) — plan recommendation

| Concern | Assessment |
|---|---|
| Existing access tokens | Invalid against Mumbai |
| Refresh tokens / Seoul cookies | Invalid for Mumbai Auth API |
| Browser cookies | Bound to prior project signing → must re-auth |
| Forced re-login | **Yes — technically accurate for all users after Production cutover to Mumbai** |
| Anon / service-role API keys | Must change regardless of JWT option |
| App behavior | Correct once env points to Mumbai and users re-login |
| Rollback | Reverting Vercel to Seoul restores Seoul Auth; users who obtained Mumbai sessions must re-login again on Seoul |

### User communication required

- Maintenance window  
- All users must sign in again after cutover  
- Old Seoul signed Storage URLs stop working after cutover  
- If rollback occurs after some users used Mumbai, those users may need to sign in again on Seoul  

### Classification

**🟢 SAFE** (for OOS Free-plan isolation), provided re-login is announced.

Not a blocker. Prefer Option B over Option A.

---

## 6. Vault / Encryption Review

Repository search for Vault / pgsodium / encrypt-decrypt column patterns:

- No Supabase Vault usage in Prisma/migrations/app crypto paths  
- No pgsodium application dependency  
- `pgcrypto` used for UUID/password `crypt()` in admin Auth fallback and extensions — **not** Vault root-key encryption  
- “Document Vault” is UI naming only  

### VERIFIED — NO VAULT/ENCRYPTED-DATA DEPENDENCY FOUND

**Classification:** 🟢 SAFE  

**Residual human check:** Confirm Seoul dashboard has no Vault secrets before execution (plan already notes this).

---

## 7. Storage Review

### 7.1 Repository contracts (verified)

| Bucket | Private | Max size (app) | Path |
|---|---|---:|---|
| `candidate-documents` | Yes (code assumes private + signed URLs) | 50 MB | `tenants/{orgId}/candidates/{candidateId}/documents/{docId}-v{n}-{file}` |
| `submission-evidence` | Yes | 10 MB | `tenants/{orgId}/applications/{applicationId}/submissions/{submissionId}-{file}` |

Canonical validators reject traversal / cross-tenant paths. Paths must remain byte-identical.

### 7.2 METHOD B (Node service-role copy)

| Concern | Classification | Finding |
|---|---|---|
| Aligns with official Supabase Storage migration docs | 🟢 SAFE direction | Official docs provide JS download/upload script |
| Exact path preservation | 🟢 SAFE **if** script forbids rename | Official sample allows `_migrated` rename — **forbidden for OOS** |
| Private buckets / no public URLs | 🟢 SAFE if enforced | Service role download/upload only |
| MIME / size preservation | 🟡 MODIFY FIRST | Must set `contentType` from source metadata; verify sizes |
| Resume / skip-if-same-size | 🟡 MODIFY FIRST | Plan mentions; script not specified |
| Pagination (`list` limits) | 🟡 MODIFY FIRST | Must recurse folders; page beyond 1000 |
| Large files (50MB / 10MB) | 🟡 MODIFY FIRST | Need timeout/retry; memory-safe streams preferred |
| Rate limits / batching | 🟡 MODIFY FIRST | Official sample batches ~10; OOS should keep concurrency bounded |
| Deletion during migrate | 🟢 SAFE as written | Plan forbids source deletes |
| Logging secrets/content | 🟡 MODIFY FIRST | Must ban body logs, keys, signed URLs; path UUID logging should be minimized/redacted in durable logs |
| Script existence | 🔴 BLOCKER (for execution) | Plan has no approved script artifact yet |

### 7.3 Storage policies / metadata

| Item | Classification | Finding |
|---|---|---|
| `storage.buckets` privacy | 🟡 MODIFY FIRST | Create/ensure `public=false`; preserve file size limits if set |
| Storage RLS policies | 🟡 MODIFY FIRST | **Not in Prisma migrations**; plan says “recreate” without export procedure |
| `storage.objects` rows via SQL dump | 🟡 MODIFY FIRST | Ambiguous vs API upload which also inserts rows — pick one metadata path |
| Object bytes | Separate copy required | Correct |

**Missing steps to add:**

1. Export Seoul Storage policies (dashboard SQL / `pg_policies` on storage / CLI diff).  
2. Apply equivalent policies on Mumbai **before** app traffic.  
3. Decide: **API-created metadata during object copy** (preferred with METHOD B) **or** SQL metadata restore — not both without conflict analysis.  
4. Never choose official sample option “rename bucket `_migrated`”.

---

## 8. RLS Review

| Item | Classification | Finding |
|---|---|---|
| FORCE RLS recreation via public schema dump | 🟢 SAFE | Encoded in 15 Prisma migrations present on Seoul |
| SECURITY DEFINER helpers + `search_path` | 🟢 SAFE | Same |
| `withRlsContext` / `request.jwt.claim.sub` | 🟢 SAFE | App-side unchanged |
| No permission redesign in plan | 🟢 SAFE | Correct |
| Runtime role enforcement | 🟡 MODIFY FIRST | Must ensure Mumbai `DATABASE_URL` uses intended NOBYPASSRLS role (`oos_app_runtime` per engineering specs) |

---

## 9. Realtime Review

Verified against `src/lib/realtime/*`:

| Channel | Implementation |
|---|---|
| `candidate:{candidateId}` | `getChannelName` |
| `team:{orgId}:{teamId}` | `getChannelName` |
| `org:{orgId}` | `getChannelName` |

Transport: **Broadcast** event `oos-operational-event` via service role (`publishRealtimeEvent`). Client bus: `RealtimeEventBus` / subscription manager.

| Item | Required? | Classification |
|---|---|---|
| Postgres publication / CDC | **No** for current primary path | 🟢 SAFE |
| Dashboard Realtime enabled | Yes (default usually on) | 🟢 SAFE |
| Service role in server env | Yes | 🟢 SAFE after key swap |
| App code change for region move | **No** | 🟢 SAFE |
| Plan accuracy | Correct | 🟢 SAFE |

---

## 10. Prisma Review

| Approach | Verdict |
|---|---|
| Dump/restore primary (not Prisma-first) | 🟢 SAFE / appropriate for Auth UUID continuity |
| `prisma migrate deploy` **before** full schema restore on same DB | 🔴 DO NOT — duplicate public objects |
| `prisma migrate deploy` **after** successful schema+data restore | 🔴 DO NOT — conflicts if objects exist |
| Rely on dumped `_prisma_migrations` | 🟢 SAFE if present in source dump |
| Inventory’s Prisma-first suggestion | Superseded by execution plan — correct improvement, but must remain explicit |

**Safe relationship:**

```text
Seoul public schema+data (+ Auth data into existing Auth tables)
        ↓
Mumbai has managed auth/storage DDL already
        ↓
Do NOT re-apply Prisma migrations
        ↓
Verify _prisma_migrations == 15 repo migrations
        ↓
Future DDL: prisma migrate deploy against Mumbai DIRECT_URL only
```

If `_prisma_migrations` missing after restore: **stop** — insert history carefully; do not re-run DDL migrations.

---

## 11. Cron Review

| Item | Finding | Classification |
|---|---|---|
| `vercel.json` cron `0 2 * * *` → `/api/cron/rate-limit-cleanup` | Unchanged | 🟢 SAFE |
| Auth via `CRON_SECRET` Bearer | Unchanged | 🟢 SAFE |
| After Production env points to Mumbai | Cron hits app → Prisma → Mumbai `rate_limit_buckets` | 🟢 SAFE |
| Code changes required | None | 🟢 SAFE |

---

## 12. Environment Review

Do not print secrets. Values shown as `<REDACTED>` where secret.

| Variable | Seoul/Mumbai dependent? | Must change? | When? |
|---|---|---|---|
| `DATABASE_URL` | YES | YES | Preview soak → Production cutover |
| `DIRECT_URL` | YES | YES | Same |
| `NEXT_PUBLIC_SUPABASE_URL` | YES | YES | Same (requires redeploy) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | YES | YES `<REDACTED>` | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | YES | YES `<REDACTED>` | Same |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` (aliases in server.ts) | YES if used | YES if present | Same |
| `CRON_SECRET` | NO | OPTIONAL rotate | Any time |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | NO | NO | — |
| `OPERATING_ORGANIZATION_ID` | Data-dependent | NO (keep same UUID) | Verify org exists post-migrate |
| `NEXT_PUBLIC_APP_URL` | NO (app domain) | VERIFY Auth redirects | Before Auth smoke |
| `NODE_ENV` | NO | NO | — |
| OpenAI / Anthropic API keys | **Not used by OOS runtime** | N/A | — |

**Classification:** Env table in plan is largely 🟢 SAFE; add explicit note for optional `SUPABASE_URL` / `SUPABASE_ANON_KEY` aliases.

---

## 13. Vercel Review

| Item | Classification | Finding |
|---|---|---|
| Preview/staging before Production | 🟢 SAFE | Plan includes; must be mandatory not optional |
| Production remains Seoul until GO | 🟢 SAFE | Correct |
| Env change requires redeploy | 🟢 SAFE | Especially public Supabase URL/anon |
| Credentials not committed | 🟢 SAFE | Correct |
| Rollback via env revert | 🟢 SAFE | Correct if Seoul intact |

---

## 14. Rollback Review

| Scenario | Possible? | Notes |
|---|---|---|
| Mumbai DB/Auth/Storage migration failed **before** Production env swap | 🟢 SAFE | Production unaffected |
| After Production swap, revert Vercel to Seoul | 🟢 SAFE | Seoul must remain unmodified |
| JWT Option B after Mumbai login attempts | 🟡 MODIFY FIRST | Rollback forces **another** re-login for users who authenticated on Mumbai |
| Dual-write risk if freeze incomplete | 🟡 MODIFY FIRST | Plan mentions; must treat as hard freeze gate |
| Delete Mumbai on rollback | 🔴 DO NOT | Plan correctly forbids |

Seoul remains authoritative until cutover approval — plan respects this.

---

## 15. Command-by-Command Review

Commands from the execution plan only. **None executed in this review.**

### Dump commands

| Command | Class | Why / correction |
|---|---|---|
| `cd "$MIGRATE_WORKDIR"` | 🟢 SAFE TO EXECUTE | Local only |
| `supabase db dump ... -f roles.sql --role-only` | 🟡 REQUIRES MODIFICATION | Safe to run dump; **before restore**, edit known bad grants; set `oos_app_runtime` password on target |
| `supabase db dump ... -f schema.sql` | 🟡 REQUIRES MODIFICATION | Safe dump; **correct plan text**: does **not** dump Auth/Storage DDL. Inspect output for accidental managed DDL |
| `supabase db dump ... -f data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes` | 🟡 REQUIRES MODIFICATION | Safe dump; **must inspect** for `auth.users` COPY. If missing, add `--schema auth` data dump. Decide Storage metadata inclusion vs METHOD B API metadata |

### Restore command

| Command | Class | Why / correction |
|---|---|---|
| `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "$NEW_DB_URL"` | 🟡 REQUIRES MODIFICATION | Official shape is correct, but: (1) pre-edit `roles.sql`; (2) possibly revoke default privileges; (3) confirm Auth data strategy; (4) do not assume empty managed schemas; (5) verify Session `:5432` URL |

### Implicit / missing commands

| Item | Class | Correction |
|---|---|---|
| `prisma migrate deploy` on Mumbai after dump restore | 🔴 DO NOT EXECUTE | Conflicts |
| Making buckets public | 🔴 DO NOT EXECUTE | Forbidden |
| Official Storage sample “rename `_migrated`” | 🔴 DO NOT EXECUTE | Breaks canonical paths |
| Unspecified Storage copy script | 🔴 DO NOT EXECUTE until written & reviewed | Required artifact |
| Vercel Production env swap before Mumbai PASS | 🔴 DO NOT EXECUTE | Premature cutover |

---

## 16. Correct Migration Order

Safer order than the plan’s narrative (corrections applied):

1. **Backup artifacts** — dump Seoul (read-only) to secure `$MIGRATE_WORKDIR`  
2. **Inspect dumps** — confirm public schema; confirm Auth data present; edit `roles.sql` as needed  
3. **Target preparation** — empty Mumbai `ap-south-1`; enable required extensions (`pgcrypto`); Auth Site URL staging; no Production traffic  
4. **Roles restore** (edited) + set `oos_app_runtime` password if LOGIN used by app  
5. **Public schema restore** via `schema.sql`  
6. **Auth data restore** into existing Auth tables (from `data.sql` and/or `auth_data.sql`)  
7. **Public data restore** under `session_replication_role = replica`  
8. **Verify RLS / FORCE RLS / grants / `_prisma_migrations`**  
9. **Storage buckets** private + **Storage policies** recreated from Seoul export  
10. **Storage objects copy** (METHOD B hardened; exact keys; no rename; no delete on source)  
11. **Realtime** confirm enabled; service role publish works  
12. **Verification** — Auth/identity/RLS/Storage/Realtime/audit/cron suites  
13. **Vercel Preview** → Mumbai  
14. **Performance AFTER measurements** (do not invent)  
15. **Write freeze** + optional delta sync  
16. **Production cutover** (env + redeploy)  
17. **Monitor**  
18. **Rollback readiness** (Seoul untouched; env revert runbook)

---

## 17. Blockers

Must be cleared before any execution authorization:

1. **Correct Auth/Storage dump semantics in the plan** (managed schema exclusion).  
2. **Mandatory Auth data dump inspection / explicit Auth data dump if needed.**  
3. **Approved Storage migration script** with OOS constraints (no rename, private-only, resume, size/MIME verify, no secret/content logs).  
4. **Storage policy export/recreate procedure** (not hand-waved).  
5. **`roles.sql` edit checklist + `oos_app_runtime` / `DATABASE_URL` role verification.**  
6. **Storage metadata strategy** chosen (SQL vs API), conflict-free.  
7. **Human GO** still required after plan corrections (this review is not GO).

---

## 18. Required Corrections

Update `SUPABASE_SEOUL_TO_MUMBAI_EXECUTION_PLAN.md` to:

1. State explicitly: **schema dump excludes managed `auth`/`storage` DDL**; Mumbai already has platform Auth/Storage schemas.  
2. Add **Auth data verification gate** before restore; add fallback `--schema auth` data dump.  
3. Add official **`roles.sql` troubleshooting edits** + custom LOGIN password step for `oos_app_runtime`.  
4. Add **default privileges revoke** consideration per CLI privilege-migration note.  
5. Replace Storage METHOD B sketch with **required script acceptance criteria** (pagination, 50MB/10MB, retries, upsert/skip, integrity report, logging bans, **no bucket rename**).  
6. Add **Storage policy export SQL/dashboard steps**.  
7. Resolve **storage.objects metadata dual-write** ambiguity.  
8. Make **Vercel Preview soak mandatory** before Production.  
9. Expand rollback note: **JWT Option B causes re-login on cutover and again on rollback for Mumbai-authenticated users**.  
10. Keep Prisma rule: **never `migrate deploy` after full public schema restore**.  
11. Require live confirmation of Seoul connection role vs `oos_app_runtime`.

---

## 19. Final Go/No-Go

| Gate | Status |
|---|---|
| Inventory exists | YES |
| Execution plan exists | YES |
| Plan technically accurate as written | **NO — corrections required** |
| Vault dependency | NONE VERIFIED |
| JWT Option B | ACCEPTABLE |
| Auth UUID strategy conceptually sound | YES, pending dump verification gate |
| Storage strategy conceptually sound | YES, pending script + policies |
| Production cutover authorized | **NO** |

### FINAL VERDICT (ORIGINAL)

**🟡 APPROVED AFTER CORRECTIONS**

---

## 20. Remediation Status (2026-10-01)

| Topic | Status | Notes |
|---|---|---|
| 1. Auth password migration | **REMEDIATED IN PLAN** | Explicit `--schema auth` data dump + preflight for `encrypted_password`; if absent → 🔴 BLOCKED |
| 2. Auth UUID preservation | **REMEDIATED IN PLAN** | `auth.users` + `auth.identities` data-only; sessions excluded (JWT B) |
| 3. `oos_app_runtime` | **REMEDIATED IN PLAN** | LOGIN + NOBYPASSRLS; **new password** on target; grants from Prisma migrations; live URL role verify |
| 4. Storage migration script | **REMEDIATED IN ARTIFACTS** | `scripts/migration/supabase-storage-migrate.ts` + core lib; mock tests 16 PASS; not executed |
| 5. Storage policies | **DOCUMENTED — MANUAL** | Not in Prisma; Seoul export → Mumbai recreate; private-only |
| 6. Storage verification | **REMEDIATED IN ARTIFACTS** | `scripts/migration/supabase-storage-verify.ts`; MATCH/MISSING/MISMATCH/EXTRA |
| JWT Option B | **UNCHANGED — 🟢 SAFE** | |
| Vault / encrypted data | **UNCHANGED — NO VAULT/ENCRYPTED-DATA DEPENDENCY FOUND** | |

### Remaining before execution GO

- Live Auth dump inspection (password hash gate) — cannot PASS until authorized dump workstation run  
- Live Seoul `DATABASE_URL` role confirmation  
- Manual Mumbai private buckets + Storage policy parity  
- Human execution authorization  

### UPDATED PLANNING VERDICT

**🟡 APPROVED AFTER CORRECTIONS — PLANNING BLOCKERS REMEDIATED; EXECUTION STILL NOT AUTHORIZED**

Preflight gates in the execution plan remain unevaluated (`PASS`/`BLOCKED` at execution time only).

---

## FINAL STATUS

**MIGRATION EXECUTION:** NOT EXECUTED  

**SOURCE:** SEOUL — UNCHANGED  

**TARGET:** MUMBAI — UNCHANGED  

**PRODUCTION:** UNCHANGED  

**STOP.**
