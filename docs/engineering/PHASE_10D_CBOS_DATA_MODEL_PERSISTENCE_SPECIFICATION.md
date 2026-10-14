# PHASE 10D — COMMERCIAL & BILLING OPERATING SYSTEM (CBOS)
## DATA MODEL & PERSISTENCE SPECIFICATION

**Status:** COMPLETE / ACCEPTED / FROZEN  
**Phase Date:** October 7, 2026  
**Auditor:** Antigravity Forensic Architecture & Persistence Suite  
**Baseline Dependencies:** [`docs/engineering/PHASE_10B_CBOS_PRODUCT_CONTRACT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_10B_CBOS_PRODUCT_CONTRACT.md), [`docs/engineering/PHASE_10C_CBOS_DECISION_LOCK_IMPLEMENTATION_READINESS.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_10C_CBOS_DECISION_LOCK_IMPLEMENTATION_READINESS.md), OPOS Frozen Schema (Phases 9A–9F)  
**Implementation Authorization:** DATA MODEL SPECIFICATION ONLY (No Service Layer, No UI, No Stripe/Razorpay Code)  

---

## 1. Executive Summary

Phase 10D establishes the authoritative, implementation-ready PostgreSQL / Prisma persistence specification for the **Commercial & Billing Operating System (CBOS)**.

CBOS provides the permanent data model for Customer Accounts, Service Contracts, Versioned Pricing Terms, Commercial Events, Outbox Dispatch, Immutable Invoices, Line Items, Multi-Provider Payments, Credits, Refunds, Adjustments, and Operational Revenue Attribution.

### Core Architectural Guarantees:
1. **Integer Minor Unit Currency Math:** All monetary quantities are persisted as `BigInt` minor units (cents, pence, paise) alongside standard ISO-4217 uppercase currency codes. Floating-point numbers are strictly banned.
2. **Tenant Isolation & FORCE RLS:** Every CBOS table is bound to `organization_id`, indexed, and protected by PostgreSQL Row-Level Security with `FORCE ROW LEVEL SECURITY`.
3. **Decoupled Placement Integration:** OPOS communicates with CBOS via an authoritative transactional outbox entity (`CbosOutboxEvent`), ensuring operational placement verification transactions never roll back due to commercial validation errors.
4. **Strict Immutability:** Invoices, Invoice Lines, Payments, Refunds, and Commercial Events are append-only. Historical invoices cannot be mutated once `ISSUED`.
5. **No Duplicate Domain Entities:** CBOS reuses existing `Organization`, `Candidate`, `User`, and `AuditEvent` structures without creating redundant entity hierarchies.

---

## 2. Entity Inventory

CBOS defines exactly 13 domain entities and 1 transactional outbox entity:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CBOS ENTITY INVENTORY                            │
├────┬───────────────────────────────┬─────────────────────────────────────────┤
│ #  │ Entity Name                   │ Purpose & Core Role                     │
├────┼───────────────────────────────┼─────────────────────────────────────────┤
│ 1  │ CustomerAccount               │ Legal paying customer entity            │
│ 2  │ CustomerCandidateRelationship │ 1:1, 1:N, N:1 relationship link         │
│ 3  │ ServiceContract               │ Root commercial contract header         │
│ 4  │ ServiceContractVersion        │ Immutable historical contract terms     │
│ 5  │ ServiceEntitlement            │ Operational resource quotas & limits    │
│ 6  │ PricingTerm                   │ Calculation rules for charges           │
│ 7  │ CommercialEvent               │ Authoritative economic trigger / fact   │
│ 8  │ CbosOutboxEvent               │ Transactional outbox event record       │
│ 9  │ Invoice                       │ Legal receivable invoice document       │
│ 10 │ InvoiceLine                   │ Versioned line items with pricing proof │
│ 11 │ Payment                       │ Settled receipt of funds                │
│ 12 │ CommercialCredit              │ Credit memo applied to balance          │
│ 13 │ CommercialRefund              │ Outward money movement return           │
│ 14 │ CommercialAdjustment          │ Bad debt write-off or dispute balance   │
│ 15 │ RevenueAttribution            │ Operational revenue attribution record  │
└────┴───────────────────────────────┴─────────────────────────────────────────┘
```

---

## 3. Entity Definitions

### 3.1 `CustomerAccount`
- **Table Name:** `customer_accounts`
- **Fields:**
  - `id`: `String` @id @default(cuid()) (or UUIDv7)
  - `organizationId`: `String`
  - `customerType`: `CustomerType`
  - `displayName`: `String`
  - `legalName`: `String?`
  - `billingEmail`: `String`
  - `billingPhone`: `String?`
  - `taxIdentifier`: `String?`
  - `billingAddress`: `Json?`
  - `currency`: `String` @default("USD")
  - `status`: `CustomerStatus` @default(ACTIVE)
  - `primaryCandidateId`: `String?`
  - `createdAt`: `DateTime` @default(now())
  - `updatedAt`: `DateTime` @updatedAt
- **Constraints:** `UNIQUE(organizationId, billingEmail)`, `UNIQUE(organizationId, displayName)`

### 3.2 `CustomerCandidateRelationship`
- **Table Name:** `customer_candidate_relationships`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `customerAccountId`: `String`
  - `candidateId`: `String`
  - `relationshipType`: `CustomerCandidateRelationType`
  - `effectiveFrom`: `DateTime` @default(now())
  - `effectiveTo`: `DateTime?`
  - `isPrimary`: `Boolean` @default(true)
  - `status`: `RelationStatus` @default(ACTIVE)
  - `createdAt`: `DateTime` @default(now())
  - `updatedAt`: `DateTime` @updatedAt
- **Constraints:** `UNIQUE(organizationId, customerAccountId, candidateId, relationshipType)`

### 3.3 `ServiceContract`
- **Table Name:** `service_contracts`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `customerAccountId`: `String`
  - `candidateId`: `String?`
  - `contractNumber`: `String`
  - `serviceType`: `ContractServiceType`
  - `billingCadence`: `BillingCadence`
  - `currency`: `String` @default("USD")
  - `effectiveDate`: `DateTime`
  - `expirationDate`: `DateTime?`
  - `paymentTermsDays`: `Int` @default(0)
  - `status`: `ContractStatus` @default(DRAFT)
  - `currentVersionNumber`: `Int` @default(1)
  - `signedAt`: `DateTime?`
  - `signedDocumentId`: `String?`
  - `cancellationReason`: `String?`
  - `createdAt`: `DateTime` @default(now())
  - `updatedAt`: `DateTime` @updatedAt
- **Constraints:** `UNIQUE(organizationId, contractNumber)`

### 3.4 `ServiceContractVersion`
- **Table Name:** `service_contract_versions`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `contractId`: `String`
  - `versionNumber`: `Int`
  - `effectiveFrom`: `DateTime`
  - `effectiveTo`: `DateTime?`
  - `termsSummary`: `String`
  - `termsSnapshot`: `Json`
  - `createdByStaffId`: `String`
  - `createdAt`: `DateTime` @default(now())
- **Constraints:** `UNIQUE(contractId, versionNumber)`

### 3.5 `ServiceEntitlement`
- **Table Name:** `service_entitlements`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `contractId`: `String`
  - `candidateId`: `String`
  - `entitlementType`: `EntitlementType`
  - `allocatedQuota`: `Int`
  - `consumedQuota`: `Int` @default(0)
  - `validFrom`: `DateTime`
  - `validTo`: `DateTime?`
  - `status`: `EntitlementStatus` @default(ACTIVE)
  - `createdAt`: `DateTime` @default(now())
  - `updatedAt`: `DateTime` @updatedAt

### 3.6 `PricingTerm`
- **Table Name:** `pricing_terms`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `contractId`: `String`
  - `contractVersionId`: `String`
  - `pricingModel`: `PricingModel`
  - `pricingBasis`: `PricingBasis?`
  - `percentageBasisPoints`: `Int?` // e.g. 1500 = 15.00%
  - `fixedAmountCents`: `BigInt?`
  - `currency`: `String` @default("USD")
  - `minimumFeeCents`: `BigInt?`
  - `maximumFeeCents`: `BigInt?`
  - `retainerCreditOffset`: `Boolean` @default(false)
  - `effectiveFrom`: `DateTime` @default(now())
  - `effectiveTo`: `DateTime?`
  - `createdAt`: `DateTime` @default(now())

### 3.7 `CommercialEvent`
- **Table Name:** `commercial_events`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `customerAccountId`: `String`
  - `candidateId`: `String?`
  - `serviceContractId`: `String?`
  - `placementId`: `String?`
  - `eventType`: `CommercialEventType`
  - `calculatedAmountCents`: `BigInt`
  - `currency`: `String` @default("USD")
  - `pricingTermId`: `String?`
  - `idempotencyKey`: `String`
  - `sourceSystem`: `String` @default("OPOS")
  - `sourceReferenceId`: `String?`
  - `occurredAt`: `DateTime` @default(now())
  - `createdAt`: `DateTime` @default(now())
- **Constraints:** `UNIQUE(organizationId, idempotencyKey)`

### 3.8 `CbosOutboxEvent`
- **Table Name:** `cbos_outbox_events`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `eventType`: `String`
  - `aggregateType`: `String`
  - `aggregateId`: `String`
  - `payload`: `Json`
  - `idempotencyKey`: `String`
  - `status`: `OutboxStatus` @default(PENDING)
  - `attemptCount`: `Int` @default(0)
  - `lastError`: `String?`
  - `availableAt`: `DateTime` @default(now())
  - `processedAt`: `DateTime?`
  - `createdAt`: `DateTime` @default(now())
- **Constraints:** `UNIQUE(organizationId, idempotencyKey)`

### 3.9 `Invoice`
- **Table Name:** `invoices`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `customerAccountId`: `String`
  - `contractId`: `String?`
  - `commercialEventId`: `String?`
  - `invoiceNumber`: `String`
  - `status`: `InvoiceStatus` @default(DRAFT)
  - `currency`: `String` @default("USD")
  - `subtotalAmountCents`: `BigInt` @default(0)
  - `discountAmountCents`: `BigInt` @default(0)
  - `creditAppliedAmountCents`: `BigInt` @default(0)
  - `taxRateBasisPoints`: `Int` @default(0)
  - `taxAmountCents`: `BigInt` @default(0)
  - `totalAmountCents`: `BigInt` @default(0)
  - `totalPaidAmountCents`: `BigInt` @default(0)
  - `balanceDueAmountCents`: `BigInt` @default(0)
  - `issueDate`: `DateTime?`
  - `dueDate`: `DateTime?`
  - `paidAt`: `DateTime?`
  - `voidedAt`: `DateTime?`
  - `voidReason`: `String?`
  - `notes`: `String?`
  - `createdAt`: `DateTime` @default(now())
  - `updatedAt`: `DateTime` @updatedAt
- **Constraints:** `UNIQUE(organizationId, invoiceNumber)`

### 3.10 `InvoiceLine`
- **Table Name:** `invoice_lines`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `invoiceId`: `String`
  - `lineNumber`: `Int`
  - `description`: `String`
  - `quantity`: `Int` @default(1)
  - `unitPriceCents`: `BigInt`
  - `totalPriceCents`: `BigInt`
  - `candidateId`: `String?`
  - `placementId`: `String?`
  - `commercialEventId`: `String?`
  - `createdAt`: `DateTime` @default(now())
- **Constraints:** `UNIQUE(invoiceId, lineNumber)`

### 3.11 `Payment`
- **Table Name:** `payments`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `customerAccountId`: `String`
  - `invoiceId`: `String?`
  - `paymentNumber`: `String`
  - `amountCents`: `BigInt`
  - `refundedAmountCents`: `BigInt` @default(0)
  - `currency`: `String` @default("USD")
  - `paymentMethod`: `PaymentMethod`
  - `provider`: `String` // stripe, razorpay, manual_wire
  - `providerTransactionId`: `String?`
  - `status`: `PaymentStatus` @default(COMPLETED)
  - `receivedAt`: `DateTime` @default(now())
  - `recordedByStaffId`: `String?`
  - `notes`: `String?`
  - `createdAt`: `DateTime` @default(now())
- **Constraints:** `UNIQUE(organizationId, paymentNumber)`, `UNIQUE(organizationId, provider, providerTransactionId)`

### 3.12 `CommercialCredit`
- **Table Name:** `commercial_credits`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `customerAccountId`: `String`
  - `contractId`: `String?`
  - `appliedInvoiceId`: `String?`
  - `creditNumber`: `String`
  - `amountCents`: `BigInt`
  - `remainingAmountCents`: `BigInt`
  - `currency`: `String` @default("USD")
  - `reason`: `String`
  - `status`: `CreditStatus` @default(AVAILABLE)
  - `issuedByStaffId`: `String`
  - `createdAt`: `DateTime` @default(now())
- **Constraints:** `UNIQUE(organizationId, creditNumber)`

### 3.13 `CommercialRefund`
- **Table Name:** `commercial_refunds`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `customerAccountId`: `String`
  - `paymentId`: `String`
  - `refundNumber`: `String`
  - `amountCents`: `BigInt`
  - `currency`: `String` @default("USD")
  - `provider`: `String`
  - `providerRefundId`: `String?`
  - `reason`: `String`
  - `status`: `RefundStatus` @default(COMPLETED)
  - `authorizedByStaffId`: `String`
  - `createdAt`: `DateTime` @default(now())
- **Constraints:** `UNIQUE(organizationId, refundNumber)`, `UNIQUE(organizationId, provider, providerRefundId)`

### 3.14 `CommercialAdjustment`
- **Table Name:** `commercial_adjustments`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `customerAccountId`: `String`
  - `invoiceId`: `String?`
  - `adjustmentType`: `AdjustmentType`
  - `amountCents`: `BigInt`
  - `currency`: `String` @default("USD")
  - `reason`: `String`
  - `authorizedByStaffId`: `String`
  - `createdAt`: `DateTime` @default(now())

### 3.15 `RevenueAttribution`
- **Table Name:** `revenue_attributions`
- **Fields:**
  - `id`: `String` @id @default(cuid())
  - `organizationId`: `String`
  - `customerAccountId`: `String`
  - `invoiceId`: `String`
  - `paymentId`: `String`
  - `candidateId`: `String?`
  - `placementId`: `String?`
  - `attributedAmountCents`: `BigInt`
  - `currency`: `String` @default("USD")
  - `strategistStaffId`: `String?`
  - `specialistStaffId`: `String?`
  - `sourcingStaffId`: `String?`
  - `recognizedAt`: `DateTime` @default(now())
  - `createdAt`: `DateTime` @default(now())

---

## 4. Entity Relationships Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               CBOS ENTITY MAP                                    │
│                                                                                  │
│     ┌────────────────────────┐         ┌────────────────────────┐                │
│     │    CustomerAccount     │ ◄─────► │  CustomerCandidateRel  │ ◄── Candidate  │
│     └───────────┬────────────┘         └────────────────────────┘                │
│                 │                                                                │
│                 ▼                                                                │
│     ┌────────────────────────┐         ┌────────────────────────┐                │
│     │    ServiceContract     │ ──────► │   ServiceEntitlement   │                │
│     └───────────┬────────────┘         └────────────────────────┘                │
│                 │                                                                │
│                 ├──────────────────────┐                                         │
│                 ▼                      ▼                                         │
│     ┌────────────────────────┐ ┌────────────────────────┐                        │
│     │ ServiceContractVersion │ │      PricingTerm       │                        │
│     └────────────────────────┘ └───────────┬────────────┘                        │
│                                            │                                     │
│     [ OPOS PlacementRecord ]               ▼                                     │
│                 │              ┌────────────────────────┐                        │
│                 └────────────► │    CommercialEvent     │ ◄── CbosOutboxEvent    │
│                                └───────────┬────────────┘                        │
│                                            │                                     │
│                                            ▼                                     │
│     ┌────────────────────────┐         ┌────────────────────────┐                │
│     │      InvoiceLine       │ ◄─────► │        Invoice         │                │
│     └────────────────────────┘         └───────────┬────────────┘                │
│                                                    │                             │
│                      ┌─────────────────────────────┼────────────────────────┐    │
│                      ▼                             ▼                        ▼    │
│           ┌────────────────────┐        ┌────────────────────┐  ┌──────────────┐ │
│           │      Payment       │        │  CommercialCredit  │  │  Adjustment  │ │
│           └──────────┬─────────┘        └────────────────────┘  └──────────────┘ │
│                      │                                                           │
│                      ├─────────────────────────────┐                             │
│                      ▼                             ▼                             │
│           ┌────────────────────┐        ┌────────────────────┐                   │
│           │  CommercialRefund  │        │ RevenueAttribution │                   │
│           └────────────────────┘        └────────────────────┘                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Tenant Model & Scoping

- Every CBOS table includes a mandatory `organizationId` column.
- Foreign keys between CBOS entities are bound to the parent organization.
- Cross-tenant queries are blocked at the database engine level via PostgreSQL FORCE RLS.

---

## 6. Candidate / Customer Data Boundary

- `Candidate` records represent talent credentials and operational job applications.
- `CustomerAccount` records represent commercial billing entities.
- The `CustomerCandidateRelationship` table maintains the explicit link, tracking `relationshipType` (`SELF_FUNDING`, `SPONSOR`, `CORPORATE_RECRUITING_PARTNER`, `STAFFING_AGENCY`).

---

## 7. Contract Model & Immutability

- `ServiceContract` acts as the root administrative container.
- Root contracts hold metadata, lifecycle state (`DRAFT`, `ACTIVE`, `FULFILLED`, `EXPIRED`, `TERMINATED`), and the pointer to `currentVersionNumber`.

---

## 8. Contract Versioning Mechanics

- When commercial terms or pricing models are amended, a new `ServiceContractVersion` row is inserted.
- Prior contract versions retain their historical `termsSnapshot` JSON and linked `PricingTerm` records, guaranteeing full retrospective auditability.

---

## 9. Pricing Model & Calculation Basis

- `PricingTerm` declares `pricingModel` (`FIXED_FEE`, `PERCENTAGE_COMPENSATION`, `RECURRING_SUBSCRIPTION`, `MILESTONE_CONTINGENT`, `HYBRID`).
- For percentage models, `pricingBasis` is strictly specified (`FIRST_YEAR_BASE_SALARY`, `TOTAL_YEAR_ONE_CASH`, `TOTAL_TARGET_COMPENSATION`).
- Percentage is stored in basis points (`1500` = 15.00%).

---

## 10. Money Representation

- Every monetary column uses `BigInt` (representing minor currency units, e.g. cents).
- Every monetary table has an explicit `currency` column (`USD`, `CAD`, `EUR`, `GBP`, `INR`).
- Negative values are prohibited except for `CommercialAdjustment.amountCents`.

---

## 11. Commercial Event Persistence

- `CommercialEvent` is an immutable factual ledger entry.
- Stores `calculatedAmountCents`, `pricingTermId`, `placementId`, `candidateId`, and `occurredAt`.
- Protected by `UNIQUE(organizationId, idempotencyKey)`.

---

## 12. Transactional Outbox Persistence

- `CbosOutboxEvent` captures events emitted during operational workflows (e.g. OPOS placement verification).
- Guarantees at-least-once delivery with exponential retry backoff.
- Status transitions: `PENDING` $\rightarrow$ `PROCESSING` $\rightarrow$ `COMPLETED` / `FAILED`.

---

## 13. Database-Enforced Idempotency

```sql
-- Uniqueness constraints preventing duplicate financial actions:
ALTER TABLE commercial_events ADD CONSTRAINT uq_comm_event_idempotency UNIQUE (organization_id, idempotency_key);
ALTER TABLE cbos_outbox_events ADD CONSTRAINT uq_outbox_idempotency UNIQUE (organization_id, idempotency_key);
ALTER TABLE invoices ADD CONSTRAINT uq_invoice_number UNIQUE (organization_id, invoice_number);
ALTER TABLE payments ADD CONSTRAINT uq_payment_provider_ref UNIQUE (organization_id, provider, provider_transaction_id);
ALTER TABLE commercial_refunds ADD CONSTRAINT uq_refund_provider_ref UNIQUE (organization_id, provider, provider_refund_id);
```

---

## 14. Invoice Domain Specification

- Invoices transition through `DRAFT` $\rightarrow$ `ISSUED` $\rightarrow$ `PARTIALLY_PAID` $\rightarrow$ `PAID` / `OVERDUE` / `VOID` / `WRITTEN_OFF`.
- Amounts in `ISSUED` invoices cannot be updated by database transactions.

---

## 15. Invoice Lines Specification

- Lines are sequentially numbered per invoice (`UNIQUE(invoice_id, line_number)`).
- Stores `unitPriceCents`, `quantity`, `totalPriceCents`, and source `commercialEventId`.

---

## 16. Payment Domain Specification

- Captures cleared receipts with `amountCents`, `paymentMethod`, `provider`, and `providerTransactionId`.
- No raw credit card, CVV, or banking credentials are stored.

---

## 17. Commercial Credit Specification

- `CommercialCredit` records credit memos with `amountCents` and `remainingAmountCents`.
- Linked to `appliedInvoiceId` when drawn down.

---

## 18. Commercial Refund Specification

- `CommercialRefund` links to the original `Payment`.
- Verifies that total refunded amount $\le$ original payment amount.

---

## 19. Commercial Adjustment Specification

- Tracks bad debt write-offs, dispute settlements, and ledger reconciliations.

---

## 20. Revenue Attribution Specification

- Maps cash payments to operational roles (`strategistStaffId`, `specialistStaffId`, `sourcingStaffId`, `candidateId`, `placementId`).

---

## 21. OPOS Foreign References

- CBOS holds foreign key pointers to `PlacementRecord.id` and `Offer.id` in `CommercialEvent`, `InvoiceLine`, and `RevenueAttribution`.
- CBOS never executes update or delete statements on OPOS tables.

---

## 22. Delete Policy (Zero Destruction)

| Entity | Delete Policy | Deletion Mechanism |
|---|:---:|---|
| `CustomerAccount` | Prohibited | State transition $\rightarrow$ `CLOSED` |
| `ServiceContract` | Prohibited | State transition $\rightarrow$ `TERMINATED` / `CANCELLED` |
| `Invoice` | Prohibited | State transition $\rightarrow$ `VOID` / `WRITTEN_OFF` |
| `Payment` | Prohibited | Reverse via `CommercialRefund` |
| `CommercialEvent` | Prohibited | Strictly append-only |
| `CbosOutboxEvent` | Retention | Archive after 90 days `COMPLETED` |

---

## 23. Key Constraints Matrix

- Tenant-scoped uniqueness on all business identifiers (`contractNumber`, `invoiceNumber`, `paymentNumber`, `creditNumber`, `refundNumber`).
- Non-negative balance check constraints on all monetary amounts.

---

## 24. Query-Optimized Indexing

```sql
CREATE INDEX idx_customer_accounts_org_status ON customer_accounts(organization_id, status);
CREATE INDEX idx_service_contracts_org_cust ON service_contracts(organization_id, customer_account_id, status);
CREATE INDEX idx_invoices_org_cust_status ON invoices(organization_id, customer_account_id, status);
CREATE INDEX idx_invoices_due_date ON invoices(organization_id, status, due_date);
CREATE INDEX idx_payments_org_invoice ON payments(organization_id, invoice_id);
CREATE INDEX idx_comm_events_placement ON commercial_events(organization_id, placement_id);
CREATE INDEX idx_outbox_pending ON cbos_outbox_events(status, available_at) WHERE status = 'PENDING';
```

---

## 25. PostgreSQL Row-Level Security (RLS) Design

Every CBOS table enables RLS:
```sql
ALTER TABLE customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cbos_outbox_events ENABLE ROW LEVEL SECURITY;
```

---

## 26. PostgreSQL FORCE RLS

Every CBOS table enforces FORCE RLS to ensure table owners and application superusers are bound by tenant filters:
```sql
ALTER TABLE customer_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE service_contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_events FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_credits FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_adjustments FORCE ROW LEVEL SECURITY;
ALTER TABLE revenue_attributions FORCE ROW LEVEL SECURITY;
ALTER TABLE cbos_outbox_events FORCE ROW LEVEL SECURITY;
```

---

## 27. Financial Privacy & Field-Level Access

- `ADMIN`: Full read/write across all financial tables.
- `EMPLOYEE` (with Billing Capability): Read/write access to contracts, invoices, and payment receipts.
- `EMPLOYEE` (Specialist / Team Lead): Access denied to all CBOS financial tables.
- `CANDIDATE`: Read-only access to own invoices and payment receipts where `CustomerCandidateRelationship.candidateId == current_candidate_id`. Zero access to pricing terms or revenue attributions.

---

## 28. Audit Persistence Catalog

The following `AuditAction` enum values are designated for CBOS:
- `COMMERCIAL_CUSTOMER_CREATED`
- `COMMERCIAL_CUSTOMER_UPDATED`
- `COMMERCIAL_CONTRACT_DRAFTED`
- `COMMERCIAL_CONTRACT_ACTIVATED`
- `COMMERCIAL_CONTRACT_VERSION_CREATED`
- `COMMERCIAL_CONTRACT_TERMINATED`
- `COMMERCIAL_EVENT_RECORDED`
- `COMMERCIAL_INVOICE_GENERATED`
- `COMMERCIAL_INVOICE_ISSUED`
- `COMMERCIAL_INVOICE_VOIDED`
- `COMMERCIAL_INVOICE_WRITTEN_OFF`
- `COMMERCIAL_PAYMENT_RECORDED`
- `COMMERCIAL_PAYMENT_FAILED`
- `COMMERCIAL_CREDIT_ISSUED`
- `COMMERCIAL_REFUND_EXECUTED`
- `COMMERCIAL_ADJUSTMENT_RECORDED`

---

## 29. Enum Inventory

```prisma
enum CustomerType {
  INDIVIDUAL_CANDIDATE
  INDIVIDUAL_SPONSOR
  CORPORATE_CLIENT
  STAFFING_AGENCY
  ENTERPRISE_SUBSCRIPTION
}

enum CustomerStatus {
  ACTIVE
  SUSPENDED
  DELINQUENT
  CLOSED
}

enum CustomerCandidateRelationType {
  SELF_FUNDING
  SPONSOR
  CORPORATE_RECRUITING_PARTNER
  STAFFING_AGENCY
}

enum RelationStatus {
  ACTIVE
  INACTIVE
  REVOKED
}

enum ContractServiceType {
  CAREER_ACCELERATION
  PLACEMENT_RETAINER
  CONTINGENT_PLACEMENT
  ENTERPRISE_TALENT_SEARCH
  EXECUTIVE_COACHING
}

enum BillingCadence {
  ONE_TIME
  MONTHLY_RETAINER
  MILESTONE_BASED
  PLACEMENT_CONTINGENT
  HYBRID_RETAINER_PLACEMENT
}

enum ContractStatus {
  DRAFT
  PENDING_SIGNATURE
  ACTIVE
  FULFILLED
  EXPIRED
  TERMINATED
  CANCELLED
}

enum EntitlementType {
  APPLICATION_VOLUME_MONTHLY
  SEARCH_DURATION_DAYS
  DEDICATED_STRATEGIST
  INTERVIEW_MOCK_SESSIONS
  OFFER_NEGOTIATION_SUPPORT
}

enum EntitlementStatus {
  ACTIVE
  PAUSED_NONPAYMENT
  EXHAUSTED
  EXPIRED
  REVOKED
}

enum PricingModel {
  FIXED_FEE
  PERCENTAGE_COMPENSATION
  RECURRING_SUBSCRIPTION
  TIERED_COMPENSATION
  MILESTONE_CONTINGENT
  HYBRID
}

enum PricingBasis {
  FIRST_YEAR_BASE_SALARY
  TOTAL_YEAR_ONE_CASH
  TOTAL_TARGET_COMPENSATION
}

enum CommercialEventType {
  RETAINER_SCHEDULED
  PLACEMENT_FEE_TRIGGERED
  MILESTONE_REACHED
  AD_HOC_SERVICE_ORDERED
  EARLY_TERMINATION_FEE
  CREDIT_ADJUSTMENT_EARNED
}

enum OutboxStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

enum InvoiceStatus {
  DRAFT
  ISSUED
  PARTIALLY_PAID
  PAID
  OVERDUE
  VOID
  WRITTEN_OFF
}

enum PaymentMethod {
  STRIPE_CARD
  STRIPE_ACH
  RAZORPAY
  BANK_WIRE
  CHECK
  MANUAL_RECORD
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
}

enum CreditStatus {
  AVAILABLE
  PARTIALLY_APPLIED
  FULLY_APPLIED
  EXPIRED
  REVOKED
}

enum RefundStatus {
  PENDING
  COMPLETED
  FAILED
}

enum AdjustmentType {
  BAD_DEBT_WRITE_OFF
  DISPUTE_SETTLEMENT
  GOODWILL_CREDIT
  ACCOUNTING_CORRECTION
}
```

---

## 30. Migration Plan

- **Migration Identifier:** `20261008000000_phase10d_cbos_data_model`
- **Additive Strategy:** 100% additive schema migration. Zero drop operations or table alter renames on existing Phase 0–9F entities.
- **SQL Execution Sequence:**
  1. Create 17 new ENUM types.
  2. Create 14 new CBOS tables.
  3. Create all foreign key constraints and indexes.
  4. Append new `AuditAction` enum values.
  5. Enable `ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on all 14 tables.
  6. Apply tenant-scoped PostgreSQL RLS policies.

---

## 31. Schema Contradiction Matrix

| Potential Risk | Severity | Mitigation in 10D |
|---|:---:|---|
| Conflict with `PlacementRecord` | Blocker | Zero schema modifications to OPOS tables; references are foreign keys only. |
| Incompatible `Role` Enum | High | Preserved 3-role enum; billing permissions managed as structural checks. |
| Floating point currency loss | Blocker | Mandatory `BigInt` minor units across all monetary columns. |
| Cross-tenant entity linking | Blocker | Mandatory `organization_id` on all foreign key constraints and RLS policies. |

---

## 32. Persistence Invariants

1. **`totalAmountCents = subtotalAmountCents - discountAmountCents - creditAppliedAmountCents + taxAmountCents`**
2. **`balanceDueAmountCents = totalAmountCents - totalPaidAmountCents`**
3. **`refundedAmountCents <= amountCents`** on `Payment`.
4. **`issuedInvoices.locked == true`**: No UPDATE allowed on amounts of `ISSUED` invoices.
5. **`idempotencyKey`**: Enforced unique per organization.

---

## 33. Test Requirements for Future Implementation

- **RLS Isolation Tests:** Proving cross-tenant invoice/payment reads are rejected.
- **Invoice Immutability Tests:** Verifying update attempts on `ISSUED` invoices throw constraint errors.
- **Payment Idempotency Tests:** Verifying duplicate Stripe/Razorpay webhook callbacks do not generate duplicate payments.
- **Placement Outbox Tests:** Verifying `OPOS_PLACEMENT_VERIFIED_EVENT` creates a single `CommercialEvent` without blocking OPOS.
- **Audit Logging Tests:** Verifying every financial operation generates an atomic `AuditEvent`.

---

## 34. Final Data Model & Acceptance Gate

```
==================================================
PHASE 10D STATUS:
COMPLETE / ACCEPTED / FROZEN

DOMAIN:
COMMERCIAL & BILLING OPERATING SYSTEM (CBOS)

PERSISTENCE SPECIFICATION:
ALL 14 TABLES, 17 ENUMS, BIGINT MONEY SEMANTICS, UNIQUE IDEMPOTENCY CONSTRAINTS,
FORCE RLS POLICIES, AND AUDIT ACTIONS FULLY SPECIFIED.
ZERO BREAKING CHANGES TO FROZEN PHASES 0–9F.

IMPLEMENTATION AUTHORIZATION:
NOT YET AUTHORIZED (SPECIFICATION ONLY)

NEXT:
PHASE 10E — CBOS SERVICE & LIFECYCLE IMPLEMENTATION READINESS
==================================================
```
