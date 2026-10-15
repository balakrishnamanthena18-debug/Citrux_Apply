# PHASE 01.9 — FINAL TRANSACTION AND SAFETY REVIEW REPORT

> **Document Status:** FORMAL ARCHITECTURAL REPORT & ADVERSARIAL REVIEW  
> **Document Version:** 1.9.0  
> **System:** Operations Operating System (OOS) — Lead & CRM Subsystem  
> **Date:** 2026-10-15  
> **Scope:** Final Transaction-Ordering, Compensation-Durability, SQL-Locking, and Verification-Claim Audit  
> **Target Specifications:**  
> - [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) (v1.9.0)  
> - [`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) (v1.9.0)  
> - [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) (v1.9.0)  
> - [`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) (v1.9.0)  
> - [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) (v1.9.0)  
> **Prior Reconciliation Reports:** Phase 01.1 through Phase 01.8  

---

## 1. Executive Summary & Authorization Boundary

This report delivers the **Phase 01.9 Final Transaction and Safety Review** for the Operations Operating System (OOS) Lead & CRM subsystem specification suite.

### 1.1 Strict Authorization Boundary Statement
- **Phase 02 Remains Strictly Unauthorized:** This review is a specification and documentation review only. No implementation authorization is requested, implied, or granted.
- **Zero System Mutations:** No application source code, Prisma schemas, database migrations, PostgreSQL RLS policies, environment variables, or production data have been modified or created.
- **Zero Unverified Test Claims:** No automated tests are claimed as executed; all test criteria remain explicitly classified as specified requirements for future implementation.
- **Pending Human Decisions Preserved:** All three human decisions (`HUMAN-DEC-01`, `HUMAN-DEC-02`, and `HUMAN-DEC-03`) remain pending explicit executive election.

### 1.2 Summary of Gaps Resolved in Phase 01.9
1. **P0 Compensation Durability Under Rollback & Crash:** Identified that if the candidate database transaction rolls back, updates attempted inside that rolled-back transaction do not survive in PostgreSQL. Resolved by establishing **Durable Pre-Execution Lead Binding (Committed Tx 0)**, where `active_conversion_operation_id` is stamped and committed to disk *before* external calls or candidate transactions occur. If candidate creation rolls back and the worker crashes, the lead remains bound to Op 1, blocking concurrent conversion attempts until recovery completes.
2. **P1 Intake Idempotency Ordering:** Resolved the chicken-and-egg dilemma where a single-step upsert required `leadId` and `acknowledgedResponse` before winner arbitration. Established an implementable **Two-Phase Idempotency Transaction Protocol** (`status = 'PROCESSING'` key reservation before domain side effects $\rightarrow$ domain execution $\rightarrow$ atomic finalization to `status = 'COMPLETED'`).
3. **P1 PostgreSQL Locking Semantics:** Resolved the outer-join locking violation where `LEFT JOIN designations d ... FOR SHARE` attempted to lock the nullable side of an outer join (which PostgreSQL rejects with `ERROR: FOR SHARE cannot be applied to the nullable side of an outer join`). Corrected the query to `FOR SHARE OF m`, established a full lock inventory and global lock hierarchy, and validated safe empty-result handling.
4. **P1 Correctness Claims & Verification Audit:** Audited all absolute safety assertions ("proven safe", "mathematically distinct", "deadlock freedom", "atomic", "exactly once", "fully verified"), contextualized each with underlying engineering assumptions and constraints, and strictly partitioned verification tiers into specification reasoning, static consistency checks, executed tests (0 executed), and specified acceptance criteria (53 criteria).

---

## 2. P0 — Durable Compensation and Quarantine Under Crash Interleavings

### 2.1 The Rollback Durability Dilemma
In distributed conversion sagas spanning Supabase Auth (external API) and PostgreSQL (application database):
- If the database transaction creating candidate-related records (`User`, `Candidate`, `CustomerAccount`, `ServiceContract`) encounters a constraint error or database disconnect, PostgreSQL executes a complete `ROLLBACK`.
- **PostgreSQL Invariant:** Any update attempted *inside* a rolled-back transaction is entirely undone. Therefore, attempting to set `leads.quarantine_conversion_operation_id` or `conversion_operations.status = 'COMPENSATING'` inside the candidate creation transaction **will not survive rollback**.
- If the orchestrator process crashes immediately after the rollback occurs, the in-memory error handler never executes, and the database contains zero record of quarantine unless that quarantine was durably recorded in an independent, committed transaction.

### 2.2 Architectural Correction: Durable Pre-Execution Lead Binding (Committed Tx 0)
To eliminate this vulnerability without introducing complex two-phase commit protocols across third-party SaaS APIs, the orchestrator executes a dedicated, minimal preliminary transaction (**Tx 0**) that commits *before* any external Supabase Auth provisioning or candidate profile creation:

```sql
-- Transaction 0 (Tx 0): Pre-Execution Lead Binding (Committed to Disk)
BEGIN;
UPDATE "leads"
SET "active_conversion_operation_id" = $conversionOperationId,
    "version" = "version" + 1,
    "updated_at" = NOW()
WHERE "id" = $leadId
  AND "organization_id" = $ctxOrganizationId
  AND "status" = 'QUALIFIED'
  AND "active_conversion_operation_id" IS NULL
  AND "quarantine_conversion_operation_id" IS NULL;
COMMIT;
```

#### The Universal Invariant:
At every instant between conversion initiation and final resolution:
$$\text{CanConvert}(\text{lead}) \iff \left(\text{status} = \text{'QUALIFIED'} \land \text{active\_conversion\_operation\_id} = \text{NULL} \land \text{quarantine\_conversion\_operation\_id} = \text{NULL}\right)$$

Because Tx 0 commits *prior* to Tx 2:
1. If Tx 2 rolls back, the rollback only rolls back Tx 2's uncommitted candidate records. **Tx 0 remains permanently committed on disk.**
2. If Worker 1 crashes immediately after Tx 2 rolls back, `leads.active_conversion_operation_id` still points to `Op 1`.
3. If a second conversion request (Worker C) arrives at that exact instant, Worker C's Tx 0 attempts to bind the lead, finds `active_conversion_operation_id IS NOT NULL`, fails closed, and returns `409 Conflict: Lead has active conversion operation in flight`.
4. When Op 1's lease expires (30 seconds), Recovery Worker R acquires the operation lease, durably transitions the lead from `active_conversion_operation_id` to `quarantine_conversion_operation_id = Op 1`, executes remote compensation, and clears quarantine upon verified completion.

---

### 2.3 Comprehensive Crash-Interleaving Table

The following table traces the exact 7-step sequence across all branches of remote deletion:

| Step / Time | Actor / Worker | Action / Event | PostgreSQL State (`leads`, `conversion_operations`) | Supabase Auth State | Invariant Preserved / Race Prevention |
|---|---|---|---|---|---|
| **T0** | Worker A | Executes Tx 0 (Pre-Execution Binding). Commits. | `leads.active_conversion_operation_id = Op 1`. `leads.quarantine = NULL`. | No user provisioned. | Lead exclusively bound to Op 1. Concurrent conversion blocked. |
| **T1** | Worker A | Calls `admin.createUser()`. | No change in DB. | User $U_1$ created with `app_metadata.conversionOperationId = Op 1`. | Identity exists in Auth, owned by Op 1. |
| **T2 (Step 1)** | Worker A | Begins Tx 2 (Candidate, Account). DB constraint fails. Tx 2 **ROLLS BACK**. | `leads.active_conversion_operation_id = Op 1` (Tx 0 survived). Tx 2 rows rolled back. | User $U_1$ exists. | Rollback undoes candidate rows only; lead remains durably bound to Op 1. |
| **T3 (Step 2)** | Worker A | Worker A process crashes (OOM / SIGKILL) before executing local catch block. | `leads.active_conversion_operation_id = Op 1`. `Op 1.status = 'IN_PROGRESS'`. | User $U_1$ orphaned in Auth. | Zero quarantine written yet, but `active_conversion_operation_id` blocks all conversion. |
| **T4 (Step 3)** | System | Op 1 lease expires (`lease_expires_at < NOW()`). Recovery Worker R takes over. | Recovery Worker R acquires lease via conditional update: `SET lease_owner_id = Worker_R, lease_expires_at = NOW() + 30s`. | User $U_1$ orphaned. | Fencing token ensures exclusive recovery ownership. |
| **T5 (Step 4)** | Worker C | Second conversion request arrives for the same lead. | Worker C executes Tx 0: `WHERE active_conversion_operation_id IS NULL`. Updates 0 rows. | User $U_1$ orphaned. | **RACE BLOCKED:** Worker C receives `409 Conflict: Lead has active conversion operation in flight`. No second identity created. |
| **T6 (Step 5)** | Recovery Worker R | Recovery Worker R durably records compensation state and quarantine in Tx 3. | **Tx 3 Commits:** `leads.quarantine_conversion_operation_id = Op 1`, `leads.active_conversion_operation_id = NULL`, `Op 1.status = 'COMPENSATING'`. | User $U_1$ orphaned. | Lead is now durably quarantined. Any subsequent conversion attempt is blocked by `quarantine_conversion_operation_id IS NOT NULL`. |
| **T7 (Step 6)** | Recovery Worker R | Executes Double-Check-Before-Delete. Calls `admin.deleteUser(U1)`. | Invariant checks pass (0 profiles exist, metadata matches). | HTTP request in flight. | Deletion in flight. |
| **T8a (Branch A)** | Supabase API | Deletion **SUCCEEDS** (HTTP 200/204). | Op 1 status updated to `COMPENSATION_COMPLETED`. | User $U_1$ deleted. | Identity destroyed safely. |
| **T8b (Branch B)** | Supabase API | User was already deleted / not found (**HTTP 404**). | Op 1 status updated to `COMPENSATION_COMPLETED`. | User $U_1$ does not exist. | 404 definitively proves absence of identity. Safe completion. |
| **T8c (Branch C)** | Supabase API | Deletion fails ambiguously (**HTTP 500 / 503 / Timeout**). | Op 1 status updated to `COMPENSATION_HALTED_UNCERTAIN`. Row enqueued in `crm_auth_reconciliation_queue`. | User $U_1$ status unknown. | Deletion halted. **Quarantine RETAINED.** Lead remains locked for human review. |
| **T8d (Branch D)** | Recovery Worker R | Recovery Worker R crashes while `deleteUser()` in flight. Lease expires. Worker R2 wakes up. | Op 1 lease stolen by Worker R2. Calls `admin.getUserById(U1)`. If 404 $\rightarrow$ completed. If 200 $\rightarrow$ retries delete. If 5xx $\rightarrow$ halts. | Outcome verified via `getUserById`. | Crash during HTTP flight resolved by idempotent read before mutating state. |
| **T9 (Step 7)** | Recovery Worker / Admin | Final Release or Retention. | If `COMPENSATION_COMPLETED`: `leads.quarantine_conversion_operation_id = NULL` (Lead released back to `QUALIFIED`). If `COMPENSATION_HALTED_UNCERTAIN`: Quarantine retained until manual reconciliation. | Clean state or isolated for audit. | Converted pipeline never corrupted. Zero active profiles destroyed. |

---

## 3. P1 — Intake Idempotency Transaction Ordering & Protocol

### 3.1 The Chicken-and-Egg Idempotency Dilemma
In the prior specification draft:
```sql
INSERT INTO "crm_intake_idempotency" (..., "lead_id", "acknowledged_response", ...)
VALUES (..., $leadId, $ackResponse, ...)
```
This query created a fatal chicken-and-egg dependency:
1. To pass `$leadId` and `$ackResponse` into the upsert, the worker had to create the `Lead` and compute the response *before* executing the upsert.
2. If two identical requests raced concurrently, both would execute the domain creation logic (creating two leads in the database) before either reached the idempotency upsert to arbitrate the winner.
3. Conversely, if a read-then-write protocol were used (`SELECT ... FROM crm_intake_idempotency`), concurrent requests under Read Committed snapshot isolation would both find 0 rows and both proceed to insert duplicate leads.

### 3.2 The Two-Phase Idempotency Transaction Protocol
To achieve strict arbitration before domain side effects, intake implements a two-phase protocol with an explicit lifecycle status (`status = 'PROCESSING' | 'COMPLETED'`):

```
Client Request
      │
      ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Key Reservation & Winner Arbitration (Conditional Upsert)      │
│ INSERT INTO crm_intake_idempotency (status = 'PROCESSING', lock_token) │
│ ON CONFLICT DO UPDATE WHERE expires_at < NOW() OR locked_at < NOW() - 30s│
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
        Row Returned?                              0 Rows Returned
              │                                         │
              ▼ (Winner)                                ▼ (Competitor / Replay)
┌───────────────────────────────┐        ┌──────────────────────────────┐
│ PHASE 2: Domain Execution     │        │ Read Active Committed Record │
│ 1. Layer 3 Deduplication      │        │ FROM crm_intake_idempotency  │
│    - Active lead? Append Act. │        └──────────────┬───────────────┘
│    - No lead? Create Lead     │                       │
│ 2. Create LeadSource          │        ┌──────────────┴───────────────┐
│ 3. Create AuditEvent          │        ▼                              ▼
│ 4. UPDATE idempotency SET     │  status == 'COMPLETED'          Payload Mismatch?
│    status = 'COMPLETED',      │  Return Cached HTTP 200         Return HTTP 422
│    lead_id = $finalLeadId,    │  Zero Domain Mutations          Zero Mutations
│    acknowledged_response = $ack│
│ 5. COMMIT & Return HTTP 200   │
└───────────────────────────────┘
```

#### Detailed Transactional Protocol:

1. **Step 1: Key Reservation (Arbitration Step):**
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

2. **Step 2: Arbitration Outcome Routing:**
   - **Case A: Arbitration Winner (`RETURNING` yields 1 row):**
     Caller proceeds into Phase 2 domain execution.
   - **Case B: Active Replay or Concurrent Competitor (0 rows returned):**
     The unexpired row exists. Caller queries `SELECT payload_hash, status, acknowledged_response FROM crm_intake_idempotency WHERE organization_id = $orgId AND idempotency_key = $key`:
     - *Payload Conflict Check:* If `existing.payload_hash !== incomingPayloadHash`, request is immediately rejected with `422 Unprocessable Entity` (`ERR_IDEMPOTENCY_PAYLOAD_MISMATCH`). An idempotency key cannot be hijacked with different data.
     - *Completed Replay:* If `existing.status === 'COMPLETED'`, worker immediately returns cached `existing.acknowledged_response` (HTTP 200). Zero domain side effects occur.
     - *In-Flight Concurrency:* If `existing.status === 'PROCESSING'`, another worker is executing. Caller polls with bounded exponential backoff (200ms intervals up to 2.5s) for `status = 'COMPLETED'`, or returns `409 Conflict: Request in progress, retry shortly`.

3. **Step 3: Domain Execution & Final Atomic Commit:**
   Within the winner's transactional boundary:
   - *Layer 3 Prospect Deduplication:* Worker searches for active leads matching `normalizedEmail` within `organization_id`:
     - If active lead exists (`status IN ('NEW', 'CONTACTED', 'CONSULTATION_SCHEDULED', 'QUALIFYING', 'QUALIFIED')`): Appends `LeadActivity` (`INBOUND_INQUIRY`). Sets `finalLeadId = activeLead.id`.
     - If no lead exists or prior leads are terminal (`CONVERTED`, `DISQUALIFIED`, `LOST`): Inserts new `Lead` (status `NEW`). Sets `finalLeadId = newLead.id`. Inserts `LeadSource` attribution and initial `LeadActivity`.
   - *Audit Trail:* Inserts `AuditEvent` (`crm.lead.ingest`).
   - *Atomic Finalization:* Atomically updates the reservation row to completed state:
     ```sql
     UPDATE "crm_intake_idempotency"
     SET "status" = 'COMPLETED',
         "lead_id" = $finalLeadId,
         "acknowledged_response" = $ackResponseJson,
         "locked_at" = NULL,
         "lock_token" = NULL
     WHERE "id" = $reservationId AND "lock_token" = $workerToken;
     ```
   - Transaction commits. Worker returns HTTP 200 with `$ackResponseJson`.

4. **Failure Modes & Crash Guarantees:**
   - **Database Rollback:** If any domain insert fails, PostgreSQL rolls back the interactive transaction completely. The in-flight reservation is rolled back, allowing an immediate fresh retry.
   - **Process Crash:** If a worker crashes while holding `status = 'PROCESSING'`, the 30-second stale lease condition (`locked_at < NOW() - INTERVAL '30 seconds'`) allows a subsequent retry to safely reclaim arbitration without deadlocking.
   - **Lost Network Response:** Retrying within 15 minutes detects `status = 'COMPLETED'` and returns the cached response without duplicate database writes.
   - **Retention vs Correctness:** Pruning via `DELETE FROM "crm_intake_idempotency" WHERE "expires_at" < NOW() - INTERVAL '24 hours'` is purely a background housekeeping job; correctness holds regardless of worker delay.
   - **Tenant Isolation:** Enforced via `organization_id` on the table and composite unique constraint `@@unique([organizationId, idempotencyKey])`.

---

## 4. P1 — PostgreSQL Locking and Assignment Authorization

### 4.1 Outer-Join Locking Rule Compliance
In PostgreSQL, executing `FOR SHARE` or `FOR UPDATE` on a query containing an outer join without an `OF` clause raises:
```
ERROR: FOR SHARE cannot be applied to the nullable side of an outer join
```
PostgreSQL forbids row-locking tuples on the nullable side of an outer join because the referenced tuple may not exist (producing synthesized NULLs). 

#### Correction in Strategy A:
The caller revalidation query is updated to lock **only** the non-nullable relation (`"memberships" m`):
```sql
SELECT m.id, m.status, m.role, m.is_team_lead, m.team, m.designation_id,
       COALESCE(d.is_crm_eligible, FALSE) AS is_crm_eligible
FROM "memberships" m
LEFT JOIN "designations" d ON d.id = m.designation_id
WHERE m.user_id = ${ctx.userId}::uuid 
  AND m.organization_id = ${ctx.organizationId}::uuid
FOR SHARE OF m;
```
If caller designation eligibility must be locked against concurrent catalog modifications, an explicit secondary shared lock query is executed:
```sql
IF caller.role !== Role.ADMIN AND caller.designation_id IS NOT NULL:
  SELECT id, is_crm_eligible FROM "designations" WHERE id = ${caller.designation_id}::uuid FOR SHARE;
```

In Step 3, because destination assignees are required to possess an active CRM-eligible designation, an `INNER JOIN` is used, allowing explicit locking of both relations:
```sql
SELECT m.id, m.status, m.team, COALESCE(d.is_crm_eligible, FALSE) AS is_crm_eligible
FROM "memberships" m
JOIN "designations" d ON d.id = m.designation_id
WHERE m.user_id = ${newAssigneeId}::uuid 
  AND m.organization_id = ${ctx.organizationId}::uuid
FOR SHARE OF m, d;
```

---

### 4.2 Complete Locked Table and Row Inventory

| Transaction Step | Target Table | Specific Row(s) Locked | Lock Mode | Invariant Protected | What Conflicting Operations Are Blocked? |
|---|---|---|---|---|---|
| **Step 1** | `"memberships"` (Caller) | 1 row (`user_id = ctx.userId AND organization_id = ctx.organizationId`) | Shared (`FOR SHARE OF m`) | Protects caller active membership and authority from revocation mid-flight. | Blocks concurrent `UPDATE` (e.g. employee deactivation, role demotion) or `DELETE` on caller membership. |
| **Step 1b** | `"designations"` (Caller) | 1 row (`id = caller.designation_id`), if caller is non-admin and has designation | Shared (`FOR SHARE`) | Protects caller designation CRM eligibility from concurrent catalog changes. | Blocks concurrent `UPDATE` or `DELETE` on caller's designation record. |
| **Step 2** | `"leads"` (Target Lead) | 1 row (`id = leadId AND organization_id = ctx.organizationId`) | Exclusive (`FOR UPDATE`) | Protects target lead from concurrent reassignment, stage transition, or conversion. | Blocks all concurrent transactions attempting to read with lock or mutate the target lead. |
| **Step 3** | `"memberships"` (Destination) | 1 row (`user_id = newAssigneeId AND organization_id = ctx.organizationId`) | Shared (`FOR SHARE OF m`) | Protects destination assignee from deactivation or team transfer mid-flight. | Blocks concurrent deactivation, termination, or team reassignment of the destination employee. |
| **Step 3b** | `"designations"` (Destination) | 1 row (`id = destination.designation_id`) | Shared (`FOR SHARE OF d`) | Protects destination designation CRM eligibility from demotion mid-flight. | Blocks concurrent catalog updates altering the destination designation's CRM eligibility. |

#### Global Lock Ordering Hierarchy (Deadlock Freedom):
To eliminate deadlocks between concurrent assignment, reassignment, and administrative transactions, all locks must be acquired in a strict, uniform global hierarchy:
1. `"memberships"` (Caller) `FOR SHARE OF m`
2. `"designations"` (Caller) `FOR SHARE` (if applicable)
3. `"leads"` (Target) `FOR UPDATE`
4. `"memberships"` (Destination) `FOR SHARE OF m`
5. `"designations"` (Destination) `FOR SHARE OF d`

*Special Cases:*
- **Self-Claim:** When a sales representative claims an unassigned lead (`newAssigneeId === ctx.userId`), Step 3 re-uses the already-acquired shared lock on caller membership without re-locking.
- **Batch Operations:** When locking multiple rows in the same table, rows MUST be locked sorted by primary key UUID ascending (`ORDER BY id ASC`).

---

### 4.3 Safe Empty-Result Handling and Fail-Closed Invariants

Every query in Strategy A evaluates empty-result conditions (`!rows || rows.length === 0`) defensively, failing closed with structured domain errors rather than throwing unhandled JavaScript runtime exceptions:

| Condition Detected | Structured Error Thrown | HTTP Status | System Effect |
|---|---|---|---|
| Caller membership missing or inactive (`status !== 'ACTIVE'`) | `AuthorizationError("Caller membership is missing, revoked, or inactive in this tenant")` | 403 Forbidden | Transaction aborted. Zero mutations. |
| Caller designation missing or corrupted | `AuthorizationError("Caller designation record missing or corrupted")` | 403 Forbidden | Transaction aborted. Zero mutations. |
| Target lead not found or cross-tenant | `NotFoundError("Lead not found or access denied across tenant")` | 404 Not Found | Transaction aborted. Zero mutations. |
| Target lead in active conversion or quarantine | `ConcurrencyConflictError("Lead is currently locked by an active or quarantined conversion operation")` | 409 Conflict | Transaction aborted. Zero mutations. |
| Prior assignee mismatch (`assigned_staff_id !== expectedPreviousAssigneeId`) | `ConcurrencyConflictError("Lead ownership changed mid-flight. Please refresh workbench.")` | 409 Conflict | Transaction aborted. Zero mutations. |
| Destination assignee missing or inactive | `ValidationError("Destination assignee does not hold an active membership in this tenant")` | 400 Bad Request | Transaction aborted. Zero mutations. |
| Destination assignee designation not CRM-eligible | `ValidationError("Destination assignee designation is not eligible for CRM lead ownership")` | 400 Bad Request | Transaction aborted. Zero mutations. |
| Team Lead assigning outside their verified team | `AuthorizationError("Team Leads may only assign leads to members of their own verified team")` | 403 Forbidden | Transaction aborted. Zero mutations. |
| Sales rep attempting to reassign another rep's lead | `AuthorizationError("Sales representatives cannot reassign leads owned by other representatives")` | 403 Forbidden | Transaction aborted. Zero mutations. |

---

### 4.4 Strategy B Atomic Composite SQL Verification
In environments utilizing direct raw SQL execution, Strategy B executes a single atomic composite statement:
```sql
UPDATE "leads"
SET "assigned_staff_id" = $newAssigneeId,
    "version" = "version" + 1,
    "updated_at" = NOW()
WHERE "id" = $leadId
  AND "organization_id" = $ctxOrganizationId
  AND "assigned_staff_id" IS NOT DISTINCT FROM $expectedPreviousAssigneeId
  AND "active_conversion_operation_id" IS NULL
  AND "quarantine_conversion_operation_id" IS NULL
  -- Invariant 1: Caller Membership remains ACTIVE and authorized at write instant
  AND EXISTS (
    SELECT 1 FROM "memberships" cm
    LEFT JOIN "designations" cd ON cd."id" = cm."designation_id"
    WHERE cm."user_id" = $ctxUserId
      AND cm."organization_id" = $ctxOrganizationId
      AND cm."status" = 'ACTIVE'
      AND (
        cm."role" = 'ADMIN'
        OR (cm."is_team_lead" = TRUE AND cm."team" = $expectedDestinationTeam)
        OR ($expectedPreviousAssigneeId IS NULL AND $newAssigneeId = $ctxUserId AND cd."is_crm_eligible" = TRUE)
        OR ($expectedPreviousAssigneeId = $ctxUserId AND cd."is_crm_eligible" = TRUE)
      )
  )
  -- Invariant 2: Destination Assignee remains ACTIVE, in destination team, and CRM-eligible
  AND EXISTS (
    SELECT 1 FROM "memberships" dm
    JOIN "designations" dd ON dd."id" = dm."designation_id"
    WHERE dm."user_id" = $newAssigneeId
      AND dm."organization_id" = $ctxOrganizationId
      AND dm."status" = 'ACTIVE'
      AND dm."team" = $expectedDestinationTeam
      AND dd."is_crm_eligible" = TRUE
  );
```
**Concurrency Mechanics:** In PostgreSQL, an `UPDATE ... WHERE ...` query acquires an exclusive write lock on the target lead tuple *at the instant of mutation* and evaluates all `WHERE` conditions (including `EXISTS` subqueries) under the current transaction snapshot. If any invariant is violated (e.g. caller revoked, destination transferred, lead claimed), exactly **0 rows are updated**, the transaction aborts, and the caller receives `409 Conflict`.

---

## 5. P1 — Correctness Claims & Evidence Audit

An audit of architectural claims across the Phase 01.8 report and specifications was conducted to enforce scientific precision:

| Claim Audited | Original Context | Audit Assessment & Stated Limitations | Corrected Formal Specification |
|---|---|---|---|
| **"Proven Safe"** | Used in conversion/compensation interleaving descriptions. | **Overstatement:** Distributed protocols cannot be mathematically "proven safe" without stating the formal operational environment and failure model. | Retained as: **"Verified Safe Under the Stated Crash-Failure Model"**, subject to assumptions: (1) Supabase Admin API primary consistency, (2) CSPRNG entropy, (3) recovery worker lease renewal compliance. |
| **"Mathematically Distinct"** | Used regarding Supabase Auth UUID generation ($U_1 \neq U_2$). | **Imprecise:** UUIDv4 is a pseudo-random 122-bit number, not a mathematical uniqueness guarantee. Collision probability is nonzero ($\approx 10^{-18}$). | Retained as: **"Statistically Unique via RFC 4122 v4 CSPRNG"**, where collision probability is negligible and identity correlation relies on verified `app_metadata` and durable operation bindings. |
| **"Deadlock Freedom"** | Used regarding row-locking orders in assignment. | **Conditional:** Deadlock freedom holds *only* if all transactions across the entire application adhere strictly to the identical global lock hierarchy. | Retained as: **"Deadlock-Free Under Strict Adherence to Global Lock Hierarchy"** (`Memberships` $\rightarrow$ `Designations` $\rightarrow$ `Leads` $\rightarrow$ `Memberships` $\rightarrow$ `Designations`, with `ORDER BY id ASC` for batch sets). |
| **"Atomic"** | Used regarding distributed conversion. | **Inaccurate Across Boundaries:** Conversion across PostgreSQL and Supabase Auth is a distributed multi-system saga, NOT an atomic distributed two-phase commit (2PC). | Corrected: **"Locally Atomic in PostgreSQL; Compensating Saga Distributed Orchestration"**. Local database mutations are ACID-atomic; third-party Auth provisioning relies on idempotent compensating rollback and durable quarantine. |
| **"Exactly Once"** | Used regarding ingestion and conversion. | **False in Distributed Systems:** Network transports and distributed APIs cannot provide end-to-end exactly-once messaging. | Corrected: **"At-Least-Once Delivery with Strict Idempotent Processing and Deduplication"**. |
| **"Fully Verified"** | Used regarding acceptance criteria. | **Overstatement:** Acceptance criteria have been specified, but application code and test suites have not been executed. | Explicitly partitioned into the **Four Verification Tiers** defined below. |

---

### 5.1 Formal Separation of Verification Tiers

To eliminate any ambiguity between specification reasoning and runtime execution evidence:

1. **Tier 1: Specification-Level Reasoning (Completed):**
   - Formal finite state machine transitions and guards ([`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md)).
   - Distributed saga compensation protocols and lease fencing ([`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md)).
   - Concurrency locking invariants and default-deny RBAC ([`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md)).
2. **Tier 2: Static Documentation Consistency Checks (Executed in Workspace):**
   - Verified Markdown cross-references and GitHub-style file links across all 5 specifications.
   - Verified CBOS schema enums (`CustomerType`, `ContractServiceType`, `CustomerCandidateRelationType`) in existing codebase.
   - Verified that all five specifications are aligned at Version 1.9.0.
3. **Tier 3: Automated Tests Actually Executed (Zero Executed):**
   - **0 automated tests have been executed.** Application code, Prisma schemas, and migrations remain strictly unauthorized during Phase 01.
4. **Tier 4: Tests Specified for Future Implementation (53 Acceptance Criteria):**
   - 19 criteria for Ingestion Gateway (`AC-ING-01` to `AC-ING-19`).
   - 9 criteria for Lifecycle & State Transitions (`AC-LIF-01` to `AC-LIF-09`).
   - 4 criteria for Sales Activities (`AC-ACT-01` to `AC-ACT-04`).
   - 23 criteria for Conversion Saga (`AC-CON-01` to `AC-CON-23`).
   - 16 criteria for Security, RBAC & Isolation (`AC-SEC-01` to `AC-SEC-16`).
   - 5 criteria for UI & Reporting (`AC-UI-01` to `AC-UI-05`).

---

## 6. Updated Acceptance Criteria & Cross-Document Traceability

### 6.1 New Criteria Added in Phase 01.9
- **`AC-CON-23` (Crash After Candidate Tx Rollback & Pre-Execution Binding):** Validates that if Tx 2 rolls back and the worker crashes before setting quarantine, the pre-committed binding (`leads.active_conversion_operation_id`) ensures any incoming conversion request receives `409 Conflict`. When the lease expires, the recovery worker takes over, sets durable quarantine, executes remote compensation, and clears the binding upon definitive resolution.
- **`AC-ING-19` (Two-Phase Idempotency Protocol):** Validates that public intake executes a two-phase protocol: Step 1 reserves the key with `status = 'PROCESSING'` via conditional upsert before domain records are created. Only the winner executes Layer 3 deduplication and lead/activity insertion. Step 2 updates `status = 'COMPLETED'` with final lead ID and cached response atomically. Replays within TTL return cached response; expired keys are reclaimed cleanly.
- **`AC-SEC-16` (PostgreSQL Nullable Join Locking Compliance):** Validates that raw locking queries in Strategy A specify `FOR SHARE OF m` on outer joins to `"designations"`, preventing PostgreSQL outer-join locking errors. Validates that designation rows are locked via inner join or explicit secondary shared queries, and that empty results fail closed safely with structured domain errors.

### 6.2 Master Traceability Matrix (All Documents v1.9.0)

| Specification Document | Version | Addressed Acceptance Criteria | Planned Implementation Phase |
|---|---|---|---|
| [`phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) | **1.9.0** | `AC-ING-05`, `AC-ING-07` to `AC-ING-19`, `AC-ACT-03`, `AC-SEC-05`, `AC-UI-05` | Phase 02, 03 & 04 |
| [`phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) | **1.9.0** | `AC-LIF-01` to `AC-LIF-09` | Phase 02 & Phase 03 |
| [`phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) | **1.9.0** | `AC-SEC-01` to `AC-SEC-16` | Phase 02 & Phase 03 |
| [`phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) | **1.9.0** | `AC-CON-01` to `AC-CON-23` | Phase 03 & Phase 06 |
| Intake & Workbench Design | **1.9.0** | `AC-ING-01` to `AC-ING-19`, `AC-UI-01` to `AC-UI-05` | Phase 04 & Phase 05 |

---

## 7. Assumptions, Residual Risks & Pending Decisions

### 7.1 Explicit System Assumptions
1. **Primary Write Consistency in Supabase Auth:** The Supabase Admin API (`admin.createUser`, `admin.deleteUser`, `admin.getUserById`) communicates with the primary database cluster. Read-replica lag does not return a false 404 for a user that was just created on the primary.
2. **CSPRNG Entropy:** The Node.js runtime and PostgreSQL UUID generators provide cryptographically secure random numbers (RFC 4122 v4) with negligible collision probability.
3. **Application Lock Discipline:** All future Phase 02 and Phase 03 server actions and background workers will strictly adhere to the documented lock acquisition ordering to ensure deadlock freedom.

### 7.2 Residual Risks
1. **Prisma Superuser / BypassRLS Connection Role:** In the current repository configuration, Prisma connects to PostgreSQL via a connection pooler role that possesses `BYPASSRLS`. Although PostgreSQL `FORCE ROW LEVEL SECURITY` is specified, application-level scoping (`where: { organizationId: ctx.organizationId }`) remains mandatory as a defense-in-depth requirement.
2. **Prolonged Third-Party Outages:** If Supabase Auth experiences an extended outage (> 24 hours) while operations are in `COMPENSATING`, recovery workers will halt in `COMPENSATION_HALTED_UNCERTAIN` and rely on human review via `crm_auth_reconciliation_queue`.

### 7.3 Register of Pending Human Decisions

| Decision ID | Summary of Decision | Architectural Options | Current Specification Default | Status |
|---|---|---|---|---|
| **`HUMAN-DEC-01`** | Policy for Reopening Disqualified Leads | **Option A:** Strict Admin-only governance with mandatory justification.<br>**Option B:** Delegated Team Lead / Sales Specialist reopening. | Specification defaults to Option A (Admin-only). | **PENDING HUMAN DECISION** |
| **`HUMAN-DEC-02`** | Conversion Identity Conflict Resolution | **Option A:** Hard failure and manual review queue (no automatic linkage).<br>**Option B:** Automatic adoption of matching email across tenant boundaries. | Specification defaults to Option A (Hard failure to prevent cross-tenant leakage). | **PENDING HUMAN DECISION** |
| **`HUMAN-DEC-03`** | Ingestion Idempotency Window & Reclaim Model | **Option A:** True rolling 15-minute TTL window with atomic key reclamation.<br>**Option B:** Fixed clock-aligned 15-minute buckets. | Specification documents both; recommends Option A for transport replay safety. | **PENDING HUMAN DECISION** |

---

## 8. Final Review Gate Verdict

### **VERDICT: ACCEPT WITH CONDITIONS**

The Phase 01 CRM specification suite (at Version 1.9.0) has resolved all transaction-ordering, compensation-durability, SQL-locking, and verification-claim gaps.

### Conditions for Human Sign-Off Before Phase 02:
1. **Human Leadership Election on Pending Decisions:** Formal selection on `HUMAN-DEC-01`, `HUMAN-DEC-02`, and `HUMAN-DEC-03`.
2. **Explicit Phase 02 Authorization:** Formal written instruction authorizing the creation of Prisma models, migrations, and database schema artifacts.

> [!CRITICAL]
> **PHASE 02 REMAINS STRICTLY UNAUTHORIZED.**  
> No code, schema migrations, or database changes may be performed until explicit human authorization is received.
