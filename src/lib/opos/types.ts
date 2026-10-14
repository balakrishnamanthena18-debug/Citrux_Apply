/**
 * Phase 9C — Offer & Placement Operating System (OPOS) Types & Enums
 * Contract: docs/engineering/PHASE_9A_OFFER_PLACEMENT_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 * Decision Lock: docs/engineering/PHASE_9B_OPOS_DECISION_LOCK_IMPLEMENTATION_READINESS.md
 */

import {
  OfferStatus,
  OfferVerificationState,
  OfferProvenanceType,
  CompensationPaymentFrequency,
  EquityType,
  EquityVestingFrequency,
  NegotiationStatus,
  NegotiationEventType,
  OfferDecisionType,
  OfferDeclineReasonCategory,
  JoiningStatus,
  JoiningFailureReason,
  Role,
  JobEmploymentType,
  AuditAction,
  type Offer,
  type OfferVersion,
  type Negotiation,
  type NegotiationEvent,
  type OfferDecision,
  type JoiningRecord,
  type PlacementRecord,
  type OfferEvidence,
  type Prisma,
} from "@/generated/prisma";

export {
  OfferStatus,
  OfferVerificationState,
  OfferProvenanceType,
  CompensationPaymentFrequency,
  EquityType,
  EquityVestingFrequency,
  NegotiationStatus,
  NegotiationEventType,
  OfferDecisionType,
  OfferDeclineReasonCategory,
  JoiningStatus,
  JoiningFailureReason,
  Role,
  JobEmploymentType,
  AuditAction,
  type Offer,
  type OfferVersion,
  type Negotiation,
  type NegotiationEvent,
  type OfferDecision,
  type JoiningRecord,
  type PlacementRecord,
  type OfferEvidence,
};

// ==========================================
// DTO & Input Types
// ==========================================

export type CreateOfferInput = {
  organizationId: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
  status?: OfferStatus;
  currentVersionNumber?: number;
  verificationState?: OfferVerificationState;
  initialReceivedAt?: Date;
  decisionDeadline?: Date | null;
  decisionDeadlinetz?: string | null;
  scheduledStartDate?: Date | null;
  internalStaffNotes?: string | null;
  candidateNotes?: string | null;
};

export type UpdateOfferInput = {
  status?: OfferStatus;
  currentVersionNumber?: number;
  verificationState?: OfferVerificationState;
  decisionDeadline?: Date | null;
  decisionDeadlinetz?: string | null;
  scheduledStartDate?: Date | null;
  internalStaffNotes?: string | null;
  candidateNotes?: string | null;
  verifiedAt?: Date | null;
  verifiedById?: string | null;
  voidedAt?: Date | null;
  voidedById?: string | null;
  voidReason?: string | null;
};

export type CreateOfferVersionInput = {
  offerId: string;
  organizationId: string;
  versionNumber: number;
  provenance?: OfferProvenanceType;
  receivedAt?: Date;
  decisionDeadline?: Date | null;
  decisionDeadlinetz?: string | null;
  proposedStartDate?: Date | null;
  roleTitle?: string | null;
  department?: string | null;
  location?: string | null;
  isRemote?: boolean;
  employmentType?: JobEmploymentType;
  baseSalaryAmount?: number | null;
  baseSalaryCurrency?: string;
  paymentFrequency?: CompensationPaymentFrequency;
  targetVariableAmount?: number | null;
  targetVariablePercentage?: number | string | Prisma.Decimal | null;
  variableCriteria?: string | null;
  signOnBonusAmount?: number | null;
  signOnTerms?: string | null;
  retentionBonusAmount?: number | null;
  relocationAmount?: number | null;
  benefitsSummary?: string | null;
  equityType?: EquityType | null;
  grantQuantity?: number | null;
  estimatedGrantValue?: number | string | Prisma.Decimal | null;
  vestingPeriodMonths?: number | null;
  cliffPeriodMonths?: number | null;
  cliffPercentage?: number | string | Prisma.Decimal | null;
  vestingFrequency?: EquityVestingFrequency | null;
  strikePrice?: number | string | Prisma.Decimal | null;
  fairMarketValueAtGrant?: number | string | Prisma.Decimal | null;
  supersededAt?: Date | null;
};

export type CreateNegotiationInput = {
  offerId: string;
  organizationId: string;
  status?: NegotiationStatus;
  activeRoundNumber?: number;
  candidateTargetBase?: number | null;
  candidateTargetVariable?: number | null;
  candidateTargetEquity?: number | null;
  candidateTargetSignOn?: number | null;
  candidateTargetNotes?: string | null;
  strategyTalkingPoints?: string | null;
};

export type UpdateNegotiationInput = {
  status?: NegotiationStatus;
  activeRoundNumber?: number;
  candidateTargetBase?: number | null;
  candidateTargetVariable?: number | null;
  candidateTargetEquity?: number | null;
  candidateTargetSignOn?: number | null;
  candidateTargetNotes?: string | null;
  strategyTalkingPoints?: string | null;
  concludedAt?: Date | null;
};

export type RecordNegotiationEventInput = {
  negotiationId: string;
  organizationId: string;
  offerVersionId?: string | null;
  roundNumber?: number;
  eventType: NegotiationEventType;
  actorUserId: string;
  actorRole: Role;
  provenance?: OfferProvenanceType;
  eventDetails?: unknown;
  internalStaffNotes?: string | null;
  recordedAt?: Date;
};

export type RecordOfferDecisionInput = {
  offerId: string;
  offerVersionId: string;
  organizationId: string;
  candidateId: string;
  actorUserId: string;
  decisionType: OfferDecisionType;
  provenance?: OfferProvenanceType;
  executedAt?: Date;
  structuredReason?: OfferDeclineReasonCategory | null;
  privateCandidateFeedback?: string | null;
  recordedOnBehalf?: boolean;
  recordedOnBehalfReason?: string | null;
};

export type CreateJoiningRecordInput = {
  offerId: string;
  organizationId: string;
  candidateId: string;
  applicationId: string;
  status?: JoiningStatus;
  scheduledStartDate: Date;
  scheduledStartDatetz?: string | null;
  actualStartDate?: Date | null;
  location?: string | null;
  reportingInstructions?: string | null;
  hardwareDeliveryStatus?: string | null;
  backgroundCheckStatus?: string | null;
  firstDayConfirmedByCandidate?: boolean;
  firstDayConfirmedAt?: Date | null;
  failureReason?: JoiningFailureReason | null;
  failureNotes?: string | null;
};

export type UpdateJoiningRecordInput = {
  status?: JoiningStatus;
  scheduledStartDate?: Date;
  scheduledStartDatetz?: string | null;
  actualStartDate?: Date | null;
  location?: string | null;
  reportingInstructions?: string | null;
  hardwareDeliveryStatus?: string | null;
  backgroundCheckStatus?: string | null;
  firstDayConfirmedByCandidate?: boolean;
  firstDayConfirmedAt?: Date | null;
  failureReason?: JoiningFailureReason | null;
  failureNotes?: string | null;
};

export type CreatePlacementRecordInput = {
  offerId: string;
  joiningId: string;
  organizationId: string;
  candidateId: string;
  applicationId: string;
  verifiedStartDate: Date;
  verifiedAt?: Date;
  verifiedById: string;
  firstDayConfirmed?: boolean;
  onboardingProofValidated?: boolean;
  verificationNotes?: string | null;
  proofDocumentId?: string | null;
  proofStoragePath?: string | null;
  day30HealthCheckCompleted?: boolean;
  day30HealthCheckAt?: Date | null;
  day90RetentionMilestoneCompleted?: boolean;
  day90RetentionMilestoneAt?: Date | null;
};

export type UpdatePlacementRecordInput = {
  verifiedStartDate?: Date;
  firstDayConfirmed?: boolean;
  onboardingProofValidated?: boolean;
  verificationNotes?: string | null;
  proofDocumentId?: string | null;
  proofStoragePath?: string | null;
  day30HealthCheckCompleted?: boolean;
  day30HealthCheckAt?: Date | null;
  day90RetentionMilestoneCompleted?: boolean;
  day90RetentionMilestoneAt?: Date | null;
  voidedAt?: Date | null;
  voidedById?: string | null;
  voidReason?: string | null;
};

export type RecordOfferEvidenceInput = {
  offerId: string;
  offerVersionId?: string | null;
  organizationId: string;
  candidateId: string;
  candidateDocumentId?: string | null;
  documentType: string;
  storagePath: string;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  provenance?: OfferProvenanceType;
  uploadedById: string;
};

// ==========================================
// Field-Level Privacy Redaction Functions
// ==========================================

/**
 * Strips internal staff notes from Offer when presented to candidate.
 */
export function sanitizeOfferForCandidate<T extends Partial<Offer>>(
  offer: T
): Omit<T, "internalStaffNotes"> & { internalStaffNotes: null } {
  return {
    ...offer,
    internalStaffNotes: null,
  };
}

/**
 * Strips private candidate feedback from OfferDecision when presented to staff/non-owner.
 */
export function sanitizeOfferDecisionForStaff<T extends Partial<OfferDecision>>(
  decision: T
): Omit<T, "privateCandidateFeedback"> & { privateCandidateFeedback: null } {
  return {
    ...decision,
    privateCandidateFeedback: null,
  };
}
