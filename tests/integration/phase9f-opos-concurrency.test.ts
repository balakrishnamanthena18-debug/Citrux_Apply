/**
 * Phase 9F — LIVE Cross-Domain Concurrency & Conflict Protection
 * Verifies real PostgreSQL concurrent transactions across handoffs,
 * candidate decisions, joining confirmations, and placement verifications.
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
  Role,
  JoiningFailureReason,
} from "@/lib/opos/types";
import {
  handoffOutcomeToOffer,
  recordAuthoritativeCandidateDecision,
  confirmCandidateFirstDay,
  recordFailedToJoin,
  verifyPlacement,
} from "@/lib/opos/opos-service";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9F — Cross-Domain Concurrency & Conflict Protection", () => {
  const tenantId = randomUUID();
  const userCandId = randomUUID();
  const userEmpId = randomUUID();
  const candId = randomUUID();
  const jobId = randomUUID();
  const appId1 = randomUUID();
  const appId2 = randomUUID();
  const docId = randomUUID();

  let offer1Id = "";
  let offer1V1Id = "";
  let offer2Id = "";
  let offer2V1Id = "";

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // 1. Org
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
         VALUES ($1, 'Concurrency Test Org', $2, 'ACTIVE', NOW(), NOW())`,
        [tenantId, `conc-org-${tenantId.slice(0, 8)}`]
      );

      // 2. Users
      await c.query(
        `INSERT INTO users (id, email, status, "createdAt", "updatedAt") VALUES
         ($1, $3, 'ACTIVE', NOW(), NOW()),
         ($2, $4, 'ACTIVE', NOW(), NOW())`,
        [
          userCandId,
          userEmpId,
          `candconc-${userCandId.slice(0, 8)}@test.com`,
          `empconc-${userEmpId.slice(0, 8)}@test.com`,
        ]
      );

      // 3. Memberships
      await c.query(
        `INSERT INTO memberships (id, "organizationId", "userId", role, status, "createdAt", "updatedAt") VALUES
         (gen_random_uuid(), $1, $2, 'CANDIDATE', 'ACTIVE', NOW(), NOW()),
         (gen_random_uuid(), $1, $3, 'EMPLOYEE', 'ACTIVE', NOW(), NOW())`,
        [tenantId, userCandId, userEmpId]
      );

      // 4. Candidate
      await c.query(
        `INSERT INTO candidates (id, "organizationId", "userId", status, "verificationStatus", country, "workAuthorization", "salaryCurrency", application_authorization_mode, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'ACTIVE', 'UNVERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', NOW(), NOW())`,
        [candId, tenantId, userCandId]
      );

      // 5. Jobs & Applications
      const job1Id = randomUUID();
      const job2Id = randomUUID();

      await c.query(
        `INSERT INTO jobs (id, "organizationId", title, "companyName", "jobDescription", location, "isRemote", "employmentType", status, visibility, "createdById", "createdAt", "updatedAt") VALUES
         ($1, $3, 'Senior DevOps Engineer 1', 'ScaleOps Inc', 'JD', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $4, NOW(), NOW()),
         ($2, $3, 'Senior DevOps Engineer 2', 'ScaleOps Inc', 'JD', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $4, NOW(), NOW())`,
        [job1Id, job2Id, tenantId, userEmpId]
      );

      // 6. Applications
      await c.query(
        `INSERT INTO applications (id, "organizationId", "candidateId", "jobId", status, "createdAt", "updatedAt") VALUES
         ($1, $3, $4, $5, 'SUBMITTED', NOW(), NOW()),
         ($2, $3, $4, $6, 'SUBMITTED', NOW(), NOW())`,
        [appId1, appId2, tenantId, candId, job1Id, job2Id]
      );

      // 7. Document
      await c.query(
        `INSERT INTO candidate_documents (id, "candidateId", title, "storagePath", "fileSizeBytes", "mimeType", "uploadedBy", "createdAt", "updatedAt")
         VALUES ($1, $2, 'doc.pdf', 'offers/conc/doc.pdf', 1024, 'application/pdf', $3, NOW(), NOW())`,
        [docId, candId, userCandId]
      );
    });

    const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

    const res1 = await prisma.$transaction(async (tx) =>
      handoffOutcomeToOffer(tx, staffCtx, {
        applicationId: appId1,
        initialTerms: { roleTitle: "Senior DevOps Engineer", baseSalaryAmount: 180000 },
      })
    );
    offer1Id = res1.offer.id;
    offer1V1Id = res1.version.id;

    const res2 = await prisma.$transaction(async (tx) =>
      handoffOutcomeToOffer(tx, staffCtx, {
        applicationId: appId2,
        initialTerms: { roleTitle: "Senior DevOps Engineer", baseSalaryAmount: 185000 },
      })
    );
    offer2Id = res2.offer.id;
    offer2V1Id = res2.version.id;
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    await withBypassClient(async (c) => {
      await c.query(`DELETE FROM audit_events WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM placement_records WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM joining_records WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM offer_decisions WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM offer_versions WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM offers WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM candidate_documents WHERE "candidateId" = $1`, [candId]);
      await c.query(`DELETE FROM applications WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM jobs WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM candidates WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM memberships WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userCandId, userEmpId]]);
      await c.query(`DELETE FROM organizations WHERE id = $1`, [tenantId]);
    });
    await prisma.$disconnect();
  }, 60000);

  it("1. Parallel concurrent handoff calls resolve idempotently to the same Offer", async () => {
    const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

    const [h1, h2] = await Promise.all([
      prisma.$transaction(async (tx) => handoffOutcomeToOffer(tx, staffCtx, { applicationId: appId1 })),
      prisma.$transaction(async (tx) => handoffOutcomeToOffer(tx, staffCtx, { applicationId: appId1 })),
    ]);

    expect(h1.offer.id).toBe(offer1Id);
    expect(h2.offer.id).toBe(offer1Id);

    const count = await prisma.offer.count({ where: { applicationId: appId1 } });
    expect(count).toBe(1);
  });

  it("2. Parallel candidate ACCEPT executions serialize cleanly via row locking", async () => {
    const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

    const [d1, d2] = await Promise.all([
      prisma.$transaction(async (tx) =>
        recordAuthoritativeCandidateDecision(tx, candCtx, {
          offerId: offer1Id,
          offerVersionId: offer1V1Id,
          decisionType: OfferDecisionType.ACCEPT,
        })
      ),
      prisma.$transaction(async (tx) =>
        recordAuthoritativeCandidateDecision(tx, candCtx, {
          offerId: offer1Id,
          offerVersionId: offer1V1Id,
          decisionType: OfferDecisionType.ACCEPT,
        })
      ),
    ]);

    expect(d1.offer.status).toBe(OfferStatus.ACCEPTED);
    expect(d2.offer.status).toBe(OfferStatus.ACCEPTED);

    const decisionCount = await prisma.offerDecision.count({
      where: { offerId: offer1Id, decisionType: OfferDecisionType.ACCEPT },
    });
    expect(decisionCount).toBe(1);
  });

  it("3. Parallel verifyPlacement executions serialize and prevent duplicate placement records", async () => {
    const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

    const [p1, p2] = await Promise.all([
      prisma.$transaction(async (tx) =>
        verifyPlacement(tx, staffCtx, {
          offerId: offer1Id,
          verifiedStartDate: new Date("2026-12-01"),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: docId,
        })
      ),
      prisma.$transaction(async (tx) =>
        verifyPlacement(tx, staffCtx, {
          offerId: offer1Id,
          verifiedStartDate: new Date("2026-12-01"),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: docId,
        })
      ),
    ]);

    expect(p1.placement.firstDayConfirmed).toBe(true);
    expect(p2.placement.firstDayConfirmed).toBe(true);

    const placementCount = await prisma.placementRecord.count({
      where: { offerId: offer1Id },
    });
    expect(placementCount).toBe(1);
  });
});
