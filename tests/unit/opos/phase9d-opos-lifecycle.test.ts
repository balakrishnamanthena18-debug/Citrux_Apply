/**
 * Phase 9D — OPOS Lifecycle State Machine & Transition Tests
 * Tests valid/invalid transitions, central transition gateway, and terminal state safeguards.
 */

import { describe, it, expect, vi } from "vitest";
import {
  OfferStatus,
  JoiningStatus,
  AuditAction,
  Role,
} from "@/lib/opos/types";
import {
  ALLOWED_OFFER_TRANSITIONS,
  ALLOWED_JOINING_TRANSITIONS,
  TERMINAL_OFFER_STATUSES,
  isValidOfferTransition,
  assertValidOfferTransition,
  isTerminalOfferStatus,
  assertNonTerminalOffer,
  transitionOffer,
} from "@/lib/opos/lifecycle";
import { InvalidStateTransitionError, NotFoundError, AuthorizationError } from "@/lib/errors";

describe("Phase 9D — OPOS Lifecycle State Machine", () => {
  describe("1. State Transition Matrix Invariants", () => {
    it("permits valid Offer lifecycle forward transitions according to contract", () => {
      // OFFER_RECEIVED -> OFFER_UNDER_REVIEW, DECISION_PENDING, WITHDRAWN, EXPIRED
      expect(isValidOfferTransition(OfferStatus.OFFER_RECEIVED, OfferStatus.OFFER_UNDER_REVIEW)).toBe(true);
      expect(isValidOfferTransition(OfferStatus.OFFER_RECEIVED, OfferStatus.DECISION_PENDING)).toBe(true);
      expect(isValidOfferTransition(OfferStatus.OFFER_RECEIVED, OfferStatus.WITHDRAWN)).toBe(true);
      expect(isValidOfferTransition(OfferStatus.OFFER_RECEIVED, OfferStatus.EXPIRED)).toBe(true);

      // OFFER_UNDER_REVIEW -> NEGOTIATION, DECISION_PENDING, WITHDRAWN
      expect(isValidOfferTransition(OfferStatus.OFFER_UNDER_REVIEW, OfferStatus.NEGOTIATION)).toBe(true);
      expect(isValidOfferTransition(OfferStatus.OFFER_UNDER_REVIEW, OfferStatus.DECISION_PENDING)).toBe(true);

      // NEGOTIATION -> DECISION_PENDING, REPLACED, DECLINED, WITHDRAWN
      expect(isValidOfferTransition(OfferStatus.NEGOTIATION, OfferStatus.DECISION_PENDING)).toBe(true);
      expect(isValidOfferTransition(OfferStatus.NEGOTIATION, OfferStatus.REPLACED)).toBe(true);

      // DECISION_PENDING -> ACCEPTED, DECLINED, NEGOTIATION, EXPIRED
      expect(isValidOfferTransition(OfferStatus.DECISION_PENDING, OfferStatus.ACCEPTED)).toBe(true);
      expect(isValidOfferTransition(OfferStatus.DECISION_PENDING, OfferStatus.DECLINED)).toBe(true);
      expect(isValidOfferTransition(OfferStatus.DECISION_PENDING, OfferStatus.NEGOTIATION)).toBe(true);
      expect(isValidOfferTransition(OfferStatus.DECISION_PENDING, OfferStatus.EXPIRED)).toBe(true);
    });

    it("prohibits illegal skips, backward transitions, and terminal resurrection", () => {
      // Direct jump from OFFER_RECEIVED to ACCEPTED is prohibited
      expect(isValidOfferTransition(OfferStatus.OFFER_RECEIVED, OfferStatus.ACCEPTED)).toBe(false);

      // Terminal DECLINED cannot transition back to OFFER_RECEIVED, NEGOTIATION, or ACCEPTED
      expect(isValidOfferTransition(OfferStatus.DECLINED, OfferStatus.OFFER_RECEIVED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.DECLINED, OfferStatus.NEGOTIATION)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.DECLINED, OfferStatus.ACCEPTED)).toBe(false);

      // Terminal WITHDRAWN cannot transition to ACCEPTED or DECISION_PENDING
      expect(isValidOfferTransition(OfferStatus.WITHDRAWN, OfferStatus.ACCEPTED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.WITHDRAWN, OfferStatus.DECISION_PENDING)).toBe(false);

      // Terminal REPLACED cannot transition to ACCEPTED
      expect(isValidOfferTransition(OfferStatus.REPLACED, OfferStatus.ACCEPTED)).toBe(false);

      // EXPIRED cannot directly transition to ACCEPTED (must go through OFFER_UNDER_REVIEW on extension)
      expect(isValidOfferTransition(OfferStatus.EXPIRED, OfferStatus.ACCEPTED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.EXPIRED, OfferStatus.OFFER_UNDER_REVIEW)).toBe(true);

      // ACCEPTED cannot jump back to OFFER_RECEIVED or NEGOTIATION
      expect(isValidOfferTransition(OfferStatus.ACCEPTED, OfferStatus.OFFER_RECEIVED)).toBe(false);
      expect(isValidOfferTransition(OfferStatus.ACCEPTED, OfferStatus.NEGOTIATION)).toBe(false);
    });

    it("identifies terminal offer statuses correctly", () => {
      expect(isTerminalOfferStatus(OfferStatus.DECLINED)).toBe(true);
      expect(isTerminalOfferStatus(OfferStatus.WITHDRAWN)).toBe(true);
      expect(isTerminalOfferStatus(OfferStatus.REPLACED)).toBe(true);

      expect(isTerminalOfferStatus(OfferStatus.OFFER_RECEIVED)).toBe(false);
      expect(isTerminalOfferStatus(OfferStatus.OFFER_UNDER_REVIEW)).toBe(false);
      expect(isTerminalOfferStatus(OfferStatus.DECISION_PENDING)).toBe(false);
      expect(isTerminalOfferStatus(OfferStatus.ACCEPTED)).toBe(false);
    });

    it("assertNonTerminalOffer throws on terminal statuses", () => {
      expect(() => assertNonTerminalOffer(OfferStatus.DECLINED, "offer-1")).toThrow(InvalidStateTransitionError);
      expect(() => assertNonTerminalOffer(OfferStatus.WITHDRAWN, "offer-1")).toThrow(InvalidStateTransitionError);
      expect(() => assertNonTerminalOffer(OfferStatus.REPLACED, "offer-1")).toThrow(InvalidStateTransitionError);
      expect(() => assertNonTerminalOffer(OfferStatus.DECISION_PENDING, "offer-1")).not.toThrow();
    });
  });

  describe("2. Joining Status Matrix Invariants", () => {
    it("permits valid JoiningStatus transitions", () => {
      expect(ALLOWED_JOINING_TRANSITIONS[JoiningStatus.JOINING_PLANNED]).toContain(JoiningStatus.JOINING_CONFIRMED);
      expect(ALLOWED_JOINING_TRANSITIONS[JoiningStatus.JOINING_PLANNED]).toContain(JoiningStatus.FAILED_TO_JOIN);
      expect(ALLOWED_JOINING_TRANSITIONS[JoiningStatus.JOINING_CONFIRMED]).toContain(JoiningStatus.FAILED_TO_JOIN);
      expect(ALLOWED_JOINING_TRANSITIONS[JoiningStatus.FAILED_TO_JOIN]).toHaveLength(0);
    });

    it("prevents resurrection from terminal FAILED_TO_JOIN", () => {
      expect(ALLOWED_JOINING_TRANSITIONS[JoiningStatus.FAILED_TO_JOIN]).not.toContain(JoiningStatus.JOINING_CONFIRMED);
      expect(ALLOWED_JOINING_TRANSITIONS[JoiningStatus.FAILED_TO_JOIN]).not.toContain(JoiningStatus.JOINING_PLANNED);
    });
  });

  describe("3. Central Transition Gateway (transitionOffer)", () => {
    const mockOrgId = "11111111-1111-1111-1111-111111111111";
    const mockUserId = "22222222-2222-2222-2222-222222222222";
    const mockOfferId = "33333333-3333-3333-3333-333333333333";

    it("executes valid transition atomically and creates audit log", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: mockOfferId,
            organizationId: mockOrgId,
            candidateId: "cand-1",
            applicationId: "app-1",
            jobId: "job-1",
            status: OfferStatus.OFFER_RECEIVED,
            currentVersionNumber: 1,
            updatedAt: new Date(),
            candidate: { id: "cand-1", userId: mockUserId },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockOfferId,
            organizationId: mockOrgId,
            candidateId: "cand-1",
            applicationId: "app-1",
            status: OfferStatus.OFFER_UNDER_REVIEW,
            currentVersionNumber: 1,
            updatedAt: new Date(),
          }),
        },
        auditEvent: {
          create: vi.fn().mockResolvedValue({ id: "audit-1" }),
        },
      } as any;

      const ctx = {
        userId: mockUserId,
        organizationId: mockOrgId,
        role: Role.EMPLOYEE,
      } as any;

      const result = await transitionOffer(mockTx, ctx, {
        offerId: mockOfferId,
        toStatus: OfferStatus.OFFER_UNDER_REVIEW,
        reason: "Review started",
      });

      expect(result.transitioned).toBe(true);
      expect(result.previousStatus).toBe(OfferStatus.OFFER_RECEIVED);
      expect(result.offer.status).toBe(OfferStatus.OFFER_UNDER_REVIEW);
      expect(mockTx.auditEvent.create).toHaveBeenCalled();
    });

    it("handles idempotent re-transition cleanly without re-auditing", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: mockOfferId,
            organizationId: mockOrgId,
            candidateId: "cand-1",
            applicationId: "app-1",
            status: OfferStatus.OFFER_UNDER_REVIEW,
            currentVersionNumber: 1,
            candidate: { id: "cand-1", userId: mockUserId },
          }),
          update: vi.fn(),
        },
        auditEvent: {
          create: vi.fn(),
        },
      } as any;

      const ctx = {
        userId: mockUserId,
        organizationId: mockOrgId,
        role: Role.EMPLOYEE,
      } as any;

      const result = await transitionOffer(mockTx, ctx, {
        offerId: mockOfferId,
        toStatus: OfferStatus.OFFER_UNDER_REVIEW,
      });

      expect(result.transitioned).toBe(false);
      expect(result.previousStatus).toBe(OfferStatus.OFFER_UNDER_REVIEW);
      expect(mockTx.offer.update).not.toHaveBeenCalled();
      expect(mockTx.auditEvent.create).not.toHaveBeenCalled();
    });

    it("rejects illegal transitions with InvalidStateTransitionError", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: mockOfferId,
            organizationId: mockOrgId,
            candidateId: "cand-1",
            applicationId: "app-1",
            status: OfferStatus.OFFER_RECEIVED,
            candidate: { id: "cand-1", userId: mockUserId },
          }),
        },
      } as any;

      const ctx = {
        userId: mockUserId,
        organizationId: mockOrgId,
        role: Role.EMPLOYEE,
      } as any;

      await expect(
        transitionOffer(mockTx, ctx, {
          offerId: mockOfferId,
          toStatus: OfferStatus.ACCEPTED,
        })
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it("throws NotFoundError if offer does not exist in tenant", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const ctx = {
        userId: mockUserId,
        organizationId: mockOrgId,
        role: Role.EMPLOYEE,
      } as any;

      await expect(
        transitionOffer(mockTx, ctx, {
          offerId: "unknown-offer",
          toStatus: OfferStatus.OFFER_UNDER_REVIEW,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
