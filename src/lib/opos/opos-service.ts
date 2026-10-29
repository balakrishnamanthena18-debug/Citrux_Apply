/**
 * Phase 9D — Offer & Placement Operating System (OPOS) Authoritative Service
 * Governs how OPOS state is allowed to change across the full offer lifecycle:
 * - Outcome Ledger -> OPOS handoff
 * - Immutable Offer Versioning
 * - Negotiation Lifecycle & Append-Only Events
 * - Candidate Decision Sovereignty (ACCEPT / DECLINE)
 * - Joining Lifecycle
 * - Two-Factor Placement Verification
 * - Terminal State Safeguards & Protected Voiding
 *
 * Contract: docs/engineering/PHASE_9A_OFFER_PLACEMENT_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 * Decision Lock: docs/engineering/PHASE_9B_OPOS_DECISION_LOCK_IMPLEMENTATION_READINESS.md
 */

import {
  OfferStatus,
  OfferVerificationState,
  OfferProvenanceType,
  NegotiationStatus,
  NegotiationEventType,
  OfferDecisionType,
  OfferDeclineReasonCategory,
  JoiningStatus,
  JoiningFailureReason,
  AuditAction,
  Role,
  type Offer,
  type OfferVersion,
  type Negotiation,
  type NegotiationEvent,
  type OfferDecision,
  type JoiningRecord,
  type PlacementRecord,
  type Prisma,
} from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { logUserAuditEvent } from "@/lib/audit";
import {
  AuthorizationError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  assertOfferAccess,
  assertCandidateDecisionAuthority,
} from "./authorization";
import {
  transitionOffer,
  assertNonTerminalOffer,
  isTerminalOfferStatus,
  assertValidJoiningTransition,
} from "./lifecycle";
import type {
  CreateOfferInput,
  CreateOfferVersionInput,
  RecordNegotiationEventInput,
  RecordOfferDecisionInput,
  CreateJoiningRecordInput,
  UpdateJoiningRecordInput,
  CreatePlacementRecordInput,
  UpdatePlacementRecordInput,
  RecordOfferEvidenceInput,
} from "./types";

type Tx = Prisma.TransactionClient;

// ==========================================
// 1. OUTCOME LEDGER -> OPOS HANDOFF
// ==========================================

export interface HandoffOutcomeToOfferParams {
  applicationId: string;
  initialTerms?: Partial<CreateOfferVersionInput>;
  decisionDeadline?: Date | null;
  decisionDeadlinetz?: string | null;
  scheduledStartDate?: Date | null;
  candidateNotes?: string | null;
  internalStaffNotes?: string | null;
  evidenceDocumentId?: string | null;
  evidenceStoragePath?: string | null;
}

/**
 * Authoritative handoff from Outcome Ledger (OFFER_RECEIVED) to OPOS.
 * Idempotent: If an active offer already exists for this application, returns existing offer.
 * Creates Offer (status: OFFER_RECEIVED) and V1 OfferVersion transactionally.
 */
export async function handoffOutcomeToOffer(
  tx: Tx,
  ctx: AuthenticatedContext,
  params: HandoffOutcomeToOfferParams
): Promise<{
  offer: Offer;
  version: OfferVersion;
  created: boolean;
}> {
  // 1. Validate application
  const app = await tx.application.findFirst({
    where: {
      id: params.applicationId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      candidateId: true,
      jobId: true,
      status: true,
      candidate: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  });

  if (!app) {
    throw new NotFoundError(`Application with ID ${params.applicationId} not found.`);
  }

  // 2. Validate actor authorization
  const isCandidateOwner = ctx.role === Role.CANDIDATE && app.candidate.userId === ctx.userId;
  const isStaff = ctx.role === Role.EMPLOYEE || ctx.role === Role.ADMIN;
  if (!isCandidateOwner && !isStaff) {
    throw new AuthorizationError("You do not have permission to initialize an offer for this application.");
  }

  // 3. Idempotency check: Look for existing active offer for this application
  const existingOffer = await tx.offer.findFirst({
    where: {
      applicationId: app.id,
      organizationId: ctx.organizationId,
      status: { notIn: [OfferStatus.WITHDRAWN, OfferStatus.DECLINED, OfferStatus.REPLACED] },
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  if (existingOffer && existingOffer.versions[0]) {
    return {
      offer: existingOffer,
      version: existingOffer.versions[0],
      created: false,
    };
  }

  // 4. Create root Offer record
  const offer = await tx.offer.create({
    data: {
      organizationId: ctx.organizationId,
      candidateId: app.candidateId,
      applicationId: app.id,
      jobId: app.jobId,
      status: OfferStatus.OFFER_RECEIVED,
      currentVersionNumber: 1,
      verificationState: params.evidenceDocumentId || params.evidenceStoragePath
        ? OfferVerificationState.EVIDENCE_SUBMITTED
        : OfferVerificationState.UNVERIFIED,
      initialReceivedAt: new Date(),
      decisionDeadline: params.decisionDeadline || null,
      decisionDeadlinetz: params.decisionDeadlinetz || null,
      scheduledStartDate: params.scheduledStartDate || null,
      candidateNotes: params.candidateNotes?.trim() || null,
      internalStaffNotes: isStaff ? params.internalStaffNotes?.trim() || null : null,
    },
  });

  // 5. Create immutable V1 OfferVersion
  const version = await tx.offerVersion.create({
    data: {
      offerId: offer.id,
      organizationId: ctx.organizationId,
      versionNumber: 1,
      provenance: isCandidateOwner ? OfferProvenanceType.CANDIDATE_PROVIDED : OfferProvenanceType.EMPLOYEE_RECORDED,
      receivedAt: new Date(),
      decisionDeadline: params.decisionDeadline || null,
      decisionDeadlinetz: params.decisionDeadlinetz || null,
      proposedStartDate: params.scheduledStartDate || null,
      roleTitle: params.initialTerms?.roleTitle?.trim() || null,
      department: params.initialTerms?.department?.trim() || null,
      location: params.initialTerms?.location?.trim() || null,
      isRemote: params.initialTerms?.isRemote ?? false,
      employmentType: params.initialTerms?.employmentType || "FULL_TIME",
      baseSalaryAmount: params.initialTerms?.baseSalaryAmount ?? null,
      baseSalaryCurrency: params.initialTerms?.baseSalaryCurrency || "USD",
      paymentFrequency: params.initialTerms?.paymentFrequency || "ANNUAL",
      targetVariableAmount: params.initialTerms?.targetVariableAmount ?? null,
      targetVariablePercentage: params.initialTerms?.targetVariablePercentage ? (params.initialTerms.targetVariablePercentage as any) : null,
      variableCriteria: params.initialTerms?.variableCriteria || null,
      signOnBonusAmount: params.initialTerms?.signOnBonusAmount ?? null,
      signOnTerms: params.initialTerms?.signOnTerms || null,
      retentionBonusAmount: params.initialTerms?.retentionBonusAmount ?? null,
      relocationAmount: params.initialTerms?.relocationAmount ?? null,
      benefitsSummary: params.initialTerms?.benefitsSummary || null,
      equityType: params.initialTerms?.equityType || null,
      grantQuantity: params.initialTerms?.grantQuantity ?? null,
      estimatedGrantValue: params.initialTerms?.estimatedGrantValue ? (params.initialTerms.estimatedGrantValue as any) : null,
      vestingPeriodMonths: params.initialTerms?.vestingPeriodMonths ?? null,
      cliffPeriodMonths: params.initialTerms?.cliffPeriodMonths ?? null,
      cliffPercentage: params.initialTerms?.cliffPercentage ? (params.initialTerms.cliffPercentage as any) : null,
      vestingFrequency: params.initialTerms?.vestingFrequency || null,
      strikePrice: params.initialTerms?.strikePrice ? (params.initialTerms.strikePrice as any) : null,
      fairMarketValueAtGrant: params.initialTerms?.fairMarketValueAtGrant ? (params.initialTerms.fairMarketValueAtGrant as any) : null,
    },
  });

  // 6. Attach evidence if provided
  if (params.evidenceStoragePath) {
    await tx.offerEvidence.create({
      data: {
        offerId: offer.id,
        offerVersionId: version.id,
        organizationId: ctx.organizationId,
        candidateId: app.candidateId,
        candidateDocumentId: params.evidenceDocumentId || null,
        documentType: "OFFER_LETTER",
        storagePath: params.evidenceStoragePath,
        provenance: OfferProvenanceType.EVIDENCE_BACKED,
        uploadedById: ctx.userId,
      },
    });
  }

  // 7. Transactional Auditing
  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.OPOS_OFFER_CREATED,
    entityType: "Offer",
    entityId: offer.id,
    details: {
      offerId: offer.id,
      applicationId: app.id,
      candidateId: app.candidateId,
      versionNumber: 1,
      hasEvidence: Boolean(params.evidenceStoragePath),
    },
    tx,
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.OPOS_OFFER_VERSION_CREATED,
    entityType: "OfferVersion",
    entityId: version.id,
    details: {
      offerId: offer.id,
      versionNumber: 1,
      roleTitle: version.roleTitle,
      baseSalaryAmount: version.baseSalaryAmount,
    },
    tx,
  });

  return {
    offer,
    version,
    created: true,
  };
}

// ==========================================
// 2. OFFER VERSION AUTHORITY (IMMUTABLE)
// ==========================================

export interface CreateAuthoritativeOfferVersionParams {
  offerId: string;
  terms: Omit<CreateOfferVersionInput, "offerId" | "organizationId" | "versionNumber">;
  provenance?: OfferProvenanceType;
  evidenceStoragePath?: string | null;
  evidenceDocumentId?: string | null;
}

/**
 * Creates a new authoritative OfferVersion.
 * Enforces monotonic version increment, immutability of historical versions,
 * sets supersededAt on the previous version, and updates Offer.currentVersionNumber.
 */
export async function createAuthoritativeOfferVersion(
  tx: Tx,
  ctx: AuthenticatedContext,
  params: CreateAuthoritativeOfferVersionParams
): Promise<{
  version: OfferVersion;
  offer: Offer;
}> {
  const { offer } = await assertOfferAccess(tx, ctx, params.offerId, { requireMutation: true });
  assertNonTerminalOffer(offer.status as OfferStatus, offer.id);

  const nextVersionNumber = offer.currentVersionNumber + 1;
  const now = new Date();

  // 1. Mark previous active version as superseded
  await tx.offerVersion.updateMany({
    where: {
      offerId: offer.id,
      organizationId: ctx.organizationId,
      supersededAt: null,
    },
    data: {
      supersededAt: now,
    },
  });

  // 2. Create the new immutable version
  const newVersion = await tx.offerVersion.create({
    data: {
      offerId: offer.id,
      organizationId: ctx.organizationId,
      versionNumber: nextVersionNumber,
      provenance: params.provenance || (ctx.role === Role.CANDIDATE ? OfferProvenanceType.CANDIDATE_PROVIDED : OfferProvenanceType.EMPLOYEE_RECORDED),
      receivedAt: now,
      decisionDeadline: params.terms.decisionDeadline || null,
      decisionDeadlinetz: params.terms.decisionDeadlinetz || null,
      proposedStartDate: params.terms.proposedStartDate || null,
      roleTitle: params.terms.roleTitle?.trim() || null,
      department: params.terms.department?.trim() || null,
      location: params.terms.location?.trim() || null,
      isRemote: params.terms.isRemote ?? false,
      employmentType: params.terms.employmentType || "FULL_TIME",
      baseSalaryAmount: params.terms.baseSalaryAmount ?? null,
      baseSalaryCurrency: params.terms.baseSalaryCurrency || "USD",
      paymentFrequency: params.terms.paymentFrequency || "ANNUAL",
      targetVariableAmount: params.terms.targetVariableAmount ?? null,
      targetVariablePercentage: params.terms.targetVariablePercentage ? (params.terms.targetVariablePercentage as any) : null,
      variableCriteria: params.terms.variableCriteria || null,
      signOnBonusAmount: params.terms.signOnBonusAmount ?? null,
      signOnTerms: params.terms.signOnTerms || null,
      retentionBonusAmount: params.terms.retentionBonusAmount ?? null,
      relocationAmount: params.terms.relocationAmount ?? null,
      benefitsSummary: params.terms.benefitsSummary || null,
      equityType: params.terms.equityType || null,
      grantQuantity: params.terms.grantQuantity ?? null,
      estimatedGrantValue: params.terms.estimatedGrantValue ? (params.terms.estimatedGrantValue as any) : null,
      vestingPeriodMonths: params.terms.vestingPeriodMonths ?? null,
      cliffPeriodMonths: params.terms.cliffPeriodMonths ?? null,
      cliffPercentage: params.terms.cliffPercentage ? (params.terms.cliffPercentage as any) : null,
      vestingFrequency: params.terms.vestingFrequency || null,
      strikePrice: params.terms.strikePrice ? (params.terms.strikePrice as any) : null,
      fairMarketValueAtGrant: params.terms.fairMarketValueAtGrant ? (params.terms.fairMarketValueAtGrant as any) : null,
    },
  });

  // 3. Update root offer currentVersionNumber & deadline
  const updatedOffer = await tx.offer.update({
    where: { id: offer.id },
    data: {
      currentVersionNumber: nextVersionNumber,
      decisionDeadline: params.terms.decisionDeadline || undefined,
      decisionDeadlinetz: params.terms.decisionDeadlinetz || undefined,
      scheduledStartDate: params.terms.proposedStartDate || undefined,
      updatedAt: now,
    },
  });

  // 4. Attach evidence if provided
  if (params.evidenceStoragePath) {
    await tx.offerEvidence.create({
      data: {
        offerId: offer.id,
        offerVersionId: newVersion.id,
        organizationId: ctx.organizationId,
        candidateId: offer.candidateId,
        candidateDocumentId: params.evidenceDocumentId || null,
        documentType: "OFFER_LETTER",
        storagePath: params.evidenceStoragePath,
        provenance: OfferProvenanceType.EVIDENCE_BACKED,
        uploadedById: ctx.userId,
      },
    });
  }

  // 5. Transactional Audit
  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.OPOS_OFFER_VERSION_CREATED,
    entityType: "OfferVersion",
    entityId: newVersion.id,
    details: {
      offerId: offer.id,
      versionNumber: nextVersionNumber,
      roleTitle: newVersion.roleTitle,
      baseSalaryAmount: newVersion.baseSalaryAmount,
    },
    tx,
  });

  return {
    version: newVersion,
    offer: updatedOffer,
  };
}

// ==========================================
// 3. NEGOTIATION LIFECYCLE & EVENTS
// ==========================================

export interface InitiateNegotiationParams {
  offerId: string;
  candidateTargetBase?: number | null;
  candidateTargetVariable?: number | null;
  candidateTargetEquity?: number | null;
  candidateTargetSignOn?: number | null;
  candidateTargetNotes?: string | null;
  strategyTalkingPoints?: string | null;
}

export async function initiateNegotiation(
  tx: Tx,
  ctx: AuthenticatedContext,
  params: InitiateNegotiationParams
): Promise<{
  negotiation: Negotiation;
  offer: Offer;
}> {
  const { offer } = await assertOfferAccess(tx, ctx, params.offerId, { requireMutation: true });
  assertNonTerminalOffer(offer.status as OfferStatus, offer.id);

  // Transition offer to NEGOTIATION state if not already in negotiation
  if (offer.status !== OfferStatus.NEGOTIATION) {
    if (offer.status === OfferStatus.OFFER_RECEIVED) {
      await transitionOffer(tx, ctx, {
        offerId: offer.id,
        toStatus: OfferStatus.OFFER_UNDER_REVIEW,
        reason: "Review started before negotiation",
      });
    }
    await transitionOffer(tx, ctx, {
      offerId: offer.id,
      toStatus: OfferStatus.NEGOTIATION,
      reason: "Negotiation initiated",
      auditAction: AuditAction.OPOS_NEGOTIATION_INITIATED,
    });
  }

  const negotiation = await tx.negotiation.upsert({
    where: { offerId: offer.id },
    create: {
      offerId: offer.id,
      organizationId: ctx.organizationId,
      status: NegotiationStatus.STRATEGY_PENDING,
      activeRoundNumber: 1,
      candidateTargetBase: params.candidateTargetBase ?? null,
      candidateTargetVariable: params.candidateTargetVariable ?? null,
      candidateTargetEquity: params.candidateTargetEquity ?? null,
      candidateTargetSignOn: params.candidateTargetSignOn ?? null,
      candidateTargetNotes: params.candidateTargetNotes?.trim() || null,
      strategyTalkingPoints: params.strategyTalkingPoints?.trim() || null,
    },
    update: {
      status: NegotiationStatus.STRATEGY_PENDING,
      candidateTargetBase: params.candidateTargetBase !== undefined ? params.candidateTargetBase : undefined,
      candidateTargetVariable: params.candidateTargetVariable !== undefined ? params.candidateTargetVariable : undefined,
      candidateTargetEquity: params.candidateTargetEquity !== undefined ? params.candidateTargetEquity : undefined,
      candidateTargetSignOn: params.candidateTargetSignOn !== undefined ? params.candidateTargetSignOn : undefined,
      candidateTargetNotes: params.candidateTargetNotes !== undefined ? params.candidateTargetNotes?.trim() || null : undefined,
      strategyTalkingPoints: params.strategyTalkingPoints !== undefined ? params.strategyTalkingPoints?.trim() || null : undefined,
      updatedAt: new Date(),
    },
  });

  const isCandidate = ctx.role === Role.CANDIDATE;
  await tx.negotiationEvent.create({
    data: {
      negotiationId: negotiation.id,
      organizationId: ctx.organizationId,
      roundNumber: negotiation.activeRoundNumber,
      eventType: isCandidate ? NegotiationEventType.CANDIDATE_TARGET_SET : NegotiationEventType.STRATEGY_NOTES_ADDED,
      actorUserId: ctx.userId,
      actorRole: ctx.role as Role,
      provenance: isCandidate ? OfferProvenanceType.CANDIDATE_PROVIDED : OfferProvenanceType.EMPLOYEE_RECORDED,
      eventDetails: {
        candidateTargetBase: params.candidateTargetBase,
        candidateTargetNotes: params.candidateTargetNotes,
      },
    },
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.OPOS_NEGOTIATION_INITIATED,
    entityType: "Negotiation",
    entityId: negotiation.id,
    details: {
      offerId: offer.id,
      status: negotiation.status,
    },
    tx,
  });

  const refreshedOffer = await tx.offer.findUniqueOrThrow({ where: { id: offer.id } });
  return { negotiation, offer: refreshedOffer };
}

export interface RecordAuthoritativeNegotiationEventParams {
  offerId: string;
  eventType: NegotiationEventType;
  offerVersionId?: string | null;
  roundNumber?: number;
  eventDetails?: Record<string, unknown>;
  internalStaffNotes?: string | null;
  provenance?: OfferProvenanceType;
}

export async function recordAuthoritativeNegotiationEvent(
  tx: Tx,
  ctx: AuthenticatedContext,
  params: RecordAuthoritativeNegotiationEventParams
): Promise<NegotiationEvent> {
  const { offer } = await assertOfferAccess(tx, ctx, params.offerId, { requireMutation: true });
  assertNonTerminalOffer(offer.status as OfferStatus, offer.id);

  let negotiation = await tx.negotiation.findUnique({ where: { offerId: offer.id } });
  if (!negotiation) {
    negotiation = await tx.negotiation.create({
      data: {
        offerId: offer.id,
        organizationId: ctx.organizationId,
        status: NegotiationStatus.STRATEGY_PENDING,
        activeRoundNumber: 1,
      },
    });
  }

  const roundNumber = params.roundNumber ?? negotiation.activeRoundNumber;

  const event = await tx.negotiationEvent.create({
    data: {
      negotiationId: negotiation.id,
      organizationId: ctx.organizationId,
      offerVersionId: params.offerVersionId || null,
      roundNumber,
      eventType: params.eventType,
      actorUserId: ctx.userId,
      actorRole: ctx.role as Role,
      provenance: params.provenance || (ctx.role === Role.CANDIDATE ? OfferProvenanceType.CANDIDATE_PROVIDED : OfferProvenanceType.EMPLOYEE_RECORDED),
      eventDetails: (params.eventDetails as Prisma.InputJsonValue) ?? {},
      internalStaffNotes: ctx.role !== Role.CANDIDATE ? params.internalStaffNotes?.trim() || null : null,
      recordedAt: new Date(),
    },
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.OPOS_NEGOTIATION_EVENT_RECORDED,
    entityType: "NegotiationEvent",
    entityId: event.id,
    details: {
      offerId: offer.id,
      negotiationId: negotiation.id,
      eventType: event.eventType,
      roundNumber,
    },
    tx,
  });

  return event;
}

// ==========================================
// 4. CANDIDATE DECISION SOVEREIGNTY
// ==========================================

export interface RecordAuthoritativeCandidateDecisionParams {
  offerId: string;
  offerVersionId: string;
  decisionType: OfferDecisionType;
  structuredReason?: OfferDeclineReasonCategory | null;
  privateCandidateFeedback?: string | null;
  scheduledStartDate?: Date | null;
}

/**
 * Authoritative Candidate Decision Gateway.
 * Enforces candidate decision sovereignty: ONLY the candidate may authorize ACCEPT or DECLINE.
 * No staff on-behalf decision path exists.
 * Atomic execution of OfferDecision and Offer state transition:
 * - ACCEPT -> OfferStatus.ACCEPTED & initializes JoiningRecord
 * - DECLINE -> OfferStatus.DECLINED (terminal)
 * - REQUEST_NEGOTIATION -> OfferStatus.NEGOTIATION
 * - REQUEST_EXTENSION -> updates deadline
 */
export async function recordAuthoritativeCandidateDecision(
  tx: Tx,
  ctx: AuthenticatedContext,
  params: RecordAuthoritativeCandidateDecisionParams
): Promise<{
  decision: OfferDecision;
  offer: Offer;
  joining?: JoiningRecord;
}> {
  const { offer, candidate } = await assertOfferAccess(tx, ctx, params.offerId);

  // Acquire row-level lock on offer to serialize concurrent decisions deterministically
  if (typeof (tx as any).$executeRaw === "function") {
    await (tx as any).$executeRaw`SELECT id FROM offers WHERE id = ${offer.id}::uuid FOR UPDATE`;
  }

  // 1. Enforce candidate sovereignty (No staff on-behalf decision path)
  assertCandidateDecisionAuthority(ctx, candidate.userId);

  // 2. Validate version linkage
  const version = await tx.offerVersion.findFirst({
    where: {
      id: params.offerVersionId,
      offerId: offer.id,
      organizationId: ctx.organizationId,
    },
  });

  if (!version) {
    throw new NotFoundError(`OfferVersion ${params.offerVersionId} does not belong to Offer ${offer.id}.`);
  }

  // 3. Check for existing duplicate decision (Idempotency)
  const existingDecision = await tx.offerDecision.findFirst({
    where: {
      offerId: offer.id,
      offerVersionId: version.id,
      decisionType: params.decisionType,
    },
  });

  if (existingDecision) {
    const currentOffer = await tx.offer.findUniqueOrThrow({ where: { id: offer.id } });
    const currentJoining = await tx.joiningRecord.findUnique({ where: { offerId: offer.id } });
    return {
      decision: existingDecision,
      offer: currentOffer,
      joining: currentJoining ?? undefined,
    };
  }

  // 4. Assert non-terminal offer for new decisions
  assertNonTerminalOffer(offer.status as OfferStatus, offer.id);

  // Decision must target current active version
  if (version.versionNumber !== offer.currentVersionNumber) {
    throw new InvalidStateTransitionError(
      `Cannot decide on stale OfferVersion V${version.versionNumber}. Current active version is V${offer.currentVersionNumber}.`
    );
  }

  // 4. Create immutable OfferDecision with candidate ownership
  const decision = await tx.offerDecision.create({
    data: {
      offerId: offer.id,
      offerVersionId: version.id,
      organizationId: ctx.organizationId,
      candidateId: candidate.id,
      actorUserId: ctx.userId,
      decisionType: params.decisionType,
      provenance: OfferProvenanceType.CANDIDATE_PROVIDED,
      executedAt: new Date(),
      structuredReason: params.structuredReason || null,
      privateCandidateFeedback: params.privateCandidateFeedback?.trim() || null,
      recordedOnBehalf: false,
      recordedOnBehalfReason: null,
    },
  });

  let nextOfferStatus: OfferStatus = offer.status as OfferStatus;
  let joiningRecord: JoiningRecord | undefined = undefined;

  // 5. Atomic state transitions based on decision
  if (params.decisionType === OfferDecisionType.ACCEPT) {
    // If not in DECISION_PENDING, align to DECISION_PENDING first
    if (offer.status !== OfferStatus.DECISION_PENDING) {
      await transitionOffer(tx, ctx, {
        offerId: offer.id,
        toStatus: OfferStatus.DECISION_PENDING,
        reason: "Offer structured for candidate decision",
      });
    }

    // Transition offer to ACCEPTED
    await transitionOffer(tx, ctx, {
      offerId: offer.id,
      toStatus: OfferStatus.ACCEPTED,
      reason: "Candidate accepted offer",
      auditAction: AuditAction.OPOS_OFFER_ACCEPTED,
    });

    const startDate = params.scheduledStartDate || version.proposedStartDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Initialize JoiningRecord
    joiningRecord = await tx.joiningRecord.upsert({
      where: { offerId: offer.id },
      create: {
        offerId: offer.id,
        organizationId: ctx.organizationId,
        candidateId: candidate.id,
        applicationId: offer.applicationId,
        status: JoiningStatus.JOINING_PLANNED,
        scheduledStartDate: startDate,
        location: version.location,
      },
      update: {
        status: JoiningStatus.JOINING_PLANNED,
        scheduledStartDate: startDate,
        location: version.location || undefined,
        updatedAt: new Date(),
      },
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.OPOS_JOINING_SCHEDULED,
      entityType: "JoiningRecord",
      entityId: joiningRecord.id,
      details: {
        offerId: offer.id,
        scheduledStartDate: startDate.toISOString(),
      },
      tx,
    });
  } else if (params.decisionType === OfferDecisionType.DECLINE) {
    await transitionOffer(tx, ctx, {
      offerId: offer.id,
      toStatus: OfferStatus.DECLINED,
      reason: params.structuredReason ? `Candidate declined: ${params.structuredReason}` : "Candidate declined offer",
      auditAction: AuditAction.OPOS_OFFER_DECLINED,
    });
  } else if (params.decisionType === OfferDecisionType.REQUEST_NEGOTIATION) {
    if (offer.status !== OfferStatus.NEGOTIATION) {
      await transitionOffer(tx, ctx, {
        offerId: offer.id,
        toStatus: OfferStatus.NEGOTIATION,
        reason: "Candidate requested negotiation",
        auditAction: AuditAction.OPOS_NEGOTIATION_INITIATED,
      });
    }
  }

  const updatedOffer = await tx.offer.findUniqueOrThrow({ where: { id: offer.id } });

  return {
    decision,
    offer: updatedOffer,
    joining: joiningRecord,
  };
}

// ==========================================
// 5. JOINING LIFECYCLE
// ==========================================

export interface ConfirmFirstDayParams {
  offerId: string;
  actualStartDate?: Date;
  location?: string;
  reportingInstructions?: string;
}

export async function confirmCandidateFirstDay(
  tx: Tx,
  ctx: AuthenticatedContext,
  params: ConfirmFirstDayParams
): Promise<JoiningRecord> {
  const { offer, candidate } = await assertOfferAccess(tx, ctx, params.offerId, { requireMutation: true });

  if (offer.status !== OfferStatus.ACCEPTED) {
    throw new InvalidStateTransitionError(
      `Cannot confirm joining for offer in status '${offer.status}'. Must be in '${OfferStatus.ACCEPTED}'.`
    );
  }

  const joining = await tx.joiningRecord.findUnique({
    where: { offerId: offer.id },
  });

  if (!joining) {
    throw new NotFoundError(`JoiningRecord for offer ${offer.id} not found.`);
  }

  assertValidJoiningTransition(joining.status as JoiningStatus, JoiningStatus.JOINING_CONFIRMED, offer.id);

  const isCandidateOwner = ctx.role === Role.CANDIDATE && candidate.userId === ctx.userId;
  const now = new Date();

  const updatedJoining = await tx.joiningRecord.update({
    where: { id: joining.id },
    data: {
      status: JoiningStatus.JOINING_CONFIRMED,
      firstDayConfirmedByCandidate: isCandidateOwner ? true : joining.firstDayConfirmedByCandidate,
      firstDayConfirmedAt: isCandidateOwner ? now : joining.firstDayConfirmedAt,
      actualStartDate: params.actualStartDate || joining.scheduledStartDate,
      location: params.location || joining.location,
      reportingInstructions: params.reportingInstructions || joining.reportingInstructions,
      updatedAt: now,
    },
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.OPOS_JOINING_UPDATED,
    entityType: "JoiningRecord",
    entityId: updatedJoining.id,
    details: {
      offerId: offer.id,
      status: JoiningStatus.JOINING_CONFIRMED,
      firstDayConfirmedByCandidate: updatedJoining.firstDayConfirmedByCandidate,
    },
    tx,
  });

  return updatedJoining;
}

export interface RecordFailedToJoinParams {
  offerId: string;
  failureReason: JoiningFailureReason;
  failureNotes?: string | null;
}

export async function recordFailedToJoin(
  tx: Tx,
  ctx: AuthenticatedContext,
  params: RecordFailedToJoinParams
): Promise<JoiningRecord> {
  const { offer } = await assertOfferAccess(tx, ctx, params.offerId, { requireStaffPrivilege: true });

  const joining = await tx.joiningRecord.findUnique({
    where: { offerId: offer.id },
  });

  if (!joining) {
    throw new NotFoundError(`JoiningRecord for offer ${offer.id} not found.`);
  }

  assertValidJoiningTransition(joining.status as JoiningStatus, JoiningStatus.FAILED_TO_JOIN, offer.id);

  const updatedJoining = await tx.joiningRecord.update({
    where: { id: joining.id },
    data: {
      status: JoiningStatus.FAILED_TO_JOIN,
      failureReason: params.failureReason,
      failureNotes: params.failureNotes?.trim() || null,
      updatedAt: new Date(),
    },
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.OPOS_JOINING_UPDATED,
    entityType: "JoiningRecord",
    entityId: updatedJoining.id,
    details: {
      offerId: offer.id,
      status: JoiningStatus.FAILED_TO_JOIN,
      failureReason: params.failureReason,
      failureNotes: params.failureNotes,
    },
    tx,
  });

  return updatedJoining;
}

// ==========================================
// 6. TWO-FACTOR PLACEMENT VERIFICATION
// ==========================================

export interface VerifyPlacementParams {
  offerId: string;
  verifiedStartDate: Date;
  firstDayConfirmed: boolean;
  onboardingProofValidated: boolean;
  proofDocumentId?: string | null;
  proofStoragePath?: string | null;
  verificationNotes?: string | null;
}

/**
 * Two-Factor Placement Verification Gateway.
 * Mandatory Invariant: Requires BOTH:
 * 1. firstDayConfirmed === true (First day of work confirmed)
 * 2. onboardingProofValidated === true (Proof document attached and validated)
 * Strictly requires staff authority (EMPLOYEE or ADMIN).
 */
export async function verifyPlacement(
  tx: Tx,
  ctx: AuthenticatedContext,
  params: VerifyPlacementParams
): Promise<{
  placement: PlacementRecord;
  offer: Offer;
}> {
  const { offer, candidate } = await assertOfferAccess(tx, ctx, params.offerId, { requireStaffPrivilege: true });
  assertNonTerminalOffer(offer.status as OfferStatus, offer.id);

  // Acquire row-level lock on offer to serialize concurrent placement verifications deterministically
  if (typeof (tx as any).$executeRaw === "function") {
    await (tx as any).$executeRaw`SELECT id FROM offers WHERE id = ${offer.id}::uuid FOR UPDATE`;
  }

  if (offer.status !== OfferStatus.ACCEPTED) {
    throw new InvalidStateTransitionError(
      `Placement verification requires offer status '${OfferStatus.ACCEPTED}' (got '${offer.status}').`
    );
  }

  const joining = await tx.joiningRecord.findUnique({
    where: { offerId: offer.id },
  });

  if (!joining) {
    throw new NotFoundError(`JoiningRecord for offer ${offer.id} is required before placement verification.`);
  }

  if (joining.status === JoiningStatus.FAILED_TO_JOIN) {
    throw new InvalidStateTransitionError("Cannot verify placement for an offer marked FAILED_TO_JOIN.");
  }

  // Enforce Two-Factor Proof
  if (!params.firstDayConfirmed) {
    throw new ValidationError("Two-factor placement verification requires firstDayConfirmed === true (Factor 1).");
  }

  if (!params.onboardingProofValidated) {
    throw new ValidationError("Two-factor placement verification requires onboardingProofValidated === true (Factor 2).");
  }

  if (!params.proofDocumentId && !params.proofStoragePath) {
    throw new ValidationError("Two-factor placement verification requires valid proof document attachment (proofDocumentId or proofStoragePath).");
  }

  // Enforce proof document tenant and candidate scoping
  if (params.proofDocumentId) {
    const doc = await tx.candidateDocument.findFirst({
      where: {
        id: params.proofDocumentId,
        candidateId: candidate.id,
        candidate: {
          organizationId: ctx.organizationId,
        },
      },
    });

    if (!doc) {
      throw new ValidationError("Proof document must belong to the candidate within the same organization.");
    }
  }

  const now = new Date();

  // Create or Update PlacementRecord
  const placement = await tx.placementRecord.upsert({
    where: { offerId: offer.id },
    create: {
      offerId: offer.id,
      joiningId: joining.id,
      organizationId: ctx.organizationId,
      candidateId: candidate.id,
      applicationId: offer.applicationId,
      verifiedStartDate: params.verifiedStartDate,
      verifiedAt: now,
      verifiedById: ctx.userId,
      firstDayConfirmed: true,
      onboardingProofValidated: true,
      verificationNotes: params.verificationNotes?.trim() || null,
      proofDocumentId: params.proofDocumentId || null,
      proofStoragePath: params.proofStoragePath || null,
    },
    update: {
      verifiedStartDate: params.verifiedStartDate,
      verifiedAt: now,
      verifiedById: ctx.userId,
      firstDayConfirmed: true,
      onboardingProofValidated: true,
      verificationNotes: params.verificationNotes?.trim() || null,
      proofDocumentId: params.proofDocumentId || undefined,
      proofStoragePath: params.proofStoragePath || undefined,
      updatedAt: now,
    },
  });

  // Stamp Offer verification
  const updatedOffer = await tx.offer.update({
    where: { id: offer.id },
    data: {
      verificationState: OfferVerificationState.VERIFIED,
      verifiedAt: now,
      verifiedById: ctx.userId,
      updatedAt: now,
    },
  });

  // Transactional Audit
  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.OPOS_PLACEMENT_VERIFIED,
    entityType: "PlacementRecord",
    entityId: placement.id,
    details: {
      offerId: offer.id,
      placementId: placement.id,
      candidateId: candidate.id,
      verifiedStartDate: params.verifiedStartDate.toISOString(),
      proofDocumentId: params.proofDocumentId,
    },
    tx,
  });

  return {
    placement,
    offer: updatedOffer,
  };
}

// ==========================================
// 7. TERMINAL SAFEGUARDS & PROTECTED VOIDING
// ==========================================

export async function voidPlacement(
  tx: Tx,
  ctx: AuthenticatedContext,
  params: {
    offerId: string;
    voidReason: string;
  }
): Promise<PlacementRecord> {
  const { offer } = await assertOfferAccess(tx, ctx, params.offerId, { requireStaffPrivilege: true });

  const placement = await tx.placementRecord.findUnique({
    where: { offerId: offer.id },
  });

  if (!placement) {
    throw new NotFoundError(`PlacementRecord for offer ${offer.id} not found.`);
  }

  if (placement.voidedAt) {
    throw new ValidationError("PlacementRecord is already voided.");
  }

  const now = new Date();
  const voided = await tx.placementRecord.update({
    where: { id: placement.id },
    data: {
      voidedAt: now,
      voidedById: ctx.userId,
      voidReason: params.voidReason.trim(),
      updatedAt: now,
    },
  });

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action: AuditAction.OPOS_PLACEMENT_VOIDED,
    entityType: "PlacementRecord",
    entityId: voided.id,
    details: {
      offerId: offer.id,
      voidReason: params.voidReason.trim(),
    },
    tx,
  });

  return voided;
}
