/**
 * Phase 9D — LIVE OPOS Lifecycle Integration & End-to-End Governance Test
 * Exercises full golden flow:
 * Outcome Handoff -> V1 -> Negotiation -> V2 -> Candidate ACCEPT -> Joining -> Placement Verification
 * Contract: docs/engineering/PHASE_9A_OFFER_PLACEMENT_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 */

import { config } from "dotenv";
config({ path: ".env" });

import { randomUUID } from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  ensureRuntimeRoleGrant,
  getLiveDbUrl,
  withBypassClient,
  withRuntimeRlsAsUser,
} from "../helpers/live-rls";
import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";
import {
  OfferStatus,
  OfferDecisionType,
  JoiningStatus,
  NegotiationEventType,
  OfferProvenanceType,
  Role,
} from "@/lib/opos/types";
import {
  handoffOutcomeToOffer,
  createAuthoritativeOfferVersion,
  initiateNegotiation,
  recordAuthoritativeNegotiationEvent,
  recordAuthoritativeCandidateDecision,
  confirmCandidateFirstDay,
  verifyPlacement,
} from "@/lib/opos/opos-service";
import { InvalidStateTransitionError, AuthorizationError, ValidationError } from "@/lib/errors";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9D — LIVE OPOS Lifecycle & Service Integration", () => {
  const tenantId = randomUUID();
  const userCandId = randomUUID();
  const userEmpId = randomUUID();
  const userAdminId = randomUUID();
  const candId = randomUUID();
  const jobId = randomUUID();
  const appId = randomUUID();
  const docId = randomUUID();

  let activeOfferId = "";
  let activeVersion1Id = "";
  let activeVersion2Id = "";

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // 1. Org
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
         VALUES ($1, 'OPOS Phase 9D Org', $2, 'ACTIVE', NOW(), NOW())`,
        [tenantId, `opos-9d-${tenantId.slice(0, 8)}`]
      );

      // 2. Users
      for (const [id, email] of [
        [userCandId, `cand-9d-${userCandId.slice(0, 8)}@test.com`],
        [userEmpId, `emp-9d-${userEmpId.slice(0, 8)}@test.com`],
        [userAdminId, `admin-9d-${userAdminId.slice(0, 8)}@test.com`],
      ] as const) {
        await c.query(
          `INSERT INTO users (id, email, status, "createdAt", "updatedAt")
           VALUES ($1, $2, 'ACTIVE', NOW(), NOW())`,
          [id, email]
        );
      }

      // 3. Memberships
      for (const [uId, role] of [
        [userCandId, "CANDIDATE"],
        [userEmpId, "EMPLOYEE"],
        [userAdminId, "ADMIN"],
      ] as const) {
        await c.query(
          `INSERT INTO memberships (id, "organizationId", "userId", role, status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())`,
          [randomUUID(), tenantId, uId, role]
        );
      }

      // 4. Candidate
      await c.query(
        `INSERT INTO candidates (id, "organizationId", "userId", status, "verificationStatus", country, "workAuthorization", "salaryCurrency", application_authorization_mode, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'ACTIVE', 'UNVERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', NOW(), NOW())`,
        [candId, tenantId, userCandId]
      );

      // 5. Job & Application
      await c.query(
        `INSERT INTO jobs (id, "organizationId", title, "companyName", "jobDescription", location, "isRemote", "employmentType", status, visibility, "createdById", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Principal Architect', 'Enterprise Cloud Inc', 'JD', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $3, NOW(), NOW())`,
        [jobId, tenantId, userAdminId]
      );

      await c.query(
        `INSERT INTO applications (id, "organizationId", "candidateId", "jobId", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'DISCOVERED', NOW(), NOW())`,
        [appId, tenantId, candId, jobId]
      );

      // 6. Candidate Document
      await c.query(
        `INSERT INTO candidate_documents (id, "candidateId", title, "storagePath", "fileSizeBytes", "mimeType", "uploadedBy", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Official_Offer_Letter.pdf', 'offers/phase9d/offer.pdf', 2048, 'application/pdf', $3, NOW(), NOW())`,
        [docId, candId, userCandId]
      );
    });
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    await withBypassClient(async (c) => {
      await c.query(`DELETE FROM audit_events WHERE "organizationId" = $1 OR "actorId" = ANY($2::uuid[])`, [
        tenantId,
        [userCandId, userEmpId, userAdminId],
      ]);
      await c.query(`DELETE FROM placement_records WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM joining_records WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM offer_decisions WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM negotiation_events WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM negotiations WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM offer_evidence WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM offer_versions WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM offers WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM candidate_documents WHERE "candidateId" = $1`, [candId]);
      await c.query(`DELETE FROM applications WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM jobs WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM candidates WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM memberships WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userCandId, userEmpId, userAdminId]]);
      await c.query(`DELETE FROM organizations WHERE id = $1`, [tenantId]);
    });
    await prisma.$disconnect();
  }, 60000);

  describe("1. Outcome Ledger Handoff & Offer Initialization", () => {
    it("creates Offer and V1 OfferVersion transactionally", async () => {
      const staffCtx = {
        userId: userEmpId,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      const result = await prisma.$transaction(async (tx) => {
        return handoffOutcomeToOffer(tx, staffCtx, {
          applicationId: appId,
          initialTerms: {
            roleTitle: "Principal Architect",
            baseSalaryAmount: 220000,
            baseSalaryCurrency: "USD",
            signOnBonusAmount: 30000,
          },
          evidenceDocumentId: docId,
          evidenceStoragePath: "offers/phase9d/offer.pdf",
        });
      });

      expect(result.created).toBe(true);
      expect(result.offer.status).toBe(OfferStatus.OFFER_RECEIVED);
      expect(result.offer.currentVersionNumber).toBe(1);
      expect(result.version.baseSalaryAmount).toBe(220000);

      activeOfferId = result.offer.id;
      activeVersion1Id = result.version.id;
    });

    it("replaying handoff returns existing active offer (Idempotency)", async () => {
      const staffCtx = {
        userId: userEmpId,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      const result = await prisma.$transaction(async (tx) => {
        return handoffOutcomeToOffer(tx, staffCtx, {
          applicationId: appId,
        });
      });

      expect(result.created).toBe(false);
      expect(result.offer.id).toBe(activeOfferId);
    });
  });

  describe("2. Negotiation Initiation & Append-Only Events", () => {
    it("initiates negotiation and records candidate counter-target", async () => {
      const candCtx = {
        userId: userCandId,
        organizationId: tenantId,
        role: Role.CANDIDATE,
      } as any;

      const result = await prisma.$transaction(async (tx) => {
        return initiateNegotiation(tx, candCtx, {
          offerId: activeOfferId,
          candidateTargetBase: 240000,
          candidateTargetNotes: "Targeting $240k base to align with competing offer.",
        });
      });

      expect(result.negotiation.candidateTargetBase).toBe(240000);
      expect(result.offer.status).toBe(OfferStatus.NEGOTIATION);
    });

    it("records specialist strategy and employer counter response events", async () => {
      const staffCtx = {
        userId: userEmpId,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      const event = await prisma.$transaction(async (tx) => {
        return recordAuthoritativeNegotiationEvent(tx, staffCtx, {
          offerId: activeOfferId,
          eventType: NegotiationEventType.EMPLOYER_COUNTER_RECEIVED,
          offerVersionId: activeVersion1Id,
          eventDetails: { employerOfferedBase: 235000, signOnOffered: 40000 },
          internalStaffNotes: "Employer agreed to $235k base and $40k sign-on bonus.",
        });
      });

      expect(event.eventType).toBe(NegotiationEventType.EMPLOYER_COUNTER_RECEIVED);
      expect(event.offerVersionId).toBe(activeVersion1Id);
    });
  });

  describe("3. Authoritative Version Increment (V1 -> V2)", () => {
    it("creates V2 OfferVersion and supersedes V1", async () => {
      const staffCtx = {
        userId: userEmpId,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      const result = await prisma.$transaction(async (tx) => {
        return createAuthoritativeOfferVersion(tx, staffCtx, {
          offerId: activeOfferId,
          terms: {
            roleTitle: "Principal Architect",
            baseSalaryAmount: 235000,
            baseSalaryCurrency: "USD",
            signOnBonusAmount: 40000,
            proposedStartDate: new Date("2026-11-15"),
          },
        });
      });

      expect(result.version.versionNumber).toBe(2);
      expect(result.offer.currentVersionNumber).toBe(2);

      activeVersion2Id = result.version.id;

      // Verify V1 is superseded
      const v1 = await prisma.offerVersion.findUniqueOrThrow({ where: { id: activeVersion1Id } });
      expect(v1.supersededAt).not.toBeNull();
    });
  });

  describe("4. Candidate Decision Sovereignty & Anti-Impersonation", () => {
    it("rejects employee direct decision execution without recordedOnBehalf", async () => {
      const staffCtx = {
        userId: userEmpId,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      await expect(
        prisma.$transaction(async (tx) => {
          return recordAuthoritativeCandidateDecision(tx, staffCtx, {
            offerId: activeOfferId,
            offerVersionId: activeVersion2Id,
            decisionType: OfferDecisionType.ACCEPT,
          });
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("rejects candidate accepting stale V1 version", async () => {
      const candCtx = {
        userId: userCandId,
        organizationId: tenantId,
        role: Role.CANDIDATE,
      } as any;

      await expect(
        prisma.$transaction(async (tx) => {
          return recordAuthoritativeCandidateDecision(tx, candCtx, {
            offerId: activeOfferId,
            offerVersionId: activeVersion1Id, // Stale V1
            decisionType: OfferDecisionType.ACCEPT,
          });
        })
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it("allows Candidate to ACCEPT V2, transitions Offer to ACCEPTED and plans Joining", async () => {
      const candCtx = {
        userId: userCandId,
        organizationId: tenantId,
        role: Role.CANDIDATE,
      } as any;

      const result = await prisma.$transaction(async (tx) => {
        return recordAuthoritativeCandidateDecision(tx, candCtx, {
          offerId: activeOfferId,
          offerVersionId: activeVersion2Id,
          decisionType: OfferDecisionType.ACCEPT,
          scheduledStartDate: new Date("2026-11-15"),
        });
      });

      expect(result.decision.decisionType).toBe(OfferDecisionType.ACCEPT);
      expect(result.offer.status).toBe(OfferStatus.ACCEPTED);
      expect(result.joining).toBeDefined();
      expect(result.joining?.status).toBe(JoiningStatus.JOINING_PLANNED);
    });
  });

  describe("5. Joining Lifecycle & First Day Confirmation", () => {
    it("candidate confirms Day One attendance moving joining to JOINING_CONFIRMED", async () => {
      const candCtx = {
        userId: userCandId,
        organizationId: tenantId,
        role: Role.CANDIDATE,
      } as any;

      const joining = await prisma.$transaction(async (tx) => {
        return confirmCandidateFirstDay(tx, candCtx, {
          offerId: activeOfferId,
          location: "Remote - Official Start",
        });
      });

      expect(joining.status).toBe(JoiningStatus.JOINING_CONFIRMED);
      expect(joining.firstDayConfirmedByCandidate).toBe(true);
    });
  });

  describe("6. Two-Factor Placement Verification", () => {
    it("rejects verification if proof is missing", async () => {
      const staffCtx = {
        userId: userEmpId,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      await expect(
        prisma.$transaction(async (tx) => {
          return verifyPlacement(tx, staffCtx, {
            offerId: activeOfferId,
            verifiedStartDate: new Date("2026-11-15"),
            firstDayConfirmed: true,
            onboardingProofValidated: true,
            proofDocumentId: null, // Missing proof
            proofStoragePath: null,
          });
        })
      ).rejects.toThrow(ValidationError);
    });

    it("authoritatively verifies placement with both factors and onboarding proof document", async () => {
      const staffCtx = {
        userId: userEmpId,
        organizationId: tenantId,
        role: Role.EMPLOYEE,
      } as any;

      const result = await prisma.$transaction(async (tx) => {
        return verifyPlacement(tx, staffCtx, {
          offerId: activeOfferId,
          verifiedStartDate: new Date("2026-11-15"),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: docId,
          proofStoragePath: "offers/phase9d/offer.pdf",
          verificationNotes: "First day login confirmed via badge access & signed IT equipment policy.",
        });
      });

      expect(result.placement.firstDayConfirmed).toBe(true);
      expect(result.placement.onboardingProofValidated).toBe(true);
      expect(result.placement.proofDocumentId).toBe(docId);
      expect(result.offer.verificationState).toBe("VERIFIED");
      expect(result.offer.verifiedAt).not.toBeNull();
    });
  });
});
