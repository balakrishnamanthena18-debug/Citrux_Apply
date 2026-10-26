import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobCollectionRunner } from "@/lib/job-discovery/runner";
import { jobProviderRegistry } from "@/lib/job-discovery/registry";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    jobCollectionRun: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    jobProviderConfig: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    discoveredJob: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  },
}));

describe("Job Collection Runner", () => {
  let runner: JobCollectionRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new JobCollectionRunner();
  });

  it("prevents concurrent overlapping collection runs", async () => {
    // Mock an active running collection run within last 10 minutes
    vi.mocked(prisma.jobCollectionRun.findFirst).mockResolvedValueOnce({
      id: "active-run-123",
      providerId: "freehire",
      status: "RUNNING",
      startedAt: new Date(),
    } as any);

    await expect(runner.executeCollection({ providerId: "freehire" })).rejects.toThrow(
      /Another collection run .* is currently in progress/
    );
  });

  it("completes single provider collection run and updates statistics", async () => {
    // No active run
    vi.mocked(prisma.jobCollectionRun.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.jobCollectionRun.create).mockResolvedValueOnce({
      id: "run-456",
      providerId: "freehire",
      status: "RUNNING",
    } as any);

    vi.mocked(prisma.discoveredJob.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.discoveredJob.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.discoveredJob.create).mockResolvedValue({ id: "job-new-1" } as any);
    vi.mocked(prisma.jobProviderConfig.update).mockResolvedValue({} as any);
    vi.mocked(prisma.jobCollectionRun.update).mockResolvedValue({} as any);

    const summaries = await runner.executeCollection({
      providerId: "freehire",
      maxJobs: 5,
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.status).toBe("COMPLETED");
    expect(summaries[0]?.jobsDiscovered).toBeGreaterThanOrEqual(0);
    expect(prisma.jobCollectionRun.update).toHaveBeenCalled();
  });

  it("manages registered providers in registry", () => {
    const all = jobProviderRegistry.getAllProviders();
    expect(all.length).toBeGreaterThanOrEqual(4);

    const freehire = jobProviderRegistry.getProvider("freehire");
    expect(freehire).toBeDefined();
    expect(freehire?.name).toContain("FreeHire");

    const arbeitnow = jobProviderRegistry.getProvider("arbeitnow");
    expect(arbeitnow).toBeDefined();
  });
});
