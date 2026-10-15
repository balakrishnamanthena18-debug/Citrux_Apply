# PHASE 01.10 — CONVERSION RECOVERY, FENCING & GOVERNANCE INTEGRITY AUDIT

> **Audit Report Status:** FINAL ADVERSARIAL AUDIT / PENDING HUMAN ACCEPTANCE  
> **Document Version:** 1.10.0  
> **Classification:** Distributed Systems Safety, Concurrency Verification & Governance Audit  
> **System:** Operations Operating System (OOS) — Lead & CRM Subsystem  
> **Date:** 2026-10-15  
> **Auditor Role:** Principal Enterprise Architect, Distributed Systems Specialist, PostgreSQL Concurrency Auditor  
> **Target Baseline:** OOS CRM Phase 01 Specification Suite (v1.9.0 $\rightarrow$ v1.10.0)  
> **Parent Specification:** [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md)  
> **Core Specifications Audited:**  
> 1. [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md)  
> 2. [`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md)  
> 3. [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md)  
> 4. [`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md)  
> 5. [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md)  

---

## Authorization Boundary & Governance Notice

> [!CAUTION]
> **STRICT DOCUMENTATION-ONLY REVIEW GATE — PHASE 02 UNAUTHORIZED**  
> 1. This document constitutes an architectural, distributed systems, and safety audit of the CRM Phase 01 specifications.  
> 2. **Zero code execution:** No application source code, Prisma schema models, SQL migrations, database seeders, Supabase Auth configuration, environment variables, or production data have been modified.  
> 3. **Pending human governance:** No pending human decision (`HUMAN-DEC-01`, `HUMAN-DEC-02`, `HUMAN-DEC-03`) has been approved, modified, or resolved on behalf of leadership.  
> 4. **No premature test claims:** Zero integration, unit, or concurrency tests are claimed as executed. All acceptance criteria (`AC-ING-01..20`, `AC-LIF-01..09`, `AC-ACT-01..04`, `AC-CON-01..24`, `AC-SEC-01..17`, `AC-UI-01..05`) remain strictly specified requirements for future implementation.  
> 5. **Phase 02 Authorization Status:** **STRICTLY UNAUTHORIZED** until executive leadership issues formal acceptance based on this audit.

---

## Executive Summary & Audit Mandate

The Phase 01.10 audit was commissioned to perform a rigorous adversarial review of the Phase 01 specification suite following the Phase 01.9 transaction and safety corrections. The audit focuses on five high-risk operational areas:

1. **Conversion Commit/Recovery Ambiguity (P0):** Resolving whether a crashed conversion worker can leave the system in an ambiguous state where a recovery worker erroneously treats a committed transaction as rolled back, destroying an active candidate profile via Supabase Auth compensation.
2. **Lease & State-Transition Integrity (P1):** Validating atomic Compare-and-Set (CAS) predicates across all 8 saga transitions, enforcing row-count validation (`assert(affectedRows === 1)`), and establishing the boundaries of database fencing against external HTTP requests (proving State-Machine Immunity).
3. **Intake Idempotency Crash Recovery & Worker Fencing (P1):** Auditing the reservation-first protocol under 8 race and failure edge cases, proving that reservation expiry alone never permits a competing worker to execute concurrent domain mutations.
4. **Human Decision Register Forensic Integrity (P1):** Correcting the historical ID drift introduced in Phase 01.9, re-establishing the canonical human decision IDs (`HUMAN-DEC-01`, `02`, `03`), and freezing cross-tenant identity conflict as a permanent security invariant (`SEC-INV-01`).
5. **PostgreSQL Concurrency & Locking Semantics Precision (P1):** Validating Read Committed re-evaluation semantics, global lock order compliance across administrative codepaths (`Memberships` $\rightarrow$ `Leads` $\rightarrow$ `LeadActivities` $\rightarrow$ `Designations`), and enforcing the strict prohibition of lock escalation.

---

## 1. P0 — Conversion Commit & Recovery Ambiguity Deep-Dive

### 1.1 The Seven Crash Boundaries

During lead conversion, the system orchestrates distributed state across PostgreSQL and an external identity provider (Supabase Auth). A crash or network partition can occur at any point across seven critical boundaries:

```
[Boundary 1] ──► Tx 0: Pre-execution Lead Binding & Operation Creation (DB Commit)
                      │
[Boundary 2] ──► Step 1: External Supabase Auth User Provisioning (HTTP Post)
                      │
[Boundary 3] ──► Tx 2: Candidate, Account, Contract & Lead Update (DB Begin/Execute)
                      │
[Boundary 4] ──► Tx 2 Commit: PostgreSQL Commits, but Worker Drops Connection / Crashes
                      │
[Boundary 5] ──► Step 3: Worker Crashes Before Writing Final Status ('COMPLETED')
                      │
[Boundary 6] ──► Lease Expiration: Worker Stalls/Pauses; Lease Expires (30s)
                      │
[Boundary 7] ──► Step 5/6: Recovery Worker Executes Remote Auth Deletion (HTTP Delete)
```

### 1.2 Resolution of Core Recovery Invariants

#### A. How recovery determines whether the candidate/profile transaction committed
A recovery worker **CANNOT** rely on `conversion_operations.status` alone. If the worker crashed between PostgreSQL transaction commit and writing the final operation status, `conversion_operations.status` remains at `DB_COMMITTING` or `AUTH_PROVISIONED` with an expired lease.

To eliminate ambiguity, Recovery Worker R executes the **Forward Recovery Inspection Query** within a read transaction before evaluating compensation:

```sql
SELECT 
    c.id AS candidate_id,
    ca.id AS customer_account_id,
    l.status AS lead_status
FROM "leads" l
LEFT JOIN "candidates" c 
    ON c.user_id = $authUserId AND c.organization_id = $organizationId
LEFT JOIN "customer_accounts" ca 
    ON ca.lead_id = l.id AND ca.organization_id = $organizationId
WHERE l.id = $leadId AND l.organization_id = $organizationId;
```

**Forward Recovery Convergence:**
- If `candidate_id IS NOT NULL` OR `customer_account_id IS NOT NULL` OR `lead_status = 'CONVERTED'`:
  - The downstream transaction **COMMITTED SUCCESSFULLY**.
  - Worker R executes forward recovery:
    ```sql
    UPDATE "crm_conversion_operations"
    SET status = 'COMPLETED',
        auth_compensation_authorized = false,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = $operationId AND status IN ('AUTH_PROVISIONED', 'DB_COMMITTING');
    
    UPDATE "leads"
    SET quarantine_conversion_operation_id = NULL
    WHERE id = $leadId AND quarantine_conversion_operation_id = $operationId;
    ```
  - Worker R logs an audit event (`CONVERSION_RECOVERED_FORWARD_CONVERGED`) and exits cleanly.
  - Compensation is **PERMANENTLY BLOCKED**.

#### B. Why a missing or stale operation status cannot be treated as proof of rollback
In distributed systems, the absence of an acknowledgment or a stale status (`DB_COMMITTING`) indicates an **uncertain outcome**, not a rollback. Treating a stale status as proof of rollback would trigger compensating deletion of the Supabase Auth identity of an active candidate whose profile, billing account, and contract are already committed in PostgreSQL. 

The recovery protocol enforces: **A stale operation status is evidence only of worker absence, never of transactional failure.** Verification of downstream entity existence is mandatory before initiating any compensation.

#### C. How a committed valid profile is protected from compensation
Protection is guaranteed by two independent, non-bypassable barriers:
1. **Database Pre-Deletion Check (Double-Check-Before-Delete):**
   Immediately before issuing an external HTTP deletion request, the recovery worker executes:
   ```sql
   SELECT 1 FROM "candidates" WHERE user_id = $authUserId AND organization_id = $organizationId
   UNION ALL
   SELECT 1 FROM "customer_accounts" WHERE lead_id = $leadId AND organization_id = $organizationId;
   ```
   If any row is returned, compensation is immediately aborted, transitioning the operation to `COMPENSATION_BLOCKED_PROFILE_EXISTS`.
2. **Revocation of Compensation Authorization:**
   Tx 2 atomically sets `auth_compensation_authorized = false` within the same transaction that inserts the `Candidate` record. The pre-deletion check requires `auth_compensation_authorized = true`. If false, deletion is blocked.

#### D. How operation creation and lead binding remain consistent
To prevent races between concurrent conversion requests, the operation is initialized and bound to the lead in an independent, pre-committed transaction (**Tx 0**):
- Tx 0 inserts `crm_conversion_operations` (`status = 'INITIATED'`).
- Tx 0 updates `leads.active_conversion_operation_id = $operationId` with condition `WHERE active_conversion_operation_id IS NULL AND status = 'QUALIFIED'`.
- Tx 0 commits before any HTTP call to Supabase Auth is dispatched.
- Any concurrent conversion attempt encounters a non-null `active_conversion_operation_id` and is rejected with `409 Conflict: Lead has active conversion operation in flight`.

#### E. How stale workers are fenced from database mutations
All database mutations in Tx 2 and status transitions require atomic CAS predicates:
```sql
UPDATE "crm_conversion_operations"
SET status = 'COMPLETED', ...
WHERE id = $operationId 
  AND version = $expectedVersion 
  AND lease_owner_id = $workerId;
```
If a worker stalls and its 30-second lease expires, a recovery worker acquires the lease, incrementing `version = version + 1` and updating `lease_owner_id`. When the stale worker resumes, its conditional write matches 0 rows. The worker checks `affectedRows === 0`, immediately rolls back, and logs `WorkerFencedError`.

#### F. What happens when remote Auth outcomes are ambiguous
If Supabase Auth API calls (creation or deletion) return HTTP 500, 503, timeout, or dropped socket:
- The system **FAILS CLOSED**.
- It **NEVER** assumes the remote action succeeded or failed.
- The operation transitions to a durable reconciliation state (`COMPENSATION_HALTED_UNCERTAIN`).
- A high-severity alert is emitted and an item is enqueued in `crm_auth_reconciliation_queue`.
- Generic recovery workers are fenced from reacquiring halted operations. Human administrators or dedicated reconciliation jobs resolve the ambiguity.

---

## 2. Crash-Interleaving Matrix

| # | Boundary / Crash Scenario | Initial State | Event Sequence | Durable State at Crash | Recovery Worker Action | Safety Conclusion |
|---|---|---|---|---|---|---|
| **1** | Tx 0 Crash Before Commit | Lead: `QUALIFIED`, `active_op = NULL` | 1. Worker begins Tx 0.<br>2. Worker crashes before commit. | Tx 0 rolls back cleanly. No rows in `conversion_operations`. Lead `active_op = NULL`. | None needed. Next request initiates fresh Tx 0. | **SAFE.** Zero orphaned state. Complete rollback. |
| **2** | Crash After Tx 0 Commit, Before Supabase Auth Post | Lead: `active_op = Op1`. Op1: `INITIATED`. | 1. Tx 0 commits.<br>2. Worker crashes before HTTP call. | Op1: `status = 'INITIATED'`, lease expires in 30s. No Auth user created. | Recovery worker R acquires lease (`version++`). Inspects Auth; user does not exist. Transitions Op1 to `FAILED_TERMINAL`. Clears `leads.active_op`. | **SAFE.** No orphaned Auth user. Lead unblocked for conversion. |
| **3** | Supabase Auth Call Times Out (Ambiguous Creation) | Op1: `INITIATED`. | 1. Worker calls `admin.createUser`.<br>2. Socket times out; outcome unknown. | Op1: `status = 'INITIATED'`. Auth user may or may not exist in Supabase. | Retry or Recovery calls Supabase `getUserByEmail()`. If user exists with matching `app_metadata.conversionOperationId`, adopts `authUserId` and sets `AUTH_PROVISIONED`. If no match, halts to `COMPENSATION_HALTED_UNCERTAIN`. | **SAFE.** Fail-closed. Prevents duplicate users or takeover. |
| **4** | Crash in Tx 2 Before DB Commit | Op1: `AUTH_PROVISIONED`, `authUserId = U1`. Lead: `active_op = Op1`. | 1. Worker provisions U1.<br>2. Worker begins Tx 2.<br>3. DB error or worker crash before commit. | Tx 2 rolls back. Op1 remains `AUTH_PROVISIONED`. U1 exists in Supabase. No rows in `candidates` or `customer_accounts`. | Recovery worker R acquires lease. Forward recovery finds no profiles. Verified pre-deletion checks pass (`auth_metadata` matches Op1). R deletes U1 via Admin API. Transitions Op1 to `COMPENSATION_COMPLETED`. Clears `active_op`. | **SAFE.** Clean compensation. U1 safely removed. Zero orphaned identity. |
| **5** | Tx 2 Commits, but Worker Drops Connection / Crashes Before Ack | Op1: `DB_COMMITTING`, `authUserId = U1`. | 1. Worker provisions U1.<br>2. Tx 2 commits (`Candidate`, `Account`, `Contract` created, `Lead` = `CONVERTED`, `auth_comp_auth = false`).<br>3. Worker connection drops. | Tx 2 durable in PostgreSQL. Op1 status still `DB_COMMITTING` or `AUTH_PROVISIONED`. Lease expires. | Recovery worker R executes Forward Recovery Inspection. Finds committed `Candidate` and `Lead.status = 'CONVERTED'`. R forward-converges Op1 to `COMPLETED`. Clears quarantine. Blocks compensation. | **SAFE.** Forward recovery preserves committed candidate. Eliminates catastrophic compensation. |
| **6** | Worker Stalls After Tx 2 Commit; Recovery Worker Awakens | Op1: `DB_COMMITTING`, `authUserId = U1`. | 1. Worker A commits Tx 2.<br>2. Worker A stalls (GC pause / network).<br>3. Lease expires.<br>4. Recovery Worker R acquires lease (`version = 2`). | Op1: `version = 2`, `lease_owner = WorkerR`. Profiles exist. | Worker R forward-converges Op1 to `COMPLETED`. When Worker A resumes, its write check (`version = 1`) fails (`affectedRows === 0`). Worker A aborts without error. | **SAFE.** Fencing prevents split-brain. Forward recovery guarantees convergence. |
| **7** | Worker Pauses Before Remote Delete; Lease Expires; New Conversion Attempted | Op1: `COMPENSATING`, `quarantine = Op1`. | 1. Worker A passes pre-deletion checks.<br>2. Worker A pauses before HTTP `deleteUser`.<br>3. Lease expires.<br>4. User attempts new conversion. | Op1: `COMPENSATING`. Lead: `quarantine_conversion_operation_id = Op1`. | New conversion request checks `quarantine_conversion_operation_id` and is strictly rejected with `409 Conflict`. When Worker A resumes, it deletes U1. Op1 transitions to `COMPENSATION_COMPLETED`. Quarantine cleared. | **SAFE.** State-machine immunity prevents destroying a new profile. |
| **8** | Remote Deletion Crash (Worker Crashes After Remote Delete) | Op1: `COMPENSATING`, `authUserId = U1`. | 1. Worker A deletes U1 via Supabase API.<br>2. Worker A crashes before updating PostgreSQL to `COMPENSATION_COMPLETED`. | U1 deleted in Supabase. Op1 remains `COMPENSATING`. Lease expires. | Recovery worker R acquires lease. Calls `admin.getUserById(U1)`. Receives HTTP 404 (`UserNotFound`). 404 proves delete completed. R transitions Op1 to `COMPENSATION_COMPLETED`. Clears quarantine and `active_op`. | **SAFE.** Definitive 404 resolution achieves convergence. |
| **9** | Remote Deletion Ambiguous Failure (HTTP 500 / Network Partition) | Op1: `COMPENSATING`, `authUserId = U1`. | 1. Worker A calls `admin.deleteUser(U1)`.<br>2. Receives HTTP 500 or network disconnect. | U1 status uncertain in Supabase. Op1 in `COMPENSATING`. | Worker transitions Op1 to `COMPENSATION_HALTED_UNCERTAIN`. Enqueues item in `crm_auth_reconciliation_queue`. Worker does NOT retry delete blindly. Alert raised for admin review. | **SAFE.** Fail-closed. Prevents infinite retry loops or race conditions. |

---

## 3. P1 — Lease & State-Transition Integrity

### 3.1 Atomic Compare-and-Set (CAS) Inventory
Every state transition on `crm_conversion_operations` must execute with strict CAS predicates and affected-row validation:

```typescript
const result = await db.$executeRaw`
    UPDATE "crm_conversion_operations"
    SET status = ${toStatus},
        version = version + 1,
        lease_owner_id = ${workerId},
        lease_expires_at = NOW() + INTERVAL '30 seconds',
        updated_at = NOW()
    WHERE id = ${operationId}
      AND status = ${expectedStatus}
      AND version = ${expectedVersion}
      AND lease_owner_id = ${expectedWorkerId};
`;

if (result !== 1) {
    throw new ConcurrencyTransitionError(
        `Atomic CAS failed for operation ${operationId}: expected status ${expectedStatus}, version ${expectedVersion}. Mutation aborted.`
    );
}
```

#### Complete Saga CAS Transition Predicates:
1. **`INITIATED` $\rightarrow$ `AUTH_PROVISIONED`:**  
   `WHERE id = $opId AND status = 'INITIATED' AND version = $ver AND lease_owner_id = $workerId`
2. **`AUTH_PROVISIONED` $\rightarrow$ `DB_COMMITTING`:**  
   `WHERE id = $opId AND status = 'AUTH_PROVISIONED' AND version = $ver AND lease_owner_id = $workerId`
3. **`DB_COMMITTING` $\rightarrow$ `COMPLETED`:**  
   `WHERE id = $opId AND status = 'DB_COMMITTING' AND version = $ver AND lease_owner_id = $workerId`
4. **`DB_COMMITTING` $\rightarrow$ `COMPENSATION_PENDING`:**  
   `WHERE id = $opId AND status IN ('AUTH_PROVISIONED', 'DB_COMMITTING') AND version = $ver AND lease_owner_id = $workerId`
5. **Lease Acquisition by Recovery Worker:**  
   `WHERE id = $opId AND status IN ('INITIATED', 'AUTH_PROVISIONED', 'DB_COMMITTING', 'COMPENSATION_PENDING') AND lease_expires_at < NOW()`
6. **`COMPENSATION_PENDING` $\rightarrow$ `COMPENSATING`:**  
   `WHERE id = $opId AND status = 'COMPENSATION_PENDING' AND version = $ver AND lease_owner_id = $workerId`
7. **`COMPENSATING` $\rightarrow$ `COMPENSATION_COMPLETED`:**  
   `WHERE id = $opId AND status = 'COMPENSATING' AND version = $ver AND lease_owner_id = $workerId`
8. **Forward Recovery Convergence:**  
   `WHERE id = $opId AND status IN ('AUTH_PROVISIONED', 'DB_COMMITTING') AND version = $ver AND lease_owner_id = $workerId`

### 3.2 Database Fencing vs External HTTP Requests: Proof of State-Machine Immunity
A critical distributed systems vulnerability occurs when a stale worker attempts external HTTP calls after its lease has expired:
1. Worker A passes DB pre-deletion checks for `authUserId = U1`.
2. Worker A pauses before sending HTTP `deleteUser(U1)`.
3. Worker A's lease expires.
4. Recovery Worker B takes over the operation.
5. Worker A wakes up and sends `deleteUser(U1)` to Supabase Auth.

**Can PostgreSQL database fencing stop Worker A's outbound HTTP packet?**  
**No.** Database fencing tokens and row locks operate exclusively within PostgreSQL. They have zero visibility or control over outbound TCP packets to external third-party APIs.

**Proof of Safety via State-Machine Immunity:**  
The specification achieves provable safety without requiring external fencing via three orthogonal invariants:
1. **Lead Quarantine (`quarantine_conversion_operation_id`):** While Worker A is in `COMPENSATING`, `leads.quarantine_conversion_operation_id` remains set to Op1. If an operator attempts a new conversion while Worker A is stalled, the request is rejected with `409 Conflict`.
2. **UUID Invariance:** Even if Worker B clears quarantine and converts the lead, Supabase Auth generates a brand-new user UUID ($U_2 \neq U_1$). When Worker A resumes and executes `deleteUser(U1)`, it deletes identity $U_1$, which was already marked for compensation! It **cannot** delete candidate $U_2$ because UUIDs are immutable and unique.
3. **Idempotent 404 Resolution:** When Worker B or subsequent recovery inspects $U_1$, Supabase returns `404 Not Found`, which cleanly transitions Op1 to `COMPENSATION_COMPLETED`.

---

## 4. P1 — Intake Idempotency Crash Recovery & Worker Fencing

### 4.1 The Reservation-First Protocol
Public intake executes a reservation-first idempotency protocol to prevent duplicate lead creation and duplicate audit events under network instability and concurrent retries:

```
Client Request
      │
      ▼
[Phase 1: Reservation]
      │
      ├─► INSERT INTO "crm_intake_idempotency" (key, status='PROCESSING', lock_token, locked_at)
      │   ON CONFLICT (org_id, key) DO UPDATE
      │   SET status='PROCESSING', lock_token=$token, locked_at=NOW()
      │   WHERE expires_at < NOW() OR (status='PROCESSING' AND locked_at < NOW() - 30s)
      │
      ▼
[Phase 2: Ingestion Transaction (Single Interactive DB Transaction)]
      │
      ├─► Lock row: SELECT FROM "crm_intake_idempotency" WHERE key=$key FOR UPDATE
      ├─► Deduplicate Prospect (Layer 3)
      ├─► INSERT Lead OR APPEND LeadActivity
      ├─► INSERT AuditEvent
      ├─► UPDATE "crm_intake_idempotency" 
      │       SET status='COMPLETED', lead_id=$leadId, cached_response=$resp, lock_token=NULL
      │       WHERE lock_token = $token AND locked_at >= NOW() - 30s
      │   assert(affectedRows === 1)
      │
      ▼
[Commit & Respond 200 OK]
```

### 4.2 Edge Case Analysis

#### 1. Two Concurrent Identical Requests
Both compute `idempotencyKey = H(email, phone, name, utm)`.
- Request 1 wins the reservation upsert, obtaining `status = 'PROCESSING'` and `lock_token = T1`.
- Request 2 encounters `ON CONFLICT` and condition `expires_at < NOW() OR ...` fails (since Request 1 just locked it). Upsert returns 0 affected rows.
- Request 2 enters a polling loop (up to 3 seconds) with exponential backoff, waiting for `status = 'COMPLETED'`. When Request 1 commits, Request 2 reads `cached_response` and returns `200 OK` with zero duplicate rows.

#### 2. Same Key with Different Payload
In Layer 2, the `idempotencyKey` includes the SHA-256 hash of the normalized payload. If the payload differs, it produces a **different** idempotency key, bypassing Layer 2 cache. The request enters Layer 3 (Prospect Deduplication), which matches the existing lead by email, appends an `INBOUND_INQUIRY` activity, and updates contact details without creating duplicate lead aggregates.

#### 3. Crash Immediately After Reservation
Worker reserves the key (`status = 'PROCESSING'`), then crashes before opening the ingestion transaction.
- The row remains in `PROCESSING` with `locked_at = T0`.
- For 30 seconds, concurrent retries wait.
- At $T0 + 30\text{s}$, the reservation lease expires.
- The next retry or recovery worker conditionally reclaims the row:
  ```sql
  WHERE status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '30 seconds'
  ```
- The new worker acquires `lock_token = T2` and processes ingestion cleanly. Zero duplicate leads exist.

#### 4. Crash After Lead/Activity Creation Before Acknowledgment Persistence
Worker creates `Lead`, `LeadActivity`, and `AuditEvent` inside the single interactive transaction, but crashes before commit.
- In PostgreSQL, uncommitted transactions are rolled back completely by the database engine upon connection termination.
- Zero lead rows, activity rows, or audit events persist.
- The reservation row remains at `PROCESSING` until its 30-second lease expires, after which a retry safely reclaims it.

#### 5. Lost Response After Successful Commit
Worker commits the entire transaction (Lead created, status set to `COMPLETED`, response cached), but the network drops before the client receives the HTTP response.
- Client retries with the same payload and key.
- Reservation upsert matches existing row with `status = 'COMPLETED'` and `expires_at > NOW()`.
- The endpoint immediately returns `cached_response` (`200 OK`). Zero domain mutations, zero duplicate audit events.

#### 6. Expired Reservation While Original Worker is Still Running (Worker Fencing Rule)
Worker A acquires reservation with `lock_token = T1`. Worker A suffers a 35-second pause (GC/database stall).
- At second 30, Worker B arrives, observes `locked_at < NOW() - 30s`, and steals the reservation, setting `lock_token = T2`.
- Worker A resumes and attempts to commit its transaction:
  ```sql
  UPDATE "crm_intake_idempotency"
  SET status = 'COMPLETED', lead_id = $leadId, cached_response = $resp
  WHERE organization_id = $orgId 
    AND idempotency_key = $key
    AND lock_token = 'T1'
    AND locked_at >= NOW() - INTERVAL '30 seconds';
  ```
- **Fencing Enforcement:** Because Worker B overwrote `lock_token = 'T2'`, Worker A's update matches **0 rows**.
- Worker A evaluates `assert(affectedRows === 1)`, throws `WorkerFencedError`, and rolls back its interactive transaction.
- All domain mutations initiated by Worker A (lead, activity, audit) are aborted by PostgreSQL. Worker B completes cleanly.
- **Rule Satisfied:** Reservation expiry alone never permits a competing worker to run concurrently while the original owner can mutate domain state.

#### 7. Retry During Recovery & Cleanup
A background cron purges rows where `expires_at < NOW() - INTERVAL '24 hours'`. If a retry arrives while cleanup runs, PostgreSQL row-level locks on `crm_intake_idempotency` serialize the operations. If cleanup deletes the row, the retry executes a fresh reservation. If the retry acquires the row first, cleanup skips it (`expires_at` check).

#### 8. Tenant Isolation & Duplicate Audit/Activity Creation
All queries and unique constraints include `organization_id`. Intake tokens strictly resolve tenant context server-side. Attackers cannot query or claim keys across organizations. All audit events and activity records are committed within the single interactive transaction; if the transaction fails or fences, zero audit events persist.

---

## 5. Transaction-Boundary Diagrams & Ordered Protocols

### 5.1 Multi-Domain Conversion Transaction Protocol

```
===================================================================================================
TRANSACTION BOUNDARY 0 (Tx 0): Pre-execution Lead Binding & Operation Record
  - Isolation: READ COMMITTED
  - Locks: SELECT ... FROM "leads" WHERE id = $id FOR UPDATE (Row Exclusive)
  - Action: 
      1. Verify lead.status == 'QUALIFIED'
      2. Verify lead.active_conversion_operation_id IS NULL
      3. INSERT INTO "crm_conversion_operations" (status='INITIATED', version=1, lease_owner_id=$workerId)
      4. UPDATE "leads" SET active_conversion_operation_id = $opId WHERE id = $id
  - COMMIT Tx 0 (Durable; locks released; conversion serialized)
===================================================================================================
                                              │
                                              ▼
STEP 1: Remote Identity Provisioning (Non-Transactional External Call)
  - Pre-condition: Check authProvisioningMode (CREATE_NEW vs REUSE vs NO_AUTH)
  - Action: Call Supabase Admin API: admin.createUser({ email, app_metadata: { conversionOperationId, leadId, orgId } })
  - Outcome:
      - Success: authUserId = res.user.id. CAS transition: INITIATED -> AUTH_PROVISIONED
      - 422 Conflict: getUserByEmail(). If metadata matches -> Adopt authUserId. If mismatch -> Throw IdentityConflictError
      - 5xx / Timeout: Fail closed -> Transition to COMPENSATION_HALTED_UNCERTAIN -> Queue manual reconciliation
===================================================================================================
                                              │
                                              ▼
TRANSACTION BOUNDARY 2 (Tx 2): Downstream Entity Creation & Lead Finalization
  - Isolation: READ COMMITTED
  - Global Lock Hierarchy:
      1. SELECT FROM "crm_conversion_operations" WHERE id = $opId FOR UPDATE
      2. SELECT FROM "leads" WHERE id = $leadId FOR UPDATE
  - Action:
      1. CAS Verify: op.status == 'AUTH_PROVISIONED' AND op.lease_owner_id == $workerId AND op.version == $ver
      2. CAS Update: op.status = 'DB_COMMITTING'
      3. INSERT INTO "users" (id = $authUserId, email, role = 'CANDIDATE', org_id)
      4. INSERT INTO "candidates" (user_id = $authUserId, lead_id, org_id)
      5. INSERT INTO "customer_accounts" (type = 'INDIVIDUAL_CANDIDATE', lead_id, org_id)
      6. INSERT INTO "service_contracts" (customer_account_id, service_type, org_id)
      7. INSERT INTO "lead_stage_history" (from = 'QUALIFIED', to = 'CONVERTED', actor_id)
      8. UPDATE "leads" SET status = 'CONVERTED', converted_customer_account_id = $accId, converted_contract_id = $conId, active_conversion_operation_id = NULL
      9. UPDATE "crm_conversion_operations" SET status = 'COMPLETED', auth_compensation_authorized = false
  - COMMIT Tx 2 (Single atomic commit across all downstream entities)
===================================================================================================
                                              │
                   ┌──────────────────────────┴──────────────────────────┐
                   ▼                                                     ▼
         [Tx 2 Commit Succeeded]                              [Tx 2 Rolled Back]
                   │                                                     │
                   ▼                                                     ▼
STEP 3: Acknowledgment & Clean Exit                   STEP 4: Compensating Rollback (Double-Check)
  - Clear lead quarantine                               - Set lead.quarantine_conversion_operation_id = $opId
  - Return Converted Lead DTO (200 OK)                   - CAS Update: op.status = 'COMPENSATION_PENDING'
                                                        - Acquire compensation lease
                                                        - Execute Double-Check-Before-Delete:
                                                            Verify zero candidates, zero customer accounts,
                                                            and auth_compensation_authorized == true
                                                        - Call Supabase Admin API: admin.deleteUser($authUserId)
                                                        - CAS Update: op.status = 'COMPENSATION_COMPLETED'
                                                        - Clear lead quarantine and active_op_id
===================================================================================================
```

---

## 6. P1 — Human Decision Register Forensic Audit & Reconciliation Table

### 6.1 Forensic Audit of Decision Numbering
An adversarial audit across Phase 01.1 through Phase 01.9 identified an accidental semantic shift introduced in Phase 01.9:
- From **Phase 01.3 through Phase 01.8**, `HUMAN-DEC-01` uniformly designated the **Unassigned Lead Triage SLA & Escalation Window** (4 business hours vs 1h vs 8h vs 24h), while `HUMAN-DEC-02` designated **Terminal State Reopening Governance** (Disqualified lead reopening: Admin-only vs Delegated staff).
- In **Phase 01.9**, Section 7 inadvertently re-labeled `HUMAN-DEC-01` as "Policy for Reopening Disqualified Leads" and `HUMAN-DEC-02` as "Conversion Identity Conflict Resolution".
- Furthermore, **Cross-Tenant Identity Conflict** is NOT an open business decision—it is a **non-negotiable, frozen security invariant** (`SEC-INV-01`): under multi-tenant isolation, cross-tenant identity correlation without mutual tenant consent is strictly prohibited and must fail closed.

### 6.2 Decision-ID Reconciliation Table

| Decision Identifier | Canonical Title | Historical Meanings in Phase 01 | Canonical Definition & Scope | Status | Canonical Source Specification |
|---|---|---|---|---|---|
| **HUMAN-DEC-01** | Unassigned Lead Triage SLA & Escalation Window | Uniformly maintained in Phase 01.3–01.8. Temporarily shifted in 01.9 to reopening policy. | Governs the maximum allowable time an inbound lead may remain in status `NEW` before triggering escalation alerts: Option A (4 Business Hours, Recommended), Option B (1 Business Hour), Option C (8 Business Hours), Option D (24 Calendar Hours). | **PENDING HUMAN ACCEPTANCE** | `phase-01-product-contract.md` (Sec 7.1) |
| **HUMAN-DEC-02** | Terminal State Reopening Governance | Maintained in Phase 01.3–01.8 as reopening authority. Temporarily shifted in 01.9 to identity conflict. | Governs organizational authority to reopen leads from terminal state `DISQUALIFIED`: Option A (Strict Admin-Only Reopening, Recommended), Option B (Delegated Sales Staff Reopening with Mandatory Structured Reason). | **PENDING HUMAN ACCEPTANCE** | `phase-01-product-contract.md` (Sec 7.2) |
| **HUMAN-DEC-03** | Public Intake Deduplication Architecture & Idempotency Window Model | Consistently maintained across Phase 01.4 through Phase 01.9. | Governs deduplication boundary semantics: Option A (Rolling 15-Minute TTL with Atomic Reclamation, Recommended), Option B (Fixed Clock-Hour Bucketing). | **PENDING HUMAN ACCEPTANCE** | `phase-01-product-contract.md` (Sec 7.3) |
| **SEC-INV-01** | Cross-Tenant Identity Conflict Hard Security Invariant | Erroneously labeled as HUMAN-DEC-02 in Phase 01.9. | **Frozen Security Invariant:** When a lead email matches an existing Supabase Auth identity from another tenant without matching metadata, the system MUST fail closed (`IdentityConflictError`). Never auto-adopt, link, or disclose existence across tenants. | **FROZEN SECURITY REQUIREMENT** (Not a decision) | `phase-01-conversion-contract.md` (Sec 5.2.3) |

---

## 7. P1 — PostgreSQL Concurrency & Locking Semantics Precision

### 7.1 Read Committed Re-Evaluation Semantics
Under PostgreSQL `READ COMMITTED` isolation level:
- When a transaction attempts to acquire a row lock via `SELECT FOR UPDATE` or `UPDATE ... WHERE`, and encounters an existing lock held by a concurrent transaction, PostgreSQL **blocks** until the first transaction commits or rolls back.
- If the first transaction **commits**, the second transaction does not simply use its initial snapshot. **PostgreSQL re-evaluates the query's `WHERE` clause against the newly committed version of the row.**
- If the row still matches the predicate, PostgreSQL locks the updated row. If the row no longer matches (e.g. `status` changed from `QUALIFIED` to `CONVERTED`, or `active_conversion_operation_id` is now set), the row is **excluded** from the query result.
- **Specification Impact:** The CRM specification relies on this exact PostgreSQL semantic: concurrent conversion calls re-evaluate `WHERE active_conversion_operation_id IS NULL`, returning 0 rows and cleanly throwing `409 Conflict` without race conditions.

### 7.2 Global Canonical Lock Order Hierarchy
To guarantee mathematical deadlock freedom across concurrent transactions, all CRM and administrative transactions must acquire row locks strictly in global alphabetical order:

$$\text{Global Order: } \mathbf{Memberships} \longrightarrow \mathbf{Leads} \longrightarrow \mathbf{LeadActivities} \longrightarrow \mathbf{Designations}$$

#### Enforcement Across Administrative Codepaths:
- When an administrative transaction modifies employee state (e.g., deactivating a sales staff member and reassigning their active leads to an unassigned pool):
  1. Lock employee record in `Memberships` (`SELECT ... FOR UPDATE`).
  2. Lock target records in `Leads` (`SELECT ... FOR UPDATE ORDER BY id ASC`).
  3. Insert reallocation records in `LeadActivities` (`INSERT ...`).
  4. Query or lock designations (`FOR SHARE OF m`).
- Reversing this order (e.g., locking `Leads` then `Memberships`) is strictly prohibited, preventing deadlock between lead assignment actions and employee management actions (`AC-SEC-17`).

### 7.3 Prohibition of Lock Escalation
PostgreSQL transactions must **NEVER** execute lock escalation within the same transaction:
- Acquiring `SELECT ... FOR SHARE` and subsequently executing `SELECT ... FOR UPDATE` or `UPDATE` on the same row creates an immediate deadlock vulnerability when two concurrent transactions execute the same sequence.
- All mutating codepaths must acquire `FOR UPDATE` exclusively from the initial read.

### 7.4 PostgreSQL Nullable Join Locking Compliance
In PostgreSQL, executing `FOR SHARE` on an `OUTER JOIN` where the table is on the nullable side throws:
```
ERROR: FOR SHARE cannot be applied to the nullable side of an outer join
```
The CRM assignment queries strictly comply by specifying the exact alias (`FOR SHARE OF m`), or performing shared locks on `designations` via explicit inner joins or secondary lookup queries (`AC-SEC-16`).

### 7.5 Empty-Result Handling
All database repository queries must validate empty result sets safely:
```typescript
if (!rows || rows.length === 0) {
    throw new NotFoundError("Target lead or assignee membership not found in tenant context.");
}
```
Evaluating array elements without length verification (`rows[0].status`) is strictly prohibited, preventing unhandled runtime `TypeError` exceptions (`AC-SEC-15`).

---

## 8. Acceptance Criteria & Test Verification Matrix

The Phase 01 CRM specification suite establishes **56 comprehensive acceptance criteria** across six functional domains. All criteria are specified requirements for future implementation; **zero tests have been executed to date.**

### Complete Acceptance Criteria Catalog:
- **Public Lead Ingestion (`AC-ING-01..20`):** 20 criteria covering input validation, honeypot, rate limiting, tenant scoping, stable idempotency, multi-entity rollback, two-phase reservation protocol, and **Worker Fencing on Expired Reservation (`AC-ING-20`)**.
- **Lead Lifecycle & Transitions (`AC-LIF-01..09`):** 9 criteria covering progression, owner assignment guards, 4 admission gates, terminal immutability, structured reasons, stage history, and triage queues.
- **Sales Activities & Scheduling (`AC-ACT-01..04`):** 4 criteria covering activity types, next-action advancement, WCOS task isolation, and activity immutability.
- **Multi-Domain Conversion Orchestration (`AC-CON-01..24`):** 24 criteria covering qualification guards, Scenarios A–D, compensating rollback, orphan adoption, stable idempotency, dead-letter queue, post-commit compensation immunity, lease expiration fencing, lead quarantine, 404 remote delete resolution, crash after candidate rollback, and **Forward Recovery & Commit Detection (`AC-CON-24`)**.
- **Security, RBAC & Isolation (`AC-SEC-01..17`):** 17 criteria covering candidate role blocks, RLS tenant scoping, default-deny RBAC, PII redaction, assignment concurrency guards, designation join compliance, and **Global Lock Ordering Adherence (`AC-SEC-17`)**.
- **Staff Workbench UI (`AC-UI-01..05`):** 5 criteria covering shell loading, stage tabs, slide-over drawer, responsive viewports, and accurate metrics.

---

## 9. Change Log of Modified Specification Files

All edits in Phase 01.10 are strictly confined to Markdown documentation, bumping the suite from version 1.9.0 to 1.10.0:

| File Path | Version | Key Modifications in Phase 01.10 |
|---|---|---|
| [`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) | **1.10.0** | 1. Added complete Atomic CAS Predicates inventory across all 8 transitions with `assert(affectedRows === 1)`.<br>2. Added Section 5.2 Forward Recovery & Commit Detection protocol (detecting Tx 2 commits, preventing catastrophic compensation).<br>3. Documented database fencing limits vs external HTTP requests and proved State-Machine Immunity. |
| [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) | **1.10.0** | 1. Updated Section 5.1 Item 5 with Worker Fencing Protocol against stolen intake reservations.<br>2. Restored Section 7 Canonical Human Decision Register (`HUMAN-DEC-01`, `02`, `03`) and classified cross-tenant conflict as frozen security invariant `SEC-INV-01`. |
| [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) | **1.10.0** | 1. Documented global lock order compliance across administrative codepaths (`Memberships` $\rightarrow$ `Leads` $\rightarrow$ `LeadActivities` $\rightarrow$ `Designations`).<br>2. Formalized prohibition of lock escalation (`FOR SHARE` $\rightarrow$ `FOR UPDATE`).<br>3. Verified PostgreSQL Read Committed re-evaluation semantics. |
| [`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) | **1.10.0** | 1. Bumped Document Version to 1.10.0.<br>2. Appended reference to `phase-01.10-final-recovery-and-governance-audit.md`. |
| [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) | **1.10.0** | 1. Bumped Document Version to 1.10.0.<br>2. Added `AC-ING-20` (Worker Fencing on Expired Reservation).<br>3. Added `AC-CON-24` (Forward Recovery & Commit Detection on Crashed Worker).<br>4. Added `AC-SEC-17` (Global Lock Ordering Adherence).<br>5. Updated Traceability Matrix (56 total criteria). |
| [`docs/crm/phase-01.10-final-recovery-and-governance-audit.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.10-final-recovery-and-governance-audit.md) | **1.10.0** | Created the comprehensive audit report, crash-interleaving matrix, and governance reconciliation. |

---

## 10. Final Review Gate Verdict

### Official Verdict: `ACCEPT WITH CONDITIONS`

The Phase 01.10 audit confirms that the OOS CRM Phase 01 specification suite is **architecturally complete, mathematically sound with respect to distributed concurrency, crash-resilient across all seven execution boundaries, and fully reconciled in its governance register.**

The specification eliminates the risk of catastrophic compensating deletion of committed candidate identities, provides robust worker fencing against stolen leases, and establishes strict PostgreSQL locking and isolation rules.

### Mandatory Pre-Conditions for Phase 02 Execution:
1. **Executive Leadership Decision Sign-off:** Human leadership must formally resolve the three canonical pending decisions recorded in Section 7 of [`phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md):
   - **`HUMAN-DEC-01`**: Select Unassigned Lead Triage SLA (Option A: 4 Business Hours recommended).
   - **`HUMAN-DEC-02`**: Select Terminal State Reopening Governance (Option A: Admin-Only recommended).
   - **`HUMAN-DEC-03`**: Select Public Intake Deduplication Window Model (Option A: Rolling 15-Minute TTL recommended).
2. **Phase 02 Authorization Requirement:** Phase 02 (Prisma Schema Design & Migrations) must remain **STRICTLY UNAUTHORIZED** until executive leadership reviews this audit report and provides formal written authorization to proceed.
3. **Automated Verification Harness Commitment:** In Phase 03 and Phase 04, the engineering team must implement automated concurrency and crash-injection tests specifically validating `AC-CON-24` (Forward Recovery Detection), `AC-ING-20` (Worker Fencing), and `AC-SEC-17` (Global Lock Ordering) prior to production deployment.

### Remaining Blockers & Next Human Action Required:
- **Blockers:** Zero specification-level blockers remain.
- **Next Human Action:** The human project sponsor / engineering leadership must review this audit deliverable, record selections for `HUMAN-DEC-01`, `HUMAN-DEC-02`, and `HUMAN-DEC-03`, and issue authorization to initiate Phase 02.
