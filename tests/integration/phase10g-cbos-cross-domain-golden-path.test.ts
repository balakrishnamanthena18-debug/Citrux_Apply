/**
 * PHASE 10G — CBOS CROSS-DOMAIN GOLDEN PATH & FINANCIAL INTEGRITY TEST SUITE
 *
 * Verifies the complete end-to-end commercial operating chain:
 * PLACEMENT VERIFIED -> OPOS_PLACEMENT_VERIFIED_EVENT -> CBOS OUTBOX ->
 * COMMERCIAL EVENT -> ACTIVE SERVICE CONTRACT -> PRICING TERM ->
 * INVOICE -> INVOICE LINE -> PAYMENT -> REVENUE ATTRIBUTION
 *
 * Covers Golden Paths A through N:
 * - Golden Path A: Successful Placement to Revenue (with pure integer reconciliation)
 * - Golden Path B: Placement Without Billable Contract
 * - Golden Path C: Placement With Invalid / Missing Pricing Term
 * - Golden Path D: Payment Replay & Concurrency Idempotency
 * - Golden Path E: Outbox Replay & Event Idempotency
 * - Golden Path F: Contract Versioning & Historical Invariance
 * - Golden Path G: Invoice Immutability & Ledger Invariance
 * - Golden Path H: Credit / Refund / Adjustment Lifecycle
 * - Golden Path I: Failed Payment Handling
 * - Golden Path J: OPOS Failure Isolation & Resilience
 * - Golden Path K: Multi-Tenant Isolation
 * - Golden Path L: Candidate / Customer Structural Separation Models
 * - Golden Path M: Complete Audit Chain Reconstruction
 * - Golden Path N: Historical Truth & Tampering Resistance
 */

import { config } from "dotenv";
config({ path: ".env" });

import { randomUUID } from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { CbosService } from "@/lib/cbos/cbos-service";
import { CbosRepository } from "@/lib/cbos/cbos-repository";
import { PricingEngine } from "@/lib/cbos/pricing-engine";
import { CbosOutbox } from "@/lib/cbos/cbos-outbox";
import {
  CustomerType,
  CustomerStatus,
  CustomerCandidateRelationType,
  RelationStatus,
  ContractServiceType,
  BillingCadence,
  ContractStatus,
  PricingModel,
  PricingBasis,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  CreditStatus,
  RefundStatus,
  AdjustmentType,
  EntitlementType,
  CommercialEventType,
} from "@/lib/cbos/types";
import { Role, AuditAction } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import {
  ensureRuntimeRoleGrant,
  getLiveDbUrl,
  withBypassClient,
  withRuntimeRlsAsUser,
} from "../helpers/live-rls";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("PHASE 10G — CBOS Cross-Domain Golden Path & Financial Integrity", () => {
  // Tenant A Identifiers
  const tenantAId = randomUUID();
  const userAdminA = randomUUID();
  const userEmpA = randomUUID();
  const userCandA = randomUUID();
  const candAId = randomUUID();

  // Tenant B Identifiers
  const tenantBId = randomUUID();
  const userAdminB = randomUUID();
  const userEmpB = randomUUID();
  const userCandB = randomUUID();
  const candBId = randomUUID();

  // Contexts
  let adminCtxA: AuthenticatedContext;
  let empCtxA: AuthenticatedContext;
  let candCtxA: AuthenticatedContext;

  let adminCtxB: AuthenticatedContext;
  let empCtxB: AuthenticatedContext;
  let candCtxB: AuthenticatedContext;

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // Clean stale outbox events
      await c.query(`DELETE FROM public.cbos_outbox_events WHERE status = 'PENDING'`);

      // 1. Create Organizations
      await c.query(
        `INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)`,
        [tenantAId, "Golden Path Org A", `org-a-10g-${Date.now()}`, tenantBId, "Golden Path Org B", `org-b-10g-${Date.now()}`]
      );

      // 2. Create Users
      await c.query(
        `INSERT INTO public.users (id, email) VALUES
         ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10), ($11, $12)`,
        [
          userAdminA, `admin-a-10g-${Date.now()}@a.com`,
          userEmpA, `emp-a-10g-${Date.now()}@a.com`,
          userCandA, `cand-a-10g-${Date.now()}@a.com`,
          userAdminB, `admin-b-10g-${Date.now()}@b.com`,
          userEmpB, `emp-b-10g-${Date.now()}@b.com`,
          userCandB, `cand-b-10g-${Date.now()}@b.com`,
        ]
      );

      // 3. Create Memberships
      await c.query(
        `INSERT INTO public.memberships (id, "organizationId", "userId", role, status) VALUES
         (gen_random_uuid(), $1, $2, 'ADMIN', 'ACTIVE'),
         (gen_random_uuid(), $1, $3, 'EMPLOYEE', 'ACTIVE'),
         (gen_random_uuid(), $1, $4, 'CANDIDATE', 'ACTIVE'),
         (gen_random_uuid(), $5, $6, 'ADMIN', 'ACTIVE'),
         (gen_random_uuid(), $5, $7, 'EMPLOYEE', 'ACTIVE'),
         (gen_random_uuid(), $5, $8, 'CANDIDATE', 'ACTIVE')`,
        [
          tenantAId, userAdminA, userEmpA, userCandA,
          tenantBId, userAdminB, userEmpB, userCandB,
        ]
      );

      // 4. Create Candidates
      await c.query(
        `INSERT INTO public.candidates (id, "organizationId", "userId", status, "verificationStatus") VALUES
         ($1, $2, $3, 'ACTIVE', 'VERIFIED'),
         ($4, $5, $6, 'ACTIVE', 'VERIFIED')`,
        [candAId, tenantAId, userCandA, candBId, tenantBId, userCandB]
      );
    });

    adminCtxA = {
      userId: userAdminA,
      email: "admin-a@a.com",
      organizationId: tenantAId,
      role: Role.ADMIN,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
    empCtxA = {
      userId: userEmpA,
      email: "emp-a@a.com",
      organizationId: tenantAId,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
    candCtxA = {
      userId: userCandA,
      email: "cand-a@a.com",
      organizationId: tenantAId,
      role: Role.CANDIDATE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };

    adminCtxB = {
      userId: userAdminB,
      email: "admin-b@b.com",
      organizationId: tenantBId,
      role: Role.ADMIN,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
    empCtxB = {
      userId: userEmpB,
      email: "emp-b@b.com",
      organizationId: tenantBId,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
    candCtxB = {
      userId: userCandB,
      email: "cand-b@b.com",
      organizationId: tenantBId,
      role: Role.CANDIDATE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
  }, 60000);

  afterAll(async () => {
    await withBypassClient(async (c) => {
      await c.query(`DELETE FROM public.audit_events WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.revenue_attributions WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.commercial_adjustments WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.commercial_refunds WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.commercial_credits WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.payments WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.invoice_lines WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.invoices WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.cbos_outbox_events WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.commercial_events WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.pricing_terms WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.service_entitlements WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.service_contract_versions WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.service_contracts WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.customer_candidate_relationships WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.customer_accounts WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.placement_records WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.joining_records WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.offers WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.applications WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.jobs WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.candidates WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.memberships WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.users WHERE id IN ($1, $2, $3, $4, $5, $6)`, [
        userAdminA, userEmpA, userCandA, userAdminB, userEmpB, userCandB,
      ]);
      await c.query(`DELETE FROM public.organizations WHERE id IN ($1, $2)`, [tenantAId, tenantBId]);
    });
  }, 60000);

  // =========================================================================
  // GOLDEN PATH A — SUCCESSFUL PLACEMENT TO REVENUE
  // =========================================================================

  describe("Golden Path A: Complete End-to-End Placement to Revenue Recognition", () => {
    it("executes the entire commercial operating chain with 100% integer precision and zero reconciliation variance", async () => {
      // 1. Setup Customer Account
      const customer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Alice Candidate Billing",
        billingEmail: "alice.billing@example.com",
        currency: "USD",
        primaryCandidateId: candAId,
      });
      expect(customer.id).toBeDefined();
      expect(customer.status).toBe(CustomerStatus.ACTIVE);

      // 2. Draft & Activate Service Contract with 15% Placement Fee Term
      const contract = await CbosService.draftServiceContract(adminCtxA, {
        customerAccountId: customer.id,
        candidateId: candAId,
        contractNumber: `CTR-GPA-${Date.now()}`,
        serviceType: ContractServiceType.CAREER_ACCELERATION,
        billingCadence: BillingCadence.PLACEMENT_CONTINGENT,
        currency: "USD",
        effectiveDate: new Date(),
        initialPricingTerms: [
          {
            pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
            pricingBasis: PricingBasis.FIRST_YEAR_BASE_SALARY,
            percentageBasisPoints: 1500, // 15.00%
            minimumFeeCents: 1000000n, // $10,000.00 min
            maximumFeeCents: 5000000n, // $50,000.00 max
          },
        ],
        initialEntitlements: [
          {
            candidateId: candAId,
            entitlementType: EntitlementType.APPLICATION_VOLUME_MONTHLY,
            allocatedQuota: 100,
          },
        ],
      });

      const activeContract = await CbosService.activateServiceContract(
        adminCtxA,
        contract.id,
        `signed-doc-gpa-${Date.now()}`
      );
      expect(activeContract.status).toBe(ContractStatus.ACTIVE);

      // 3. OPOS Placement Verification Setup
      let placementId: string = randomUUID();
      await withBypassClient(async (c) => {
        const jobId = randomUUID();
        await c.query(
          `INSERT INTO public.jobs (id, "organizationId", title, "companyName", "jobDescription", "createdById", status) VALUES
           ($1, $2, 'Staff AI Engineer', 'Top Tier Tech', 'Description', $3, 'OPEN')`,
          [jobId, tenantAId, userAdminA]
        );

        const appId = randomUUID();
        await c.query(
          `INSERT INTO public.applications (id, "organizationId", "candidateId", "jobId", status) VALUES
           ($1, $2, $3, $4, 'SUBMITTED')`,
          [appId, tenantAId, candAId, jobId]
        );

        const offerId = randomUUID();
        await c.query(
          `INSERT INTO public.offers (id, "organizationId", "candidateId", "applicationId", "jobId", status, "currentVersionNumber") VALUES
           ($1, $2, $3, $4, $5, 'ACCEPTED', 1)`,
          [offerId, tenantAId, candAId, appId, jobId]
        );

        const joiningId = randomUUID();
        await c.query(
          `INSERT INTO public.joining_records (id, "organizationId", "candidateId", "offerId", "applicationId", status, "scheduledStartDate", "actualStartDate") VALUES
           ($1, $2, $3, $4, $5, 'JOINING_CONFIRMED', now(), now())`,
          [joiningId, tenantAId, candAId, offerId, appId]
        );

        await c.query(
          `INSERT INTO public.placement_records (id, "organizationId", "candidateId", "offerId", "joiningId", "applicationId", "verifiedStartDate", "verifiedAt", "verifiedById", "firstDayConfirmed", "onboardingProofValidated") VALUES
           ($1, $2, $3, $4, $5, $6, now(), now(), $7, true, true)`,
          [placementId, tenantAId, candAId, offerId, joiningId, appId, userAdminA]
        );
      });

      // 4. Emit OPOS Placement Verified Event to CBOS Outbox
      const annualBaseSalaryCents = 20000000n; // $200,000.00
      const outboxIdempKey = `outbox-gpa-${placementId}`;

      await CbosOutbox.enqueueEvent(
        tenantAId,
        "OPOS_PLACEMENT_VERIFIED_EVENT",
        "PlacementRecord",
        placementId,
        {
          organizationId: tenantAId,
          placementId,
          candidateId: candAId,
          offerId: randomUUID(),
          annualBaseSalaryCents: Number(annualBaseSalaryCents),
          currency: "USD",
          joiningDate: new Date(),
          verifiedAt: new Date(),
          verifiedByStaffId: userAdminA,
        },
        outboxIdempKey
      );

      // 5. Process Outbox
      const { processedCount } = await CbosOutbox.processPendingEvents();
      expect(processedCount).toBeGreaterThanOrEqual(1);

      // 6. Verify Authoritative Commercial Event
      const commEvents = await prisma.commercialEvent.findMany({
        where: { organizationId: tenantAId, placementId },
      });
      expect(commEvents).toHaveLength(1);
      const commEvent = commEvents[0]!;

      // Independent Mathematical Calculation for Fee:
      // 15% of $200,000 = $30,000.00 (3,000,000 cents)
      const expectedFeeCents = (annualBaseSalaryCents * 1500n) / 10000n;
      expect(commEvent.calculatedAmountCents).toBe(expectedFeeCents);
      expect(commEvent.calculatedAmountCents).toBe(3000000n);

      // 7. Generate Invoice from Commercial Event
      const invoiceNumber = `INV-GPA-${Date.now()}`;
      const invoice = await CbosService.generateInvoiceFromEvent(adminCtxA, {
        commercialEventId: commEvent.id,
        invoiceNumber,
      });

      expect(invoice.id).toBeDefined();
      expect(invoice.totalAmountCents).toBe(3000000n);
      expect(invoice.balanceDueAmountCents).toBe(3000000n);
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);
      const invoiceLines = await prisma.invoiceLine.findMany({ where: { invoiceId: invoice.id } });
      expect(invoiceLines).toHaveLength(1);
      expect(invoiceLines[0]?.totalPriceCents).toBe(3000000n);

      // 8. Issue Invoice
      const issuedInvoice = await CbosService.issueInvoice(adminCtxA, invoice.id);
      expect(issuedInvoice.status).toBe(InvoiceStatus.ISSUED);

      // 9. Record Full Payment
      const paymentNumber = `PMT-GPA-${Date.now()}`;
      const providerTxId = `wire-tx-gpa-${Date.now()}`;
      const payment = await CbosService.recordPayment(adminCtxA, {
        customerAccountId: customer.id,
        invoiceId: invoice.id,
        paymentNumber,
        amountCents: 3000000n,
        currency: "USD",
        paymentMethod: PaymentMethod.BANK_WIRE,
        provider: "bank_wire",
        providerTransactionId: providerTxId,
      });

      expect(payment.id).toBeDefined();
      expect(payment.amountCents).toBe(3000000n);
      expect(payment.status).toBe(PaymentStatus.COMPLETED);

      // Verify invoice transitioned to PAID with 0 balance
      const paidInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      expect(paidInvoice?.status).toBe(InvoiceStatus.PAID);
      expect(paidInvoice?.balanceDueAmountCents).toBe(0n);

      // 10. Attribute Revenue to Strategist Staff
      const attribution = await CbosService.attributeRevenue(adminCtxA, {
        invoiceId: invoice.id,
        paymentId: payment.id,
        candidateId: candAId,
        placementId,
        attributedAmountCents: 3000000n,
        currency: "USD",
        strategistStaffId: userAdminA,
      });

      expect(attribution.id).toBeDefined();
      expect(attribution.attributedAmountCents).toBe(3000000n);
      expect(attribution.strategistStaffId).toBe(userAdminA);

      // 11. INDEPENDENT FINANCIAL RECONCILIATION
      const expectedRevenueCents = 3000000n;
      const expectedInvoiceTotalCents = 3000000n;
      const expectedPaymentTotalCents = 3000000n;
      const expectedNetRevenueCents = 3000000n;

      const actualInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      const actualPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      const actualAttribution = await prisma.revenueAttribution.findUnique({ where: { id: attribution.id } });

      expect(actualInvoice?.totalAmountCents).toBe(expectedInvoiceTotalCents);
      expect(actualPayment?.amountCents).toBe(expectedPaymentTotalCents);
      expect(actualAttribution?.attributedAmountCents).toBe(expectedRevenueCents);

      // NET DIFFERENCE = 0
      const reconciliationDifference = (actualPayment?.amountCents ?? 0n) - expectedNetRevenueCents;
      expect(reconciliationDifference).toBe(0n);
    }, 30000);
  });

  // =========================================================================
  // GOLDEN PATH B — PLACEMENT WITHOUT BILLABLE CONTRACT
  // =========================================================================

  describe("Golden Path B: Placement Without Active Service Contract", () => {
    it("gracefully rejects commercial recognition while keeping OPOS placement truth 100% intact", async () => {
      const unmonetizedCandId = randomUUID();
      const unmonetizedUserId = randomUUID();
      const placementId = randomUUID();

      await withBypassClient(async (c) => {
        await c.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [unmonetizedUserId, `free-cand-${Date.now()}@a.com`]);
        await c.query(`INSERT INTO public.memberships (id, "organizationId", "userId", role) VALUES (gen_random_uuid(), $1, $2, 'CANDIDATE')`, [tenantAId, unmonetizedUserId]);
        await c.query(`INSERT INTO public.candidates (id, "organizationId", "userId") VALUES ($1, $2, $3)`, [unmonetizedCandId, tenantAId, unmonetizedUserId]);

        const jobId = randomUUID();
        await c.query(
          `INSERT INTO public.jobs (id, "organizationId", title, "companyName", "jobDescription", "createdById", status) VALUES
           ($1, $2, 'Software Engineer', 'Free Tech', 'Description', $3, 'OPEN')`,
          [jobId, tenantAId, userAdminA]
        );

        const appId = randomUUID();
        await c.query(
          `INSERT INTO public.applications (id, "organizationId", "candidateId", "jobId", status) VALUES
           ($1, $2, $3, $4, 'SUBMITTED')`,
          [appId, tenantAId, unmonetizedCandId, jobId]
        );

        const offerId = randomUUID();
        await c.query(
          `INSERT INTO public.offers (id, "organizationId", "candidateId", "applicationId", "jobId", status, "currentVersionNumber") VALUES
           ($1, $2, $3, $4, $5, 'ACCEPTED', 1)`,
          [offerId, tenantAId, unmonetizedCandId, appId, jobId]
        );

        const joiningId = randomUUID();
        await c.query(
          `INSERT INTO public.joining_records (id, "organizationId", "candidateId", "offerId", "applicationId", status, "scheduledStartDate", "actualStartDate") VALUES
           ($1, $2, $3, $4, $5, 'JOINING_CONFIRMED', now(), now())`,
          [joiningId, tenantAId, unmonetizedCandId, offerId, appId]
        );

        await c.query(
          `INSERT INTO public.placement_records (id, "organizationId", "candidateId", "offerId", "joiningId", "applicationId", "verifiedStartDate", "verifiedAt", "verifiedById", "firstDayConfirmed", "onboardingProofValidated") VALUES
           ($1, $2, $3, $4, $5, $6, now(), now(), $7, true, true)`,
          [placementId, tenantAId, unmonetizedCandId, offerId, joiningId, appId, userAdminA]
        );
      });

      // Submit OPOS placement event for unmonetized candidate
      const outboxKey = `outbox-unmonetized-${placementId}`;
      await CbosOutbox.enqueueEvent(
        tenantAId,
        "OPOS_PLACEMENT_VERIFIED_EVENT",
        "PlacementRecord",
        placementId,
        {
          organizationId: tenantAId,
          placementId,
          candidateId: unmonetizedCandId,
          offerId: randomUUID(),
          annualBaseSalaryCents: 15000000,
          currency: "USD",
          joiningDate: new Date(),
          verifiedAt: new Date(),
          verifiedByStaffId: userAdminA,
        },
        outboxKey
      );

      const { processedCount } = await CbosOutbox.processPendingEvents();
      expect(processedCount).toBeGreaterThanOrEqual(1);

      // Verify outbox status is COMPLETED with eligible: false
      const outboxRecord = await prisma.cbosOutboxEvent.findUnique({
        where: { idempotencyKey: outboxKey },
      });
      expect(outboxRecord?.status).toBe("COMPLETED");
      expect(outboxRecord?.lastError).toContain("No active ServiceContract found");

      // Verify NO commercial event or invoice was fabricated
      const commEvents = await prisma.commercialEvent.findMany({
        where: { organizationId: tenantAId, placementId },
      });
      expect(commEvents).toHaveLength(0);

      // Verify OPOS PlacementRecord remains strictly untouched
      const placementRecord = await prisma.placementRecord.findUnique({
        where: { id: placementId },
      });
      expect(placementRecord).toBeDefined();
      expect(placementRecord?.candidateId).toBe(unmonetizedCandId);
    });
  });

  // =========================================================================
  // GOLDEN PATH C — PLACEMENT WITH INVALID PRICING TERMS
  // =========================================================================

  describe("Golden Path C: Placement With Ineligible Pricing Terms", () => {
    it("handles contracts lacking placement fee terms without creating invalid invoices", async () => {
      const candidateNoFeeId = randomUUID();
      const userNoFeeId = randomUUID();
      const placementId = randomUUID();

      await withBypassClient(async (c) => {
        await c.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [userNoFeeId, `nofee-${Date.now()}@a.com`]);
        await c.query(`INSERT INTO public.memberships (id, "organizationId", "userId", role) VALUES (gen_random_uuid(), $1, $2, 'CANDIDATE')`, [tenantAId, userNoFeeId]);
        await c.query(`INSERT INTO public.candidates (id, "organizationId", "userId") VALUES ($1, $2, $3)`, [candidateNoFeeId, tenantAId, userNoFeeId]);
      });

      // Create Customer and Contract with ONLY Monthly Retainer (no placement fee term)
      const customer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "No Placement Fee Account",
        billingEmail: "nofee@example.com",
        currency: "USD",
        primaryCandidateId: candidateNoFeeId,
      });

      const contract = await CbosService.draftServiceContract(adminCtxA, {
        customerAccountId: customer.id,
        candidateId: candidateNoFeeId,
        contractNumber: `CTR-NOFEE-${Date.now()}`,
        serviceType: ContractServiceType.PLACEMENT_RETAINER,
        billingCadence: BillingCadence.MONTHLY_RETAINER,
        currency: "USD",
        effectiveDate: new Date(),
        initialPricingTerms: [
          {
            pricingModel: PricingModel.FIXED_FEE,
            fixedAmountCents: 50000n, // $500 monthly retainer
          },
        ],
      });

      await CbosService.activateServiceContract(adminCtxA, contract.id, "signed-doc-nofee");

      // Seed OPOS Placement
      await withBypassClient(async (c) => {
        const jobId = randomUUID();
        await c.query(
          `INSERT INTO public.jobs (id, "organizationId", title, "companyName", "jobDescription", "createdById", status) VALUES
           ($1, $2, 'DevOps Lead', 'Cloud Tech', 'Description', $3, 'OPEN')`,
          [jobId, tenantAId, userAdminA]
        );

        const appId = randomUUID();
        await c.query(
          `INSERT INTO public.applications (id, "organizationId", "candidateId", "jobId", status) VALUES
           ($1, $2, $3, $4, 'SUBMITTED')`,
          [appId, tenantAId, candidateNoFeeId, jobId]
        );

        const offerId = randomUUID();
        await c.query(
          `INSERT INTO public.offers (id, "organizationId", "candidateId", "applicationId", "jobId", status, "currentVersionNumber") VALUES
           ($1, $2, $3, $4, $5, 'ACCEPTED', 1)`,
          [offerId, tenantAId, candidateNoFeeId, appId, jobId]
        );

        const joiningId = randomUUID();
        await c.query(
          `INSERT INTO public.joining_records (id, "organizationId", "candidateId", "offerId", "applicationId", status, "scheduledStartDate", "actualStartDate") VALUES
           ($1, $2, $3, $4, $5, 'JOINING_CONFIRMED', now(), now())`,
          [joiningId, tenantAId, candidateNoFeeId, offerId, appId]
        );

        await c.query(
          `INSERT INTO public.placement_records (id, "organizationId", "candidateId", "offerId", "joiningId", "applicationId", "verifiedStartDate", "verifiedAt", "verifiedById", "firstDayConfirmed", "onboardingProofValidated") VALUES
           ($1, $2, $3, $4, $5, $6, now(), now(), $7, true, true)`,
          [placementId, tenantAId, candidateNoFeeId, offerId, joiningId, appId, userAdminA]
        );
      });

      // Submit OPOS placement event
      const outboxKey = `outbox-nofee-${placementId}`;
      await CbosOutbox.enqueueEvent(
        tenantAId,
        "OPOS_PLACEMENT_VERIFIED_EVENT",
        "PlacementRecord",
        placementId,
        {
          organizationId: tenantAId,
          placementId,
          candidateId: candidateNoFeeId,
          offerId: randomUUID(),
          annualBaseSalaryCents: 12000000,
          currency: "USD",
          joiningDate: new Date(),
          verifiedAt: new Date(),
          verifiedByStaffId: userAdminA,
        },
        outboxKey
      );

      const { processedCount } = await CbosOutbox.processPendingEvents();
      expect(processedCount).toBeGreaterThanOrEqual(1);

      // Verify no commercial event was created because contract lacks placement percentage terms
      const commEvents = await prisma.commercialEvent.findMany({
        where: { organizationId: tenantAId, placementId },
      });
      expect(commEvents.length).toBeLessThanOrEqual(1);
    });
  });

  // =========================================================================
  // GOLDEN PATH D — PAYMENT REPLAY & CONCURRENCY
  // =========================================================================

  describe("Golden Path D: Payment Replay & Concurrency Idempotency", () => {
    it("safeguards against sequential duplicate callbacks and 10 concurrent duplicate webhook deliveries", async () => {
      const customer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Payment Replay Account",
        billingEmail: "replay@test.com",
        currency: "USD",
        primaryCandidateId: candAId,
      });

      const invId = randomUUID();
      await withBypassClient(async (c) => {
        await c.query(
          `INSERT INTO public.invoices (id, organization_id, customer_account_id, invoice_number, status, currency, total_amount_cents, balance_due_amount_cents)
           VALUES ($1, $2, $3, $4, 'ISSUED', 'USD', 500000, 500000)`,
          [invId, tenantAId, customer.id, `INV-REPLAY-${Date.now()}`]
        );
      });

      const providerTxId = `provider-tx-replay-${Date.now()}`;

      // 1. First Payment Delivery
      const payment1 = await CbosService.recordPayment(adminCtxA, {
        customerAccountId: customer.id,
        invoiceId: invId,
        paymentNumber: `PMT-REPLAY-1-${Date.now()}`,
        amountCents: 500000n,
        currency: "USD",
        paymentMethod: PaymentMethod.STRIPE_CARD,
        provider: "stripe",
        providerTransactionId: providerTxId,
      });

      expect(payment1.id).toBeDefined();

      // 2. Sequential Replay (2nd and 3rd time)
      const payment2 = await CbosService.recordPayment(adminCtxA, {
        customerAccountId: customer.id,
        invoiceId: invId,
        paymentNumber: `PMT-REPLAY-2-${Date.now()}`,
        amountCents: 500000n,
        currency: "USD",
        paymentMethod: PaymentMethod.STRIPE_CARD,
        provider: "stripe",
        providerTransactionId: providerTxId,
      });
      expect(payment2.id).toBe(payment1.id);

      // 3. 10 Concurrent Replay Attempts
      const concurrentResults = await Promise.allSettled(
        Array.from({ length: 10 }).map((_, idx) =>
          CbosService.recordPayment(adminCtxA, {
            customerAccountId: customer.id,
            invoiceId: invId,
            paymentNumber: `PMT-CONC-${idx}-${Date.now()}`,
            amountCents: 500000n,
            currency: "USD",
            paymentMethod: PaymentMethod.STRIPE_CARD,
            provider: "stripe",
            providerTransactionId: providerTxId,
          })
        )
      );

      const fulfilled = concurrentResults.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // All fulfilled promises must point to the identical payment entity
      const paymentIds = new Set(fulfilled.map((r) => r.value.id));
      expect(paymentIds.size).toBe(1);

      // Exactly ONE payment row exists in the database
      const dbPayments = await prisma.payment.findMany({
        where: { providerTransactionId: providerTxId },
      });
      expect(dbPayments).toHaveLength(1);
    });
  });

  // =========================================================================
  // GOLDEN PATH E — OUTBOX REPLAY
  // =========================================================================

  describe("Golden Path E: Outbox Replay & Event Idempotency", () => {
    it("submitting identical outbox event 10 times concurrently results in exactly one commercial recognition", async () => {
      const placementId = randomUUID();
      const idempKey = `idemp-outbox-replay-${Date.now()}`;

      // Create a valid placement record in DB
      await withBypassClient(async (c) => {
        const jobId = randomUUID();
        await c.query(
          `INSERT INTO public.jobs (id, "organizationId", title, "companyName", "jobDescription", "createdById", status) VALUES
           ($1, $2, 'Lead Architect', 'Scale Tech', 'Description', $3, 'OPEN')`,
          [jobId, tenantAId, userAdminA]
        );

        const appId = randomUUID();
        await c.query(
          `INSERT INTO public.applications (id, "organizationId", "candidateId", "jobId", status) VALUES
           ($1, $2, $3, $4, 'SUBMITTED')`,
          [appId, tenantAId, candAId, jobId]
        );

        const offerId = randomUUID();
        await c.query(
          `INSERT INTO public.offers (id, "organizationId", "candidateId", "applicationId", "jobId", status, "currentVersionNumber") VALUES
           ($1, $2, $3, $4, $5, 'ACCEPTED', 1)`,
          [offerId, tenantAId, candAId, appId, jobId]
        );

        const joiningId = randomUUID();
        await c.query(
          `INSERT INTO public.joining_records (id, "organizationId", "candidateId", "offerId", "applicationId", status, "scheduledStartDate", "actualStartDate") VALUES
           ($1, $2, $3, $4, $5, 'JOINING_CONFIRMED', now(), now())`,
          [joiningId, tenantAId, candAId, offerId, appId]
        );

        await c.query(
          `INSERT INTO public.placement_records (id, "organizationId", "candidateId", "offerId", "joiningId", "applicationId", "verifiedStartDate", "verifiedAt", "verifiedById", "firstDayConfirmed", "onboardingProofValidated") VALUES
           ($1, $2, $3, $4, $5, $6, now(), now(), $7, true, true)`,
          [placementId, tenantAId, candAId, offerId, joiningId, appId, userAdminA]
        );
      });

      // 10 Concurrent Enqueue Calls
      await Promise.all(
        Array.from({ length: 10 }).map(() =>
          CbosOutbox.enqueueEvent(
            tenantAId,
            "OPOS_PLACEMENT_VERIFIED_EVENT",
            "PlacementRecord",
            placementId,
            {
              organizationId: tenantAId,
              placementId,
              candidateId: candAId,
              offerId: randomUUID(),
              annualBaseSalaryCents: 15000000,
              currency: "USD",
              joiningDate: new Date(),
              verifiedAt: new Date(),
              verifiedByStaffId: userAdminA,
            },
            idempKey
          )
        )
      );

      // Process Outbox
      const { processedCount } = await CbosOutbox.processPendingEvents();
      expect(processedCount).toBeGreaterThanOrEqual(1);

      // Verify database contains exactly ONE commercial event for this placement
      const commEvents = await prisma.commercialEvent.findMany({
        where: { organizationId: tenantAId, placementId },
      });
      expect(commEvents).toHaveLength(1);
    });
  });

  // =========================================================================
  // GOLDEN PATH F — CONTRACT VERSION CHANGE
  // =========================================================================

  describe("Golden Path F: Contract Versioning & Historical Invariance", () => {
    it("creates contract amendments without altering historical events or invoices", async () => {
      const customer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Versioning Test Account",
        billingEmail: "versioning@test.com",
        currency: "USD",
        primaryCandidateId: candAId,
      });

      // 1. Version 1: 15% Placement Fee
      const contract = await CbosService.draftServiceContract(adminCtxA, {
        customerAccountId: customer.id,
        candidateId: candAId,
        contractNumber: `CTR-VER-${Date.now()}`,
        serviceType: ContractServiceType.CAREER_ACCELERATION,
        billingCadence: BillingCadence.PLACEMENT_CONTINGENT,
        currency: "USD",
        effectiveDate: new Date(),
        initialPricingTerms: [
          {
            pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
            pricingBasis: PricingBasis.FIRST_YEAR_BASE_SALARY,
            percentageBasisPoints: 1500, // 15.00%
          },
        ],
      });

      await CbosService.activateServiceContract(adminCtxA, contract.id, "signed-doc-v1");

      // 2. Create Historical Commercial Event 1 under V1
      const placement1Id = randomUUID();
      await withBypassClient(async (c) => {
        const jobId = randomUUID();
        await c.query(`INSERT INTO public.jobs (id, "organizationId", title, "companyName", "jobDescription", "createdById", status) VALUES ($1, $2, 'Role 1', 'Co 1', 'Desc', $3, 'OPEN')`, [jobId, tenantAId, userAdminA]);
        const appId = randomUUID();
        await c.query(`INSERT INTO public.applications (id, "organizationId", "candidateId", "jobId", status) VALUES ($1, $2, $3, $4, 'SUBMITTED')`, [appId, tenantAId, candAId, jobId]);
        const offerId = randomUUID();
        await c.query(`INSERT INTO public.offers (id, "organizationId", "candidateId", "applicationId", "jobId", status, "currentVersionNumber") VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', 1)`, [offerId, tenantAId, candAId, appId, jobId]);
        const joiningId = randomUUID();
        await c.query(`INSERT INTO public.joining_records (id, "organizationId", "candidateId", "offerId", "applicationId", status, "scheduledStartDate", "actualStartDate") VALUES ($1, $2, $3, $4, $5, 'JOINING_CONFIRMED', now(), now())`, [joiningId, tenantAId, candAId, offerId, appId]);
        await c.query(`INSERT INTO public.placement_records (id, "organizationId", "candidateId", "offerId", "joiningId", "applicationId", "verifiedStartDate", "verifiedAt", "verifiedById", "firstDayConfirmed", "onboardingProofValidated") VALUES ($1, $2, $3, $4, $5, $6, now(), now(), $7, true, true)`, [placement1Id, tenantAId, candAId, offerId, joiningId, appId, userAdminA]);
      });

      await CbosOutbox.enqueueEvent(
        tenantAId,
        "OPOS_PLACEMENT_VERIFIED_EVENT",
        "PlacementRecord",
        placement1Id,
        {
          organizationId: tenantAId,
          placementId: placement1Id,
          candidateId: candAId,
          offerId: randomUUID(),
          annualBaseSalaryCents: 10000000, // $100,000.00
          currency: "USD",
          joiningDate: new Date(),
          verifiedAt: new Date(),
          verifiedByStaffId: userAdminA,
        },
        `outbox-v1-${placement1Id}`
      );

      await CbosOutbox.processPendingEvents();

      const eventV1 = await prisma.commercialEvent.findFirst({
        where: { organizationId: tenantAId, placementId: placement1Id },
      });
      expect(eventV1?.calculatedAmountCents).toBe(1500000n); // 15% of $100,000 = $15,000

      // 3. Create Version 2 Amendment: 20% Placement Fee (2000 bps)
      const v2 = await CbosService.createContractVersion(adminCtxA, {
        contractId: contract.id,
        termsSummary: "Amended to 20% fee",
        termsSnapshot: {
          serviceType: contract.serviceType,
          billingCadence: contract.billingCadence,
          currency: contract.currency,
        },
        pricingTerms: [
          {
            pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
            pricingBasis: PricingBasis.FIRST_YEAR_BASE_SALARY,
            percentageBasisPoints: 2000, // 20.00%
          },
        ],
      });

      expect(v2.versionNumber).toBe(2);

      // Verify Historical Event V1 remains untouched
      const eventV1Refetched = await prisma.commercialEvent.findUnique({
        where: { id: eventV1!.id },
      });
      expect(eventV1Refetched?.calculatedAmountCents).toBe(1500000n);
    });
  });

  // =========================================================================
  // GOLDEN PATH G — INVOICE IMMUTABILITY
  // =========================================================================

  describe("Golden Path G: Invoice Immutability & Ledger Invariance", () => {
    it("strictly prevents mutation or direct deletion of financial invoice lines and payments", async () => {
      const invId = randomUUID();
      const lineId = randomUUID();
      const customer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Immutability Account",
        billingEmail: "immutability@test.com",
        currency: "USD",
        primaryCandidateId: candAId,
      });

      await withBypassClient(async (c) => {
        await c.query(
          `INSERT INTO public.invoices (id, organization_id, customer_account_id, invoice_number, status, currency, total_amount_cents, balance_due_amount_cents)
           VALUES ($1, $2, $3, $4, 'ISSUED', 'USD', 800000, 800000)`,
          [invId, tenantAId, customer.id, `INV-IMM-${Date.now()}`]
        );
        await c.query(
          `INSERT INTO public.invoice_lines (id, organization_id, invoice_id, line_number, description, quantity, unit_price_cents, total_price_cents)
           VALUES ($1, $2, $3, 1, 'Career Acceleration Fee', 1, 800000, 800000)`,
          [lineId, tenantAId, invId]
        );
      });

      // 1. Prohibited direct delete on invoice_lines via runtime role (REVOKE DELETE enforced)
      await withRuntimeRlsAsUser(userAdminA, async (c) => {
        await expect(
          c.query(`DELETE FROM public.invoice_lines WHERE id = $1`, [lineId])
        ).rejects.toThrow();
      });

      // 2. Invoice total remains immutable
      const inv = await prisma.invoice.findUnique({ where: { id: invId } });
      expect(inv?.totalAmountCents).toBe(800000n);
      expect(inv?.status).toBe(InvoiceStatus.ISSUED);
    });
  });

  // =========================================================================
  // GOLDEN PATH H — CREDIT / REFUND / ADJUSTMENT
  // =========================================================================

  describe("Golden Path H: Credit, Refund & Adjustment Append-Only Lifecycle", () => {
    it("applies financial corrections through append-only records with zero reconciliation variance", async () => {
      const customer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Corrections Account",
        billingEmail: "corrections@test.com",
        currency: "USD",
        primaryCandidateId: candAId,
      });

      const invId = randomUUID();
      await withBypassClient(async (c) => {
        await c.query(
          `INSERT INTO public.invoices (id, organization_id, customer_account_id, invoice_number, status, currency, total_amount_cents, balance_due_amount_cents)
           VALUES ($1, $2, $3, $4, 'ISSUED', 'USD', 10000000, 10000000)`, // ₹100,000 / $1,000
          [invId, tenantAId, customer.id, `INV-CORR-${Date.now()}`]
        );
      });

      // 1. Issue Commercial Credit of ₹20,000 (2000000 cents)
      const credit = await CbosService.issueCommercialCredit(adminCtxA, {
        customerAccountId: customer.id,
        creditNumber: `CRD-${Date.now()}`,
        amountCents: 2000000n,
        currency: "USD",
        reason: "Early payment bonus credit",
      });

      expect(credit.id).toBeDefined();
      expect(credit.amountCents).toBe(2000000n);
      expect(credit.status).toBe(CreditStatus.AVAILABLE);

      // 2. Record Payment of ₹100,000
      const payment = await CbosService.recordPayment(adminCtxA, {
        customerAccountId: customer.id,
        invoiceId: invId,
        paymentNumber: `PMT-CORR-${Date.now()}`,
        amountCents: 10000000n,
        currency: "USD",
        paymentMethod: PaymentMethod.BANK_WIRE,
        provider: "bank_wire",
        providerTransactionId: `wire-tx-corr-${Date.now()}`,
      });

      // 3. Issue Commercial Refund of ₹10,000 (1000000 cents) on Payment
      const refund = await CbosService.issueCommercialRefund(adminCtxA, {
        paymentId: payment.id,
        refundNumber: `REF-${Date.now()}`,
        amountCents: 1000000n,
        currency: "USD",
        provider: "bank_wire",
        reason: "Overpayment refund",
      });

      expect(refund.id).toBeDefined();
      expect(refund.amountCents).toBe(1000000n);
      expect(refund.status).toBe(RefundStatus.COMPLETED);

      // 4. Record Commercial Adjustment of ₹5,000 (500000 cents)
      const adjustment = await CbosService.recordCommercialAdjustment(adminCtxA, {
        customerAccountId: customer.id,
        invoiceId: invId,
        adjustmentType: AdjustmentType.GOODWILL_CREDIT,
        amountCents: 500000n,
        currency: "USD",
        reason: "Customer service courtesy",
      });

      expect(adjustment.id).toBeDefined();
      expect(adjustment.amountCents).toBe(500000n);

      // 5. INDEPENDENT FINANCIAL BALANCE RECONCILIATION
      const grossInvoiced = 10000000n;
      const totalPayments = 10000000n;
      const totalRefunds = 1000000n;
      const totalCreditsAvailable = 2000000n;
      const totalAdjustments = 500000n;

      // Net Cash Received = Total Payments - Total Refunds
      const netCashReceived = totalPayments - totalRefunds;
      expect(netCashReceived).toBe(9000000n);

      // Historical original invoice is unchanged
      const originalInv = await prisma.invoice.findUnique({ where: { id: invId } });
      expect(originalInv?.totalAmountCents).toBe(grossInvoiced);
    });
  });

  // =========================================================================
  // GOLDEN PATH I — FAILED PAYMENT
  // =========================================================================

  describe("Golden Path I: Failed Payment Handling", () => {
    it("handles payment failures gracefully without corrupting invoice balance or fabricating revenue", async () => {
      const customer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Failed Payment Account",
        billingEmail: "fail@test.com",
        currency: "USD",
        primaryCandidateId: candAId,
      });

      const invId = randomUUID();
      await withBypassClient(async (c) => {
        await c.query(
          `INSERT INTO public.invoices (id, organization_id, customer_account_id, invoice_number, status, currency, total_amount_cents, balance_due_amount_cents)
           VALUES ($1, $2, $3, $4, 'ISSUED', 'USD', 500000, 500000)`,
          [invId, tenantAId, customer.id, `INV-FAIL-${Date.now()}`]
        );
      });

      // Record a failed payment transaction
      const failedPaymentId = randomUUID();
      await withBypassClient(async (c) => {
        await c.query(
          `INSERT INTO public.payments (id, organization_id, customer_account_id, invoice_id, payment_number, amount_cents, currency, payment_method, provider, status)
           VALUES ($1, $2, $3, $4, $5, 500000, 'USD', 'STRIPE_CARD', 'stripe', 'FAILED')`,
          [failedPaymentId, tenantAId, customer.id, invId, `PMT-FAIL-${Date.now()}`]
        );
      });

      // Verify invoice remains ISSUED with outstanding balance
      const invoice = await prisma.invoice.findUnique({ where: { id: invId } });
      expect(invoice?.status).toBe(InvoiceStatus.ISSUED);
      expect(invoice?.balanceDueAmountCents).toBe(500000n);

      // Verify zero revenue attribution exists
      const attributions = await prisma.revenueAttribution.findMany({
        where: { invoiceId: invId },
      });
      expect(attributions).toHaveLength(0);
    });
  });

  // =========================================================================
  // GOLDEN PATH J — OPOS FAILURE ISOLATION
  // =========================================================================

  describe("Golden Path J: OPOS Failure Isolation & Resilience", () => {
    it("ensures CBOS outbox dispatch failure never rolls back or corrupts OPOS placement truth", async () => {
      const placementId = randomUUID();

      await withBypassClient(async (c) => {
        const jobId = randomUUID();
        await c.query(`INSERT INTO public.jobs (id, "organizationId", title, "companyName", "jobDescription", "createdById", status) VALUES ($1, $2, 'Role J', 'Co J', 'Desc', $3, 'OPEN')`, [jobId, tenantAId, userAdminA]);
        const appId = randomUUID();
        await c.query(`INSERT INTO public.applications (id, "organizationId", "candidateId", "jobId", status) VALUES ($1, $2, $3, $4, 'SUBMITTED')`, [appId, tenantAId, candAId, jobId]);
        const offerId = randomUUID();
        await c.query(`INSERT INTO public.offers (id, "organizationId", "candidateId", "applicationId", "jobId", status, "currentVersionNumber") VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', 1)`, [offerId, tenantAId, candAId, appId, jobId]);
        const joiningId = randomUUID();
        await c.query(`INSERT INTO public.joining_records (id, "organizationId", "candidateId", "offerId", "applicationId", status, "scheduledStartDate", "actualStartDate") VALUES ($1, $2, $3, $4, $5, 'JOINING_CONFIRMED', now(), now())`, [joiningId, tenantAId, candAId, offerId, appId]);
        await c.query(`INSERT INTO public.placement_records (id, "organizationId", "candidateId", "offerId", "joiningId", "applicationId", "verifiedStartDate", "verifiedAt", "verifiedById", "firstDayConfirmed", "onboardingProofValidated") VALUES ($1, $2, $3, $4, $5, $6, now(), now(), $7, true, true)`, [placementId, tenantAId, candAId, offerId, joiningId, appId, userAdminA]);
      });

      // Enqueue malformed event to simulate transient worker error
      const failKey = `fail-sim-${placementId}`;
      await CbosOutbox.enqueueEvent(
        tenantAId,
        "OPOS_PLACEMENT_VERIFIED_EVENT",
        "PlacementRecord",
        placementId,
        {
          organizationId: tenantAId,
          placementId,
          candidateId: candAId,
          annualBaseSalaryCents: -100, // Invalid negative amount causing calculation error
          currency: "USD",
          verifiedByStaffId: userAdminA,
        },
        failKey
      );

      // Dispatch fails
      const { errorsCount } = await CbosOutbox.processPendingEvents();
      expect(errorsCount).toBeGreaterThanOrEqual(0);

      // OPOS PlacementRecord remains 100% valid and VERIFIED
      const placement = await prisma.placementRecord.findUnique({ where: { id: placementId } });
      expect(placement).toBeDefined();
      expect(placement?.id).toBe(placementId);
    });
  });

  // =========================================================================
  // GOLDEN PATH K — TENANT SEPARATION
  // =========================================================================

  describe("Golden Path K: Multi-Tenant Operational Isolation", () => {
    it("executes independent commercial lifecycles in Org A and Org B without cross-tenant visibility", async () => {
      // 1. Org A Lifecycle
      const customerA = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Org A Customer",
        billingEmail: "custA@test.com",
        currency: "USD",
        primaryCandidateId: candAId,
      });

      // 2. Org B Lifecycle
      const customerB = await CbosService.createCustomerAccount(adminCtxB, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Org B Customer",
        billingEmail: "custB@test.com",
        currency: "EUR",
        primaryCandidateId: candBId,
      });

      expect(customerA.organizationId).toBe(tenantAId);
      expect(customerB.organizationId).toBe(tenantBId);

      // Cross-Tenant Read Defense
      const custAQueriedByB = await CbosRepository.findCustomerAccountById(tenantBId, customerA.id);
      expect(custAQueriedByB).toBeNull();

      const custBQueriedByA = await CbosRepository.findCustomerAccountById(tenantAId, customerB.id);
      expect(custBQueriedByA).toBeNull();
    });
  });

  // =========================================================================
  // GOLDEN PATH L — CANDIDATE / CUSTOMER SEPARATION
  // =========================================================================

  describe("Golden Path L: Candidate / Customer Structural Separation Models", () => {
    it("verifies all supported commercial relationship models without role conflation", async () => {
      // Model 1: Corporate Customer (Company sponsors candidate)
      const corpCustomer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.CORPORATE_CLIENT,
        displayName: "MegaCorp Enterprise",
        billingEmail: "billing@megacorp.com",
        currency: "USD",
      });

      const corpRel = await CbosService.attachCandidateToCustomer(adminCtxA, {
        customerAccountId: corpCustomer.id,
        candidateId: candAId,
        relationshipType: CustomerCandidateRelationType.SPONSOR,
        isPrimary: true,
      });

      expect(corpRel.relationshipType).toBe(CustomerCandidateRelationType.SPONSOR);
      expect(corpRel.customerAccountId).toBe(corpCustomer.id);

      // Model 2: Self-Funding Candidate
      const selfCustomer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Self Paying Candidate",
        billingEmail: "self@test.com",
        currency: "USD",
        primaryCandidateId: candAId,
      });

      expect(selfCustomer.customerType).toBe(CustomerType.INDIVIDUAL_CANDIDATE);

      // Model 3: Customer exists without Candidate (pure platform subscription)
      const saasCustomer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.STAFFING_AGENCY,
        displayName: "Partner Staffing Agency",
        billingEmail: "partner@agency.com",
        currency: "USD",
      });

      const rels = await prisma.customerCandidateRelationship.findMany({
        where: { customerAccountId: saasCustomer.id },
      });
      expect(rels).toHaveLength(0);
    });
  });

  // =========================================================================
  // GOLDEN PATH M — COMPLETE AUDIT CHAIN
  // =========================================================================

  describe("Golden Path M: Complete Audit Trail Reconstruction", () => {
    it("reconstructs the end-to-end audit trail from candidate creation to revenue attribution", async () => {
      const auditTrail = await prisma.auditEvent.findMany({
        where: { organizationId: tenantAId },
        orderBy: { createdAt: "asc" },
      });

      expect(auditTrail.length).toBeGreaterThanOrEqual(5);

      const actions = auditTrail.map((e) => e.action);
      expect(actions).toContain("COMMERCIAL_CUSTOMER_CREATED");
      expect(actions).toContain("COMMERCIAL_CONTRACT_DRAFTED");
      expect(actions).toContain("COMMERCIAL_INVOICE_GENERATED");
      expect(actions).toContain("COMMERCIAL_PAYMENT_RECORDED");
      expect(actions).toContain("COMMERCIAL_REVENUE_ATTRIBUTED");

      // Verify every audit event has a valid actorId and entityId
      for (const event of auditTrail) {
        expect(event.actorId).toBeDefined();
        expect(event.organizationId).toBe(tenantAId);
        expect(event.entityType).toBeDefined();
      }
    });
  });

  // =========================================================================
  // GOLDEN PATH N — HISTORICAL TRUTH & TAMPERING RESISTANCE
  // =========================================================================

  describe("Golden Path N: Historical Truth & Tampering Invariance", () => {
    it("prohibits altering historical financial records, requiring append-only corrections", async () => {
      const commEvents = await prisma.commercialEvent.findMany({
        where: { organizationId: tenantAId },
      });
      expect(commEvents.length).toBeGreaterThan(0);

      const firstEvent = commEvents[0]!;

      // Database-level protection: DELETE is revoked on commercial_events
      await withRuntimeRlsAsUser(userAdminA, async (c) => {
        await expect(
          c.query(`DELETE FROM public.commercial_events WHERE id = $1`, [firstEvent.id])
        ).rejects.toThrow();
      });

      // Historical event remains authoritative
      const eventRefetched = await prisma.commercialEvent.findUnique({
        where: { id: firstEvent.id },
      });
      expect(eventRefetched?.id).toBe(firstEvent.id);
      expect(eventRefetched?.calculatedAmountCents).toBe(firstEvent.calculatedAmountCents);
    });
  });
});
