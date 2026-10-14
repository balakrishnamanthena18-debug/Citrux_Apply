/**
 * Phase 9F — LIVE Cross-Domain OPOS Golden Path Verification
 * Verifies Golden Paths A, B, C, D, E from Application -> Outcome -> OPOS -> Joining -> Placement.
 */

import { config } from "dotenv";
config({ path: ".env" });

import { randomUUID } from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  ensureRuntimeRoleGrant,
  getLiveDbUrl,
  withBypassClient,
} from "../helpers/live-rls";
import { prisma } from "@/lib/db/prisma";
import {
  OfferStatus,
  OfferDecisionType,
  JoiningStatus,
  NegotiationEventType,
  Role,
  JoiningFailureReason,
} from "@/lib/opos/types";
import {
  handoffOutcomeToOffer,
  createAuthoritativeOfferVersion,
  initiateNegotiation,
  recordAuthoritativeNegotiationEvent,
  recordAuthoritativeCandidateDecision,
  confirmCandidateFirstDay,
  recordFailedToJoin,
  verifyPlacement,
} from "@/lib/opos/opos-service";
import { transitionOffer } from "@/lib/opos/lifecycle";
import { InvalidStateTransitionError, AuthorizationError } from "@/lib/errors";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9F — LIVE Cross-Domain OPOS Golden Path Integration", () => {
  const tenantId = randomUUID();
  const userCandId = randomUUID();
  const userEmpId = randomUUID();
  const userAdminId = randomUUID();
  const candId = randomUUID();
  const jobId = randomUUID();
  const appIdA = randomUUID();
  const appIdB = randomUUID();
  const appIdC = randomUUID();
  const appIdD = randomUUID();
  const appIdE = randomUUID();
  const docId = randomUUID();

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // 1. Organization
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
         VALUES ($1, 'OPOS Golden Path Org', $2, 'ACTIVE', NOW(), NOW())`,
        [tenantId, `opos-9f-gp-${tenantId.slice(0, 8)}`]
      );

      // 2. Users
      for (const [id, email] of [
        [userCandId, `cand-9f-gp-${userCandId.slice(0, 8)}@test.com`],
        [userEmpId, `emp-9f-gp-${userEmpId.slice(0, 8)}@test.com`],
        [userAdminId, `admin-9f-gp-${userAdminId.slice(0, 8)}@test.com`],
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

      // 5. Jobs and Applications A, B, C, D, E
      const apps = [appIdA, appIdB, appIdC, appIdD, appIdE];
      for (const aId of apps) {
        const jId = randomUUID();
        await c.query(
          `INSERT INTO jobs (id, "organizationId", title, "companyName", "jobDescription", location, "isRemote", "employmentType", status, visibility, "createdById", "createdAt", "updatedAt")
           VALUES ($1, $2, 'Lead Systems Engineer', 'Cloud Horizon Inc', 'Full stack and distributed systems', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $3, NOW(), NOW())`,
          [jId, tenantId, userAdminId]
        );

        await c.query(
          `INSERT INTO applications (id, "organizationId", "candidateId", "jobId", status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'SUBMITTED', NOW(), NOW())`,
          [aId, tenantId, candId, jId]
        );
      }

      // 7. Candidate Document
      await c.query(
        `INSERT INTO candidate_documents (id, "candidateId", title, "storagePath", "fileSizeBytes", "mimeType", "uploadedBy", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Offer_Letter_Signed.pdf', 'offers/phase9f/letter.pdf', 4096, 'application/pdf', $3, NOW(), NOW())`,
        [docId, candId, userCandId]
      );
    });
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    await withBypassClient(async (c) => {
      await c.query(`DELETE FROM audit_events WHERE "organizationId" = $1`, [tenantId]);
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

  describe("Golden Path A — Complete Successful Placement Journey", () => {
    let offerId = "";
    let versionId = "";

    it("1. Outcome Ledger Handoff -> OPOS Offer Created in OFFER_RECEIVED", async () => {
      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

      const res = await prisma.$transaction(async (tx) =>
        handoffOutcomeToOffer(tx, staffCtx, {
          applicationId: appIdA,
          initialTerms: {
            roleTitle: "Lead Systems Engineer",
            baseSalaryAmount: 195000,
            baseSalaryCurrency: "USD",
            signOnBonusAmount: 25000,
          },
          evidenceDocumentId: docId,
          evidenceStoragePath: "offers/phase9f/letter.pdf",
        })
      );

      expect(res.created).toBe(true);
      expect(res.offer.status).toBe(OfferStatus.OFFER_RECEIVED);
      expect(res.offer.currentVersionNumber).toBe(1);
      expect(res.version.baseSalaryAmount).toBe(195000);

      offerId = res.offer.id;
      versionId = res.version.id;
    });

    it("2. Offer moves to OFFER_UNDER_REVIEW -> DECISION_PENDING", async () => {
      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

      await prisma.$transaction(async (tx) => {
        await transitionOffer(tx, staffCtx, {
          offerId,
          toStatus: OfferStatus.OFFER_UNDER_REVIEW,
          reason: "Reviewing terms with candidate",
        });
        await transitionOffer(tx, staffCtx, {
          offerId,
          toStatus: OfferStatus.DECISION_PENDING,
          reason: "Terms structured for final candidate decision",
        });
      });

      const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
      expect(offer.status).toBe(OfferStatus.DECISION_PENDING);
    });

    it("3. Candidate authoritatively ACCEPTS offer -> status becomes ACCEPTED, Joining planned", async () => {
      const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

      const res = await prisma.$transaction(async (tx) =>
        recordAuthoritativeCandidateDecision(tx, candCtx, {
          offerId,
          offerVersionId: versionId,
          decisionType: OfferDecisionType.ACCEPT,
          scheduledStartDate: new Date("2026-11-01"),
        })
      );

      expect(res.offer.status).toBe(OfferStatus.ACCEPTED);
      expect(res.decision.decisionType).toBe(OfferDecisionType.ACCEPT);
      expect(res.joining?.status).toBe(JoiningStatus.JOINING_PLANNED);
    });

    it("4. Candidate confirms Day One -> status becomes JOINING_CONFIRMED", async () => {
      const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

      const joining = await prisma.$transaction(async (tx) =>
        confirmCandidateFirstDay(tx, candCtx, {
          offerId,
          actualStartDate: new Date("2026-11-01"),
          location: "Remote",
        })
      );

      expect(joining.status).toBe(JoiningStatus.JOINING_CONFIRMED);
      expect(joining.firstDayConfirmedByCandidate).toBe(true);
    });

    it("5. Staff executes Two-Factor Placement Verification -> PLACEMENT_VERIFIED", async () => {
      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

      const res = await prisma.$transaction(async (tx) =>
        verifyPlacement(tx, staffCtx, {
          offerId,
          verifiedStartDate: new Date("2026-11-01"),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: docId,
          verificationNotes: "Onboarding completed, verified active corporate credentials.",
        })
      );

      expect(res.placement.firstDayConfirmed).toBe(true);
      expect(res.placement.onboardingProofValidated).toBe(true);
      expect(res.offer.verificationState).toBe("VERIFIED");
    });
  });

  describe("Golden Path B — Candidate Decline Journey", () => {
    let offerId = "";
    let versionId = "";

    it("creates offer, reviews, and candidate authoritatively DECLINES", async () => {
      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;
      const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

      const res = await prisma.$transaction(async (tx) =>
        handoffOutcomeToOffer(tx, staffCtx, {
          applicationId: appIdB,
          initialTerms: { roleTitle: "Lead Systems Engineer", baseSalaryAmount: 180000 },
        })
      );
      offerId = res.offer.id;
      versionId = res.version.id;

      await prisma.$transaction(async (tx) => {
        await transitionOffer(tx, staffCtx, {
          offerId,
          toStatus: OfferStatus.OFFER_UNDER_REVIEW,
        });
        await transitionOffer(tx, staffCtx, {
          offerId,
          toStatus: OfferStatus.DECISION_PENDING,
        });
      });

      const decRes = await prisma.$transaction(async (tx) =>
        recordAuthoritativeCandidateDecision(tx, candCtx, {
          offerId,
          offerVersionId: versionId,
          decisionType: OfferDecisionType.DECLINE,
          structuredReason: "COMPENSATION_BELOW_TARGET" as any,
          privateCandidateFeedback: "Accepted an alternative offer with higher equity grant.",
        })
      );

      expect(decRes.offer.status).toBe(OfferStatus.DECLINED);
      expect(decRes.decision.decisionType).toBe(OfferDecisionType.DECLINE);

      // Verify no joining record was created
      const joining = await prisma.joiningRecord.findUnique({ where: { offerId } });
      expect(joining).toBeNull();
    });
  });

  describe("Golden Path C — Negotiation & Multi-Version Revisions", () => {
    let offerId = "";
    let version1Id = "";
    let version2Id = "";

    it("initiates negotiation, adds events, creates V2, and candidate decides on V2", async () => {
      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;
      const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

      const res = await prisma.$transaction(async (tx) =>
        handoffOutcomeToOffer(tx, staffCtx, {
          applicationId: appIdC,
          initialTerms: { roleTitle: "Lead Systems Engineer", baseSalaryAmount: 190000 },
        })
      );
      offerId = res.offer.id;
      version1Id = res.version.id;

      // Candidate requests negotiation
      const neg = await prisma.$transaction(async (tx) =>
        initiateNegotiation(tx, candCtx, {
          offerId,
          candidateTargetBase: 210000,
          candidateTargetNotes: "Counter-offer based on market benchmark",
        })
      );
      expect(neg.offer.status).toBe(OfferStatus.NEGOTIATION);

      // Staff records employer counter event
      await prisma.$transaction(async (tx) =>
        recordAuthoritativeNegotiationEvent(tx, staffCtx, {
          offerId,
          eventType: NegotiationEventType.EMPLOYER_COUNTER_RECEIVED,
          offerVersionId: version1Id,
          eventDetails: { employerOfferedBase: 205000 },
        })
      );

      // Staff creates V2 version
      const v2Res = await prisma.$transaction(async (tx) =>
        createAuthoritativeOfferVersion(tx, staffCtx, {
          offerId,
          terms: { roleTitle: "Lead Systems Engineer", baseSalaryAmount: 205000 },
        })
      );
      version2Id = v2Res.version.id;
      expect(v2Res.version.versionNumber).toBe(2);

      // Move to DECISION_PENDING and candidate accepts V2
      await prisma.$transaction(async (tx) => {
        await transitionOffer(tx, staffCtx, {
          offerId,
          toStatus: OfferStatus.DECISION_PENDING,
        });
      });

      const acceptRes = await prisma.$transaction(async (tx) =>
        recordAuthoritativeCandidateDecision(tx, candCtx, {
          offerId,
          offerVersionId: version2Id,
          decisionType: OfferDecisionType.ACCEPT,
        })
      );

      expect(acceptRes.offer.status).toBe(OfferStatus.ACCEPTED);
      expect(acceptRes.offer.currentVersionNumber).toBe(2);
    });
  });

  describe("Golden Path D — Failed Join Journey", () => {
    let offerId = "";

    it("accepts offer, confirms start, then records FAILED_TO_JOIN and blocks placement", async () => {
      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;
      const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

      const res = await prisma.$transaction(async (tx) =>
        handoffOutcomeToOffer(tx, staffCtx, {
          applicationId: appIdD,
          initialTerms: { roleTitle: "Lead Systems Engineer", baseSalaryAmount: 190000 },
        })
      );
      offerId = res.offer.id;

      await prisma.$transaction(async (tx) => {
        await recordAuthoritativeCandidateDecision(tx, candCtx, {
          offerId,
          offerVersionId: res.version.id,
          decisionType: OfferDecisionType.ACCEPT,
        });
      });

      // Staff records failed to join
      const failRes = await prisma.$transaction(async (tx) =>
        recordFailedToJoin(tx, staffCtx, {
          offerId,
          failureReason: JoiningFailureReason.CANDIDATE_RENEGED,
          failureNotes: "Candidate withdrew due to personal reasons before start date.",
        })
      );

      expect(failRes.status).toBe(JoiningStatus.FAILED_TO_JOIN);

      // Attempting to verify placement on FAILED_TO_JOIN must throw InvalidStateTransitionError
      await expect(
        prisma.$transaction(async (tx) =>
          verifyPlacement(tx, staffCtx, {
            offerId,
            verifiedStartDate: new Date(),
            firstDayConfirmed: true,
            onboardingProofValidated: true,
            proofDocumentId: docId,
          })
        )
      ).rejects.toThrow(InvalidStateTransitionError);
    });
  });

  describe("Golden Path E — Expired Offer & Formal Extension Path", () => {
    let offerId = "";

    it("expires offer, denies direct ACCEPT, then reopens via formal deadline extension", async () => {
      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;
      const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

      const res = await prisma.$transaction(async (tx) =>
        handoffOutcomeToOffer(tx, staffCtx, {
          applicationId: appIdE,
          initialTerms: { roleTitle: "Lead Systems Engineer", baseSalaryAmount: 190000 },
        })
      );
      offerId = res.offer.id;

      // Transition to EXPIRED
      await prisma.$transaction(async (tx) => {
        await transitionOffer(tx, staffCtx, {
          offerId,
          toStatus: OfferStatus.EXPIRED,
          reason: "Candidate decision deadline elapsed",
        })
      });

      // Direct ACCEPT on EXPIRED must fail
      await expect(
        prisma.$transaction(async (tx) =>
          recordAuthoritativeCandidateDecision(tx, candCtx, {
            offerId,
            offerVersionId: res.version.id,
            decisionType: OfferDecisionType.ACCEPT,
          })
        )
      ).rejects.toThrow(InvalidStateTransitionError);

      // Formal extension back to OFFER_UNDER_REVIEW is permitted
      await prisma.$transaction(async (tx) => {
        await transitionOffer(tx, staffCtx, {
          offerId,
          toStatus: OfferStatus.OFFER_UNDER_REVIEW,
          reason: "Employer granted 1-week deadline extension",
        })
      });

      const refreshed = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
      expect(refreshed.status).toBe(OfferStatus.OFFER_UNDER_REVIEW);
    });
  });
});
