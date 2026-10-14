/**
 * Phase 9C — LIVE PostgreSQL FORCE RLS / IDOR & Immutability Verification
 * Uses real DATABASE_URL/DIRECT_URL and oos_app_runtime role with request.jwt.claim.sub.
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
import {
  OfferStatus,
  OfferVerificationState,
  OfferProvenanceType,
  OfferDecisionType,
  NegotiationEventType,
  NegotiationStatus,
  JoiningStatus,
} from "@/lib/opos/types";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9C — Live PostgreSQL RLS & Isolation Matrix", () => {
  // Test Tenants
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  // Test Users
  const userCandA = randomUUID();
  const userCandB = randomUUID();
  const userEmpA = randomUUID();
  const userTeamLeadA = randomUUID();
  const userManagerA = randomUUID();
  const userAdminA = randomUUID();
  const userAdminB = randomUUID();
  const userStranger = randomUUID();

  // Test Candidate Entities
  const candAId = randomUUID();
  const candBId = randomUUID();

  // Test Job & Application
  const jobAId = randomUUID();
  const appAId = randomUUID();
  const docAId = randomUUID();

  // Test OPOS Entities for Candidate A
  const offerAId = randomUUID();
  const offerVersionAId = randomUUID();
  const negotiationAId = randomUUID();
  const eventAId = randomUUID();
  const decisionAId = randomUUID();
  const joiningAId = randomUUID();
  const placementAId = randomUUID();
  const evidenceAId = randomUUID();

  // Test OPOS Entities for Candidate B
  const jobBId = randomUUID();
  const appBId = randomUUID();
  const docBId = randomUUID();
  const offerBId = randomUUID();
  const offerVersionBId = randomUUID();
  const negotiationBId = randomUUID();
  const eventBId = randomUUID();
  const decisionBId = randomUUID();
  const joiningBId = randomUUID();
  const placementBId = randomUUID();
  const evidenceBId = randomUUID();

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // 1. Orgs
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
         VALUES ($1, 'OPOS Live Org A', $2, 'ACTIVE', NOW(), NOW()),
                ($3, 'OPOS Live Org B', $4, 'ACTIVE', NOW(), NOW())`,
        [tenantAId, `opos-a-${tenantAId.slice(0, 8)}`, tenantBId, `opos-b-${tenantBId.slice(0, 8)}`]
      );

      // 2. Users
      const users = [
        [userCandA, `cand-a-${userCandA.slice(0, 8)}@test.com`],
        [userCandB, `cand-b-${userCandB.slice(0, 8)}@test.com`],
        [userEmpA, `emp-a-${userEmpA.slice(0, 8)}@test.com`],
        [userTeamLeadA, `tl-a-${userTeamLeadA.slice(0, 8)}@test.com`],
        [userManagerA, `mgr-a-${userManagerA.slice(0, 8)}@test.com`],
        [userAdminA, `admin-a-${userAdminA.slice(0, 8)}@test.com`],
        [userAdminB, `admin-b-${userAdminB.slice(0, 8)}@test.com`],
        [userStranger, `stranger-${userStranger.slice(0, 8)}@test.com`],
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
        [tenantAId, userCandA, 'CANDIDATE'],
        [tenantAId, userCandB, 'CANDIDATE'],
        [tenantAId, userEmpA, 'EMPLOYEE'],
        [tenantAId, userTeamLeadA, 'EMPLOYEE'],
        [tenantAId, userManagerA, 'EMPLOYEE'],
        [tenantAId, userAdminA, 'ADMIN'],
        [tenantBId, userAdminB, 'ADMIN'],
      ] as const;

      for (const [orgId, uId, role] of memberships) {
        await c.query(
          `INSERT INTO memberships (id, "organizationId", "userId", role, status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())`,
          [randomUUID(), orgId, uId, role]
        );
      }

      // 4. Candidates
      await c.query(
        `INSERT INTO candidates (id, "organizationId", "userId", status, "verificationStatus", country, "workAuthorization", "salaryCurrency", application_authorization_mode, "createdAt", "updatedAt")
         VALUES
         ($1, $2, $3, 'ACTIVE', 'UNVERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', NOW(), NOW()),
         ($4, $5, $6, 'ACTIVE', 'UNVERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', NOW(), NOW())`,
        [candAId, tenantAId, userCandA, candBId, tenantAId, userCandB]
      );

      // 5. Jobs & Applications
      await c.query(
        `INSERT INTO jobs (id, "organizationId", title, "companyName", "jobDescription", location, "isRemote", "employmentType", status, visibility, "createdById", "createdAt", "updatedAt")
         VALUES
         ($1, $2, 'Staff Engineer A', 'Acme Corp', 'JD A', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $3, NOW(), NOW()),
         ($4, $5, 'Staff Engineer B', 'Beta Corp', 'JD B', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $6, NOW(), NOW())`,
        [jobAId, tenantAId, userAdminA, jobBId, tenantAId, userAdminA]
      );

      await c.query(
        `INSERT INTO applications (id, "organizationId", "candidateId", "jobId", status, "createdAt", "updatedAt")
         VALUES
         ($1, $2, $3, $4, 'DISCOVERED', NOW(), NOW()),
         ($5, $6, $7, $8, 'DISCOVERED', NOW(), NOW())`,
        [appAId, tenantAId, candAId, jobAId, appBId, tenantAId, candBId, jobBId]
      );

      // 6. Candidate Documents
      await c.query(
        `INSERT INTO candidate_documents (id, "candidateId", title, "storagePath", "fileSizeBytes", "mimeType", "uploadedBy", "createdAt", "updatedAt")
         VALUES
         ($1, $2, 'offer_a.pdf', 'offers/candA/offer.pdf', 1024, 'application/pdf', $3, NOW(), NOW()),
         ($4, $5, 'offer_b.pdf', 'offers/candB/offer.pdf', 1024, 'application/pdf', $6, NOW(), NOW())`,
        [docAId, candAId, userCandA, docBId, candBId, userCandB]
      );

      // 7. Seed OPOS for Candidate A
      await c.query(
        `INSERT INTO offers (id, "organizationId", "candidateId", "applicationId", "jobId", status, "currentVersionNumber", "verificationState", "internalStaffNotes", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'OFFER_RECEIVED', 1, 'UNVERIFIED', 'CONFIDENTIAL_NOTE_A', NOW(), NOW())`,
        [offerAId, tenantAId, candAId, appAId, jobAId]
      );

      await c.query(
        `INSERT INTO offer_versions (id, "offerId", "organizationId", "versionNumber", "roleTitle", "baseSalaryAmount", "baseSalaryCurrency", provenance, "createdAt")
         VALUES ($1, $2, $3, 1, 'Staff Engineer', 200000, 'USD', 'CANDIDATE_PROVIDED', NOW())`,
        [offerVersionAId, offerAId, tenantAId]
      );

      await c.query(
        `INSERT INTO negotiations (id, "offerId", "organizationId", status, "candidateTargetBase", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'STRATEGY_PENDING', 220000, NOW(), NOW())`,
        [negotiationAId, offerAId, tenantAId]
      );

      await c.query(
        `INSERT INTO negotiation_events (id, "negotiationId", "organizationId", "offerVersionId", "roundNumber", "eventType", "actorUserId", "actorRole", provenance, "recordedAt")
         VALUES ($1, $2, $3, $4, 1, 'CANDIDATE_TARGET_SET', $5, 'CANDIDATE', 'CANDIDATE_PROVIDED', NOW())`,
        [eventAId, negotiationAId, tenantAId, offerVersionAId, userCandA]
      );

      await c.query(
        `INSERT INTO offer_decisions (id, "offerId", "offerVersionId", "organizationId", "candidateId", "actorUserId", "decisionType", provenance, "executedAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPT', 'CANDIDATE_PROVIDED', NOW(), NOW())`,
        [decisionAId, offerAId, offerVersionAId, tenantAId, candAId, userCandA]
      );

      await c.query(
        `INSERT INTO joining_records (id, "offerId", "organizationId", "candidateId", "applicationId", status, "scheduledStartDate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'JOINING_PLANNED', NOW() + interval '30 days', NOW(), NOW())`,
        [joiningAId, offerAId, tenantAId, candAId, appAId]
      );

      await c.query(
        `INSERT INTO placement_records (id, "offerId", "joiningId", "organizationId", "candidateId", "applicationId", "verifiedStartDate", "verifiedById", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, NOW(), NOW())`,
        [placementAId, offerAId, joiningAId, tenantAId, candAId, appAId, userAdminA]
      );

      await c.query(
        `INSERT INTO offer_evidence (id, "offerId", "offerVersionId", "organizationId", "candidateId", "candidateDocumentId", "documentType", "storagePath", "uploadedById", "uploadedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'OFFER_LETTER', 'offers/candA/offer.pdf', $7, NOW())`,
        [evidenceAId, offerAId, offerVersionAId, tenantAId, candAId, docAId, userCandA]
      );

      // 8. Seed OPOS for Candidate B
      await c.query(
        `INSERT INTO offers (id, "organizationId", "candidateId", "applicationId", "jobId", status, "currentVersionNumber", "verificationState", "internalStaffNotes", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'OFFER_RECEIVED', 1, 'UNVERIFIED', 'CONFIDENTIAL_NOTE_B', NOW(), NOW())`,
        [offerBId, tenantAId, candBId, appBId, jobBId]
      );

      await c.query(
        `INSERT INTO offer_versions (id, "offerId", "organizationId", "versionNumber", "roleTitle", "baseSalaryAmount", "baseSalaryCurrency", provenance, "createdAt")
         VALUES ($1, $2, $3, 1, 'Staff Engineer B', 190000, 'USD', 'CANDIDATE_PROVIDED', NOW())`,
        [offerVersionBId, offerBId, tenantAId]
      );

      await c.query(
        `INSERT INTO negotiations (id, "offerId", "organizationId", status, "candidateTargetBase", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'STRATEGY_PENDING', 210000, NOW(), NOW())`,
        [negotiationBId, offerBId, tenantAId]
      );

      await c.query(
        `INSERT INTO negotiation_events (id, "negotiationId", "organizationId", "offerVersionId", "roundNumber", "eventType", "actorUserId", "actorRole", provenance, "recordedAt")
         VALUES ($1, $2, $3, $4, 1, 'CANDIDATE_TARGET_SET', $5, 'CANDIDATE', 'CANDIDATE_PROVIDED', NOW())`,
        [eventBId, negotiationBId, tenantAId, offerVersionBId, userCandB]
      );

      await c.query(
        `INSERT INTO offer_decisions (id, "offerId", "offerVersionId", "organizationId", "candidateId", "actorUserId", "decisionType", provenance, "executedAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPT', 'CANDIDATE_PROVIDED', NOW(), NOW())`,
        [decisionBId, offerBId, offerVersionBId, tenantAId, candBId, userCandB]
      );

      await c.query(
        `INSERT INTO joining_records (id, "offerId", "organizationId", "candidateId", "applicationId", status, "scheduledStartDate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'JOINING_PLANNED', NOW() + interval '30 days', NOW(), NOW())`,
        [joiningBId, offerBId, tenantAId, candBId, appBId]
      );

      await c.query(
        `INSERT INTO placement_records (id, "offerId", "joiningId", "organizationId", "candidateId", "applicationId", "verifiedStartDate", "verifiedById", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, NOW(), NOW())`,
        [placementBId, offerBId, joiningBId, tenantAId, candBId, appBId, userAdminA]
      );

      await c.query(
        `INSERT INTO offer_evidence (id, "offerId", "offerVersionId", "organizationId", "candidateId", "candidateDocumentId", "documentType", "storagePath", "uploadedById", "uploadedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'OFFER_LETTER', 'offers/candB/offer.pdf', $7, NOW())`,
        [evidenceBId, offerBId, offerVersionBId, tenantAId, candBId, docBId, userCandB]
      );
    });
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    await withBypassClient(async (c) => {
      await c.query(`DELETE FROM offer_evidence WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM placement_records WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM joining_records WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM offer_decisions WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM negotiation_events WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM negotiations WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM offer_versions WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM offers WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM candidate_documents WHERE "candidateId" = ANY($1::uuid[])`, [[candAId, candBId]]);
      await c.query(`DELETE FROM applications WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM jobs WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM candidates WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM memberships WHERE "organizationId" = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userCandA, userCandB, userEmpA, userTeamLeadA, userManagerA, userAdminA, userAdminB, userStranger]]);
      await c.query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [[tenantAId, tenantBId]]);
    });
  }, 60000);

  describe("1. Candidate Isolation via Live PostgreSQL Session RLS", () => {
    it("Candidate A: ALLOW access to own Offer, OfferVersion, Decision, Evidence, Joining, Placement", async () => {
      await withRuntimeRlsAsUser(userCandA, async (c) => {
        const offer = await c.query(`SELECT id FROM offers WHERE id = $1`, [offerAId]);
        expect(offer.rows).toHaveLength(1);

        const version = await c.query(`SELECT id FROM offer_versions WHERE id = $1`, [offerVersionAId]);
        expect(version.rows).toHaveLength(1);

        const decision = await c.query(`SELECT id FROM offer_decisions WHERE id = $1`, [decisionAId]);
        expect(decision.rows).toHaveLength(1);

        const evidence = await c.query(`SELECT id FROM offer_evidence WHERE id = $1`, [evidenceAId]);
        expect(evidence.rows).toHaveLength(1);

        const negotiation = await c.query(`SELECT id FROM negotiations WHERE id = $1`, [negotiationAId]);
        expect(negotiation.rows).toHaveLength(1);

        const event = await c.query(`SELECT id FROM negotiation_events WHERE id = $1`, [eventAId]);
        expect(event.rows).toHaveLength(1);

        const joining = await c.query(`SELECT id FROM joining_records WHERE id = $1`, [joiningAId]);
        expect(joining.rows).toHaveLength(1);

        const placement = await c.query(`SELECT id FROM placement_records WHERE id = $1`, [placementAId]);
        expect(placement.rows).toHaveLength(1);
      });
    });

    it("Candidate A: DENY access to Candidate B Offer, OfferVersion, Decision, Evidence (Direct-ID Attacks return 0 rows)", async () => {
      await withRuntimeRlsAsUser(userCandA, async (c) => {
        const offer = await c.query(`SELECT id FROM offers WHERE id = $1`, [offerBId]);
        expect(offer.rows).toHaveLength(0);

        const version = await c.query(`SELECT id FROM offer_versions WHERE id = $1`, [offerVersionBId]);
        expect(version.rows).toHaveLength(0);

        const decision = await c.query(`SELECT id FROM offer_decisions WHERE id = $1`, [decisionBId]);
        expect(decision.rows).toHaveLength(0);

        const evidence = await c.query(`SELECT id FROM offer_evidence WHERE id = $1`, [evidenceBId]);
        expect(evidence.rows).toHaveLength(0);

        const negotiation = await c.query(`SELECT id FROM negotiations WHERE id = $1`, [negotiationBId]);
        expect(negotiation.rows).toHaveLength(0);

        const event = await c.query(`SELECT id FROM negotiation_events WHERE id = $1`, [eventBId]);
        expect(event.rows).toHaveLength(0);

        const joining = await c.query(`SELECT id FROM joining_records WHERE id = $1`, [joiningBId]);
        expect(joining.rows).toHaveLength(0);

        const placement = await c.query(`SELECT id FROM placement_records WHERE id = $1`, [placementBId]);
        expect(placement.rows).toHaveLength(0);
      });
    });
  });

  describe("2. Cross-Tenant Isolation via Live PostgreSQL Session RLS", () => {
    it("Tenant A Admin: ALLOW access to Tenant A Offer and OPOS records", async () => {
      await withRuntimeRlsAsUser(userAdminA, async (c) => {
        const offer = await c.query(`SELECT id FROM offers WHERE id = $1`, [offerAId]);
        expect(offer.rows).toHaveLength(1);

        const version = await c.query(`SELECT id FROM offer_versions WHERE id = $1`, [offerVersionAId]);
        expect(version.rows).toHaveLength(1);

        const decisions = await c.query(`SELECT id FROM offer_decisions WHERE "organizationId" = $1`, [tenantAId]);
        expect(decisions.rows.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("Tenant B Admin: DENY access to Tenant A Offer and OPOS records (Cross-tenant Direct-ID returns 0 rows)", async () => {
      await withRuntimeRlsAsUser(userAdminB, async (c) => {
        const offer = await c.query(`SELECT id FROM offers WHERE id = $1`, [offerAId]);
        expect(offer.rows).toHaveLength(0);

        const version = await c.query(`SELECT id FROM offer_versions WHERE id = $1`, [offerVersionAId]);
        expect(version.rows).toHaveLength(0);

        const decisions = await c.query(`SELECT id FROM offer_decisions WHERE "organizationId" = $1`, [tenantAId]);
        expect(decisions.rows).toHaveLength(0);

        const joining = await c.query(`SELECT id FROM joining_records WHERE id = $1`, [joiningAId]);
        expect(joining.rows).toHaveLength(0);

        const placement = await c.query(`SELECT id FROM placement_records WHERE id = $1`, [placementAId]);
        expect(placement.rows).toHaveLength(0);
      });
    });
  });

  describe("3. Staff, Employee & Unauthorized Scope via Live PostgreSQL Session RLS", () => {
    it("Authorized Employee in Tenant A: ALLOW access to OPOS records in same tenant", async () => {
      await withRuntimeRlsAsUser(userEmpA, async (c) => {
        const offer = await c.query(`SELECT id FROM offers WHERE id = $1`, [offerAId]);
        expect(offer.rows).toHaveLength(1);

        const version = await c.query(`SELECT id FROM offer_versions WHERE id = $1`, [offerVersionAId]);
        expect(version.rows).toHaveLength(1);
      });
    });

    it("Unauthorized Stranger (no membership): DENIED access to all OPOS records", async () => {
      await withRuntimeRlsAsUser(userStranger, async (c) => {
        const offer = await c.query(`SELECT id FROM offers WHERE id = $1`, [offerAId]);
        expect(offer.rows).toHaveLength(0);

        const version = await c.query(`SELECT id FROM offer_versions WHERE id = $1`, [offerVersionAId]);
        expect(version.rows).toHaveLength(0);

        const decisions = await c.query(`SELECT id FROM offer_decisions WHERE id = $1`, [decisionAId]);
        expect(decisions.rows).toHaveLength(0);
      });
    });
  });

  describe("4. Direct-ID Attack Matrix Across All 8 OPOS Entities", () => {
    it("Direct-ID Attack on all 8 OPOS entities from an unauthorized user returns 0 rows", async () => {
      await withRuntimeRlsAsUser(userStranger, async (c) => {
        const e1 = await c.query(`SELECT id FROM offers WHERE id = $1`, [offerAId]);
        expect(e1.rows).toHaveLength(0);

        const e2 = await c.query(`SELECT id FROM offer_versions WHERE id = $1`, [offerVersionAId]);
        expect(e2.rows).toHaveLength(0);

        const e3 = await c.query(`SELECT id FROM negotiations WHERE id = $1`, [negotiationAId]);
        expect(e3.rows).toHaveLength(0);

        const e4 = await c.query(`SELECT id FROM negotiation_events WHERE id = $1`, [eventAId]);
        expect(e4.rows).toHaveLength(0);

        const e5 = await c.query(`SELECT id FROM offer_decisions WHERE id = $1`, [decisionAId]);
        expect(e5.rows).toHaveLength(0);

        const e6 = await c.query(`SELECT id FROM joining_records WHERE id = $1`, [joiningAId]);
        expect(e6.rows).toHaveLength(0);

        const e7 = await c.query(`SELECT id FROM placement_records WHERE id = $1`, [placementAId]);
        expect(e7.rows).toHaveLength(0);

        const e8 = await c.query(`SELECT id FROM offer_evidence WHERE id = $1`, [evidenceAId]);
        expect(e8.rows).toHaveLength(0);
      });
    });
  });

  describe("5. Historical Immutability & Unique Constraints Invariants", () => {
    it("OfferVersion: enforces unique constraint on (offerId, versionNumber)", async () => {
      await expect(
        withBypassClient(async (c) => {
          await c.query(
            `INSERT INTO offer_versions (id, "offerId", "organizationId", "versionNumber", "roleTitle", "baseSalaryAmount", "baseSalaryCurrency", provenance, "createdAt")
             VALUES ($1, $2, $3, 1, 'Duplicate Version', 250000, 'USD', 'CANDIDATE_PROVIDED', NOW())`,
            [randomUUID(), offerAId, tenantAId]
          );
        })
      ).rejects.toThrow();
    });

    it("Negotiation: enforces 1-to-1 unique constraint per offer", async () => {
      await expect(
        withBypassClient(async (c) => {
          await c.query(
            `INSERT INTO negotiations (id, "offerId", "organizationId", status, "candidateTargetBase", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 'STRATEGY_PENDING', 260000, NOW(), NOW())`,
            [randomUUID(), offerAId, tenantAId]
          );
        })
      ).rejects.toThrow();
    });

    it("JoiningRecord: enforces 1-to-1 unique constraint per offer", async () => {
      await expect(
        withBypassClient(async (c) => {
          await c.query(
            `INSERT INTO joining_records (id, "offerId", "organizationId", "candidateId", "applicationId", status, "scheduledStartDate", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, 'JOINING_PLANNED', NOW() + interval '30 days', NOW(), NOW())`,
            [randomUUID(), offerAId, tenantAId, candAId, appAId]
          );
        })
      ).rejects.toThrow();
    });

    it("PlacementRecord: enforces 1-to-1 unique constraint per offer and joiningRecord", async () => {
      await expect(
        withBypassClient(async (c) => {
          await c.query(
            `INSERT INTO placement_records (id, "offerId", "joiningId", "organizationId", "candidateId", "applicationId", "verifiedStartDate", "verifiedById", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, NOW(), NOW())`,
            [randomUUID(), offerAId, joiningAId, tenantAId, candAId, appAId, userAdminA]
          );
        })
      ).rejects.toThrow();
    });
  });
});
