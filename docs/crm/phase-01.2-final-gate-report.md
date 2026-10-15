# PHASE 01.2 — FINAL SECURITY AND CONTRACT CONSISTENCY GATE REPORT

> **Document Status:** COMPLETE / SUBMITTED FOR HUMAN ACCEPTANCE  
> **Document Version:** 1.0.0  
> **Classification:** Security Engineering, Distributed Systems Architecture & Specification Gate  
> **System:** Operations Operating System (OOS) — Lead & CRM Subsystem  
> **Authority Date:** 2026-10-15  
> **Foundational Predecessor:** [`docs/crm/phase-00-capability-audit.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-00-capability-audit.md) (Accepted)  
> **Reconciliation Predecessor:** [`docs/crm/phase-01.1-reconciliation-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.1-reconciliation-report.md)  
> **Documents Verified:**
> 1. [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) (v1.2.0)
> 2. [`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) (v1.2.0)
> 3. [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) (v1.2.0)
> 4. [`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) (v1.2.0)
> 5. [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) (v1.2.0)
> 6. [`docs/crm/phase-01.1-reconciliation-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.1-reconciliation-report.md) (v1.0.0)
>
> **Implementation Authorization:** NOT AUTHORIZED (Gate Complete — Phase 02 unauthorized until explicit human sign-off)

---

## 1. Executive Summary

This document serves as the authoritative **Phase 01.2 Final Security and Contract Consistency Gate Report** for the Lead & CRM domain within the Operations Operating System (OOS).

Following the initial reconciliation conducted in Phase 01.1, a rigorous architectural and security review was executed across all six Phase 01 specification documents to eliminate remaining edge-case vulnerabilities, distributed transaction inaccuracies, enum discrepancies, and lifecycle contradictions before human acceptance.

### Key Gate Findings & Resolutions:
1. **Supabase Auth Anti-Takeover Protocol:** Neutralized a critical identity takeover vulnerability. Adopting an existing Supabase Auth user based solely on an email match is strictly banned. Retry recovery is permitted only when cryptographic intent metadata (`conversionIntentId`, `leadId`, `organizationId`) matches the active conversion operation. Reused or pre-existing identities are strictly protected from deletion during compensating rollbacks.
2. **Distributed Conversion Semantics:** Stripped all false claims of cross-system "atomic conversion" across Supabase Auth HTTP APIs and PostgreSQL. Conversion is specified as a four-phase **Idempotent Compensating Saga** with row-level concurrency locking (`SELECT ... FOR UPDATE`), stable logical idempotency keys, an atomic single-transaction PostgreSQL commit, and a dead-letter queue (`crm_auth_reconciliation_queue`) for failed compensation.
3. **CBOS Schema and Enum Verification:** Verified all commercial relationship types, customer types, service contract types, and contract statuses directly against [`prisma/schema.prisma`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2397-L2450). Zero enum values were invented. Prospective inquiry categories are strictly decoupled from commercial contract tiers; converting a lead requires selecting an authoritative CBOS contract tier.
4. **Lifecycle & Ownership Consistency:** Reconciled transition guards out of `NEW`. Transitioning to active pipeline stages (`CONTACTED`, `CONSULTATION_SCHEDULED`, `QUALIFYING`, `QUALIFIED`, `CONVERTED`) strictly requires an assigned owner. Direct closure of spam/bot submissions to `DISQUALIFIED` or duplicate submissions to `LOST` is explicitly exempt from owner assignment. Clarified that qualified leads in commercial negotiation remain in `QUALIFIED` with `nextFollowUpAt` tracking proposal expiration.
5. **Public Intake Security & RLS Bypass Realities:** Demystified database connection roles. Unauthenticated public intake routes (`/api/leads/ingest`) connect via Prisma poolers that bypass PostgreSQL RLS (`BYPASSRLS`). The specification explicitly establishes application-layer token-to-organization binding (`CrmIntakeToken`), SHA-256 token hashing, header log redaction (`x-oos-intake-key`), and strict input parameter stripping as the authoritative security boundary.
6. **Acceptance Criteria & Adversarial Testing:** Expanded acceptance criteria to include adversarial identity takeover prevention, timeout recovery, concurrent conversion serialization, CBOS enum validation, and log redaction verification. Every criterion is mapped to an authoritative contract rule.

All five core specification documents have been synchronized to **Version 1.2.0**. No application code, database migrations, or production data were modified during this gate.

---

## 2. Forensic Audit Across Mandatory Checks

### 2.1 Check 1: Supabase Auth Identity Recovery & Anti-Takeover

#### Forensic Analysis:
In distributed architectures utilizing an external identity provider (Supabase Auth via HTTP Admin API) alongside a relational application database (PostgreSQL), naive identity recovery introduces severe security hazards:
- **Pre-Account Takeover Hazard:** If an external lead submits an email address that happens to match an existing Supabase Auth identity (e.g. an unverified signup, an alumni user, or an account created in another application instance), adopting that `authUserId` without secondary verification attaches a new, unverified person to someone else's authentication identity.
- **Cross-Tenant Enumeration Hazard:** Checking whether an email exists globally in Supabase Auth and returning an error such as *"User already exists in another tenant"* leaks organizational membership and confidential talent information across multi-tenant boundaries.
- **Accidental Deletion of Existing Accounts:** If conversion fails during the PostgreSQL transaction, blindly issuing `deleteUser(authUserId)` in a rollback handler would destroy pre-existing user accounts or alumni profiles that were merely being linked.

#### Architectural Resolution Implemented (v1.2.0):
1. **Never Adopt Based Solely on Email Match:** An email match alone **never** triggers automated adoption of an existing Supabase Auth identity.
2. **Cryptographic Intent Correlation Protocol:**
   - When initiating Auth user creation, the orchestrator injects immutable metadata:
     ```json
     {
       "user_metadata": {
         "conversionIntentId": "<unique-saga-uuid>",
         "organizationId": "<ctx.organizationId>",
         "leadId": "<lead.id>"
       }
     }
     ```
   - If `createUser` times out or returns `"already been registered"`:
     - The orchestrator fetches the user via `getUserByEmail(email)`.
     - **Legitimate In-Flight Retry Test:** If and only if `user.user_metadata.conversionIntentId === intent.id` AND `user.user_metadata.leadId === lead.id` AND `user.user_metadata.organizationId === ctx.organizationId`, the orchestrator confirms that *this exact conversion operation* created the user immediately prior to the network interruption. It safely adopts `authUserId = user.id` and marks `isNewAuthUser = false`.
     - **Identity Conflict / Hijacking Attempt:** If the metadata does not match, automated adoption is **strictly blocked**.
       - If the email belongs to an existing `Candidate` in *this organization*, the conversion aborts with `IdentityReuseRequiredError`, instructing staff to execute **Scenario B (Returning Talent Identity Reuse)** with secondary identity verification.
       - If the email exists in Auth but has zero profile in this tenant (cross-tenant user or external signup), automated conversion is **halted** with `IdentityConflictError: "Email address is associated with an existing account. Please verify candidate identity or use an alternate email address."` Zero information regarding external tenant membership is disclosed.
3. **Strict Non-Deletion Invariant:** The compensating delete handler checks `if (isNewAuthUser === true)`. If `isNewAuthUser === false` (Scenario B, Scenario D, or pre-existing identity), `deleteUser` is **strictly prohibited**.
4. **Distinguishing Uncertain Outcomes from Confirmed Creation:** A network timeout (HTTP 504 / ECONNRESET) from Supabase Auth is treated as an uncertain state. The orchestrator never assumes creation failed; it issues a verification query (`getUserByEmail`) to determine whether the identity was committed before deciding whether to proceed or abort.
5. **Failed Compensation & Dead-Letter Queue:** If the compensating delete of a newly created auth user fails (e.g. Supabase Auth API down), the orchestrator:
   - Emits a high-severity `AuditEvent` (`AuditAction.SYSTEM_ALERT`, `{ issue: 'FAILED_AUTH_COMPENSATION', authUserId, conversionIntentId }`).
   - Inserts a durable row into `crm_auth_reconciliation_queue`.
   - A periodic reconciliation worker queries the queue, verifies against PostgreSQL whether any `User` row was ever created for `authUserId`, and if zero DB record exists after 1 hour, safely executes the compensating delete with exponential backoff.

---

### 2.2 Check 2: Distributed Conversion Semantics & Transaction Guarantees

#### Forensic Analysis:
Distributed transactions across HTTP APIs (Supabase Auth Admin) and relational databases (PostgreSQL) cannot participate in a single ACID two-phase commit (2PC). Previous specification drafts that used terms like "atomic conversion across Supabase Auth and CBOS" obscured network partition risks, concurrency races, and crash recovery requirements.

#### Architectural Resolution Implemented (v1.2.0):
1. **Explicit Saga Redefinition:** Conversion is officially defined as an **Idempotent Compensating Saga** consisting of four distinct phases:

```
[Phase 1: Concurrency Lock & Idempotency Reservation]
     │ Lock Lead row: SELECT ... FOR UPDATE WHERE id = leadId AND status = 'QUALIFIED'.
     │ Verify stable logical idempotency key: `crm-convert:${leadId}:${serviceTier}:${candidateMode}`
     ▼
[Phase 2: Auth Identity Provisioning (HTTP Admin API)]
     │ Scenario A & C: Call createUser with conversionIntentId metadata.
     │ Scenario B & D: Skip Auth creation entirely.
     ▼
[Phase 3: Single PostgreSQL Interactive Transaction with RLS Context]
     │ Execute atomically within withRlsContext:
     │ 1. Insert User (linking authUserId, for Scenario A & C)
     │ 2. Insert Candidate (for Scenario A, B, & C)
     │ 3. Insert CustomerAccount (CBOS)
     │ 4. Insert CustomerCandidateRelationship (for Scenario A, B, & C)
     │ 5. Insert ServiceContract, ServiceContractVersion, Entitlements, PricingTerms (CBOS)
     │ 6. Update Lead: status = 'CONVERTED', set converted foreign keys, convertedAt = NOW()
     │ 7. Insert LeadStageHistory: fromStatus = 'QUALIFIED', toStatus = 'CONVERTED'
     │ 8. Insert AuditEvent: AuditAction.LEAD_CONVERTED
     ▼
[Phase 4: Post-Commit Notifications (Non-Blocking)]
       Dispatch Welcome / Portal Activation Email asynchronously.
```

2. **Exact PostgreSQL Transaction Boundary:** Exactly eight operations (items 1–8 in Phase 3) execute within a single PostgreSQL interactive transaction (`withRlsContext`). If any database constraint fails, all eight database mutations roll back atomically.
3. **Concurrency Protection:** Row-level locking (`SELECT ... FOR UPDATE`) on the `Lead` row prevents race conditions. A second concurrent request for the same lead blocks until the first completes. Once committed, the second request sees `status = 'CONVERTED'` and immediately returns the cached conversion payload via idempotency.
4. **Stable Logical Idempotency Key:** `crm-convert:${leadId}:${serviceTier}:${candidateMode}`. Dynamic timestamps are strictly banned from idempotency keys. Replays of identical requests return the existing record without duplicate insertions.
5. **Harmonized Completion Invariant:** Across all documents, a conversion is complete **if and only if**:
   - `Lead.status == 'CONVERTED'` is committed in PostgreSQL.
   - `Lead.convertedCustomerAccountId IS NOT NULL`.
   - `Lead.convertedContractId IS NOT NULL`.
   - `Lead.convertedCandidateId IS NOT NULL` (for Candidate Scenarios A, B, and C; strictly `NULL` for Scenario D).
   - An append-only `LeadStageHistory` row recording `fromStatus = 'QUALIFIED'` and `toStatus = 'CONVERTED'` is committed.
   - An append-only `AuditEvent` (`LEAD_CONVERTED`) is committed.

---

### 2.3 Check 3: CBOS Schema and Enum Verification

#### Forensic Analysis:
To prevent discrepancies between proposed CRM conversion actions and existing commercial data models, the actual active schema file [`prisma/schema.prisma`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma) was audited line-by-line.

#### Verified Schema Facts (Active in `prisma/schema.prisma`):
- **`enum CustomerType`** ([Line 2397](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2397)):
  - `INDIVIDUAL_CANDIDATE` — Verified. Used in Scenario A & B.
  - `INDIVIDUAL_SPONSOR` — Verified. Used in Scenario C.
  - `CORPORATE_CLIENT` — Verified. Used in Scenario D and corporate sponsors.
  - `STAFFING_AGENCY` — Verified. Available for agency partners.
  - `ENTERPRISE_SUBSCRIPTION` — Verified. Available for enterprise packages.
- **`enum ContractServiceType`** ([Line 2425](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2425)):
  - `CAREER_ACCELERATION` — Verified. Primary candidate career program.
  - `PLACEMENT_RETAINER` — Verified. Retainer-based placement search.
  - `CONTINGENT_PLACEMENT` — Verified. Contingent employer recruiting fee.
  - `ENTERPRISE_TALENT_SEARCH` — Verified. Retained corporate executive search.
  - `EXECUTIVE_COACHING` — Verified. Leadership/executive guidance tier.
- **`enum CustomerCandidateRelationType`** ([Line 2412](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2412)):
  - `SELF_FUNDING` — Verified. Self-paying candidate.
  - `SPONSOR` — Verified. Third-party sponsor / guarantor.
  - `CORPORATE_RECRUITING_PARTNER` — Verified. Employer hiring partner.
  - `STAFFING_AGENCY` — Verified. Staffing agency intermediary.
- **`enum ContractStatus`** ([Line 2441](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2441)):
  - `DRAFT`, `PENDING_SIGNATURE`, `ACTIVE`, `FULFILLED`, `EXPIRED`, `TERMINATED`, `CANCELLED` — Verified.
- **`model ServiceContract`** ([Line 2604](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2604)):
  - `candidateId String?` — Verified nullable. Confirms that Scenario D (B2B corporate contract without a candidate) is natively supported by the database schema without schema mutations.

#### Reconciled Rules & Decisions:
- **Zero Invented Enums:** No new enum values were added to `CustomerType`, `ContractServiceType`, or `CustomerCandidateRelationType`.
- **Prospective Inquiries vs Commercial Contracts:** Prospective leads may arrive from public web forms with general inquiry categories (e.g. "general inquiry", "pricing question"). However, **conversion to CBOS strictly requires selecting a valid `ContractServiceType`**. A general inquiry cannot be converted into a contract without staff selecting an authoritative contract service tier.

---

### 2.4 Check 4: Lifecycle Consistency & Operational Nuances

#### Forensic Analysis:
Inconsistencies identified in previous drafts regarding owner assignment rules and the proposal in-flight period:
- **Triage vs Disqualification Contradiction:** Stating that "moving out of `NEW` strictly requires an assigned owner" prevented triage staff from closing spam bot submissions or duplicate inquiries without artificially claiming ownership.
- **Ambiguity in Qualified State:** Prior text did not clearly describe the lead's state while reviewing a commercial contract before signing.

#### Architectural Resolution Implemented (v1.2.0):
1. **Differentiated Ownership Enforcement for Transitions out of `NEW`:**
   - **Active Pipeline Stages (`CONTACTED`, `CONSULTATION_SCHEDULED`, `QUALIFYING`, `QUALIFIED`, `CONVERTED`):** Strictly require `assignedStaffId != NULL`. An unassigned lead cannot advance into active outreach or qualification.
   - **Direct Closure (`NEW` $\rightarrow$ `DISQUALIFIED` or `NEW` $\rightarrow$ `LOST`):** **Exempt from owner assignment.** Triage staff may immediately disqualify spam submissions (`SPAM_SUBMISSION`) or close intake duplicates (`INTAKE_DUPLICATE`) directly from `NEW`. The actor performing the closure is durably recorded in `LeadStageHistory.actorId`.
2. **The Proposal In-Flight Period:**
   - When all four Admissions Qualification Gates are verified, the lead status transitions to `QUALIFIED`.
   - The lead **remains in `QUALIFIED` status** while commercial agreements are prepared, sent, reviewed, and negotiated.
   - `nextFollowUpAt` tracks the proposal expiration date or scheduled check-in call.
   - If terms are executed $\rightarrow$ `convertLeadAction` transitions the lead to `CONVERTED`.
   - If terms are declined or expire without response $\rightarrow$ staff executes transition to `LOST` with structured reason `FINANCIAL_CONSTRAINTS`, `WENT_WITH_COMPETITOR`, or `NO_REPLY_EXHAUSTED`.
3. **Immutability of `CONVERTED`:** Once converted, the lead row is permanently frozen. `convertLeadAction` is the sole server action permitted to set `status = 'CONVERTED'`. The completion invariant must be completely satisfied before this status can be committed.

---

### 2.5 Check 5: Public Intake Security & RLS Bypass Realities

#### Forensic Analysis:
Prior documentation suggested that PostgreSQL `FORCE ROW LEVEL SECURITY` protects public intake routes. In reality, public intake (`POST /api/leads/ingest`) is an unauthenticated endpoint. The Next.js API route connects to PostgreSQL via Prisma using the application database connection pooler. In standard PostgreSQL configurations, connection pooler roles possess superuser or table owner privileges that **bypass RLS (`BYPASSRLS`)**. Claiming that RLS protects public intake is an architectural fallacy.

#### Architectural Resolution Implemented (v1.2.0):
1. **Intake Token Format & Lifecycle (`CrmIntakeToken`):**
   - High-entropy token generated only by Admins (`crm:admin:configure`): `oos_itk_live_<32_random_bytes_base64url>`.
   - Token plaintext is displayed once to the admin and **never stored in the database**.
   - The database stores `tokenHash = sha256(token)` with a unique index, along with `tokenPrefix` (first 12 characters for identification in UI), `allowedOrigins` (CORS whitelist), and `status: ACTIVE | REVOKED`.
   - Admins can issue a new token with an expiration on the older token to allow zero-downtime rotation.
   - Revocation immediately sets `status = REVOKED`; subsequent ingest calls return `401 Unauthorized`.
2. **Mandatory Log Redaction:** The HTTP intake header `x-oos-intake-key` is classified as sensitive authentication credential. Server logging middleware, console reporters, and telemetry systems **must strictly redact and strip** this header before emitting logs.
3. **Authoritative Application-Layer Tenant Isolation:**
   - Because Prisma poolers bypass RLS on unauthenticated queries, tenant isolation is enforced **100% at the application layer**.
   - The route handler hashes `x-oos-intake-key`, queries `CrmIntakeToken` by `tokenHash`, verifies that `status === 'ACTIVE'`, and extracts the bound `organizationId`.
   - The resolved `organizationId` is injected directly into the Prisma write predicate (`organizationId: token.organizationId`).
4. **Caller Tamper Prevention:**
   - Any client-supplied `organizationId`, `tenantId`, `status`, `stage`, `ownerId`, `assignedStaffId`, or conversion field is **strictly stripped and rejected** by Zod schema validation.
   - Status is hardcoded to `NEW`. Assigned owner is hardcoded to `NULL`.
5. **Abuse Controls & Logical Idempotency:**
   - Distributed IP rate limiting: max 10 requests per 60 seconds per IP address.
   - Honeypot fields (`hp_company_url`, `hp_fax_number`): if populated, returns silent `200 OK` with zero DB writes.
   - Logical idempotency key: `sha256("intake:" + token.organizationId + ":" + normalizedEmail + ":" + dateBucket15Min)`. Duplicate submissions within 15 minutes return `200 OK` with cached acknowledgment, preventing record flooding and leaking zero identity existence details.

---

### 2.6 Check 6: Acceptance Criteria & Adversarial Verification

#### Forensic Analysis:
Acceptance criteria required hardening to replace vague "atomicity" assertions with explicit saga guarantees, add adversarial edge-case tests, and ensure 100% traceability to contract rules.

#### Additions & Hardening in `phase-01-acceptance-criteria.md` (v1.2.0):
1. **AC-CON-02:** Replaced "atomically" across Auth and DB with "provisions Supabase Auth user with `conversionIntentId` metadata, followed by a single atomic PostgreSQL transaction".
2. **AC-CON-07:** Updated to mandate verification of `conversionIntentId`, `leadId`, and `organizationId` metadata during retry recovery, preventing unauthorized adoption of pre-existing identities.
3. **AC-CON-09 (New): Completion Invariant Enforcement:** Verifies that setting `status = 'CONVERTED'` outside `convertLeadAction` or without committed customer account, contract, and stage history is rejected.
4. **AC-CON-10 (New): Concurrent Conversion Row-Locking:** Verifies that concurrent conversion requests for the same lead are serialized via `SELECT FOR UPDATE` or rejected with `409 Conflict`, ensuring zero duplicate downstream entities.
5. **AC-CON-11 (New): Verified CBOS Enum Enforcement:** Verifies that passing prospective inquiry categories (e.g. `GENERAL_INQUIRY`) to `convertLeadAction` is rejected; only schema-verified `ContractServiceType` values are accepted.
6. **AC-CON-12 (New): Failed Compensation Dead-Letter Queue:** Verifies that if compensating Auth deletion fails after a DB rollback, a high-severity `AuditEvent` is logged and a row is enqueued in `crm_auth_reconciliation_queue`.
7. **AC-SEC-07 (New): Adversarial Identity Takeover Prevention:** Verifies that attempting to convert a lead whose email belongs to an existing account without matching `conversionIntentId` fails with `IdentityConflictError` and does NOT adopt the external identity.
8. **AC-ING-07 (New): Intake Token Lifecycle & Redaction:** Verifies that ingestion requests with revoked or expired tokens return `401 Unauthorized`, and that `x-oos-intake-key` is redacted from all server logs.
9. **AC-LIF-09 (New): Proposal In-Flight Stability:** Verifies that leads in `QUALIFIED` remain in `QUALIFIED` during commercial negotiation without automatic stage decay, tracking overdue check-ins via `nextFollowUpAt`.

---

## 3. Cross-Document Consistency Matrix

The following matrix confirms absolute alignment across all six CRM specification documents following the Phase 01.2 gate:

| Topic / Requirement | Product Contract (`phase-01-product-contract.md`) | Lifecycle Spec (`phase-01-lifecycle.md`) | Permission Matrix (`phase-01-permission-matrix.md`) | Conversion Contract (`phase-01-conversion-contract.md`) | Acceptance Criteria (`phase-01-acceptance-criteria.md`) | Reconciliation Report (`phase-01.1-reconciliation-report.md`) |
|---|---|---|---|---|---|---|
| **Lifecycle Model** | 8 canonical stages (Section 2.2, 5.1) | 8-state FSM with guards (Section 1, 2) | 8 stages mapped to permissions (Section 2, 4) | 8 stages, pre-condition strictly `QUALIFIED` (Section 2) | Verified via AC-LIF-01 to AC-LIF-09 | Reconciled in Section 2, Item 4 |
| **Owner Assignment Rule** | Mandatory before active stages; exempt for direct closures (Tenet 6) | Strict for active stages; exempt for spam `DISQUALIFIED` / duplicate `LOST` (Section 6.1) | Stage transition guard evaluates owner assignment (Section 4) | Conversion pre-condition requires active assigned owner (Section 2) | Verified via AC-LIF-02 | Reconciled in Section 2, Item 4 |
| **Proposal In-Flight State** | Proposal period remains in `QUALIFIED` (Section 2.2) | Proposal in-flight period documented; `nextFollowUpAt` tracks expiration (Section 3.2) | Permitted transitions from `QUALIFIED` to `CONVERTED` or `LOST` (Section 2, 4) | Event 2: Admissions Acceptance & Proposal; status remains `QUALIFIED` (Section 1) | Verified via AC-LIF-09 | Reconciled in Section 2, Item 4 |
| **Auth Anti-Takeover Protocol** | Cryptographic intent correlation; no email-only adoption (DEC-CRM-03) | N/A (Lifecycle domain) | Sensitive auth operations restricted to authorized staff (Section 4) | Full protocol: `conversionIntentId` metadata correlation, non-deletion invariant (Section 4) | Verified via AC-CON-07, AC-SEC-07 | Reconciled in Section 2, Item 2 |
| **Distributed Saga Semantics** | 4-phase saga, single-DB transaction, row locking (DEC-CRM-03, Sec 5.1) | Dedicated action `convertLeadAction` required (Section 2.1) | `crm:lead:convert` permission evaluated server-side (Section 2, 4) | Complete saga specification, failure recovery, dead-letter queue (Section 5) | Verified via AC-CON-01 to AC-CON-12 | Reconciled in Section 2, Item 2 |
| **CBOS Schema Enums** | Verified against `schema.prisma`; prospective categories decoupled (DEC-CRM-03) | `selectedServiceTier` requires valid `ContractServiceType` (Section 3.1) | Scoped commercial permissions (Section 2) | Full matrix matching `CustomerType` & `ContractServiceType` (Section 3.1) | Verified via AC-CON-05, AC-CON-11 | Reconciled in Section 2, Item 5 |
| **Public Intake & RLS Bypass** | Token lifecycle (`CrmIntakeToken`), log redaction, application-layer binding (Sec 5.1) | Unassigned triage intake, SLA (Section 1.1, 6.1) | Section 5.3: Explicit RLS bypass on connection poolers; application-layer defense | Input sanitization, tenant isolation (Section 4.1) | Verified via AC-ING-01 to AC-ING-07 | Reconciled in Section 2, Item 7 |
| **WCOS Independence** | Zero CU consumption, no `tasks` rows created (Tenet 5, DEC-CRM-07) | Dedicated CRM follow-up dates; zero delivery CU impact (Section 6.3) | CRM permissions separate from WCOS delivery (Section 2) | Conversion hands off without distorting WCOS queues (Section 6) | Verified via AC-ACT-03 | Reconciled in Section 2, Item 8 |
| **Audit & PII Redaction** | Sensitive credentials and financial details redacted (Tenet 7) | Append-only `LeadStageHistory` (Section 6.4) | New `AuditAction` enum values, metadata-only audit (Section 6) | Audit logged in Phase 3 of saga (Section 5) | Verified via AC-SEC-05, AC-SEC-06 | Reconciled in Section 2, Item 1 |

---

## 4. Classification of Knowledge: Schema Facts vs Architectural Decisions vs Unresolved Human Choices

To maintain architectural integrity and absolute clarity for human leadership, all statements across the Phase 01 specification suite are classified into three strict categories:

### 4.1 Category A: Verified Schema Facts (Active in PostgreSQL / `prisma/schema.prisma`)
The following are immutable facts verified directly from the existing repository code:
1. `User.email` holds a global unique constraint across the entire database ([`prisma/schema.prisma:297`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L297)).
2. `CustomerType` enums: `INDIVIDUAL_CANDIDATE`, `INDIVIDUAL_SPONSOR`, `CORPORATE_CLIENT`, `STAFFING_AGENCY`, `ENTERPRISE_SUBSCRIPTION` ([Line 2397](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2397)).
3. `ContractServiceType` enums: `CAREER_ACCELERATION`, `PLACEMENT_RETAINER`, `CONTINGENT_PLACEMENT`, `ENTERPRISE_TALENT_SEARCH`, `EXECUTIVE_COACHING` ([Line 2425](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2425)).
4. `CustomerCandidateRelationType` enums: `SELF_FUNDING`, `SPONSOR`, `CORPORATE_RECRUITING_PARTNER`, `STAFFING_AGENCY` ([Line 2412](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2412)).
5. `ContractStatus` enums: `DRAFT`, `PENDING_SIGNATURE`, `ACTIVE`, `FULFILLED`, `EXPIRED`, `TERMINATED`, `CANCELLED` ([Line 2441](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2441)).
6. `ServiceContract.candidateId` is nullable (`String?`), natively supporting Scenario D corporate contracts without candidate profiles ([Line 2608](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2608)).
7. `AuditEvent` exists as an authoritative append-only audit table with `AuditAction` enum ([Line 1133](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1133)).
8. Direct Prisma connections in the Next.js runtime connect via the configured database role which holds `BYPASSRLS` privileges in PostgreSQL.

### 4.2 Category B: Architectural Recommendations (Frozen in Specification v1.2.0)
The following architectural choices have been specified, reconciled, and hardened across all documentation:
1. **Compensating Saga Conversion:** Adopting an idempotent saga pattern with Supabase Auth metadata correlation rather than impossible cross-system distributed transactions.
2. **Dedicated CRM Activity Engine:** Housing sales calls, notes, and reminders in `LeadActivity` and `Lead` follow-up fields without creating WCOS `Task` rows or consuming specialist Capacity Units (CU).
3. **Application-Layer Public Ingestion Security:** Securing `/api/leads/ingest` via hashed `CrmIntakeToken` credentials, IP rate limiting, honeypot fields, and strict server-side tenant binding.
4. **Default-Deny Server RBAC:** Implementing `requireCrmPermission` with an exhaustive switch denying all unrecognized permissions and completely barring `Role.CANDIDATE`.
5. **Anti-Takeover Identity Protection:** Requiring `conversionIntentId` metadata matching for retry recovery, preventing automated adoption of unverified pre-existing accounts.

### 4.3 Category C: Explicit Unresolved Human Decisions (Awaiting Human Sign-off)
The following operational policies require explicit human acceptance before Phase 02 implementation begins:
1. **Unassigned Triage Queue SLA Duration:** The specification sets a recommended default of **4 business hours** for unassigned inbound leads. Human leadership must approve whether 4 hours is the binding operational SLA for sales management alerts.
2. **Reopening Disqualified Leads Authority:** The specification restricts reopening `DISQUALIFIED` leads to `Role.ADMIN` holding `crm:admin:configure`. Human leadership must confirm whether Admissions Team Leads should also be granted disqualification override authority.
3. **Intake Duplicate Window:** The specification sets a **15-minute window** for intake logical deduplication (`sha256("intake:" + orgId + ":" + email + ":" + dateBucket15Min)`). Human leadership must confirm whether 15 minutes is optimal or if an alternate window (e.g. 1 hour or 24 hours) is preferred for web marketing campaigns.

---

## 5. Exit Gate & Authorization Lock

### Gate Verification Status: PASSED
- [x] Supabase Auth identity recovery secured against identity hijacking; retry recovery verified via intent correlation; pre-existing identities protected from deletion.
- [x] Distributed conversion semantics stripped of cross-system ACID claims; single PostgreSQL transaction boundary precisely defined; concurrency locking and stable idempotency keys specified.
- [x] CBOS schema enums verified against `prisma/schema.prisma`; zero invented enums; prospective categories cleanly separated from contract tiers.
- [x] Lifecycle state transitions, owner assignment guards, and proposal in-flight semantics 100% harmonized across all documents.
- [x] Public intake token lifecycle, log redaction, and RLS bypass realities explicitly documented with defense-in-depth application-layer security.
- [x] Acceptance criteria expanded with adversarial security tests and 100% traceability to contract rules.

### Mandatory Stopping Instruction:
**Phase 02 (Data Model & Security Implementation) remains strictly UNAUTHORIZED.**  
In accordance with user instructions, no application code, database migrations, or schema modifications will be initiated until explicit human acceptance of this Phase 01.2 Final Gate Report is provided.
