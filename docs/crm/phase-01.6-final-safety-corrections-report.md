# PHASE 01.6 — FINAL SAFETY CORRECTIONS & CONSISTENCY AUDIT REPORT

> **Document Status:** RECONCILED SAFETY AUDIT REPORT / PENDING HUMAN ACCEPTANCE  
> **Document Version:** 1.6.0  
> **Classification:** Distributed Systems Safety, Security Engineering & Concurrency Architecture  
> **System:** Operations Operating System (OOS) — Lead & CRM Subsystem  
> **Date:** 2026-10-15  
> **Authority Predecessors:**  
> - [`docs/crm/phase-00-capability-audit.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-00-capability-audit.md) (Accepted)  
> - [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) (v1.6.0)  
> - [`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) (v1.6.0)  
> - [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) (v1.6.0)  
> - [`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) (v1.6.0)  
> - [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) (v1.6.0)  
> - [`docs/crm/phase-01.5-final-adversarial-consistency-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.5-final-adversarial-consistency-report.md)  
> **Implementation Authorization:** NOT AUTHORIZED (Specification and Verification Architecture Only — Zero Code, Zero Migrations, Zero Schema Mutations)  

---

## 1. Executive Summary & Audit Mandate

Following the publication of the Phase 01.5 Adversarial Consistency Review, an independent safety evaluation identified critical remaining distributed systems, authorization, and idempotency edge cases that could compromise system integrity under network delays, stale workers, and concurrent mutations:

1. **P0 Distributed Compensation Under Lease Expiry:** Claims that PostgreSQL lease ownership or version fencing tokens prevent a stale worker from invoking an external third-party API (Supabase Auth `deleteUser`) are mathematically and architecturally invalid. An in-flight HTTP request or paused thread cannot be fenced by an internal database lock if the external API does not enforce the fencing token.
2. **P1 Incomplete Assignment Authorization:** The permission evaluator checked Team Lead authority against the lead's *previous owner's team* rather than the *destination assignee's verified team*, did not explicitly validate that proposed assignees hold active tenant memberships eligible for CRM ownership, and lacked concurrency controls if lead ownership changed mid-flight.
3. **P1 Intake Deduplication Semantics Mismatch:** The specification conflated clock-aligned 15-minute fixed buckets (`Math.floor(Date.now() / 900000) * 900000`) with a "sliding window", creating boundary anomalies where lost HTTP response retries miss cached acknowledgments.
4. **P1 Canonical State Transition Ambiguities:** Terminal escalation states (`COMPENSATION_HALTED_UNCERTAIN`, `COMPENSATION_BLOCKED_PROFILE_EXISTS`, `FAILED_TERMINAL`) risked being reacquired by generic recovery workers, and the protocol did not strictly distinguish definitive Auth 404 responses from ambiguous provider timeouts.

This Phase 01.6 audit delivers the definitive safety corrections across all five Phase 01 specifications without implementing code, executing migrations, or mutating database structures.

---

## 2. P0 — Proving Compensation Safety Under Lease Expiry

### 2.1 Adversarial Interleaving Analysis

The independent review mandated evaluation of the following distributed interleaving:

```
Worker A (Compensating)             PostgreSQL Database             Worker B (Converting)        Supabase Auth API
───────────────────────             ───────────────────             ─────────────────────        ─────────────────
1. Acquires lease on Op A
2. Passes DB pre-checks (0 profiles)
3. Pauses immediately before/during
   HTTP DELETE request
4. ─── Lease expires (30s) ───►     Lease expires
                                    Worker B acquires lease ─────►
                                    Completes conversion ────────►
                                    (Inserts User, Candidate,
                                     links authUserId) ──────────►
5. Worker A wakes up
   Issues HTTP deleteUser(authUserId) ────────────────────────────────────────────────────────► Deletes active Auth user!
```

### 2.2 The Fundamental Limitation of Database Fencing

In a distributed architecture comprising an ACID database (PostgreSQL) and an external HTTP service (Supabase Auth), database fencing tokens (e.g. `version = version + 1`, `WHERE lease_owner_id = $workerId`) **can only fence mutations within PostgreSQL**.

PostgreSQL fencing **cannot fence an in-flight network packet to an external third-party API**:
- Supabase Auth does not evaluate PostgreSQL lease tokens or database transaction versions.
- If Worker A has already built or dispatched the HTTP `deleteUser(authUserId)` packet and is paused by an OS thread pause, garbage collection pause, or network socket delay, PostgreSQL has zero authority to abort the packet in transit.
- If Worker B converts the lead and associates the existing `authUserId` with an active Candidate and Customer Account, Worker A's packet arriving subsequent to conversion would destroy an active candidate's credentials.

### 2.3 The Smallest Safe Architectural Correction: Lead-Level Compensation Quarantine

Because the external side effect cannot be fenced remotely once initiated, exclusive authority over the lifecycle must be enforced at the root domain boundary: **the Lead aggregate**.

We define the **Lead-Level Compensation Quarantine Protocol**:

```
                          ┌──────────────────────────────────────┐
                          │     Lead: status = QUALIFIED         │
                          │ quarantineConversionOperationId = NULL│
                          └──────────────────┬───────────────────┘
                                             │
                       Saga Failure in Op A  │ Begins Compensation
                                             ▼
                          ┌──────────────────────────────────────┐
                          │   ATOMIC LEASE & LEAD QUARANTINE     │
                          │ UPDATE leads                         │
                          │ SET quarantine_op_id = 'Op-A-UUID'   │
                          │ WHERE id = $leadId                   │
                          └──────────────────┬───────────────────┘
                                             │
               ┌─────────────────────────────┴─────────────────────────────┐
               ▼                                                           ▼
┌───────────────────────────────┐                         ┌─────────────────────────────────┐
│ Worker B: convertLeadAction   │                         │ Worker A: Supabase Auth Deletion│
│ 1. Checks Lead status & lock  │                         │ 1. Executes deleteUser()        │
│ 2. Sees quarantine_op_id != NULL│                       │ 2. Success:                     │
│ 3. REJECTED: 409 Conflict     │                         │    UPDATE op SET COMPLETED      │
│    "Lead Quarantined"         │                         │    UPDATE leads SET quarantine=NULL│
└───────────────────────────────┘                         └─────────────────────────────────┘
```

#### Protocol Mechanics:
1. **Atomic Lead Quarantine Stamping:**  
   Before any compensation worker executes pre-deletion checks or calls Supabase Auth `deleteUser`, it executes an atomic PostgreSQL transaction:
   ```sql
   UPDATE "Lead"
   SET "quarantineConversionOperationId" = $operationId,
       "updatedAt" = NOW()
   WHERE "id" = $leadId
     AND ("quarantineConversionOperationId" IS NULL OR "quarantineConversionOperationId" = $operationId);
   ```
2. **Hard Conversion Lockout:**  
   Every conversion attempt (`convertLeadAction`) checks lead eligibility inside an exclusive row lock (`SELECT * FROM "Lead" WHERE "id" = $leadId FOR UPDATE`).  
   If `quarantineConversionOperationId IS NOT NULL`:
   - Conversion is **strictly rejected with `409 Conflict: Lead conversion is quarantined pending resolution of prior compensation operation`**.
   - Worker B cannot proceed with conversion under any circumstance while compensation is unresolved.
3. **Safe Outcome Under the Stale Worker Interleaving:**  
   Revisiting the 5-step interleaving under the quarantine protocol:
   - Worker A acquires lease on Operation A and stamps `Lead.quarantineConversionOperationId = Op_A_Id`.
   - Worker A pauses immediately before/during the Supabase Auth deletion request.
   - Worker A's lease expires.
   - Worker B attempts to convert the lead. Worker B inspects the lead, detects `quarantineConversionOperationId = Op_A_Id`, and **is immediately rejected with `409 Conflict`**. Worker B creates zero Candidate profiles and zero Customer Accounts.
   - Worker A resumes and completes the Supabase Auth deletion of the orphaned user.
   - Worker A (or a recovery worker) marks Operation A as `COMPENSATION_COMPLETED` and clears `Lead.quarantineConversionOperationId = NULL`.
   - Lead is now eligible for a fresh, clean conversion attempt without identity corruption.
4. **Permanent Quarantine on Ambiguity:**  
   If Worker A's deletion outcome is uncertain (timeout, 5xx), Operation A transitions to `COMPENSATION_HALTED_UNCERTAIN`. The lead **remains quarantined** until an administrator or scheduled reconciliation job investigates and explicitly clears the quarantine.

### 2.4 Crash Recovery & Availability vs. Safety Trade-Offs

- **Safety Priority:** Distributed systems theory dictates that when network partitions or asynchronous worker pauses occur, a system must choose between Consistency/Safety and Availability. In OOS CRM, **Safety strictly trumps Availability**. A candidate profile corrupted with a deleted auth identity creates catastrophic data loss and security breaches.
- **Availability Impact:** Quarantining a lead temporarily blocks conversion on that single lead (typically 1–30 seconds during normal rollback, or until manual review if Supabase Auth suffers an outage). It has zero impact on any other lead or tenant.
- **Crash Recovery Protocol:**
  - If a worker crashes while holding a quarantine, a recovery worker sweeps expired leases (`lease_expires_at < NOW()`).
  - The recovery worker inspects Supabase Auth using the **Definitive 404 Protocol**:
    - If `admin.getUserById(authUserId)` returns `404 Not Found`, the identity is confirmed gone: transition to `COMPENSATION_COMPLETED` and clear lead quarantine.
    - If user exists and metadata matches: retry `deleteUser`.
    - If user exists and metadata was altered or profile exists: transition to `COMPENSATION_BLOCKED_PROFILE_EXISTS` (keep quarantined, alert ops).
    - If Supabase returns 5xx/timeout: transition to `COMPENSATION_HALTED_UNCERTAIN` (keep quarantined).

---

## 3. P1 — Complete Assignment Authorization & Concurrency Protocol

### 3.1 Exhaustive Server-Side Authorization Invariants

Every lead assignment operation (`assignLeadAction`) must strictly satisfy six independent server-side validation checks within `requireCrmPermission`:

1. **Authenticated Tenant Match:**  
   The target lead must belong to the caller's verified tenant: `targetLead.organizationId === ctx.organizationId`. Queries are scoped strictly to the tenant; cross-tenant lead IDs return `404 Not Found`.
2. **Assignee Active Tenant Membership:**  
   The proposed assignee (`assignedStaffId`) must have an active membership record in that identical tenant:
   ```typescript
   const assigneeMembership = await prisma.membership.findFirst({
     where: {
       userId: proposedAssigneeId,
       organizationId: ctx.organizationId,
       status: 'ACTIVE'
     }
   });
   if (!assigneeMembership) throw new ValidationError("Assignee does not have an active membership in this tenant");
   ```
3. **Assignee CRM Ownership Eligibility:**  
   The proposed assignee must possess a role and designation eligible for CRM ownership (e.g. `Role.EMPLOYEE` with `SALES_REPRESENTATIVE`, `ADMISSIONS_ADVISOR`, `CAREER_COACH`, or `Role.ADMIN`). Assigning leads to candidates, contractors, or inactive profiles fails closed.
4. **Destination Assignee Team Validation for Team Leads:**  
   A Team Lead's administrative authority is strictly bounded by their team. Crucially, Team Lead authority applies to the **destination assignee's verified team**, not merely the lead's current owner:
   ```typescript
   if (ctx.isTeamLead) {
     if (assigneeMembership.team !== ctx.team) {
       throw new AuthorizationError("Team Leads may only assign leads to members of their own team");
     }
   }
   ```
5. **Sales Representative Ownership Scope:**  
   Sales representatives without Team Lead or Admin status cannot assign leads outside their permitted scope:
   - They may **claim an unassigned lead** (`targetLead.assignedStaffId === null`).
   - They may **reassign a lead they currently own** to another eligible sales representative.
   - They **cannot reassign leads owned by other sales representatives** (`targetLead.assignedStaffId !== ctx.userId` throws `AuthorizationError`).
6. **Fail-Closed Default:**  
   Any missing, null, inactive, cross-tenant, or unrecognized assignee parameter strictly fails closed (`400 Bad Request` or `403 Forbidden`). Lead ownership is never updated on ambiguous input.

### 3.2 Assignment Concurrency Protocol & Optimistic Locking

If Lead X is assigned to Staff A, and both Manager M and Staff A attempt to reassign Lead X concurrently, or if lead ownership changes between authorization inspection and database mutation:

```sql
UPDATE "Lead"
SET "assignedStaffId" = $newAssigneeId,
    "updatedAt" = NOW()
WHERE "id" = $leadId
  AND "organizationId" = $tenantId
  AND "assignedStaffId" IS NOT DISTINCT FROM $expectedPrevAssigneeId;
```

#### Invariant:
- If another staff member or automated assignment rule altered `assignedStaffId` in the millisecond between read and write, the `UPDATE` affects `0` rows.
- The repository detects `count === 0`, rolls back the transaction, and throws:
  `409 Conflict: Lead ownership changed mid-flight. Please refresh and review current assignment.`

---

## 4. P1 — Correct Intake Idempotency Semantics

### 4.1 Rolling TTL Window vs. Fixed Clock Buckets (`HUMAN-DEC-03`)

The term "sliding window" in Phase 01.5 was contradicted by the mathematical formula `Math.floor(Date.now() / 900000) * 900000`, which implements **fixed clock-aligned 15-minute buckets** (e.g. 12:00–12:15, 12:15–12:30).

#### The Boundary Flaw in Fixed Clock Buckets (Option B):
- A user submits a form at 12:14:59 UTC.
- The server creates the lead, but the client experiences a local network drop before receiving the HTTP 200 response.
- The client retries 3 seconds later at 12:15:02 UTC.
- Under fixed buckets, the timestamp advances from bucket `12:00` to `12:15`, computing a completely different `idempotencyKey`.
- The retry misses the idempotency cache, potentially appending a duplicate activity or creating an unlinked record.

#### Architectural Comparison for Human Election (`HUMAN-DEC-03`):

| Evaluation Criteria | Option A: True Rolling TTL Window (Recommended) | Option B: Fixed Clock-Aligned Buckets |
|---|---|---|
| **Key Formula** | `sha256("intake:" + orgId + ":" + email + ":" + payloadHash)` | `sha256("intake:" + orgId + ":" + email + ":" + dateBucket15m)` |
| **Window Boundary Behavior** | Retries within 15 minutes of initial request **always** locate cached acknowledgment regardless of minute transitions. | Retries crossing a 15-minute clock boundary (e.g. 12:14:59 $\rightarrow$ 12:15:02) miss cache. |
| **Deduplication Coverage** | Exactly 15 minutes from submission timestamp (`expiresAt = NOW() + 15m`). | Between 0 and 15 minutes depending on when in the bucket the request arrived. |
| **Storage & Purge** | Requires standard index on `expiresAt` for background pruning. | Same storage requirements. |
| **Recommendation** | **Architecturally Recommended for Idempotency Safety.** | Legacy fallback. |

*Governance Mandate:* Maintained as an explicit pending human decision under **`HUMAN-DEC-03`**. The specification supports Option A as default upon election.

### 4.2 Multi-Entity Transaction Atomicity

Public lead intake involves multiple entity updates that must commit together or not at all. The entire intake operation executes in a **single ACID PostgreSQL transaction** (`prisma.$transaction`):

1. **Insert `CrmIntakeIdempotency` record** (holding `idempotencyKey`, `acknowledgedResponse`, `expiresAt`).
2. **Insert `Lead` aggregate** (status `NEW`, `assignedStaffId = NULL`).
3. **Insert `LeadSource` attribution record** (UTM parameters, referrer).
4. **Insert initial `LeadActivity`** (`INBOUND_INQUIRY`).
5. **Insert `AuditEvent`** (`crm.lead.ingest`).

```
┌──────────────────────────────────────────────────────────────────────────┐
│              PRISMA $TRANSACTION (ALL-OR-NOTHING ATOMICITY)              │
│                                                                          │
│  [1] CrmIntakeIdempotency ──► [2] Lead (NEW) ──► [3] LeadSource (UTM)   │
│                                      │                                   │
│                                      ▼                                   │
│  [5] AuditEvent (ingest)  ◄── [4] LeadActivity (INBOUND_INQUIRY)         │
│                                                                          │
│  Any failure in [1]..[5] ──► ABORT & ROLLBACK ──► 0 Residual DB Rows    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Comprehensive Failure Mode Matrix

| Failure Scenario | Exact System Behavior & Recovery Action |
|---|---|
| **Concurrent Duplicates** | Both compute identical `idempotencyKey`. Second transaction hits PostgreSQL `23505 (unique_violation)`. Second handler catches `23505`, waits up to 2,000ms for first commit, reads stored `acknowledgedResponse`, and returns HTTP 200. Exactly 1 lead created. |
| **Lost HTTP Response** | Client retries with same payload within 15 minutes. Endpoint matches active `CrmIntakeIdempotency` record, returns stored `acknowledgedResponse` (`200 OK`) with zero database writes and zero duplicate audit events. |
| **Process Crash Mid-Transaction** | Server crashes before `COMMIT`. PostgreSQL automatically rolls back the transaction. Client retry finds no existing record and cleanly processes as a fresh initial submission. |
| **Process Crash Post-Commit** | Server crashes after `COMMIT` but before sending HTTP response. Client retry finds committed `CrmIntakeIdempotency` row and immediately returns stored `acknowledgedResponse`. |
| **Intake Token Revocation** | Token authentication strictly precedes idempotency store access. If `CrmIntakeToken.status === 'REVOKED'`, request returns `401 Unauthorized` immediately; idempotency cache is never consulted or returned. |
| **Expired Idempotency Record** | Request arriving after `expiresAt`: if active lead exists, appends `LeadActivity` (`INBOUND_INQUIRY`) to its timeline; if existing lead is closed (`DISQUALIFIED`, `LOST`, `CONVERTED`), creates new `Lead` in `NEW`. |
| **Retention & Purge** | Idempotency rows are retained for 24 hours for audit forensics, then purged via background worker: `DELETE FROM "CrmIntakeIdempotency" WHERE "expiresAt" < NOW() - INTERVAL '24 hours'`. |
| **Tenant Isolation** | All idempotency keys are composite-indexed with `organizationId` (`@@unique([organizationId, idempotencyKey])`). Zero cross-tenant collisions or existence leakage. |

---

## 5. P1 — Canonical Conversion State Machine & Transition Invariants

### 5.1 Exhaustive Conversion-Operation State Transition Table

The `CrmConversionOperation` model manages the distributed saga across Supabase Auth and PostgreSQL. The exhaustive 12-state transition table:

| State | Legal Transitions To | Required Lease Ownership? | Fencing Check Required? | Retry Eligible? | Terminal State? | Recovery Action |
|---|---|---|---|---|---|---|
| `INITIALIZED` | `AUTH_PROVISIONING`, `FAILED_TERMINAL` | Yes | Yes (`version`) | Yes (if lease expired) | No | Worker acquires lease; determines auth provisioning mode. |
| `AUTH_PROVISIONING` | `AUTH_PROVISIONED`, `COMPENSATION_PENDING`, `COMPENSATION_HALTED_UNCERTAIN` | Yes | Yes (`version`) | Yes | No | Calls Supabase Admin API. If 409 conflict, inspects `app_metadata`. |
| `AUTH_PROVISIONED` | `DB_COMMITTING`, `COMPENSATION_PENDING` | Yes | Yes (`version`) | Yes | No | Identity created; transitions to PostgreSQL profile creation. |
| `DB_COMMITTING` | `COMPLETED`, `COMPENSATION_PENDING` | Yes | Yes (`version`) | Yes | No | Runs PostgreSQL transaction (User, Candidate, CustomerAccount, Lead update). |
| `COMPENSATION_PENDING` | `COMPENSATING`, `COMPENSATION_BLOCKED_PROFILE_EXISTS`, `COMPENSATION_HALTED_UNCERTAIN` | Yes | Yes (`version`) | Yes | No | PostgreSQL transaction failed; stamps Lead quarantine and prepares compensation. |
| `COMPENSATING` | `COMPENSATION_COMPLETED`, `COMPENSATION_HALTED_UNCERTAIN`, `COMPENSATION_BLOCKED_PROFILE_EXISTS` | Yes | Yes (`version`) | Yes | No | Evaluates Double-Check-Before-Delete; issues `deleteUser`. |
| `COMPLETED` | *(None)* | No | No | No | **Yes (Success)** | Terminal. Immutable. Retries return cached conversion result. |
| `COMPENSATION_COMPLETED` | *(None)* | No | No | No | **Yes (Compensated)**| Terminal. Remote identity deleted; lead quarantine cleared; lead remains `QUALIFIED`. |
| `COMPENSATION_HALTED_UNCERTAIN` | `COMPENSATION_COMPLETED` (Manual/Reconciliation Only) | No (Quarantined) | Yes | **NO (Generic Workers Blocked)** | **Yes (Escalation)** | Terminal escalation. Excluded from generic worker sweeps. Requires Admin/Reconciliation. |
| `COMPENSATION_BLOCKED_PROFILE_EXISTS` | *(None)* | No (Quarantined) | No | **NO (Generic Workers Blocked)** | **Yes (Escalation)** | Terminal escalation. Committed profiles exist; identity must never be deleted. |
| `FAILED_TERMINAL` | *(None)* | No | No | No | **Yes (Failure)** | Terminal. Pre-auth failure. No remote side effects created. |
| `CANCELLED` | *(None)* | No | No | No | **Yes (Cancelled)**| Terminal. Operation explicitly superseded. |

### 5.2 Terminal Escalation State Isolation

To prevent recovery workers from infinitely thrashing or prematurely re-executing dangerous deletions:
- States `COMPENSATION_HALTED_UNCERTAIN`, `COMPENSATION_BLOCKED_PROFILE_EXISTS`, and `FAILED_TERMINAL` are **strictly excluded** from generic background lease acquisition queries (`WHERE status = 'COMPENSATION_PENDING' AND lease_expires_at < NOW()`).
- Generic workers cannot acquire leases on these operations.
- They remain in an operational quarantine queue (`crm_conversion_escalation_queue`) until inspected by dedicated reconciliation jobs or human administrators holding `crm:admin:configure`.

### 5.3 Distinguishing Definitive Auth 404 from Transient Provider Errors

During crash recovery or compensation evaluation, the orchestrator inspects the remote identity via `supabase.auth.admin.getUserById(authUserId)`:

```typescript
try {
  const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
  if (error && error.status === 404) {
    // DEFINITIVE OUTCOME: User does not exist in Supabase Auth.
    // Proves deletion succeeded previously. Safe to conclude compensation.
    await markCompensationCompleted(operationId);
  } else if (error) {
    // TRANSIENT OR AMBIGUOUS ERROR: 500, 503, network timeout, rate limit.
    // Provider state is unknown. MUST NOT DELETE.
    await haltCompensationUncertain(operationId, error);
  } else if (user) {
    // User exists. Verify app_metadata before proceeding with delete.
  }
} catch (networkErr) {
  // Network disconnect. MUST NOT ASSUME USER IS GONE.
  await haltCompensationUncertain(operationId, networkErr);
}
```

---

## 6. Expanded Adversarial Acceptance Matrix

The following test criteria are specified and added to [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) (v1.6.0):

| ID | Domain Category | Test Requirement & Assertion | Tier | Status |
|---|---|---|---|---|
| **AC-CON-20** | Compensation / Lease Race | Worker A passes DB pre-checks, pauses before/during Supabase Auth `deleteUser`, its lease expires, and Worker B attempts conversion. Verification asserts that Worker B is strictly rejected with `409 Conflict: Lead quarantined by conversion operation` due to `leads.quarantine_conversion_operation_id`, preventing Worker A from destroying an active candidate profile upon resuming. | Automated Adversarial | Specified (Pending Phase 03) |
| **AC-CON-21** | Escalation State Isolation | Operations in terminal escalation states (`COMPENSATION_HALTED_UNCERTAIN`, `COMPENSATION_BLOCKED_PROFILE_EXISTS`, `FAILED_TERMINAL`) are verified to be strictly excluded from generic recovery lease acquisition queries (`status = 'COMPENSATION_PENDING'`), preventing infinite worker reacquisition and race loops. | Automated Concurrency | Specified (Pending Phase 03) |
| **AC-CON-22** | Provider 404 vs 5xx Distinction | Recovery worker distinguishes HTTP 404 (`UserNotFound` from Supabase Admin API), which safely proves remote deletion completed and transitions status to `COMPENSATION_COMPLETED`, from HTTP 500/503/timeout/network disconnect, which halts deletion and transitions to `COMPENSATION_HALTED_UNCERTAIN` without deleting. | Automated Recovery | Specified (Pending Phase 03) |
| **AC-SEC-11** | Assignee Active Membership Check | Calling `assignLeadAction` with an assignee who does not exist, belongs to another tenant, is inactive, or has a role/designation ineligible for CRM ownership fails closed immediately with `400 Bad Request` or `404 Not Found`. Lead owner is unchanged. | Automated Security | Specified (Pending Phase 03) |
| **AC-SEC-12** | Destination Assignee Team Check | A Team Lead attempting to assign a lead to a sales representative belonging to a different team receives `403 Forbidden` (`AuthorizationError`). Team Lead authority strictly requires `assigneeMembership.team === ctx.team`. | Automated Security | Specified (Pending Phase 03) |
| **AC-SEC-13** | Assignment Concurrency Race | If lead ownership or team changes between staff authorization evaluation and database mutation, conditional update `WHERE id = $leadId AND assigned_staff_id = $expectedPrevOwner` detects 0 rows updated, rolls back, and returns `409 Conflict: Lead ownership changed mid-flight`. | Automated Concurrency | Specified (Pending Phase 03) |
| **AC-ING-12** | Intake Multi-Entity Rollback | If an unhandled exception or constraint violation occurs during any step of intake insertion (idempotency row, lead, source, activity, or audit event), PostgreSQL rolls back the entire transaction. Verification asserts that zero partial rows exist in any table. | Automated Integration | Specified (Pending Phase 04) |
| **AC-ING-13** | Window Boundary Semantics (`HUMAN-DEC-03`)| Validates boundary semantics under selected option: under Option A (Rolling TTL), retries within 15 minutes of initial submission always match active idempotency record regardless of clock boundary; under Option B (Fixed Buckets), requests crossing clock boundaries compute distinct bucket keys. Tests verify determinism and absence of unhandled exceptions. | Automated Concurrency | Specified (Pending Phase 04) |

> [!IMPORTANT]
> **Execution Status Affirmation:** All criteria listed above are **SPECIFIED REQUIREMENTS FOR FUTURE IMPLEMENTATION**. None are executed or passing today, as implementation code, Prisma models, migrations, and database mutations remain strictly unauthorized.

---

## 7. Register of Explicit Pending Human Decisions

The following business and architectural decisions are preserved as explicitly pending human stakeholder sign-off:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 REGISTER OF PENDING HUMAN DECISION GATES                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ HUMAN-DEC-01:  Lead Triage SLA & Escalation Window                          │
│                Proposed Default: 4 Business Hours                           │
│                Status: PENDING SALES OPERATIONS ACCEPTANCE                  │
│                                                                             │
│ HUMAN-DEC-02:  Terminal State Reopening Governance                          │
│                Proposed Default: Admin-Only for DISQUALIFIED; Staff for LOST│
│                Status: PENDING SALES LEADERSHIP ACCEPTANCE                  │
│                                                                             │
│ HUMAN-DEC-03:  Public Intake Deduplication Architecture                     │
│                Option A: True Rolling TTL Window (Architecturally Preferred)│
│                Option B: Fixed Clock-Aligned 15-Minute Buckets              │
│                Status: PENDING MARKETING OPERATIONS / ARCHITECTURE SIGN-OFF │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Cross-Document Consistency Matrix

All five core specification documents and this safety report are fully synchronized to **Version 1.6.0**:

| Document Name | Version | State Machine | Concurrency & Compensation | RBAC & Scope | Public Intake Idempotency | Pending Decisions |
|---|---|---|---|---|---|---|
| [`phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) | **1.6.0** | Aligned (12 states) | Aligned (Lead quarantine) | Aligned (Default-deny) | Aligned (Option A vs B under HUMAN-DEC-03, multi-entity transaction) | Surfaced (Pending) |
| [`phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) | **1.6.0** | Aligned (8-state Lead) | Aligned (Quarantine guard) | Aligned (Claiming vs assignment) | Aligned (Unassigned queue) | Surfaced (Pending) |
| [`phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) | **1.6.0** | Aligned | Aligned (Assignment optimistic lock) | Aligned (Destination assignee team check, active membership) | Aligned | Surfaced (Pending) |
| [`phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) | **1.6.0** | Authoritative Source (12 states) | Authoritative Source (Lead-Level Quarantine, 404 Protocol) | Aligned | N/A (Authenticated) | Surfaced (Pending) |
| [`phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) | **1.6.0** | Aligned (AC-CON-01 to 22) | Aligned (AC-CON-15 to 22) | Aligned (AC-SEC-01 to 13) | Aligned (AC-ING-01 to 13) | Surfaced (Pending) |
| [`phase-01.6-final-safety-corrections-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.6-final-safety-corrections-report.md) | **1.6.0** | Certified Baseline | Certified Baseline | Certified Baseline | Certified Baseline | Certified Baseline |

---

## 9. Remaining Technical & Architectural Risks

The following residual technical risks are explicitly acknowledged:

1. **Third-Party Provider Unfenced Packet Race:** While Lead-Level Compensation Quarantine prevents Worker B from committing conversion during Worker A's paused deletion, Supabase Auth itself does not support transactional rollback. If Worker A's deletion arrives while the user is actively receiving an email or browsing, Auth session revocation is eventual.
2. **Prisma Connection Pooler Privilege Boundary:** Until an unprivileged PostgreSQL connection pooler role (`NOBYPASSRLS`) is provisioned in Phase 02/06, public intake tenant isolation depends on application-layer query scoping in `CrmIntakeRepository`.
3. **Third-Party Provider Outage Latency:** During an extended Supabase Auth outage, leads undergoing compensation remain in quarantine until connectivity is restored, temporarily delaying conversion attempts on those specific leads.

---

## 10. Final Recommendation & Exit Gate

### Audit Recommendation: **ACCEPT WITH CONDITIONS**

The Phase 01 specification suite is mathematically coherent, distributed-systems sound, and hardened against stale worker races, unauthorized assignments, and boundary idempotency flaws.

### Conditions for Proceeding to Phase 02:
1. **Human Decision Election:** Formal stakeholder recording of choices for `HUMAN-DEC-01`, `HUMAN-DEC-02`, and `HUMAN-DEC-03`.
2. **Explicit Human Phase 01 Sign-off:** Direct written authorization from human leadership accepting Phase 01 specifications.
3. **Strict Enforcement of Implementation Ban:** Phase 02 (Prisma Schema & Database Migrations) remains **STRICTLY UNAUTHORIZED** until Conditions 1 and 2 are satisfied.
