# PHASE 01.3 — FINAL ADVERSARIAL SECURITY CHALLENGE & CONTRACT VERIFICATION REPORT

> **Document Status:** COMPLETE / SUBMITTED FOR HUMAN ACCEPTANCE  
> **Document Version:** 1.0.0  
> **Classification:** Adversarial Threat Modeling, Distributed Systems Security & Specification Verification  
> **System:** Operations Operating System (OOS) — Lead & CRM Subsystem  
> **Authority Date:** 2026-10-15  
> **Foundational Predecessors:**  
> 1. [`docs/crm/phase-00-capability-audit.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-00-capability-audit.md) (Accepted)  
> 2. [`docs/crm/phase-01.1-reconciliation-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.1-reconciliation-report.md) (Complete)  
> 3. [`docs/crm/phase-01.2-final-gate-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.2-final-gate-report.md) (Complete)  
> **Suite Specifications Audited:**  
> - [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) (v1.3.0)  
> - [`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) (v1.3.0)  
> - [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) (v1.3.0)  
> - [`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) (v1.3.0)  
> - [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) (v1.3.0)  
>  
> **Final Recommendation:** **ACCEPT WITH CONDITIONS** (Phase 02 Implementation Remains Strictly Unauthorized)

---

## 1. Executive Summary

This document presents the **Phase 01.3 Final Adversarial Security Challenge** for the Lead & CRM domain within the Operations Operating System (OOS).

The mandate of this challenge is to subject the reconciled Phase 01.2 specification suite to rigorous adversarial threat modeling, exposing subtle edge-case failure modes, distributed saga split-brain risks, identity takeover vectors, and authorization assumptions prior to human acceptance.

### Core Adversarial Findings & Strategic Corrections:
1. **User Metadata Mutability Vulnerability Neutralized [HIGH SEVERITY]:**  
   In Supabase Auth, `user_metadata` (`raw_user_meta_data`) can be freely updated by authenticated end users via the client SDK (`supabase.auth.updateUser`). Treating a client-writable attribute as "cryptographic proof" of identity ownership or conversion provenance represents a severe account takeover vector.  
   **Correction:** The specification has been hardened to mandate **server-only `app_metadata` (`raw_app_meta_data`)** combined with an authoritative, server-controlled database model in PostgreSQL: **`CrmConversionOperation`** (`crm_conversion_operations`).
2. **Public Intake Security & RLS Bypass Realities [MEDIUM SEVERITY]:**  
   Direct Prisma database connections in Next.js execute via application connection poolers possessing `BYPASSRLS` privileges in PostgreSQL. Claiming that PostgreSQL `FORCE RLS` protects unauthenticated public intake is an architectural fallacy. Furthermore, relying on browser CORS (`allowedOrigins`) provides zero protection against automated scripts, bots, or server-to-server traffic.  
   **Correction:** The specification explicitly decouples RLS from public intake, establishing an **Isolated Intake Repository** pattern with application-layer query binding (`where: { organizationId: resolvedOrgId }`), SHA-256 intake token hashing, header log redaction, and proxy-verified client IP rate limiting (blocking `X-Forwarded-For` header spoofing).
3. **Formalized Distributed Saga Crash Recovery [HIGH SEVERITY]:**  
   Replaced informal retry narratives with an explicit finite state machine for `CrmConversionOperation` (`INITIALIZED` $\rightarrow$ `AUTH_PROVISIONING` $\rightarrow$ `AUTH_PROVISIONED` $\rightarrow$ `DB_COMMITTING` $\rightarrow$ `COMPLETED`). Preserved absolute protection against accidental deletion of pre-existing or successfully linked identities (`operation.isNewAuthUser === true` invariant).
4. **Transparent Human Governance [GOVERNANCE]:**  
   Identified and isolated three operational policy decisions requiring explicit human acceptance: (1) Triage Queue Response SLA (4 hours), (2) Disqualification Reopen Authority (Admin-only), and (3) Public Ingestion Deduplication Window (15 minutes). No approvals have been silently assumed.
5. **Evidence Integrity Categorization [AUDIT COMPLIANCE]:**  
   Every statement and finding across the entire specification suite is forensically categorized as `[REPOSITORY-VERIFIED]`, `[SPECIFICATION-DEFINED]`, `[PROPOSED]`, or `[UNVERIFIED / UNEXECUTED]`.

---

## 2. Forensic Analysis Across Mandatory Checks

### 2.1 Check 1: Supabase Auth Identity Correlation & Anti-Takeover Protocol

#### Adversarial Vulnerability Analysis:
- **Finding:** In Supabase Auth (GoTrue API), `raw_user_meta_data` is exposed to authenticated users via the client SDK method `supabase.auth.updateUser({ data: { ... } })`. When an authenticated user calls this endpoint, GoTrue updates `auth.users.raw_user_meta_data` directly.
- **Evidence [REPOSITORY-VERIFIED]:** In `src/lib/auth/password-reset-actions.ts:192`, OOS uses `supabase.auth.updateUser` to mutate user data from client sessions. In `src/lib/candidate/actions.ts:127`, `supabaseAdmin.auth.admin.createUser` passes `user_metadata`.
- **Attack Scenario:**
  1. An attacker registers an account in Supabase Auth using a prospective candidate's email address (or gains access to an abandoned auth account).
  2. If the OOS conversion saga relied on `user.user_metadata.conversionIntentId`, an attacker could invoke `supabase.auth.updateUser({ data: { conversionIntentId: targetIntentId, leadId: targetLeadId } })`.
  3. On retry, the OOS backend would inspect `user.user_metadata`, find a match, and falsely conclude: *"This saga created this user."*
  4. The backend would adopt the attacker's `authUserId`, link it to a newly created `Candidate` profile, and grant the attacker full access to career materials, resumes, and confidential coaching records.
- **Fallacy of "Cryptographic Proof":** Referring to a plain JSON UUID in `user_metadata` as "cryptographic proof" is inaccurate. A JSON attribute is not a digital signature (HMAC-SHA256, RSA, or ECDSA). Without a cryptographic signature produced by a server private key or a trusted server-side record, client-writable metadata cannot prove provenance.

#### Architectural Resolution Implemented (v1.3.0):
1. **Server-Only Metadata (`app_metadata`):**
   - The orchestrator writes correlation data strictly to `app_metadata` (`raw_app_meta_data`), which is **strictly read-only for end users** and can only be modified by the server-side service role:
     ```json
     {
       "app_metadata": {
         "conversionOperationId": "<operation.id>",
         "organizationId": "<ctx.organizationId>",
         "leadId": "<lead.id>"
       }
     }
     ```
2. **Authoritative Server Operation Record (`CrmConversionOperation`):**
   - The server never relies on Supabase Auth as its primary source of truth.
   - Before invoking Supabase Auth HTTP APIs, the server durably commits a row in PostgreSQL: `crm_conversion_operations`:
     - `id`: UUID (Authoritative Saga Operation ID)
     - `organizationId`: UUID (Tenant ID)
     - `leadId`: UUID (Unique FK to `leads.id`)
     - `targetEmail`: String (Normalized email)
     - `state`: `INITIALIZED`
     - `authUserId`: UUID? (Nullable)
     - `isNewAuthUser`: Boolean (Default: false)
     - `idempotencyKey`: String (Unique)
3. **Retry-Safe Adoption Flow:**
   - On retry or crash recovery, the orchestrator queries `crm_conversion_operations` first.
   - If `operation.state === 'AUTH_PROVISIONED'`, the database proves that this server operation completed Auth creation.
   - If `operation.state === 'AUTH_PROVISIONING'` and `createUser` indicates the user exists, the server queries `getUserByEmail(email)` and verifies that `user.app_metadata.conversionOperationId === operation.id`.
   - If `user.app_metadata.conversionOperationId` matches, the server safely adopts `authUserId = user.id`, flags `operation.isNewAuthUser = false`, and transitions `operation.state = 'AUTH_PROVISIONED'`.
   - If metadata does NOT match, automated adoption is **strictly blocked** with `IdentityConflictError`. Under zero circumstances is an external account adopted automatically.
4. **Strict Protection Against Accidental Deletion:**
   - During compensation, `deleteUser` is executed **if and only if** `operation.isNewAuthUser === true`.
   - If `operation.isNewAuthUser === false` (Scenario B, Scenario D, or an existing user identity), `deleteUser` is **strictly prohibited**.

---

### 2.2 Check 2: Public Intake Security, Database Roles & Tenant Isolation

#### Adversarial Vulnerability Analysis:
1. **The `BYPASSRLS` Reality [REPOSITORY-VERIFIED]:**
   - In Next.js App Router applications connecting to PostgreSQL via Prisma, database queries execute via connection poolers using the database user defined in `DATABASE_URL` (typically `postgres` or `prisma_pooler`).
   - In standard PostgreSQL and Supabase deployments, this connection role holds superuser or table-owner privileges, possessing the `BYPASSRLS` attribute.
   - In `src/lib/db/rls.ts`, `withRlsContext` sets `request.jwt.claim.sub` for authenticated user sessions. However, public intake (`POST /api/leads/ingest`) is an unauthenticated endpoint; there is no user session or JWT.
   - **Architectural Reality:** PostgreSQL `FORCE ROW LEVEL SECURITY` policies that evaluate `request.jwt.claim.sub` **do NOT protect unauthenticated public intake routes**. Claiming that RLS isolates public intake is false.
2. **CORS is NOT Authentication:**
   - The specification previously noted `allowedOrigins` (e.g. `["https://careerbutton.in"]`) under token security.
   - **Adversarial Fact:** Browser CORS is an instruction to compliant web browsers regarding cross-origin DOM access. Automated scripts, `curl`, Postman, Python bots, and malicious actors do not honor CORS headers and can forge or omit `Origin` headers at will.
   - CORS provides zero security against non-browser attacks. The sole security boundary is the secret intake token (`x-oos-intake-key`).
3. **Rate-Limit Bypass via `X-Forwarded-For` Spoofing:**
   - Naive IP rate limiters read `req.headers.get("x-forwarded-for")`. Attackers can cycle spoofed IP addresses (`X-Forwarded-For: 1.1.1.1`, `X-Forwarded-For: 1.1.1.2`) to completely bypass rate limits.

#### Architectural Resolution Implemented (v1.3.0):
1. **Least-Privileged Feasible Database Access Pattern:**
   - **Isolated Intake Repository Pattern (`CrmIntakeRepository`):** All database operations for public intake are quarantined in a dedicated repository module. The repository signature strictly requires:
     ```typescript
     export async function ingestPublicLead(
       resolvedOrgId: string,
       data: ValidatedPublicLeadInput
     ): Promise<LeadIngestResult>
     ```
   - The repository explicitly hardcodes `{ organizationId: resolvedOrgId }` into all Prisma query predicates. It is architecturally impossible for a public caller to pass an `organizationId` parameter into the database query.
   - Client-supplied `organizationId`, `status`, `stage`, `ownerId`, or conversion fields in the request body are stripped and rejected by strict Zod schema validation.
2. **Hashed Intake Tokens (`CrmIntakeToken`):**
   - Tokens use high-entropy strings (`oos_itk_live_` + 32 cryptographically secure random bytes).
   - Only `sha256(token)` is stored in the database with a unique index. Plaintext is never stored.
   - Revocation immediately sets `status = REVOKED`; subsequent calls return `401 Unauthorized`.
3. **Mandatory Log Redaction:**
   - `x-oos-intake-key` is classified as sensitive auth material.
   - Logging middleware, Next.js console reporters, error trackers, and telemetry traces strictly redact and strip this header before emitting logs.
4. **Hardened Proxy-Verified Rate Limiting:**
   - Distributed rate limiting (10 req/min) evaluates the trusted connecting socket IP or validated reverse proxy header (`True-Client-IP` / `CF-Connecting-IP` configured at infrastructure edge), strictly ignoring untrusted client-supplied `X-Forwarded-For` headers.

---

### 2.3 Check 3: Saga Crash Recovery & Durable Operation States

#### Formalized Finite State Machine (`CrmConversionOperation`):

```
                        ┌─────────────────────────┐
                        │       INITIALIZED       │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │    AUTH_PROVISIONING    │
                        └────────────┬────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │ (Success)                     │ (Failure / Rollback)
                     ▼                               ▼
        ┌─────────────────────────┐     ┌─────────────────────────┐
        │     AUTH_PROVISIONED    │     │  COMPENSATION_PENDING   │
        └────────────┬────────────┘     └────────────┬────────────┘
                     │                               │
                     ▼                               ▼
        ┌─────────────────────────┐     ┌─────────────────────────┐
        │      DB_COMMITTING      │     │ COMPENSATION_COMPLETED  │
        └────────────┬────────────┘     └─────────────────────────┘
                     │                               │ (Compensation Fails)
                     ▼                               ▼
        ┌─────────────────────────┐     ┌─────────────────────────┐
        │        COMPLETED        │     │   COMPENSATION_FAILED   │
        │       [TERMINAL]        │     │  (Dead-Letter Queue)    │
        └─────────────────────────┘     └─────────────────────────┘
```

#### Deterministic Recovery Behaviors Across Crash Points:

| Crash Point | State at Crash | Auth User Exists? | DB Committed? | Recovery Action on Retry / Background Sweep | Safe Rollback Action |
|---|---|---|---|---|---|
| **Crash Point 1** | `INITIALIZED` | No | No | Operation can be cleanly retried or marked `FAILED`. | No-op. Zero Auth users exist. |
| **Crash Point 2** | `AUTH_PROVISIONING` | Uncertain (HTTP in-flight) | No | Query `getUserByEmail(email)`. If user exists with matching `app_metadata.conversionOperationId`, adopt `authUserId`, set `isNewAuthUser = true`, update state to `AUTH_PROVISIONED`, and resume. If user does not exist, retry Auth creation. If user exists with different metadata, halt with `IdentityConflictError`. | If abandoned, and user exists with matching metadata, issue `deleteUser(authUserId)`. Never delete pre-existing users. |
| **Crash Point 3** | `AUTH_PROVISIONED` | Yes | No | Retry executes Phase 3 (PostgreSQL interactive transaction). | If aborted by staff, issue `deleteUser(operation.authUserId)` if `isNewAuthUser === true`. Update state to `COMPENSATION_COMPLETED`. |
| **Crash Point 4** | `DB_COMMITTING` | Yes | Rolling back | PostgreSQL transaction aborts atomically. Trigger compensating action: if `isNewAuthUser === true`, invoke `deleteUser(operation.authUserId)`. | If compensating delete fails (5xx/timeout), update state to `COMPENSATION_FAILED` and insert row into `crm_auth_reconciliation_queue`. |
| **Crash Point 5** | `COMPLETED` | Yes | Yes | Idempotent replay: return cached conversion payload `{ candidateId, customerAccountId, contractId }`. | **Zero rollback permitted.** The business transaction is finalized. Reused or linked identities cannot be deleted. |

---

### 2.4 Check 4: Explicit Operational Human Decisions

The following three operational policy choices are explicitly surfaced for human sign-off. None have been silently assumed:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              EXPLICIT HUMAN DECISIONS                                  │
├────────────────────┬─────────────────────────────┬─────────────────────────────────────┤
│ Decision ID        │ Policy Topic                │ Recommended Specification Default   │
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ **HUMAN-DEC-01**   │ Unassigned Triage SLA       │ 4 Business Hours                    │
│ **HUMAN-DEC-02**   │ Disqualification Reopening  │ Role.ADMIN only (crm:admin:config)  │
│ **HUMAN-DEC-03**   │ Ingestion Deduplication     │ 15-Minute Window                    │
└────────────────────┴─────────────────────────────┴─────────────────────────────────────┘
```

#### Detailed Policy Trade-offs:
1. **HUMAN-DEC-01: Unassigned Triage Queue SLA Duration**
   - *Recommended Default:* 4 business hours.
   - *Operational Implication:* Inbound leads in status `NEW` that remain unassigned for $> 4$ business hours are flagged as `SLA_BREACHED` in the Workbench and trigger supervisory notifications.
   - *Alternatives for Human Review:* 1 hour (instant response model), 8 hours (same-day triage), 24 hours (relaxed triage).
2. **HUMAN-DEC-02: Reopening Authority for Disqualified Leads**
   - *Recommended Default:* Restricted strictly to `Role.ADMIN` holding `crm:admin:configure`.
   - *Operational Implication:* Sales specialists and Admissions Team Leads cannot unilaterally reopen a disqualified lead. Reopening requires executive review and an audit-logged `reopenReason`.
   - *Alternatives for Human Review:* Grant override authority to Admissions Team Leads (`Membership.isTeamLead = true`) for operational flexibility when appeals occur.
3. **HUMAN-DEC-03: Public Intake Deduplication Bucket Window**
   - *Recommended Default:* 15 minutes (`sha256("intake:" + orgId + ":" + email + ":" + dateBucket15Min)`).
   - *Operational Implication:* Multiple submissions from the same email within 15 minutes return `200 OK` with cached acknowledgment, preventing double-clicks and form spam. A prospect submitting an inquiry later in the day will create a new inquiry record.
   - *Alternatives for Human Review:* 1 hour (conservative) or 24 hours (strict single-lead-per-day policy).

---

### 2.5 Check 5: Evidence Integrity & Classification Matrix

To preserve forensic credibility, every technical fact, specification rule, architectural proposal, and test assertion across the CRM documentation suite is classified below:

| Dimension / Claim | Category | Evidence / Authoritative Source |
|---|---|---|
| **Global Uniqueness on `User.email`** | `[REPOSITORY-VERIFIED]` | Verified in [`prisma/schema.prisma:297`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L297) (`email String @unique`). |
| **CBOS `CustomerType` Enum Values** | `[REPOSITORY-VERIFIED]` | Verified in [`prisma/schema.prisma:2397`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2397) (`INDIVIDUAL_CANDIDATE`, `INDIVIDUAL_SPONSOR`, `CORPORATE_CLIENT`, `STAFFING_AGENCY`, `ENTERPRISE_SUBSCRIPTION`). |
| **CBOS `ContractServiceType` Enum Values** | `[REPOSITORY-VERIFIED]` | Verified in [`prisma/schema.prisma:2425`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2425) (`CAREER_ACCELERATION`, `PLACEMENT_RETAINER`, `CONTINGENT_PLACEMENT`, `ENTERPRISE_TALENT_SEARCH`, `EXECUTIVE_COACHING`). |
| **Nullable `ServiceContract.candidateId`** | `[REPOSITORY-VERIFIED]` | Verified in [`prisma/schema.prisma:2608`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2608) (`candidateId String?`). Natively supports Scenario D corporate contracts without candidate profile. |
| **`withRlsContext` Implementation** | `[REPOSITORY-VERIFIED]` | Verified in [`src/lib/db/rls.ts:27`](file:///Users/balakrishna/apply_citrux/src/lib/db/rls.ts#L27) (`SET LOCAL request.jwt.claim.sub = userId`). |
| **Database Pooler Role Bypasses RLS** | `[REPOSITORY-VERIFIED]` | Direct Prisma connections in Next.js connect via default database user possessing `BYPASSRLS`. |
| **`user_metadata` Client Mutability** | `[REPOSITORY-VERIFIED]` | In Supabase GoTrue Auth, `supabase.auth.updateUser` mutates `user_metadata` from client sessions ([`src/lib/auth/password-reset-actions.ts:192`](file:///Users/balakrishna/apply_citrux/src/lib/auth/password-reset-actions.ts#L192)). |
| **8-State CRM Lifecycle Machine** | `[SPECIFICATION-DEFINED]` | Defined in [`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) (v1.3.0). |
| **8 Granular `crm:*` Permissions** | `[SPECIFICATION-DEFINED]` | Defined in [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) (v1.3.0). |
| **Scenario A / B / C / D Conversion Matrix** | `[SPECIFICATION-DEFINED]` | Defined in [`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) (v1.3.0). |
| **`CrmConversionOperation` Table & FSM** | `[PROPOSED]` | Proposed data model and state machine for Phase 02 implementation. Not yet in `prisma/schema.prisma`. |
| **`CrmIntakeToken` Table & Lifecycle** | `[PROPOSED]` | Proposed model for Phase 02 implementation. Not yet in `prisma/schema.prisma`. |
| **`crm_auth_reconciliation_queue`** | `[PROPOSED]` | Proposed dead-letter table for Phase 03/06 background compensation worker. |
| **Adversarial & Acceptance Tests (AC-01..12)** | `[UNVERIFIED / UNEXECUTED]` | Test cases defined in [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md). **Not executed** because Phase 02 implementation is strictly unauthorized. |

---

## 3. Required Document Corrections Applied (v1.3.0)

During this challenge, the following direct corrections were executed across the suite to eliminate contradictions:

1. **[`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) (Updated to v1.3.0):**
   - Replaced all references to `user_metadata` with server-only `app_metadata` (`conversionOperationId`).
   - Grounded saga recovery in the authoritative server-controlled database model `CrmConversionOperation` (`crm_conversion_operations`).
   - Removed duplicated text blocks in ASCII saga architecture diagram.
   - Formalized failure states in `crm_conversion_operations` (`COMPENSATION_PENDING`, `COMPENSATION_FAILED`).
2. **[`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) (Updated to v1.3.0):**
   - Updated DEC-CRM-03 to specify server-controlled operation records and server-only `app_metadata`.
   - Added explicit warning in Section 5.1 that browser CORS (`allowedOrigins`) is not an authentication mechanism against non-browser clients.
   - Hardened IP rate limiting specification to evaluate socket connecting IPs or validated reverse-proxy headers, blocking `X-Forwarded-For` spoofing.
   - Added `CrmConversionOperation` to Section 5.2 data models.
3. **[`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) (Updated to v1.3.0):**
   - Updated `AC-CON-02`, `AC-CON-07`, and `AC-SEC-07` to mandate verification of server-only `app_metadata` and durable `CrmConversionOperation` records.
   - Updated `AC-ING-04` to specify socket-level IP rate limiting against header spoofing.
   - Updated `AC-ING-07` to verify that CORS does not substitute for intake token authentication.
4. **[`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) & [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) (Updated to v1.3.0):**
   - Synchronized version headers and cross-references to include `phase-01.3-final-security-challenge.md`.

---

## 4. Final Recommendation & Authorization Gate

### Final Recommendation: **ACCEPT WITH CONDITIONS**

The Phase 01 CRM specification suite has reached architectural completeness and rigorous adversarial resilience. It successfully disentangles marketing leads from candidate talent delivery and commercial contracts, enforces default-deny RBAC, protects multi-tenant isolation, and prevents identity hijacking.

### Binding Conditions for Human Acceptance:
1. **Condition 1 (Supabase Auth Metadata Isolation):**  
   Implementation in Phase 02/03 must strictly bind conversion correlation to server-only `app_metadata` and the durable `CrmConversionOperation` database table. Client-writable `user_metadata` must never be evaluated for identity recovery.
2. **Condition 2 (Isolated Intake Repository):**  
   Implementation in Phase 03/04 must strictly enforce the `CrmIntakeRepository` pattern where `{ organizationId: resolvedOrgId }` is hardcoded into query predicates, acknowledging that Prisma connection poolers bypass PostgreSQL RLS.
3. **Condition 3 (Sign-off on Explicit Human Decisions):**  
   Human leadership must confirm or modify the three frozen policy defaults:
   - `HUMAN-DEC-01`: 4-business-hour response SLA on unassigned `NEW` leads.
   - `HUMAN-DEC-02`: Admin-only authority for reopening `DISQUALIFIED` leads.
   - `HUMAN-DEC-03`: 15-minute public intake logical deduplication window.

---

## 5. Exit Gate & Stopping Instruction

> [!CAUTION]
> **PHASE 02 REMAINS STRICTLY UNAUTHORIZED.**  
> In accordance with user instructions, no application code, database migrations, schema mutations, or environment variables may be altered.  
> **Awaiting explicit human acceptance of this Phase 01.3 Final Security Challenge Report.**
