/**
 * Phase 9D — OPOS Authorization & Candidate Sovereignty Unit Tests
 * Tests structural scope validation, candidate decision anti-impersonation, and cross-tenant rejections.
 */

import { describe, it, expect, vi } from "vitest";
import {
  OfferStatus,
  OfferDecisionType,
  Role,
} from "@/lib/opos/types";
import {
  assertOfferAccess,
  assertCandidateDecisionAuthority,
} from "@/lib/opos/authorization";
import {
  recordAuthoritativeCandidateDecision,
  verifyPlacement,
} from "@/lib/opos/opos-service";
import { AuthorizationError, NotFoundError, InvalidStateTransitionError, ValidationError } from "@/lib/errors";

describe("Phase 9D — OPOS Authorization & Candidate Sovereignty", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const tenantB = "22222222-2222-2222-2222-222222222222";

  const userCandA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const userCandB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const userEmpA = "eeeeeeee-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const userAdminA = "ffffffff-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  const candAId = "cand-a-id";
  const offerAId = "offer-a-id";
  const versionA1Id = "version-a1-id";
  const appAId = "app-a-id";

  describe("1. Candidate Decision Sovereignty", () => {
    it("Candidate owner -> ACCEPT = PASS", () => {
      const ctx = {
        userId: userCandA,
        organizationId: tenantA,
        role: Role.CANDIDATE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).not.toThrow();
    });

    it("Candidate owner -> DECLINE = PASS", () => {
      const ctx = {
        userId: userCandA,
        organizationId: tenantA,
        role: Role.CANDIDATE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).not.toThrow();
    });

    it("Employee -> ACCEPT = DENY", () => {
      const ctx = {
        userId: userEmpA,
        organizationId: tenantA,
        role: Role.EMPLOYEE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Employee -> DECLINE = DENY", () => {
      const ctx = {
        userId: userEmpA,
        organizationId: tenantA,
        role: Role.EMPLOYEE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Team Lead (Employee) -> ACCEPT = DENY", () => {
      const ctx = {
        userId: "teamlead-uuid",
        organizationId: tenantA,
        role: Role.EMPLOYEE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Team Lead (Employee) -> DECLINE = DENY", () => {
      const ctx = {
        userId: "teamlead-uuid",
        organizationId: tenantA,
        role: Role.EMPLOYEE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Manager (Employee) -> ACCEPT = DENY", () => {
      const ctx = {
        userId: "manager-uuid",
        organizationId: tenantA,
        role: Role.EMPLOYEE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Manager (Employee) -> DECLINE = DENY", () => {
      const ctx = {
        userId: "manager-uuid",
        organizationId: tenantA,
        role: Role.EMPLOYEE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Admin -> ACCEPT = DENY", () => {
      const ctx = {
        userId: userAdminA,
        organizationId: tenantA,
        role: Role.ADMIN,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Admin -> DECLINE = DENY", () => {
      const ctx = {
        userId: userAdminA,
        organizationId: tenantA,
        role: Role.ADMIN,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("AI / System actor -> ACCEPT = DENY", () => {
      const ctx = {
        userId: "system-ai-worker",
        organizationId: tenantA,
        role: "SYSTEM" as any,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("AI / System actor -> DECLINE = DENY", () => {
      const ctx = {
        userId: "system-ai-worker",
        organizationId: tenantA,
        role: "SYSTEM" as any,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Cross-candidate candidate -> ACCEPT / DECLINE = DENY", () => {
      const ctx = {
        userId: userCandB,
        organizationId: tenantA,
        role: Role.CANDIDATE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });

    it("Direct-ID candidate impersonation -> DENY", () => {
      // Non-matching userId even if role is CANDIDATE
      const ctx = {
        userId: "impersonator-uuid",
        organizationId: tenantA,
        role: Role.CANDIDATE,
      } as any;

      expect(() => assertCandidateDecisionAuthority(ctx, userCandA)).toThrow(AuthorizationError);
    });
  });

  describe("2. Scope & Structural Access Resolution", () => {
    it("resolves access scope for candidate owner", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            applicationId: appAId,
            candidateId: candAId,
            jobId: "job-1",
            status: OfferStatus.DECISION_PENDING,
            currentVersionNumber: 1,
            verificationState: "UNVERIFIED",
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({
            id: candAId,
            userId: userCandA,
            assignedEmployeeId: userEmpA,
          }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({
            id: appAId,
            status: "APPLIED",
            assignedEmployeeId: userEmpA,
            assignedTeamKey: "TEAM_1",
            assignedManagerId: null,
          }),
        },
      } as any;

      const ctx = {
        userId: userCandA,
        organizationId: tenantA,
        role: Role.CANDIDATE,
      } as any;

      const resolved = await assertOfferAccess(mockTx, ctx, offerAId);
      expect(resolved.scope.isCandidateOwner).toBe(true);
      expect(resolved.scope.canDecide).toBe(true);
      expect(resolved.scope.canViewInternalNotes).toBe(false);
    });

    it("resolves access scope for staff member", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            applicationId: appAId,
            candidateId: candAId,
            jobId: "job-1",
            status: OfferStatus.OFFER_UNDER_REVIEW,
            currentVersionNumber: 1,
            verificationState: "UNVERIFIED",
          }),
        },
        candidate: {
          findFirst: vi.fn().mockResolvedValue({
            id: candAId,
            userId: userCandA,
            assignedEmployeeId: userEmpA,
          }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({
            id: appAId,
            status: "APPLIED",
            assignedEmployeeId: userEmpA,
            assignedTeamKey: "TEAM_1",
            assignedManagerId: null,
          }),
        },
      } as any;

      const ctx = {
        userId: userEmpA,
        organizationId: tenantA,
        role: Role.EMPLOYEE,
      } as any;

      const resolved = await assertOfferAccess(mockTx, ctx, offerAId);
      expect(resolved.scope.isCandidateOwner).toBe(false);
      expect(resolved.scope.isStaffPrivileged).toBe(true);
      expect(resolved.scope.canViewInternalNotes).toBe(true);
      expect(resolved.scope.canVerifyPlacement).toBe(true);
    });

    it("denies access when querying across tenant boundary", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const ctx = {
        userId: userAdminA,
        organizationId: tenantB, // querying tenant A record with tenant B context
        role: Role.ADMIN,
      } as any;

      await expect(assertOfferAccess(mockTx, ctx, offerAId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("3. Placement Verification Authorization Guards", () => {
    it("rejects candidate attempting to verify placement", async () => {
      const mockTx = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: offerAId,
            organizationId: tenantA,
            applicationId: appAId,
            candidateId: candAId,
            jobId: "job-1",
            status: OfferStatus.ACCEPTED,
            currentVersionNumber: 1,
            verificationState: "UNVERIFIED",
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
          proofDocumentId: "doc-1",
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });
});
