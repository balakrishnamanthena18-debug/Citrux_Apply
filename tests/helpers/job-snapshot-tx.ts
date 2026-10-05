import { vi } from "vitest";

/** Minimal Prisma tx stubs for Gate 2 snapshot sync during job writes. */
export function jobSnapshotSyncTxStubs(input?: {
  organizationId?: string;
  jobId?: string;
}) {
  const organizationId =
    input?.organizationId ?? "11111111-1111-4111-8111-111111111111";
  const jobId = input?.jobId ?? "77777777-7777-4777-8777-777777777777";

  return {
    jobDescriptionSnapshot: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "99999999-9999-4999-8999-999999999999",
        organizationId,
        jobId,
        contentHash: "a".repeat(64),
        sourceVersionId: `job:${jobId}:jd:${"a".repeat(16)}`,
      }),
    },
    jobRequirementSet: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    // Gate 11: JD snapshot change marks application intelligence stale.
    application: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    applicationIntelligenceRun: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    applicationAlignmentResult: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    applicationReadinessResult: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

/** Ensure job.create mock returns fields needed by snapshot sync. */
export function withJobWriteFields<T extends Record<string, unknown>>(
  job: T,
  defaults: {
    organizationId: string;
    jobDescription: string;
  }
) {
  return {
    organizationId: defaults.organizationId,
    jobDescription: defaults.jobDescription,
    externalUrl: null,
    source: null,
    updatedAt: new Date("2026-10-04T00:00:00.000Z"),
    ...job,
  };
}
