/**
 * Phase 9C — Offer & Placement Operating System (OPOS) Persistence Repository
 * Contract: docs/engineering/PHASE_9A_OFFER_PLACEMENT_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 * Decision Lock: docs/engineering/PHASE_9B_OPOS_DECISION_LOCK_IMPLEMENTATION_READINESS.md
 *
 * Implements authoritative persistence primitives for OPOS data models:
 * - Offer & OfferVersion
 * - Negotiation & NegotiationEvent
 * - OfferDecision
 * - JoiningRecord
 * - PlacementRecord
 * - OfferEvidence
 */

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma";
import {
  OfferStatus,
  OfferVerificationState,
  OfferProvenanceType,
  NegotiationStatus,
  JoiningStatus,
  Role,
  JobEmploymentType,
  type Offer,
  type OfferVersion,
  type Negotiation,
  type NegotiationEvent,
  type OfferDecision,
  type JoiningRecord,
  type PlacementRecord,
  type OfferEvidence,
  type CreateOfferInput,
  type UpdateOfferInput,
  type CreateOfferVersionInput,
  type CreateNegotiationInput,
  type UpdateNegotiationInput,
  type RecordNegotiationEventInput,
  type RecordOfferDecisionInput,
  type CreateJoiningRecordInput,
  type UpdateJoiningRecordInput,
  type CreatePlacementRecordInput,
  type UpdatePlacementRecordInput,
  type RecordOfferEvidenceInput,
} from "./types";
import { ValidationError, NotFoundError } from "@/lib/errors";

type Tx = Prisma.TransactionClient;

function getDb(tx?: Tx) {
  return tx || prisma;
}

// ==========================================
// 1. OFFER PRIMITIVES
// ==========================================

export async function createOffer(
  input: CreateOfferInput,
  tx?: Tx
): Promise<Offer> {
  const db = getDb(tx);
  return db.offer.create({
    data: {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      jobId: input.jobId,
      status: input.status || OfferStatus.OFFER_RECEIVED,
      currentVersionNumber: input.currentVersionNumber ?? 1,
      verificationState: input.verificationState || OfferVerificationState.UNVERIFIED,
      initialReceivedAt: input.initialReceivedAt || new Date(),
      decisionDeadline: input.decisionDeadline || null,
      decisionDeadlinetz: input.decisionDeadlinetz || null,
      scheduledStartDate: input.scheduledStartDate || null,
      internalStaffNotes: input.internalStaffNotes || null,
      candidateNotes: input.candidateNotes || null,
    },
  });
}

export async function getOfferById(
  id: string,
  organizationId: string,
  tx?: Tx
): Promise<(Offer & { versions: OfferVersion[]; negotiation: Negotiation | null; joining: JoiningRecord | null; placement: PlacementRecord | null }) | null> {
  const db = getDb(tx);
  return db.offer.findFirst({
    where: {
      id,
      organizationId,
    },
    include: {
      versions: {
        orderBy: {
          versionNumber: "asc",
        },
      },
      negotiation: true,
      joining: true,
      placement: true,
    },
  });
}

export async function getOfferByApplicationId(
  applicationId: string,
  organizationId: string,
  tx?: Tx
): Promise<(Offer & { versions: OfferVersion[]; negotiation: Negotiation | null; decisions: OfferDecision[] }) | null> {
  const db = getDb(tx);
  return db.offer.findFirst({
    where: {
      applicationId,
      organizationId,
    },
    include: {
      versions: {
        orderBy: {
          versionNumber: "asc",
        },
      },
      negotiation: true,
      decisions: true,
    },
  });
}

export async function listOffersForCandidate(
  candidateId: string,
  organizationId: string,
  tx?: Tx
): Promise<(Offer & { versions: OfferVersion[] })[]> {
  const db = getDb(tx);
  return db.offer.findMany({
    where: {
      candidateId,
      organizationId,
    },
    include: {
      versions: {
        orderBy: {
          versionNumber: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function listOffersForOrganization(
  organizationId: string,
  options?: { status?: OfferStatus; candidateId?: string; limit?: number; offset?: number },
  tx?: Tx
): Promise<(Offer & { versions: OfferVersion[] })[]> {
  const db = getDb(tx);
  return db.offer.findMany({
    where: {
      organizationId,
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.candidateId ? { candidateId: options.candidateId } : {}),
    },
    include: {
      versions: {
        orderBy: {
          versionNumber: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}

export async function updateOffer(
  id: string,
  organizationId: string,
  input: UpdateOfferInput,
  tx?: Tx
): Promise<Offer> {
  const db = getDb(tx);
  const existing = await db.offer.findFirst({
    where: { id, organizationId },
  });
  if (!existing) {
    throw new NotFoundError(`Offer with ID ${id} not found in organization ${organizationId}`);
  }

  return db.offer.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.currentVersionNumber !== undefined ? { currentVersionNumber: input.currentVersionNumber } : {}),
      ...(input.verificationState !== undefined ? { verificationState: input.verificationState } : {}),
      ...(input.decisionDeadline !== undefined ? { decisionDeadline: input.decisionDeadline } : {}),
      ...(input.decisionDeadlinetz !== undefined ? { decisionDeadlinetz: input.decisionDeadlinetz } : {}),
      ...(input.scheduledStartDate !== undefined ? { scheduledStartDate: input.scheduledStartDate } : {}),
      ...(input.internalStaffNotes !== undefined ? { internalStaffNotes: input.internalStaffNotes } : {}),
      ...(input.candidateNotes !== undefined ? { candidateNotes: input.candidateNotes } : {}),
      ...(input.verifiedAt !== undefined ? { verifiedAt: input.verifiedAt } : {}),
      ...(input.verifiedById !== undefined ? { verifiedById: input.verifiedById } : {}),
      ...(input.voidedAt !== undefined ? { voidedAt: input.voidedAt } : {}),
      ...(input.voidedById !== undefined ? { voidedById: input.voidedById } : {}),
      ...(input.voidReason !== undefined ? { voidReason: input.voidReason } : {}),
    },
  });
}

// ==========================================
// 2. OFFER VERSION PRIMITIVES (IMMUTABLE)
// ==========================================

export async function createOfferVersion(
  input: CreateOfferVersionInput,
  tx?: Tx
): Promise<OfferVersion> {
  const db = getDb(tx);

  const offer = await db.offer.findFirst({
    where: { id: input.offerId, organizationId: input.organizationId },
  });
  if (!offer) {
    throw new NotFoundError(`Offer with ID ${input.offerId} not found in organization ${input.organizationId}`);
  }

  return db.offerVersion.create({
    data: {
      offerId: input.offerId,
      organizationId: input.organizationId,
      versionNumber: input.versionNumber,
      provenance: input.provenance || OfferProvenanceType.EMPLOYEE_RECORDED,
      receivedAt: input.receivedAt || new Date(),
      decisionDeadline: input.decisionDeadline || null,
      decisionDeadlinetz: input.decisionDeadlinetz || null,
      proposedStartDate: input.proposedStartDate || null,
      roleTitle: input.roleTitle || null,
      department: input.department || null,
      location: input.location || null,
      isRemote: input.isRemote ?? false,
      employmentType: input.employmentType || JobEmploymentType.FULL_TIME,
      baseSalaryAmount: input.baseSalaryAmount ?? null,
      baseSalaryCurrency: input.baseSalaryCurrency || "USD",
      paymentFrequency: input.paymentFrequency || "ANNUAL",
      targetVariableAmount: input.targetVariableAmount ?? null,
      targetVariablePercentage: input.targetVariablePercentage !== undefined && input.targetVariablePercentage !== null ? new Prisma.Decimal(input.targetVariablePercentage) : null,
      variableCriteria: input.variableCriteria || null,
      signOnBonusAmount: input.signOnBonusAmount ?? null,
      signOnTerms: input.signOnTerms || null,
      retentionBonusAmount: input.retentionBonusAmount ?? null,
      relocationAmount: input.relocationAmount ?? null,
      benefitsSummary: input.benefitsSummary || null,
      equityType: input.equityType || null,
      grantQuantity: input.grantQuantity ?? null,
      estimatedGrantValue: input.estimatedGrantValue !== undefined && input.estimatedGrantValue !== null ? new Prisma.Decimal(input.estimatedGrantValue) : null,
      vestingPeriodMonths: input.vestingPeriodMonths ?? null,
      cliffPeriodMonths: input.cliffPeriodMonths ?? null,
      cliffPercentage: input.cliffPercentage !== undefined && input.cliffPercentage !== null ? new Prisma.Decimal(input.cliffPercentage) : null,
      vestingFrequency: input.vestingFrequency || null,
      strikePrice: input.strikePrice !== undefined && input.strikePrice !== null ? new Prisma.Decimal(input.strikePrice) : null,
      fairMarketValueAtGrant: input.fairMarketValueAtGrant !== undefined && input.fairMarketValueAtGrant !== null ? new Prisma.Decimal(input.fairMarketValueAtGrant) : null,
      supersededAt: input.supersededAt || null,
    },
  });
}

export async function getOfferVersionById(
  id: string,
  organizationId: string,
  tx?: Tx
): Promise<(OfferVersion & { offer: Offer; decisions: OfferDecision[] }) | null> {
  const db = getDb(tx);
  return db.offerVersion.findFirst({
    where: {
      id,
      organizationId,
    },
    include: {
      offer: true,
      decisions: true,
    },
  });
}

export async function listOfferVersions(
  offerId: string,
  organizationId: string,
  tx?: Tx
): Promise<OfferVersion[]> {
  const db = getDb(tx);
  return db.offerVersion.findMany({
    where: {
      offerId,
      organizationId,
    },
    orderBy: {
      versionNumber: "asc",
    },
  });
}

// ==========================================
// 3. NEGOTIATION & EVENT PRIMITIVES
// ==========================================

export async function createNegotiation(
  input: CreateNegotiationInput,
  tx?: Tx
): Promise<Negotiation> {
  const db = getDb(tx);
  return db.negotiation.create({
    data: {
      offerId: input.offerId,
      organizationId: input.organizationId,
      status: input.status || NegotiationStatus.NOT_REQUESTED,
      activeRoundNumber: input.activeRoundNumber ?? 1,
      candidateTargetBase: input.candidateTargetBase ?? null,
      candidateTargetVariable: input.candidateTargetVariable ?? null,
      candidateTargetEquity: input.candidateTargetEquity ?? null,
      candidateTargetSignOn: input.candidateTargetSignOn ?? null,
      candidateTargetNotes: input.candidateTargetNotes || null,
      strategyTalkingPoints: input.strategyTalkingPoints || null,
    },
  });
}

export async function getNegotiationByOfferId(
  offerId: string,
  organizationId: string,
  tx?: Tx
): Promise<(Negotiation & { events: NegotiationEvent[] }) | null> {
  const db = getDb(tx);
  return db.negotiation.findFirst({
    where: {
      offerId,
      organizationId,
    },
    include: {
      events: {
        orderBy: {
          recordedAt: "asc",
        },
      },
    },
  });
}

export async function updateNegotiation(
  id: string,
  organizationId: string,
  input: UpdateNegotiationInput,
  tx?: Tx
): Promise<Negotiation> {
  const db = getDb(tx);
  const existing = await db.negotiation.findFirst({
    where: { id, organizationId },
  });
  if (!existing) {
    throw new NotFoundError(`Negotiation with ID ${id} not found in organization ${organizationId}`);
  }

  return db.negotiation.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.activeRoundNumber !== undefined ? { activeRoundNumber: input.activeRoundNumber } : {}),
      ...(input.candidateTargetBase !== undefined ? { candidateTargetBase: input.candidateTargetBase } : {}),
      ...(input.candidateTargetVariable !== undefined ? { candidateTargetVariable: input.candidateTargetVariable } : {}),
      ...(input.candidateTargetEquity !== undefined ? { candidateTargetEquity: input.candidateTargetEquity } : {}),
      ...(input.candidateTargetSignOn !== undefined ? { candidateTargetSignOn: input.candidateTargetSignOn } : {}),
      ...(input.candidateTargetNotes !== undefined ? { candidateTargetNotes: input.candidateTargetNotes } : {}),
      ...(input.strategyTalkingPoints !== undefined ? { strategyTalkingPoints: input.strategyTalkingPoints } : {}),
      ...(input.concludedAt !== undefined ? { concludedAt: input.concludedAt } : {}),
    },
  });
}

export async function recordNegotiationEvent(
  input: RecordNegotiationEventInput,
  tx?: Tx
): Promise<NegotiationEvent> {
  const db = getDb(tx);
  return db.negotiationEvent.create({
    data: {
      negotiationId: input.negotiationId,
      organizationId: input.organizationId,
      offerVersionId: input.offerVersionId || null,
      roundNumber: input.roundNumber ?? 1,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      provenance: input.provenance || OfferProvenanceType.EMPLOYEE_RECORDED,
      eventDetails: (input.eventDetails as Prisma.InputJsonValue) ?? {},
      internalStaffNotes: input.internalStaffNotes || null,
      recordedAt: input.recordedAt || new Date(),
    },
  });
}

export async function listNegotiationEvents(
  negotiationId: string,
  organizationId: string,
  tx?: Tx
): Promise<NegotiationEvent[]> {
  const db = getDb(tx);
  return db.negotiationEvent.findMany({
    where: {
      negotiationId,
      organizationId,
    },
    orderBy: {
      recordedAt: "asc",
    },
  });
}

// ==========================================
// 4. OFFER DECISION PRIMITIVES (IMMUTABLE)
// ==========================================

export async function recordOfferDecision(
  input: RecordOfferDecisionInput,
  tx?: Tx
): Promise<OfferDecision> {
  const db = getDb(tx);

  return db.offerDecision.create({
    data: {
      offerId: input.offerId,
      offerVersionId: input.offerVersionId,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      actorUserId: input.actorUserId,
      decisionType: input.decisionType,
      provenance: input.provenance || OfferProvenanceType.CANDIDATE_PROVIDED,
      executedAt: input.executedAt || new Date(),
      structuredReason: input.structuredReason || null,
      privateCandidateFeedback: input.privateCandidateFeedback || null,
      recordedOnBehalf: input.recordedOnBehalf ?? false,
      recordedOnBehalfReason: input.recordedOnBehalfReason || null,
    },
  });
}

export async function getOfferDecisionByVersion(
  offerId: string,
  offerVersionId: string,
  organizationId: string,
  tx?: Tx
): Promise<OfferDecision | null> {
  const db = getDb(tx);
  return db.offerDecision.findFirst({
    where: {
      offerId,
      offerVersionId,
      organizationId,
    },
  });
}

export async function listOfferDecisionsForOffer(
  offerId: string,
  organizationId: string,
  tx?: Tx
): Promise<OfferDecision[]> {
  const db = getDb(tx);
  return db.offerDecision.findMany({
    where: {
      offerId,
      organizationId,
    },
    orderBy: {
      executedAt: "desc",
    },
  });
}

// ==========================================
// 5. JOINING RECORD PRIMITIVES
// ==========================================

export async function createJoiningRecord(
  input: CreateJoiningRecordInput,
  tx?: Tx
): Promise<JoiningRecord> {
  const db = getDb(tx);
  return db.joiningRecord.create({
    data: {
      offerId: input.offerId,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      status: input.status || JoiningStatus.JOINING_PLANNED,
      scheduledStartDate: input.scheduledStartDate,
      scheduledStartDatetz: input.scheduledStartDatetz || null,
      actualStartDate: input.actualStartDate || null,
      location: input.location || null,
      reportingInstructions: input.reportingInstructions || null,
      hardwareDeliveryStatus: input.hardwareDeliveryStatus || null,
      backgroundCheckStatus: input.backgroundCheckStatus || null,
      firstDayConfirmedByCandidate: input.firstDayConfirmedByCandidate ?? false,
      firstDayConfirmedAt: input.firstDayConfirmedAt || null,
      failureReason: input.failureReason || null,
      failureNotes: input.failureNotes || null,
    },
  });
}

export async function getJoiningRecordByOfferId(
  offerId: string,
  organizationId: string,
  tx?: Tx
): Promise<JoiningRecord | null> {
  const db = getDb(tx);
  return db.joiningRecord.findFirst({
    where: {
      offerId,
      organizationId,
    },
  });
}

export async function updateJoiningRecord(
  id: string,
  organizationId: string,
  input: UpdateJoiningRecordInput,
  tx?: Tx
): Promise<JoiningRecord> {
  const db = getDb(tx);
  const existing = await db.joiningRecord.findFirst({
    where: { id, organizationId },
  });
  if (!existing) {
    throw new NotFoundError(`JoiningRecord with ID ${id} not found in organization ${organizationId}`);
  }

  return db.joiningRecord.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.scheduledStartDate !== undefined ? { scheduledStartDate: input.scheduledStartDate } : {}),
      ...(input.scheduledStartDatetz !== undefined ? { scheduledStartDatetz: input.scheduledStartDatetz } : {}),
      ...(input.actualStartDate !== undefined ? { actualStartDate: input.actualStartDate } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.reportingInstructions !== undefined ? { reportingInstructions: input.reportingInstructions } : {}),
      ...(input.hardwareDeliveryStatus !== undefined ? { hardwareDeliveryStatus: input.hardwareDeliveryStatus } : {}),
      ...(input.backgroundCheckStatus !== undefined ? { backgroundCheckStatus: input.backgroundCheckStatus } : {}),
      ...(input.firstDayConfirmedByCandidate !== undefined ? { firstDayConfirmedByCandidate: input.firstDayConfirmedByCandidate } : {}),
      ...(input.firstDayConfirmedAt !== undefined ? { firstDayConfirmedAt: input.firstDayConfirmedAt } : {}),
      ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
      ...(input.failureNotes !== undefined ? { failureNotes: input.failureNotes } : {}),
    },
  });
}

// ==========================================
// 6. PLACEMENT RECORD PRIMITIVES
// ==========================================

export async function createPlacementRecord(
  input: CreatePlacementRecordInput,
  tx?: Tx
): Promise<PlacementRecord> {
  const db = getDb(tx);
  return db.placementRecord.create({
    data: {
      offerId: input.offerId,
      joiningId: input.joiningId,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      verifiedStartDate: input.verifiedStartDate,
      verifiedAt: input.verifiedAt || new Date(),
      verifiedById: input.verifiedById,
      firstDayConfirmed: input.firstDayConfirmed ?? true,
      onboardingProofValidated: input.onboardingProofValidated ?? true,
      verificationNotes: input.verificationNotes || null,
      proofDocumentId: input.proofDocumentId || null,
      proofStoragePath: input.proofStoragePath || null,
      day30HealthCheckCompleted: input.day30HealthCheckCompleted ?? false,
      day30HealthCheckAt: input.day30HealthCheckAt || null,
      day90RetentionMilestoneCompleted: input.day90RetentionMilestoneCompleted ?? false,
      day90RetentionMilestoneAt: input.day90RetentionMilestoneAt || null,
    },
  });
}

export async function getPlacementRecordByOfferId(
  offerId: string,
  organizationId: string,
  tx?: Tx
): Promise<PlacementRecord | null> {
  const db = getDb(tx);
  return db.placementRecord.findFirst({
    where: {
      offerId,
      organizationId,
    },
  });
}

export async function updatePlacementRecord(
  id: string,
  organizationId: string,
  input: UpdatePlacementRecordInput,
  tx?: Tx
): Promise<PlacementRecord> {
  const db = getDb(tx);
  const existing = await db.placementRecord.findFirst({
    where: { id, organizationId },
  });
  if (!existing) {
    throw new NotFoundError(`PlacementRecord with ID ${id} not found in organization ${organizationId}`);
  }

  return db.placementRecord.update({
    where: { id },
    data: {
      ...(input.verifiedStartDate !== undefined ? { verifiedStartDate: input.verifiedStartDate } : {}),
      ...(input.firstDayConfirmed !== undefined ? { firstDayConfirmed: input.firstDayConfirmed } : {}),
      ...(input.onboardingProofValidated !== undefined ? { onboardingProofValidated: input.onboardingProofValidated } : {}),
      ...(input.verificationNotes !== undefined ? { verificationNotes: input.verificationNotes } : {}),
      ...(input.proofDocumentId !== undefined ? { proofDocumentId: input.proofDocumentId } : {}),
      ...(input.proofStoragePath !== undefined ? { proofStoragePath: input.proofStoragePath } : {}),
      ...(input.day30HealthCheckCompleted !== undefined ? { day30HealthCheckCompleted: input.day30HealthCheckCompleted } : {}),
      ...(input.day30HealthCheckAt !== undefined ? { day30HealthCheckAt: input.day30HealthCheckAt } : {}),
      ...(input.day90RetentionMilestoneCompleted !== undefined ? { day90RetentionMilestoneCompleted: input.day90RetentionMilestoneCompleted } : {}),
      ...(input.day90RetentionMilestoneAt !== undefined ? { day90RetentionMilestoneAt: input.day90RetentionMilestoneAt } : {}),
      ...(input.voidedAt !== undefined ? { voidedAt: input.voidedAt } : {}),
      ...(input.voidedById !== undefined ? { voidedById: input.voidedById } : {}),
      ...(input.voidReason !== undefined ? { voidReason: input.voidReason } : {}),
    },
  });
}

// ==========================================
// 7. OFFER EVIDENCE PRIMITIVES
// ==========================================

export async function recordOfferEvidence(
  input: RecordOfferEvidenceInput,
  tx?: Tx
): Promise<OfferEvidence> {
  const db = getDb(tx);
  return db.offerEvidence.create({
    data: {
      offerId: input.offerId,
      offerVersionId: input.offerVersionId || null,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      candidateDocumentId: input.candidateDocumentId || null,
      documentType: input.documentType,
      storagePath: input.storagePath,
      fileSizeBytes: input.fileSizeBytes ?? null,
      mimeType: input.mimeType || null,
      provenance: input.provenance || OfferProvenanceType.EVIDENCE_BACKED,
      uploadedById: input.uploadedById,
    },
  });
}

export async function listOfferEvidence(
  offerId: string,
  organizationId: string,
  tx?: Tx
): Promise<OfferEvidence[]> {
  const db = getDb(tx);
  return db.offerEvidence.findMany({
    where: {
      offerId,
      organizationId,
    },
    orderBy: {
      uploadedAt: "desc",
    },
  });
}
