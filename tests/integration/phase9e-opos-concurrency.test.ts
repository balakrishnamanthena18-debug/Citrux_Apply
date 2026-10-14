/**
 * Phase 9E — Live Database Concurrency & Race Condition Adversarial Tests
 * Executes concurrent parallel transactions against real PostgreSQL database.
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
  Role,
} from "@/lib/opos/types";
import {
  handoffOutcomeToOffer,
  createAuthoritativeOfferVersion,
  recordAuthoritativeCandidateDecision,
  verifyPlacement,
  confirmCandidateFirstDay,
} from "@/lib/opos/opos-service";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9E — Live Concurrency, Race & Conflict Protection", () => {
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

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // 1. Org
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
         VALUES ($1, 'OPOS 9E Concurrency Org', $2, 'ACTIVE', NOW(), NOW())`,
        [tenantId, `opos-9e-c-${tenantId.slice(0, 8)}`]
      );

      // 2. Users
      for (const [id, email] of [
        [userCandId, `cand-9e-c-${userCandId.slice(0, 8)}@test.com`],
        [userEmpId, `emp-9e-c-${userEmpId.slice(0, 8)}@test.com`],
        [userAdminId, `admin-9e-c-${userAdminId.slice(0, 8)}@test.com`],
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
         VALUES ($1, $2, 'Staff Cloud Eng', 'Enterprise Cloud Inc', 'JD', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $3, NOW(), NOW())`,
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
         VALUES ($1, $2, 'Offer_Letter.pdf', 'offers/phase9e/offer.pdf', 2048, 'application/pdf', $3, NOW(), NOW())`,
        [docId, candId, userCandId]
      );
    });

    // Create baseline offer
    const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;
    const handoffResult = await prisma.$transaction(async (tx) => {
      return handoffOutcomeToOffer(tx, staffCtx, {
        applicationId: appId,
        initialTerms: {
          roleTitle: "Staff Cloud Eng",
          baseSalaryAmount: 210000,
          baseSalaryCurrency: "USD",
        },
        evidenceDocumentId: docId,
        evidenceStoragePath: "offers/phase9e/offer.pdf",
      });
    });

    activeOfferId = handoffResult.offer.id;
    activeVersion1Id = handoffResult.version.id;
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

  describe("1. Real Concurrent Handoff Replay", () => {
    it("parallel handoffOutcomeToOffer requests safely resolve to same Offer ID without duplicate rows", async () => {
      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

      const [res1, res2] = await Promise.all([
        prisma.$transaction(async (tx) => handoffOutcomeToOffer(tx, staffCtx, { applicationId: appId })),
        prisma.$transaction(async (tx) => handoffOutcomeToOffer(tx, staffCtx, { applicationId: appId })),
      ]);

      expect(res1.offer.id).toBe(activeOfferId);
      expect(res2.offer.id).toBe(activeOfferId);

      const count = await prisma.offer.count({ where: { applicationId: appId } });
      expect(count).toBe(1);
    });
  });

  describe("2. Real Concurrent Candidate Decision Execution", () => {
    it("parallel candidate ACCEPT requests execute idempotently with single authoritative outcome", async () => {
      const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

      const [res1, res2] = await Promise.all([
        prisma.$transaction(async (tx) =>
          recordAuthoritativeCandidateDecision(tx, candCtx, {
            offerId: activeOfferId,
            offerVersionId: activeVersion1Id,
            decisionType: OfferDecisionType.ACCEPT,
            scheduledStartDate: new Date("2026-12-01"),
          })
        ),
        prisma.$transaction(async (tx) =>
          recordAuthoritativeCandidateDecision(tx, candCtx, {
            offerId: activeOfferId,
            offerVersionId: activeVersion1Id,
            decisionType: OfferDecisionType.ACCEPT,
            scheduledStartDate: new Date("2026-12-01"),
          })
        ),
      ]);

      expect(res1.offer.status).toBe(OfferStatus.ACCEPTED);
      expect(res2.offer.status).toBe(OfferStatus.ACCEPTED);

      // Verify only 1 decision record exists for ACCEPT on this version
      const decisionCount = await prisma.offerDecision.count({
        where: {
          offerId: activeOfferId,
          offerVersionId: activeVersion1Id,
          decisionType: OfferDecisionType.ACCEPT,
        },
      });
      expect(decisionCount).toBe(1);

      // Verify only 1 joining record exists
      const joiningCount = await prisma.joiningRecord.count({
        where: { offerId: activeOfferId },
      });
      expect(joiningCount).toBe(1);
    });
  });

  describe("3. Real Concurrent Placement Verification", () => {
    it("parallel verifyPlacement executions upsert cleanly without duplicate placement records", async () => {
      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

      const [res1, res2] = await Promise.all([
        prisma.$transaction(async (tx) =>
          verifyPlacement(tx, staffCtx, {
            offerId: activeOfferId,
            verifiedStartDate: new Date("2026-12-01"),
            firstDayConfirmed: true,
            onboardingProofValidated: true,
            proofDocumentId: docId,
          })
        ),
        prisma.$transaction(async (tx) =>
          verifyPlacement(tx, staffCtx, {
            offerId: activeOfferId,
            verifiedStartDate: new Date("2026-12-01"),
            firstDayConfirmed: true,
            onboardingProofValidated: true,
            proofDocumentId: docId,
          })
        ),
      ]);

      expect(res1.placement.firstDayConfirmed).toBe(true);
      expect(res2.placement.firstDayConfirmed).toBe(true);
      expect(res1.offer.verificationState).toBe("VERIFIED");

      const placementCount = await prisma.placementRecord.count({
        where: { offerId: activeOfferId },
      });
      expect(placementCount).toBe(1);
    });
  });
});
