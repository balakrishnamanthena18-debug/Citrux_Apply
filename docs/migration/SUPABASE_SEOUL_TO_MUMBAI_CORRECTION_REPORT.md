# Correction Report

**OOS Supabase Seoul → Mumbai — Pre-Execution Blocker Remediation**  
**Date:** 2026-10-01  

**MIGRATION EXECUTION:** NOT EXECUTED  
**SEOUL:** UNCHANGED  
**MUMBAI:** UNCHANGED  
**VERCEL:** UNCHANGED  
**PRODUCTION:** UNCHANGED  

---

## 1. Auth Remediation

### Finding

Default `supabase db dump` **schema** mode excludes managed `auth` / `storage` DDL. The prior plan incorrectly implied Auth DDL arrived via `schema.sql`.

### Correction

Execution plan §4 now specifies:

1. Public dump/restore as before (`roles` / `schema` / `data`).  
2. **Explicit** Auth data dump:

```bash
supabase db dump --db-url "$OLD_DB_URL" -f auth_data.sql --use-copy --data-only --schema auth
```

3. Migrate **data only** into Mumbai’s existing Auth schema.  
4. **AUTH PREFLIGHT GATE** must PASS before restore.

### Auth object classification (OOS-specific)

| Object | Action |
|---|---|
| `auth.users` | Migrate (UUID, email, confirmation, `encrypted_password`, metadata) |
| `auth.identities` | Migrate (email provider linkage) |
| `auth.sessions` / `refresh_tokens` / `flow_state` / `one_time_tokens` | Do **not** rely on / discard (JWT Option B) |
| `auth.mfa_factors` | Only if present and compatible |
| Auth DDL / config | Target-managed — do not restore |

---

## 2. Auth UUID Verification

Invariant verified in repository:

- `public.users.id` has **no** `DEFAULT gen_random_uuid()`  
- Comment in Prisma: matches Supabase `auth.users.id`  
- FKs: `memberships.userId`, `candidates.userId`, assignments, audit actors, etc.

Migration preserves UUIDs by **COPY of Auth + public rows without ID rewrite**.  
Orphan SQL remains mandatory post-restore.

---

## 3. Password Hash Migration Verification

| Item | Status |
|---|---|
| Supported method | Logical dump of `auth.users.encrypted_password` into target Auth |
| App confirmation | `admin.ts` reads/writes `encrypted_password` via `crypt()` / Admin API |
| Preflight | Dump **must** be inspected for non-null password hashes |
| If hashes absent | **🔴 AUTH PASSWORD MIGRATION BLOCKED** — no invented workaround |
| Sessions | Not preserved (JWT B) — passwords still required for re-login |

**Planning status:** Procedure defined. Live dump inspection = execution-time gate (not run).

---

## 4. JWT Option B

**UNCHANGED — 🟢 SAFE**

- Mumbai native JWT secret  
- All users re-login after Production cutover  
- Rollback may force re-login again for users who authenticated on Mumbai  
- Anon/service keys still rotate with project switch  

---

## 5. Database Role Remediation

| Topic | Correction |
|---|---|
| `roles.sql` | Edit known Supabase troubleshooting lines before restore |
| Custom LOGIN roles | Password must be set on target |
| Default privileges | Consider revoke-default-privileges before restore per CLI docs |
| Gate | **DATABASE ROLE PREFLIGHT GATE** added to execution plan |

---

## 6. `oos_app_runtime`

| Attribute | Value |
|---|---|
| Created in | Phase 1 Prisma migration |
| Flags | `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE` |
| Password strategy | **B — GENERATE NEW RANDOM PASSWORD DURING TARGET CONFIGURATION** |
| Never | Copy/print/commit Seoul role password |
| Grants | `USAGE` on `public`; table DML; `EXECUTE` on SECURITY DEFINER helpers (per migrations) |
| Sequences | No explicit sequence grants in migrations (UUID defaults) |
| Prisma | Specs require runtime via `oos_app_runtime`; `.env.example` shows `postgres.[ref]` — **live Seoul role must be verified** before cutover (human decision if mismatch) |

---

## 7. Storage Migration Design

### METHOD B artifacts (created, not executed)

| Path | Role |
|---|---|
| `scripts/migration/supabase-storage-migrate.ts` | CLI copy |
| `scripts/migration/supabase-storage-verify.ts` | CLI verify |
| `scripts/migration/lib/storage-migrate-core.ts` | Pure logic |
| `scripts/migration/lib/supabase-storage-adapter.ts` | Supabase adapter (no delete) |
| `scripts/migration/lib/storage-types.ts` | Types / expected buckets |
| `tests/unit/migration/supabase-storage-migrate.test.ts` | Mock-only — **16 PASS** |

### Guarantees

- Env: `SOURCE_SUPABASE_*` / `TARGET_SUPABASE_*`  
- Requires `CONFIRM_STORAGE_MIGRATE=YES` / `CONFIRM_STORAGE_VERIFY=YES`  
- Buckets: `candidate-documents`, `submission-evidence`  
- No auto bucket create → `TARGET BUCKET REQUIRED`  
- Private-only; no source delete; idempotent skip; upsert on mismatch  
- Manifest without file bodies / signed URLs / keys  

---

## 8. Storage Policy Design

| Source | Finding |
|---|---|
| Prisma migrations | **No** `storage.objects` / `storage.buckets` RLS SQL |
| App contract | Private buckets; signed URLs; canonical paths; staff-only evidence |

**Manual target configuration required:** export Seoul Storage policies; recreate on Mumbai with identical privacy and without weakening. Prefer API-created object metadata during METHOD B copy (avoid SQL metadata double-write).

---

## 9. Storage Verification

`supabase-storage-verify.ts` compares path / size / contentType:

- `MATCH`  
- `MISSING`  
- `MISMATCH`  
- `EXTRA`  

No body download in verify path. Mock tests cover mismatch classes.

---

## 10. Remaining Blockers

| Blocker | Type |
|---|---|
| Human migration **GO** not issued | Process |
| Live Auth dump hash preflight not yet runnable without authorization | Execution-time |
| Live Seoul `DATABASE_URL` role confirmation | Ops |
| Mumbai private buckets + Storage policy parity (manual) | Ops |
| Vercel Preview soak + performance AFTER metrics | Post-migrate |

Planning blockers from the safety review are **remediated in docs/scripts**. Execution remains unauthorized.

---

## 11. Updated Execution Order

1. Preflight gates defined (Auth / Role / Storage) — must be PASS  
2. Secure dump workstation (read-only Seoul)  
3. Dump roles / public schema / public data / **auth_data**  
4. Auth password-hash inspection → PASS or 🔴 BLOCKED  
5. Edit `roles.sql`; set **new** `oos_app_runtime` password on Mumbai  
6. Restore public schema + Auth data + public data  
7. Verify UUID orphans / RLS / `_prisma_migrations`  
8. Manual private buckets + Storage policies  
9. Storage migrate script (authorized only)  
10. Storage verify script  
11. Realtime / cron / RLS test suites  
12. Vercel Preview → Mumbai  
13. Performance AFTER (do not invent)  
14. Freeze + delta if needed  
15. Production env cutover + redeploy  
16. Monitor; Seoul retained for rollback  

---

## 12. Final Readiness

| Area | Readiness |
|---|---|
| Inventory | Complete |
| Execution plan | Updated with gates + remediations |
| Safety review | Updated remediation status |
| Storage utilities | Present + mock-tested |
| Auth password path | Defined; live preflight pending |
| JWT Option B | SAFE (unchanged) |
| Vault | NO DEPENDENCY (unchanged) |
| Migration execution | **NOT AUTHORIZED / NOT EXECUTED** |

### Planning verdict

**🟡 APPROVED AFTER CORRECTIONS — REMEDIATION COMPLETE FOR PLANNING**

Do not interpret as execution approval.

---

# Final Auth Password Preflight

**Date:** 2026-10-01  
**Mode:** READ-ONLY repository + documented command semantics  
**Live Seoul/Mumbai connection:** NOT PERFORMED  
**Live Auth dump:** NOT PERFORMED  

## Auth dump command reviewed

From `docs/migration/SUPABASE_SEOUL_TO_MUMBAI_EXECUTION_PLAN.md`:

```bash
supabase db dump --db-url "$OLD_DB_URL" -f auth_data.sql --use-copy --data-only --schema auth
```

Documented restore uses `auth_data.sql` after public `schema.sql`, under `session_replication_role = replica`.

**Command scope (from flags only):**

| Flag | Meaning |
|---|---|
| `--data-only` | Table data, not Auth DDL |
| `--schema auth` | All tables in `auth` schema |
| `--use-copy` | PostgreSQL COPY format |
| No column exclude | No documented column filter on `encrypted_password` |

**Intended fields for OOS login (plan checklist):**  
`auth.users.id`, `email`, `encrypted_password`, `email_confirmed_at`, `raw_user_meta_data`, `raw_app_meta_data`, plus `auth.identities` with matching `user_id`.

**Sessions / refresh tokens:** Plan explicitly discards under JWT Option B.

## encrypted_password inclusion status

| Evidence source | Result |
|---|---|
| Repository proves column exists | YES — `src/lib/supabase/admin.ts` updates `auth.users.encrypted_password` |
| Documented dump flags exclude the column | NO exclusion documented |
| Actual `auth_data.sql` artifact in repo | **ABSENT** |
| Live source dump inspected for COPY header / non-null hashes | **NOT PERFORMED** (forbidden in this preflight) |

Per master prompt rules (do not assume; do not infer solely from generic platform behavior; stop if live dump required):

### AUTH PASSWORD HASH: BLOCKED

**LIVE SOURCE DUMP REQUIRED FOR FINAL VERIFICATION**

Required next step (when separately authorized; not executed now):

1. Run the documented Auth dump against Seoul (read-only dump).  
2. Inspect `auth_data.sql` **metadata only** — confirm `COPY auth.users (... encrypted_password ...)` (or equivalent column list).  
3. Confirm password users have non-null hashes (counts / null-check only — **never print hashes**).  
4. Only then may AUTH PASSWORD HASH become VERIFIED.

## auth.users UUID preservation

| Check | Result |
|---|---|
| `public.users.id` has no DB default | VERIFIED (`UUID NOT NULL` without `gen_random_uuid()`) |
| Prisma documents Auth UUID match | VERIFIED (`// Matches Supabase auth.users.id`) |
| Candidate signup uses Auth id for `public.users` | VERIFIED (`signUp` → `id: userId`) |
| Employee create uses Auth id | VERIFIED (`admin.createUser` → Auth id) |
| Migration procedure rewrites UUIDs | NO — COPY preserves ids |
| Invite path may create synthetic `public.users` without Auth | Existing app quirk (`crypto.randomUUID` in invite) — **not** introduced by migration; migration still copies ids as-is |

### UUID PRESERVATION: VERIFIED

(for the migration procedure: no UUID regeneration during Auth/public data restore)

## auth.identities preservation

| Check | Result |
|---|---|
| Dump command includes `auth` schema tables | YES (`--schema auth`) |
| Plan requires identities + same `user_id` | YES |
| Plan regenerates identity user_ids | NO |
| Live dump confirmed identity rows present | NOT PERFORMED |

### IDENTITY UUID PRESERVATION: VERIFIED

(for migration design/command scope: identities included; `user_id` not rewritten)  
Live row presence remains part of the Auth preflight gate when a dump is authorized.

## Session handling

### SESSION MIGRATION: INTENTIONALLY DISCARDED

JWT Option B — Mumbai native JWT secret. Sessions / refresh tokens / flow_state / one_time_tokens not relied upon.

## JWT Option B

**UNCHANGED — SAFE**  
Users re-login after cutover; passwords preserved only if hash preflight later VERIFIES.

## Password login preservation (dependency analysis only — no live login)

Required for same-password login after cutover:

1. `auth.users.id` preserved → VERIFIED (design)  
2. `encrypted_password` restored → **NOT VERIFIED** (no live dump)  
3. `auth.identities` preserved → VERIFIED (design)  
4. Mumbai JWT native → intentional; forces re-login, not password reset  

### PASSWORD LOGIN PRESERVATION: BLOCKED

Blocked solely on unproven live presence/restorability of `encrypted_password` in the source dump artifact.

## Remaining blocker

1. **Authorize and perform a read-only Seoul Auth dump** (human GO required — not done here).  
2. Inspect dump for `encrypted_password` column + non-null hash coverage.  
3. Re-run this preflight against the dump artifact.  
4. If hashes missing/unusable → remain **🔴 AUTH PASSWORD MIGRATION BLOCKED** (no invented workaround).

## Final Auth verdict

### AUTH STATUS: 🔴 BLOCKED

### AUTH PREFLIGHT: BLOCKED

Reason: **LIVE SOURCE DUMP REQUIRED FOR FINAL VERIFICATION** of `encrypted_password`.

UUID design and identity design are verified; password-hash field inclusion in an actual dump artifact is not.

---

## Source Auth Dump Verification

**Date:** 2026-10-01  
**Purpose:** Read-only Seoul Auth data dump structure inspection only  
**Restore:** NOT PERFORMED  
**Mumbai / Vercel / JWT / users:** UNCHANGED  

### Dump command reviewed

Documented:

```bash
supabase db dump --db-url "$OLD_DB_URL" -f auth_data.sql --use-copy --data-only --schema auth
```

**Execution note:** `supabase` CLI and Docker were unavailable on the workstation. Equivalent read-only dump performed with:

```bash
pg_dump --data-only --schema=auth --format=plain --no-owner --no-privileges --file=auth_data.sql "$OLD_DB_URL"
```

Connection: Seoul Session pooler `:5432` (`ap-northeast-2`) via local `.env` `DIRECT_URL` loaded as `$OLD_DB_URL` (credentials never printed/committed).

| Item | Result |
|---|---|
| dump generated successfully | **YES** |
| dump committed / uploaded / printed | **NO** |
| encrypted_password present | **YES** |
| auth.users.id present | **YES** |
| auth.identities present | **YES** |
| identity user_id present | **YES** |
| UUID invariant | **VERIFIED** |
| session migration | **intentionally discarded** (JWT Option B) |
| AUTH DUMP REMOVED | **YES** (overwrite + unlink) |

### auth.users field presence (structure only — no values)

| Field | Present |
|---|---|
| id | YES |
| email | YES |
| encrypted_password | YES |
| email_confirmed_at | YES |
| raw_user_meta_data | YES |
| raw_app_meta_data | YES |
| created_at | YES |
| updated_at | YES |

### Coverage checks (counts only — no hashes/emails printed)

| Check | Result |
|---|---|
| `auth.users` rows in dump | 6 |
| `encrypted_password` non-null | 6 |
| bcrypt-style hash prefix (`$2a$`/`$2b$`/`$2y$`) | 6 |
| `auth.identities` rows | 5 |
| `identities.user_id` non-null | 5 |

### Final Auth preflight status (after source dump)

**AUTH PREFLIGHT: 🟢 READY**

| Gate | Status |
|---|---|
| PASSWORD HASH | **VERIFIED PRESENT** |
| UUID | **VERIFIED** |
| IDENTITIES | **VERIFIED** |
| SESSION MIGRATION | INTENTIONALLY DISCARDED |

**AUTH STATUS: 🟢 READY**

This does **not** authorize migration execution.

---

## FINAL STATUS

**AUTH PREFLIGHT:** 🟢 READY  

**MIGRATION EXECUTION:** NOT EXECUTED  

**SEOUL:** UNCHANGED  

**MUMBAI:** UNCHANGED  

**VERCEL:** UNCHANGED  

**PRODUCTION:** UNCHANGED  
