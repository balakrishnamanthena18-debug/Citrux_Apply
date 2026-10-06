/**
 * Phase 5G — Requested Application Intake Queue.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildRequestedIntakeWhere,
  listRequestedApplicationIntake,
} from "@/lib/application/requested-intake";
import {
  REQUESTED_INTAKE_DEFAULT_PAGE_SIZE,
  REQUESTED_INTAKE_MAX_PAGE_SIZE,
} from "@/lib/application/requested-intake-types";

const ROOT = join(__dirname, "../../..");
const ORG = "11111111-1111-4111-8111-111111111111";

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 5G — eligibility contract", () => {
  it("requires applicationRequestedAt, ACTIVE opportunity, no active Application", () => {
    const where = buildRequestedIntakeWhere(ORG);
    expect(where.organizationId).toBe(ORG);
    expect(where.applicationRequestedAt).toEqual({ not: null });
    expect(where.opportunityId).toEqual({ not: null });
    const opp = where.opportunity as { is: Record<string, unknown> };
    expect(opp.is.status).toBe("ACTIVE");
    expect(opp.is.applications).toEqual({
      none: {
        status: { notIn: ["REJECTED", "WITHDRAWN", "FAILED"] },
      },
    });
  });

  it("page size is bounded", () => {
    expect(REQUESTED_INTAKE_DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(
      REQUESTED_INTAKE_MAX_PAGE_SIZE
    );
    expect(REQUESTED_INTAKE_MAX_PAGE_SIZE).toBeLessThanOrEqual(50);
  });
});

describe("Phase 5G — listRequestedApplicationIntake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orders by applicationRequestedAt ASC then id, and maps safe DTO", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        opportunityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
        candidateId: "22222222-2222-4222-8222-222222222222",
        jobId: "33333333-3333-4333-8333-333333333333",
        applicationRequestedAt: new Date("2026-10-01T12:00:00.000Z"),
        category: "STRONG_MATCH",
        candidate: {
          user: {
            firstName: "Alex",
            lastName: "Rivera",
            email: "alex.rivera@gmail.com",
          },
        },
        job: {
          title: "Platform Engineer",
          companyName: "Acme",
          location: null,
          isRemote: true,
          employmentType: "FULL_TIME",
          status: "OPEN",
        },
      },
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const tx = {
      candidateJobMatch: { findMany, count },
    };

    const page = await listRequestedApplicationIntake(tx as never, ORG, {
      pageSize: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ applicationRequestedAt: "asc" }, { id: "asc" }],
        take: 21,
      })
    );
    expect(page.totalPending).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      candidateName: "Alex Rivera",
      jobTitle: "Platform Engineer",
      companyName: "Acme",
      requestState: "REQUESTED",
      canStart: true,
      matchCategory: "Strong match",
    });
    expect(page.items[0]?.requestedAt).toBe("2026-10-01T12:00:00.000Z");
    // No internal fields
    expect(JSON.stringify(page.items[0])).not.toMatch(/sourceDataVersion|idempotencyKey|leaseExpiresAt/);
  });

  it("marks closed jobs as not startable", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        opportunityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
        candidateId: "22222222-2222-4222-8222-222222222222",
        jobId: "33333333-3333-4333-8333-333333333333",
        applicationRequestedAt: new Date("2026-10-01T12:00:00.000Z"),
        category: null,
        candidate: {
          user: { firstName: "Alex", lastName: "R", email: "a@x.com" },
        },
        job: {
          title: "Closed Role",
          companyName: "Acme",
          location: "Austin",
          isRemote: false,
          employmentType: "FULL_TIME",
          status: "CLOSED",
        },
      },
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const page = await listRequestedApplicationIntake(
      { candidateJobMatch: { findMany, count } } as never,
      ORG
    );
    expect(page.items[0]?.canStart).toBe(false);
    expect(page.items[0]?.blockedReason).toMatch(/CLOSED/);
  });
});

describe("Phase 5G — production wiring forensics", () => {
  it("start action reuses desk create; list does not evaluate matching", () => {
    const actions = read("src/lib/application/requested-intake-actions.ts");
    expect(actions).toMatch(/startApplicationFromDeskAction/);
    expect(actions).toMatch(/requireEmployeeOrAdmin/);
    expect(actions).not.toMatch(/evaluateCandidateJobMatch/);
    expect(actions).not.toMatch(/drainJobMatchWorker/);
    expect(actions).not.toMatch(/createTask/);
    expect(actions).not.toMatch(/notification/i);

    const intake = read("src/lib/application/requested-intake.ts");
    expect(intake).not.toMatch(/evaluateCandidateJobMatch/);
    expect(intake).not.toMatch(/processJobMatch/);
  });

  it("Application Desk integrates intake panel", () => {
    const workbench = read(
      "src/components/application/ApplicationLogWorkbench.tsx"
    );
    expect(workbench).toMatch(/RequestedApplicationIntakePanel/);
    const page = read(
      "src/app/(dashboard)/employee/application-log/page.tsx"
    );
    expect(page).toMatch(/listRequestedApplicationIntake/);
  });

  it("does not mutate decision fields (read-only + desk reuse)", () => {
    const actions = read("src/lib/application/requested-intake-actions.ts");
    expect(actions).not.toMatch(/\.update\(/);
    expect(actions).not.toMatch(/savedAt/);
    expect(actions).not.toMatch(/dismissedAt/);
    const intake = read("src/lib/application/requested-intake.ts");
    expect(intake).not.toMatch(/\.update\(/);
    expect(intake).not.toMatch(/\.create\(/);
  });

  it("no schema/migration for 5G", () => {
    const { readdirSync } = require("fs") as typeof import("fs");
    const migrations = readdirSync(join(ROOT, "prisma/migrations"));
    expect(migrations.some((m: string) => /phase5g|requested.?intake/i.test(m))).toBe(
      false
    );
  });
});
