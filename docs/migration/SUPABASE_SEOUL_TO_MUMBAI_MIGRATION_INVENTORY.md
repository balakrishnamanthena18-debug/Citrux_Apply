# OOS Supabase Seoul → Mumbai Migration Inventory

**Document type:** READ-ONLY FORENSIC INVENTORY & MIGRATION PLAN  
**Date:** 2026-10-01  
**Authorization:** Inventory only — **NOT** authorization to execute migration  
**Source:** Existing production Supabase Free — `ap-northeast-2` (Seoul)  
**Target:** New empty Supabase Free — `ap-south-1` (Mumbai)  
**Application:** `apply_citrux` / OOS (`https://citrux-apply.vercel.app`)

**Constraints honored:** No production changes, no Supabase mutations, no Vercel env changes, no dumps against production, no secret values printed.

---

## 1. Executive Summary

OOS depends on a **single Supabase project** for:

1. **PostgreSQL** (Prisma + interactive RLS via `request.jwt.claim.sub`)
2. **Supabase Auth** (`auth.users` IDs mirrored in `public.users`)
3. **Storage** (private buckets `candidate-documents`, `submission-evidence`)
4. **Realtime Broadcast** (application-managed channels; not Postgres CDC publications in-repo)

The schema, RLS, SECURITY DEFINER helpers, indexes, and enums are **recreatable from `prisma/migrations/` (15 migrations)**.

What **cannot** be recreated from migrations alone:

- **All production row data**
- **`auth.users` credentials / sessions**
- **Storage binary objects**
- **Supabase Dashboard Auth/Storage/Realtime project settings**
- **Vercel project secrets pointing at Seoul**

**Performance objective of migration:** Co-locate Vercel `bom1` (Mumbai) with Supabase `ap-south-1` (Mumbai) to eliminate ~120–140ms Seoul RTT per SQL statement (see prior forensic audit).

**This document does not authorize cutover.**

---

## 2. Current Infrastructure

| Layer | Current state | Evidence |
|---|---|---|
| App host | Vercel Next.js | `vercel.json`, production `citrux-apply.vercel.app` |
| Vercel region | `bom1` (Mumbai) | Prior forensic `x-vercel-id` |
| Supabase project | Free plan, **Seoul** | User: `ap-northeast-2`; repo/env host pattern `aws-0-ap-northeast-2.pooler.supabase.com` |
| Runtime DB | Pooler `:6543` (`DATABASE_URL`) | `src/lib/db/prisma.ts`, `.env.example`, ADR-003 |
| Migrations DB | Session/direct `:5432` (`DIRECT_URL`) | `prisma.config.ts` |
| Auth | Supabase Auth SSR cookies | `src/middleware.ts`, `src/lib/auth/*`, `src/lib/supabase/*` |
| Storage | Private buckets via signed URLs | `src/lib/storage/index.ts` |
| Realtime | Broadcast channels + app event bus | `src/lib/realtime/*` |
| Cron | Vercel Cron → API route | `vercel.json`, `/api/cron/rate-limit-cleanup` |
| Email | SMTP (Nodemailer), not Supabase | `src/lib/email/index.ts` |

**Current project ref (non-secret):** Host pattern from environment inspection previously identified as `*.supabase.co` with pooler in `ap-northeast-2`. Exact project UUID/ref must be confirmed in Supabase dashboard at cutover planning — **do not embed secrets**.

---

## 3. Target Infrastructure

| Layer | Target |
|---|---|
| Supabase | **New empty Free project** in **`ap-south-1` (Mumbai)** |
| Schema | Apply all 15 Prisma SQL migrations via `DIRECT_URL` to Mumbai |
| Auth | New Auth instance — **user credential migration required** |
| Storage | Recreate buckets + **copy all objects** |
| Realtime | Enable Broadcast; channels are app-defined |
| Vercel | After verification, swap env vars to Mumbai endpoints |
| Seoul | **Remain intact** until formal acceptance |

---

## 4. Database Migration

### 4.1 Prisma models / tables (actual)

| Table | Prisma model | Purpose | RLS FORCE | Tenant-scoped | Sensitive |
|---|---|---|---|---|---|
| `organizations` | Organization | Tenant root | YES | self | Low |
| `users` | User | App user profile; PK = Auth user id | YES | via membership | PII (name/email) |
| `memberships` | Membership | Org role binding | YES | org | Role/status |
| `designations` | Designation | Staff titles | YES | org | Low |
| `staff_activation_tokens` | StaffActivationToken | Staff invite tokens | YES | org | Token hashes |
| `task_governance_policies` | TaskGovernancePolicy | Task permission policy | YES | org | Low |
| `candidates` | Candidate | Candidate operational record | YES | org | High PII |
| `candidate_experiences` | CandidateExperience | Career history | YES | via candidate | PII |
| `candidate_educations` | CandidateEducation | Education | YES | via candidate | PII |
| `candidate_skills` | CandidateSkill | Skills | YES | via candidate | Low |
| `candidate_projects` | CandidateProject | Projects | YES | via candidate | Low |
| `candidate_certifications` | CandidateCertification | Certs | YES | via candidate | Low |
| `candidate_documents` | CandidateDocument | Doc **metadata** + `storagePath` | YES | via candidate | Path refs |
| `jobs` | Job | Job postings | YES | org | Low |
| `applications` | Application | Application pipeline | YES | org | Operational |
| `application_materials` | ApplicationMaterial | Materials | YES | via app | Content refs |
| `application_submissions` | ApplicationSubmission | Submissions + evidence path | YES | via app | Evidence paths |
| `application_state_history` | ApplicationStateHistory | App audit trail | YES | via app | Operational |
| `application_qa_reviews` | ApplicationQaReview | QA reviews | YES | org/app | Operational |
| `application_qa_checklists` | ApplicationQaChecklist | QA checklist | YES | via QA | Low |
| `tasks` | Task | Work items | YES | org | Operational |
| `task_checklist_items` | TaskChecklistItem | Task checklist | YES | via task | Low |
| `task_state_history` | TaskStateHistory | Task history | YES | via task | Operational |
| `conversations` | Conversation | Messaging threads | YES | org/candidate | Communication |
| `messages` | Message | Messages | YES | via conversation | **Message content** |
| `internal_notes` | InternalNote | Staff notes | YES | org | Internal |
| `notifications` | Notification | In-app notifications | YES | recipient | Titles/bodies |
| `email_delivery_logs` | EmailDeliveryLog | Email send log | YES | org | Emails |
| `privacy_requests` | PrivacyRequest | Privacy/compliance | YES | org/candidate | Compliance |
| `audit_events` | AuditEvent | Security/ops audit | YES | org | Security |
| `rate_limit_buckets` | RateLimitBucket | Auth/API rate limits | **No FORCE RLS in migration** | N/A (hashed keys) | Hashed keys only |

**Not found as tables:** `Team` entity (team-lead is membership flag `is_team_lead` / `isTeamLead`), Supabase Edge Function tables, `pg_cron` jobs.

### 4.2 Classification

| Category | Items |
|---|---|
| **SAFE TO RECREATE FROM MIGRATIONS** | All public tables, enums, indexes, FKs, RLS ENABLE/FORCE, policies, SECURITY DEFINER helpers, role `oos_app_runtime` grants |
| **REQUIRES DATA MIGRATION** | All row data in tables above; `auth.users` (+ identities/sessions as applicable); Storage objects |
| **REQUIRES MANUAL SUPABASE CONFIGURATION** | Auth providers/redirect URLs/email templates; Storage buckets + policies; Realtime settings; API keys; DB passwords; pooler URLs |

### 4.3 Migration method (planning only)

1. Create Mumbai project empty.  
2. Set local/CI `DIRECT_URL` temporarily to Mumbai **only in a controlled migration workspace** (not production cutover yet).  
3. Run Prisma migrations in order (15 folders).  
4. Logical dump/restore or ETL of `public.*` data **preserving UUIDs** (especially `users.id`).  
5. Migrate Auth users with **same UUIDs** as `public.users.id`.  
6. Recreate Storage buckets; copy objects preserving paths.  
7. Verify RLS/security tests.  
8. Cut over Vercel env only after acceptance.

---

## 5. Auth Migration

**AUTH MIGRATION REQUIRED: YES**

### 5.1 Auth surface (repository)

| Capability | Location |
|---|---|
| Password sign-in | `signInAction` → `supabase.auth.signInWithPassword` |
| Candidate sign-up | `signUpCandidateAction` → `supabase.auth.signUp` |
| Password reset request | `resetPasswordForEmail` |
| Password reset complete | `resetPasswordAction` + `getUser` |
| SSR cookies | `@supabase/ssr` server + middleware |
| Middleware gate | `getSession()` presence |
| Authoritative identity | `getAuthenticatedContext` → `getUser()` + membership RLS |
| Auth callback | `src/app/api/auth/callback/route.ts` |
| Admin user provisioning | `src/lib/supabase/admin.ts` (`createAuthUser`, service role / DB fallback) |
| Staff activation | tokens in `staff_activation_tokens` + Auth user create |
| Sign-out / force sign-out | Auth admin `signOut` |

### 5.2 Critical identity invariant

`public.users.id` **is the Supabase Auth user UUID** (no `DEFAULT gen_random_uuid()` on users PK in Phase 1 migration).  
Breaking UUID continuity breaks memberships, RLS, documents, and assignments.

### 5.3 What must be migrated/configured

| Item | Action |
|---|---|
| `auth.users` (+ related Auth schema identities) | Migrate or carefully recreate with **same IDs** and password hashes |
| Sessions / refresh tokens | Expect **invalidation** on project switch — users re-login |
| Auth URL config | Site URL + redirect allow-list → production domain |
| Email templates | Reconfigure in Mumbai dashboard (not in repo) |
| JWT secret | **New per project** — old JWTs invalid after cutover |
| Anon + service role keys | **New** — replace in Vercel |
| `OPERATING_ORGANIZATION_ID` | Must still point to migrated org UUID |

### 5.4 Secrets

If present in environments: **SECRET DETECTED — VALUE REDACTED**  
Never copy secret values into docs/git.

---

## 6. RLS Migration

### 6.1 Pattern

Application sets JWT claim in interactive transaction:

```sql
SELECT set_config('request.jwt.claim.sub', <userId>, true);
```

via `withRlsContext()` (`src/lib/db/rls.ts`).  
Helpers use `current_user_id()` reading that setting.

### 6.2 SECURITY DEFINER functions (recreate from migrations)

| Function | Purpose |
|---|---|
| `current_user_id()` | Read `request.jwt.claim.sub` |
| `get_user_active_org_ids` | Org membership lookup |
| `get_user_co_member_ids` | Co-member visibility |
| `is_org_privileged_member` | Staff/admin membership |
| `is_org_admin` | Admin check |
| `system_log_audit_event` | Privileged audit insert helper |
| `system_provision_initial_organization` | Bootstrap org |
| `candidate_belongs_to_user` | Candidate ownership |
| `is_candidate_org_privileged_member` | Staff access to candidate |
| `is_job_org_privileged_member` | Job tenancy |
| `is_application_org_privileged_member` | App tenancy (overloaded versions in migrations) |
| `application_belongs_to_candidate_user` | Candidate app ownership |
| `is_task_org_privileged_member` | Task tenancy |
| `is_qa_review_org_privileged_member` | QA tenancy |
| `is_submission_org_privileged_member` | Submission tenancy |

All must retain **`SECURITY DEFINER` + explicit `search_path`** (verified by tests).

### 6.3 Role

Migration creates `oos_app_runtime` (`NOSUPERUSER`, `NOBYPASSRLS`) with table grants.  
Mumbai must recreate role **and** ensure connection user used by Prisma matches intended RLS-enforced role (verify against production connection role at cutover).

### 6.4 Classification

**RLS Migration: READY** to recreate from SQL migrations — **do not redesign**.  
Post-migrate: run existing RLS/IDOR test suites against Mumbai.

---

## 7. Storage Migration

### 7.1 Buckets (code-defined)

| Bucket | Public? | Paths | Access |
|---|---|---|---|
| `candidate-documents` | Private (`public=false`) | `tenants/{orgId}/candidates/{candidateId}/documents/{docId}-v{n}-{file}` | Signed upload/download; service role preferred for admin ops |
| `submission-evidence` | Private | `tenants/{orgId}/applications/{applicationId}/submissions/{submissionId}-{file}` | Staff signed URLs |

### 7.2 Two layers

| Layer | Location | Migration |
|---|---|---|
| **Metadata** | `candidate_documents.storagePath`, `application_submissions.storagePath` | DB data migration |
| **Objects** | Supabase Storage binaries | **Actual object copy** Seoul → Mumbai (same keys/paths) |

### 7.3 Manual Mumbai configuration

1. Create both private buckets.  
2. Apply Storage RLS/policies equivalent to production (dashboard; **not fully encoded in Prisma migrations**).  
3. Copy all objects preserving path keys.  
4. Verify signed URL upload/download for sample candidate + submission paths.  
5. Invalidate assumption that old Seoul signed URLs still work (they will not).

**Storage Migration: READY for planning; BLOCKED for cutover until object copy + policy verification complete.**

---

## 8. Realtime Migration

### 8.1 Architecture (repo)

| Component | Role |
|---|---|
| `RealtimeSubscriptionManager` | Supabase channel subscribe (broadcast `oos-operational-event`) |
| `RealtimeEventBus` | Client dedupe/version fan-out |
| `RealtimeProvider` | Dashboard shell subscription |
| `publishRealtimeEvent` | Server broadcast via **service role** |
| Channel names | `candidate:{id}`, `team:{org}:{teamId}`, `org:{orgId}` |

### 8.2 Not found in repo

- `CREATE PUBLICATION`
- `supabase_realtime` table replication config
- Edge Functions
- Postgres Changes subscriptions as primary path

### 8.3 Mumbai requirements

| Item | Action |
|---|---|
| Realtime enabled on project | Manual dashboard |
| Broadcast allowed | Manual / default |
| App code | No architecture change |
| Service role for publish | New key in Vercel |

**Realtime Migration: READY** (config + keys; no schema publication required by current code).

---

## 9. Functions and Triggers

| Type | Inventory |
|---|---|
| SECURITY DEFINER SQL functions | Listed in §6.2 — **RECREATE FROM MIGRATION** |
| Triggers | **None found** in migrations |
| Edge Functions | **None found** |
| Vault / encryption helpers | `pgcrypto` used in admin fallback (`CREATE EXTENSION IF NOT EXISTS pgcrypto`) — **MANUAL/ensure on Mumbai** |
| Custom role | `oos_app_runtime` — **RECREATE FROM MIGRATION** |

---

## 10. Extensions

| Extension | Evidence | Classification |
|---|---|---|
| `pgcrypto` / `gen_random_uuid()` | UUID defaults; admin.ts ensures pgcrypto | **MANUAL CONFIGURATION / ensure enabled** |
| Others | Not explicitly required beyond Postgres defaults | NOT REQUIRED unless dashboard defaults differ |

Supabase projects typically enable `pgcrypto` / `uuid-ossp` — **verify on empty Mumbai project before migrate**.

---

## 11. Cron

| Item | Detail |
|---|---|
| Schedule | `0 2 * * *` daily 02:00 UTC |
| Path | `/api/cron/rate-limit-cleanup` |
| Auth | `Authorization: Bearer <CRON_SECRET>` |
| Host | **Vercel Cron** (not `pg_cron`) |
| DB effect | Deletes expired `rate_limit_buckets` |

**On project switch:** No Supabase cron change. Keep `CRON_SECRET` (or rotate). Ensure Mumbai DB reachable from Vercel after cutover.

**Cron Migration: READY** (Vercel-side; DB table recreated via migrations).

---

## 12. Rate Limiting

| Item | Detail |
|---|---|
| Table | `rate_limit_buckets` |
| Keying | SHA-256 hashes (no raw IPs/emails stored) |
| Access | Prisma / raw SQL upserts (`src/lib/auth/rate-limiter.ts`) |
| RLS | **Not FORCE-enabled in migration** |
| State migration | **Optional** — safe to start empty (users may hit fresh limits) |

**Recommendation:** Recreate empty table; do not block migration on bucket history.

---

## 13. Audit Data

**Must preserve exactly:**

- `audit_events`
- `application_state_history`
- `task_state_history`
- `application_submissions` (+ evidence paths/objects)
- `privacy_requests`
- `email_delivery_logs`
- QA review/checklist rows
- message/conversation history (operational + privacy implications)

**Do not delete** historical audit/compliance data as part of region move.

---

## 14. Environment Variables

| Variable | Class | Replace on Mumbai cutover? |
|---|---|---|
| `DATABASE_URL` | DATABASE SECRET | **YES** (new pooler host/password) |
| `DIRECT_URL` | DATABASE SECRET | **YES** |
| `NEXT_PUBLIC_SUPABASE_URL` | PUBLIC | **YES** (new project URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PUBLIC | **YES** |
| `SUPABASE_SERVICE_ROLE_KEY` | AUTH/DEPLOYMENT SECRET | **YES** |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | optional aliases in server.ts | Align if used |
| `CRON_SECRET` | CRON SECRET | Keep or rotate (not region-specific) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | SMTP SECRET | No (unless rotating) |
| `OPERATING_ORGANIZATION_ID` | SERVER ONLY | Keep **same UUID** after data migrate |
| `NEXT_PUBLIC_APP_URL` | PUBLIC | Verify production URL (activation links) |
| `NODE_ENV` | DEPLOYMENT | No |

**Secret values:** SECRET DETECTED in environments — **VALUE REDACTED** (not printed here).

---

## 15. Vercel Changes

**Do not change until Mumbai verified.**

After acceptance:

1. Update Production (and Preview if needed):  
   `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
2. Redeploy so client bundles pick up new `NEXT_PUBLIC_*`
3. Confirm Cron still hits production with `CRON_SECRET`
4. Optional: set Vercel `regions` explicitly to `bom1` for clarity (currently unset in `vercel.json`)
5. Keep previous Seoul env values documented offline for rollback

**Vercel Migration: READY** for planning; execute only post-verification.

---

## 16. Data Verification Matrix

| Entity | Exists | Must Preserve | Migration Method | Verification |
|---|---|---|---|---|
| Organizations | YES | YES | DB dump/ETL preserve UUID | Count + slug match |
| Users (`public.users`) | YES | YES | DB + Auth UUID sync | Every user has Auth twin |
| Memberships | YES | YES | DB | Role matrix smoke |
| Designations | YES | YES | DB | Admin roster |
| Staff Activation Tokens | YES | YES* | DB (*hashes; may expire) | Invite flow |
| Task Governance Policies | YES | YES | DB | Settings page |
| Candidates | YES | YES | DB | Profile access |
| Candidate profile children | YES | YES | DB | Editors load |
| Candidate Documents metadata | YES | YES | DB | Paths resolve |
| Candidate Document binaries | YES (Storage) | YES | **Object copy** | Signed download |
| Jobs | YES | YES | DB | Jobs workbench |
| Applications | YES | YES | DB | Apps workbench |
| Application Materials | YES | YES | DB | Detail pages |
| Application Submissions | YES | YES | DB | Submission UI |
| Submission Evidence binaries | YES (Storage) | YES | **Object copy** | Staff download |
| Application State History | YES | YES | DB | History panels |
| QA Reviews / Checklists | YES | YES | DB | QA flows |
| Tasks / Checklist / History | YES | YES | DB | Tasks workbench |
| Conversations / Messages | YES | YES | DB | Messages |
| Internal Notes | YES | YES | DB | Notes widget |
| Notifications | YES | YES | DB | Bell |
| Email Delivery Logs | YES | YES | DB | Ops review |
| Privacy Requests | YES | YES | DB | Privacy queues |
| Audit Events | YES | YES | DB | Audit page |
| Rate Limit Buckets | YES | OPTIONAL | Empty OK | Login rate limit works |
| Teams table | NO | N/A | N/A | N/A |
| Live row counts | — | — | — | **COUNT NOT VERIFIED** |

---

## 17. Security Verification Matrix

| Check | Required after migrate |
|---|---|
| FORCE RLS on all core tables | YES — re-run migration SQL / contract tests |
| SECURITY DEFINER `search_path` | YES — unit/integration tests |
| Candidate isolation IDOR suite | YES |
| Staff/admin RBAC | YES |
| Storage path canonical checks | YES |
| Signed URLs expire | YES |
| Service role not in client bundle | YES — existing static tests |
| Cron auth | YES |
| Auth session invalidation expected | Document user re-login |

---

## 18. Performance Verification Matrix

| Metric | Pre (Seoul DB + Mumbai Vercel) | Post target (Mumbai + Mumbai) |
|---|---|---|
| DB statement RTT | ~120–140ms | Re-measure (expect much lower) |
| Emp Applications dual-txn mimic | ~2.7s | Re-measure |
| Admin page txn mimic | ~3.3s | Re-measure |
| Sidebar nav T2U | ~5s user-reported | Re-measure authenticated waterfall |
| Regions | Vercel `bom1` / DB `ap-northeast-2` | Vercel `bom1` / DB `ap-south-1` |

**Do not claim improvement until measured.**

---

## 19. Rollback Plan

1. **Seoul project remains live and unmodified** until Mumbai accepted.  
2. Cutover = Vercel env swap + redeploy only.  
3. Rollback = restore previous Vercel env values (Seoul URL/keys/DB URLs) + redeploy.  
4. Do **not** delete Seoul project, buckets, or Auth users until formal sign-off.  
5. Any writes on Mumbai after cutover require reconciliation plan before rollback (document freeze window).  
6. Communicate forced re-login on both cutover and rollback (JWT issuer change).

**Rollback Plan: READY**

---

## 20. Migration Execution Order

*(Planning sequence — not authorized to run)*

1. Create empty Mumbai Supabase Free (`ap-south-1`).  
2. Enable required extensions (`pgcrypto` / UUID).  
3. Apply all 15 Prisma migrations via `DIRECT_URL`.  
4. Recreate Storage buckets + policies.  
5. Migrate Auth users (preserve UUIDs) + verify `public.users` FK integrity.  
6. Migrate all `public.*` data (UUID-preserving).  
7. Copy Storage objects (both buckets).  
8. Configure Auth URLs/templates.  
9. Point a **non-production** or staging Vercel env at Mumbai; run full test suite + smoke.  
10. Performance benchmark vs Seoul baseline.  
11. Production cutover (env swap) in maintenance window.  
12. Monitor auth, storage, cron, RLS.  
13. Keep Seoul as rollback for defined soak period.  
14. Only then schedule Seoul decommission (separate approval).

---

## 21. Blockers

| Blocker | Severity | Notes |
|---|---|---|
| Auth user/password migration plan not yet chosen | **HIGH** | Must preserve UUID + credentials |
| Storage object copy tooling/process not specified | **HIGH** | Metadata alone insufficient |
| Storage RLS policies not fully in Prisma migrations | **MEDIUM** | Dashboard export/compare needed |
| Live row/object counts **COUNT NOT VERIFIED** | **MEDIUM** | Need read-only inventory at execution time |
| Connection role vs `oos_app_runtime` alignment | **MEDIUM** | Verify Prisma DB user on Mumbai |
| Free-plan limits / transfer size | **MEDIUM** | Confirm Free tier capacity for data+storage |
| No Edge Functions / pg_cron in repo | None | N/A |

No repository structural blocker prevents **planning**.  
**Execution** is blocked until Auth + Storage object migration methods are approved.

---

## 22. Final Recommendation

Proceed to a **detailed cutover runbook** (separate authorization) that prioritizes:

1. UUID-preserving Auth + `public.users` migration  
2. Full DB data migration  
3. Storage object copy for `candidate-documents` and `submission-evidence`  
4. Staging verification (security + performance)  
5. Vercel env cutover with Seoul rollback retained  

Do **not** treat “migrations apply cleanly” as migration complete.

---

## Appendix A — Prisma migration order (15)

1. `20260924000000_phase1_identity_rbac`  
2. `20260924010000_phase2_candidate_core`  
3. `20260924020000_phase3_application_core`  
4. `20260924030000_phase4_task_core`  
5. `20260924040000_phase5_qa_approval_core`  
6. `20260925000000_phase6_submission_core`  
7. `20260925000001_remove_submission_issue_correction_columns`  
8. `20260925000002_phase7_communication_core`  
9. `20260925000003_phase8_admin_privacy_core`  
10. `20260925000004_optional_candidate_approval`  
11. `20260926000000_employee_onboarding_designation_core`  
12. `20260926010000_task_governance_policy_core`  
13. `20260926020000_authoritative_team_lead_structure`  
14. `20260927000000_auth_rate_limiting_core`  
15. `20260927010000_candidate_document_view_security_audit`

---

## Appendix B — Risk register (summary)

| # | RISK | IMPACT | MITIGATION | VERIFICATION |
|---|---|---|---|---|
| 1 | Auth users not migrated / UUID mismatch | Total login/RLS failure | UUID-preserving Auth migrate | Join Auth↔`users` |
| 2 | Password hashes lost | Mass password reset | Use supported Auth export/import | Sample logins |
| 3 | Sessions invalidate | Forced logout | Communicate maintenance | Expected |
| 4 | JWT secret change | Old tokens fail | Cutover window | New login works |
| 5–7 | RLS/FORCE/DEFINER drift | Data leaks or denials | Apply migrations only; run security tests | Test suites |
| 8–9 | Storage missing/policies wrong | Broken docs/evidence | Object copy + policy parity | Signed URL tests |
| 10 | Realtime misconfig | Stale notifications | Enable broadcast; service key | Bell live path |
| 11–12 | Prisma/migration order errors | Schema incomplete | Ordered migrate on empty DB | `prisma migrate` status |
| 13 | Cron secret/env | Cleanup fails | Keep `CRON_SECRET` | Manual cron hit |
| 14 | Rate limit empty | Brief stricter limits | Accept empty | Login abuse test |
| 15–17 | Audit/docs/evidence loss | Compliance failure | Mandatory preserve | Counts + spot checks |
| 18 | Email SMTP unchanged | Low | Keep SMTP | Send test |
| 19 | Vercel wrong keys | Outage | Checklist + staging first | Health + login |
| 20 | Rollback after writes | Data fork | Short freeze / dual-write ban | Rollback drill |

---

# MIGRATION READINESS

Repository Inventory: **PASS**  
Database Migration: **READY** (schema from migrations) / data move still requires execution plan  
Auth Migration: **BLOCKED** — credential/UUID migration method must be approved before execution  
RLS Migration: **READY** (from migrations; verify post-apply)  
Storage Migration: **BLOCKED** — object copy + bucket policy parity not yet specified/executed  
Realtime Migration: **READY**  
Cron Migration: **READY**  
Vercel Migration: **READY** (env swap after verification only)  
Rollback Plan: **READY**

## OVERALL:

**BLOCKED — Auth user UUID/credential migration method and Storage object copy plan must be defined and approved before any production cutover.**

*(Schema recreation and planning may proceed; production migration is not authorized by this document.)*

---

**STOP. No migration executed. No production, Supabase, or Vercel changes made.**
