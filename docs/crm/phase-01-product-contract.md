# PHASE 01 — LEAD & CRM DOMAIN
## PRODUCT CONTRACT & BUSINESS DECISION LOCK

> **Document Status:** RECONCILED SPECIFICATION / PENDING HUMAN ACCEPTANCE  
> **Document Version:** 1.11.0  
> **Classification:** Product Management, Enterprise Architecture & Security  
> **System:** Operations Operating System (OOS) — Lead & CRM Subsystem  
> **Authority Date:** 2026-10-15  
> **Foundational Predecessor:** [`docs/crm/phase-00-capability-audit.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-00-capability-audit.md) (Accepted)  
> **Reconciliation References:** [`docs/crm/phase-01.1-reconciliation-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.1-reconciliation-report.md), [`docs/crm/phase-01.2-final-gate-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.2-final-gate-report.md), [`docs/crm/phase-01.3-final-security-challenge.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.3-final-security-challenge.md), [`docs/crm/phase-01.4-final-consistency-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.4-final-consistency-report.md), [`docs/crm/phase-01.5-final-adversarial-consistency-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.5-final-adversarial-consistency-report.md), [`docs/crm/phase-01.6-final-safety-corrections-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.6-final-safety-corrections-report.md), [`docs/crm/phase-01.7-adversarial-verification-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.7-adversarial-verification-report.md), [`docs/crm/phase-01.8-final-adversarial-corrections-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.8-final-adversarial-corrections-report.md), [`docs/crm/phase-01.9-final-transaction-safety-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.9-final-transaction-safety-report.md), [`docs/crm/phase-01.10-final-recovery-and-governance-audit.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.10-final-recovery-and-governance-audit.md), [`docs/crm/phase-01.11-final-safety-and-traceability-review.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.11-final-safety-and-traceability-review.md)  
> **Implementation Authorization:** NOT AUTHORIZED (Contract Design Only — Zero Code, Zero Migrations, Zero Production Mutations)  

---

## 1. Executive Statement & Tenets

Following the acceptance of the **Phase 00 Forensic Audit & Capability Gap Analysis**, this document establishes the binding **Product Contract and Business Decision Lock for the Lead & CRM Domain** within OOS.

The primary mandate of OOS is to organize the business around the people rather than forcing people to manage the business around disconnected tools ([`docs/00_PRODUCT_VISION.md`](file:///Users/balakrishna/apply_citrux/docs/00_PRODUCT_VISION.md)). Prior to this contract, Step [1] of the company's operating chain — Lead Ingestion, Qualification, and Sales Pipeline Management — operated completely outside OOS in third-party forms, personal inboxes, and external spreadsheets.

The Lead & CRM domain brings top-of-funnel operational discipline into OOS, establishing a single authoritative system of record for prospective customers before they transition into Candidate Career Operations (WCOS/OPOS) and Commercial Billing (CBOS).

### Core Tenets of the CRM Domain:
1. **Lead $\neq$ Candidate:** A Lead is an unauthenticated prospective client or candidate inquiry. A Candidate is an authenticated talent undergoing career operations. Inbound inquiries never create authentication credentials or candidate profiles upon receipt.
2. **Lead $\neq$ Customer:** A Lead is an exploratory opportunity. A Customer is an authoritative financial entity ([`CustomerAccount`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2546)) holding a legally binding [`ServiceContract`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2604). CRM governs the sales journey until terms are agreed; CBOS governs the resulting commercial relationship.
3. **Qualification Precedes Conversion:** Leads cannot be converted into Candidates or Customers without satisfying deterministic, auditable qualification criteria (work authorization eligibility, career service fit, and commercial commitment).
4. **CRM Orchestrates, Downstream Domains Author:** CRM coordinates the hand-off to Candidate Core and CBOS, but Candidate Core remains the sole authority for candidate profiles, and CBOS remains the sole authority for billing and contracts. CRM never duplicates candidate profiles or commercial ledgers.
5. **Operational Tasks $\neq$ Sales Follow-ups:** Sales follow-ups and outreach reminders are tracked natively within CRM without creating WCOS tasks, consuming WCOS specialist Capacity Units (CU), or distorting delivery SLA dispatch algorithms.
6. **Strict Multi-Tenant Isolation with Defense-in-Depth:** All CRM records are bounded by tenant context. For authenticated staff requests, PostgreSQL `FORCE ROW LEVEL SECURITY` isolates queries. For public intake, the server resolves the organization via a trusted intake key (`CrmIntakeToken`); caller-supplied organization IDs are strictly rejected.
7. **Immutable Audit Accountability:** All key CRM transitions (creation, stage change, qualification, assignment, conversion, and disqualification) emit append-only [`AuditEvent`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1133) records with sensitive personal data redacted.

---

## 2. Problem Definition & Business Scope

### 2.1 The Operational Problem
Prior to this contract:
- **Top-of-Funnel Blindness:** Inquiries submitted on `careerbutton.in` or external forms had to be manually re-keyed into OOS by administrators.
- **Untracked Pipeline Velocity:** Staff had no unified console to inspect lead aging, stalled prospects, or follow-up compliance.
- **Divergent Identity Risk:** Converting a prospective client into a Candidate often risked creating duplicate user accounts, mismatched emails, or unlinked CBOS customer records.
- **Attribution Loss:** Marketing spend (UTM sources, campaigns, referral channels) was lost the moment a contract was signed, preventing accurate customer acquisition cost (CAC) and placement return-on-investment (ROI) reporting.

### 2.2 The CRM Domain Scope
The Lead & CRM subsystem delivers:
1. **Public Intake Gateway:** A secure, rate-limited, anti-spam ingestion endpoint (`/api/leads/ingest`) capturing web form submissions with complete UTM attribution.
2. **Sales Pipeline & Lifecycle Engine:** A deterministic state machine (`NEW` $\rightarrow$ `CONTACTED` $\rightarrow$ `CONSULTATION_SCHEDULED` $\rightarrow$ `QUALIFYING` $\rightarrow$ `QUALIFIED` $\rightarrow$ `CONVERTED` / `DISQUALIFIED` / `LOST`) with required transition guards and stage history.
3. **Sales Activity & Follow-up Scheduler:** A dedicated interaction timeline for logging discovery calls, follow-ups, qualification notes, and scheduled reminders without impacting WCOS delivery capacity.
4. **Idempotent Multi-Domain Conversion Saga:** A durable saga orchestrating the hand-off from a `QUALIFIED` lead into a CBOS `CustomerAccount`, `ServiceContract`, and/or `Candidate` profile with automated rollback of newly created auth identities upon failure.
5. **Staff Investigation Workbench:** An enterprise investigation console (`/employee/crm`) featuring a `MetricStrip`, stage tabs, active filter bars, compact data density, and a slide-over Lead Detail Drawer.

---

## 3. Architectural Domain Boundaries

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 LEAD & CRM SUBSYSTEM                                   │
│                                                                                        │
│  ┌─────────────────────────┐      ┌─────────────────────────┐      ┌────────────────┐  │
│  │   Public Intake API     │ ───► │       Lead Model        │ ───► │ LeadActivity   │  │
│  │   (/api/leads/ingest)   │      │   (Tenant-Isolated)     │      │ (Notes & Calls)│  │
│  └─────────────────────────┘      └────────────┬────────────┘      └────────────────┘  │
│                                                │                                       │
│                                                ├───────────────────► [LeadFollowUp]    │
│                                                │                                       │
│                                                ▼                                       │
│                                   ┌─────────────────────────┐                          │
│                                   │    LeadStageHistory     │                          │
│                                   │   (Append-Only Audit)   │                          │
│                                   └────────────┬────────────┘                          │
└────────────────────────────────────────────────┼───────────────────────────────────────┘
                                                 │
                                                 │ CONVERT LEAD (Idempotent Orchestration)
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        ▼                                                 ▼
┌─────────────────────────────────────────────────┐     ┌────────────────────────────────┐
│                   CBOS DOMAIN                   │     │        CANDIDATE DOMAIN        │
│  - CustomerAccount (Authoritative Payer)        │     │  - User Identity (Supabase)    │
│  - ServiceContract & Entitlements               │     │  - Candidate Career Profile    │
│  - PricingTerms, Invoices & Payments            │     │  - Work Authorization & Docs   │
│  - Revenue Attribution                          │     │  - Specialist Assignment       │
└─────────────────────────────────────────────────┘     └────────────────────────────────┘
```

### 3.1 Domain Ownership Rules
1. **CRM Owns:** Lead records, UTM attribution, sales stages, qualification assessments, sales notes/call logs, follow-up dates, and conversion requests.
2. **Candidate Domain Owns:** Verified human identity, resumes, educational/work history, skills, portfolio links, and candidate portal authentication.
3. **CBOS Owns:** Customer entity creation, contract versioning, pricing calculations, invoices, payment ledger, and refund processing.
4. **WCOS Owns:** Post-conversion delivery tasks, capacity forecasting, specialist dispatch, and SLA monitoring.
5. **Audit Domain Owns:** Cryptographically safe, append-only security and operational audit trail.

---

## 4. Comprehensive Business Decision Log

| Decision ID | Topic | Selected Decision | Alternatives Rejected | Rationale |
|---|---|---|---|---|
| **DEC-CRM-01** | **Activity Persistence** | Dedicated `LeadActivity` model. | Overload `InternalNote` with a `leadId` foreign key. | Sales interactions require domain-specific fields (call outcome, duration, meeting type, stage transition links). Overloading `InternalNote` dilutes its clean role as a general staff note and complicates RLS. |
| **DEC-CRM-02** | **Public Intake Security & Token Lifecycle** | Native Next.js route handler (`/api/leads/ingest`) with server-resolved organization intake tokens (`CrmIntakeToken`), SHA-256 token hashing, header log redaction, rate limiting, and honeypot validation. | External third-party webhook relay (e.g. Zapier, Make) or client-supplied organization UUIDs. | Eliminates recurring SaaS middleware costs, removes external failure points, preserves strict Zod schema validation, prevents untrusted clients from forging tenant destinations, and secures intake credentials. |
| **DEC-CRM-03** | **Conversion Semantics & Anti-Takeover Saga** | Durable, idempotent multi-system saga backed by server-controlled PostgreSQL operation records (`CrmConversionOperation`), row locking (`SELECT FOR UPDATE`), stable logical idempotency keys, server-only `app_metadata` (`conversionOperationId`), and hardened double-check-before-delete compensating rollback. | Claiming "single ACID database transaction" across Supabase Auth and PostgreSQL, relying on client-writable `user_metadata`, or adopting auth accounts on email match alone. | Supabase Auth (HTTP) and PostgreSQL are separate distributed systems. `user_metadata` is client-writable by authenticated users and cannot prove conversion provenance. Server-only `app_metadata` combined with a durable database record and explicit `authCompensationAuthorized` flag prevents identity takeover and worker race deletions. |
| **DEC-CRM-04** | **Sales Role & RBAC** | Use existing `Role.EMPLOYEE` combined with `Designation` and an explicit default-deny server-side permission evaluator (`requireCrmPermission`). | Introduce a new PostgreSQL enum value `Role.SALES_REP`, or rely on bare unverified designation string matching. | Adding a value to `enum Role` in PostgreSQL causes cascading RLS policy recompilations and breaking changes. Designation alone is an organizational taxonomy, not a complete security boundary. |
| **DEC-CRM-05** | **Navigation Placement** | Dedicated top-level "CRM & PIPELINE" item in `AppSidebar` under the `WORK` section for Staff. | Sub-tab hidden inside "Operations Command". | Admissions advisors and sales specialists require primary navigation access to the pipeline without navigating candidate delivery menus. |
| **DEC-CRM-06** | **Email Uniqueness & Cross-Tenant Privacy** | Scoped strictly to tenant (`@@index([organizationId, email])`). Identity matching queries never reveal whether an email exists in another organization. | Global unique index on `leads.email` or cross-tenant identity existence disclosures. | Leaking cross-tenant email presence violates multi-tenant security invariants. Users may legitimately inquire across separate organizational instances. |
| **DEC-CRM-07** | **Task System Independence** | Lightweight follow-up tracking on `Lead` (`nextFollowUpAt`, `nextActionNote`). | Generating full `Task` + `WcosWorkItem` for every sales reminder. | WCOS tasks consume delivery capacity units (CU) and trigger automated specialist dispatch algorithms. Sales outreach reminders must not distort delivery engineering capacity. |

---

## 5. System Architecture & Component Mapping

### 5.1 Public Intake Architecture & Database Privilege Boundary
The public intake API (`POST /api/leads/ingest`) is the sole unauthenticated entry point into the CRM subsystem. To maintain ironclad tenant isolation and prevent resource abuse:

1. **Token Generation, Storage & Rotation:**  
   - Generated by organization Admins holding `crm:admin:configure` in `/admin/crm/settings`.  
   - Token structure: High-entropy string prefixed with `oos_itk_live_` followed by 32 cryptographically secure random bytes (Base64URL encoded).  
   - Stored in a new `CrmIntakeToken` model:
     - `id`: UUID (Primary Key), `organizationId`: UUID (Tenant binding)
     - `tokenHash`: String (SHA-256 hash of token, unique index — plaintext is never stored in DB)
     - `tokenPrefix`: String (`oos_itk_live_xxxx...` for display in UI)
     - `name`: String (e.g. "Primary Website Contact Form")
     - `allowedOrigins`: Json / Array (Browser CORS whitelist, e.g. `["https://careerbutton.in"]`)
     - `status`: Enum (`ACTIVE`, `REVOKED`)
     - `createdAt`: DateTime, `expiresAt`: DateTime?, `lastUsedAt`: DateTime?, `revokedAt`: DateTime?
   - Admins can rotate tokens with an expiration grace period. Immediate revocation sets `status = REVOKED`; subsequent calls return `401 Unauthorized`.
   - > [!WARNING]
     > **CORS is NOT Authentication:** Browser CORS (`allowedOrigins`) enforces client-side cross-origin policies in compliant web browsers only. Automated scripts, curl, bots, and non-browser callers do not enforce CORS and can forge `Origin` headers. The sole authoritative security boundary is the secret intake token (`x-oos-intake-key`).
   - > [!TIP]
     > **Website Backend Proxy Pattern (Best Practice):** To prevent exposing the intake token in public client-side JavaScript, website forms should submit to their own backend API route (e.g. `careerbutton.in/api/contact`), which attaches `x-oos-intake-key` in a server-to-server POST to OOS `/api/leads/ingest`.
2. **Log Redaction:**  
   - The HTTP intake header `x-oos-intake-key` is classified as sensitive auth credential.  
   - All server logging middleware, console reporters, error trackers, and audit log formatters **strictly strip and redact** this header.
3. **Database Privilege Boundary & Residual Risk Analysis:**  
   - **PostgreSQL Connection Privilege Reality:** Public intake callers are unauthenticated. Direct Prisma connections connect via the database connection pooler whose configured role possesses `BYPASSRLS` in standard setups.  
   - **Critical Engineering Boundary:** An application-layer query predicate (`where: { organizationId: resolvedOrgId }`) is an **application-level control, NOT an independent database-level boundary**. If the application runtime is compromised or a developer writes an un-scoped query, the database role will not prevent cross-tenant access.  
   - **Least-Privileged Feasible Repository Pattern:** All public intake queries are isolated in a standalone repository (`CrmIntakeRepository`) exposing only `ingestLead(resolvedOrgId, data)` with hardcoded write predicates.  
   - **Residual Risk:** Until infrastructure supports a secondary unprivileged connection pool (`NOBYPASSRLS` role restricted to `INSERT ON leads`), tenant isolation on public intake depends on application-layer code correctness.
4. **Caller Tamper Prevention:**  
   - Public payloads are parsed via strict Zod schema (`PublicLeadIngestSchema`).  
   - Callers **cannot** supply `organizationId`, `tenantId`, `status`, `stage`, `ownerId`, `assignedStaffId`, or any conversion field. Any such field in the request body is stripped and rejected.  
   - Status is hardcoded to `NEW`. Assigned owner is hardcoded to `NULL`.
5. **Abuse Controls & Deterministic Public Intake Idempotency:**  
   - Distributed IP rate limiting: max 10 requests per 60 seconds per client IP. Rate limiters evaluate the trusted connecting socket IP or validated reverse proxy header (`True-Client-IP` / `CF-Connecting-IP`), strictly blocking user-supplied `X-Forwarded-For` spoofing.  
   - Honeypot fields (`hp_company_url`, `hp_fax_number`): if filled, returns silent `200 OK` with zero DB writes.  
   - **Dedicated Idempotency Model (`CrmIntakeIdempotency`):**  
     - `id`: UUID (Primary Key), `organizationId`: UUID (Tenant binding).  
     - `idempotencyKey`: String (Unique index `@@unique([organizationId, idempotencyKey])`).  
     - `leadId`: UUID (Reference to created `Lead`).  
     - `acknowledgedResponse`: Json (Stored deterministic payload returned to duplicates).  
     - `createdAt`: DateTime, `expiresAt`: DateTime.  
   - **Decoupling Request Idempotency from Prospect Deduplication:**  
     - **Layer 2: Request Idempotency (Transport Replay Invariant):** Governed by `CrmIntakeIdempotency` with 15-minute TTL. Ensures exact network replays return cached HTTP 200 with zero side effects.  
     - **Layer 3: Prospect Deduplication (Domain Lifecycle Invariant):** Governed by `Lead` aggregate and `LeadActivity` timeline. When an inquiry is a genuinely new request (distinct payload or submitted after the 15-minute TTL), it appends an `INBOUND_INQUIRY` activity to an existing active lead, or creates a new `Lead` if the prior lead is terminal (`CONVERTED`, `DISQUALIFIED`, `LOST`).
   - **Two-Phase Idempotency Protocol & Transaction Ordering (`HUMAN-DEC-03` Context):**  
     - **The Concurrency Ordering Gap in Single-Step Upsert:** A single-step upsert cannot provide `leadId` or `acknowledgedResponse` before domain entities are created. Executing non-idempotent domain effects (creating leads or activities) *before* key arbitration causes concurrent identical requests to create duplicate domain records before the race winner is determined.
     - **The Implementable Two-Phase Transaction Protocol:**
       - **Phase 1: Key Reservation & Winner Arbitration (Step 1):**
         Before initiating any domain side effects, the ingestion worker executes an atomic conditional upsert against `crm_intake_idempotency`:
         ```sql
         INSERT INTO "crm_intake_idempotency" (
           "id", "organization_id", "idempotency_key", "payload_hash", "status",
           "lead_id", "acknowledged_response", "created_at", "expires_at", "locked_at", "lock_token"
         )
         VALUES (
           $reservationId, $orgId, $key, $payloadHash, 'PROCESSING',
           NULL, NULL, NOW(), NOW() + INTERVAL '15 minutes', NOW(), $workerToken
         )
         ON CONFLICT ("organization_id", "idempotency_key")
         DO UPDATE SET
           "payload_hash" = EXCLUDED."payload_hash",
           "status" = 'PROCESSING',
           "lead_id" = NULL,
           "acknowledged_response" = NULL,
           "created_at" = NOW(),
           "expires_at" = NOW() + INTERVAL '15 minutes',
           "locked_at" = NOW(),
           "lock_token" = EXCLUDED."lock_token"
         WHERE "crm_intake_idempotency"."expires_at" < NOW()
            OR ("crm_intake_idempotency"."status" = 'PROCESSING' AND "crm_intake_idempotency"."locked_at" < NOW() - INTERVAL '30 seconds')
         RETURNING "id", "status", "lead_id", "acknowledged_response", "expires_at", (xmax = 0) AS is_fresh_insert;
         ```
       - **Phase 1 Arbitration Outcomes:**
         1. *Winner (`RETURNING` returns 1 row with `status = 'PROCESSING'`):* Caller acquired exclusive arbitration authority. Proceeds to Phase 2 (domain execution).
         2. *Active Replay or Concurrent Competitor (0 rows returned):* The key already exists and is active (`expires_at >= NOW()` and `locked_at` fresh). The worker immediately queries the active row:
            - *Payload Mismatch Check:* If `existing.payload_hash !== incomingPayloadHash`, the request is rejected immediately with `422 Unprocessable Entity` (`ERR_IDEMPOTENCY_PAYLOAD_MISMATCH`). An idempotency key cannot be reused with a conflicting payload.
            - *Completed Replay:* If `existing.status === 'COMPLETED'`, the worker immediately returns the cached `existing.acknowledged_response` (HTTP 200). Zero domain mutations occur.
            - *Concurrent In-Flight Processing:* If `existing.status === 'PROCESSING'`, another worker holds arbitration. The caller polls with bounded backoff (e.g. 200ms intervals up to 2.5s) for `status = 'COMPLETED'`, or returns `409 Conflict: Request currently processing, retry shortly`.
       - **Phase 2: Domain Execution & Final Atomic Commit:**
         Inside the winner's transactional boundary:
         1. *Layer 3 Prospect Deduplication:* Query active leads matching `normalizedEmail` within `organization_id`:
            - If an active lead exists (`status IN ('NEW', 'CONTACTED', 'CONSULTATION_SCHEDULED', 'QUALIFYING', 'QUALIFIED')`): Append an `INBOUND_INQUIRY` `LeadActivity` to the existing lead. Set `finalLeadId = activeLead.id`.
            - If no lead exists or prior leads are terminal (`CONVERTED`, `DISQUALIFIED`, `LOST`): Insert a new `Lead` (status `NEW`). Set `finalLeadId = newLead.id`. Insert `LeadSource` attribution and initial `LeadActivity`.
         2. *Audit Trail:* Insert `AuditEvent` (`crm.lead.ingest`).
         3. *Atomic Finalization:* Update the reservation row to completed state atomically:
            ```sql
            UPDATE "crm_intake_idempotency"
            SET "status" = 'COMPLETED',
                "lead_id" = $finalLeadId,
                "acknowledged_response" = $ackResponseJson,
                "locked_at" = NULL,
                "lock_token" = NULL
            WHERE "id" = $reservationId AND "lock_token" = $workerToken;
            ```
         4. Transaction commits. Worker returns HTTP 200 with `$ackResponseJson`.
     - **Idempotency Window & Deduplication Semantics (`HUMAN-DEC-03` Alternatives):**  
       - **Option A: True Rolling TTL Window with Atomic Key Reclamation (Recommended for Idempotency Safety):**
         - Key formula: `idempotencyKey = sha256("intake:" + token.organizationId + ":" + normalizedEmail + ":" + payloadContentHash)`.
         - Persisted with `createdAt = NOW()` and `expiresAt = NOW() + INTERVAL '15 minutes'`.
         - Reclaimed via conditional upsert predicate `WHERE expires_at < NOW()`.
         - *Correctness vs Retention:* The 24-hour cleanup worker is **purely a background storage maintenance job**, NOT a correctness requirement. System guarantees hold even if cleanup is delayed.
       - **Option B: Fixed Clock-Aligned 15-Minute Buckets:**
         - Calculated as `dateBucket15Min = Math.floor(Date.now() / 900000) * 900000`.
         - Key is `sha256("intake:" + token.organizationId + ":" + normalizedEmail + ":" + dateBucket15Min)`.
         - *Boundary Trade-Off:* A request submitted at 12:14:59 experiencing a lost network response whose retry arrives at 12:15:02 computes a different bucket key, missing the stored idempotency acknowledgment and falling back to append an activity to the existing lead rather than returning the original acknowledgment.
       - *Status:* Maintained as an explicit pending human decision under **`HUMAN-DEC-03`**. Neither option is silently activated prior to human leadership election.
     - **Multi-Entity Transaction Atomicity, Fencing & Failure Modes:**  
       - **Worker Fencing Protocol (Lease Expiry vs In-Flight Mutation Protection):**  
         > [!CRITICAL]
         > **The Fencing Rule:** Reservation expiry alone MUST NEVER authorize a competing worker while the original worker can still perform domain mutations.  
         
         1. *Interactive Row-Level Lock Isolation:* When Worker 1 reserves the row in Step 1 (`INSERT ... ON CONFLICT DO UPDATE`), PostgreSQL holds an exclusive row-level write lock on that tuple for the entire transaction. A competing Worker 2 is physically blocked at the PostgreSQL lock manager until Worker 1 commits or rolls back.
         2. *Crash / Timeout Automatic Abort:* If Worker 1 crashes, disconnects, or hits `idle_in_transaction_session_timeout` (10s), PostgreSQL automatically terminates the backend session and executes a complete `ROLLBACK`. Any partial domain inserts disappear.
         3. *Checkpoint 1 — Pre-Mutation Post-Lock Ownership Check:* Immediately after acquiring the row lock on `crm_intake_idempotency` and **strictly before executing any domain mutations** (`leads`, `lead_sources`, `lead_activities`, `audit_events`), the worker inspects the locked row:
            ```typescript
            if (!row || 
                row.lock_token !== workerToken || 
                row.status !== 'PROCESSING' || 
                new Date(row.locked_at).getTime() < Date.now() - 30_000) {
                throw new WorkerFencedError("Reservation ownership lost or expired prior to domain mutations. Aborting.");
            }
            ```
            If Worker 2 stole ownership during an intervening pause, Worker 1 immediately throws and rolls back. Zero domain records are touched.
         4. *Checkpoint 2 — Defense-in-Depth Commit-Time Fencing (CAS):* At transaction finalization, after domain inserts have succeeded, the update query requires:
            ```sql
            UPDATE "crm_intake_idempotency"
            SET "status" = 'COMPLETED',
                "lead_id" = $finalLeadId,
                "acknowledged_response" = $ackResponseJson,
                "locked_at" = NULL,
                "lock_token" = NULL
            WHERE "id" = $reservationId
              AND "lock_token" = $workerToken
              AND "status" = 'PROCESSING'
              AND "locked_at" >= NOW() - INTERVAL '30 seconds';
            ```
            If Worker 1 stalled past 30s and Worker 2 stole the reservation, this query updates **0 rows**. Worker 1 asserts `assert(affectedRows === 1)`, catches 0 rows, throws `IdempotencyFencingError`, and issues `ROLLBACK`, guaranteeing PostgreSQL rolls back all uncommitted domain mutations. Zero duplicate domain records can ever commit.
         5. *Formal Proof of Non-Interference:* Because PostgreSQL aborts uncommitted writes upon transaction rollback, and because both Checkpoint 1 (pre-mutation) and Checkpoint 2 (commit-time CAS) enforce atomic ownership matching, it is impossible for a stale worker whose reservation was stolen to commit domain records.
       - **Rollback Safety:** If any domain step fails (DB disconnect, validation error, constraint error), the transaction rolls back completely. In an interactive transaction, the reservation rolls back as well, allowing immediate fresh retry.
       - **Process Crash Recovery:** If a worker crashes while `status = 'PROCESSING'`, the 30-second stale lease condition (`locked_at < NOW() - INTERVAL '30 seconds'`) allows a subsequent retry to safely reclaim arbitration without getting permanently blocked.
       - **Lost Response Recovery:** If the client connection drops after commit and retries within 15 minutes, Phase 1 detects `status = 'COMPLETED'` and immediately returns cached `acknowledged_response` without duplicating domain records.
       - **Token Revocation Precedence:** Token authentication occurs strictly BEFORE idempotency store access. Revoked tokens immediately return `401 Unauthorized`; idempotency store is never consulted.
     - **Retention & Tenant Isolation:**  
       - Rows in `CrmIntakeIdempotency` are retained 24 hours for audit forensics, then pruned via `DELETE FROM "CrmIntakeIdempotency" WHERE "expiresAt" < NOW() - INTERVAL '24 hours'`.
       - All idempotency records and uniqueness constraints are strictly tenant-isolated via `organizationId` (`@@unique([organizationId, idempotencyKey])`), ensuring zero cross-tenant key collisions or existence leakage.

### 5.2 Data Models (Planned for Phase 02)
1. `Lead`: Root aggregate containing contact info, status, owner, attribution, follow-up dates, and conversion pointers.
2. `LeadSource`: Structured attribution capturing UTM parameters, referrer, and ingestion medium.
3. `LeadStageHistory`: Append-only transition log with actor, prior stage, new stage, and duration.
4. `LeadActivity`: Sales interaction timeline (calls, emails, discovery notes, meetings).
5. `CrmIntakeToken`: Organization-bound public intake API authentication tokens.
6. `CrmIntakeIdempotency`: Deterministic sliding-window idempotency and duplicate deduplication records.
7. `CrmConversionOperation`: Durable saga state tracking model for multi-domain conversion.

### 5.3 Server Actions & Services (Planned for Phase 03)
- `createLeadAction`: Staff creation of manual or inbound prospects.
- `updateLeadStageAction`: Governed stage transitions with guard validation.
- `assignLeadAction`: Reassigning lead ownership to an active sales employee.
- `logLeadActivityAction`: Logging calls, notes, or scheduled follow-ups.
- `convertLeadAction`: Multi-domain conversion orchestrator with compensating rollback.
- `disqualifyLeadAction`: Terminal closure with mandatory structured reason.

### 5.4 Screens & Workbenches (Planned for Phase 05)
- `/employee/crm`: Canonical Staff CRM Workbench with MetricStrip, stage tabs, and search toolbar.
- `/employee/crm/[id]`: Deep-link lead investigation view with full activity history and conversion drawer.
- `/admin/crm/settings`: Organization-level CRM configuration (intake tokens, auto-assignment rules).

---

## 6. Document Hierarchy

This master contract is supported by four specialized architectural specifications:

1. [`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md): Complete state machine, transition guards, and qualification criteria.
2. [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md): Granular RBAC, default-deny evaluation, designations, and PostgreSQL RLS security policies.
3. [`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md): Multi-domain identity hand-off, deduplication, and transactional guarantees.
4. [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md): Exhaustive, testable verification criteria for Phase 02 through Phase 06.

---

## 7. Phase 01 Business Decision Lock Recommendation

### Summary of Items Ready to Freeze:
- [x] Canonical 8-stage lifecycle (`NEW`, `CONTACTED`, `CONSULTATION_SCHEDULED`, `QUALIFYING`, `QUALIFIED`, `CONVERTED`, `DISQUALIFIED`, `LOST`).
- [x] Strict tenant isolation via trusted server-resolved organization context (`CrmIntakeToken`) and PostgreSQL FORCE RLS for authenticated staff.
- [x] Complete decoupling of unverified Leads from Supabase Auth and canonical `users` table.
- [x] Dedicated `LeadActivity` model without polluting WCOS delivery task queues.
- [x] Durable, idempotent multi-domain conversion saga to CBOS and Candidate Core with safe rollback.
- [x] Verified CBOS schema enums (`CustomerType`, `ContractServiceType`, `CustomerCandidateRelationType`) with explicit rejection of prospective categories during conversion.
- [x] **`SEC-INV-01` (Frozen Security Invariant):** Cross-tenant identity conflict policy requires hard failure (`IdentityConflictError`) and manual review; zero automatic linkage across organization boundaries.

### Canonical Register of Pending Human Decisions:
The following decisions remain strictly pending human executive election before Phase 02:

| Decision ID | Policy Topic | Architectural Options | Specification Default | Governance Status |
|---|---|---|---|---|
| **`HUMAN-DEC-01`** | **Unassigned Lead Triage SLA & Escalation Window** | **Option 1:** 4 Business Hours (Recommended).<br>**Option 2:** 1 Hour (Instant response model).<br>**Option 3:** 8 Hours (Same-day triage).<br>**Option 4:** 24 Hours (Relaxed triage). | 4 Business Hours | **PENDING HUMAN DECISION** |
| **`HUMAN-DEC-02`** | **Terminal State Reopening Governance (Disqualified Leads)** | **Option A:** Strict Admin-only governance with mandatory justification (`crm:admin:configure`).<br>**Option B:** Delegated Team Lead / Sales Specialist reopening authority with logged reason. | Option A (Role.ADMIN only) | **PENDING HUMAN DECISION** |
| **`HUMAN-DEC-03`** | **Public Intake Deduplication Architecture & Idempotency Model** | **Option A:** True rolling 15-minute TTL window with atomic key reclamation.<br>**Option B:** Fixed clock-aligned 15-minute buckets. | Option A (True Rolling TTL) | **PENDING HUMAN DECISION** |

**Next Step:** Human leadership provides explicit recorded choices for `HUMAN-DEC-01`, `HUMAN-DEC-02`, and `HUMAN-DEC-03`, followed by explicit written authorization to commence Phase 02. Phase 02 remains strictly unauthorized.
