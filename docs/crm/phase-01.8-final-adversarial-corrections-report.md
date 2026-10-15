# PHASE 01.8 — FINAL ADVERSARIAL SAFETY CORRECTIONS REPORT

> **Document Status:** RECONCILED ADVERSARIAL CORRECTIONS REPORT / PENDING HUMAN ACCEPTANCE  
> **Document Version:** 1.8.0  
> **Classification:** Enterprise Architecture, Concurrency Engineering & Security Review  
> **System:** Operations Operating System (OOS) — Lead & CRM Subsystem  
> **Date:** 2026-10-15  
> **Authority Predecessors:**  
> - [`docs/crm/phase-00-capability-audit.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-00-capability-audit.md) (Accepted)  
> - [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) (v1.8.0)  
> - [`docs/crm/phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) (v1.8.0)  
> - [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) (v1.8.0)  
> - [`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) (v1.8.0)  
> - [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) (v1.8.0)  
> - [`docs/crm/phase-01.7-adversarial-verification-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.7-adversarial-verification-report.md)  
> **Implementation Authorization:** NOT AUTHORIZED (Specification and Verification Architecture Only — Zero Code, Zero Migrations, Zero Schema Mutations)  

---

## 1. Executive Summary & Authorization Boundary

This report delivers the Phase 01.8 final adversarial safety corrections for the Lead & CRM domain within OOS. Acting as principal enterprise architect, PostgreSQL concurrency specialist, distributed-systems engineer, and application-security reviewer, this review resolves the remaining edge cases and specification ambiguities identified during the Phase 01.7 audit.

### Core Corrections Delivered:
1. **P0 Compensation Safety & Enforceable Lifecycle Invariants:** Established concrete distributed-interleaving proofs demonstrating that a stale worker cannot destroy an active candidate identity. Proved that safety requires not only UUID partitioning, but also enforceable database-level invariants: **Irrevocable Compensation Condemnation**, **Condemned Identity Blacklisting**, and **Indefinite Quarantine Retention on Ambiguity**.
2. **P1 Mutation-Time Caller Authority Revalidation & Deadlock-Free Lock Ordering:** Identified that checking destination membership alone is insufficient. Specified a deterministic lock acquisition order (Caller Membership `FOR SHARE` $\rightarrow$ Target Lead `FOR UPDATE` $\rightarrow$ Destination Membership `FOR SHARE`) to eliminate deadlocks and verify that the caller's own role, team, and active status have not been revoked concurrently. Corrected empty-result raw SQL query handling.
3. **P1 Rolling-TTL Idempotency Key Reclamation:** Solved the design gap where an expired key between 15 minutes and 24 hours blocked new submissions due to unique constraints. Specified an atomic conditional upsert (`INSERT ... ON CONFLICT DO UPDATE WHERE expires_at < NOW()`) that reclaims expired keys atomically without race conditions, proving that 24-hour cleanup is purely a storage maintenance task rather than a correctness prerequisite.
4. **P1 Cross-Document State-Machine Reconciliation:** Audited all 12 canonical states, eliminated all occurrences of the retired alias `DB_ROLLBACK_PENDING`, and created an exhaustive transition table detailing lease ownership, version fencing, quarantine behavior, remote side effects, retry eligibility, and administrative recovery policies.

> [!IMPORTANT]
> **Strict Authorization Boundary:**  
> This evaluation is purely documentation-only. Zero application code, zero server actions, zero Prisma models, zero migrations, zero RLS policies, zero environment variables, and zero production data mutations have been performed. All criteria remain **specified requirements for future implementation, not executed tests**. Phase 02 remains **STRICTLY UNAUTHORIZED**.

---

## 2. P0 — Compensation Safety and Identity Lifecycle

### 2.1 Enforceable Invariants vs. Descriptive Claims

To prevent identity corruption, the specification converts descriptive safety assumptions into four **enforceable database and saga requirements**:

1. **Enforceable Invariant 1: Irrevocable Compensation Condemnation**  
   Once an operation row in `crm_conversion_operations` transitions into `COMPENSATION_PENDING` or `COMPENSATING`, PostgreSQL state machine constraints and application logic strictly prevent any transition back to `DB_COMMITTING` or `COMPLETED`. The operation is permanently dead to conversion. Neither retries nor recovery workers can revive it.
2. **Enforceable Invariant 2: Condemned Identity Blacklisting**  
   The `authUserId` associated with an operation in compensation or halted uncertain is permanently blacklisted. Any subsequent conversion attempt for that lead or email that encounters an existing user in Supabase Auth verifies `app_metadata.conversionOperationId === currentOp.id`. Because the metadata points to the prior condemned operation, adoption is strictly rejected with `IdentityConflictError`.
3. **Enforceable Invariant 3: Indefinite Lead Quarantine on Ambiguity**  
   If an external call to Supabase Auth during compensation yields a timeout, network disconnect, rate limit (429), or 5xx error, the operation transitions to `COMPENSATION_HALTED_UNCERTAIN`. Crucially, `Lead.quarantineConversionOperationId` **remains populated**. The lead is permanently quarantined from all conversion attempts until an administrator holding `crm:admin:configure` explicitly inspects the provider and resolves the quarantine.
4. **Enforceable Invariant 4: UUID Partitioning & Target Invariant**  
   Supabase Auth generates RFC 4122 v4 UUIDs (`crypto.randomUUID()`). User ID $U_1$ (Op 1) and user ID $U_2$ (Op 2) are mathematically distinct ($U_1 \neq U_2$). The Admin API endpoint `DELETE /auth/v1/admin/users/{user_id}` operates strictly on user UUID. A delayed packet targeting $U_1$ cannot delete $U_2$.

### 2.2 Exhaustive Distributed-Interleaving Analysis

The following table explicitly analyzes ten complex distributed interleavings:

| Interleaving Scenario | Worker A Action | Lease & Version State | Worker B Action | Quarantine State | Remote Side Effect | Next Legal Transition & Verdict |
|---|---|---|---|---|---|---|
| **1. Stale Worker Resuming After Lease Expiry** | Paused during DB transaction. Resumes after 40s. | Worker A holds stale lease (`version = 1`). Lease expired at 30s. Worker B acquired lease (`version = 2`). | Worker B is processing rollback or recovery. | Quarantined (`quarantine_op_id = Op1`). | Worker A attempts `UPDATE crm_conversion_operations WHERE version = 1`. Updates 0 rows. | Worker A aborts with fencing failure. Zero remote side effects. **SAFE.** |
| **2. Remote `deleteUser(U1)` Paused BEFORE Dispatch** | Checked DB profiles (0 found). Paused immediately before dispatching HTTP request. | Lease expires. | Worker B acquires lease on Op 1 (`version = 2`). Checks Supabase Auth: $U_1$ exists. Worker B dispatches `deleteUser(U1)` $\rightarrow$ 200 OK. Marks `COMPENSATION_COMPLETED`. | Worker B clears quarantine: `quarantine_op_id = NULL`. | Worker C converts Lead as Op 2: creates **$U_2$** (new UUID). Commits Candidate linked to $U_2$. | Worker A resumes. Sends `deleteUser(U1)`. Supabase returns 404 (already deleted). **$U_2$ is untouched.** **SAFE.** |
| **3. Remote `deleteUser(U1)` Paused IN FLIGHT** | Dispatches `deleteUser(U1)`. Packet in transit. Worker A pauses waiting for response. | Lease expires. | Worker B acquires lease on Op 1. Calls `getUserById(U1)`. Worker A's packet arrived $\rightarrow$ Supabase returns 404. Worker B marks `COMPENSATION_COMPLETED`. | Worker B clears quarantine: `quarantine_op_id = NULL`. | Op 2 converts Lead with new user **$U_2$**. | Worker A wakes up. Receives 200 OK from prior delete. Tries to update DB; fails fencing (`version` mismatch). **$U_2$ is untouched.** **SAFE.** |
| **4. Worker Crash BEFORE Provider Processes Deletion** | Worker A crashes immediately before dispatching `deleteUser(U1)`. | Lease expires. | Recovery Worker B sweeps expired lease on Op 1 (`status = 'COMPENSATION_PENDING'`). | Quarantine retained on Lead. | Worker B re-runs pre-checks, calls `deleteUser(U1)` $\rightarrow$ 200 OK. | Op 1 transitions to `COMPENSATION_COMPLETED`. Quarantine cleared. Lead remains `QUALIFIED`. **SAFE.** |
| **5. Worker Crash AFTER Provider Processes Deletion** | Worker A dispatches `deleteUser(U1)`. Supabase deletes $U_1$. Worker A crashes before DB commit. | Op 1 sits in `COMPENSATING`. Lease expires. | Recovery Worker B acquires lease. Calls `admin.getUserById(U1)` $\rightarrow$ returns **404 Not Found**. | Quarantine retained during check. | Zero external mutations needed ($U_1$ is confirmed gone). | Op 1 transitions to `COMPENSATION_COMPLETED` via 404 Protocol. Quarantine cleared. **SAFE.** |
| **6. Recovery Worker Receives 5xx / Timeout / Rate Limit** | Worker A crashed or paused. | Lease expired. | Recovery Worker B calls `getUserById(U1)` or `deleteUser(U1)`. Supabase returns 503 / 504 / 429 / socket hangup. | **Quarantine RETAINED.** | Provider outcome ambiguous. User may or may not exist. | Worker B transitions Op 1 to **`COMPENSATION_HALTED_UNCERTAIN`**. Quarantined from generic workers. Lead conversion blocked. Enqueued in `crm_auth_reconciliation_queue`. **SAFE.** |
| **7. Quarantine Cleared While Earlier Worker Resumes** | Worker A paused before delete. | Worker B confirmed $U_1$ deleted (via 404 or successful delete) and cleared quarantine. | Op 2 creates $U_2$ and commits Candidate. | Quarantine is NULL. | Worker A wakes up. Issues `deleteUser(U1)`. | Supabase Auth receives `deleteUser(U1)` $\rightarrow$ returns 404 Not Found. **$U_2$ has distinct UUID and cannot be deleted.** **SAFE.** |
| **8. Retry Attempting to Revive Condemned Operation** | Op 1 failed DB commit and transitioned to `COMPENSATION_PENDING`. | Lease active or expired. | Client re-issues `convertLeadAction(leadId)` using same idempotency key. | Quarantined (`quarantine_op_id = Op1`). | None. | Orchestrator inspects Op 1 status $\rightarrow$ detects compensation state. Rejects conversion with `409 Conflict: Conversion operation is undergoing compensation`. Zero revival allowed. **SAFE.** |
| **9. Attempting to Adopt Condemned `authUserId`** | Op 1 in `COMPENSATION_HALTED_UNCERTAIN` ($U_1$ still in Supabase Auth). | Op 1 quarantined. | Op 2 attempts `createUser(email)` $\rightarrow$ receives 409 conflict ("already registered"). | Quarantined. | None. | Op 2 inspects `app_metadata.conversionOperationId`. Sees `Op1` (does not match `Op2`). Strictly rejects adoption with `IdentityConflictError`. Zero candidate linked. **SAFE.** |
| **10. Administrative Recovery of Uncertain Operation** | Op 1 in `COMPENSATION_HALTED_UNCERTAIN`. Lead quarantined. | Quarantined from generic workers. | Admin holding `crm:admin:configure` opens `/admin/crm/reconciliation`. Tool queries primary Supabase Auth. | Quarantine held until explicit admin action. | If user gone: admin clicks "Confirm Delete" $\rightarrow$ `COMPENSATION_COMPLETED` $\rightarrow$ quarantine cleared. If user exists: admin clicks "Force Delete & Release" $\rightarrow$ deletes $U_1$ $\rightarrow$ clears quarantine. | Lead returned to clean `QUALIFIED` state. Zero unverified identity reuse. **SAFE.** |

---

## 3. P1 — Revalidate Caller Authorization at Mutation Time

### 3.1 Vulnerability in Stale Authorization Context

In Phase 01.7, the mutation service locked the target lead and destination membership, but evaluated caller authority using cached context (`ctx.isTeamLead`, `ctx.team`, `ctx.role`) retrieved prior to entering the transaction.

#### Concurrency Breach Scenarios:
1. **Concurrent Manager Role Revocation:** An Admin revokes Manager M's privileges (`role = 'EMPLOYEE'`, `is_team_lead = false`). Concurrently, Manager M reassigns Lead L. If only cached context is used, Manager M executes an unauthorized reassignment.
2. **Concurrent Team Transfer:** Sales Rep B is transferred from Team 1 to Team 2. Concurrently, Team Lead 1 assigns Lead L to Sales Rep B. The destination membership check passes unless caller and destination teams are validated against live, locked records.
3. **Raw Query Empty-Result Bug:** If `tx.$queryRaw` returns an empty array `[]`, `!rows` evaluates to `false` in JavaScript. Accessing `rows[0].field` throws an unhandled `TypeError: Cannot read properties of undefined`.

### 3.2 Deterministic Lock Acquisition Order (Deadlock Freedom)

To eliminate deadlocks between concurrent assignment, reassignment, and administrative membership transactions, all locks must be acquired in a strict, deterministic global order:

```
[Lock Order 1] Caller Membership (FOR SHARE)
       │ Locks caller's user record; prevents concurrent role/team revocation.
       ▼
[Lock Order 2] Target Lead (FOR UPDATE)
       │ Exclusively locks lead; validates prior owner and tenant.
       ▼
[Lock Order 3] Destination Membership (FOR SHARE)
       │ Shared read lock; validates active status, destination team, and CRM eligibility.
```

*(If multiple rows within the same table are locked in batch operations, they must be acquired sorted by primary key UUID ascending: `ORDER BY id ASC`).*

### 3.3 Authoritative Mutation Protocol (Strategy A & Strategy B)

Both strategies are fully specified in [`docs/crm/phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md#L257-L380):

#### Strategy A: Transactional Row Locking (Authoritative for Prisma)
- Locks caller membership `FOR SHARE`: checks `!callerRows || callerRows.length === 0 || callerRows[0].status !== 'ACTIVE'`.
- Locks target lead `FOR UPDATE`: checks `!leadRows || leadRows.length === 0`, verifies `assigned_staff_id === expectedPreviousAssigneeId`.
- Locks destination membership `FOR SHARE`: checks `!destRows || destRows.length === 0 || destRows[0].status !== 'ACTIVE'`.
- Revalidates Team Lead scope: `destination.team === caller.team`.
- Revalidates Sales scope: can only claim unassigned lead for self or reassign lead caller currently owns.
- Updates lead with version increment and records immutable audit event.

#### Strategy B: Atomic Composite SQL Completeness Rule
A single SQL update is valid **only if it atomically incorporates both caller and destination subqueries**:
```sql
UPDATE "leads"
SET "assigned_staff_id" = $newAssigneeId,
    "version" = "version" + 1,
    "updated_at" = NOW()
WHERE "id" = $leadId
  AND "organization_id" = $ctxOrganizationId
  AND "assigned_staff_id" IS NOT DISTINCT FROM $expectedPreviousAssigneeId
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
If any invariant is violated between check and write, the mutation affects **0 rows**, rolls back, and returns `409 Conflict: Assignment invariants violated concurrently`.

---

## 4. P1 — Rolling-TTL Idempotency and Expiry/Reuse

### 4.1 Resolution of the TTL vs. Retention Gap

In Option A, the unique constraint `@@unique([organizationId, idempotencyKey])` combined with a 24-hour retention period presented a critical edge case: an identical inquiry submitted between 15 minutes and 24 hours would hit PostgreSQL error `23505 (unique_violation)` on insert because the expired row still exists.

#### The Atomic Key Reclamation Protocol:
Instead of a non-atomic read-then-write sequence, intake executes an **atomic conditional upsert**:

```sql
INSERT INTO "crm_intake_idempotency" (
  "id", "organization_id", "idempotency_key", "lead_id", "acknowledged_response", "created_at", "expires_at"
)
VALUES ($id, $orgId, $key, $leadId, $ackResponse, NOW(), NOW() + INTERVAL '15 minutes')
ON CONFLICT ("organization_id", "idempotency_key")
DO UPDATE SET
  "lead_id" = EXCLUDED."lead_id",
  "acknowledged_response" = EXCLUDED."acknowledged_response",
  "created_at" = EXCLUDED."created_at",
  "expires_at" = EXCLUDED."expires_at"
WHERE "crm_intake_idempotency"."expires_at" < NOW()
RETURNING "id", "lead_id", "acknowledged_response", "expires_at", (xmax = 0) AS is_fresh_insert;
```

#### Protocol Mechanics Across Lifecycles:
1. **Fresh Request:** No row exists $\rightarrow$ inserts row, returns `is_fresh_insert = true`. Layer 3 creates new `Lead`.
2. **Active Replay (< 15 min):** Row exists, but `expires_at >= NOW()`. The `WHERE expires_at < NOW()` condition is **FALSE**. Zero rows are updated or returned. The service catches this, reads the active `acknowledged_response`, and immediately returns HTTP 200 without creating leads or activities.
3. **Expired Submission (15 min – 24 hours):** Row exists and `expires_at < NOW()`. The `WHERE expires_at < NOW()` condition is **TRUE**. PostgreSQL acquires the row lock, atomically updates `expires_at = NOW() + 15m`, and returns the row. Layer 3 (Prospect Deduplication) detects whether an active lead exists (appending activity) or creates a fresh lead.
4. **Concurrent Reclaim Race:** Two concurrent requests arrive at the same millisecond after TTL expiry. PostgreSQL serializes them on the existing row's lock. Request 1 acquires the lock, sees `expires_at < NOW()`, updates `expires_at = NOW() + 15m`, and commits. Request 2 acquires the lock next, evaluates `WHERE expires_at < NOW()`. Because Request 1 updated the timestamp, the condition is now **FALSE**. Request 2 returns 0 rows, waits for commit, and reads Request 1's newly cached payload. Exactly one write occurs; zero duplicate leads, zero 23505 errors.
5. **Storage Maintenance Role:** The 24-hour cleanup job (`DELETE FROM crm_intake_idempotency WHERE expires_at < NOW() - INTERVAL '24 hours'`) is **strictly a background storage maintenance task**, NOT a correctness requirement. System guarantees remain 100% sound even during cleanup worker outages.

### 4.2 Preservation of `HUMAN-DEC-03`

The choice between Option A (Rolling TTL with Atomic Upsert) and Option B (Fixed Clock-Aligned Buckets) remains an explicit pending decision for human leadership:

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

## 5. P1 — Canonical State-Machine Consistency & Transition Invariants

### 5.1 Exhaustive 12-State Canonical Transition Table

The authoritative state machine for `CrmConversionOperation` is verified and published in [`docs/crm/phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md#L118-L148):

| Current State | Trigger / Event | Next State | Required Lease & Version? | Quarantine Behavior | Remote Side Effect | Retry Permitted? | Manual Action? | Invariants & Enforcement |
|---|---|---|---|---|---|---|---|---|
| `INITIALIZED` | Begin Auth Provisioning (Scenario A/C) | `AUTH_PROVISIONING` | Yes (`version`) | Lead not quarantined | `admin.createUser` dispatched | Yes | No | Mode is `CREATE_NEW_IDENTITY`. Passes `app_metadata`. |
| `INITIALIZED` | Skip Auth Provisioning (Scenario B/D) | `AUTH_PROVISIONED` | Yes (`version`) | Lead not quarantined | None (zero external calls) | Yes | No | Mode is `REUSE_EXISTING_IDENTITY` or `NO_AUTH_REQUIRED`. `authCompensationAuthorized = false`. |
| `INITIALIZED` | Validation / Pre-condition Failure | `FAILED_TERMINAL` | Yes (`version`) | Lead not quarantined | None | No | No | Terminal. Pre-condition failed before external calls. Zero downstream records. |
| `AUTH_PROVISIONING` | Auth API Returns 200 OK | `AUTH_PROVISIONED` | Yes (`version`) | Lead not quarantined | Remote Auth user created ($U_1$) | Yes | No | Sets `authUserId = user.id`, `authCreatedByThisOperation = true`, `authCompensationAuthorized = true`. |
| `AUTH_PROVISIONING` | Auth API Returns Timeout / 5xx | `AUTH_PENDING_VERIFICATION` | Yes (`version`) | Lead not quarantined | Remote state unknown | Yes (Verification only) | No | Uncertain outcome. Neither DB commit nor Auth deletion permitted. Awaits verification retry. |
| `AUTH_PENDING_VERIFICATION` | Retry Confirms Ownership via `app_metadata` | `AUTH_PROVISIONED` | Yes (`version`) | Lead not quarantined | None (verified existing) | Yes | No | Verified `app_metadata.conversionOperationId === op.id`. Adopts $U_1$, `authCompensationAuthorized = true`. |
| `AUTH_PENDING_VERIFICATION` | Retry Detects Foreign / Reused User | `FAILED_TERMINAL` | Yes (`version`) | Lead not quarantined | None | No | No | `app_metadata` mismatch. Foreign account conflict. Abort without deletion. Terminal. |
| `AUTH_PROVISIONED` | Begin Database Transaction | `DB_COMMITTING` | Yes (`version`) | Lead not quarantined | None | Yes | No | Enters interactive PostgreSQL transaction under `withRlsContext`. |
| `DB_COMMITTING` | PostgreSQL Transaction Commits | `COMPLETED` | Yes (`version`) | Lead not quarantined | User, Candidate, CustomerAccount, Contract committed | No | No | **Permanent Terminal Success:** Atomically sets `status = 'COMPLETED'`, `authCompensationAuthorized = false`. Permanent immunity. |
| `DB_COMMITTING` | PostgreSQL Transaction Rolls Back (Auth Created) | `COMPENSATION_PENDING` | Yes (`version`) | **Stamps Lead Quarantine:** `quarantine_op_id = op.id` | None | Yes (Compensation only) | No | DB failed. If `authCompensationAuthorized === true`, stamps lead quarantine, enters compensation. **Rule 1: Permanently condemned; cannot return to conversion.** |
| `DB_COMMITTING` | PostgreSQL Transaction Rolls Back (No Auth Created) | `FAILED_TERMINAL` | Yes (`version`) | Lead not quarantined | None | No | No | Mode was `REUSE_EXISTING_IDENTITY` or `NO_AUTH_REQUIRED`. Zero Auth deletion allowed. Terminal. |
| `COMPENSATION_PENDING` | Double-Check Passes; Begin Delete | `COMPENSATING` | Yes (`version`) | **Quarantine Retained** | Dispatches `deleteUser(U1)` | Yes (Compensation only) | No | Double-Check: Lock held, `authCompensationAuthorized = true`, 0 DB profiles, metadata matches. |
| `COMPENSATION_PENDING` | DB Pre-Check Detects Committed Profiles | `COMPENSATION_BLOCKED_PROFILE_EXISTS` | Yes (`version`) | **Quarantine Retained** | None (Deletion halted) | No (Generic workers blocked) | **Yes (Manual Audit)** | **Safety Gate:** Committed user/candidate found in DB. Halt delete; revoke authorization; retain quarantine. Terminal escalation. |
| `COMPENSATING` | Remote `deleteUser` Returns 200 OK | `COMPENSATION_COMPLETED` | Yes (`version`) | **Quarantine Cleared:** `quarantine_op_id = NULL` | Remote user $U_1$ deleted | No | No | **Terminal Compensation:** Remote identity purged. Lead quarantine cleared. Lead remains `QUALIFIED` for future conversion. |
| `COMPENSATING` | Worker Crashed After Remote Delete; Recovery Finds 404 | `COMPENSATION_COMPLETED` | Yes (`version`) | **Quarantine Cleared:** `quarantine_op_id = NULL` | Remote user confirmed gone (404) | No | No | **Authoritative 404 Protocol:** Recovery worker confirms $U_1$ is gone via 404; clears lead quarantine; terminates operation. |
| `COMPENSATING` / `COMPENSATION_PENDING` | Pre-Check or Delete Encounters Timeout / 5xx / 429 | `COMPENSATION_HALTED_UNCERTAIN` | Yes (`version`) | **Quarantine Retained Indefinitely** | Ambiguous provider outcome | No (Generic workers blocked) | **Yes (Admin Reconciliation)** | **Uncertainty Invariant:** Halt deletion to prevent deleting active user. Enqueue in reconciliation queue. Retain lead quarantine until explicit admin resolution. |

### 5.2 Elimination of Legacy Terminology
All references to `DB_ROLLBACK_PENDING` have been audited and replaced with `COMPENSATION_PENDING` across all documents. Generic recovery lease sweeps strictly query:
```sql
SELECT * FROM "crm_conversion_operations"
WHERE "status" = 'COMPENSATION_PENDING'
  AND "lease_expires_at" < NOW()
FOR UPDATE SKIP LOCKED;
```
Terminal escalation states (`COMPENSATION_HALTED_UNCERTAIN`, `COMPENSATION_BLOCKED_PROFILE_EXISTS`, `FAILED_TERMINAL`) are excluded from generic sweeps and require administrative intervention.

---

## 6. Updated Acceptance Criteria & Traceability Matrix

The following new acceptance criteria have been added to [`docs/crm/phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) (v1.8.0):

| ID | Category | Requirement / Expected Behavior | Verification Tier | Execution Status |
|---|---|---|---|---|
| **AC-ING-14** | Same-Key Retry After TTL Expiry Before Cleanup | Under Option A, if an identical inquiry is submitted between 15 minutes and 24 hours (when the existing idempotency row is expired but not yet purged), atomic conditional upsert (`INSERT ... ON CONFLICT DO UPDATE WHERE expires_at < NOW()`) reclaims the key cleanly without throwing `23505 (unique_violation)`. | Automated Concurrency Test | Specified (Pending Phase 04) |
| **AC-ING-15** | Concurrent Reclamation of Expired Key | Two concurrent requests competing to reclaim an expired idempotency row are serialized by PostgreSQL row-level locks on the existing row; exactly one reclaims and updates `expiresAt = NOW() + 15m`, while the other receives the newly updated cached response. Zero unhandled exceptions or duplicate leads created. | Automated Concurrency Test | Specified (Pending Phase 04) |
| **AC-ING-16** | Identical Content as Genuinely New Logical Request | If an identical inquiry arrives after the idempotency window has elapsed, Layer 3 (Prospect Deduplication) evaluates CRM lead lifecycle state: if active lead exists, an `INBOUND_INQUIRY` `LeadActivity` is appended; if prior lead was terminal (`CONVERTED`, `DISQUALIFIED`, `LOST`), a fresh `Lead` aggregate is created. | Automated Integration Test | Specified (Pending Phase 04) |
| **AC-ING-17** | Modified-Payload Retry Behavior | If client retries with an altered field (e.g. updated phone or message) within 15 minutes, the distinct content hash computes a new `idempotencyKey`, bypassing Layer 2 cache and updating the lead timeline in Layer 3 without creating duplicate lead aggregates. | Automated Integration Test | Specified (Pending Phase 04) |
| **AC-ING-18** | Lost-Response Recovery Across Expiration | If client experiences network drop and retries after the 15-minute TTL has elapsed, endpoint detects existing lead aggregate in Layer 3 and returns current lead state without creating duplicate leads. | Automated Integration Test | Specified (Pending Phase 04) |
| **AC-SEC-14** | Concurrent Caller-Authority Revocation at Mutation Time | If caller's membership status is deactivated or Team Lead assignment authority is revoked between authorization check and mutation, Strategy A / Strategy B row-lock revalidation detects inactive caller or scope mismatch and fails closed with `403 Forbidden` (`AuthorizationError`). Mutation is aborted. | Automated Security Test | Specified (Pending Phase 03) |
| **AC-SEC-15** | Raw Query Empty-Result Handling | If target lead, caller membership, or destination membership is not found in raw SQL queries, the service evaluates `!rows || rows.length === 0` safely, throwing structured `NotFoundError` or `AuthorizationError` rather than unhandled JavaScript runtime exceptions (`TypeError`). | Automated Unit Test | Specified (Pending Phase 03) |

### Complete Traceability Matrix (All Version 1.8.0):

| Specification Document | Addressed Acceptance Criteria | Planned Implementation Phase |
|---|---|---|
| [`phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) | AC-ING-05, AC-ING-07 to AC-ING-18, AC-ACT-03, AC-SEC-05, AC-UI-05 | Phase 02, 03 & 04 |
| [`phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) | AC-LIF-01 to AC-LIF-09 | Phase 02 & Phase 03 |
| [`phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) | AC-SEC-01 to AC-SEC-15 | Phase 02 & Phase 03 |
| [`phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) | AC-CON-01 to AC-CON-22 | Phase 03 & Phase 06 |
| Intake & Workbench Design | AC-ING-01 to AC-ING-18, AC-UI-01 to AC-UI-05 | Phase 04 & Phase 05 |

---

## 7. Cross-Document Consistency Matrix (All Version 1.8.0)

| Document | Version | State Machine Enum | Concurrency Protocol | RBAC & Scope | Intake Idempotency | Status |
|---|---|---|---|---|---|---|
| [`phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md) | **1.8.0** | Aligned (12 states) | Aligned (Lead quarantine) | Aligned (Default-deny) | Aligned (Atomic upsert under Option A) | Reconciled |
| [`phase-01-lifecycle.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-lifecycle.md) | **1.8.0** | Aligned (8-state Lead) | Aligned (Quarantine guard) | Aligned (Claiming vs assignment) | Aligned (Unassigned queue) | Reconciled |
| [`phase-01-permission-matrix.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-permission-matrix.md) | **1.8.0** | Aligned | Aligned (Deterministic lock ordering) | Aligned (Caller & destination revalidation) | Aligned | Reconciled |
| [`phase-01-conversion-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-conversion-contract.md) | **1.8.0** | Authoritative (12 states)| Authoritative (Rules 1–4, 404 Protocol) | Aligned | N/A (Authenticated) | Reconciled |
| [`phase-01-acceptance-criteria.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-acceptance-criteria.md) | **1.8.0** | Aligned (`COMPENSATION_PENDING`) | Aligned (AC-CON-15..22) | Aligned (AC-SEC-11..15) | Aligned (AC-ING-12..18) | Reconciled |
| [`phase-01.8-final-adversarial-corrections-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.8-final-adversarial-corrections-report.md) | **1.8.0** | Certified Baseline | Certified Baseline | Certified Baseline | Certified Baseline | Certified Baseline |

---

## 8. Remaining Technical & Architectural Risks

The following residual technical risks are explicitly cataloged:

1. **Third-Party Provider In-Flight Latency Window:** While lead quarantine prevents concurrent conversion from committing during a paused deletion, Supabase Auth does not participate in PostgreSQL 2PC transactions. If a paused worker's HTTP request arrives after manual administrative clearance of quarantine, the deletion targets $U_1$. Because fresh conversions use $U_2$, candidate data is protected, but $U_1$ is permanently deleted remotely.
2. **Prisma Connection Pooler Privilege Boundary:** Until an unprivileged connection pool role (`oos_public_ingest_role` with `NOBYPASSRLS`) is provisioned in Phase 02/06, public intake isolation depends on application-layer query scoping in `CrmIntakeRepository`.
3. **Eventual Consistency on Third-Party Auth Storage:** If an external identity provider exhibits read-replica lag, a 404 response could theoretically reflect replica delay rather than primary deletion. The 404 protocol assumes Supabase Admin API calls hit the primary database cluster.

---

## 9. Final Review Gate & Recommendation

### Audit Verdict: **ACCEPT WITH CONDITIONS**

The Phase 01 specification suite is mathematically coherent, distributed-systems sound, and hardened against network delays, stale workers, concurrent permission changes, and idempotency key collisions.

### Conditions for Proceeding to Phase 02:
1. **Human Decision Election:** Formal stakeholder selection recorded for `HUMAN-DEC-01`, `HUMAN-DEC-02`, and `HUMAN-DEC-03`.
2. **Explicit Human Phase 01 Sign-off:** Direct written authorization from human leadership accepting the v1.8.0 specifications.
3. **Strict Ban on Implementation:** Phase 02 (Prisma Schema & Database Migrations) remains **STRICTLY UNAUTHORIZED** until Conditions 1 and 2 are satisfied.
