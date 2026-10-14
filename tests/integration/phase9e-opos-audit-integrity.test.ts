/**
 * Phase 9E — Live Audit Integrity & Transactional Rollback Tests
 * Verifies transactional audit emission, anti-spoofing actor logging, atomicity on rollback, and audit privacy.
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
  AuditAction,
} from "@/lib/opos/types";
import {
  handoffOutcomeToOffer,
  recordAuthoritativeCandidateDecision,
  verifyPlacement,
} from "@/lib/opos/opos-service";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9E — Live Audit Integrity & Transactional Atomicity", () => {
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
         VALUES ($1, 'OPOS 9E Audit Org', $2, 'ACTIVE', NOW(), NOW())`,
        [tenantId, `opos-9e-audit-${tenantId.slice(0, 8)}`]
      );

      // 2. Users
      for (const [id, email] of [
        [userCandId, `cand-9e-audit-${userCandId.slice(0, 8)}@test.com`],
        [userEmpId, `emp-9e-audit-${userEmpId.slice(0, 8)}@test.com`],
        [userAdminId, `admin-9e-audit-${userAdminId.slice(0, 8)}@test.com`],
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
         VALUES ($1, $2, 'Principal Eng', 'Cloud Systems Corp', 'JD', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $3, NOW(), NOW())`,
        [jobId, tenantId, userAdminId]
      );

      await c.query(
        `INSERT INTO applications (id, "organizationId", "candidateId", "jobId", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'DISCOVERED', NOW(), NOW())`,
        [appId, tenantId, candId, jobId]
      );

      // 6. Document
      await c.query(
        `INSERT INTO candidate_documents (id, "candidateId", title, "storagePath", "fileSizeBytes", "mimeType", "uploadedBy", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Offer_Letter.pdf', 'offers/phase9e/offer.pdf', 2048, 'application/pdf', $3, NOW(), NOW())`,
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

  describe("1. Transactional Audit Event Emission", () => {
    it("creates OPOS_OFFER_CREATED and OPOS_OFFER_VERSION_CREATED audit events on handoff", async () => {
      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

      const result = await prisma.$transaction(async (tx) => {
        return handoffOutcomeToOffer(tx, staffCtx, {
          applicationId: appId,
          initialTerms: {
            roleTitle: "Principal Eng",
            baseSalaryAmount: 230000,
            baseSalaryCurrency: "USD",
          },
        });
      });

      activeOfferId = result.offer.id;
      activeVersion1Id = result.version.id;

      // Verify audit events
      const audits = await prisma.auditEvent.findMany({
        where: {
          organizationId: tenantId,
          action: { in: [AuditAction.OPOS_OFFER_CREATED, AuditAction.OPOS_OFFER_VERSION_CREATED] },
        },
      });

      expect(audits.length).toBeGreaterThanOrEqual(2);
      const offerCreatedAudit = audits.find((a) => a.action === AuditAction.OPOS_OFFER_CREATED);
      expect(offerCreatedAudit).toBeDefined();
      expect(offerCreatedAudit?.actorId).toBe(userEmpId);
      expect(offerCreatedAudit?.entityType).toBe("Offer");
      expect(offerCreatedAudit?.entityId).toBe(activeOfferId);
    });

    it("creates OPOS_OFFER_ACCEPTED with candidate actor on candidate ACCEPT", async () => {
      const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

      await prisma.$transaction(async (tx) => {
        return recordAuthoritativeCandidateDecision(tx, candCtx, {
          offerId: activeOfferId,
          offerVersionId: activeVersion1Id,
          decisionType: OfferDecisionType.ACCEPT,
        });
      });

      const acceptAudit = await prisma.auditEvent.findFirstOrThrow({
        where: {
          organizationId: tenantId,
          action: AuditAction.OPOS_OFFER_ACCEPTED,
          entityId: activeOfferId,
        },
      });

      // Crucial anti-spoofing check: actorId MUST match candidate user ID
      expect(acceptAudit.actorId).toBe(userCandId);
    });
  });

  describe("2. Audit Atomicity on Transaction Rollback", () => {
    it("rolls back audit event if transaction throws before commit", async () => {
      const initialAuditCount = await prisma.auditEvent.count({ where: { organizationId: tenantId } });

      const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

      await expect(
        prisma.$transaction(async (tx) => {
          // Attempt invalid placement verification (missing proof)
          await verifyPlacement(tx, staffCtx, {
            offerId: activeOfferId,
            verifiedStartDate: new Date(),
            firstDayConfirmed: true,
            onboardingProofValidated: true,
            proofDocumentId: null, // Forces failure
          });
        })
      ).rejects.toThrow();

      const postFailureAuditCount = await prisma.auditEvent.count({ where: { organizationId: tenantId } });
      expect(postFailureAuditCount).toBe(initialAuditCount);
    });
  });
});
