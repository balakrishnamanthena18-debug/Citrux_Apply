/**
 * Phase 9D — OPOS Concurrency, Idempotency & Two-Factor Placement Unit Tests
 * Tests simultaneous decisions, duplicate version prevention, two-factor proof rules, and idempotent handoffs.
 */

import { describe, it, expect, vi } from "vitest";
import {
  OfferStatus,
  OfferDecisionType,
  JoiningStatus,
  AuditAction,
  Role,
} from "@/lib/opos/types";
import {
  handoffOutcomeToOffer,
  createAuthoritativeOfferVersion,
  recordAuthoritativeCandidateDecision,
  verifyPlacement,
  confirmCandidateFirstDay,
  recordFailedToJoin,
} from "@/lib/opos/opos-service";
import { InvalidStateTransitionError, ValidationError } from "@/lib/errors";

describe("Phase 9D — OPOS Concurrency, Idempotency & Two-Factor Verification", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const userCand = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const userEmp = "eeeeeeee-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const candId = "cand-1-id";
  const appId = "app-1-id";
  const offerId = "offer-1-id";
  const version1Id = "version-1-id";
  const joiningId = "joining-1-id";

  describe("1. Outcome Ledger Handoff Idempotency", () => {
    it("returns existing active offer if handoff is replayed for same application", async () => {
      const mockTx = {
        application: {
          findFirst: vi.fn().mockResolvedValue({
            id: appId,
            organizationId: tenantId,
            candidateId: candId,
            jobId: "job-1",
            candidate: { id: candId, userId: userCand },
          }),
        },
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            applicationId: appId,
            organizationId: tenantId,
            status: OfferStatus.OFFER_RECEIVED,
            currentVersionNumber: 1,
            versions: [{ id: version1Id, versionNumber: 1, baseSalaryAmount: 180000 }],
          }),
        },
      } as any;

      const ctx = {
        userId: userEmp,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      const result = await handoffOutcomeToOffer(mockTx, ctx, {
        applicationId: appId,
      });

      expect(result.created).toBe(false);
      expect(result.offer.id).toBe(offerId);
      expect(result.version.id).toBe(version1Id);
    });
  });

  describe("2. Version Advancement & Monotonic Increment", () => {
    it("advances version number monotonically and supersedes previous version", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            applicationId: appId,
            candidateId: candId,
            status: OfferStatus.OFFER_UNDER_REVIEW,
            currentVersionNumber: 1,
          }),
          update: vi.fn().mockResolvedValue({
            id: offerId,
            currentVersionNumber: 2,
            status: OfferStatus.OFFER_UNDER_REVIEW,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
        offerVersion: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: vi.fn().mockResolvedValue({
            id: "version-2-id",
            offerId,
            organizationId: tenantId,
            versionNumber: 2,
            baseSalaryAmount: 200000,
          }),
        },
        auditEvent: {
          create: vi.fn().mockResolvedValue({ id: "audit-1" }),
        },
      } as any;

      const ctx = {
        userId: userEmp,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      const result = await createAuthoritativeOfferVersion(mockTx, ctx, {
        offerId,
        terms: {
          baseSalaryAmount: 200000,
          roleTitle: "Staff Engineer",
        },
      });

      expect(result.version.versionNumber).toBe(2);
      expect(mockTx.offerVersion.updateMany).toHaveBeenCalledWith({
        where: {
          offerId,
          organizationId: tenantId,
          supersededAt: null,
        },
        data: {
          supersededAt: expect.any(Date),
        },
      });
      expect(mockTx.offer.update).toHaveBeenCalledWith({
        where: { id: offerId },
        data: expect.objectContaining({
          currentVersionNumber: 2,
        }),
      });
    });
  });

  describe("3. Stale Version Decision Protection", () => {
    it("rejects candidate decision on stale offer version", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            candidateId: candId,
            applicationId: appId,
            status: OfferStatus.DECISION_PENDING,
            currentVersionNumber: 2, // Active is V2
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
        offerVersion: {
          findFirst: vi.fn().mockResolvedValue({
            id: version1Id,
            offerId,
            organizationId: tenantId,
            versionNumber: 1, // Candidate attempting to accept V1
          }),
        },
        offerDecision: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const ctx = {
        userId: userCand,
        organizationId: tenantId,
        role: Role.CANDIDATE,
      } as any;

      await expect(
        recordAuthoritativeCandidateDecision(mockTx, ctx, {
          offerId,
          offerVersionId: version1Id,
          decisionType: OfferDecisionType.ACCEPT,
        })
      ).rejects.toThrow(InvalidStateTransitionError);
    });
  });

  describe("4. Candidate Decision Idempotency", () => {
    it("returns existing decision on repeated accept without duplicate transition", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            candidateId: candId,
            applicationId: appId,
            status: OfferStatus.ACCEPTED,
            currentVersionNumber: 1,
          }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: offerId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
        offerVersion: {
          findFirst: vi.fn().mockResolvedValue({
            id: version1Id,
            offerId,
            organizationId: tenantId,
            versionNumber: 1,
          }),
        },
        offerDecision: {
          findFirst: vi.fn().mockResolvedValue({
            id: "decision-1",
            offerId,
            offerVersionId: version1Id,
            decisionType: OfferDecisionType.ACCEPT,
          }),
        },
        joiningRecord: {
          findUnique: vi.fn().mockResolvedValue({
            id: joiningId,
            offerId,
            status: JoiningStatus.JOINING_PLANNED,
          }),
        },
      } as any;

      const ctx = {
        userId: userCand,
        organizationId: tenantId,
        role: Role.CANDIDATE,
      } as any;

      const result = await recordAuthoritativeCandidateDecision(mockTx, ctx, {
        offerId,
        offerVersionId: version1Id,
        decisionType: OfferDecisionType.ACCEPT,
      });

      expect(result.decision.id).toBe("decision-1");
      expect(result.offer.status).toBe(OfferStatus.ACCEPTED);
    });
  });

  describe("5. Two-Factor Placement Verification Logic", () => {
    it("rejects placement verification if factor 1 (firstDayConfirmed) is false", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            candidateId: candId,
            applicationId: appId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
        joiningRecord: {
          findUnique: vi.fn().mockResolvedValue({
            id: joiningId,
            offerId,
            status: JoiningStatus.JOINING_PLANNED,
          }),
        },
      } as any;

      const ctx = {
        userId: userEmp,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      await expect(
        verifyPlacement(mockTx, ctx, {
          offerId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: false, // Factor 1 missing
          onboardingProofValidated: true,
          proofDocumentId: "doc-1",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects placement verification if factor 2 (onboardingProofValidated) is false", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            candidateId: candId,
            applicationId: appId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
        joiningRecord: {
          findUnique: vi.fn().mockResolvedValue({
            id: joiningId,
            offerId,
            status: JoiningStatus.JOINING_CONFIRMED,
          }),
        },
      } as any;

      const ctx = {
        userId: userEmp,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      await expect(
        verifyPlacement(mockTx, ctx, {
          offerId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: true,
          onboardingProofValidated: false, // Factor 2 missing
          proofDocumentId: "doc-1",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects placement verification if proof document attachment is missing", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            candidateId: candId,
            applicationId: appId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
        joiningRecord: {
          findUnique: vi.fn().mockResolvedValue({
            id: joiningId,
            offerId,
            status: JoiningStatus.JOINING_CONFIRMED,
          }),
        },
      } as any;

      const ctx = {
        userId: userEmp,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      await expect(
        verifyPlacement(mockTx, ctx, {
          offerId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: null, // Proof missing
          proofStoragePath: null,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("successfully executes placement verification when both factors and proof are present", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            candidateId: candId,
            applicationId: appId,
            status: OfferStatus.ACCEPTED,
          }),
          update: vi.fn().mockResolvedValue({
            id: offerId,
            verificationState: "VERIFIED",
            verifiedAt: new Date(),
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
        joiningRecord: {
          findUnique: vi.fn().mockResolvedValue({
            id: joiningId,
            offerId,
            status: JoiningStatus.JOINING_CONFIRMED,
          }),
        },
        placementRecord: {
          upsert: vi.fn().mockResolvedValue({
            id: "placement-1",
            offerId,
            joiningId,
            firstDayConfirmed: true,
            onboardingProofValidated: true,
            proofDocumentId: "doc-1",
          }),
        },
        candidateDocument: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc-1",
            candidateId: candId,
          }),
        },
        auditEvent: {
          create: vi.fn().mockResolvedValue({ id: "audit-1" }),
        },
      } as any;

      const ctx = {
        userId: userEmp,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      const result = await verifyPlacement(mockTx, ctx, {
        offerId,
        verifiedStartDate: new Date(),
        firstDayConfirmed: true,
        onboardingProofValidated: true,
        proofDocumentId: "doc-1",
      });

      expect(result.placement.firstDayConfirmed).toBe(true);
      expect(result.placement.onboardingProofValidated).toBe(true);
      expect(mockTx.auditEvent.create).toHaveBeenCalled();
    });

    it("rejects placement verification if proof document belongs to different candidate", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            candidateId: candId,
            applicationId: appId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
        joiningRecord: {
          findUnique: vi.fn().mockResolvedValue({
            id: joiningId,
            offerId,
            status: JoiningStatus.JOINING_CONFIRMED,
          }),
        },
        candidateDocument: {
          findFirst: vi.fn().mockResolvedValue(null), // Wrong candidate or cross-tenant document
        },
      } as any;

      const ctx = {
        userId: userEmp,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      await expect(
        verifyPlacement(mockTx, ctx, {
          offerId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: "foreign-doc-id",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects placement verification on terminal offer", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            candidateId: candId,
            applicationId: appId,
            status: OfferStatus.WITHDRAWN, // Terminal
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
      } as any;

      const ctx = {
        userId: userEmp,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      await expect(
        verifyPlacement(mockTx, ctx, {
          offerId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: "doc-1",
        })
      ).rejects.toThrow(InvalidStateTransitionError);
    });
  });

  describe("6. Decision Concurrency & Conflict Protection", () => {
    it("candidate DECLINE x 2 returns existing decision without re-transition", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            candidateId: candId,
            applicationId: appId,
            status: OfferStatus.DECLINED,
            currentVersionNumber: 1,
          }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: offerId,
            status: OfferStatus.DECLINED,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
        offerVersion: {
          findFirst: vi.fn().mockResolvedValue({
            id: version1Id,
            offerId,
            organizationId: tenantId,
            versionNumber: 1,
          }),
        },
        offerDecision: {
          findFirst: vi.fn().mockResolvedValue({
            id: "decision-decline-1",
            offerId,
            offerVersionId: version1Id,
            decisionType: OfferDecisionType.DECLINE,
          }),
        },
        joiningRecord: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const ctx = {
        userId: userCand,
        organizationId: tenantId,
        role: Role.CANDIDATE,
      } as any;

      const result = await recordAuthoritativeCandidateDecision(mockTx, ctx, {
        offerId,
        offerVersionId: version1Id,
        decisionType: OfferDecisionType.DECLINE,
      });

      expect(result.decision.id).toBe("decision-decline-1");
      expect(result.offer.status).toBe(OfferStatus.DECLINED);
    });

    it("rejects attempt to ACCEPT after offer has already been DECLINED (terminal conflict)", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerId,
            organizationId: tenantId,
            candidateId: candId,
            applicationId: appId,
            status: OfferStatus.DECLINED, // Already declined
            currentVersionNumber: 1,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candId, userId: userCand }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appId }),
        },
        offerVersion: {
          findFirst: vi.fn().mockResolvedValue({
            id: version1Id,
            offerId,
            organizationId: tenantId,
            versionNumber: 1,
          }),
        },
        offerDecision: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const ctx = {
        userId: userCand,
        organizationId: tenantId,
        role: Role.CANDIDATE,
      } as any;

      await expect(
        recordAuthoritativeCandidateDecision(mockTx, ctx, {
          offerId,
          offerVersionId: version1Id,
          decisionType: OfferDecisionType.ACCEPT,
        })
      ).rejects.toThrow(InvalidStateTransitionError);
    });
  });
});
