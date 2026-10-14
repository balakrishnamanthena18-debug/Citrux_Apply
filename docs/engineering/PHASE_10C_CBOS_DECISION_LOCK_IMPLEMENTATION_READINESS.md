# PHASE 10C — COMMERCIAL & BILLING OPERATING SYSTEM (CBOS)
## DECISION LOCK & IMPLEMENTATION READINESS REPORT

**Status:** COMPLETE / ACCEPTED / FROZEN  
**Audit Date:** October 7, 2026  
**Auditor:** Antigravity Forensic Architecture & Domain Authority Suite  
**Baseline Inputs:** [`docs/engineering/PHASE_10B_CBOS_PRODUCT_CONTRACT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_10B_CBOS_PRODUCT_CONTRACT.md), OPOS Frozen Baseline (Phases 9A–9F), Existing RBAC & RLS Architecture  
**Implementation Authorization:** NOT YET AUTHORIZED (Forensic Decision Lock Only — Zero Code, Zero Migrations, Zero UI)  

---

## 1. Executive Summary

Phase 10C performs an exhaustive forensic decision-lock audit of the Commercial & Billing Operating System (CBOS) Product Contract defined in **Phase 10B**. 

The purpose of this audit is to rigorously test every domain boundary, edge case, financial representation, state machine, lifecycle transition, event delivery mechanism, RBAC mapping, and privacy boundary before any schema migrations or code are written.

### Primary Decision Lock Verdict:
1. **Contract Consistency:** The CBOS contract is structurally sound, mathematically precise, and fully compatible with existing OOS domains.
2. **Boundary Preservation:** The decoupling between Talent Operations (OPOS) and Commercial Operations (CBOS) is airtight. OPOS retains 100% sovereignty over placements without calculating fees; CBOS processes commercial events without mutating operational placement lifecycle states.
3. **Financial Precision:** All monetary amounts are locked to `BigInt` / `Int` minor units (cents) with explicit ISO-4217 currencies, completely eliminating floating-point rounding errors.
4. **RBAC Harmony:** The contract is reconciled with OOS's frozen 3-role enum (`CANDIDATE`, `EMPLOYEE`, `ADMIN`) by modeling billing capabilities as structural permissions rather than mutating the database `Role` enum.
5. **Implementation Readiness:** **READY FOR DATA MODEL IMPLEMENTATION (PHASE 10D)** upon formal authorization.

---

## 2. Contract Review

The frozen Phase 10B Product Contract was audited across all 28 sections. No unresolvable contradictions were identified. Key design principles—such as *Candidate $\neq$ Customer*, *Salary $\neq$ Revenue*, *Invoice $\neq$ Payment*, and *Append-Only Financial Truth*—are upheld with mathematical and logical rigor.

---

## 3. Customer / Candidate Resolution

The structural relationship between Candidate and CustomerAccount is locked as follows:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   CUSTOMER ◄──► CANDIDATE RELATIONSHIP MATRIX               │
├──────────────────────────┬─────────────────────────────┬────────────────────┤
│ Business Scenario        │ Cardinality                 │ Modeling Mechanism │
├──────────────────────────┼─────────────────────────────┼────────────────────┤
│ Self-Paying Candidate    │ 1 Candidate ◄──► 1 Customer │ CustomerAccount has│
│                          │                             │ primaryCandidateId │
├──────────────────────────┼─────────────────────────────┼────────────────────┤
│ Parent / Private Sponsor │ N Candidates ◄── 1 Customer │ ServiceContract has│
│                          │                             │ candidateId target │
├──────────────────────────┼─────────────────────────────┼────────────────────┤
│ Corporate Hiring Partner │ N Candidates ◄── 1 Customer │ ServiceContract has│
│ / Staffing Client        │                             │ candidateId target │
├──────────────────────────┼─────────────────────────────┼────────────────────┤
│ Candidate without        │ 1 Candidate ◄── 0 Customer  │ Pure organic talent│
│ Customer                 │                             │ (Unmonetized/Free) │
├──────────────────────────┼─────────────────────────────┼────────────────────┤
│ Customer without         │ 1 Customer ◄── 0 Candidate  │ Retained search /  │
│ Candidate                │                             │ Pre-search account │
└──────────────────────────┴─────────────────────────────┴────────────────────┘
```

### Locked Rule:
- A `CustomerAccount` belongs to exactly **one** `Organization` (strict tenant isolation).
- A `Candidate` can be covered by multiple non-overlapping `ServiceContract` records across their lifetime (e.g., initial self-paid search, subsequent corporate sponsor placement).
- Candidate profile identity remains independent from customer billing accounts.

---

## 4. Contract Resolution

### Contract Lifecycle State Machine:
$$\text{DRAFT} \longrightarrow \text{PENDING_SIGNATURE} \longrightarrow \text{ACTIVE} \longrightarrow \begin{cases} \text{FULFILLED} \\ \text{EXPIRED} \\ \text{TERMINATED} \\ \text{CANCELLED} \end{cases}$$

### Contract Modification & Versioning Policy:
- **Active Contracts are Immutable:** Once a `ServiceContract` reaches `ACTIVE`, its core terms (`serviceType`, `billingCadence`, `pricingTerms`, `currency`) cannot be mutated in place.
- **Contract Amendments:** If commercial terms change during active service, a new version or an explicit `ContractAmendment` entity is created, preserving the historical baseline.
- **Overlapping Contracts:** A single candidate cannot have two concurrently `ACTIVE` contracts with conflicting contingent placement clauses within the same organization.

---

## 5. Pricing Term Resolution

CBOS supports five explicit pricing models:

1. `FIXED_FEE`: Flat currency amount (e.g., \$3,500 upfront retainer).
2. `PERCENTAGE_COMPENSATION`: Contractually defined percentage applied to an explicit compensation basis.
3. `RECURRING_SUBSCRIPTION`: Fixed amount per cadence period (e.g., \$500/month).
4. `MILESTONE_CONTINGENT`: Fixed or percentage amounts released upon operational milestone completion.
5. `HYBRID`: Upfront retainer credited against final contingent placement fee.

All pricing terms must specify `currency`, `effectiveFrom`, `effectiveTo`, and `pricingBasis`. Undefined or dynamic AI pricing models are **DEFERRED / OUT OF SCOPE**.

---

## 6. Percentage Pricing Resolution (The Compensation Basis)

To eliminate any ambiguity regarding percentage-based placement fees:
- **Basis Attribute is Explicit:** The active `PricingTerm` must declare its `pricingBasis`:
  - `FIRST_YEAR_BASE_SALARY` (Standard Default)
  - `TOTAL_YEAR_ONE_CASH` (Base Salary + Guaranteed Signing Bonus)
  - `TOTAL_TARGET_COMPENSATION` (Base + Guaranteed Bonus + Target Bonus)
- **Data Source:** Pulled exclusively from the verified `PlacementRecord` in OPOS.
- **Precision & Rounding:** Minor currency integer math (`BigInt` cents). Rounding uses standard half-up integer arithmetic.
- **Zero / Missing Compensation:** If `PlacementRecord.annualBaseSalaryCents` is 0 or missing, the placement fee calculation fails validation and creates a manual review task for Billing Admins rather than silently generating a \$0 invoice.

---

## 7. Placement $\rightarrow$ Commercial Trigger Resolution

### Event Specification: `OPOS_PLACEMENT_VERIFIED_EVENT`
- **Producer:** `verifyPlacement()` in `src/lib/opos/opos-service.ts`.
- **Consumer:** `cbos-event-consumer` (CBOS Ingestion Service).
- **Payload Contract:**
  ```typescript
  interface PlacementVerifiedEventPayload {
    eventId: string; // UUIDv7
    organizationId: string;
    placementId: string;
    candidateId: string;
    offerId: string;
    annualBaseSalaryCents: number;
    currency: string;
    joiningDate: string; // ISO-8601
    verifiedAt: string; // ISO-8601
    verifiedByStaffId: string;
    schemaVersion: "1.0.0";
    idempotencyKey: string; // "opos-placement-verified-${placementId}"
  }
  ```
- **Failure Model (The Non-Blocking Invariant):** If CBOS fails to process the event, drops a database connection, or encounters an invalid contract, **the OPOS placement verification transaction MUST NOT roll back**. The event is logged in a reliable outbox for retry.

---

## 8. Event Architecture & Delivery Model

- **Architecture Selected:** **Transactional Outbox with Idempotent Consumer**.
- **Delivery Guarantees:**
  1. At-least-once delivery guaranteed via outbox queue.
  2. Exactly-once processing enforced via unique constraint on `CommercialEvent.idempotencyKey`.
  3. Replay-safe and fully auditable.

---

## 9. Commercial Event vs. Invoice Boundary

- **`CommercialEvent` = The Factual Economic Trigger:**
  - Immutable record that a billable event occurred.
  - One `CommercialEvent` typically produces **1 Draft Invoice**, but can produce **0 Invoices** (if prepaid retainer fully offsets the charge) or **Multiple Scheduled Invoices** (if contract specifies installment billing).
- **`Invoice` = The Formal Receivable Document:**
  - A single invoice can aggregate multiple commercial events (e.g., monthly retainer + ad-hoc resume review).

---

## 10. Invoice Lifecycle Decision Lock

### State Machine:
$$\text{DRAFT} \longrightarrow \text{ISSUED} \longrightarrow \begin{cases} \text{PARTIALLY_PAID} \longrightarrow \text{PAID} \\ \text{OVERDUE} \longrightarrow \text{WRITTEN_OFF} \\ \text{VOID} \end{cases}$$

### Immutability & Lifecycle Rules:
1. **DRAFT:** Amounts, line items, and terms can be edited by Billing Admins.
2. **ISSUED:** Permanently frozen. Line items, subtotal, tax, and total cannot be mutated.
3. **VOID:** Permitted **only if** `totalPaidAmount == 0`. Requires audit reason.
4. **PAID:** Permanently locked. Cannot be voided. Reversals must be executed via `CommercialRefund`.
5. **Zero Deletions:** Invoices cannot be deleted from the database.

---

## 11. Payment Semantics

- **Payment Attempt vs. Settled Payment:** Failed gateway attempts (`PaymentAttempt`) are logged for telemetry and debugging, but only settled funds create a formal `Payment` ledger entry.
- **Partial Payments:** Allowed. Each payment reduces `Invoice.balanceDueAmount`. Invoice moves to `PARTIALLY_PAID` until `balanceDueAmount == 0`.
- **Overpayments:** Excess payment amounts are credited to the customer's account balance as a `CommercialCredit`.

---

## 12. Credit / Refund / Adjustment Semantics

| Entity | Purpose | Financial Impact | Ledger Effect |
|---|---|---|---|
| **CommercialCredit** | Value owed to customer (retainer offset, goodwill) | Decreases customer balance due | Applied against future or open invoices |
| **CommercialRefund** | Outward money return to customer | Decreases organization cash | Linked to specific settled `Payment` |
| **CommercialAdjustment** | Write-off of uncollectible debt | Reduces receivable to \$0 | Invoice moves to `WRITTEN_OFF` |

---

## 13. Revenue Attribution Semantics

- **Operational Meaning:** CBOS tracks **Cash Collected** and **Invoiced Receivables** attributed to operational entities (`Candidate`, `Placement`, `Specialist Team`).
- **Explicit Accounting Boundary:** CBOS does **NOT** claim GAAP/IFRS revenue recognition compliance. Revenue recognition schedules, deferred revenue amortization, and general ledger postings are explicitly deferred to external accounting systems.

---

## 14. Money & Currency Decision Lock

1. **Storage Type:** Mandatory `BigInt` (or PostgreSQL `BIGINT`) representing minor currency units (e.g., 10000 = \$100.00 USD).
2. **Floating-Point Ban:** Floating-point numbers (`Float`, `Double`, `Number`) are strictly banned for money.
3. **Currency Code:** Mandatory 3-letter ISO-4217 uppercase string (e.g., `USD`, `CAD`, `EUR`, `GBP`, `INR`).
4. **Exchange Rates:** Multi-currency conversions without explicit exchange rate records are prohibited.

---

## 15. Tax Boundary Decision Lock

- **CBOS Scope:** CBOS stores `taxRateBasisPoints` (e.g., 825 = 8.25%) and calculates `taxAmountCents = (subtotalCents * taxRateBasisPoints) / 10000`.
- **Jurisdiction Filing:** Tax filing, VAT reverse charges, and government remittances are **OUT OF SCOPE** (managed in external ERP).

---

## 16. Commercial Privacy & Field-Level Security

- **Strict Separation:** Sensitive commercial fields (`feePercentage`, `invoiceTotal`, `paymentStatus`, `billingNotes`) are strictly omitted from standard Candidate DTOs, Candidate 360 views, and Specialist Workbenches.
- **Candidate View Restrictions:** Self-paying candidates can view their own invoices and payment statuses via a dedicated billing portal tab, but have zero visibility into internal margins or corporate contracts.

---

## 17. RBAC Compatibility Decision Lock

To maintain 100% compatibility with the frozen database `Role` enum (`CANDIDATE`, `EMPLOYEE`, `ADMIN`), CBOS authority is mapped as follows:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CBOS RBAC RECONCILIATION                          │
├─────────────────┬──────────────┬────────────────────────────────────────────┤
│ Prisma Role     │ Internal Tag │ CBOS Commercial Authority                  │
├─────────────────┼──────────────┼────────────────────────────────────────────┤
│ ADMIN           │ Organization │ Full authority over all CBOS operations    │
│                 │ Admin        │ (Contracts, Invoicing, Refunds, Settings)  │
├─────────────────┼──────────────┼────────────────────────────────────────────┤
│ EMPLOYEE        │ BillingAdmin │ Delegated authority to draft/issue invoices│
│                 │ (Permission) │ and record manual payments                 │
├─────────────────┼──────────────┼────────────────────────────────────────────┤
│ EMPLOYEE        │ Specialist / │ Zero access to commercial contracts,       │
│                 │ Team Lead    │ pricing, invoices, or revenue reports      │
├─────────────────┼──────────────┼────────────────────────────────────────────┤
│ CANDIDATE       │ Self         │ Read-only access to own invoices/contracts │
└─────────────────┴──────────────┴────────────────────────────────────────────┘
```

**Result:** No schema mutation of the `Role` enum is required.

---

## 18. Dual Approval Policy Decision Lock

- **Business Status:** Dual approval for refunds $> \$5,000$ is recognized as an optional enterprise policy but is **DEFERRED** from the core phase MVP.
- **Core Contract Rule:** Single Admin authorization is sufficient for Phase 10D/10E, with dual approval readiness preserved in the data model.

---

## 19. Entitlement Semantics Decision Lock

`ServiceEntitlement` governs operational resource access:
- `MAX_APPLICATIONS_PER_MONTH`: Checked during application creation.
- `SEARCH_EXPIRATION_DATE`: Halts new job matching when expired.
- `OFFER_NEGOTIATION_ENABLED`: Authorizes specialist representation in OPOS.
- Entitlement status: `ACTIVE`, `PAUSED_NONPAYMENT`, `EXPIRED`, `REVOKED`.

---

## 20. Placement Fee Eligibility Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PLACEMENT FEE ELIGIBILITY MATRIX                      │
├────────────────────────────┬────────────────────────┬───────────────────────┤
│ Operational State          │ Contract State         │ CBOS Outcome          │
├────────────────────────────┼────────────────────────┼───────────────────────┤
│ PLACEMENT_VERIFIED         │ Active Contingent CTR  │ Fee Invoiced          │
├────────────────────────────┼────────────────────────┼───────────────────────┤
│ PLACEMENT_VERIFIED         │ Expired Contract       │ Blocked (Manual Triage│
├────────────────────────────┼────────────────────────┼───────────────────────┤
│ PLACEMENT_VERIFIED         │ Pure Retainer (No Fee) │ Zero Fee Logged       │
├────────────────────────────┼────────────────────────┼───────────────────────┤
│ JOINING_FAILED / WITHDRAWN │ Any                    │ Zero Fee Invoiced     │
└────────────────────────────┴────────────────────────┴───────────────────────┘
```

---

## 21. Placement Replacement / Guarantee Policy

- **Business Policy Status:** Replacement guarantees (e.g., 90-day free candidate replacement if candidate resigns) are recognized but **DEFERRED** from automated execution.
- **Handling:** Manual credit memos and replacement contracts issued by Billing Admins.

---

## 22. OPOS Authority Boundary Verification

- **OPOS Sovereignty:** OPOS owns Offer, Negotiation, Joining, Placement Verification.
- **CBOS Sovereignty:** CBOS owns Customer, Contract, Pricing, Invoices, Payments, Refunds.
- **Zero Cross-Mutation:** CBOS never alters OPOS states; OPOS never alters CBOS balances.

---

## 23. Candidate 360 Boundary Verification

- Candidate 360 remains a strictly read-only projection.
- Only service tier name and active entitlement state are projected into the candidate view.
- Zero financial or pricing leakage.

---

## 24. Idempotency Key Architecture

Every state-altering operation in CBOS requires a deterministic idempotency key:
- `CommercialEvent`: `comm-evt-${organizationId}-${eventType}-${targetId}`
- `Invoice`: `inv-gen-${organizationId}-${commercialEventId}`
- `Payment`: `pmt-${provider}-${providerTransactionId}`
- `Refund`: `ref-${paymentId}-${providerRefundId}`

Duplicate requests with the same key return the existing record without side effects.

---

## 25. Audit & Compliance Catalog

All CBOS operations emit audit logs with `actorId`, `actorRole`, `targetEntityId`, `clientIpAddress`, and `payloadSnapshot`.

---

## 26. Contradiction Matrix

| Domain Area | Potential Issue | Severity | Resolution Status |
|---|---|:---:|---|
| **RBAC Role Enum** | Contract mentioned `BILLING_ADMIN` role | Medium | **RESOLVED:** Mapped as structural permission on `EMPLOYEE` / `ADMIN` |
| **Money Storage** | Floating-point rounding risk | Blocker | **RESOLVED:** Mandatory `BigInt` minor units (cents) |
| **OPOS Decoupling** | Placement rollback on billing failure | Blocker | **RESOLVED:** Unidirectional outbox event; non-blocking |
| **Tax Jurisdictions** | Complex automated multi-state tax filing | Low | **RESOLVED:** Explicitly deferred to external ERP |
| **Refund Reversals** | Deleting paid invoices | Blocker | **RESOLVED:** Strictly append-only `CommercialRefund` |

---

## 27. Implementation Readiness Matrix

| Component | Status | Readiness Notes |
|---|:---:|---|
| **Domain Model & Entities** | **READY** | All 10 CBOS core entities fully specified |
| **Lifecycle & State Machines** | **READY** | Invoices, Contracts, Payments state machines locked |
| **Money & Precision Semantics** | **READY** | `BigInt` integer cents and ISO-4217 standard |
| **Placement Event Integration** | **READY** | Decoupled event payload and outbox pattern locked |
| **RBAC & Security Model** | **READY** | 100% compatible with existing Prisma `Role` enum |
| **PostgreSQL RLS Strategy** | **READY** | Organization isolation via `organization_id` RLS |
| **Audit & Idempotency** | **READY** | Centralized audit integration and deterministic keys |

---

## 28. Open Business Decisions

1. Exact default payment term days (`Net 15` vs `Net 30`) per client contract. *(Configurable per contract).*
2. Final list of supported external payment gateways in production (Stripe vs Razorpay vs Wire). *(Addressed via Provider SPI).*

---

## 29. Frozen Decisions

- `DEC-10C-01`: Candidate identity and CustomerAccount remain strictly separate tables.
- `DEC-10C-02`: All monetary amounts stored as `BigInt` minor currency units (cents).
- `DEC-10C-03`: OPOS placement verification is completely decoupled from CBOS invoicing via transactional outbox.
- `DEC-10C-04`: Invoices are strictly immutable once transitioned to `ISSUED`.
- `DEC-10C-05`: RBAC uses existing `Role` enum (`CANDIDATE`, `EMPLOYEE`, `ADMIN`) with structural capability checks.

---

## 30. Deferred Decisions

1. Automated multi-jurisdiction tax filing engine (Deferred).
2. Double-entry general ledger bookkeeping (Deferred to QuickBooks/NetSuite).
3. Automated AI pricing negotiation (Deferred).
4. Dual-approval workflows for refunds $> \$5,000$ (Deferred).

---

## 31. Final Verdict & Acceptance Gate

```
==================================================
PHASE 10C STATUS:
COMPLETE / ACCEPTED / FROZEN

DOMAIN:
COMMERCIAL & BILLING OPERATING SYSTEM (CBOS)

FORENSIC DECISION LOCK:
ALL BOUNDARIES, CONTRACTS, LIFECYCLES, AND MONEY SEMANTICS LOCKED.
ZERO CRITICAL CONTRADICTIONS.
READY FOR DATA MODEL PERSISTENCE SPECIFICATION (PHASE 10D).

IMPLEMENTATION AUTHORIZATION:
NOT YET AUTHORIZED
==================================================
```
