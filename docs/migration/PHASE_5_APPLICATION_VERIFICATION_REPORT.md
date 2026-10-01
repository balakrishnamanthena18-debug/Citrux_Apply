# Phase 5 — Mumbai Full Application Verification Report

**Document type:** PRE-CUTOVER VERIFICATION (READ-ONLY / NON-CUTOVER)  
**Date:** 2026-10-01  
**Target:** Mumbai `vgrvijugljzlpohsbmjg` / `ap-south-1`  
**Source (unchanged):** Seoul `auzikqapcgtgqwotnldq` / `ap-northeast-2`  
**Credentials:** `.migration-mumbai.env` only (ephemeral process env; main `.env` **not** modified)

---

## FINAL STATUS

### 🟡 PHASE 5 APPLICATION VERIFICATION — VERIFIED WITH WARNINGS

Critical security and data-integrity checks **passed**. Warnings are documented below and do **not** hide failures.

---

## Warnings (non-blocking)

1. **FORCE RLS parity:** `_prisma_migrations` and `rate_limit_buckets` have RLS enabled but **FORCE RLS = false** on **both Seoul and Mumbai**. All other public app tables have FORCE RLS. Not a migration regression.
2. **Auth identity gap (pre-existing):** 1 Auth user lacks `auth.identities` on both projects (`EMPLOYEE` account). Password/hash exist; login path for that account may be unreliable — same as Phase 3 note.
3. **Production page traffic:** Vercel still points at Seoul. Mumbai page/API TTFB was measured via a **local** `next start` process with Mumbai env (not production edge).

---

## 5A — Environment assertion

| Check | Result |
|---|---|
| Process DB host region | **`ap-south-1`** |
| Process Supabase project | **`vgrvijug…` (Mumbai)** |
| Seoul project / `ap-northeast-2` in process env | **ABSENT** (would fail closed) |
| Main `.env` file | **UNCHANGED** |
| Vercel | **UNCHANGED** |

---

## 5B — Database

| Check | Result |
|---|---|
| `oos_app_runtime` connect | **PASS** (~146–274 ms) |
| Prisma adapter query (`select 1` / `current_user`) | **PASS** (`oos_app_runtime`) |
| Public tables | **32** |
| Enums | **26** |
| Foreign keys | **68** |
| Indexes | **104** |
| RLS enabled (all public tables) | **PASS** |
| FORCE RLS | **PASS** for app tables; see Warning 1 for 2 non-app/parity tables |
| SECURITY DEFINER funcs | **16**; `search_path` hardened **PASS** |
| Runtime `BYPASSRLS` / superuser | **false / false** |
| Representative reads (counts) | users 6, candidates 3, applications 13, submissions 5, tasks 1, conversations 3, messages 23, notifications 27, audit_events 157, documents 5 |
| Schema changes | **NONE** |

---

## 5C — Authentication (JWT Option B — Mumbai native)

| Check | Result |
|---|---|
| Employee login + refresh + logout | **PASS** (~1015 ms first login) |
| Candidate login + refresh + logout | **PASS** (~133 ms) |
| Admin login + refresh + logout | **PASS** (~62 ms) |
| Invalid password rejected | **PASS** |
| Unknown user rejected | **PASS** |
| Seoul sessions expected to work | **NO** (Option B) — not tested as valid |
| Credentials printed | **NO** |

Accounts exercised by role only (emails used for login are existing migrated users; passwords not recorded here).

---

## 5D — Role / authorization / IDOR

| Check | Result |
|---|---|
| Candidate RLS: sees own candidate | **PASS** |
| Candidate RLS: other candidate / docs hidden | **PASS** |
| Candidate RLS: `internal_notes` count = 0 | **PASS** |
| No JWT → applications count = 0 | **PASS** |
| Employee RLS: org applications readable | **PASS** (13 apps, 1 task, 1 note) |
| Automated IDOR negative matrix + RBAC suites | **PASS** (included in full suite) |

Cross-tenant / unauthorized access: **REJECTED** in live RLS probes and automated negative-path tests.

---

## 5E–5G — Candidate / Employee / Admin workflows

Live Mumbai probes + automated contract tests (no production business writes):

| Area | Evidence |
|---|---|
| Candidate auth + isolation | Live login + RLS |
| Employee auth + org data | Live login + RLS reads |
| Admin auth | Live login |
| Dashboards / portals | Route build includes `/candidate/*`, `/employee/*`, `/admin/*`; local smoke `/login` **200** |
| Automated workflow suites | Application lifecycle, QA, tasks, privacy, communications, approvals — **PASS** in suite |

**Write caveat:** No new production business records created. Lifecycle/authorization behavior covered by existing integration tests + read-only Mumbai data inspection.

Application status distribution on Mumbai (read-only):

| Status | Count |
|---|---:|
| AWAITING_APPROVAL | 3 |
| READY | 3 |
| SUBMITTED | 7 |

---

## 5H — Application lifecycle

| Check | Result |
|---|---|
| Historical states present | **YES** (`application_state_history` = 56) |
| Submissions present | **5**; unique `(applicationId, attemptNumber)` index **PASS** |
| `c16151c0…` `storagePath` | **NULL** (approved remediation) |
| Arbitrary writes for testing | **NOT PERFORMED** |

---

## 5I — Document / Storage

| Check | Result |
|---|---|
| Migrated genuine `candidate-documents` objects | **2** |
| Path/size integrity (from Phase 4) | **VERIFIED** |
| Signed URL generation (Mumbai) | **PASS** (~138 ms) |
| Anonymous download | **DENIED** |
| Buckets private | **PASS** |
| `submission-evidence` objects | **0** |
| D1 seed exceptions (3 docs) | **PRESERVED** unchanged |
| Unexpected DB↔Storage mismatches (excl. D1) | **0** |

---

## 5J — Communication

| Check | Result |
|---|---|
| Conversations / messages present | 3 / 23 |
| Notifications present | 27 |
| Internal notes barrier (candidate RLS) | **PASS** (0 notes visible) |
| Staff can see notes under RLS | **PASS** (1) |
| External email send | **NOT PERFORMED** (by design) |
| Communication isolation tests | **PASS** (suite) |

---

## 5K — Realtime

| Check | Result |
|---|---|
| Authenticated channel subscribe (org scope) | **PASS** (`SUBSCRIBED`) |
| Cross-tenant leakage | Not observed in subscribe probe; channel naming remains scope-derived in code |
| Full multi-channel stress | Limited to connectivity smoke pre-cutover |

---

## 5L — Security

| Check | Result |
|---|---|
| RLS + FORCE RLS (app tables) | **PASS** |
| IDOR automated matrix | **PASS** |
| Private Storage + anon deny | **PASS** |
| Signed URL short-lived generation | **PASS** (60s) |
| Secrets not printed | **PASS** |
| Rate limit table present | **PASS** |
| Cron cleanup route present | **PASS** (`/api/cron/rate-limit-cleanup`) |
| Client-boundary / log redaction tests | **PASS** (suite) |

---

## 5M — Performance (Mumbai, pre-cutover)

| Metric | Value |
|---|---|
| Admin DB ping | ~193 ms |
| Runtime DB connect | ~146 ms |
| Prisma query | ~274 ms |
| Auth login (employee / candidate / admin) | ~1015 / 133 / 62 ms |
| Storage signed URL | ~138 ms |
| Local `next start` `/api/health` TTFB | ~117 ms |
| Local `/login` TTFB | ~100 ms |

Qualitative: Mumbai is reachable and operational from this network. **Do not treat these as production Vercel `bom1` numbers** until post-cutover smoke.

---

## 5N — Automated tests / build

| Command | Result |
|---|---|
| `npm test` (default harness; not live Mumbai env override) | **103 files / 673 tests PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

Note: Running the suite **with** Mumbai env exported caused storage tests to hit live APIs and fail mocks. Suite was re-run cleanly without that override. Live Mumbai behavior was verified separately in 5A–5M.

---

## 5O — Data integrity

| Check | Result |
|---|---|
| Public tables | 32 |
| Auth ↔ public UUID invariant | **6/6 match; 0 orphans** |
| Identities | 5 (1 user without identity — Warning 2) |
| FK orphan probe (sample) | **0** |
| Storage CD/SE | 2 / 0 |
| D1 exceptions | 3 preserved |
| Submission path NULL remediation | intact |
| Seoul data modified this phase | **NO** |
| Mumbai app data modified this phase | **NO** |

---

## 5P — Cutover readiness (NOT executed)

### READY (technical)

- Database (schema, RLS, runtime role)
- Auth (JWT B login/refresh/logout for candidate/employee/admin)
- Storage (2 objects, private, signed access)
- Application build + local Mumbai smoke
- Authorization / IDOR contracts
- Realtime subscribe smoke
- Security controls listed above

### PENDING FOR CUTOVER (operator)

- Vercel environment variable switch to Mumbai
- Production deployment after env switch
- Production smoke test on live domain
- Domain/DNS (if any change required)
- Monitoring / alerting validation
- Rollback readiness (keep Seoul until soak complete)
- Explicit operator approval for cutover window

### Rollback considerations

- Keep Seoul project intact (DB, Auth, Storage)
- Revert Vercel env to Seoul refs/keys/URLs
- Redeploy
- Users re-login (JWT B already implies session reset on cutover)

---

## Explicit non-actions

- Vercel **not** modified  
- Main `.env` **not** modified  
- Seoul **not** deleted / not mutated  
- Production cutover **not** performed  
- Phase 6 **not** started  
- No fabricated Storage files  
- No Auth/Storage migrations in this phase  

---

## FINAL STATUS

### 🟡 PHASE 5 APPLICATION VERIFICATION — VERIFIED WITH WARNINGS

**STOP.** Do not modify Vercel, do not cut over, do not delete Seoul, do not start Phase 6 automatically.
