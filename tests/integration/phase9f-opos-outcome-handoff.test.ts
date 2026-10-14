/**
 * Phase 9F — LIVE Outcome Ledger -> OPOS Handoff & Boundary Tests
 * Verifies the boundary between Outcome Ledger / Application and OPOS.
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
import { OfferStatus, Role } from "@/lib/opos/types";
import { handoffOutcomeToOffer } from "@/lib/opos/opos-service";
import { NotFoundError, AuthorizationError } from "@/lib/errors";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 9F — Outcome Ledger -> OPOS Handoff Integration", () => {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const userCandAId = randomUUID();
  const userCandBId = randomUUID();
  const userEmpAId = randomUUID();
  const candAId = randomUUID();
  const candBId = randomUUID();
  const jobAId = randomUUID();
  const appAId = randomUUID();
  const appBId = randomUUID();

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // 1. Tenants
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt") VALUES
         ($1, 'Tenant A', $3, 'ACTIVE', NOW(), NOW()),
         ($2, 'Tenant B', $4, 'ACTIVE', NOW(), NOW())`,
        [tenantAId, tenantBId, `tenant-a-${tenantAId.slice(0, 8)}`, `tenant-b-${tenantBId.slice(0, 8)}`]
      );

      // 2. Users
      await c.query(
        `INSERT INTO users (id, email, status, "createdAt", "updatedAt") VALUES
         ($1, $4, 'ACTIVE', NOW(), NOW()),
         ($2, $5, 'ACTIVE', NOW(), NOW()),
         ($3, $6, 'ACTIVE', NOW(), NOW())`,
        [
          userCandAId,
          userCandBId,
          userEmpAId,
          `canda-${userCandAId.slice(0, 8)}@test.com`,
          `candb-${userCandBId.slice(0, 8)}@test.com`,
          `empa-${userEmpAId.slice(0, 8)}@test.com`,
        ]
      );

      // 3. Memberships
      await c.query(
        `INSERT INTO memberships (id, "organizationId", "userId", role, status, "createdAt", "updatedAt") VALUES
         (gen_random_uuid(), $1, $3, 'CANDIDATE', 'ACTIVE', NOW(), NOW()),
         (gen_random_uuid(), $2, $4, 'CANDIDATE', 'ACTIVE', NOW(), NOW()),
         (gen_random_uuid(), $1, $5, 'EMPLOYEE', 'ACTIVE', NOW(), NOW())`,
        [tenantAId, tenantBId, userCandAId, userCandBId, userEmpAId]
      );

      // 4. Candidates
      await c.query(
        `INSERT INTO candidates (id, "organizationId", "userId", status, "verificationStatus", country, "workAuthorization", "salaryCurrency", application_authorization_mode, "createdAt", "updatedAt") VALUES
         ($1, $3, $5, 'ACTIVE', 'UNVERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', NOW(), NOW()),
         ($2, $4, $6, 'ACTIVE', 'UNVERIFIED', 'US', 'CITIZEN', 'USD', 'MANAGED', NOW(), NOW())`,
        [candAId, candBId, tenantAId, tenantBId, userCandAId, userCandBId]
      );

      // 5. Job A
      await c.query(
        `INSERT INTO jobs (id, "organizationId", title, "companyName", "jobDescription", location, "isRemote", "employmentType", status, visibility, "createdById", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Staff Backend Engineer', 'NextGen Platforms', 'JD', 'Remote', true, 'FULL_TIME', 'OPEN', 'GLOBAL', $3, NOW(), NOW())`,
        [jobAId, tenantAId, userEmpAId]
      );

      // 6. Applications
      await c.query(
        `INSERT INTO applications (id, "organizationId", "candidateId", "jobId", status, "createdAt", "updatedAt") VALUES
         ($1, $3, $5, $7, 'SUBMITTED', NOW(), NOW()),
         ($2, $4, $6, $7, 'SUBMITTED', NOW(), NOW())`,
        [appAId, appBId, tenantAId, tenantBId, candAId, candBId, jobAId]
      );
    });
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    await withBypassClient(async (c) => {
      await c.query(`DELETE FROM audit_events WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM offer_versions WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM offers WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM applications WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM jobs WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM candidates WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM memberships WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userCandAId, userCandBId, userEmpAId]]);
      await c.query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [tenantAId, tenantBId]);
    });
    await prisma.$disconnect();
  }, 60000);

  it("1. Successfully executes handoff for legitimate application and returns Offer + V1", async () => {
    const staffCtx = { userId: userEmpAId, organizationId: tenantAId, role: Role.EMPLOYEE } as any;

    const res = await prisma.$transaction(async (tx) =>
      handoffOutcomeToOffer(tx, staffCtx, {
        applicationId: appAId,
        initialTerms: {
          roleTitle: "Staff Backend Engineer",
          baseSalaryAmount: 215000,
          baseSalaryCurrency: "USD",
        },
      })
    );

    expect(res.created).toBe(true);
    expect(res.offer.applicationId).toBe(appAId);
    expect(res.offer.candidateId).toBe(candAId);
    expect(res.offer.status).toBe(OfferStatus.OFFER_RECEIVED);
    expect(res.version.versionNumber).toBe(1);
    expect(res.version.baseSalaryAmount).toBe(215000);
  });

  it("2. Replay handoff resolves idempotently to the existing Offer and V1", async () => {
    const staffCtx = { userId: userEmpAId, organizationId: tenantAId, role: Role.EMPLOYEE } as any;

    const res = await prisma.$transaction(async (tx) =>
      handoffOutcomeToOffer(tx, staffCtx, {
        applicationId: appAId,
      })
    );

    expect(res.created).toBe(false);
    expect(res.offer.applicationId).toBe(appAId);
    expect(res.version.versionNumber).toBe(1);

    const count = await prisma.offer.count({ where: { applicationId: appAId } });
    expect(count).toBe(1);
  });

  it("3. Reject handoff when staff from Tenant A attempts to initialize offer for Tenant B Application", async () => {
    const staffCtx = { userId: userEmpAId, organizationId: tenantAId, role: Role.EMPLOYEE } as any;

    await expect(
      prisma.$transaction(async (tx) =>
        handoffOutcomeToOffer(tx, staffCtx, {
          applicationId: appBId, // Tenant B application
        })
      )
    ).rejects.toThrow(NotFoundError);
  });

  it("4. Reject handoff when candidate attempts to initialize offer for another candidate's application", async () => {
    const candBCtx = { userId: userCandBId, organizationId: tenantAId, role: Role.CANDIDATE } as any;

    await expect(
      prisma.$transaction(async (tx) =>
        handoffOutcomeToOffer(tx, candBCtx, {
          applicationId: appAId, // Candidate A application
        })
      )
    ).rejects.toThrow(AuthorizationError);
  });
});
