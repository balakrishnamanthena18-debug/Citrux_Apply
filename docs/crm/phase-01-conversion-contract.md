# PHASE 01 — MULTI-DOMAIN CONVERSION & IDENTITY CONTRACT

> **Document Status:** RECONCILED SPECIFICATION / PENDING HUMAN ACCEPTANCE  
> **Document Version:** 1.11.0  
> **Classification:** Domain Integration Architecture, Identity & Financial Governance  
> **System:** Operations Operating System (OOS) — Lead & CRM Subsystem  
> **Date:** 2026-10-15  
> **Parent Specification:** [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md)  
> **Reconciliation Reports:** [`docs/crm/phase-01.1-reconciliation-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.1-reconciliation-report.md), [`docs/crm/phase-01.2-final-gate-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.2-final-gate-report.md), [`docs/crm/phase-01.3-final-security-challenge.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.3-final-security-challenge.md), [`docs/crm/phase-01.4-final-consistency-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.4-final-consistency-report.md), [`docs/crm/phase-01.5-final-adversarial-consistency-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.5-final-adversarial-consistency-report.md), [`docs/crm/phase-01.6-final-safety-corrections-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.6-final-safety-corrections-report.md), [`docs/crm/phase-01.7-adversarial-verification-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.7-adversarial-verification-report.md), [`docs/crm/phase-01.8-final-adversarial-corrections-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.8-final-adversarial-corrections-report.md), [`docs/crm/phase-01.9-final-transaction-safety-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.9-final-transaction-safety-report.md), [`docs/crm/phase-01.10-final-recovery-and-governance-audit.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.10-final-recovery-and-governance-audit.md), [`docs/crm/phase-01.11-final-safety-and-traceability-review.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.11-final-safety-and-traceability-review.md)  

---

## 1. Disentangling the Conversion Sequence

In generic CRMs, "conversion" is treated as an unverified single-click event that simultaneously creates a contact, account, and deal. In an enterprise operations operating system like OOS, **Candidate Talent Delivery (Candidate Core / WCOS)** and **Commercial Billing (CBOS)** are strictly governed, authoritative domains with separate operational lifecycles.

`CONVERTED` is the terminal status of a `Lead` signifying that the prospective sales phase is closed because a formal commercial agreement has been reached, customer/billing identity has been established in CBOS, and career onboarding has been authorized.

To prevent identity corruption and financial discrepancies, OOS defines **five separate business events**:

```
[Event 1: Lead Qualification]
     │ Lead satisfies work authorization, background, and service tier criteria. Status -> QUALIFIED.
     ▼
[Event 2: Admissions Acceptance & Proposal Presentation]
     │ Service tier and pricing agreement presented to prospect for execution. Lead remains QUALIFIED.
     ▼
[Event 3: CBOS CustomerAccount Establishment]
     │ Payer identity (self-funding candidate, corporate sponsor, or guarantor) established in CBOS.
     ▼
[Event 4: CBOS ServiceContract Initialization]
     │ Legally binding contract terms, pricing basis, and service entitlements committed to ledger.
     ▼
[Event 5: Candidate Account Provisioning (When Applicable)]
       Identity credentials, career profile, and onboarding specialist assigned in Candidate Core.
```

> [!IMPORTANT]
> **Non-Simultaneity Invariant:** These events do not necessarily occur at the same second. For instance, a lead may be `QUALIFIED` (Event 1) for two weeks before signing an agreement (Event 2). Similarly, an existing candidate returning for a second placement cycle already has an established user identity (Event 5 exists) and only requires a new contract (Event 4). Conversely, a corporate hiring partner lead requires a CustomerAccount and Contract (Events 3 & 4), but zero Candidate account provisioning (Event 5 is skipped).

---

## 2. Eligibility & Conversion Pre-conditions

A lead may only be converted when **all** of the following pre-conditions are verified:

1. **State Gate:** The lead's current status is strictly `QUALIFIED`. Conversion attempts from `NEW`, `CONTACTED`, `CONSULTATION_SCHEDULED`, `DISQUALIFIED`, or `LOST` are rejected with `InvalidStateTransitionError`.
2. **Owner Assigned:** The lead has an active assigned owner (`assignedStaffId != NULL`).
3. **Qualification Verified:** All 4 Admissions Gates (Work Authorization, Role Serviceability, Experience, and Commercial Commitment) are verified and signed off.
4. **Target Service Tier Selected:** An explicit CBOS [`ContractServiceType`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2425) (`CAREER_ACCELERATION`, `PLACEMENT_RETAINER`, `CONTINGENT_PLACEMENT`, `ENTERPRISE_TALENT_SEARCH`, or `EXECUTIVE_COACHING`) is selected. Prospective inquiry categories (e.g. general inquiries) cannot be converted without selecting a valid CBOS contract tier.
5. **Payer Role Specified:** Declaration whether the candidate is self-funding (`INDIVIDUAL_CANDIDATE`), sponsored by a third-party (`INDIVIDUAL_SPONSOR`), or a corporate client (`CORPORATE_CLIENT`).
6. **Caller Authorization:** The staff operator holds verified `crm:lead:convert` permission.
7. **Dedicated Action Only:** `status = 'CONVERTED'` cannot be updated via the generic `updateLeadStageAction`. It can strictly only be set by `convertLeadAction` upon satisfaction of the completion invariant.

---

## 3. Verified CBOS Schema Alignment & Conversion Scenarios

All commercial entity relationships must align precisely with the active schema defined in [`prisma/schema.prisma`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2397-L2450):

### 3.1 The Multi-Scenario Conversion Matrix

| Scenario | Lead Situation | User / Auth Action | Candidate Profile Action | CBOS Customer Action | CBOS Contract Action |
|---|---|---|---|---|---|
| **Scenario A: Fresh Candidate (Self-Funding)** | Completely new talent inquiring for the first time. | Generate new Supabase Auth user + public `User` record. | Create new `Candidate` record linked to `User`. | Create new `CustomerAccount` (`customerType: INDIVIDUAL_CANDIDATE`). | Create `ServiceContract` (`CAREER_ACCELERATION` or `PLACEMENT_RETAINER`) linked to Customer & Candidate. |
| **Scenario B: Returning Candidate / Alumni** | Past candidate returning for a new career placement cycle. | **Reuse existing `User`** (Confirmed by staff within tenant). | **Reuse existing `Candidate` record.** Do NOT duplicate profile. | Reuse existing `CustomerAccount`. | Create new `ServiceContract` for new placement cycle. |
| **Scenario C: Sponsored Candidate** | Candidate whose fees are paid by a corporate partner or parent. | Generate new `User` for candidate. | Create new `Candidate` record. | **Reuse or create Sponsor `CustomerAccount`** (`INDIVIDUAL_SPONSOR` or `CORPORATE_CLIENT`). | Create `ServiceContract` linked to Sponsor Customer and Candidate via `CustomerCandidateRelationship` (`relationshipType: SPONSOR`). |
| **Scenario D: Corporate Hiring Partner (B2B)** | Employer or hiring partner seeking placement / talent search services. | None (No candidate credentials needed). | **None** (Do NOT create candidate record). | Create/Reuse `CustomerAccount` (`customerType: CORPORATE_CLIENT`). | Create `ServiceContract` (`ContractServiceType: ENTERPRISE_TALENT_SEARCH` or `CONTINGENT_PLACEMENT`). |

---

## 4. Identity Security & Anti-Takeover Protocol

> [!CAUTION]
> **Identity Hijacking Prevention Invariant:** The system **must never adopt an existing Supabase Auth identity based solely on an email match**. An external lead submission cannot prove ownership of an existing account without server-controlled verification or explicit staff identity confirmation.

### 4.1 Cross-Tenant Privacy Invariant
- `User.email` has a global uniqueness constraint in PostgreSQL, while `leads.email` is scoped to the tenant (`@@index([organizationId, email])`).
- When checking for existing identities, queries are **strictly scoped to `ctx.organizationId`** (`where: { organizationId: ctx.organizationId }`).
- The system **must never reveal to staff or public callers whether an email belongs to another organization/tenant**. Disclosing that an email is registered in another organization is a severe data leak and cross-tenant enumeration vulnerability.

### 4.2 Authoritative Saga Model & Persisted Identity Attributes
To eliminate all contradictions between identity provenance, lease fencing, and compensation eligibility, the server durably persists saga operations in PostgreSQL table `crm_conversion_operations`:

1. `id`: UUID (Primary Key).
2. `organizationId`: UUID (Tenant binding).
3. `leadId`: UUID (Target Lead, indexed).
4. `targetEmail`: String (Normalized lowercase email).
5. `conversionIdempotencyKey`: String (Unique constraint `@@unique([organizationId, conversionIdempotencyKey])`).
6. `authProvisioningMode`: Enum (`CREATE_NEW_IDENTITY` for Scenarios A/C, `REUSE_EXISTING_IDENTITY` for Scenario B, `NO_AUTH_REQUIRED` for Scenario D).
7. `authUserId`: UUID? (The Supabase Auth user ID associated with this operation).
8. `authCreatedByThisOperation`: Boolean (Set to `true` if and only if this specific conversion operation created the user in Supabase Auth; preserved across retries).
9. `authCompensationAuthorized`: Boolean (Durable authorization flag; initialized to `false`, set to `true` upon confirmed Auth creation, and **atomically set to `false` at the exact instant the PostgreSQL interactive transaction commits**).
10. `status`: Canonical 12-State Enum:
    - `INITIALIZED`
    - `AUTH_PROVISIONING`
    - `AUTH_PENDING_VERIFICATION`
    - `AUTH_PROVISIONED`
    - `DB_COMMITTING`
    - `COMPLETED` (Terminal Success)
    - `COMPENSATION_PENDING`
    - `COMPENSATING`
    - `COMPENSATION_COMPLETED` (Terminal Compensation)
    - `COMPENSATION_HALTED_UNCERTAIN` (Terminal Escalation — Quarantined from regular workers)
    - `COMPENSATION_BLOCKED_PROFILE_EXISTS` (Terminal Invariant Enforcement — Quarantined from regular workers)
    - `FAILED_TERMINAL` (Terminal Failure Without Compensation — Quarantined from regular workers)
11. `leaseOwnerId`: UUID? (Worker / process instance holding the exclusive execution lease).
12. `leaseExpiresAt`: DateTime? (Lease expiry timestamp for crash detection).
13. `version`: Int (Monotonically increasing fencing token for optimistic locking).
14. `createdAt`: DateTime, `updatedAt`: DateTime.

---

### 4.3 Canonical State Transition Table

The following table establishes the **sole authoritative state machine** for `CrmConversionOperation`. All competing state vocabularies are decommissioned.

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

#### Terminal Escalation State Isolation:
States `COMPENSATION_HALTED_UNCERTAIN`, `COMPENSATION_BLOCKED_PROFILE_EXISTS`, and `FAILED_TERMINAL` are **terminal escalation states**. Generic worker lease acquisition queries strictly filter:
```sql
WHERE "status" NOT IN ('COMPLETED', 'COMPENSATION_COMPLETED', 'COMPENSATION_HALTED_UNCERTAIN', 'COMPENSATION_BLOCKED_PROFILE_EXISTS', 'FAILED_TERMINAL');
```
They **cannot** be accidentally reacquired or processed by ordinary conversion retries or background workers. They can only be resolved via dedicated administrative reconciliation tooling or manual engineering intervention.

#### Distinguishing Definitive Auth 404 from Transient Errors:
- **Definitive Deletion Proof:** A definitive `404 Not Found` response from Supabase Auth (`status === 404 && body.message === "User not found"`) is the **sole** external condition that confirms non-existence of the user identity.
- **Transient / Ambiguous Errors:** HTTP 500, 502, 503, 504 (gateways/timeouts), 429 (rate limits), and TCP socket drops are strictly treated as **ambiguous/uncertain** and transition to `COMPENSATION_HALTED_UNCERTAIN`. They are never treated as confirmation of deletion.

---

### 4.4 Secure Identity Recovery via Server-Controlled `app_metadata`
If fresh candidate creation (`CREATE_NEW_IDENTITY`) calls `supabaseAdmin.auth.admin.createUser` and receives `"already been registered"` or encounters an HTTP timeout/uncertain outcome:
1. **The In-Flight Retry Test:** Did *this exact conversion operation* create the Auth user seconds ago before a network interruption?
   - When calling `createUser`, the orchestrator passes:
     ```json
     {
       "app_metadata": {
         "conversionOperationId": "<operation.id>",
         "organizationId": "<ctx.organizationId>",
         "leadId": "<lead.id>"
       }
     }
     ```
   - If `createUser` returns that the user already exists, the handler queries `supabaseAdmin.auth.admin.getUserByEmail(email)`.
   - **Legitimate In-Flight Retry Verification:** If and only if:
     - `user.app_metadata.conversionOperationId === operation.id` AND
     - `user.app_metadata.leadId === lead.id` AND
     - `user.app_metadata.organizationId === ctx.organizationId`
     The saga proves that it created this user during this active operation.
     - The orchestrator updates `operation.authUserId = user.id`.
     - Preserves `operation.authCreatedByThisOperation = true`.
     - Preserves `operation.authCompensationAuthorized = true` (since the database transaction has not yet committed).
     - Updates `operation.status = 'AUTH_PROVISIONED'`.
     - Proceeds to the PostgreSQL interactive transaction commit.
2. **Identity Conflict / Takeover Block:**
   - If the existing Auth user's `app_metadata` does NOT match the active `conversionOperationId`, the email belongs to an existing pre-established account.
   - If the email belongs to an existing `Candidate` in *this tenant*, the system **blocks automated conversion** and requires staff to explicitly select **Scenario B (Identity Reuse)** with secondary identity confirmation.
   - If the email exists in Supabase Auth but has zero profile in this tenant (cross-tenant user or external identity), automated conversion is **strictly halted**. The staff member is presented with an `IdentityConflictError`: *"Email address is associated with an existing account. Please verify candidate identity or use an alternate email address."* Under zero circumstances is the external account silently adopted.

---

## 5. Single Operation-Level Concurrency Protocol

To eliminate race conditions between conversion execution, retries, timeout handlers, and compensation workers, all execution is governed by a **Single Distributed Operation Lease Protocol** anchored in PostgreSQL:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DISTRIBUTED OPERATION LEASE PROTOCOL                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Lease Acquisition:  Worker acquires exclusive 30s lease via atomic UPDATE│
│                        with version increment (fencing token).              │
│ 2. Heartbeat Renewal:  Active worker extends leaseExpiresAt every 10s.      │
│ 3. Stale Fencing:      All database updates require leaseOwnerId and version│
│                        matching active lease. Stale workers fenced.         │
│ 4. Mutual Exclusion:   Conversion commit and compensation cannot run        │
│                        concurrently; both require exclusive lease on op.    │
│ 5. Commit Guard:       Commit updates WHERE status = 'DB_COMMITTING'. If    │
│                        compensation begins, commit is strictly blocked.     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Operation Lease Acquisition, Renewal, Fencing & Atomic CAS Predicates

#### 1. Atomic Compare-and-Set (CAS) Inventory Across Saga Transitions
Every ownership-sensitive and state-sensitive mutation on `crm_conversion_operations` must execute via an explicit atomic CAS predicate and validate affected row count (`assert(affectedRows === 1)`):

| Transition | Pre-condition Predicate in `WHERE` Clause | Atomic Mutation (`SET`) | Fencing / Concurrency Failure Outcome |
|---|---|---|---|
| **Initialize $\rightarrow$ Auth Provisioned** | `WHERE id = $opId AND lease_owner_id = $workerId AND version = $v AND lease_expires_at >= NOW() AND status = 'INITIALIZED'` | `status = 'AUTH_PROVISIONED', auth_user_id = $uId, version = version + 1` | 0 rows affected $\rightarrow$ Abort. Auth compensation triggered for provisioned user. |
| **Auth Provisioned $\rightarrow$ DB Committing** | `WHERE id = $opId AND lease_owner_id = $workerId AND version = $v AND lease_expires_at >= NOW() AND status = 'AUTH_PROVISIONED'` | `status = 'DB_COMMITTING', version = version + 1` | 0 rows affected $\rightarrow$ Abort. Interactive transaction rolls back. |
| **DB Committing $\rightarrow$ Completed (Inside Tx 2 Commit)** | `WHERE id = $opId AND lease_owner_id = $workerId AND version = $v AND lease_expires_at >= NOW() AND status = 'DB_COMMITTING'` | `status = 'COMPLETED', auth_compensation_authorized = FALSE, completed_at = NOW(), lease_owner_id = NULL, lease_expires_at = NULL, version = version + 1` | 0 rows affected $\rightarrow$ Tx 2 rolls back completely. Zero partial entities committed. |
| **Expired Lease Re-acquisition (Recovery Worker)** | `WHERE id = $opId AND lease_expires_at < NOW() AND status NOT IN ('COMPLETED', 'COMPENSATION_COMPLETED', 'FAILED_TERMINAL')` | `lease_owner_id = $recoveryWorkerId, lease_expires_at = NOW() + INTERVAL '30 seconds', version = version + 1` | 0 rows affected $\rightarrow$ Another worker took lease or operation completed. Back off. |
| **Initiate Compensation (After Proving No Profile Exists)** | `WHERE id = $opId AND lease_owner_id = $recoveryWorkerId AND version = $v AND lease_expires_at >= NOW() AND status IN ('INITIALIZED', 'AUTH_PROVISIONED', 'DB_COMMITTING') AND auth_compensation_authorized = TRUE` | `status = 'COMPENSATION_PENDING', version = version + 1` | 0 rows affected $\rightarrow$ Stale lease or authorization revoked. Abort compensation. |
| **Compensation In-Flight (Before Calling Remote Delete)** | `WHERE id = $opId AND lease_owner_id = $recoveryWorkerId AND version = $v AND lease_expires_at >= NOW() AND status = 'COMPENSATION_PENDING'` | `status = 'COMPENSATING', version = version + 1` | 0 rows affected $\rightarrow$ Stale worker fenced. Abort remote call. |
| **Compensation Completed (After 200 OK or 404 Resolution)** | `WHERE id = $opId AND lease_owner_id = $recoveryWorkerId AND version = $v AND status = 'COMPENSATING'` | `status = 'COMPENSATION_COMPLETED', auth_compensation_authorized = FALSE, lease_owner_id = NULL, lease_expires_at = NULL, version = version + 1` | 0 rows affected $\rightarrow$ Fenced by subsequent recovery worker. |
| **Compensation Halted Uncertain (On 5xx / Timeout / Net Drop)** | `WHERE id = $opId AND lease_owner_id = $recoveryWorkerId AND version = $v AND status = 'COMPENSATING'` | `status = 'COMPENSATION_HALTED_UNCERTAIN', lease_owner_id = NULL, lease_expires_at = NULL, version = version + 1` | 0 rows affected $\rightarrow$ Fenced by subsequent recovery worker. |

#### 2. Heartbeat Renewal:
Every 10 seconds, the active worker extends its lease:
```sql
UPDATE "crm_conversion_operations"
SET "lease_expires_at" = NOW() + INTERVAL '30 SECONDS',
    "updated_at" = NOW()
WHERE "id" = $operationId
  AND "lease_owner_id" = $workerId
  AND "version" = $version;
```

#### 3. Stale Worker Database Fencing:
If a worker stalls (due to GC pause or network suspension) and its lease expires, a subsequent worker increments `version` when acquiring the lease. When the stale worker awakens, any subsequent write includes `WHERE lease_owner_id = $workerId AND version = $version AND lease_expires_at >= NOW()`. The write updates 0 rows, forcing the stale worker to abort immediately without committing corrupt state.

#### 4. Transactional Lock Holding & Mutual Exclusion Inside Tx 2:
Inside the interactive candidate creation transaction (**Tx 2**), the worker strictly enforces row-level exclusive locks held from inception until commit:
```sql
-- Step 1 of Tx 2: Acquire exclusive row locks on operation and lead
SELECT id, status, version, lease_owner_id, lease_expires_at, auth_compensation_authorized
FROM "crm_conversion_operations"
WHERE id = $operationId
FOR UPDATE;

SELECT id, status, active_conversion_operation_id, quarantine_conversion_operation_id
FROM "leads"
WHERE id = $leadId
FOR UPDATE;
```
- **Lock Duration:** In PostgreSQL, these `FOR UPDATE` row locks are held continuously until `COMMIT` or `ROLLBACK` of Tx 2.
- **Mutual Exclusion with Recovery Worker:**
  - *Conversion Holds Lock:* If Tx 2 holds the lock when Recovery Worker R attempts lease acquisition or status inspection, Worker R's `SELECT ... FOR UPDATE` or `UPDATE ... WHERE id = $opId` **blocks** at the PostgreSQL lock manager until Tx 2 concludes. If Tx 2 commits, Worker R unblocks, observes `status = 'COMPLETED'` and `auth_compensation_authorized = false`, and terminates without executing compensation.
  - *Recovery Holds Lock:* If Recovery Worker R acquires the lock first (e.g. while Worker C was stalled outside a transaction), Worker R updates `status = 'COMPENSATION_PENDING'` and increments `version`. When Worker C later opens Tx 2 and executes `SELECT ... FOR UPDATE`, it unblocks only after Worker R commits, reads `status = 'COMPENSATION_PENDING'`, evaluates `assert(status === 'AUTH_PROVISIONED')`, aborts immediately, and issues `ROLLBACK`. Zero downstream candidate records can ever commit.
  - *Lost Acknowledgement:* If Tx 2 commits but the worker crashes before receiving the ACK, the committed records (`candidates`, `customer_accounts`, `leads.status = 'CONVERTED'`) are durable in PostgreSQL. When Recovery Worker R awakens, the Forward Recovery Inspection Query detects the committed records and forward-converges status to `COMPLETED`, permanently barring compensation.


### 5.2 P0 Adversarial Interleaving Analysis: Stale Worker & Paused HTTP Request

#### The Interleaving:
Consider the following distributed failure sequence:
1. Worker A initiates compensation for a failed PostgreSQL transaction. It passes database pre-checks (finding zero downstream records) and updates status to `COMPENSATING`.
2. Worker A pauses (due to an OS process freeze, GC pause, or outbound network stall) immediately before or during the external HTTP request to Supabase Auth (`deleteUser`).
3. Worker A's PostgreSQL lease expires after 30 seconds.
4. Worker B arrives (a concurrent conversion retry or new staff conversion attempt for the same lead).
5. Worker A awakens and issues or completes the remote deletion request in Supabase Auth.

#### The Distributed Reality: Limits of Database Fencing Against External HTTP Requests
> [!CAUTION]
> **External Side-Effect Fencing Limitation:**  
> In distributed systems, a database lease or fencing token in PostgreSQL **cannot prevent an already-sent or in-flight HTTP packet from executing against an external third-party API** (Supabase Auth) that does not participate in the database fencing protocol. If Worker B were permitted to complete conversion while Worker A's external call is pending, Worker A could delete an active user identity that Worker B just linked in PostgreSQL.

#### The State-Machine Immunity Guarantee:
Safety against delayed external HTTP calls is guaranteed not by attempting to recall network packets, but through **State-Machine Immunity**:
1. **Lead Quarantine Blocks Worker B:** While Worker A is in compensation or halted uncertain, `leads.quarantine_conversion_operation_id = Op 1`. Worker B is strictly rejected with `409 Conflict: Lead quarantined by conversion operation`. No downstream profile can be created.
2. **Distinct Identity Generation:** When quarantine is eventually cleared and a future conversion operation (Op 2) provisions an identity, Supabase Auth generates a fresh, statistically unique UUID ($U_2$). Worker A's delayed packet was targeted specifically at $U_1$ (`DELETE /admin/users/{U1}`). Because $U_1 \neq U_2$, Worker A's delayed request CANNOT destroy Worker B's identity.

#### Comprehensive Crash Boundaries & Forward Recovery Protocol:

1. **Durable Pre-Execution Lead Binding (Committed Tx 0):**  
   Before any external call to Supabase Auth or any candidate creation transaction, the orchestrator executes a dedicated committed transaction that durably binds the Lead to the operation:
   ```sql
   -- Tx 0: Pre-Execution Binding (Committed before external side effects)
   UPDATE "leads"
   SET "active_conversion_operation_id" = $operationId,
       "version" = "version" + 1,
       "updated_at" = NOW()
   WHERE "id" = $leadId
     AND "organization_id" = $ctxOrganizationId
     AND "status" = 'QUALIFIED'
     AND "active_conversion_operation_id" IS NULL
     AND "quarantine_conversion_operation_id" IS NULL;

   INSERT INTO "crm_conversion_operations" (
     "id", "organization_id", "lead_id", "status", "lease_owner_id", "lease_expires_at", "version", ...
   )
   VALUES ($operationId, $ctxOrganizationId, $leadId, 'INITIALIZED', $workerId, NOW() + INTERVAL '30 seconds', 1, ...);
   ```
   **Crash-Safety Invariant:** If the subsequent interactive candidate transaction rolls back and the worker crashes immediately, `active_conversion_operation_id` **survives intact** because Tx 0 was already committed. Any concurrent conversion request inspecting the lead is strictly rejected with `409 Conflict: Conversion operation is already in flight`.

2. **Durable Rollback & Recovery Sequence:**
   - **Step 1 (Candidate Tx Rolls Back or Worker Crashes):** Worker A's interactive PostgreSQL transaction aborts, rolls back, or Worker A crashes before commit. Downstream entities do NOT exist.
   - **Step 2 (Crash Prior to Compensation Record):** Worker A crashes immediately. Op 1 remains at `AUTH_PROVISIONED` or `DB_COMMITTING` in `crm_conversion_operations`. On `Lead`, `active_conversion_operation_id = Op1`.
   - **Step 3 (Lease Expiry):** Worker A's 30-second lease expires (`lease_expires_at < NOW()`).
   - **Step 4 (Concurrent Conversion Blocked):** A second conversion request (Worker C) arrives for the same lead. Worker C executes `SELECT active_conversion_operation_id, quarantine_conversion_operation_id FROM leads WHERE id = $leadId FOR UPDATE;`. Worker C detects `active_conversion_operation_id = Op1`. Worker C is **immediately rejected with `409 Conflict`**.
   - **Step 5 (Recovery Worker Forward Recovery & Commit Detection):**  
     Recovery Worker R acquires the expired lease on Op 1.  
     > [!IMPORTANT]
     > **Why Stale Status Is NOT Proof of Rollback:**  
     > If Worker A crashed *after* Tx 2 committed but before recording status in memory or before sending the HTTP response, `conversion_operations.status` may still sit at `DB_COMMITTING` or `AUTH_PROVISIONED`. Treating stale status as proof of rollback would trigger catastrophic compensation against live accounts!  
     
     Recovery Worker R MUST execute the **Forward Recovery Inspection Query**:
     ```sql
     SELECT 
       l.id AS lead_id,
       l.status AS lead_status,
       l.converted_customer_account_id,
       l.converted_contract_id,
       c.id AS candidate_id,
       ca.id AS customer_account_id
     FROM "leads" l
     LEFT JOIN "candidates" c ON c.lead_id = l.id OR (c.user_id = $authUserId AND $authUserId IS NOT NULL)
     LEFT JOIN "customer_accounts" ca ON ca.id = l.converted_customer_account_id
     WHERE l.id = $leadId;
     ```
     - *Branch 5A (Tx 2 Committed / Forward State Convergence):* If `c.id IS NOT NULL` OR `ca.id IS NOT NULL` OR `lead_status = 'CONVERTED'`, the transaction committed. Compensation is permanently prohibited. Worker R updates `conversion_operations.status = 'COMPLETED'`, `auth_compensation_authorized = FALSE`, `completed_at = NOW()`, and clears `leads.active_conversion_operation_id = NULL`. Conversion is preserved.
     - *Branch 5B (Tx 2 Rolled Back / Compensation Authorized):* Only if `c.id IS NULL` AND `ca.id IS NULL` AND `lead_status = 'QUALIFIED'` has rollback been confirmed. Worker R executes a committed transaction setting quarantine:
       ```sql
       -- Tx Recovery: Durably record compensation and quarantine
       UPDATE "leads"
       SET "quarantine_conversion_operation_id" = $operationId,
           "active_conversion_operation_id" = NULL,
           "updated_at" = NOW()
       WHERE "id" = $leadId;

       UPDATE "crm_conversion_operations"
       SET "status" = 'COMPENSATION_PENDING',
           "lease_owner_id" = $recoveryWorkerId,
           "lease_expires_at" = NOW() + INTERVAL '30 seconds',
           "version" = "version" + 1
       WHERE "id" = $operationId;
       ```
   - **Step 6 (Remote Deletion Execution):** Worker R transitions Op 1 to `COMPENSATING` and dispatches `supabaseAdmin.auth.admin.deleteUser(U1)`.
     - *If Deletion Returns 200 OK:* Op 1 transitions to `COMPENSATION_COMPLETED`. In a committed transaction, PostgreSQL sets `leads.quarantine_conversion_operation_id = NULL`. Lead is now clean and eligible for future conversion.
     - *If Worker Crashes After Delete:* Worker R dies before updating DB. Recovery Worker D wakes up, queries `admin.getUserById(U1)` $\rightarrow$ receives `404 Not Found` (Authoritative 404 Protocol). Worker D marks `COMPENSATION_COMPLETED` and clears lead quarantine.
     - *If Provider Returns 5xx / Timeout / Rate Limit:* Worker R transitions Op 1 to `COMPENSATION_HALTED_UNCERTAIN`. **`quarantine_conversion_operation_id` REMAINS SET INDEFINITELY.** Lead remains permanently quarantined. Item enqueued to `crm_auth_reconciliation_queue`.
   - **Step 7 (Quarantine Release Gate):** Quarantine can ONLY be cleared when compensation is definitively confirmed via HTTP 200/404, or through administrative reconciliation in `/admin/crm/reconciliation`.

3. **Identity Poisoning & Blacklisting:**  
   The `authUserId` associated with a compensating operation is permanently blacklisted. No subsequent conversion attempt can adopt or attach an identity enrolled in compensation.

4. **Availability vs Safety Trade-Off:**  
   Conversion for that specific prospect is suspended while compensation settles, guaranteeing absolute protection of committed profiles against stale in-flight deletion packets.

### 5.3 Remote Auth Deletion Crash Recovery (The 404 Protocol)

If a compensation worker issues `supabaseAdmin.auth.admin.deleteUser(authUserId)` and receives `200 OK`, but crashes before updating `crm_conversion_operations.status = 'COMPENSATION_COMPLETED'` in PostgreSQL:
1. The crashed worker's lease expires after 30 seconds.
2. A background recovery worker acquires the lease on the stalled operation (which sits in `COMPENSATING`).
3. The recovery worker queries Supabase Auth: `admin.getUserById(authUserId)`.
4. **Authoritative Resolution:**
   - If Supabase returns `404 Not Found` (or error `"User not found"`): The recovery worker proves that remote deletion completed successfully. It transitions `status = 'COMPENSATION_COMPLETED'`, sets `authCompensationAuthorized = false`, clears `Lead.quarantineConversionOperationId`, and records an audit log.
   - If the user still exists in Supabase Auth: The worker re-executes the Double-Check-Before-Delete invariant and retries deletion.
   - If the query returns a network timeout or 5xx: The worker halts, sets `status = 'COMPENSATION_HALTED_UNCERTAIN'`, and enqueues to `crm_auth_reconciliation_queue`.

### 5.4 States That Permanently Prohibit Compensation

Compensating deletion of a Supabase Auth identity is **permanently prohibited** under any of the following conditions:
1. `status === 'COMPLETED'` (PostgreSQL database transaction successfully committed downstream entities).
2. `authCompensationAuthorized === false` (Compensation authority revoked or never granted).
3. `authProvisioningMode !== 'CREATE_NEW_IDENTITY'` (`REUSE_EXISTING_IDENTITY` or `NO_AUTH_REQUIRED` identities are permanently immune).
4. `authCreatedByThisOperation !== true` (Identities not provably created by this saga are immune).
5. `status === 'COMPENSATION_BLOCKED_PROFILE_EXISTS'` (PostgreSQL pre-check confirmed downstream profiles exist).
6. `status === 'COMPENSATION_COMPLETED'` (Compensation has already completed).
7. `status === 'FAILED_TERMINAL'` (Operation terminated before Auth creation).
8. **Irrevocable Compensation Condemnation:** Once an operation enters `COMPENSATION_PENDING` or `COMPENSATING`, it is **permanently prohibited from ever transitioning back to conversion or committing a database profile**. No retry or recovery worker may convert using this operation or reuse its `authUserId` to commit a candidate profile.
9. **Condemned Identity Blacklisting:** An `authUserId` associated with an operation in compensation or halted uncertain is permanently blacklisted from being adopted by any subsequent conversion attempt.
10. **Indefinite Lead Quarantine on Provider Ambiguity:** If compensation encounters provider timeouts, rate limits, or 5xx errors, the operation transitions to `COMPENSATION_HALTED_UNCERTAIN` and `Lead.quarantineConversionOperationId` REMAINS SET indefinitely. The lead cannot be converted until an administrator explicitly resolves the remote state.

### 5.5 The Double-Check-Before-Delete Invariant

Before any compensating delete (`supabaseAdmin.auth.admin.deleteUser(authUserId)`) can be executed:
1. **Authorization Verification:**
   - Verify `authCompensationAuthorized === true`, `authCreatedByThisOperation === true`, and `authProvisioningMode === 'CREATE_NEW_IDENTITY'`.
2. **PostgreSQL Downstream Profile Non-Existence Pre-Check:**
   - Query PostgreSQL:
     ```sql
     SELECT 1 FROM users WHERE id = :authUserId OR email = :targetEmail
     UNION
     SELECT 1 FROM candidates WHERE user_id = :authUserId
     UNION
     SELECT 1 FROM leads WHERE converted_candidate_id IS NOT NULL AND (id = :leadId OR email = :targetEmail);
     ```
   - If ANY row exists, **ABORT DELETION IMMEDIATELY**. Update operation status to `COMPENSATION_BLOCKED_PROFILE_EXISTS`, set `authCompensationAuthorized = false`, and log an audit alert.
3. **Supabase App Metadata Pre-Check (Identity Ownership Proof):**
   - Query Supabase Auth: `getUserById(authUserId)`.
   - Verify that `user.app_metadata.conversionOperationId === operation.id`.
   - If `app_metadata` does not match, **ABORT DELETION**.
4. **Halting on Uncertainty:**
   - If any verification query encounters a network timeout, connection reset, or 5xx error, **DO NOT DELETE**.
   - Transition operation status to `COMPENSATION_HALTED_UNCERTAIN`.
   - Durably enqueue in `crm_auth_reconciliation_queue` for delayed verification.

### 5.6 The Invariant of Complete Conversion
A conversion is complete **if and only if**:
1. `Lead.status == 'CONVERTED'` is durably committed in PostgreSQL.
2. `Lead.convertedCustomerAccountId IS NOT NULL`.
3. `Lead.convertedContractId IS NOT NULL`.
4. `Lead.convertedCandidateId IS NOT NULL` (for Candidate Scenarios A, B, and C). For Scenario D (B2B Corporate Hiring Partner), `Lead.convertedCandidateId` is strictly `NULL`.
5. An append-only `LeadStageHistory` row recording `fromStatus = 'QUALIFIED'` and `toStatus = 'CONVERTED'` is committed in PostgreSQL.
6. An append-only `AuditEvent` with action `AuditAction.LEAD_CONVERTED` is committed in PostgreSQL.
7. `CrmConversionOperation.status = 'COMPLETED'` and `authCompensationAuthorized = false` are durably committed in PostgreSQL.

If any of these conditions fail, the PostgreSQL transaction aborts, rollback is triggered, and `Lead.status` remains `QUALIFIED`.

---

## 6. Authority Preservation Guarantee

| Domain | Authority Post-Conversion | Forbidden Action |
|---|---|---|
| **CRM** | Read-only reference to `convertedCandidateId`, `convertedCustomerAccountId`, and `convertedContractId`. Historical lead analytics and attribution reporting. | CRM must **never** update candidate skills, edit resumes, alter application materials, or modify billing invoices post-conversion. |
| **Candidate Core** | Complete operational authority over candidate career progress, applications, documents, and candidate portal access. | Candidate Core does not mutate lead stage or alter historical sales notes. |
| **CBOS** | Complete commercial authority over contracts, invoices, payments, and placement fee reconciliation. | CBOS does not manage candidate career profiles or lead stage progression. |
| **Audit System** | Immutable audit records of `LEAD_CONVERTED` and downstream `CANDIDATE_CREATED` and `COMMERCIAL_CUSTOMER_CREATED`. | Audit events can never be altered or removed. |
