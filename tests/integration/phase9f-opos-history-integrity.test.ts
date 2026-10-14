/**
 * Phase 9F — LIVE Historical Truth Integrity & Non-Rewriting Verification
 * Confirms that historical versions, negotiation events, decisions, and audit trails
 * remain completely immutable and queryable throughout the full lifecycle.
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
import { transitionOffer } from "@/lib/opos/lifecycle";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9F — Historical Truth Integrity & Non-Rewriting", () => {
  const tenantId = randomUUID();
  const userCandId = randomUUID();
  const userEmpId = randomUUID();
  const candId = randomUUID();
  const jobId = randomUUID();
  const appId = randomUUID();
  const docId = randomUUID();

  let offerId = "";
  let version1Id = "";
  let version2Id = "";

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // 1. Org
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
         VALUES ($1, 'History Integrity Org', $2, 'ACTIVE', NOW(), NOW())`,
        [tenantId, `history-org-${tenantId.slice(0, 8)}`]
      );

      // 2. Users
      await c.query(
        `INSERT INTO users (id, email, status, "createdAt", "updatedAt") VALUES
         ($1, $3, 'ACTIVE', NOW(), NOW()),
         ($2, $4, 'ACTIVE', NOW(), NOW())`,
        [
          userCandId,
          userEmpId,
          `candhist-${userCandId.slice(0, 8)}@test.com`,
          `emphist-${userEmpId.slice(0, 8)}@test.com`,
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

      // 5. Job
      await c.query(
        `INSERT INTO jobs (id, "organizationId", title, "companyName", "jobDescription", location, "isRemote", "employmentType", status, visibility, "createdById", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Staff Data Architect', 'DataScale Inc', 'JD', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $3, NOW(), NOW())`,
        [jobId, tenantId, userEmpId]
      );

      // 6. Application
      await c.query(
        `INSERT INTO applications (id, "organizationId", "candidateId", "jobId", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'SUBMITTED', NOW(), NOW())`,
        [appId, tenantId, candId, jobId]
      );

      // 7. Candidate Document
      await c.query(
        `INSERT INTO candidate_documents (id, "candidateId", title, "storagePath", "fileSizeBytes", "mimeType", "uploadedBy", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Verified_Offer.pdf', 'offers/hist/offer.pdf', 2048, 'application/pdf', $3, NOW(), NOW())`,
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
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userCandId, userEmpId]]);
      await c.query(`DELETE FROM organizations WHERE id = $1`, [tenantId]);
    });
    await prisma.$disconnect();
  }, 60000);

  it("executes complete lifecycle and reconstructs complete historical timeline without mutations", async () => {
    const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;
    const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

    // 1. Handoff -> V1
    const res1 = await prisma.$transaction(async (tx) =>
      handoffOutcomeToOffer(tx, staffCtx, {
        applicationId: appId,
        initialTerms: {
          roleTitle: "Staff Data Architect",
          baseSalaryAmount: 200000,
          signOnBonusAmount: 20000,
        },
      })
    );
    offerId = res1.offer.id;
    version1Id = res1.version.id;

    // 2. Negotiation + Event
    await prisma.$transaction(async (tx) => {
      await initiateNegotiation(tx, candCtx, {
        offerId,
        candidateTargetBase: 220000,
      });
      await recordAuthoritativeNegotiationEvent(tx, staffCtx, {
        offerId,
        eventType: NegotiationEventType.EMPLOYER_COUNTER_RECEIVED,
        offerVersionId: version1Id,
        eventDetails: { employerOfferedBase: 215000 },
      });
    });

    // 3. Create V2
    const v2Res = await prisma.$transaction(async (tx) =>
      createAuthoritativeOfferVersion(tx, staffCtx, {
        offerId,
        terms: {
          roleTitle: "Staff Data Architect",
          baseSalaryAmount: 215000,
          signOnBonusAmount: 25000,
        },
      })
    );
    version2Id = v2Res.version.id;

    // 4. Candidate ACCEPT V2
    await prisma.$transaction(async (tx) => {
      await transitionOffer(tx, staffCtx, {
        offerId,
        toStatus: OfferStatus.DECISION_PENDING,
      });
      await recordAuthoritativeCandidateDecision(tx, candCtx, {
        offerId,
        offerVersionId: version2Id,
        decisionType: OfferDecisionType.ACCEPT,
        scheduledStartDate: new Date("2026-11-01"),
      });
    });

    // 5. Day One Confirmation
    await prisma.$transaction(async (tx) =>
      confirmCandidateFirstDay(tx, candCtx, {
        offerId,
        location: "Remote",
      })
    );

    // 6. Placement Verification
    await prisma.$transaction(async (tx) =>
      verifyPlacement(tx, staffCtx, {
        offerId,
        verifiedStartDate: new Date("2026-11-01"),
        firstDayConfirmed: true,
        onboardingProofValidated: true,
        proofDocumentId: docId,
      })
    );

    // ==========================================
    // HISTORICAL RECONSTRUCTION FORENSIC
    // ==========================================

    // Verify V1 is still intact and preserved exactly as recorded
    const v1 = await prisma.offerVersion.findUniqueOrThrow({ where: { id: version1Id } });
    expect(v1.versionNumber).toBe(1);
    expect(v1.baseSalaryAmount).toBe(200000);
    expect(v1.signOnBonusAmount).toBe(20000);
    expect(v1.supersededAt).not.toBeNull();

    // Verify V2 is active and preserved
    const v2 = await prisma.offerVersion.findUniqueOrThrow({ where: { id: version2Id } });
    expect(v2.versionNumber).toBe(2);
    expect(v2.baseSalaryAmount).toBe(215000);
    expect(v2.supersededAt).toBeNull();

    // Verify Negotiation Events are preserved in append-only chronological order
    const events = await prisma.negotiationEvent.findMany({
      where: { negotiation: { offerId } },
      orderBy: { recordedAt: "asc" },
    });
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]?.eventType).toBe(NegotiationEventType.CANDIDATE_TARGET_SET);
    expect(events[1]?.eventType).toBe(NegotiationEventType.EMPLOYER_COUNTER_RECEIVED);

    // Verify Offer Decision is recorded and preserved
    const decision = await prisma.offerDecision.findFirstOrThrow({
      where: { offerId, decisionType: OfferDecisionType.ACCEPT },
    });
    expect(decision.offerVersionId).toBe(version2Id);
    expect(decision.candidateId).toBe(candId);

    // Verify Joining Record status
    const joining = await prisma.joiningRecord.findUniqueOrThrow({ where: { offerId } });
    expect(joining.status).toBe(JoiningStatus.JOINING_CONFIRMED);
    expect(joining.firstDayConfirmedByCandidate).toBe(true);

    // Verify Placement Record
    const placement = await prisma.placementRecord.findUniqueOrThrow({ where: { offerId } });
    expect(placement.firstDayConfirmed).toBe(true);
    expect(placement.onboardingProofValidated).toBe(true);
    expect(placement.proofDocumentId).toBe(docId);

    // Verify Audit Event Trail
    const auditLogs = await prisma.auditEvent.findMany({
      where: { organizationId: tenantId },
      orderBy: { createdAt: "asc" },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(5);
  }, 60000);
});
