import { config } from "dotenv";
config({ path: ".env" });
import { randomUUID } from "crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { CbosService } from "@/lib/cbos/cbos-service";
import { CbosOutbox } from "@/lib/cbos/cbos-outbox";
import {
  CustomerType,
  CustomerStatus,
  ContractServiceType,
  BillingCadence,
  PricingModel,
  PricingBasis,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  CreditStatus,
  RefundStatus,
  AdjustmentType,
  EntitlementType,
} from "@/lib/cbos/types";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";

describe("Phase 10E — CBOS Service Integration", () => {
  let orgId: string;
  let adminUserId: string;
  let candidateUserId: string;
  let candidateId: string;
  let adminContext: AuthenticatedContext;
  let candidateContext: AuthenticatedContext;

  beforeEach(async () => {
    // 1. Create Organization
    const org = await prisma.organization.create({
      data: {
        name: `CBOS Test Org ${Date.now()}`,
        slug: `cbos-org-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      },
    });
    orgId = org.id;

    // 2. Create Admin User
    adminUserId = randomUUID();
    await prisma.user.upsert({
      where: { id: adminUserId },
      update: {},
      create: {
        id: adminUserId,
        email: `admin-${Date.now()}-${randomUUID().slice(0, 4)}@cbostest.com`,
        status: "ACTIVE",
      },
    });

    await prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: adminUserId,
        role: Role.ADMIN,
      },
    });

    // 3. Create Candidate User & Profile
    candidateUserId = randomUUID();
    await prisma.user.upsert({
      where: { id: candidateUserId },
      update: {},
      create: {
        id: candidateUserId,
        email: `candidate-${Date.now()}-${randomUUID().slice(0, 4)}@cbostest.com`,
        status: "ACTIVE",
      },
    });

    await prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: candidateUserId,
        role: Role.CANDIDATE,
      },
    });

    const candidate = await prisma.candidate.create({
      data: {
        organizationId: orgId,
        userId: candidateUserId,
        status: "ACTIVE",
        verificationStatus: "VERIFIED",
      },
    });
    candidateId = candidate.id;

    adminContext = {
      userId: adminUserId,
      email: "admin@cbostest.com",
      organizationId: orgId,
      role: Role.ADMIN,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };

    candidateContext = {
      userId: candidateUserId,
      email: "candidate@cbostest.com",
      organizationId: orgId,
      role: Role.CANDIDATE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
  });

  afterEach(async () => {
    // Cleanup created data
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.revenueAttribution.deleteMany({ where: { organizationId: orgId } });
    await prisma.commercialAdjustment.deleteMany({ where: { organizationId: orgId } });
    await prisma.commercialRefund.deleteMany({ where: { organizationId: orgId } });
    await prisma.commercialCredit.deleteMany({ where: { organizationId: orgId } });
    await prisma.payment.deleteMany({ where: { organizationId: orgId } });
    await prisma.invoiceLine.deleteMany({ where: { organizationId: orgId } });
    await prisma.invoice.deleteMany({ where: { organizationId: orgId } });
    await prisma.commercialEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.cbosOutboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.pricingTerm.deleteMany({ where: { organizationId: orgId } });
    await prisma.serviceEntitlement.deleteMany({ where: { organizationId: orgId } });
    await prisma.serviceContractVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.serviceContract.deleteMany({ where: { organizationId: orgId } });
    await prisma.customerCandidateRelationship.deleteMany({ where: { organizationId: orgId } });
    await prisma.customerAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.placementRecord.deleteMany({ where: { organizationId: orgId } });
    await prisma.joiningRecord.deleteMany({ where: { organizationId: orgId } });
    await prisma.offerVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.offer.deleteMany({ where: { organizationId: orgId } });
    await prisma.application.deleteMany({ where: { organizationId: orgId } });
    await prisma.job.deleteMany({ where: { organizationId: orgId } });
    await prisma.candidate.deleteMany({ where: { organizationId: orgId } });
    await prisma.membership.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, candidateUserId] } } });
  });

  it("executes the full end-to-end commercial lifecycle with 100% mathematical precision", async () => {
    // 1. Create Customer Account
    const customer = await CbosService.createCustomerAccount(adminContext, {
      customerType: CustomerType.INDIVIDUAL_CANDIDATE,
      displayName: "Jane Doe Billing Account",
      billingEmail: "jane.billing@example.com",
      currency: "USD",
      primaryCandidateId: candidateId,
    });

    expect(customer.id).toBeDefined();
    expect(customer.status).toBe(CustomerStatus.ACTIVE);

    // 2. Draft Service Contract with 15% Placement Fee & Retainer
    const contract = await CbosService.draftServiceContract(adminContext, {
      customerAccountId: customer.id,
      candidateId,
      contractNumber: `CTR-${Date.now()}`,
      serviceType: ContractServiceType.CAREER_ACCELERATION,
      billingCadence: BillingCadence.HYBRID_RETAINER_PLACEMENT,
      currency: "USD",
      effectiveDate: new Date(),
      initialPricingTerms: [
        {
          pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
          pricingBasis: PricingBasis.FIRST_YEAR_BASE_SALARY,
          percentageBasisPoints: 1500, // 15.00%
          minimumFeeCents: 1000000n, // $10,000 min
          retainerCreditOffset: true,
        },
      ],
      initialEntitlements: [
        {
          candidateId,
          entitlementType: EntitlementType.APPLICATION_VOLUME_MONTHLY,
          allocatedQuota: 60,
        },
      ],
    });

    expect(contract.id).toBeDefined();
    expect(contract.currentVersionNumber).toBe(1);

    // 3. Activate Contract
    const activatedContract = await CbosService.activateServiceContract(adminContext, contract.id, "DOC-SIGNED-001");
    expect(activatedContract.status).toBe("ACTIVE");

    // 4. Trigger OPOS Placement Verified Event via Outbox
    const job = await prisma.job.create({
      data: {
        organizationId: orgId,
        title: "Staff Software Engineer",
        companyName: "Acme Corp",
        jobDescription: "Engineering role",
        location: "Remote",
        isRemote: true,
        employmentType: "FULL_TIME",
        status: "OPEN",
        visibility: "GLOBAL",
        createdById: adminUserId,
      },
    });

    const application = await prisma.application.create({
      data: {
        organizationId: orgId,
        candidateId,
        jobId: job.id,
        status: "SUBMITTED",
      },
    });

    const offer = await prisma.offer.create({
      data: {
        organizationId: orgId,
        candidateId,
        applicationId: application.id,
        jobId: job.id,
        status: "ACCEPTED",
        currentVersionNumber: 1,
      },
    });

    const joining = await prisma.joiningRecord.create({
      data: {
        organizationId: orgId,
        candidateId,
        offerId: offer.id,
        applicationId: application.id,
        status: "JOINING_CONFIRMED",
        scheduledStartDate: new Date(),
        actualStartDate: new Date(),
      },
    });

    const placement = await prisma.placementRecord.create({
      data: {
        organizationId: orgId,
        candidateId,
        offerId: offer.id,
        joiningId: joining.id,
        applicationId: application.id,
        verifiedStartDate: new Date(),
        verifiedAt: new Date(),
        verifiedById: adminUserId,
      },
    });

    await CbosOutbox.enqueueEvent(
      orgId,
      "OPOS_PLACEMENT_VERIFIED_EVENT",
      "PlacementRecord",
      placement.id,
      {
        organizationId: orgId,
        placementId: placement.id,
        candidateId,
        offerId: offer.id,
        annualBaseSalaryCents: 20000000, // $200,000.00
        currency: "USD",
        joiningDate: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        verifiedByStaffId: adminUserId,
      },
      `outbox-placement-${placement.id}`
    );

    // Process Outbox
    const { processedCount, errorsCount } = await CbosOutbox.processPendingEvents();
    expect(errorsCount).toBe(0);
    expect(processedCount).toBeGreaterThanOrEqual(1);

    // Check Commercial Event was generated (15% of $200,000 = $30,000.00 = 3,000,000 cents)
    const commEvent = await prisma.commercialEvent.findFirst({
      where: { organizationId: orgId, placementId: placement.id },
    });
    expect(commEvent).toBeDefined();
    expect(commEvent?.calculatedAmountCents).toBe(3000000n);

    // 5. Generate and Issue Invoice
    const invoice = await CbosService.generateInvoiceFromEvent(adminContext, {
      commercialEventId: commEvent!.id,
      invoiceNumber: `INV-${Date.now()}`,
      paymentTermsDays: 15,
      taxRateBasisPoints: 0,
    });

    expect(invoice.status).toBe(InvoiceStatus.DRAFT);
    expect(invoice.totalAmountCents).toBe(3000000n);
    expect(invoice.balanceDueAmountCents).toBe(3000000n);

    const issuedInvoice = await CbosService.issueInvoice(adminContext, invoice.id);
    expect(issuedInvoice.status).toBe(InvoiceStatus.ISSUED);
    expect(issuedInvoice.issueDate).toBeDefined();

    // 6. Record Payment (Settles Invoice in full)
    const payment = await CbosService.recordPayment(adminContext, {
      customerAccountId: customer.id,
      invoiceId: issuedInvoice.id,
      paymentNumber: `PMT-${Date.now()}`,
      amountCents: 3000000n,
      currency: "USD",
      paymentMethod: PaymentMethod.BANK_WIRE,
      provider: "bank_wire",
      providerTransactionId: `wire-tx-${Date.now()}`,
    });

    expect(payment.status).toBe(PaymentStatus.COMPLETED);

    // Verify Invoice is now PAID
    const paidInvoice = await prisma.invoice.findUnique({ where: { id: issuedInvoice.id } });
    expect(paidInvoice?.status).toBe(InvoiceStatus.PAID);
    expect(paidInvoice?.balanceDueAmountCents).toBe(0n);
    expect(paidInvoice?.totalPaidAmountCents).toBe(3000000n);

    // 7. Attribute Revenue
    const attribution = await CbosService.attributeRevenue(adminContext, {
      invoiceId: paidInvoice!.id,
      paymentId: payment.id,
      candidateId,
      placementId: placement.id,
      attributedAmountCents: 3000000n,
      strategistStaffId: adminUserId,
    });
    expect(attribution.id).toBeDefined();
    expect(attribution.attributedAmountCents).toBe(3000000n);

    // 8. Issue Refund ($5,000 partial refund)
    const refund = await CbosService.issueCommercialRefund(adminContext, {
      paymentId: payment.id,
      refundNumber: `REF-${Date.now()}`,
      amountCents: 500000n,
      provider: "bank_wire",
      reason: "Client goodwill concession",
    });

    expect(refund.status).toBe(RefundStatus.COMPLETED);
    const updatedPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updatedPayment?.refundedAmountCents).toBe(500000n);
    expect(updatedPayment?.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);

    // 9. Candidate Privacy-Safe Summary
    const candidateSummary = await CbosService.getCandidateBillingSummary(candidateContext, candidateId);
    expect(candidateSummary.hasActiveCustomerAccount).toBe(true);
    expect(candidateSummary.invoices.length).toBe(1);
    expect(candidateSummary.invoices[0]!.status).toBe(InvoiceStatus.PAID);
    expect(candidateSummary.invoices[0]!.totalAmountFormatted).toBe("USD 30,000.00");
  }, 60000);
});
