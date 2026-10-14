/**
 * Phase 9C — OPOS Security, Multi-Tenant Isolation & Compensation Privacy Tests
 * Verifies tenant isolation, direct-ID guessing resistance, field-level privacy masking,
 * and audit action taxonomy.
 */

import { describe, it, expect, vi } from "vitest";
import {
  AuditAction,
  OfferStatus,
  OfferVerificationState,
  OfferProvenanceType,
  OfferDecisionType,
} from "@/generated/prisma";
import {
  sanitizeOfferForCandidate,
  sanitizeOfferDecisionForStaff,
} from "@/lib/opos/types";
import {
  getOfferById,
  getOfferVersionById,
  getNegotiationByOfferId,
  getJoiningRecordByOfferId,
  getPlacementRecordByOfferId,
  updateOffer,
  updateNegotiation,
  updateJoiningRecord,
  updatePlacementRecord,
} from "@/lib/opos/opos-repository";
import { NotFoundError } from "@/lib/errors";

describe("Phase 9C: OPOS Security, Isolation & Privacy Matrix", () => {
  const mockTenantA = "11111111-1111-1111-1111-111111111111";
  const mockTenantB = "22222222-2222-2222-2222-222222222222";
  const mockOfferId = "33333333-3333-3333-3333-333333333333";
  const mockVersionId = "44444444-4444-4444-4444-444444444444";
  const mockNegotiationId = "55555555-5555-5555-5555-555555555555";
  const mockJoiningId = "66666666-6666-6666-6666-666666666666";
  const mockPlacementId = "77777777-7777-7777-7777-777777777777";

  describe("1. Multi-Tenant Isolation & Direct-ID Denial", () => {
    it("denies access when querying Offer with Tenant B context for Tenant A record", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockImplementation(({ where }) => {
            if (where.id === mockOfferId && where.organizationId === mockTenantA) {
              return Promise.resolve({ id: mockOfferId, organizationId: mockTenantA });
            }
            return Promise.resolve(null);
          }),
        },
      } as any;

      // Access from Tenant A -> OK
      const resultTenantA = await getOfferById(mockOfferId, mockTenantA, mockTx);
      expect(resultTenantA).not.toBeNull();
      expect(resultTenantA?.id).toBe(mockOfferId);

      // Access from Tenant B -> Denied / Null
      const resultTenantB = await getOfferById(mockOfferId, mockTenantB, mockTx);
      expect(resultTenantB).toBeNull();
    });

    it("denies access when querying OfferVersion with cross-tenant context", async () => {
      const mockTx = {
        offerVersion: {
          findFirst: vi.fn().mockImplementation(({ where }) => {
            if (where.id === mockVersionId && where.organizationId === mockTenantA) {
              return Promise.resolve({ id: mockVersionId, organizationId: mockTenantA });
            }
            return Promise.resolve(null);
          }),
        },
      } as any;

      const resultTenantB = await getOfferVersionById(mockVersionId, mockTenantB, mockTx);
      expect(resultTenantB).toBeNull();
    });

    it("denies update on Offer for non-matching organization", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      await expect(
        updateOffer(mockOfferId, mockTenantB, { status: OfferStatus.ACCEPTED }, mockTx)
      ).rejects.toThrow(NotFoundError);
    });

    it("denies update on Negotiation for non-matching organization", async () => {
      const mockTx = {
        negotiation: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      await expect(
        updateNegotiation(mockNegotiationId, mockTenantB, { candidateTargetBase: 250000 }, mockTx)
      ).rejects.toThrow(NotFoundError);
    });

    it("denies update on JoiningRecord for non-matching organization", async () => {
      const mockTx = {
        joiningRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      await expect(
        updateJoiningRecord(mockJoiningId, mockTenantB, { actualStartDate: new Date() }, mockTx)
      ).rejects.toThrow(NotFoundError);
    });

    it("denies update on PlacementRecord for non-matching organization", async () => {
      const mockTx = {
        placementRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      await expect(
        updatePlacementRecord(mockPlacementId, mockTenantB, { onboardingProofValidated: true }, mockTx)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("2. Field-Level Compensation & Feedback Privacy", () => {
    it("redacts internal staff notes when sanitized for candidate presentation", () => {
      const rawOffer = {
        id: mockOfferId,
        organizationId: mockTenantA,
        status: OfferStatus.OFFER_RECEIVED,
        internalStaffNotes: "CONFIDENTIAL: Target compensation was $200k, employer offered $180k. We can push for $195k.",
        candidateNotes: "Candidate shared verbal offer details from phone call.",
      };

      const sanitized = sanitizeOfferForCandidate(rawOffer as any);

      expect(sanitized.internalStaffNotes).toBeNull();
      expect(sanitized.candidateNotes).toBe("Candidate shared verbal offer details from phone call.");
    });

    it("redacts private candidate feedback when sanitized for staff / portal display", () => {
      const rawDecision = {
        id: "dec-1",
        offerId: mockOfferId,
        offerVersionId: mockVersionId,
        organizationId: mockTenantA,
        candidateId: "cand-1",
        decisionType: OfferDecisionType.DECLINE,
        privateCandidateFeedback: "Candidate found the hiring manager toxic during final onsite.",
      };

      const sanitized = sanitizeOfferDecisionForStaff(rawDecision as any);

      expect(sanitized.privateCandidateFeedback).toBeNull();
      expect(sanitized.decisionType).toBe(OfferDecisionType.DECLINE);
    });
  });

  describe("3. Audit Action Taxonomy Invariants", () => {
    it("verifies all 14 OPOS AuditAction types are registered in Prisma schema", () => {
      const expectedAuditActions = [
        "OPOS_OFFER_CREATED",
        "OPOS_OFFER_UPDATED",
        "OPOS_OFFER_VERIFIED",
        "OPOS_OFFER_VERSION_CREATED",
        "OPOS_DEADLINE_EXTENDED",
        "OPOS_NEGOTIATION_INITIATED",
        "OPOS_NEGOTIATION_EVENT_RECORDED",
        "OPOS_OFFER_ACCEPTED",
        "OPOS_OFFER_DECLINED",
        "OPOS_JOINING_SCHEDULED",
        "OPOS_JOINING_UPDATED",
        "OPOS_PLACEMENT_VERIFIED",
        "OPOS_PLACEMENT_VOIDED",
        "OPOS_EVIDENCE_ATTACHED",
      ];

      for (const actionName of expectedAuditActions) {
        expect(AuditAction[actionName as keyof typeof AuditAction]).toBe(actionName);
      }
    });
  });
});
