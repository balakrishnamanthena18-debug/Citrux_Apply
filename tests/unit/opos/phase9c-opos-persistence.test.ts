/**
 * Phase 9C — OPOS Data Model & Persistence Foundation Unit Tests
 * Verifies Offer, OfferVersion, Negotiation, NegotiationEvent, OfferDecision,
 * JoiningRecord, PlacementRecord, OfferEvidence persistence and schema rules.
 */

import { describe, it, expect, vi } from "vitest";
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
} from "@/lib/opos/types";
import {
  createOffer,
  getOfferById,
  getOfferByApplicationId,
  listOffersForCandidate,
  listOffersForOrganization,
  updateOffer,
  createOfferVersion,
  getOfferVersionById,
  listOfferVersions,
  createNegotiation,
  getNegotiationByOfferId,
  updateNegotiation,
  recordNegotiationEvent,
  listNegotiationEvents,
  recordOfferDecision,
  getOfferDecisionByVersion,
  listOfferDecisionsForOffer,
  createJoiningRecord,
  getJoiningRecordByOfferId,
  updateJoiningRecord,
  createPlacementRecord,
  getPlacementRecordByOfferId,
  updatePlacementRecord,
  recordOfferEvidence,
  listOfferEvidence,
} from "@/lib/opos/opos-repository";
import { NotFoundError } from "@/lib/errors";

describe("Phase 9C: OPOS Data Model & Persistence Foundation", () => {
  const mockOrgId = "11111111-1111-1111-1111-111111111111";
  const mockCandidateId = "22222222-2222-2222-2222-222222222222";
  const mockAppId = "33333333-3333-3333-3333-333333333333";
  const mockJobId = "44444444-4444-4444-4444-444444444444";
  const mockUserId = "55555555-5555-5555-5555-555555555555";
  const mockOfferId = "66666666-6666-6666-6666-666666666666";
  const mockVersionId = "77777777-7777-7777-7777-777777777777";
  const mockNegotiationId = "88888888-8888-8888-8888-888888888888";
  const mockJoiningId = "99999999-9999-9999-9999-999999999999";
  const mockPlacementId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const mockDocId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  describe("1. Enums and Vocabulary Invariants", () => {
    it("exports all frozen OfferStatus enum values", () => {
      expect(OfferStatus.OFFER_RECEIVED).toBe("OFFER_RECEIVED");
      expect(OfferStatus.OFFER_UNDER_REVIEW).toBe("OFFER_UNDER_REVIEW");
      expect(OfferStatus.NEGOTIATION).toBe("NEGOTIATION");
      expect(OfferStatus.DECISION_PENDING).toBe("DECISION_PENDING");
      expect(OfferStatus.ACCEPTED).toBe("ACCEPTED");
      expect(OfferStatus.DECLINED).toBe("DECLINED");
      expect(OfferStatus.EXPIRED).toBe("EXPIRED");
      expect(OfferStatus.WITHDRAWN).toBe("WITHDRAWN");
      expect(OfferStatus.REPLACED).toBe("REPLACED");
    });

    it("exports all frozen OfferProvenanceType values", () => {
      expect(OfferProvenanceType.CANDIDATE_PROVIDED).toBe("CANDIDATE_PROVIDED");
      expect(OfferProvenanceType.EMPLOYEE_RECORDED).toBe("EMPLOYEE_RECORDED");
      expect(OfferProvenanceType.EMPLOYER_COMMUNICATED).toBe("EMPLOYER_COMMUNICATED");
      expect(OfferProvenanceType.EVIDENCE_BACKED).toBe("EVIDENCE_BACKED");
      expect(OfferProvenanceType.SYSTEM_DERIVED).toBe("SYSTEM_DERIVED");
    });

    it("exports all frozen JoiningStatus & FailureReason values", () => {
      expect(JoiningStatus.JOINING_PLANNED).toBe("JOINING_PLANNED");
      expect(JoiningStatus.JOINING_CONFIRMED).toBe("JOINING_CONFIRMED");
      expect(JoiningStatus.FAILED_TO_JOIN).toBe("FAILED_TO_JOIN");

      expect(JoiningFailureReason.RESCINDED_BY_EMPLOYER).toBe("RESCINDED_BY_EMPLOYER");
      expect(JoiningFailureReason.CANDIDATE_RENEGED).toBe("CANDIDATE_RENEGED");
      expect(JoiningFailureReason.FAILED_BACKGROUND_CHECK).toBe("FAILED_BACKGROUND_CHECK");
      expect(JoiningFailureReason.FAILED_TO_REPORT).toBe("FAILED_TO_REPORT");
    });
  });

  describe("2. Offer Persistence Primitives", () => {
    it("creates an Offer record bound to organization, candidate, and application", async () => {
      const mockTx = {
        offer: {
          create: vi.fn().mockResolvedValue({
            id: mockOfferId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            applicationId: mockAppId,
            jobId: mockJobId,
            status: OfferStatus.OFFER_RECEIVED,
            currentVersionNumber: 1,
            verificationState: OfferVerificationState.UNVERIFIED,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      } as any;

      const offer = await createOffer(
        {
          organizationId: mockOrgId,
          candidateId: mockCandidateId,
          applicationId: mockAppId,
          jobId: mockJobId,
        },
        mockTx
      );

      expect(offer.id).toBe(mockOfferId);
      expect(offer.status).toBe(OfferStatus.OFFER_RECEIVED);
      expect(mockTx.offer.create).toHaveBeenCalledWith({
        data: {
          organizationId: mockOrgId,
          candidateId: mockCandidateId,
          applicationId: mockAppId,
          jobId: mockJobId,
          status: OfferStatus.OFFER_RECEIVED,
          currentVersionNumber: 1,
          verificationState: OfferVerificationState.UNVERIFIED,
          initialReceivedAt: expect.any(Date),
          decisionDeadline: null,
          decisionDeadlinetz: null,
          scheduledStartDate: null,
          internalStaffNotes: null,
          candidateNotes: null,
        },
      });
    });

    it("allows multiple offers for the same candidate without overwriting", async () => {
      const mockTx = {
        offer: {
          findMany: vi.fn().mockResolvedValue([
            { id: "offer-1", candidateId: mockCandidateId },
            { id: "offer-2", candidateId: mockCandidateId },
          ]),
        },
      } as any;

      const offers = await listOffersForCandidate(mockCandidateId, mockOrgId, mockTx);
      expect(offers.length).toBe(2);
      expect(offers[0]!.id).toBe("offer-1");
      expect(offers[1]!.id).toBe("offer-2");
    });

    it("updates offer metadata without hard deleting history", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({ id: mockOfferId, organizationId: mockOrgId }),
          update: vi.fn().mockResolvedValue({
            id: mockOfferId,
            status: OfferStatus.NEGOTIATION,
            currentVersionNumber: 2,
          }),
        },
      } as any;

      const updated = await updateOffer(
        mockOfferId,
        mockOrgId,
        {
          status: OfferStatus.NEGOTIATION,
          currentVersionNumber: 2,
        },
        mockTx
      );

      expect(updated.status).toBe(OfferStatus.NEGOTIATION);
      expect(updated.currentVersionNumber).toBe(2);
    });
  });

  describe("3. OfferVersion Immutability & Compensation", () => {
    it("creates an immutable OfferVersion with complete compensation breakdown", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({ id: mockOfferId, organizationId: mockOrgId }),
        },
        offerVersion: {
          create: vi.fn().mockResolvedValue({
            id: mockVersionId,
            offerId: mockOfferId,
            organizationId: mockOrgId,
            versionNumber: 1,
            roleTitle: "Staff Software Engineer",
            baseSalaryAmount: 185000,
            signOnBonusAmount: 25000,
            targetVariableAmount: 20000,
            equityType: EquityType.RSU,
            estimatedGrantValue: "150000.00",
            cliffPeriodMonths: 12,
            vestingPeriodMonths: 48,
            vestingFrequency: EquityVestingFrequency.QUARTERLY,
          }),
        },
      } as any;

      const version = await createOfferVersion(
        {
          offerId: mockOfferId,
          organizationId: mockOrgId,
          versionNumber: 1,
          roleTitle: "Staff Software Engineer",
          baseSalaryAmount: 185000,
          signOnBonusAmount: 25000,
          targetVariableAmount: 20000,
          equityType: EquityType.RSU,
          estimatedGrantValue: "150000.00",
          cliffPeriodMonths: 12,
          vestingPeriodMonths: 48,
          vestingFrequency: EquityVestingFrequency.QUARTERLY,
        },
        mockTx
      );

      expect(version.id).toBe(mockVersionId);
      expect(version.versionNumber).toBe(1);
      expect(version.baseSalaryAmount).toBe(185000);
      expect(version.equityType).toBe(EquityType.RSU);
    });

    it("throws NotFoundError when creating version for non-existent offer in organization", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      await expect(
        createOfferVersion(
          {
            offerId: "unknown-offer",
            organizationId: mockOrgId,
            versionNumber: 1,
            roleTitle: "Engineer",
            baseSalaryAmount: 100000,
          },
          mockTx
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("4. Negotiation & Immutable Negotiation Events", () => {
    it("creates a Negotiation record linked to an Offer", async () => {
      const mockTx = {
        negotiation: {
          create: vi.fn().mockResolvedValue({
            id: mockNegotiationId,
            offerId: mockOfferId,
            organizationId: mockOrgId,
            status: NegotiationStatus.STRATEGY_PENDING,
            candidateTargetBase: 200000,
          }),
        },
      } as any;

      const neg = await createNegotiation(
        {
          offerId: mockOfferId,
          organizationId: mockOrgId,
          status: NegotiationStatus.STRATEGY_PENDING,
          candidateTargetBase: 200000,
        },
        mockTx
      );

      expect(neg.id).toBe(mockNegotiationId);
      expect(neg.offerId).toBe(mockOfferId);
    });

    it("records immutable negotiation events with actor provenance", async () => {
      const mockTx = {
        negotiationEvent: {
          create: vi.fn().mockResolvedValue({
            id: "event-1",
            negotiationId: mockNegotiationId,
            organizationId: mockOrgId,
            eventType: NegotiationEventType.COUNTER_PROPOSAL_DISPATCHED,
            provenance: OfferProvenanceType.EMPLOYEE_RECORDED,
            actorUserId: mockUserId,
            actorRole: Role.EMPLOYEE,
          }),
        },
      } as any;

      const event = await recordNegotiationEvent(
        {
          negotiationId: mockNegotiationId,
          organizationId: mockOrgId,
          eventType: NegotiationEventType.COUNTER_PROPOSAL_DISPATCHED,
          provenance: OfferProvenanceType.EMPLOYEE_RECORDED,
          actorUserId: mockUserId,
          actorRole: Role.EMPLOYEE,
        },
        mockTx
      );

      expect(event.eventType).toBe(NegotiationEventType.COUNTER_PROPOSAL_DISPATCHED);
      expect(event.provenance).toBe(OfferProvenanceType.EMPLOYEE_RECORDED);
    });
  });

  describe("5. Candidate Decision Sovereignty", () => {
    it("records candidate ACCEPT decision with version linkage", async () => {
      const mockTx = {
        offerDecision: {
          create: vi.fn().mockResolvedValue({
            id: "decision-1",
            offerId: mockOfferId,
            offerVersionId: mockVersionId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            decisionType: OfferDecisionType.ACCEPT,
            recordedOnBehalf: false,
          }),
        },
      } as any;

      const decision = await recordOfferDecision(
        {
          offerId: mockOfferId,
          offerVersionId: mockVersionId,
          organizationId: mockOrgId,
          candidateId: mockCandidateId,
          actorUserId: mockUserId,
          decisionType: OfferDecisionType.ACCEPT,
          recordedOnBehalf: false,
        },
        mockTx
      );

      expect(decision.decisionType).toBe(OfferDecisionType.ACCEPT);
      expect(decision.recordedOnBehalf).toBe(false);
    });

    it("records DECLINE decision with category and private decline reason", async () => {
      const mockTx = {
        offerDecision: {
          create: vi.fn().mockResolvedValue({
            id: "decision-2",
            offerId: mockOfferId,
            offerVersionId: mockVersionId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            decisionType: OfferDecisionType.DECLINE,
            structuredReason: OfferDeclineReasonCategory.COMPENSATION_BELOW_TARGET,
            privateCandidateFeedback: "Family relocations and higher base offer elsewhere",
          }),
        },
      } as any;

      const decision = await recordOfferDecision(
        {
          offerId: mockOfferId,
          offerVersionId: mockVersionId,
          organizationId: mockOrgId,
          candidateId: mockCandidateId,
          actorUserId: mockUserId,
          decisionType: OfferDecisionType.DECLINE,
          structuredReason: OfferDeclineReasonCategory.COMPENSATION_BELOW_TARGET,
          privateCandidateFeedback: "Family relocations and higher base offer elsewhere",
        },
        mockTx
      );

      expect(decision.decisionType).toBe(OfferDecisionType.DECLINE);
      expect(decision.structuredReason).toBe(OfferDeclineReasonCategory.COMPENSATION_BELOW_TARGET);
      expect(decision.privateCandidateFeedback).toBe("Family relocations and higher base offer elsewhere");
    });
  });

  describe("6. Joining & Placement Separation", () => {
    it("creates a JoiningRecord with scheduled joining date and application linkage", async () => {
      const mockTx = {
        joiningRecord: {
          create: vi.fn().mockResolvedValue({
            id: mockJoiningId,
            offerId: mockOfferId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            applicationId: mockAppId,
            status: JoiningStatus.JOINING_PLANNED,
            scheduledStartDate: new Date("2026-11-01"),
          }),
        },
      } as any;

      const joining = await createJoiningRecord(
        {
          offerId: mockOfferId,
          organizationId: mockOrgId,
          candidateId: mockCandidateId,
          applicationId: mockAppId,
          scheduledStartDate: new Date("2026-11-01"),
        },
        mockTx
      );

      expect(joining.id).toBe(mockJoiningId);
      expect(joining.status).toBe(JoiningStatus.JOINING_PLANNED);
    });

    it("persists PlacementRecord with two-factor verification flags independently", async () => {
      const mockTx = {
        placementRecord: {
          create: vi.fn().mockResolvedValue({
            id: mockPlacementId,
            offerId: mockOfferId,
            joiningId: mockJoiningId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            applicationId: mockAppId,
            verifiedStartDate: new Date("2026-11-01"),
            verifiedById: mockUserId,
            firstDayConfirmed: true,
            onboardingProofValidated: false,
          }),
        },
      } as any;

      const placement = await createPlacementRecord(
        {
          offerId: mockOfferId,
          joiningId: mockJoiningId,
          organizationId: mockOrgId,
          candidateId: mockCandidateId,
          applicationId: mockAppId,
          verifiedStartDate: new Date("2026-11-01"),
          verifiedById: mockUserId,
          firstDayConfirmed: true,
          onboardingProofValidated: false,
        },
        mockTx
      );

      expect(placement.id).toBe(mockPlacementId);
      expect(placement.firstDayConfirmed).toBe(true);
      expect(placement.onboardingProofValidated).toBe(false);
    });

    it("updates PlacementRecord when onboarding proof is validated", async () => {
      const mockTx = {
        placementRecord: {
          findFirst: vi.fn().mockResolvedValue({ id: mockPlacementId, organizationId: mockOrgId }),
          update: vi.fn().mockResolvedValue({
            id: mockPlacementId,
            onboardingProofValidated: true,
            proofDocumentId: mockDocId,
          }),
        },
      } as any;

      const updated = await updatePlacementRecord(
        mockPlacementId,
        mockOrgId,
        {
          onboardingProofValidated: true,
          proofDocumentId: mockDocId,
        },
        mockTx
      );

      expect(updated.onboardingProofValidated).toBe(true);
      expect(updated.proofDocumentId).toBe(mockDocId);
    });
  });

  describe("7. Offer Evidence Attachment", () => {
    it("records offer evidence referencing CandidateDocument", async () => {
      const mockTx = {
        offerEvidence: {
          create: vi.fn().mockResolvedValue({
            id: "evidence-1",
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            offerId: mockOfferId,
            candidateDocumentId: mockDocId,
            documentType: "OFFER_LETTER",
            storagePath: "offers/evidence/offer-1.pdf",
            provenance: OfferProvenanceType.CANDIDATE_PROVIDED,
            uploadedById: mockUserId,
          }),
        },
      } as any;

      const evidence = await recordOfferEvidence(
        {
          organizationId: mockOrgId,
          candidateId: mockCandidateId,
          offerId: mockOfferId,
          candidateDocumentId: mockDocId,
          documentType: "OFFER_LETTER",
          storagePath: "offers/evidence/offer-1.pdf",
          uploadedById: mockUserId,
          provenance: OfferProvenanceType.CANDIDATE_PROVIDED,
        },
        mockTx
      );

      expect(evidence.id).toBe("evidence-1");
      expect(evidence.candidateDocumentId).toBe(mockDocId);
      expect(evidence.documentType).toBe("OFFER_LETTER");
    });
  });
});
