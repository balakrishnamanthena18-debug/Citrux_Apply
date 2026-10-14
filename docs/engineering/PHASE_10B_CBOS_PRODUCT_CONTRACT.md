# PHASE 10B — COMMERCIAL & BILLING OPERATING SYSTEM (CBOS)
## PRODUCT CONTRACT & DOMAIN AUTHORITY LOCK

**Status:** COMPLETE / ACCEPTED / FROZEN  
**Phase Date:** October 7, 2026  
**Authoritative Scope:** Domain Contract & Authority Specification Only  
**Implementation Authorization:** NOT AUTHORIZED (Contract Design Only — Zero Code, Zero Migrations, Zero UI)  
**Foundational Dependencies Frozen:** Phase 0–9F (Talent Delivery Engine & OPOS), Phase 10A (Business Value & Gap Forensic Audit)  

---

## 1. Executive Summary

Following the forensic audit in **Phase 10A**, which proved that OOS has a complete talent execution pipeline (Phases 0–9F) but suffers from 100% commercial blindness, **Phase 10B establishes the authoritative Product Contract for the Commercial & Billing Operating System (CBOS)**.

CBOS is the operational commercial record and revenue engine for OOS. It governs how the company models paying customers, defines legally binding service contracts, tracks service entitlements, triggers commercial fee events (such as placement success fees or monthly retainers), generates auditable versioned invoices, records multi-provider payment receipts, processes credits/refunds, and attributes realized revenue to candidates, placements, and specialist teams.

### Core Tenets of Phase 10B:
1. **Candidate $\neq$ Customer:** A Candidate is a human talent being served; a Customer is a commercial entity (individual, corporate sponsor, employer partner, or guarantor) that holds a legal billing relationship with the organization.
2. **Operational Placement $\neq$ Automatic Revenue:** A verified placement in OPOS (`PlacementRecord`) does not automatically generate money or invoices unless governed by an active `ServiceContract` with an authorized `PricingTerm`.
3. **Salary $\neq$ Revenue:** A candidate's $200,000 offer compensation is an operational talent attribute; the company's fee is a mathematically calculated, contractually defined receivable ($20,000–$40,000) locked in an authoritative `CommercialEvent` and `Invoice`.
4. **Append-Only Financial Truth:** Historical invoices, line items, and payment receipts are strictly immutable. Adjustments, discounts, credits, and refunds are recorded as atomic append-only ledger entries with forward-balancing pointers.
5. **Separation of Operational Authority vs. Financial Settlement:** External payment gateways (Stripe, Razorpay, Bank Wire) execute money movement, but OOS/CBOS remains the absolute operational system of record for commercial entitlement, contract status, and invoice state.

---

## 2. Problem Definition

### The Operational Problem:
Prior to CBOS, the talent delivery engine in OOS operated in a complete commercial vacuum:
- **Zero Customer Awareness:** OOS had no entity representing the payer or contract terms.
- **Disconnected Placement Fees:** When OPOS verified a high-value placement, billing managers had to manually copy candidate names and compensation numbers into external spreadsheets, calculate fees by hand, and manually draft invoices in external accounting software.
- **Revenue Leakage:** Retainer subscription renewals, milestone payments, and Day 30/90 placement fee installments were tracked in personal notes or spreadsheets, risking unbilled fees and uncollected receivables.
- **Entitlement Drift:** Specialists provided career search and application execution services to candidates whose contracts had expired or whose retainer invoices were overdue, because OOS lacked a commercial entitlement guard.

### The CBOS Solution:
CBOS provides a unified, deterministic, and auditable commercial operating model that connects directly with OPOS, Candidate Identity, and Task Workflows without violating domain boundaries or leaking sensitive financial data.

---

## 3. Commercial Domain Boundary

CBOS sits alongside the Talent Delivery Engine and the Workforce Operations layer, interacting strictly via explicit boundary contracts:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             TALENT DELIVERY ENGINE                               │
│  [Candidate Profile] ──► [Job Matches] ──► [Applications] ──► [Interviews]      │
│                                                                      │           │
│                                                                      ▼           │
│                                                    [OPOS Verified Placement]     │
└───────────────────────────────────────────────┬──────────────────────┬───────────┘
                                                │ Candidate Reference  │ Verified Placement
                                                ▼                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   COMMERCIAL & BILLING OPERATING SYSTEM (CBOS)                   │
│                                                                                  │
│  ┌───────────────────┐      ┌────────────────────┐      ┌─────────────────────┐  │
│  │  CustomerAccount  │ ───► │  ServiceContract   │ ───► │ ServiceEntitlement  │  │
│  └───────────────────┘      └─────────┬──────────┘      └─────────────────────┘  │
│                                       │                                          │
│                                       ▼                                          │
│                             ┌────────────────────┐                               │
│                             │    PricingTerm     │                               │
│                             └─────────┬──────────┘                               │
│                                       │                                          │
│                                       ▼                                          │
│                             ┌────────────────────┐                               │
│                             │  CommercialEvent   │ ◄── (Placement Fee Trigger)   │
│                             └─────────┬──────────┘                               │
│                                       │                                          │
│                                       ▼                                          │
│                             ┌────────────────────┐                               │
│                             │      Invoice       │ ──► [InvoiceLine Items]       │
│                             └─────────┬──────────┘                               │
│                                       │                                          │
│                     ┌─────────────────┴─────────────────┐                        │
│                     ▼                                   ▼                        │
│            ┌─────────────────┐                 ┌─────────────────┐               │
│            │     Payment     │                 │ Credit / Refund │               │
│            └────────┬────────┘                 └────────┬────────┘               │
│                     │                                   │                        │
│                     └─────────────────┬─────────────────┘                        │
│                                       ▼                                          │
│                             ┌────────────────────┐                               │
│                             │ RevenueAttribution │                               │
│                             └────────────────────┘                               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Customer Model

A `CustomerAccount` is the root commercial entity within an Organization. It represents the legal entity or person responsible for financial commitments and contractual agreements.

### Supported Customer Types:
1. `INDIVIDUAL_CANDIDATE`: The candidate themselves is the self-funding customer.
2. `INDIVIDUAL_SPONSOR`: A parent, relative, or private guarantor paying on behalf of the candidate.
3. `CORPORATE_CLIENT`: An employer, hiring partner, or placement firm paying for candidate sourcing/placement services.
4. `STAFFING_AGENCY`: A third-party agency partnering with OOS for placement fulfillment.
5. `ENTERPRISE_SUBSCRIPTION`: A corporate client with multi-seat candidate access or institutional placement agreements.

### Core Customer Account Attributes:
- `id`: Unique identifier (UUIDv7 / CUID).
- `organizationId`: Tenancy boundary.
- `customerType`: Enum (`INDIVIDUAL_CANDIDATE`, `INDIVIDUAL_SPONSOR`, `CORPORATE_CLIENT`, `STAFFING_AGENCY`, `ENTERPRISE_SUBSCRIPTION`).
- `displayName`: Legal or business name.
- `billingEmail`: Authoritative destination for invoice delivery and payment receipts.
- `billingPhone`: Optional contact.
- `taxIdentifier`: VAT, GST, or EIN for compliant invoice generation.
- `billingAddress`: Structured physical address (Street, City, State, Postal Code, Country).
- `currency`: Default billing currency (ISO-4217: `USD`, `CAD`, `GBP`, `EUR`, `INR`, etc.).
- `status`: Enum (`ACTIVE`, `SUSPENDED`, `DELINQUENT`, `CLOSED`).
- `primaryCandidateId`: Optional direct link if `customerType` is `INDIVIDUAL_CANDIDATE`.

---

## 5. Candidate vs. Customer Separation

A fundamental architectural rule of CBOS is the strict ontological separation between Candidate and Customer:

| Attribute / Concern | Candidate Domain (`Candidate`) | Customer Domain (`CustomerAccount`) |
|---|---|---|
| **Identity Nature** | Human talent / Career seeker | Commercial / Financial legal entity |
| **Primary Identifier** | `candidateId` / `userId` | `customerId` |
| **Core Concern** | Resumes, skills, jobs, applications, interviews, offers | Contracts, pricing terms, invoices, payments, credits |
| **Tenancy Linkage** | Belongs to an Organization | Belongs to an Organization |
| **Relationship Cardinality** | 1 Candidate may have 1 or more Customer relationships (Self, Sponsor, Employer) | 1 Customer may sponsor 1 or more Candidates (Corporate / Parent / Enterprise) |
| **Data Visibility** | Career profile, application status, interview schedules | Invoices, payment receipts, balance due, contract terms |
| **Privacy Boundary** | Profile details visible to assigned specialists | Financial details restricted to Billing Admins / Managers |

---

## 6. Service Contract

A `ServiceContract` represents a legally binding agreement between an Organization and a `CustomerAccount` governing the delivery of career placement, application support, or recruitment services.

### Contract Status Lifecycle:
$$\text{DRAFT} \longrightarrow \text{PENDING_SIGNATURE} \longrightarrow \text{ACTIVE} \longrightarrow \begin{cases} \text{FULFILLED} \\ \text{EXPIRED} \\ \text{TERMINATED} \\ \text{CANCELLED} \end{cases}$$

### Key Contract Fields:
- `id`: Unique identifier.
- `organizationId`: Tenancy boundary.
- `customerId`: Foreign key to `CustomerAccount`.
- `contractNumber`: Human-readable identifier (e.g., `CTR-2026-0089`).
- `serviceType`: Enum (`CAREER_ACCELERATION`, `PLACEMENT_RETAINER`, `CONTINGENT_PLACEMENT`, `ENTERPRISE_TALENT_SEARCH`, `EXECUTIVE_COACHING`).
- `billingCadence`: Enum (`ONE_TIME`, `MONTHLY_RETAINER`, `MILESTONE_BASED`, `PLACEMENT_CONTINGENT`, `HYBRID_RETAINER_PLACEMENT`).
- `currency`: ISO-4217 standard currency code.
- `effectiveDate`: Date commercial commitment commences.
- `expirationDate`: Date contract expires unless renewed.
- `paymentTermsDays`: Net payment window (e.g., `0` for Due on Receipt, `15` for Net 15, `30` for Net 30).
- `status`: Enum (`DRAFT`, `PENDING_SIGNATURE`, `ACTIVE`, `FULFILLED`, `EXPIRED`, `TERMINATED`, `CANCELLED`).
- `cancellationReason`: Optional audit explanation for non-standard termination.
- `signedAt`: Timestamp of bilateral signature execution.
- `signedDocumentId`: Reference to signed PDF agreement in secure document storage.

---

## 7. Service Entitlement

A `ServiceEntitlement` defines the operational boundaries and resource quotas granted by an active `ServiceContract`.

### Entitlement Dimensions:
1. **Application Volume Quota:** Maximum applications permitted per week/month (e.g., 50 applications/month).
2. **Search Horizon Duration:** Active search duration (e.g., 180 days active placement service).
3. **Specialist Allocation Tier:** Dedicated Career Strategist vs. Pooled Application Specialists.
4. **Interview Prep Quotas:** Number of technical mock sessions or executive interview prep briefs included.
5. **Offer Negotiation Coverage:** Full legal and compensation negotiation representation included.
6. **Entitlement State:** Enum (`ACTIVE`, `PAUSED_FOR_NONPAYMENT`, `EXHAUSTED`, `EXPIRED`, `REVOKED`).

---

## 8. Pricing Terms

A `PricingTerm` defines the deterministic calculation rules for generating commercial charges under a `ServiceContract`. Multiple pricing terms can exist under a single contract (e.g., a monthly retainer plus a contingent placement fee).

### Supported Pricing Models:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPPORTED PRICING MODELS                          │
├─────────────────────────┬───────────────────────────────────────────────────┤
│ Model Type              │ Calculation Formula / Rule                        │
├─────────────────────────┼───────────────────────────────────────────────────┤
│ FIXED_FEE               │ Flat fixed amount (e.g., $3,500 upfront retainer) │
│ PERCENTAGE_COMPENSATION │ X% of Candidate Base Compensation / Year 1 Cash   │
│ RECURRING_SUBSCRIPTION  │ Recurring flat rate per billing period (Monthly)  │
│ TIERED_COMPENSATION     │ Tier 1 ($0–$150k): 10%, Tier 2 ($150k+): 15%     │
│ MILESTONE_CONTINGENT    │ 50% on Offer Accepted, 50% on Day 30 Verified     │
│ HYBRID                  │ Retainer credited against final Placement Fee     │
└─────────────────────────┴───────────────────────────────────────────────────┘
```

### Critical Calculation Invariant:
- For `PERCENTAGE_COMPENSATION` and `TIERED_COMPENSATION`, the contract must explicitly specify the **Basis Attribute**:
  - `FIRST_YEAR_BASE_SALARY` (Standard default)
  - `TOTAL_YEAR_ONE_CASH` (Base Salary + Guaranteed Signing Bonus)
  - `TOTAL_TARGET_COMPENSATION` (Base + Expected Variable Bonus)
- Base compensation is pulled exclusively from the frozen `PlacementRecord` in OPOS.

---

## 9. Commercial Events

A `CommercialEvent` is an authoritative, immutable record of an event that establishes or alters financial liability. **A Commercial Event is NOT an Invoice and NOT a Payment; it is the factual business occurrence that entitles the generation of an Invoice.**

### Authoritative Event Types:
- `RETAINER_SCHEDULED`: Upfront or recurring monthly retainer obligation matured.
- `PLACEMENT_FEE_TRIGGERED`: A placement verified in OPOS met contract conditions for fee assessment.
- `MILESTONE_REACHED`: An operational milestone (e.g., 5th interview round, offer received) achieved contract milestone.
- `AD_HOC_SERVICE_ORDERED`: Special service added (e.g., rush resume rewrite, external legal review).
- `EARLY_TERMINATION_FEE`: Contract terminated prematurely with contractual penalty.
- `CREDIT_ADJUSTMENT_EARNED`: Retainer offset applied against placement success fee.

---

## 10. Placement $\rightarrow$ Commercial Boundary

The connection between OPOS (Operational Placement) and CBOS (Commercial Invoicing) is strictly governed by contractual validation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 PLACEMENT ──► COMMERCIAL TRIGGER WORKFLOW                   │
└─────────────────────────────────────────────────────────────────────────────┘

  [ OPOS Verified Placement ]
             │
             │ (placementId, candidateId, offerId, baseSalary, currency, placementDate)
             ▼
  [ CBOS Contract Eligibility Engine ]
             │
             ├──► 1. Locate active ServiceContract for candidateId
             ├──► 2. Verify Contract Status == ACTIVE
             ├──► 3. Locate active PricingTerm for PLACEMENT_FEE
             ├──► 4. Check if placementDate is within Contract Effective Window
             │
             ├── [IF NOT ELIGIBLE] ──► Log Operational Placement (Zero Invoice Created)
             │
             └── [IF ELIGIBLE]
                      │
                      ▼
             [ Create CommercialEvent: PLACEMENT_FEE_TRIGGERED ]
                      │
                      │ (Calculates Fee = BaseSalary * Rate - RetainerCredits)
                      ▼
             [ Generate Draft Invoice ]
                      │
                      ▼
             [ Billing Manager Review & Approval ]
                      │
                      ▼
             [ Authoritative Invoice ISSUED ]
```

### Deterministic Rules:
1. OPOS knows nothing about invoices or dollar fees; it only asserts that the placement is verified and authentic.
2. CBOS queries `PlacementRecord` data read-only; it cannot mutate placement status or verification proof.
3. If an organization does not have a contingent fee agreement for a candidate (e.g., pure coaching package), the placement verification creates **zero** commercial events.

---

## 11. Invoice Domain

An `Invoice` is the authoritative legal document demanding payment for delivered services.

### Invoice Lifecycle State Machine:
$$\text{DRAFT} \longrightarrow \text{ISSUED} \longrightarrow \begin{cases} \text{PAID} \\ \text{PARTIALLY_PAID} \\ \text{OVERDUE} \\ \text{VOID} \\ \text{WRITTEN_OFF} \end{cases}$$

### Key Invoice Attributes:
- `id`: Unique identifier.
- `organizationId`: Tenancy boundary.
- `customerId`: Foreign key to `CustomerAccount`.
- `contractId`: Foreign key to `ServiceContract`.
- `commercialEventId`: Optional foreign key to triggering `CommercialEvent`.
- `invoiceNumber`: Human-readable serial number (e.g., `INV-2026-1042`).
- `currency`: ISO-4217 code.
- `subtotalAmount`: Sum of line items before discounts/tax (in integer cents/minor currency units).
- `discountAmount`: Total discounts applied.
- `creditAppliedAmount`: Credits deducted from balance.
- `taxAmount`: Tax calculated.
- `totalAmount`: Final payable amount (`subtotal - discount - credit + tax`).
- `balanceDueAmount`: Remaining unpaid amount (`totalAmount - totalPaidAmount`).
- `status`: Enum (`DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `VOID`, `WRITTEN_OFF`).
- `issueDate`: Date invoice was officially issued.
- `dueDate`: Date payment is legally due.
- `paidAt`: Timestamp when balance due reached zero.
- `voidedAt`: Timestamp if voided prior to payment.
- `version`: Monotonically increasing version counter for audit history.

### Invoice Line Items (`InvoiceLine`):
- `id`: Unique identifier.
- `invoiceId`: Foreign key to `Invoice`.
- `lineNumber`: 1-indexed sequential line number.
- `description`: Text explanation (e.g., "Contingent Placement Success Fee - Candidate Jane Doe (15% of $180,000 Base)").
- `quantity`: Decimal quantity (e.g., `1.00`).
- `unitPrice`: Minor units (e.g., `2700000` for $27,000.00).
- `amount`: `quantity * unitPrice`.
- `candidateId`: Optional reference for candidate attribution.
- `placementId`: Optional reference for placement attribution.

---

## 12. Payment Domain

A `Payment` represents a recorded receipt of funds against one or more Invoices or Customer Accounts.

### Payment Attributes:
- `id`: Unique identifier.
- `organizationId`: Tenancy boundary.
- `customerId`: Foreign key to `CustomerAccount`.
- `invoiceId`: Foreign key to `Invoice` (or null if unapplied account prepayment).
- `paymentNumber`: Human-readable receipt number (e.g., `PMT-2026-0512`).
- `amount`: Minor currency units received.
- `currency`: ISO-4217 code.
- `paymentMethod`: Enum (`STRIPE_CARD`, `STRIPE_ACH`, `RAZORPAY`, `BANK_WIRE`, `CHECK`, `MANUAL_RECORD`).
- `paymentDate`: Date funds were received/cleared.
- `provider`: String identifier (e.g., `stripe`, `razorpay`, `manual`).
- `providerTransactionId`: External processor reference (e.g., `ch_3Mtwx62eZvKYlo2C0V123456`).
- `status`: Enum (`PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`).
- `recordedByActorId`: Staff/system actor who recorded/verified the receipt.
- `notes`: Internal receipt notes.

---

## 13. Credit / Refund Domain

To preserve immutable accounting truth, payments and invoices are never deleted or silently modified. Corrections are handled through formal append-only entities:

### 1. `CommercialCredit` (Credit Memo):
- Represents value owed to a customer (e.g., prepaid retainer credited against final placement fee, or goodwill discount).
- Can be applied against an open `Invoice` to reduce `balanceDueAmount`.

### 2. `CommercialRefund`:
- Represents actual outward money movement returning settled funds to a customer.
- Must link to the original `Payment` and specify amount, reason, and external refund transaction reference.

### 3. `CommercialAdjustment`:
- Append-only reconciliation record adjusting invoice balance due to bad debt write-off or billing dispute settlements.

---

## 14. Revenue Attribution

CBOS establishes an unbroken, deterministic chain linking high-level realized revenue down to individual operational contributions:

```
[ Customer Payment Cleared ]
            │
            ▼
   [ Paid Invoice Item ]
            │
            ▼
   [ Commercial Event ]
            │
            ▼
   [ Verified Placement ] ──► Candidate Profile & Career Strategist Team
            │
            ▼
   [ Accepted Offer ] ──► Negotiation Specialist & Sourcing Team
            │
            ▼
   [ Application Execution ] ──► Application Specialists & QA Reviewers
```

### Attribution Dimensions:
1. **Candidate Level:** Total lifetime revenue and customer margin generated per candidate.
2. **Specialist / Team Level:** Placement volume and fee realization credited to the assigned Career Strategist, Application Specialist, and Negotiation Lead.
3. **Employer / Partner Level:** Total placement fees earned per hiring organization or corporate sponsor.
4. **Channel / Service Plan Level:** Revenue breakdown by Retainer vs. Contingent Success Fee vs. Enterprise Contract.

---

## 15. Authority Matrix

| Action | Authorized Actor Roles | Preconditions & Validation |
|---|---|---|
| `CreateCustomerAccount` | `ADMIN`, `BILLING_ADMIN`, `MANAGER` | Valid tax/billing address, unique billing email within Org. |
| `DraftServiceContract` | `ADMIN`, `BILLING_ADMIN`, `MANAGER` | Active CustomerAccount, valid service type and currency. |
| `ActivateServiceContract` | `ADMIN`, `BILLING_ADMIN` | Bilateral signatures verified or authorized corporate override. |
| `TriggerPlacementFee` | `SYSTEM_WORKER`, `BILLING_ADMIN` | Verified `PlacementRecord` in OPOS + Active `ServiceContract`. |
| `IssueInvoice` | `ADMIN`, `BILLING_ADMIN` | Invoice in `DRAFT` state with $\ge 1$ line items; locked amounts. |
| `VoidInvoice` | `ADMIN`, `BILLING_ADMIN` | Invoice has 0 completed payments; requires audit justification. |
| `RecordManualPayment` | `ADMIN`, `BILLING_ADMIN` | Open invoice with matching currency; verified bank reference. |
| `ProcessStripeWebhook` | `SYSTEM_WORKER` | Valid webhook signature, non-duplicate transaction idempotency key. |
| `IssueCreditMemo` | `ADMIN`, `BILLING_ADMIN` | Active CustomerAccount; authorized amount $\le$ contract limit. |
| `AuthorizeRefund` | `ADMIN` (Dual Approval if $> \$5,000$) | Completed Payment; refund amount $\le$ available payment balance. |
| `WriteOffInvoice` | `ADMIN` | Delinquent invoice with documented collection exhaustion. |

---

## 16. Role-Based Access Control (RBAC)

CBOS enforces strict multi-tier RBAC to safeguard sensitive financial data:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CBOS RBAC PRIVILEGES                             │
├───────────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│ Capability        │ Admin /      │ Specialist / │ Candidate    │ External   │
│                   │ BillingAdmin │ Team Lead    │ (Self)       │ Customer   │
├───────────────────┼──────────────┼──────────────┼──────────────┼────────────┤
│ View Invoices     │ Full Access  │ No Access    │ Own Invoices │ Account    │
│ View Pricing/Terms│ Full Access  │ No Access    │ Own Contract │ Account    │
│ Record Payments   │ Full Access  │ No Access    │ No Access    │ Gateway    │
│ Issue Refunds     │ Admin Only   │ No Access    │ No Access    │ No Access  │
│ View Placements   │ Full Access  │ Full Access  │ Own Outcome  │ No Access  │
│ Revenue Reports   │ Full Access  │ No Access    │ No Access    │ No Access  │
└───────────────────┴──────────────┴──────────────┴──────────────┴────────────┘
```

---

## 17. Immutability & Financial Versioning

To maintain strict accounting compliance and audit readiness, CBOS enforces the following immutability rules:

1. **Issued Invoices are Frozen:** Once an `Invoice` transitions to `ISSUED`, its line items, currency, subtotal, tax, and total amount can never be mutated.
2. **Corrections via Credit/Adjustment Only:** If an invoice contains an error after being issued, it must be either `VOIDED` (if unpaid) or balanced with a `CommercialCredit` / `CommercialAdjustment`.
3. **Immutable Payment Ledger:** `Payment` records are strictly append-only. A failed or returned payment generates a separate `PaymentFailure` or `Refund` entry rather than editing the original row.
4. **Append-Only Commercial Events:** `CommercialEvent` entries represent historical occurrences and cannot be deleted or recomputed retroactively.

---

## 18. Audit & Compliance

Every state mutation in CBOS generates an immutable, transactionally atomic entry in the centralized `AuditLog`:

### Audit Action Catalog for CBOS:
- `COMMERCIAL_CUSTOMER_CREATED`
- `COMMERCIAL_CONTRACT_DRAFTED`
- `COMMERCIAL_CONTRACT_ACTIVATED`
- `COMMERCIAL_CONTRACT_TERMINATED`
- `COMMERCIAL_EVENT_RECORDED`
- `COMMERCIAL_INVOICE_GENERATED`
- `COMMERCIAL_INVOICE_ISSUED`
- `COMMERCIAL_INVOICE_VOIDED`
- `COMMERCIAL_PAYMENT_RECORDED`
- `COMMERCIAL_PAYMENT_FAILED`
- `COMMERCIAL_CREDIT_ISSUED`
- `COMMERCIAL_REFUND_EXECUTED`
- `COMMERCIAL_INVOICE_WRITTEN_OFF`

All audit entries record `organizationId`, `actorId`, `actorRole`, `targetEntityId`, `clientIpAddress`, `userAgent`, and a structured JSON payload containing before/after snapshots.

---

## 19. Privacy & Financial Segregation

Financial privacy is strictly isolated from standard operational views:
- **No Financial Leaks in Candidate DTOs:** Standard candidate profiles, Candidate 360 views, and application review cards must never include customer billing details, invoice totals, or agency fee percentages.
- **Specialist Isolation:** Application Specialists, QA Reviewers, and Sourcing Staff are prohibited from viewing customer contracts, invoice status, or pricing terms.
- **Candidate Sovereignty Preservation:** A self-paying candidate may view their own invoices and payment receipts via a dedicated billing portal tab, but can never see agency margins, corporate sponsor contracts, or third-party fee arrangements.

---

## 20. OPOS Integration Contract

The integration between OPOS and CBOS is unidirectional and decoupled:

1. **Trigger Interface:** When OPOS executes `verifyPlacement()` in `src/lib/opos/opos-service.ts`, OPOS emits a typed domain event: `OPOS_PLACEMENT_VERIFIED_EVENT`.
2. **Event Payload:**
   ```typescript
   interface PlacementVerifiedEventPayload {
     organizationId: string;
     placementId: string;
     candidateId: string;
     offerId: string;
     jobTitle: string;
     employerName: string;
     annualBaseSalaryCents: number;
     currency: string;
     joiningDate: Date;
     verifiedAt: Date;
     verifiedByStaffId: string;
   }
   ```
3. **CBOS Consumer:** CBOS receives the event, evaluates the candidate's active `ServiceContract`, applies the contractual `PricingTerm`, and generates a `CommercialEvent` without blocking or modifying the OPOS placement transaction.

---

## 21. Candidate 360 Integration

Candidate 360 remains a strictly read-only composed projection:
- **What Candidate 360 May Display (Candidate Portal):**
  - Current service tier name (e.g., "Executive Search Tier").
  - Service expiration date.
  - Active search entitlement status (`ACTIVE` vs. `PAUSED`).
- **What Candidate 360 NEVER Displays:**
  - Agency profit margins.
  - Commission splits.
  - Internal billing notes.
  - Corporate client search fees.

---

## 22. External Provider Boundary

CBOS maintains an abstract, pluggable provider layer to prevent vendor lock-in:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CBOS PAYMENT PROVIDER SPI                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
               ┌──────────────────────┼──────────────────────┐
               ▼                      ▼                      ▼
      [ Stripe Provider ]    [ Razorpay Provider ]   [ Manual / Bank Wire ]
```

### Architectural Guarantees:
- OOS never stores raw credit card numbers or banking passwords (PCI-DSS Level 1 compliance delegated to Stripe/Razorpay hosted tokens).
- External webhooks are validated with HMAC cryptographic signatures and processed idempotently via an `IdempotencyKey` cache.
- OOS remains the single source of truth for invoice balances; external gateways act solely as processing mechanisms.

---

## 23. Complete Lifecycle Definitions

### 1. `CustomerAccount` Lifecycle:
$$\text{ACTIVE} \longleftrightarrow \text{SUSPENDED} \longrightarrow \text{DELINQUENT} \longrightarrow \text{CLOSED}$$

### 2. `ServiceContract` Lifecycle:
$$\text{DRAFT} \longrightarrow \text{PENDING_SIGNATURE} \longrightarrow \text{ACTIVE} \longrightarrow \begin{cases} \text{FULFILLED} \\ \text{EXPIRED} \\ \text{TERMINATED} \end{cases}$$

### 3. `Invoice` Lifecycle:
$$\text{DRAFT} \longrightarrow \text{ISSUED} \longrightarrow \begin{cases} \text{PARTIALLY_PAID} \longrightarrow \text{PAID} \\ \text{OVERDUE} \longrightarrow \text{WRITTEN_OFF} \\ \text{VOID} \end{cases}$$

### 4. `Payment` Lifecycle:
$$\text{PENDING} \longrightarrow \begin{cases} \text{COMPLETED} \longrightarrow \begin{cases} \text{PARTIALLY_REFUNDED} \\ \text{REFUNDED} \end{cases} \\ \text{FAILED} \end{cases}$$

---

## 24. System Invariants

The following invariants are inviolable across all CBOS operations:

1. **Integer Minor Unit Representation:** All monetary amounts (`amount`, `subtotal`, `tax`, `discount`, `credit`, `total`, `balanceDue`) must be stored as integers representing minor currency units (cents, pence, paise). Floating-point currencies are strictly prohibited.
2. **Explicit Currency Binding:** Every financial record must carry an explicit ISO-4217 currency code. Multi-currency math without explicit exchange conversion is prohibited.
3. **Non-Negative Invoicing:** An invoice's `totalAmount` can never be less than zero. Excess credits must be recorded on the Customer Account rather than creating a negative invoice.
4. **Zero Silent Deletion:** No invoice, payment, credit, or contract record may ever be deleted (`DELETE FROM`). Reversals require formal voiding or adjustment entries.
5. **No Phantom Fees:** A placement fee can never be invoiced without linking to an authoritative, verified `PlacementRecord` in OPOS and an active `ServiceContract`.

---

## 25. Frozen Non-Goals (Scope Defenses)

To maintain sharp focus and avoid enterprise software bloat, the following are explicitly declared **OUT OF SCOPE** for CBOS:

- **No General Ledger / Double-Entry Bookkeeping System:** CBOS is an operational billing engine, not QuickBooks or SAP.
- **No Tax Filing / Jurisdictional Remittance:** CBOS calculates simple percentage taxes; tax remittance is handled externally.
- **No Employee Payroll / Commission Payout Engine:** Specialist commission payouts will be calculated from revenue reports, not executed through CBOS.
- **No Automated Debt Collection / Robocalls:** Overdue notices are limited to system notifications and email reminders.
- **No AI-Driven Dynamic Pricing:** All contract prices and discounts must be set by human staff.

---

## 26. Contradiction Matrix

| Potential Contradiction | Resolved Architectural Rule |
|---|---|
| *Can an employee offer a discount verbally without a contract change?* | **No.** Invoices inherit pricing strictly from active `PricingTerm` records on the contract. Ad-hoc discounts require a `CommercialCredit` approved by an Admin. |
| *Does a Candidate ACCEPT in OPOS trigger billing immediately?* | **No.** An offer acceptance is an operational milestone. Billing is only triggered upon formal 2-Factor `Placement Verification` (or explicit milestone term). |
| *What happens if a candidate is placed twice?* | Each placement references a unique `placementId` and generates an independent `CommercialEvent` if authorized by contract. |
| *Can a staff specialist see how much the customer paid for their service?* | **No.** Staff specialist views are isolated from billing data to prevent wage/margin friction. |
| *Can an invoice total be updated after sending to a client?* | **No.** Issued invoices are permanently locked. An adjustment memo or void-and-reissue is required. |

---

## 27. Decision Log

| Decision ID | Context / Question | Final Decision | Architectural Rationale |
|---|---|---|---|
| `DEC-10B-01` | How to model Candidates vs. Corporate Sponsors? | Separate `CustomerAccount` from `Candidate` with a foreign-key relationship. | Enables 1:1, 1:Many (Sponsor $\rightarrow$ Candidates), and Corporate account models without duplicating talent records. |
| `DEC-10B-02` | How to store monetary values? | Mandatory `BigInt` / `Int` minor units (cents) with ISO-4217 currency. | Eliminates floating-point rounding errors and multi-currency calculation ambiguity. |
| `DEC-10B-03` | Should OPOS call CBOS synchronously during placement? | Unidirectional domain event dispatch. | Prevents billing failures or contract validation errors from rolling back verified operational placement records. |
| `DEC-10B-04` | How to handle invoice modifications? | Strict immutability once `ISSUED`. | Complies with legal invoicing requirements and prevents silent historical audit rewriting. |
| `DEC-10B-05` | Which pricing models must be supported? | Fixed, Percentage of Base Comp, Recurring Retainer, Milestone, and Hybrid. | Covers the entire spectrum of career agency and executive search billing structures. |

---

## 28. Final Product Contract & Acceptance Gate

==================================================  
### PRODUCT CONTRACT LOCK SUMMARY:

- **Domain Name:** Commercial & Billing Operating System (CBOS)
- **Domain Authority:** Sole authority over Customer Accounts, Service Contracts, Pricing Terms, Invoicing, Payments, Credits, and Revenue Attribution.
- **Core Separation:** Candidate (Talent) $\neq$ Customer (Commercial Legal Entity).
- **Placement Revenue Trigger:** Verified OPOS `PlacementRecord` $\rightarrow$ Contract Validation $\rightarrow$ `CommercialEvent` $\rightarrow$ `Invoice`.
- **Financial Immutability:** Integer cents, ISO-4217 currencies, append-only payment ledgers, versioned invoices.

==================================================  
**PHASE 10B STATUS:**  
**COMPLETE / ACCEPTED / FROZEN**  

**IMPLEMENTATION AUTHORIZATION:**  
**NOT AUTHORIZED (Contract Design Only)**  
==================================================  
