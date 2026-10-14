/**
 * Phase 10E — Commercial & Billing Operating System (CBOS) Authoritative Service
 * Central service layer governing all commercial state transitions, invoice generation,
 * payment recording, append-only adjustments, and placement fee processing.
 */

import { prisma } from "@/lib/db/prisma";
import {
  AuditAction,
  CustomerStatus,
  ContractStatus,
  InvoiceStatus,
  PaymentStatus,
  CreditStatus,
  RefundStatus,
  CommercialEventType,
  type CustomerAccount,
  type CustomerCandidateRelationship,
  type ServiceContract,
  type ServiceContractVersion,
  type CommercialEvent,
  type Invoice,
  type Payment,
  type CommercialCredit,
  type CommercialRefund,
  type CommercialAdjustment,
  type RevenueAttribution,
  Prisma,
} from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { logUserAuditEvent } from "@/lib/audit";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from "@/lib/errors";
import { CbosAuthorization } from "./authorization";
import { CbosLifecycle } from "./lifecycle";
import { CbosRepository } from "./cbos-repository";
import { PricingEngine } from "./pricing-engine";
import type {
  CreateCustomerAccountInput,
  UpdateCustomerAccountInput,
  AttachCandidateToCustomerInput,
  DraftServiceContractInput,
  CreateContractVersionInput,
  CreateCommercialEventInput,
  GenerateInvoiceFromEventInput,
  CreateManualInvoiceInput,
  RecordPaymentInput,
  IssueCommercialCreditInput,
  IssueCommercialRefundInput,
  RecordCommercialAdjustmentInput,
  AttributeRevenueInput,
  OposPlacementVerifiedEventPayload,
  CandidateBillingSummaryDTO,
} from "./types";

export class CbosService {
  // =========================================================================
  // 1. CUSTOMER ACCOUNT OPERATIONS
  // =========================================================================

  static async createCustomerAccount(
    context: AuthenticatedContext,
    input: CreateCustomerAccountInput
  ): Promise<CustomerAccount> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    return prisma.$transaction(async (tx) => {
      const customer = await CbosRepository.createCustomerAccount(
        {
          organizationId: context.organizationId,
          customerType: input.customerType,
          displayName: input.displayName,
          legalName: input.legalName ?? null,
          billingEmail: input.billingEmail.toLowerCase().trim(),
          billingPhone: input.billingPhone ?? null,
          taxIdentifier: input.taxIdentifier ?? null,
          billingAddress: input.billingAddress ? (input.billingAddress as Prisma.InputJsonValue) : Prisma.JsonNull,
          currency: input.currency || "USD",
          status: CustomerStatus.ACTIVE,
          primaryCandidateId: input.primaryCandidateId ?? null,
        },
        tx
      );

      // If primary candidate provided, establish relation
      if (input.primaryCandidateId) {
        const candidate = await tx.candidate.findFirst({
          where: { id: input.primaryCandidateId, organizationId: context.organizationId },
        });
        if (!candidate) {
          throw new ValidationError(`Candidate ${input.primaryCandidateId} not found in organization.`);
        }

        await CbosRepository.createCustomerCandidateRelationship(
          {
            organizationId: context.organizationId,
            customerAccountId: customer.id,
            candidateId: input.primaryCandidateId,
            relationshipType: "SELF_FUNDING",
            isPrimary: true,
            status: "ACTIVE",
          },
          tx
        );
      }

      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.COMMERCIAL_CUSTOMER_CREATED,
        entityType: "CustomerAccount",
        entityId: customer.id,
        details: {
          customerType: customer.customerType,
          displayName: customer.displayName,
          billingEmail: customer.billingEmail,
        },
        tx,
      });

      return customer;
    });
  }

  static async updateCustomerAccount(
    context: AuthenticatedContext,
    customerId: string,
    input: UpdateCustomerAccountInput
  ): Promise<CustomerAccount> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const existing = await CbosRepository.findCustomerAccountById(context.organizationId, customerId);
    if (!existing) {
      throw new NotFoundError(`CustomerAccount ${customerId} not found.`);
    }

    const updated = await CbosRepository.updateCustomerAccount(context.organizationId, customerId, {
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.billingEmail ? { billingEmail: input.billingEmail.toLowerCase().trim() } : {}),
      ...(input.billingPhone !== undefined ? { billingPhone: input.billingPhone } : {}),
      ...(input.taxIdentifier !== undefined ? { taxIdentifier: input.taxIdentifier } : {}),
      ...(input.billingAddress !== undefined
        ? { billingAddress: input.billingAddress ? (input.billingAddress as Prisma.InputJsonValue) : Prisma.JsonNull }
        : {}),
      ...(input.currency ? { currency: input.currency } : {}),
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_CUSTOMER_UPDATED,
      entityType: "CustomerAccount",
      entityId: customerId,
      details: { previous: existing, updated },
    });

    return updated;
  }

  static async setCustomerStatus(
    context: AuthenticatedContext,
    customerId: string,
    newStatus: CustomerStatus
  ): Promise<CustomerAccount> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const existing = await CbosRepository.findCustomerAccountById(context.organizationId, customerId);
    if (!existing) {
      throw new NotFoundError(`CustomerAccount ${customerId} not found.`);
    }

    CbosLifecycle.validateCustomerTransition(existing.status, newStatus);

    const updated = await CbosRepository.updateCustomerAccount(context.organizationId, customerId, {
      status: newStatus,
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_CUSTOMER_STATUS_CHANGED,
      entityType: "CustomerAccount",
      entityId: customerId,
      details: { from: existing.status, to: newStatus },
    });

    return updated;
  }

  // =========================================================================
  // 2. CUSTOMER-CANDIDATE RELATIONSHIP OPERATIONS
  // =========================================================================

  static async attachCandidateToCustomer(
    context: AuthenticatedContext,
    input: AttachCandidateToCustomerInput
  ): Promise<CustomerCandidateRelationship> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const customer = await CbosRepository.findCustomerAccountById(context.organizationId, input.customerAccountId);
    if (!customer) {
      throw new NotFoundError(`CustomerAccount ${input.customerAccountId} not found.`);
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: input.candidateId },
      select: { organizationId: true },
    });
    if (!candidate || candidate.organizationId !== context.organizationId) {
      throw new NotFoundError(`Candidate ${input.candidateId} not found.`);
    }

    const relationship = await CbosRepository.createCustomerCandidateRelationship({
      organizationId: context.organizationId,
      customerAccountId: input.customerAccountId,
      candidateId: input.candidateId,
      relationshipType: input.relationshipType,
      effectiveFrom: input.effectiveFrom || new Date(),
      isPrimary: input.isPrimary ?? true,
      status: "ACTIVE",
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_CANDIDATE_RELATION_CREATED,
      entityType: "CustomerCandidateRelationship",
      entityId: relationship.id,
      details: {
        customerAccountId: input.customerAccountId,
        candidateId: input.candidateId,
        relationshipType: input.relationshipType,
      },
    });

    return relationship;
  }

  // =========================================================================
  // 3. SERVICE CONTRACT OPERATIONS
  // =========================================================================

  static async draftServiceContract(
    context: AuthenticatedContext,
    input: DraftServiceContractInput
  ): Promise<ServiceContract> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const customer = await CbosRepository.findCustomerAccountById(context.organizationId, input.customerAccountId);
    if (!customer) {
      throw new NotFoundError(`CustomerAccount ${input.customerAccountId} not found.`);
    }

    if (input.candidateId) {
      const candidate = await prisma.candidate.findUnique({
        where: { id: input.candidateId },
        select: { organizationId: true },
      });
      if (!candidate || candidate.organizationId !== context.organizationId) {
        throw new NotFoundError(`Candidate ${input.candidateId} not found.`);
      }
    }

    return prisma.$transaction(async (tx) => {
      // 1. Create root ServiceContract
      const contract = await CbosRepository.createServiceContract(
        {
          organizationId: context.organizationId,
          customerAccountId: input.customerAccountId,
          candidateId: input.candidateId ?? null,
          contractNumber: input.contractNumber,
          serviceType: input.serviceType,
          billingCadence: input.billingCadence,
          currency: input.currency || customer.currency || "USD",
          effectiveDate: input.effectiveDate,
          expirationDate: input.expirationDate ?? null,
          paymentTermsDays: input.paymentTermsDays ?? 0,
          status: ContractStatus.DRAFT,
          currentVersionNumber: 1,
        },
        tx
      );

      // 2. Create immutable Version 1
      const version = await CbosRepository.createContractVersion(
        {
          organizationId: context.organizationId,
          contractId: contract.id,
          versionNumber: 1,
          effectiveFrom: input.effectiveDate,
          termsSummary: `Initial draft terms for ${input.serviceType} contract`,
          termsSnapshot: {
            serviceType: input.serviceType,
            billingCadence: input.billingCadence,
            currency: contract.currency,
            pricingTerms: input.initialPricingTerms.map(pt => ({
              ...pt,
              fixedAmountCents: pt.fixedAmountCents ? pt.fixedAmountCents.toString() : null,
              minimumFeeCents: pt.minimumFeeCents ? pt.minimumFeeCents.toString() : null,
              maximumFeeCents: pt.maximumFeeCents ? pt.maximumFeeCents.toString() : null,
            })),
          } as Prisma.InputJsonValue,
          createdByStaffId: context.userId,
        },
        tx
      );

      // 3. Create Pricing Terms linked to Version 1
      for (const pt of input.initialPricingTerms) {
        await CbosRepository.createPricingTerm(
          {
            organizationId: context.organizationId,
            contractId: contract.id,
            contractVersionId: version.id,
            pricingModel: pt.pricingModel,
            pricingBasis: pt.pricingBasis ?? null,
            percentageBasisPoints: pt.percentageBasisPoints ?? null,
            fixedAmountCents: pt.fixedAmountCents ?? null,
            currency: contract.currency,
            minimumFeeCents: pt.minimumFeeCents ?? null,
            maximumFeeCents: pt.maximumFeeCents ?? null,
            retainerCreditOffset: pt.retainerCreditOffset ?? false,
            effectiveFrom: input.effectiveDate,
          },
          tx
        );
      }

      // 4. Create Entitlements if specified
      if (input.initialEntitlements) {
        for (const ent of input.initialEntitlements) {
          const candidateId = ent.candidateId || contract.candidateId;
          if (!candidateId) {
            throw new ValidationError("ServiceEntitlement requires a candidateId or contract candidateId.");
          }
          await CbosRepository.createServiceEntitlement(
            {
              organizationId: context.organizationId,
              contractId: contract.id,
              candidateId,
              entitlementType: ent.entitlementType,
              allocatedQuota: ent.allocatedQuota,
              consumedQuota: 0,
              validFrom: input.effectiveDate,
              validTo: ent.validTo ?? input.expirationDate ?? null,
              status: "ACTIVE",
            },
            tx
          );
        }
      }

      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.COMMERCIAL_CONTRACT_DRAFTED,
        entityType: "ServiceContract",
        entityId: contract.id,
        details: {
          contractNumber: contract.contractNumber,
          customerAccountId: contract.customerAccountId,
          serviceType: contract.serviceType,
        },
        tx,
      });

      return contract;
    });
  }

  static async activateServiceContract(
    context: AuthenticatedContext,
    contractId: string,
    signedDocumentId?: string
  ): Promise<ServiceContract> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const contract = await CbosRepository.findContractById(context.organizationId, contractId);
    if (!contract) {
      throw new NotFoundError(`ServiceContract ${contractId} not found.`);
    }

    CbosLifecycle.validateContractTransition(contract.status, ContractStatus.ACTIVE);

    const updated = await CbosRepository.updateServiceContract(context.organizationId, contractId, {
      status: ContractStatus.ACTIVE,
      signedAt: new Date(),
      ...(signedDocumentId ? { signedDocumentId } : {}),
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_CONTRACT_ACTIVATED,
      entityType: "ServiceContract",
      entityId: contractId,
      details: { contractNumber: contract.contractNumber, signedDocumentId },
    });

    return updated;
  }

  static async createContractVersion(
    context: AuthenticatedContext,
    input: CreateContractVersionInput
  ): Promise<ServiceContractVersion> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const contract = await CbosRepository.findContractById(context.organizationId, input.contractId);
    if (!contract) {
      throw new NotFoundError(`ServiceContract ${input.contractId} not found.`);
    }

    return prisma.$transaction(async (tx) => {
      const nextVersionNumber = contract.currentVersionNumber + 1;

      // 1. Create immutable next version
      const version = await CbosRepository.createContractVersion(
        {
          organizationId: context.organizationId,
          contractId: contract.id,
          versionNumber: nextVersionNumber,
          effectiveFrom: new Date(),
          termsSummary: input.termsSummary,
          termsSnapshot: input.termsSnapshot as Prisma.InputJsonValue,
          createdByStaffId: context.userId,
        },
        tx
      );

      // 2. Create updated pricing terms linked to new version
      for (const pt of input.pricingTerms) {
        await CbosRepository.createPricingTerm(
          {
            organizationId: context.organizationId,
            contractId: contract.id,
            contractVersionId: version.id,
            pricingModel: pt.pricingModel,
            pricingBasis: pt.pricingBasis ?? null,
            percentageBasisPoints: pt.percentageBasisPoints ?? null,
            fixedAmountCents: pt.fixedAmountCents ?? null,
            currency: contract.currency,
            minimumFeeCents: pt.minimumFeeCents ?? null,
            maximumFeeCents: pt.maximumFeeCents ?? null,
            retainerCreditOffset: pt.retainerCreditOffset ?? false,
            effectiveFrom: new Date(),
          },
          tx
        );
      }

      // 3. Update contract currentVersionNumber
      await CbosRepository.updateServiceContract(
        context.organizationId,
        contract.id,
        { currentVersionNumber: nextVersionNumber },
        tx
      );

      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.COMMERCIAL_CONTRACT_VERSION_CREATED,
        entityType: "ServiceContractVersion",
        entityId: version.id,
        details: {
          contractId: contract.id,
          versionNumber: nextVersionNumber,
          termsSummary: input.termsSummary,
        },
        tx,
      });

      return version;
    });
  }

  static async terminateServiceContract(
    context: AuthenticatedContext,
    contractId: string,
    cancellationReason: string
  ): Promise<ServiceContract> {
    CbosAuthorization.assertAdminOnlyAuthority(context, context.organizationId);

    const contract = await CbosRepository.findContractById(context.organizationId, contractId);
    if (!contract) {
      throw new NotFoundError(`ServiceContract ${contractId} not found.`);
    }

    CbosLifecycle.validateContractTransition(contract.status, ContractStatus.TERMINATED);

    const updated = await CbosRepository.updateServiceContract(context.organizationId, contractId, {
      status: ContractStatus.TERMINATED,
      cancellationReason,
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_CONTRACT_TERMINATED,
      entityType: "ServiceContract",
      entityId: contractId,
      details: { cancellationReason },
    });

    return updated;
  }

  // =========================================================================
  // 4. COMMERCIAL EVENT & OPOS PLACEMENT PROCESSING
  // =========================================================================

  static async createCommercialEvent(
    context: AuthenticatedContext,
    input: CreateCommercialEventInput
  ): Promise<CommercialEvent> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    // Idempotency check
    const existing = await CbosRepository.findCommercialEventByIdempotencyKey(
      context.organizationId,
      input.idempotencyKey
    );
    if (existing) {
      return existing; // Idempotent return
    }

    const event = await CbosRepository.createCommercialEvent({
      organizationId: context.organizationId,
      customerAccountId: input.customerAccountId,
      candidateId: input.candidateId ?? null,
      serviceContractId: input.serviceContractId ?? null,
      placementId: input.placementId ?? null,
      eventType: input.eventType,
      calculatedAmountCents: input.calculatedAmountCents,
      currency: input.currency || "USD",
      pricingTermId: input.pricingTermId ?? null,
      idempotencyKey: input.idempotencyKey,
      sourceSystem: input.sourceSystem || "OPOS",
      sourceReferenceId: input.sourceReferenceId ?? null,
      occurredAt: input.occurredAt || new Date(),
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_EVENT_RECORDED,
      entityType: "CommercialEvent",
      entityId: event.id,
      details: {
        eventType: event.eventType,
        calculatedAmountCents: event.calculatedAmountCents.toString(),
        idempotencyKey: event.idempotencyKey,
      },
    });

    return event;
  }

  /**
   * Authoritative handler for OPOS Placement Verified event.
   * Evaluates active contract for candidate, calculates fee, and creates CommercialEvent.
   */
  static async processPlacementVerifiedEvent(
    payload: OposPlacementVerifiedEventPayload
  ): Promise<{ commercialEvent: CommercialEvent | null; eligible: boolean; reason: string }> {
    const { organizationId, placementId, candidateId, annualBaseSalaryCents, currency } = payload;

    const baseSalaryBigInt = BigInt(annualBaseSalaryCents);

    // 1. Locate active ServiceContract for candidate
    const contract = await CbosRepository.findActiveContractForCandidate(organizationId, candidateId);
    if (!contract) {
      return {
        commercialEvent: null,
        eligible: false,
        reason: "No active ServiceContract found for candidate in organization.",
      };
    }

    // 2. Find eligible pricing term for placement fee
    const pricingTerm = contract.pricingTerms.find(
      (pt) => pt.pricingModel === "PERCENTAGE_COMPENSATION" || pt.pricingModel === "FIXED_FEE" || pt.pricingModel === "TIERED_COMPENSATION" || pt.pricingModel === "HYBRID"
    );

    if (!pricingTerm) {
      return {
        commercialEvent: null,
        eligible: false,
        reason: "Active contract has no eligible placement fee pricing terms.",
      };
    }

    // 3. Deterministically calculate fee
    const calculation = PricingEngine.calculateFee({
      pricingTerm: {
        pricingModel: pricingTerm.pricingModel,
        pricingBasis: pricingTerm.pricingBasis,
        percentageBasisPoints: pricingTerm.percentageBasisPoints,
        fixedAmountCents: pricingTerm.fixedAmountCents,
        minimumFeeCents: pricingTerm.minimumFeeCents,
        maximumFeeCents: pricingTerm.maximumFeeCents,
        retainerCreditOffset: pricingTerm.retainerCreditOffset,
        currency: pricingTerm.currency,
      },
      candidateCompensationBasisCents: baseSalaryBigInt,
    });

    // 4. Create authoritative CommercialEvent with unique idempotency key
    const idempotencyKey = `comm-placement-${organizationId}-${placementId}`;
    const commercialEvent = await CbosRepository.createCommercialEvent({
      organizationId,
      customerAccountId: contract.customerAccountId,
      candidateId,
      serviceContractId: contract.id,
      placementId,
      eventType: CommercialEventType.PLACEMENT_FEE_TRIGGERED,
      calculatedAmountCents: calculation.netPayableFeeCents,
      currency: calculation.currency,
      pricingTermId: pricingTerm.id,
      idempotencyKey,
      sourceSystem: "OPOS",
      sourceReferenceId: placementId,
      occurredAt: new Date(),
    });

    await logUserAuditEvent({
      userId: payload.verifiedByStaffId,
      organizationId,
      action: AuditAction.COMMERCIAL_EVENT_RECORDED,
      entityType: "CommercialEvent",
      entityId: commercialEvent.id,
      details: {
        eventType: "PLACEMENT_FEE_TRIGGERED",
        calculatedFeeCents: calculation.netPayableFeeCents.toString(),
        calculationBreakdown: calculation.calculationBreakdown,
      },
    });

    return {
      commercialEvent,
      eligible: true,
      reason: `Successfully triggered placement fee: ${calculation.calculationBreakdown}`,
    };
  }

  // =========================================================================
  // 5. INVOICE OPERATIONS
  // =========================================================================

  static async generateInvoiceFromEvent(
    context: AuthenticatedContext,
    input: GenerateInvoiceFromEventInput
  ): Promise<Invoice> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const event = await CbosRepository.findCommercialEventById(context.organizationId, input.commercialEventId);
    if (!event) {
      throw new NotFoundError(`CommercialEvent ${input.commercialEventId} not found.`);
    }

    const subtotal = event.calculatedAmountCents;
    const taxRate = input.taxRateBasisPoints ?? 0;
    const taxAmount = (subtotal * BigInt(taxRate)) / 10000n;
    const totalAmount = subtotal + taxAmount;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (input.paymentTermsDays ?? 15));

    const invoice = await CbosRepository.createInvoice(
      {
        organizationId: context.organizationId,
        customerAccountId: event.customerAccountId,
        contractId: event.serviceContractId,
        commercialEventId: event.id,
        invoiceNumber: input.invoiceNumber,
        status: InvoiceStatus.DRAFT,
        currency: event.currency,
        subtotalAmountCents: subtotal,
        discountAmountCents: 0n,
        creditAppliedAmountCents: 0n,
        taxRateBasisPoints: taxRate,
        taxAmountCents: taxAmount,
        totalAmountCents: totalAmount,
        totalPaidAmountCents: 0n,
        balanceDueAmountCents: totalAmount,
        issueDate: null,
        dueDate,
        notes: input.notes ?? null,
      },
      [
        {
          description: `Placement Success Fee - Event ${event.eventType}`,
          quantity: 1,
          unitPriceCents: subtotal,
          totalPriceCents: subtotal,
          candidateId: event.candidateId,
          placementId: event.placementId,
          commercialEventId: event.id,
        },
      ]
    );

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_INVOICE_GENERATED,
      entityType: "Invoice",
      entityId: invoice.id,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmountCents: invoice.totalAmountCents.toString(),
      },
    });

    return invoice;
  }

  static async createManualInvoice(
    context: AuthenticatedContext,
    input: CreateManualInvoiceInput
  ): Promise<Invoice> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const customer = await CbosRepository.findCustomerAccountById(context.organizationId, input.customerAccountId);
    if (!customer) {
      throw new NotFoundError(`CustomerAccount ${input.customerAccountId} not found.`);
    }

    let subtotal = 0n;
    const lineInputs = input.lines.map((l) => {
      const qty = BigInt(l.quantity ?? 1);
      const total = l.unitPriceCents * qty;
      subtotal += total;
      return {
        description: l.description,
        quantity: l.quantity ?? 1,
        unitPriceCents: l.unitPriceCents,
        totalPriceCents: total,
        candidateId: l.candidateId ?? null,
        placementId: l.placementId ?? null,
      };
    });

    const taxRate = input.taxRateBasisPoints ?? 0;
    const taxAmount = (subtotal * BigInt(taxRate)) / 10000n;
    const totalAmount = subtotal + taxAmount;

    const invoice = await CbosRepository.createInvoice(
      {
        organizationId: context.organizationId,
        customerAccountId: input.customerAccountId,
        contractId: input.contractId ?? null,
        invoiceNumber: input.invoiceNumber,
        status: InvoiceStatus.DRAFT,
        currency: input.currency || customer.currency || "USD",
        subtotalAmountCents: subtotal,
        discountAmountCents: 0n,
        creditAppliedAmountCents: 0n,
        taxRateBasisPoints: taxRate,
        taxAmountCents: taxAmount,
        totalAmountCents: totalAmount,
        totalPaidAmountCents: 0n,
        balanceDueAmountCents: totalAmount,
        dueDate: input.dueDate ?? null,
        notes: input.notes ?? null,
      },
      lineInputs
    );

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_INVOICE_GENERATED,
      entityType: "Invoice",
      entityId: invoice.id,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmountCents: invoice.totalAmountCents.toString(),
      },
    });

    return invoice;
  }

  static async issueInvoice(
    context: AuthenticatedContext,
    invoiceId: string
  ): Promise<Invoice> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const invoice = await CbosRepository.findInvoiceById(context.organizationId, invoiceId);
    if (!invoice) {
      throw new NotFoundError(`Invoice ${invoiceId} not found.`);
    }

    CbosLifecycle.validateInvoiceTransition(invoice.status, InvoiceStatus.ISSUED);

    const updated = await CbosRepository.updateInvoice(context.organizationId, invoiceId, {
      status: InvoiceStatus.ISSUED,
      issueDate: new Date(),
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_INVOICE_ISSUED,
      entityType: "Invoice",
      entityId: invoiceId,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmountCents: invoice.totalAmountCents.toString(),
      },
    });

    return updated;
  }

  static async voidInvoice(
    context: AuthenticatedContext,
    invoiceId: string,
    voidReason: string
  ): Promise<Invoice> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const invoice = await CbosRepository.findInvoiceById(context.organizationId, invoiceId);
    if (!invoice) {
      throw new NotFoundError(`Invoice ${invoiceId} not found.`);
    }

    CbosLifecycle.assertInvoiceCanBeVoided(invoice.status, invoice.totalPaidAmountCents);
    CbosLifecycle.validateInvoiceTransition(invoice.status, InvoiceStatus.VOID);

    const updated = await CbosRepository.updateInvoice(context.organizationId, invoiceId, {
      status: InvoiceStatus.VOID,
      voidedAt: new Date(),
      voidReason,
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_INVOICE_VOIDED,
      entityType: "Invoice",
      entityId: invoiceId,
      details: { invoiceNumber: invoice.invoiceNumber, voidReason },
    });

    return updated;
  }

  static async writeOffInvoice(
    context: AuthenticatedContext,
    invoiceId: string,
    reason: string
  ): Promise<Invoice> {
    CbosAuthorization.assertAdminOnlyAuthority(context, context.organizationId);

    const invoice = await CbosRepository.findInvoiceById(context.organizationId, invoiceId);
    if (!invoice) {
      throw new NotFoundError(`Invoice ${invoiceId} not found.`);
    }

    CbosLifecycle.validateInvoiceTransition(invoice.status, InvoiceStatus.WRITTEN_OFF);

    const updated = await CbosRepository.updateInvoice(context.organizationId, invoiceId, {
      status: InvoiceStatus.WRITTEN_OFF,
      notes: `Written off: ${reason}`,
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_INVOICE_WRITTEN_OFF,
      entityType: "Invoice",
      entityId: invoiceId,
      details: { invoiceNumber: invoice.invoiceNumber, reason },
    });

    return updated;
  }

  // =========================================================================
  // 6. PAYMENT OPERATIONS
  // =========================================================================

  static async recordPayment(
    context: AuthenticatedContext,
    input: RecordPaymentInput
  ): Promise<Payment> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    // Idempotency check for provider transactions
    if (input.providerTransactionId) {
      const existing = await CbosRepository.findPaymentByProviderRef(
        context.organizationId,
        input.provider,
        input.providerTransactionId
      );
      if (existing) {
        return existing; // Idempotent return
      }
    }

    return prisma.$transaction(async (tx) => {
      let invoice: (Invoice & { lines: unknown[] }) | null = null;
      if (input.invoiceId) {
        invoice = await CbosRepository.findInvoiceById(context.organizationId, input.invoiceId, tx);
        if (!invoice) {
          throw new NotFoundError(`Invoice ${input.invoiceId} not found.`);
        }
      }

      // 1. Record Payment entity
      const payment = await CbosRepository.createPayment(
        {
          organizationId: context.organizationId,
          customerAccountId: input.customerAccountId,
          invoiceId: input.invoiceId ?? null,
          paymentNumber: input.paymentNumber,
          amountCents: input.amountCents,
          refundedAmountCents: 0n,
          currency: input.currency || invoice?.currency || "USD",
          paymentMethod: input.paymentMethod,
          provider: input.provider,
          providerTransactionId: input.providerTransactionId ?? null,
          status: PaymentStatus.COMPLETED,
          receivedAt: input.receivedAt || new Date(),
          recordedByStaffId: context.userId,
          notes: input.notes ?? null,
        },
        tx
      );

      // 2. If applied to Invoice, update invoice balance
      if (invoice) {
        const newPaidTotal = invoice.totalPaidAmountCents + input.amountCents;
        const newBalanceDue = invoice.totalAmountCents > newPaidTotal ? invoice.totalAmountCents - newPaidTotal : 0n;
        const newStatus = newBalanceDue === 0n ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

        await CbosRepository.updateInvoice(
          context.organizationId,
          invoice.id,
          {
            totalPaidAmountCents: newPaidTotal,
            balanceDueAmountCents: newBalanceDue,
            status: newStatus,
            paidAt: newBalanceDue === 0n ? new Date() : null,
          },
          tx
        );
      }

      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.COMMERCIAL_PAYMENT_RECORDED,
        entityType: "Payment",
        entityId: payment.id,
        details: {
          paymentNumber: payment.paymentNumber,
          amountCents: payment.amountCents.toString(),
          invoiceId: input.invoiceId,
        },
        tx,
      });

      return payment;
    });
  }

  // =========================================================================
  // 7. CREDITS, REFUNDS & ADJUSTMENTS
  // =========================================================================

  static async issueCommercialCredit(
    context: AuthenticatedContext,
    input: IssueCommercialCreditInput
  ): Promise<CommercialCredit> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const credit = await CbosRepository.createCommercialCredit({
      organizationId: context.organizationId,
      customerAccountId: input.customerAccountId,
      contractId: input.contractId ?? null,
      creditNumber: input.creditNumber,
      amountCents: input.amountCents,
      remainingAmountCents: input.amountCents,
      currency: input.currency || "USD",
      reason: input.reason,
      status: CreditStatus.AVAILABLE,
      issuedByStaffId: context.userId,
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_CREDIT_ISSUED,
      entityType: "CommercialCredit",
      entityId: credit.id,
      details: {
        creditNumber: credit.creditNumber,
        amountCents: credit.amountCents.toString(),
      },
    });

    return credit;
  }

  static async issueCommercialRefund(
    context: AuthenticatedContext,
    input: IssueCommercialRefundInput
  ): Promise<CommercialRefund> {
    CbosAuthorization.assertAdminOnlyAuthority(context, context.organizationId);

    const payment = await CbosRepository.findPaymentById(context.organizationId, input.paymentId);
    if (!payment) {
      throw new NotFoundError(`Payment ${input.paymentId} not found.`);
    }

    const maxRefundable = payment.amountCents - payment.refundedAmountCents;
    if (input.amountCents > maxRefundable) {
      throw new ValidationError(
        `Refund amount (${input.amountCents} cents) exceeds available payment balance (${maxRefundable} cents).`
      );
    }

    return prisma.$transaction(async (tx) => {
      // 1. Create Refund record
      const refund = await CbosRepository.createCommercialRefund(
        {
          organizationId: context.organizationId,
          customerAccountId: payment.customerAccountId,
          paymentId: payment.id,
          refundNumber: input.refundNumber,
          amountCents: input.amountCents,
          currency: input.currency || payment.currency,
          provider: input.provider,
          providerRefundId: input.providerRefundId ?? null,
          reason: input.reason,
          status: RefundStatus.COMPLETED,
          authorizedByStaffId: context.userId,
        },
        tx
      );

      // 2. Update payment refunded amount
      const newRefundedTotal = payment.refundedAmountCents + input.amountCents;
      const newPaymentStatus = newRefundedTotal >= payment.amountCents ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

      await CbosRepository.updatePayment(
        context.organizationId,
        payment.id,
        {
          refundedAmountCents: newRefundedTotal,
          status: newPaymentStatus,
        },
        tx
      );

      await logUserAuditEvent({
        userId: context.userId,
        organizationId: context.organizationId,
        action: AuditAction.COMMERCIAL_REFUND_EXECUTED,
        entityType: "CommercialRefund",
        entityId: refund.id,
        details: {
          refundNumber: refund.refundNumber,
          amountCents: refund.amountCents.toString(),
          paymentId: payment.id,
        },
        tx,
      });

      return refund;
    });
  }

  static async recordCommercialAdjustment(
    context: AuthenticatedContext,
    input: RecordCommercialAdjustmentInput
  ): Promise<CommercialAdjustment> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const customer = await CbosRepository.findCustomerAccountById(context.organizationId, input.customerAccountId);
    if (!customer) {
      throw new NotFoundError(`CustomerAccount ${input.customerAccountId} not found.`);
    }

    if (input.invoiceId) {
      const invoice = await CbosRepository.findInvoiceById(context.organizationId, input.invoiceId);
      if (!invoice) {
        throw new NotFoundError(`Invoice ${input.invoiceId} not found.`);
      }
    }

    const adjustment = await CbosRepository.createCommercialAdjustment({
      organizationId: context.organizationId,
      customerAccountId: input.customerAccountId,
      invoiceId: input.invoiceId ?? null,
      adjustmentType: input.adjustmentType,
      amountCents: input.amountCents,
      currency: input.currency || "USD",
      reason: input.reason,
      authorizedByStaffId: context.userId,
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_ADJUSTMENT_RECORDED,
      entityType: "CommercialAdjustment",
      entityId: adjustment.id,
      details: {
        adjustmentType: adjustment.adjustmentType,
        amountCents: adjustment.amountCents.toString(),
      },
    });

    return adjustment;
  }

  // =========================================================================
  // 8. REVENUE ATTRIBUTION
  // =========================================================================

  static async attributeRevenue(
    context: AuthenticatedContext,
    input: AttributeRevenueInput
  ): Promise<RevenueAttribution> {
    CbosAuthorization.assertAdminOrStaffAuthority(context, context.organizationId);

    const invoice = await CbosRepository.findInvoiceById(context.organizationId, input.invoiceId);
    if (!invoice) {
      throw new NotFoundError(`Invoice ${input.invoiceId} not found.`);
    }

    const attribution = await CbosRepository.createRevenueAttribution({
      organizationId: context.organizationId,
      customerAccountId: invoice.customerAccountId,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      candidateId: input.candidateId ?? null,
      placementId: input.placementId ?? null,
      attributedAmountCents: input.attributedAmountCents,
      currency: input.currency || invoice.currency,
      strategistStaffId: input.strategistStaffId ?? null,
      specialistStaffId: input.specialistStaffId ?? null,
      sourcingStaffId: input.sourcingStaffId ?? null,
      recognizedAt: new Date(),
    });

    await logUserAuditEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      action: AuditAction.COMMERCIAL_REVENUE_ATTRIBUTED,
      entityType: "RevenueAttribution",
      entityId: attribution.id,
      details: {
        attributedAmountCents: attribution.attributedAmountCents.toString(),
        candidateId: input.candidateId,
        placementId: input.placementId,
      },
    });

    return attribution;
  }

  // =========================================================================
  // 9. FINANCIAL PRIVACY PROJECTIONS (CANDIDATE 360 & PORTAL)
  // =========================================================================

  /**
   * Returns privacy-safe billing summary for candidate portal / Candidate 360 view.
   * Completely omits internal margins, commission splits, and commercial notes.
   */
  static async getCandidateBillingSummary(
    context: AuthenticatedContext,
    candidateId: string
  ): Promise<CandidateBillingSummaryDTO> {
    CbosAuthorization.assertCandidateSelfAccess(context, candidateId, context.organizationId);

    const relationship = await CbosRepository.findActiveRelationshipForCandidate(
      context.organizationId,
      candidateId
    );

    const entitlements = await prisma.serviceEntitlement.findMany({
      where: { organizationId: context.organizationId, candidateId },
    });

    let invoices: Invoice[] = [];
    if (relationship) {
      invoices = await prisma.invoice.findMany({
        where: {
          organizationId: context.organizationId,
          customerAccountId: relationship.customerAccountId,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.OVERDUE] },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return {
      hasActiveCustomerAccount: !!relationship,
      customerDisplayName: relationship ? (relationship as unknown as { customer: { displayName: string } }).customer.displayName : undefined,
      activeContractsCount: relationship ? 1 : 0,
      entitlements: entitlements.map((e) => ({
        entitlementType: e.entitlementType,
        allocatedQuota: e.allocatedQuota,
        consumedQuota: e.consumedQuota,
        remainingQuota: e.allocatedQuota - e.consumedQuota,
        status: e.status,
        validTo: e.validTo,
      })),
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        totalAmountFormatted: PricingEngine.formatCentsToCurrencyString(inv.totalAmountCents, inv.currency),
        balanceDueFormatted: PricingEngine.formatCentsToCurrencyString(inv.balanceDueAmountCents, inv.currency),
        currency: inv.currency,
        dueDate: inv.dueDate,
        paidAt: inv.paidAt,
      })),
    };
  }
}
