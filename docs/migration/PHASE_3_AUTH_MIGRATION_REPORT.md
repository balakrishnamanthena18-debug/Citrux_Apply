# OOS Supabase Seoul → Mumbai
# Phase 3 Auth Migration Report

**Date:** 2026-10-01  
**Scope:** Auth users + identities only  
**JWT strategy:** OPTION B — Mumbai native JWT secret  
**Sessions / refresh tokens:** NOT MIGRATED  
**Storage objects:** NOT MIGRATED  
**Production cutover:** NOT EXECUTED  

---

## Final Status

### 🟢 PHASE 3 AUTH MIGRATION — VERIFIED

---

## 1. Source / Target

| Item | Value |
|---|---|
| Source project (redacted) | `auzikqap…` |
| Source region | `ap-northeast-2` (Seoul) |
| Target project (redacted) | `vgrvijug…` |
| Target region | `ap-south-1` (Mumbai) |
| Source ≠ Target | **PASS** |
| Phase 2 database | **VERIFIED** (prerequisite) |
| Main `.env` | Still Seoul — **UNCHANGED** |
| Vercel | **UNCHANGED** |
| Seoul Auth modified | **NO** (read-only dump) |

---

## 2. Phase 3A Pre-flight

| Check | Result |
|---|---|
| Mumbai Auth users before restore | **0** |
| Mumbai `public.users` (from Phase 2) | **6** |
| Seoul `auth.users` | **6** |
| Seoul `auth.identities` | **5** |
| Seoul Auth ↔ `public.users` matches | **6** |
| Orphan Auth / orphan public (Seoul) | **0 / 0** |
| Non-null password hashes (Seoul) | **6** |
| bcrypt-prefix hashes (`$2a$`/`$2b$`/`$2y$`) | **6** |
| Identity providers (Seoul) | `email=5` |
| Unexpected target Auth | **NONE** |

---

## 3. Extraction Method

| Item | Detail |
|---|---|
| Tool | `pg_dump --data-only --table=auth.users` + `--table=auth.identities` |
| Source | Seoul Session `:5432` (read-only) |
| Sessions / refresh / flow / OTP / MFA tables | **Excluded** |
| Artifact location | `/tmp/oos-migrate-p3-auth/` (mode `700`) |

### Structural inspection (no values printed)

| Field / check | Present |
|---|---|
| `auth.users.id` | YES |
| `auth.users.email` | YES |
| `auth.users.encrypted_password` | YES |
| `auth.users.email_confirmed_at` | YES |
| `auth.users.raw_user_meta_data` / `raw_app_meta_data` | YES |
| `auth.users.created_at` / `updated_at` | YES |
| `auth.identities.user_id` / `provider` / `provider_id` | YES |
| Dump columns vs target columns | Compatible (**NONE** missing on target) |
| Dump user rows / identity rows | 6 / 5 |

---

## 4. Restore Method

| Item | Detail |
|---|---|
| Target | Mumbai `NEW_DIRECT_URL` |
| Order | `auth.users` then `auth.identities` |
| Mode | `psql --single-transaction` + `SET session_replication_role = replica` |
| UUID regeneration | **NONE** (COPY of source IDs) |
| Result | **PASS** |

Post-restore counts: Auth users **6**, identities **5**.

---

## 5. Counts & Digests (no PII)

| Metric | Source | Target | Match |
|---|---:|---:|---|
| `auth.users` | 6 | 6 | YES |
| `auth.identities` | 5 | 5 | YES |
| Auth user `id` digest | `846083b0…` | `846083b0…` | YES |
| Identity `id` digest | (matched) | (matched) | YES |
| Identity `user_id` digest | (matched) | (matched) | YES |
| `encrypted_password` digest | (matched) | (matched) | YES |
| `email_confirmed_at` digest | (matched) | (matched) | YES |

---

## 6. UUID Invariant: `auth.users.id = public.users.id`

| Check | Result |
|---|---|
| Auth ∩ public users | **6** |
| Orphan Auth users | **0** |
| Orphan `public.users` | **0** |
| Memberships → users orphans | **0** |
| Candidates → users orphans | **0** |
| Candidates → Auth orphans | **0** |
| Identity → Auth orphans | **0** |
| Duplicate provider+provider_id | **0** |

**UUID preservation:** VERIFIED  
**public.users ↔ auth.users invariant:** VERIFIED  

---

## 7. Password-hash Structural Verification

| Check | Result |
|---|---|
| Non-null hashes on target | 6 / 6 |
| bcrypt-compatible prefix | 6 / 6 |
| Plaintext-lookalike hashes | **0** |
| Source↔target hash digest match | **YES** (bitwise preservation) |
| Hashes printed/logged | **NO** |
| Passwords reset | **NO** |

---

## 8. Identity / Provider Verification

| Check | Result |
|---|---|
| Providers on target | `email=5` |
| Matches source provider aggregate | YES |
| Users without identity | **1** on source **and** target (pre-existing Seoul state; not introduced by migration) |

---

## 9. Session / JWT Verification

| Check | Result |
|---|---|
| `auth.sessions` migrated | **NO** (target count **0**) |
| `auth.refresh_tokens` migrated | **NO** (target count **0**) |
| JWT strategy | **OPTION B — Mumbai native** (not copied from Seoul) |
| Expected cutover behavior | Users must re-login; Seoul sessions invalid on Mumbai |

---

## 10. Authorization / RLS Tests

| Suite | Result |
|---|---|
| Storage migration unit tests | 16 PASS |
| Candidate document vault unit tests | 8 PASS |
| RLS security-definer contract | 7 PASS |
| Candidate RLS contract | 4 PASS |
| Application RLS contract | 5 PASS |
| RLS recursion contract | 4 PASS |

Live password login against Mumbai was **not** performed in this phase (per prompt). Structural hash + UUID verification used instead.

DB claim smoke from Phase 2 (`request.jwt.claim.sub` → `current_user_id`) remains valid architecture for Mumbai.

---

## 11. Security / Production Safety

| Item | Status |
|---|---|
| Mumbai Auth users exist | YES (6) |
| Password hashes exposed in logs/reports | **NO** |
| Sessions imported | **NO** |
| JWT remains Mumbai-native | YES |
| Main `.env` still Seoul | YES |
| Vercel still Seoul | YES |
| Production traffic switched | **NO** |
| Seoul unchanged | YES |
| Auth dumps committed | **NO** |

---

## 12. Cleanup

| Item | Result |
|---|---|
| Temporary Auth dump overwrite+delete | **YES** |
| `/tmp/oos-migrate-p3-auth` removed | **YES** |
| Git sensitive Auth artifacts | **NONE** |

---

## 13. Warnings

1. **One Auth user has no `auth.identities` row** on both Seoul and Mumbai (source parity preserved). Email/password login for that account may depend on GoTrue behavior without an identity row — investigate in staging before cutover if that account must log in.  
2. Password login end-to-end against Mumbai Auth API was not smoke-tested in Phase 3 (structural verification only). Recommend a controlled staging login matrix in a later phase.  
3. Private Storage buckets remain uncreated/unmigrated (Phase 4).

---

## 14. Remaining Phases

1. **Phase 4 — Storage** (private buckets + object copy + verify)  
2. Staging / Preview soak on Mumbai  
3. Production cutover (Vercel env) — separate GO  

**Phase 4 must NOT start automatically.**

---

## FINAL STATUS

**🟢 PHASE 3 AUTH MIGRATION — VERIFIED**

**STORAGE:** NOT MIGRATED  
**VERCEL:** UNCHANGED  
**MAIN .env:** UNCHANGED  
**SEOUL:** UNCHANGED  
**CUTOVER:** NOT EXECUTED  

**STOP.**
