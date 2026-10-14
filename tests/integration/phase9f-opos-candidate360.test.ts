/**
 * Phase 9F — LIVE Candidate 360 & Outcome History Integration
 * Verifies that Candidate 360 acts strictly as a READ-ONLY composition layer
 * reflecting active applications, outcomes, and operational context.
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
import { getCandidate360 } from "@/lib/candidate-360/service";
import { OfferStatus, Role } from "@/lib/opos/types";
import { handoffOutcomeToOffer } from "@/lib/opos/opos-service";
import { AuthorizationError } from "@/lib/errors";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9F — Candidate 360 & OPOS Integration", { timeout: 20000 }, () => {
  const tenantId = randomUUID();
  const userCandId = randomUUID();
  const userEmpId = randomUUID();
  const candId = randomUUID();
  const jobId = randomUUID();
  const appId = randomUUID();

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // 1. Organization
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
         VALUES ($1, 'Candidate 360 Org', $2, 'ACTIVE', NOW(), NOW())`,
        [tenantId, `cand360-org-${tenantId.slice(0, 8)}`]
      );

      // 2. Users
      await c.query(
        `INSERT INTO users (id, email, "firstName", "lastName", status, "createdAt", "updatedAt") VALUES
         ($1, $3, 'Jane', 'Candidate', 'ACTIVE', NOW(), NOW()),
         ($2, $4, 'Mark', 'Specialist', 'ACTIVE', NOW(), NOW())`,
        [
          userCandId,
          userEmpId,
          `cand360-${userCandId.slice(0, 8)}@test.com`,
          `emp360-${userEmpId.slice(0, 8)}@test.com`,
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
        `INSERT INTO candidates (id, "organizationId", "userId", headline, status, "verificationStatus", country, "workAuthorization", "salaryCurrency", application_authorization_mode, "assignedEmployeeId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'Senior Infrastructure Engineer', 'ACTIVE', 'VERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', $4, NOW(), NOW())`,
        [candId, tenantId, userCandId, userEmpId]
      );

      // 5. Job
      await c.query(
        `INSERT INTO jobs (id, "organizationId", title, "companyName", "jobDescription", location, "isRemote", "employmentType", status, visibility, "createdById", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Site Reliability Architect', 'Global Cloud Corp', 'JD', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $3, NOW(), NOW())`,
        [jobId, tenantId, userEmpId]
      );

      // 6. Application
      await c.query(
        `INSERT INTO applications (id, "organizationId", "candidateId", "jobId", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'SUBMITTED', NOW(), NOW())`,
        [appId, tenantId, candId, jobId]
      );

      // 7. Internal Notes (Staff Context)
      await c.query(
        `INSERT INTO internal_notes (id, organization_id, candidate_id, author_id, body, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Top tier candidate with deep Kubernetes expertise.', NOW())`,
        [tenantId, candId, userEmpId]
      );
    });
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    await withBypassClient(async (c) => {
      await c.query(`DELETE FROM audit_events WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM internal_notes WHERE organization_id = $1`, [tenantId]);
      await c.query(`DELETE FROM offer_versions WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM offers WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM applications WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM jobs WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM candidates WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM memberships WHERE "organizationId" = $1`, [tenantId]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userCandId, userEmpId]]);
      await c.query(`DELETE FROM organizations WHERE id = $1`, [tenantId]);
    });
    await prisma.$disconnect();
  }, 60000);

  it("1. Candidate queries own Candidate 360 profile successfully with sanitized payload", async () => {
    const candCtx = { userId: userCandId, organizationId: tenantId, role: Role.CANDIDATE } as any;

    const dto = await getCandidate360(candId, candCtx);

    expect(dto.candidate.id).toBe(candId);
    expect(dto.candidate.fullName).toBe("Jane Candidate");
    expect(dto.candidate.headline).toBe("Senior Infrastructure Engineer");
    expect(dto.applications.totalApplications).toBe(1);
    expect(dto.applications.recentApplications[0]?.id).toBe(appId);
    expect(dto.applications.recentApplications[0]?.jobTitle).toBe("Site Reliability Architect");

    // Staff context should be undefined for candidates (Zero internal notes leakage)
    expect(dto.staffContext).toBeUndefined();
  });

  it("2. Staff queries Candidate 360 and receives operational staff metrics", async () => {
    const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

    const dto = await getCandidate360(candId, staffCtx);

    expect(dto.candidate.id).toBe(candId);
    expect(dto.staffContext).toBeDefined();
    expect(dto.staffContext?.internalNotesCount).toBe(1);
  });

  it("3. Foreign candidate is blocked from viewing Candidate 360 profile", async () => {
    const foreignCandCtx = { userId: randomUUID(), organizationId: tenantId, role: Role.CANDIDATE } as any;

    await expect(getCandidate360(candId, foreignCandCtx)).rejects.toThrow(AuthorizationError);
  });

  it("4. Establishing OPOS offer does not corrupt or mutate Candidate 360 read-only queries", async () => {
    const staffCtx = { userId: userEmpId, organizationId: tenantId, role: Role.EMPLOYEE } as any;

    // Handoff to OPOS
    await prisma.$transaction(async (tx) =>
      handoffOutcomeToOffer(tx, staffCtx, {
        applicationId: appId,
        initialTerms: { roleTitle: "Site Reliability Architect", baseSalaryAmount: 210000 },
      })
    );

    // Verify Candidate 360 continues to return consistent read-only view
    const dto = await getCandidate360(candId, staffCtx);
    expect(dto.candidate.id).toBe(candId);
    expect(dto.applications.totalApplications).toBe(1);
  });
});
