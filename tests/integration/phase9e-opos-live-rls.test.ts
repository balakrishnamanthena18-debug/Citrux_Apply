/**
 * Phase 9E — LIVE PostgreSQL RLS & FORCE RLS Forensic Verification
 * Adversarially audits all 8 OPOS tables, catalogs, grants, and SECURITY DEFINER functions
 * using real database connections with oos_app_runtime and request.jwt.claim.sub.
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

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9E — Live PostgreSQL FORCE RLS & Security Definer Forensic", () => {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  const userCandA = randomUUID();
  const userCandB = randomUUID();
  const userEmpA = randomUUID();
  const userAdminA = randomUUID();
  const userAdminB = randomUUID();
  const userStranger = randomUUID();

  const candAId = randomUUID();
  const candBId = randomUUID();
  const jobAId = randomUUID();
  const jobBId = randomUUID();
  const appAId = randomUUID();
  const appBId = randomUUID();
  const docAId = randomUUID();
  const docBId = randomUUID();

  const offerAId = randomUUID();
  const offerBId = randomUUID();
  const offerVersionAId = randomUUID();
  const offerVersionBId = randomUUID();
  const negotiationAId = randomUUID();
  const negotiationBId = randomUUID();
  const eventAId = randomUUID();
  const eventBId = randomUUID();
  const decisionAId = randomUUID();
  const decisionBId = randomUUID();
  const joiningAId = randomUUID();
  const joiningBId = randomUUID();
  const placementAId = randomUUID();
  const placementBId = randomUUID();
  const evidenceAId = randomUUID();
  const evidenceBId = randomUUID();

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // 1. Orgs
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
         VALUES ($1, 'OPOS 9E Org A', $2, 'ACTIVE', NOW(), NOW()),
                ($3, 'OPOS 9E Org B', $4, 'ACTIVE', NOW(), NOW())`,
        [tenantAId, `opos-9e-a-${tenantAId.slice(0, 8)}`, tenantBId, `opos-9e-b-${tenantBId.slice(0, 8)}`]
      );

      // 2. Users
      const users = [
        [userCandA, `cand-9e-a-${userCandA.slice(0, 8)}@test.com`],
        [userCandB, `cand-9e-b-${userCandB.slice(0, 8)}@test.com`],
        [userEmpA, `emp-9e-a-${userEmpA.slice(0, 8)}@test.com`],
        [userAdminA, `admin-9e-a-${userAdminA.slice(0, 8)}@test.com`],
        [userAdminB, `admin-9e-b-${userAdminB.slice(0, 8)}@test.com`],
        [userStranger, `stranger-9e-${userStranger.slice(0, 8)}@test.com`],
      ] as const;

      for (const [id, email] of users) {
        await c.query(
          `INSERT INTO users (id, email, status, "createdAt", "updatedAt")
           VALUES ($1, $2, 'ACTIVE', NOW(), NOW())`,
          [id, email]
        );
      }

      // 3. Memberships
      const memberships = [
        [userCandA, tenantAId, "CANDIDATE"],
        [userCandB, tenantBId, "CANDIDATE"],
        [userEmpA, tenantAId, "EMPLOYEE"],
        [userAdminA, tenantAId, "ADMIN"],
        [userAdminB, tenantBId, "ADMIN"],
      ] as const;

      for (const [uId, oId, role] of memberships) {
        await c.query(
          `INSERT INTO memberships (id, "organizationId", "userId", role, status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())`,
          [randomUUID(), oId, uId, role]
        );
      }

      // 4. Candidates
      await c.query(
        `INSERT INTO candidates (id, "organizationId", "userId", status, "verificationStatus", country, "workAuthorization", "salaryCurrency", application_authorization_mode, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'ACTIVE', 'UNVERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', NOW(), NOW()),
                ($4, $5, $6, 'ACTIVE', 'UNVERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', NOW(), NOW())`,
        [candAId, tenantAId, userCandA, candBId, tenantBId, userCandB]
      );

      // 5. Jobs & Applications
      await c.query(
        `INSERT INTO jobs (id, "organizationId", title, "companyName", "jobDescription", location, "isRemote", "employmentType", status, visibility, "createdById", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Role A', 'Company A', 'JD A', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $3, NOW(), NOW()),
                ($4, $5, 'Role B', 'Company B', 'JD B', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $6, NOW(), NOW())`,
        [jobAId, tenantAId, userAdminA, jobBId, tenantBId, userAdminB]
      );

      await c.query(
        `INSERT INTO applications (id, "organizationId", "candidateId", "jobId", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'DISCOVERED', NOW(), NOW()),
                ($5, $6, $7, $8, 'DISCOVERED', NOW(), NOW())`,
        [appAId, tenantAId, candAId, jobAId, appBId, tenantBId, candBId, jobBId]
      );

      // 6. Documents
      await c.query(
        `INSERT INTO candidate_documents (id, "candidateId", title, "storagePath", "fileSizeBytes", "mimeType", "uploadedBy", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Doc A.pdf', 'path/a.pdf', 1024, 'application/pdf', $3, NOW(), NOW()),
                ($4, $5, 'Doc B.pdf', 'path/b.pdf', 1024, 'application/pdf', $6, NOW(), NOW())`,
        [docAId, candAId, userCandA, docBId, candBId, userCandB]
      );

      // 7. Seed Full OPOS Graph for Tenant A
      await c.query(
        `INSERT INTO offers (id, "organizationId", "applicationId", "candidateId", "jobId", status, "currentVersionNumber", "verificationState", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', 1, 'VERIFIED', NOW(), NOW())`,
        [offerAId, tenantAId, appAId, candAId, jobAId]
      );

      await c.query(
        `INSERT INTO offer_versions (id, "offerId", "organizationId", "versionNumber", provenance, "roleTitle", "baseSalaryAmount", "baseSalaryCurrency", "paymentFrequency", "createdAt")
         VALUES ($1, $2, $3, 1, 'EMPLOYEE_RECORDED', 'Staff Eng', 200000, 'USD', 'ANNUAL', NOW())`,
        [offerVersionAId, offerAId, tenantAId]
      );

      await c.query(
        `INSERT INTO negotiations (id, "offerId", "organizationId", status, "activeRoundNumber", "candidateTargetBase", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'STRATEGY_PENDING', 1, 220000, NOW(), NOW())`,
        [negotiationAId, offerAId, tenantAId]
      );

      await c.query(
        `INSERT INTO negotiation_events (id, "negotiationId", "organizationId", "roundNumber", "eventType", "actorUserId", "actorRole", provenance, "eventDetails", "recordedAt")
         VALUES ($1, $2, $3, 1, 'CANDIDATE_TARGET_SET', $4, 'CANDIDATE', 'CANDIDATE_PROVIDED', '{}', NOW())`,
        [eventAId, negotiationAId, tenantAId, userCandA]
      );

      await c.query(
        `INSERT INTO offer_decisions (id, "offerId", "offerVersionId", "organizationId", "candidateId", "actorUserId", "decisionType", provenance, "executedAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPT', 'CANDIDATE_PROVIDED', NOW(), NOW())`,
        [decisionAId, offerAId, offerVersionAId, tenantAId, candAId, userCandA]
      );

      await c.query(
        `INSERT INTO joining_records (id, "offerId", "organizationId", "candidateId", "applicationId", status, "scheduledStartDate", "firstDayConfirmedByCandidate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'JOINING_CONFIRMED', NOW(), true, NOW(), NOW())`,
        [joiningAId, offerAId, tenantAId, candAId, appAId]
      );

      await c.query(
        `INSERT INTO placement_records (id, "offerId", "joiningId", "organizationId", "candidateId", "applicationId", "verifiedStartDate", "verifiedAt", "verifiedById", "firstDayConfirmed", "onboardingProofValidated", "proofDocumentId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, true, true, $8, NOW(), NOW())`,
        [placementAId, offerAId, joiningAId, tenantAId, candAId, appAId, userAdminA, docAId]
      );

      await c.query(
        `INSERT INTO offer_evidence (id, "offerId", "offerVersionId", "organizationId", "candidateId", "candidateDocumentId", "documentType", "storagePath", provenance, "uploadedById", "uploadedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'OFFER_LETTER', 'path/a.pdf', 'EVIDENCE_BACKED', $7, NOW())`,
        [evidenceAId, offerAId, offerVersionAId, tenantAId, candAId, docAId, userCandA]
      );

      // 8. Seed Full OPOS Graph for Tenant B
      await c.query(
        `INSERT INTO offers (id, "organizationId", "applicationId", "candidateId", "jobId", status, "currentVersionNumber", "verificationState", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'DECISION_PENDING', 1, 'UNVERIFIED', NOW(), NOW())`,
        [offerBId, tenantBId, appBId, candBId, jobBId]
      );

      await c.query(
        `INSERT INTO offer_versions (id, "offerId", "organizationId", "versionNumber", provenance, "roleTitle", "baseSalaryAmount", "baseSalaryCurrency", "paymentFrequency", "createdAt")
         VALUES ($1, $2, $3, 1, 'EMPLOYEE_RECORDED', 'Lead Architect', 240000, 'USD', 'ANNUAL', NOW())`,
        [offerVersionBId, offerBId, tenantBId]
      );

      await c.query(
        `INSERT INTO negotiations (id, "offerId", "organizationId", status, "activeRoundNumber", "candidateTargetBase", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'NOT_REQUESTED', 1, null, NOW(), NOW())`,
        [negotiationBId, offerBId, tenantBId]
      );

      await c.query(
        `INSERT INTO negotiation_events (id, "negotiationId", "organizationId", "roundNumber", "eventType", "actorUserId", "actorRole", provenance, "eventDetails", "recordedAt")
         VALUES ($1, $2, $3, 1, 'STRATEGY_NOTES_ADDED', $4, 'ADMIN', 'EMPLOYEE_RECORDED', '{}', NOW())`,
        [eventBId, negotiationBId, tenantBId, userAdminB]
      );

      await c.query(
        `INSERT INTO offer_decisions (id, "offerId", "offerVersionId", "organizationId", "candidateId", "actorUserId", "decisionType", provenance, "executedAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'REQUEST_NEGOTIATION', 'CANDIDATE_PROVIDED', NOW(), NOW())`,
        [decisionBId, offerBId, offerVersionBId, tenantBId, candBId, userCandB]
      );

      await c.query(
        `INSERT INTO joining_records (id, "offerId", "organizationId", "candidateId", "applicationId", status, "scheduledStartDate", "firstDayConfirmedByCandidate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'JOINING_PLANNED', NOW(), false, NOW(), NOW())`,
        [joiningBId, offerBId, tenantBId, candBId, appBId]
      );

      await c.query(
        `INSERT INTO placement_records (id, "offerId", "joiningId", "organizationId", "candidateId", "applicationId", "verifiedStartDate", "verifiedAt", "verifiedById", "firstDayConfirmed", "onboardingProofValidated", "proofDocumentId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, false, false, $8, NOW(), NOW())`,
        [placementBId, offerBId, joiningBId, tenantBId, candBId, appBId, userAdminB, docBId]
      );

      await c.query(
        `INSERT INTO offer_evidence (id, "offerId", "offerVersionId", "organizationId", "candidateId", "candidateDocumentId", "documentType", "storagePath", provenance, "uploadedById", "uploadedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'OFFER_LETTER', 'path/b.pdf', 'EVIDENCE_BACKED', $7, NOW())`,
        [evidenceBId, offerBId, offerVersionBId, tenantBId, candBId, docBId, userCandB]
      );
    });
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    await withBypassClient(async (c) => {
      await c.query(`DELETE FROM placement_records WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM joining_records WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM offer_decisions WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM negotiation_events WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM negotiations WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM offer_evidence WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM offer_versions WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM offers WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM candidate_documents WHERE "candidateId" IN ($1, $2)`, [candAId, candBId]);
      await c.query(`DELETE FROM applications WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM jobs WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM candidates WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM memberships WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
        [userCandA, userCandB, userEmpA, userAdminA, userAdminB, userStranger],
      ]);
      await c.query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [tenantAId, tenantBId]);
    });
    await prisma.$disconnect();
  }, 60000);

  // ==========================================================
  // 1. CATALOG FORENSIC: FORCE RLS & GRANTS
  // ==========================================================

  describe("1. Catalog Forensic: FORCE RLS & Permission Grants on all 8 Tables", () => {
    const OPOS_TABLES = [
      "offers",
      "offer_versions",
      "negotiations",
      "negotiation_events",
      "offer_decisions",
      "joining_records",
      "placement_records",
      "offer_evidence",
    ];

    it("verifies relrowsecurity = true and relforcerowsecurity = true on all 8 OPOS tables", async () => {
      await withBypassClient(async (c) => {
        const res = await c.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
          `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'
             AND c.relname = ANY($1::text[])`,
          [OPOS_TABLES]
        );

        expect(res.rows).toHaveLength(8);
        for (const row of res.rows) {
          expect(row.relrowsecurity, `Table ${row.relname} must have row security enabled`).toBe(true);
          expect(row.relforcerowsecurity, `Table ${row.relname} must have FORCE row security enabled`).toBe(true);
        }
      });
    });

    it("verifies NO DELETE grant exists for oos_app_runtime on OPOS tables", async () => {
      await withBypassClient(async (c) => {
        const res = await c.query<{ table_name: string; privilege_type: string }>(
          `SELECT table_name, privilege_type
           FROM information_schema.role_table_grants
           WHERE grantee = 'oos_app_runtime'
             AND table_name = ANY($1::text[])
             AND privilege_type = 'DELETE'`,
          [OPOS_TABLES]
        );

        // oos_app_runtime should NOT have DELETE privileges on OPOS tables
        expect(res.rows).toHaveLength(0);
      });
    });
  });

  // ==========================================================
  // 2. SECURITY DEFINER FUNCTIONS AUDIT
  // ==========================================================

  describe("2. SECURITY DEFINER Helper Function Audit", () => {
    it("verifies SECURITY DEFINER functions have fixed search_path = public, pg_temp", async () => {
      await withBypassClient(async (c) => {
        const res = await c.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
          `SELECT p.proname, p.prosecdef, p.proconfig
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN (
               'is_org_member',
               'is_offer_candidate_owner',
               'is_offer_version_candidate_owner',
               'is_negotiation_candidate_owner'
             )`
        );

        expect(res.rows.length).toBeGreaterThanOrEqual(4);
        for (const row of res.rows) {
          expect(row.prosecdef, `${row.proname} must be SECURITY DEFINER`).toBe(true);
          expect(row.proconfig).toContain("search_path=public, pg_temp");
        }
      });
    });
  });

  // ==========================================================
  // 3. ADVERSARIAL IDOR & CROSS-TENANT ISOLATION VIA LIVE RLS
  // ==========================================================

  describe("3. Adversarial IDOR & Cross-Tenant Direct-ID Attacks", () => {
    it("Candidate A CANNOT select Candidate B records across any of the 8 OPOS tables", async () => {
      await withRuntimeRlsAsUser(userCandA, async (c) => {
        // Direct-ID attempts on Tenant B records
        const offer = await c.query(`SELECT id FROM offers WHERE id = $1`, [offerBId]);
        expect(offer.rows).toHaveLength(0);

        const version = await c.query(`SELECT id FROM offer_versions WHERE id = $1`, [offerVersionBId]);
        expect(version.rows).toHaveLength(0);

        const negotiation = await c.query(`SELECT id FROM negotiations WHERE id = $1`, [negotiationBId]);
        expect(negotiation.rows).toHaveLength(0);

        const event = await c.query(`SELECT id FROM negotiation_events WHERE id = $1`, [eventBId]);
        expect(event.rows).toHaveLength(0);

        const decision = await c.query(`SELECT id FROM offer_decisions WHERE id = $1`, [decisionBId]);
        expect(decision.rows).toHaveLength(0);

        const joining = await c.query(`SELECT id FROM joining_records WHERE id = $1`, [joiningBId]);
        expect(joining.rows).toHaveLength(0);

        const placement = await c.query(`SELECT id FROM placement_records WHERE id = $1`, [placementBId]);
        expect(placement.rows).toHaveLength(0);

        const evidence = await c.query(`SELECT id FROM offer_evidence WHERE id = $1`, [evidenceBId]);
        expect(evidence.rows).toHaveLength(0);
      });
    });

    it("Tenant B Admin CANNOT select Tenant A records across any OPOS table", async () => {
      await withRuntimeRlsAsUser(userAdminB, async (c) => {
        const offer = await c.query(`SELECT id FROM offers WHERE id = $1`, [offerAId]);
        expect(offer.rows).toHaveLength(0);

        const decision = await c.query(`SELECT id FROM offer_decisions WHERE id = $1`, [decisionAId]);
        expect(decision.rows).toHaveLength(0);

        const placement = await c.query(`SELECT id FROM placement_records WHERE id = $1`, [placementAId]);
        expect(placement.rows).toHaveLength(0);
      });
    });

    it("Unauthorized stranger user returns 0 rows on all OPOS tables", async () => {
      await withRuntimeRlsAsUser(userStranger, async (c) => {
        const offers = await c.query(`SELECT id FROM offers`);
        expect(offers.rows).toHaveLength(0);

        const versions = await c.query(`SELECT id FROM offer_versions`);
        expect(versions.rows).toHaveLength(0);

        const placements = await c.query(`SELECT id FROM placement_records`);
        expect(placements.rows).toHaveLength(0);
      });
    });

    it("Direct SQL DELETE attempt on immutable OPOS tables fails as oos_app_runtime", async () => {
      await withRuntimeRlsAsUser(userAdminA, async (c) => {
        await expect(c.query(`DELETE FROM offer_decisions WHERE id = $1`, [decisionAId])).rejects.toThrow();
        await expect(c.query(`DELETE FROM offer_versions WHERE id = $1`, [offerVersionAId])).rejects.toThrow();
        await expect(c.query(`DELETE FROM negotiation_events WHERE id = $1`, [eventAId])).rejects.toThrow();
      });
    });
  });
});
