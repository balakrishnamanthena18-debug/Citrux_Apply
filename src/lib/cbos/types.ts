/**
 * Phase 10E — Commercial & Billing Operating System (CBOS) Types & Contracts
 */

import {
  CustomerType,
  CustomerStatus,
  CustomerCandidateRelationType,
  RelationStatus,
  ContractServiceType,
  BillingCadence,
  ContractStatus,
  EntitlementType,
  EntitlementStatus,
  PricingModel,
  PricingBasis,
  CommercialEventType,
  OutboxStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  CreditStatus,
  RefundStatus,
  AdjustmentType,
  type CustomerAccount,
  type CustomerCandidateRelationship,
  type ServiceContract,
  type ServiceContractVersion,
  type ServiceEntitlement,
  type PricingTerm,
  type CommercialEvent,
  type CbosOutboxEvent,
  type Invoice,
  type InvoiceLine,
  type Payment,
  type CommercialCredit,
  type CommercialRefund,
  type CommercialAdjustment,
  type RevenueAttribution,
} from "@/generated/prisma";

export {
  CustomerType,
  CustomerStatus,
  CustomerCandidateRelationType,
  RelationStatus,
  ContractServiceType,
  BillingCadence,
  ContractStatus,
  EntitlementType,
  EntitlementStatus,
  PricingModel,
  PricingBasis,
  CommercialEventType,
  OutboxStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  CreditStatus,
  RefundStatus,
  AdjustmentType,
};

export type {
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
};

// ==========================================
// SERVICE INPUT INTERFACES
// ==========================================

export interface CreateCustomerAccountInput {
  customerType: CustomerType;
  displayName: string;
  legalName?: string | null;
  billingEmail: string;
  billingPhone?: string | null;
  taxIdentifier?: string | null;
  billingAddress?: Record<string, unknown> | null;
  currency?: string;
  primaryCandidateId?: string | null;
}

export interface UpdateCustomerAccountInput {
  displayName?: string;
  legalName?: string | null;
  billingEmail?: string;
  billingPhone?: string | null;
  taxIdentifier?: string | null;
  billingAddress?: Record<string, unknown> | null;
  currency?: string;
}

export interface AttachCandidateToCustomerInput {
  customerAccountId: string;
  candidateId: string;
  relationshipType: CustomerCandidateRelationType;
  effectiveFrom?: Date;
  isPrimary?: boolean;
}

export interface DraftServiceContractInput {
  customerAccountId: string;
  candidateId?: string | null;
  contractNumber: string;
  serviceType: ContractServiceType;
  billingCadence: BillingCadence;
  currency?: string;
  effectiveDate: Date;
  expirationDate?: Date | null;
  paymentTermsDays?: number;
  initialPricingTerms: Array<{
    pricingModel: PricingModel;
    pricingBasis?: PricingBasis | null;
    percentageBasisPoints?: number | null;
    fixedAmountCents?: bigint | null;
    minimumFeeCents?: bigint | null;
    maximumFeeCents?: bigint | null;
    retainerCreditOffset?: boolean;
  }>;
  initialEntitlements?: Array<{
    candidateId: string;
    entitlementType: EntitlementType;
    allocatedQuota: number;
    validTo?: Date | null;
  }>;
}

export interface CreateContractVersionInput {
  contractId: string;
  termsSummary: string;
  termsSnapshot: Record<string, unknown>;
  pricingTerms: Array<{
    pricingModel: PricingModel;
    pricingBasis?: PricingBasis | null;
    percentageBasisPoints?: number | null;
    fixedAmountCents?: bigint | null;
    minimumFeeCents?: bigint | null;
    maximumFeeCents?: bigint | null;
    retainerCreditOffset?: boolean;
  }>;
}

export interface CreateCommercialEventInput {
  customerAccountId: string;
  candidateId?: string | null;
  serviceContractId?: string | null;
  placementId?: string | null;
  eventType: CommercialEventType;
  calculatedAmountCents: bigint;
  currency?: string;
  pricingTermId?: string | null;
  idempotencyKey: string;
  sourceSystem?: string;
  sourceReferenceId?: string | null;
  occurredAt?: Date;
}

export interface GenerateInvoiceFromEventInput {
  commercialEventId: string;
  invoiceNumber: string;
  paymentTermsDays?: number;
  taxRateBasisPoints?: number;
  notes?: string | null;
}

export interface CreateManualInvoiceInput {
  customerAccountId: string;
  contractId?: string | null;
  invoiceNumber: string;
  currency?: string;
  dueDate?: Date | null;
  taxRateBasisPoints?: number;
  notes?: string | null;
  lines: Array<{
    description: string;
    quantity?: number;
    unitPriceCents: bigint;
    candidateId?: string | null;
    placementId?: string | null;
  }>;
}

export interface RecordPaymentInput {
  customerAccountId: string;
  invoiceId?: string | null;
  paymentNumber: string;
  amountCents: bigint;
  currency?: string;
  paymentMethod: PaymentMethod;
  provider: string;
  providerTransactionId?: string | null;
  receivedAt?: Date;
  notes?: string | null;
}

export interface IssueCommercialCreditInput {
  customerAccountId: string;
  contractId?: string | null;
  creditNumber: string;
  amountCents: bigint;
  currency?: string;
  reason: string;
}

export interface IssueCommercialRefundInput {
  paymentId: string;
  refundNumber: string;
  amountCents: bigint;
  currency?: string;
  provider: string;
  providerRefundId?: string | null;
  reason: string;
}

export interface RecordCommercialAdjustmentInput {
  customerAccountId: string;
  invoiceId?: string | null;
  adjustmentType: AdjustmentType;
  amountCents: bigint;
  currency?: string;
  reason: string;
}

export interface AttributeRevenueInput {
  invoiceId: string;
  paymentId: string;
  candidateId?: string | null;
  placementId?: string | null;
  attributedAmountCents: bigint;
  currency?: string;
  strategistStaffId?: string | null;
  specialistStaffId?: string | null;
  sourcingStaffId?: string | null;
}

// ==========================================
// OPOS PLACEMENT EVENT PAYLOAD
// ==========================================

export interface OposPlacementVerifiedEventPayload {
  organizationId: string;
  placementId: string;
  candidateId: string;
  offerId: string;
  annualBaseSalaryCents: number | bigint;
  currency: string;
  joiningDate: string | Date;
  verifiedAt: string | Date;
  verifiedByStaffId: string;
}

// ==========================================
// PRIVACY-SAFE DTOs
// ==========================================

export interface CandidateBillingSummaryDTO {
  hasActiveCustomerAccount: boolean;
  customerDisplayName?: string;
  activeContractsCount: number;
  entitlements: Array<{
    entitlementType: EntitlementType;
    allocatedQuota: number;
    consumedQuota: number;
    remainingQuota: number;
    status: EntitlementStatus;
    validTo?: Date | null;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    totalAmountFormatted: string;
    balanceDueFormatted: string;
    currency: string;
    dueDate?: Date | null;
    paidAt?: Date | null;
  }>;
}
