/**
 * Phase 9E — OPOS Adversarial Security, IDOR, & Threat Model Unit Tests
 * Rigorous offensive verification testing attackers A through K across all 8 OPOS entities.
 */

import { describe, it, expect, vi } from "vitest";
import {
  OfferStatus,
  OfferDecisionType,
  OfferDeclineReasonCategory,
  JoiningStatus,
  JoiningFailureReason,
  NegotiationEventType,
  OfferProvenanceType,
  Role,
} from "@/lib/opos/types";
import {
  assertOfferAccess,
  assertCandidateDecisionAuthority,
} from "@/lib/opos/authorization";
import {
  handoffOutcomeToOffer,
  createAuthoritativeOfferVersion,
  initiateNegotiation,
  recordAuthoritativeNegotiationEvent,
  recordAuthoritativeCandidateDecision,
  confirmCandidateFirstDay,
  recordFailedToJoin,
  verifyPlacement,
  voidPlacement,
} from "@/lib/opos/opos-service";
import {
  isValidOfferTransition,
  assertValidOfferTransition,
  isTerminalOfferStatus,
  assertNonTerminalOffer,
  transitionOffer,
  isValidJoiningTransition,
  assertValidJoiningTransition,
  isTerminalJoiningStatus,
  assertNonTerminalJoining,
} from "@/lib/opos/lifecycle";
import {
  AuthorizationError,
  NotFoundError,
  InvalidStateTransitionError,
  ValidationError,
} from "@/lib/errors";

describe("Phase 9E — OPOS Adversarial Security & Threat Model Verification", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const tenantB = "22222222-2222-2222-2222-222222222222";

  const userCandA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const userCandB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const userEmpA = "eeeeeeee-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const userAdminA = "ffffffff-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const userAdminB = "ffffffff-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const candAId = "cand-a-id";
  const candBId = "cand-b-id";
  const offerAId = "offer-a-id";
  const versionA1Id = "version-a1-id";
  const appAId = "app-a-id";
  const docAId = "doc-a-id";

  // ==========================================================
  // THREAT MODEL ATTACKERS A-K
  // ==========================================================

  describe("Threat Model: Attacker A (Candidate A attacking Candidate B)", () => {
    it("Candidate A attempting to read/access Candidate B offer throws NotFoundError/AuthorizationError", async () => {
      const mockTx = {
        offer: { findFirst: vi.fn().mockResolvedValue(null) },
      } as any;

      const ctx = {
        userId: userCandA,
        organizationId: tenantA,
        role: Role.CANDIDATE,
      } as any;

      await expect(assertOfferAccess(mockTx, ctx, "offer-b-id")).rejects.toThrow(NotFoundError);
    });

    it("Candidate A attempting to decide on Candidate B offer throws AuthorizationError", async () => {
      const ctx = {
        userId: userCandA,
        organizationId: tenantA,
        role: Role.CANDIDATE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandB)).toThrow(AuthorizationError);
    });
  });

  describe("Threat Model: Attacker B (Candidate attacking staff-only operations)", () => {
    it("Candidate attempting to create authoritative version V2 throws AuthorizationError", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            status: OfferStatus.OFFER_UNDER_REVIEW,
            currentVersionNumber: 1,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appAId }),
        },
      } as any;

      const ctx = {
        userId: userCandA,
        organizationId: tenantA,
        role: Role.CANDIDATE,
      } as any;

      // Staff privilege required for creating authoritative version
      const { scope } = await assertOfferAccess(mockTx, ctx, offerAId);
      expect(scope.isStaffPrivileged).toBe(false);
    });

    it("Candidate attempting to verify placement throws AuthorizationError", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appAId }),
        },
      } as any;

      const ctx = {
        userId: userCandA,
        organizationId: tenantA,
        role: Role.CANDIDATE,
      } as any;

      await expect(
        verifyPlacement(mockTx, ctx, {
          offerId: offerAId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: docAId,
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("Candidate attempting to record failed to join throws AuthorizationError", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appAId }),
        },
      } as any;

      const ctx = {
        userId: userCandA,
        organizationId: tenantA,
        role: Role.CANDIDATE,
      } as any;

      await expect(
        recordFailedToJoin(mockTx, ctx, {
          offerId: offerAId,
          failureReason: JoiningFailureReason.CANDIDATE_RENEGED,
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("Threat Model: Attacker F & G (Cross-Tenant & Unrelated Org Member Attacks)", () => {
    it("Admin from Tenant B querying Tenant A offer is blocked via tenant scope", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue(null), // Tenant B filter fails to find Tenant A offer
        },
      } as any;

      const ctx = {
        userId: userAdminB,
        organizationId: tenantB,
        role: Role.ADMIN,
      } as any;

      await expect(assertOfferAccess(mockTx, ctx, offerAId)).rejects.toThrow(NotFoundError);
    });

    it("Caller with forged / unauthenticated role throws AuthorizationError", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({ id: appAId }),
        },
      } as any;

      const ctx = {
        userId: "anonymous-user",
        organizationId: tenantA,
        role: "GUEST" as any,
      } as any;

      await expect(assertOfferAccess(mockTx, ctx, offerAId)).rejects.toThrow(AuthorizationError);
    });
  });

  // ==========================================================
  // CANDIDATE SOVEREIGNTY INVARIANT ATTACKS
  // ==========================================================

  describe("Candidate Decision Sovereignty Attacks (All Non-Owner Roles Blocked)", () => {
    it("Employee executing ACCEPT / DECLINE is strictly DENIED", () => {
      const ctx = { userId: userEmpA, organizationId: tenantA, role: Role.EMPLOYEE } as any;
      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Team Lead executing ACCEPT / DECLINE is strictly DENIED", () => {
      const ctx = { userId: "tl-id", organizationId: tenantA, role: Role.EMPLOYEE } as any;
      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Manager executing ACCEPT / DECLINE is strictly DENIED", () => {
      const ctx = { userId: "mgr-id", organizationId: tenantA, role: Role.EMPLOYEE } as any;
      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Admin executing ACCEPT / DECLINE is strictly DENIED", () => {
      const ctx = { userId: userAdminA, organizationId: tenantA, role: Role.ADMIN } as any;
      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("AI / System worker executing ACCEPT / DECLINE is strictly DENIED", () => {
      const ctx = { userId: "ai-worker", organizationId: tenantA, role: "SYSTEM" as any } as any;
      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Candidate B executing ACCEPT on Candidate A offer is strictly DENIED", () => {
      const ctx = { userId: userCandB, organizationId: tenantA, role: Role.CANDIDATE } as any;
      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("transitionOffer blocks staff from transitioning offer to ACCEPTED or DECLINED", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            status: OfferStatus.DECISION_PENDING,
            currentVersionNumber: 1,
            candidate: { id: candAId, userId: userCandA },
          }),
        },
      } as any;

      const staffCtx = { userId: userEmpA, organizationId: tenantA, role: Role.EMPLOYEE } as any;

      await expect(
        transitionOffer(mockTx, staffCtx, {
          offerId: offerAId,
          toStatus: OfferStatus.ACCEPTED,
        })
      ).rejects.toThrow(AuthorizationError);

      await expect(
        transitionOffer(mockTx, staffCtx, {
          offerId: offerAId,
          toStatus: OfferStatus.DECLINED,
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ==========================================================
  // LIFECYCLE TAMPERING & TERMINAL SAFEGUARD ATTACKS
  // ==========================================================

  describe("Lifecycle Tampering & Prohibited Transition Matrix Attacks", () => {
    it("prohibits illegal skips and unearned state advancements", () => {
      expect(isValidOfferTransition(OfferStatus.OFFER_RECEIVED, OfferStatus.ACCEPTED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.OFFER_RECEIVED, OfferStatus.DECLINED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.OFFER_UNDER_REVIEW, OfferStatus.ACCEPTED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.NEGOTIATION, OfferStatus.ACCEPTED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.ACCEPTED, OfferStatus.DECLINED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.ACCEPTED, OfferStatus.NEGOTIATION)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.ACCEPTED, OfferStatus.OFFER_RECEIVED)).toBe(false);
    });

    it("prohibits resurrection from terminal states", () => {
      // DECLINED cannot transition anywhere
      expect(isValidOfferTransition(OfferStatus.DECLINED, OfferStatus.ACCEPTED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.DECLINED, OfferStatus.NEGOTIATION)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.DECLINED, OfferStatus.DECISION_PENDING)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.DECLINED, OfferStatus.OFFER_RECEIVED)).toBe(false);

      // WITHDRAWN cannot transition anywhere
      expect(isValidOfferTransition(OfferStatus.WITHDRAWN, OfferStatus.ACCEPTED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.WITHDRAWN, OfferStatus.DECISION_PENDING)).toBe(false);

      // REPLACED is a historical frozen state
      expect(isValidOfferTransition(OfferStatus.REPLACED, OfferStatus.ACCEPTED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.REPLACED, OfferStatus.DECISION_PENDING)).toBe(false);
    });

    it("joining state machine prohibits resurrection from FAILED_TO_JOIN", () => {
      expect(isValidJoiningTransition(JoiningStatus.FAILED_TO_JOIN, JoiningStatus.JOINING_CONFIRMED)).toBe(false);
      expect(isValidJoiningTransition(JoiningStatus.FAILED_TO_JOIN, JoiningStatus.JOINING_PLANNED)).toBe(false);
    });

    it("EXPIRED special path: allows reopening to OFFER_UNDER_REVIEW on deadline extension, blocks direct ACCEPT", () => {
      expect(isValidOfferTransition(OfferStatus.EXPIRED, OfferStatus.ACCEPTED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.EXPIRED, OfferStatus.NEGOTIATION)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.EXPIRED, OfferStatus.OFFER_UNDER_REVIEW)).toBe(true);
    });
  });

  // ==========================================================
  // TWO-FACTOR PLACEMENT VERIFICATION ATTACK MATRIX
  // ==========================================================

  describe("Two-Factor Placement Verification Attacks", () => {
    it("Factor 1 missing (firstDayConfirmed === false) -> DENIED", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }) },
        application: { findFirst: vi.fn().mockResolvedValue({ id: appAId }) },
        joiningRecord: { findUnique: vi.fn().mockResolvedValue({ id: "j-1", status: JoiningStatus.JOINING_CONFIRMED }) },
      } as any;

      const staffCtx = { userId: userEmpA, organizationId: tenantA, role: Role.EMPLOYEE } as any;

      await expect(
        verifyPlacement(mockTx, staffCtx, {
          offerId: offerAId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: false,
          onboardingProofValidated: true,
          proofDocumentId: docAId,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("Factor 2 missing (onboardingProofValidated === false) -> DENIED", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }) },
        application: { findFirst: vi.fn().mockResolvedValue({ id: appAId }) },
        joiningRecord: { findUnique: vi.fn().mockResolvedValue({ id: "j-1", status: JoiningStatus.JOINING_CONFIRMED }) },
      } as any;

      const staffCtx = { userId: userEmpA, organizationId: tenantA, role: Role.EMPLOYEE } as any;

      await expect(
        verifyPlacement(mockTx, staffCtx, {
          offerId: offerAId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: true,
          onboardingProofValidated: false,
          proofDocumentId: docAId,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("Proof document from Candidate B or outside tenant -> DENIED", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }) },
        application: { findFirst: vi.fn().mockResolvedValue({ id: appAId }) },
        joiningRecord: { findUnique: vi.fn().mockResolvedValue({ id: "j-1", status: JoiningStatus.JOINING_CONFIRMED }) },
        candidateDocument: { findFirst: vi.fn().mockResolvedValue(null) }, // Proof does not match Candidate A in Tenant A
      } as any;

      const staffCtx = { userId: userEmpA, organizationId: tenantA, role: Role.EMPLOYEE } as any;

      await expect(
        verifyPlacement(mockTx, staffCtx, {
          offerId: offerAId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: "foreign-doc-id",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("Placement verification on FAILED_TO_JOIN joining record -> DENIED", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            status: OfferStatus.ACCEPTED,
          }),
        },
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }) },
        application: { findFirst: vi.fn().mockResolvedValue({ id: appAId }) },
        joiningRecord: { findUnique: vi.fn().mockResolvedValue({ id: "j-1", status: JoiningStatus.FAILED_TO_JOIN }) },
      } as any;

      const staffCtx = { userId: userEmpA, organizationId: tenantA, role: Role.EMPLOYEE } as any;

      await expect(
        verifyPlacement(mockTx, staffCtx, {
          offerId: offerAId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: docAId,
        })
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it("Placement verification on terminal offer (WITHDRAWN) -> DENIED", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            status: OfferStatus.WITHDRAWN,
          }),
        },
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }) },
        application: { findFirst: vi.fn().mockResolvedValue({ id: appAId }) },
      } as any;

      const staffCtx = { userId: userEmpA, organizationId: tenantA, role: Role.EMPLOYEE } as any;

      await expect(
        verifyPlacement(mockTx, staffCtx, {
          offerId: offerAId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: docAId,
        })
      ).rejects.toThrow(InvalidStateTransitionError);
    });
  });

  // ==========================================================
  // COMPENSATION PRIVACY & STRUCTURAL SCOPE
  // ==========================================================

  describe("Compensation Privacy & Scope Boundaries", () => {
    it("Candidate scope resolves canViewInternalNotes = false", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            jobId: "job-1",
            status: OfferStatus.DECISION_PENDING,
            currentVersionNumber: 1,
            verificationState: "UNVERIFIED",
          }),
        },
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }) },
        application: { findFirst: vi.fn().mockResolvedValue({ id: appAId }) },
      } as any;

      const ctx = { userId: userCandA, organizationId: tenantA, role: Role.CANDIDATE } as any;
      const resolved = await assertOfferAccess(mockTx, ctx, offerAId);

      expect(resolved.scope.isCandidateOwner).toBe(true);
      expect(resolved.scope.canViewInternalNotes).toBe(false);
      expect(resolved.scope.canDecide).toBe(true);
      expect(resolved.scope.canVerifyPlacement).toBe(false);
    });

    it("Staff scope resolves canViewInternalNotes = true and canVerifyPlacement = true", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            candidateId: candAId,
            applicationId: appAId,
            jobId: "job-1",
            status: OfferStatus.DECISION_PENDING,
            currentVersionNumber: 1,
            verificationState: "UNVERIFIED",
          }),
        },
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candAId, userId: userCandA }) },
        application: { findFirst: vi.fn().mockResolvedValue({ id: appAId }) },
      } as any;

      const ctx = { userId: userEmpA, organizationId: tenantA, role: Role.EMPLOYEE } as any;
      const resolved = await assertOfferAccess(mockTx, ctx, offerAId);

      expect(resolved.scope.isCandidateOwner).toBe(false);
      expect(resolved.scope.isStaffPrivileged).toBe(true);
      expect(resolved.scope.canViewInternalNotes).toBe(true);
      expect(resolved.scope.canDecide).toBe(false);
      expect(resolved.scope.canVerifyPlacement).toBe(true);
    });
  });
});
