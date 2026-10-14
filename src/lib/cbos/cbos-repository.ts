/**
 * Phase 10E — CBOS Database Repository Layer
 * Authoritative Prisma data access layer with organization scoping and transaction support.
 */

import { prisma } from "@/lib/db/prisma";
import type {
  CustomerAccount,
  CustomerCandidateRelationship,
  ServiceContract,
  ServiceContractVersion,
  ServiceEntitlement,
  PricingTerm,
  CommercialEvent,
  CbosOutboxEvent,
  Invoice,
  InvoiceLine,
  Payment,
  CommercialCredit,
  CommercialRefund,
  CommercialAdjustment,
  RevenueAttribution,
} from "./types";
import { Prisma } from "@/generated/prisma";

export class CbosRepository {
  // ==========================================
  // CUSTOMER ACCOUNT
  // ==========================================
  static async createCustomerAccount(
    data: Prisma.CustomerAccountUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CustomerAccount> {
    return tx.customerAccount.create({ data });
  }

  static async findCustomerAccountById(
    organizationId: string,
    id: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CustomerAccount | null> {
    return tx.customerAccount.findFirst({
      where: { id, organizationId },
    });
  }

  static async updateCustomerAccount(
    organizationId: string,
    id: string,
    data: Prisma.CustomerAccountUpdateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CustomerAccount> {
    return tx.customerAccount.update({
      where: { id, organizationId },
      data,
    });
  }

  // ==========================================
  // CUSTOMER CANDIDATE RELATIONSHIP
  // ==========================================
  static async createCustomerCandidateRelationship(
    data: Prisma.CustomerCandidateRelationshipUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CustomerCandidateRelationship> {
    return tx.customerCandidateRelationship.create({ data });
  }

  static async findActiveRelationshipForCandidate(
    organizationId: string,
    candidateId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CustomerCandidateRelationship | null> {
    return tx.customerCandidateRelationship.findFirst({
      where: {
        organizationId,
        candidateId,
        status: "ACTIVE",
      },
      include: {
        customer: true,
      },
    });
  }

  // ==========================================
  // SERVICE CONTRACTS
  // ==========================================
  static async createServiceContract(
    data: Prisma.ServiceContractUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<ServiceContract> {
    return tx.serviceContract.create({ data });
  }

  static async findContractById(
    organizationId: string,
    id: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<(ServiceContract & { versions: ServiceContractVersion[]; pricingTerms: PricingTerm[]; entitlements: ServiceEntitlement[] }) | null> {
    return tx.serviceContract.findFirst({
      where: { id, organizationId },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
        pricingTerms: true,
        entitlements: true,
      },
    });
  }

  static async findActiveContractForCandidate(
    organizationId: string,
    candidateId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<(ServiceContract & { pricingTerms: PricingTerm[]; customer: CustomerAccount }) | null> {
    return tx.serviceContract.findFirst({
      where: {
        organizationId,
        candidateId,
        status: "ACTIVE",
      },
      include: {
        pricingTerms: true,
        customer: true,
      },
      orderBy: { effectiveDate: "desc" },
    });
  }

  static async updateServiceContract(
    organizationId: string,
    id: string,
    data: Prisma.ServiceContractUpdateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<ServiceContract> {
    return tx.serviceContract.update({
      where: { id, organizationId },
      data,
    });
  }

  static async createContractVersion(
    data: Prisma.ServiceContractVersionUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<ServiceContractVersion> {
    return tx.serviceContractVersion.create({ data });
  }

  static async createPricingTerm(
    data: Prisma.PricingTermUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<PricingTerm> {
    return tx.pricingTerm.create({ data });
  }

  static async createServiceEntitlement(
    data: Prisma.ServiceEntitlementUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<ServiceEntitlement> {
    return tx.serviceEntitlement.create({ data });
  }

  // ==========================================
  // COMMERCIAL EVENTS
  // ==========================================
  static async createCommercialEvent(
    data: Prisma.CommercialEventUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CommercialEvent> {
    return tx.commercialEvent.create({ data });
  }

  static async findCommercialEventById(
    organizationId: string,
    id: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CommercialEvent | null> {
    return tx.commercialEvent.findFirst({
      where: { id, organizationId },
    });
  }

  static async findCommercialEventByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CommercialEvent | null> {
    return tx.commercialEvent.findFirst({
      where: { organizationId, idempotencyKey },
    });
  }

  // ==========================================
  // OUTBOX EVENTS
  // ==========================================
  static async createOutboxEvent(
    data: Prisma.CbosOutboxEventUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CbosOutboxEvent> {
    return tx.cbosOutboxEvent.create({ data });
  }

  static async findPendingOutboxEvents(
    limit: number = 50,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CbosOutboxEvent[]> {
    return tx.cbosOutboxEvent.findMany({
      where: {
        status: "PENDING",
        availableAt: { lte: new Date(Date.now() + 5000) },
        attemptCount: { lt: 5 },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  static async updateOutboxEvent(
    id: string,
    data: Prisma.CbosOutboxEventUpdateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CbosOutboxEvent> {
    return tx.cbosOutboxEvent.update({
      where: { id },
      data,
    });
  }

  // ==========================================
  // INVOICES & LINES
  // ==========================================
  static async createInvoice(
    data: Prisma.InvoiceUncheckedCreateInput,
    lines: Array<Omit<Prisma.InvoiceLineUncheckedCreateInput, "invoiceId" | "organizationId" | "lineNumber">>,
    tx: Prisma.TransactionClient = prisma
  ): Promise<Invoice & { lines: InvoiceLine[] }> {
    return tx.invoice.create({
      data: {
        ...data,
        lines: {
          create: lines.map((line, idx) => ({
            ...line,
            organizationId: data.organizationId,
            lineNumber: idx + 1,
          })),
        },
      },
      include: { lines: true },
    });
  }

  static async findInvoiceById(
    organizationId: string,
    id: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<(Invoice & { lines: InvoiceLine[]; payments: Payment[]; appliedCredits: CommercialCredit[] }) | null> {
    return tx.invoice.findFirst({
      where: { id, organizationId },
      include: {
        lines: { orderBy: { lineNumber: "asc" } },
        payments: true,
        appliedCredits: true,
      },
    });
  }

  static async updateInvoice(
    organizationId: string,
    id: string,
    data: Prisma.InvoiceUpdateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<Invoice> {
    return tx.invoice.update({
      where: { id, organizationId },
      data,
    });
  }

  // ==========================================
  // PAYMENTS, CREDITS, REFUNDS, ADJUSTMENTS
  // ==========================================
  static async createPayment(
    data: Prisma.PaymentUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<Payment> {
    return tx.payment.create({ data });
  }

  static async findPaymentById(
    organizationId: string,
    id: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<Payment | null> {
    return tx.payment.findFirst({
      where: { id, organizationId },
    });
  }

  static async findPaymentByProviderRef(
    organizationId: string,
    provider: string,
    providerTransactionId: string,
    tx: Prisma.TransactionClient = prisma
  ): Promise<Payment | null> {
    return tx.payment.findFirst({
      where: {
        organizationId,
        provider,
        providerTransactionId,
      },
    });
  }

  static async updatePayment(
    organizationId: string,
    id: string,
    data: Prisma.PaymentUpdateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<Payment> {
    return tx.payment.update({
      where: { id, organizationId },
      data,
    });
  }

  static async createCommercialCredit(
    data: Prisma.CommercialCreditUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CommercialCredit> {
    return tx.commercialCredit.create({ data });
  }

  static async createCommercialRefund(
    data: Prisma.CommercialRefundUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CommercialRefund> {
    return tx.commercialRefund.create({ data });
  }

  static async createCommercialAdjustment(
    data: Prisma.CommercialAdjustmentUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<CommercialAdjustment> {
    return tx.commercialAdjustment.create({ data });
  }

  static async createRevenueAttribution(
    data: Prisma.RevenueAttributionUncheckedCreateInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<RevenueAttribution> {
    return tx.revenueAttribution.create({ data });
  }
}
