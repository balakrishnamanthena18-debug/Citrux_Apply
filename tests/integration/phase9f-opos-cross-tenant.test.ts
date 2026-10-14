/**
 * Phase 9F — LIVE Cross-Tenant Matrix & Combinatorial Attack Tests
 * Attempts mismatched tenant/candidate cross-entity combinations.
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
import { Role, OfferDecisionType } from "@/lib/opos/types";
import {
  handoffOutcomeToOffer,
  recordAuthoritativeCandidateDecision,
  verifyPlacement,
  initiateNegotiation,
} from "@/lib/opos/opos-service";
import { NotFoundError, AuthorizationError, ValidationError } from "@/lib/errors";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9F — Cross-Tenant Combinatorial Attacks", () => {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const userCandAId = randomUUID();
  const userCandBId = randomUUID();
  const userEmpAId = randomUUID();
  const userEmpBId = randomUUID();
  const candAId = randomUUID();
  const candBId = randomUUID();
  const jobAId = randomUUID();
  const jobBId = randomUUID();
  const appAId = randomUUID();
  const appBId = randomUUID();
  const docAId = randomUUID();
  const docBId = randomUUID();

  let offerAId = "";
  let offerBId = "";
  let versionAId = "";
  let versionBId = "";

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // 1. Tenants
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt") VALUES
         ($1, 'Tenant Alpha', $3, 'ACTIVE', NOW(), NOW()),
         ($2, 'Tenant Beta', $4, 'ACTIVE', NOW(), NOW())`,
        [tenantAId, tenantBId, `t-alpha-${tenantAId.slice(0, 8)}`, `t-beta-${tenantBId.slice(0, 8)}`]
      );

      // 2. Users
      await c.query(
        `INSERT INTO users (id, email, status, "createdAt", "updatedAt") VALUES
         ($1, $5, 'ACTIVE', NOW(), NOW()),
         ($2, $6, 'ACTIVE', NOW(), NOW()),
         ($3, $7, 'ACTIVE', NOW(), NOW()),
         ($4, $8, 'ACTIVE', NOW(), NOW())`,
        [
          userCandAId,
          userCandBId,
          userEmpAId,
          userEmpBId,
          `canda-${userCandAId.slice(0, 8)}@test.com`,
          `candb-${userCandBId.slice(0, 8)}@test.com`,
          `empa-${userEmpAId.slice(0, 8)}@test.com`,
          `empb-${userEmpBId.slice(0, 8)}@test.com`,
        ]
      );

      // 3. Memberships
      await c.query(
        `INSERT INTO memberships (id, "organizationId", "userId", role, status, "createdAt", "updatedAt") VALUES
         (gen_random_uuid(), $1, $3, 'CANDIDATE', 'ACTIVE', NOW(), NOW()),
         (gen_random_uuid(), $2, $4, 'CANDIDATE', 'ACTIVE', NOW(), NOW()),
         (gen_random_uuid(), $1, $5, 'EMPLOYEE', 'ACTIVE', NOW(), NOW()),
         (gen_random_uuid(), $2, $6, 'EMPLOYEE', 'ACTIVE', NOW(), NOW())`,
        [tenantAId, tenantBId, userCandAId, userCandBId, userEmpAId, userEmpBId]
      );

      // 4. Candidates
      await c.query(
        `INSERT INTO candidates (id, "organizationId", "userId", status, "verificationStatus", country, "workAuthorization", "salaryCurrency", application_authorization_mode, "createdAt", "updatedAt") VALUES
         ($1, $3, $5, 'ACTIVE', 'UNVERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', NOW(), NOW()),
         ($2, $4, $6, 'ACTIVE', 'UNVERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', NOW(), NOW())`,
        [candAId, candBId, tenantAId, tenantBId, userCandAId, userCandBId]
      );

      // 5. Jobs
      await c.query(
        `INSERT INTO jobs (id, "organizationId", title, "companyName", "jobDescription", location, "isRemote", "employmentType", status, visibility, "createdById", "createdAt", "updatedAt") VALUES
         ($1, $3, 'Security Engineer A', 'Alpha Corp', 'JD', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $5, NOW(), NOW()),
         ($2, $4, 'Security Engineer B', 'Beta Corp', 'JD', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $6, NOW(), NOW())`,
        [jobAId, jobBId, tenantAId, tenantBId, userEmpAId, userEmpBId]
      );

      // 6. Applications
      await c.query(
        `INSERT INTO applications (id, "organizationId", "candidateId", "jobId", status, "createdAt", "updatedAt") VALUES
         ($1, $3, $5, $7, 'SUBMITTED', NOW(), NOW()),
         ($2, $4, $6, $8, 'SUBMITTED', NOW(), NOW())`,
        [appAId, appBId, tenantAId, tenantBId, candAId, candBId, jobAId, jobBId]
      );

      // 7. Candidate Documents
      await c.query(
        `INSERT INTO candidate_documents (id, "candidateId", title, "storagePath", "fileSizeBytes", "mimeType", "uploadedBy", "createdAt", "updatedAt") VALUES
         ($1, $3, 'docA.pdf', 'offers/tA/docA.pdf', 1024, 'application/pdf', $5, NOW(), NOW()),
         ($2, $4, 'docB.pdf', 'offers/tB/docB.pdf', 1024, 'application/pdf', $6, NOW(), NOW())`,
        [docAId, docBId, candAId, candBId, userCandAId, userCandBId]
      );
    });

    // Create Initial Offers for both tenants
    const staffACtx = { userId: userEmpAId, organizationId: tenantAId, role: Role.EMPLOYEE } as any;
    const staffBCtx = { userId: userEmpBId, organizationId: tenantBId, role: Role.EMPLOYEE } as any;

    const resA = await prisma.$transaction(async (tx) =>
      handoffOutcomeToOffer(tx, staffACtx, {
        applicationId: appAId,
        initialTerms: { roleTitle: "Security Engineer A", baseSalaryAmount: 185000 },
      })
    );
    offerAId = resA.offer.id;
    versionAId = resA.version.id;

    const resB = await prisma.$transaction(async (tx) =>
      handoffOutcomeToOffer(tx, staffBCtx, {
        applicationId: appBId,
        initialTerms: { roleTitle: "Security Engineer B", baseSalaryAmount: 195000 },
      })
    );
    offerBId = resB.offer.id;
    versionBId = resB.version.id;
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    await withBypassClient(async (c) => {
      await c.query(`DELETE FROM audit_events WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM joining_records WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM offer_decisions WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM offer_versions WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM offers WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM candidate_documents WHERE "candidateId" IN ($1, $2)`, [candAId, candBId]);
      await c.query(`DELETE FROM applications WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM jobs WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM candidates WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM memberships WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userCandAId, userCandBId, userEmpAId, userEmpBId]]);
      await c.query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [tenantAId, tenantBId]);
    });
    await prisma.$disconnect();
  }, 60000);

  it("1. Candidate A cannot decide on Offer B (Cross-Tenant & Candidate)", async () => {
    const candACtx = { userId: userCandAId, organizationId: tenantAId, role: Role.CANDIDATE } as any;

    await expect(
      prisma.$transaction(async (tx) =>
        recordAuthoritativeCandidateDecision(tx, candACtx, {
          offerId: offerBId, // Tenant B offer
          offerVersionId: versionBId,
          decisionType: OfferDecisionType.ACCEPT,
        })
      )
    ).rejects.toThrow(NotFoundError);
  });

  it("2. Candidate B cannot decide on Offer A under Tenant B context", async () => {
    const candBCtx = { userId: userCandBId, organizationId: tenantBId, role: Role.CANDIDATE } as any;

    await expect(
      prisma.$transaction(async (tx) =>
        recordAuthoritativeCandidateDecision(tx, candBCtx, {
          offerId: offerAId, // Tenant A offer
          offerVersionId: versionAId,
          decisionType: OfferDecisionType.ACCEPT,
        })
      )
    ).rejects.toThrow(NotFoundError);
  });

  it("3. Staff A cannot verify placement on Offer A using Document B (Tenant B document)", async () => {
    const staffACtx = { userId: userEmpAId, organizationId: tenantAId, role: Role.EMPLOYEE } as any;
    const candACtx = { userId: userCandAId, organizationId: tenantAId, role: Role.CANDIDATE } as any;

    // Accept offer A first
    await prisma.$transaction(async (tx) =>
      recordAuthoritativeCandidateDecision(tx, candACtx, {
        offerId: offerAId,
        offerVersionId: versionAId,
        decisionType: OfferDecisionType.ACCEPT,
      })
    );

    // Attempt verify placement with docBId
    await expect(
      prisma.$transaction(async (tx) =>
        verifyPlacement(tx, staffACtx, {
          offerId: offerAId,
          verifiedStartDate: new Date(),
          firstDayConfirmed: true,
          onboardingProofValidated: true,
          proofDocumentId: docBId, // Foreign Document
        })
      )
    ).rejects.toThrow(ValidationError);
  });

  it("4. Staff A cannot initiate negotiation on Offer B", async () => {
    const staffACtx = { userId: userEmpAId, organizationId: tenantAId, role: Role.EMPLOYEE } as any;

    await expect(
      prisma.$transaction(async (tx) =>
        initiateNegotiation(tx, staffACtx, {
          offerId: offerBId,
        })
      )
    ).rejects.toThrow(NotFoundError);
  });
});
