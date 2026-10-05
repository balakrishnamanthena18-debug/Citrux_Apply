import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCandidateJobLeadAction,
  searchDeskJobsAction,
  searchCatalogJobsAction,
  startApplicationFromDeskAction,
  shareJobToCatalogAction,
  getDeskJobDetailAction,
} from "@/lib/application/actions";
import { getAuthenticatedContext, requireAdmin, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { JobStatus, JobVisibility } from "@/generated/prisma";
import { catalogJobsWhere, deskJobsWhere } from "@/lib/job/visibility";
import {
  jobSnapshotSyncTxStubs,
  withJobWriteFields,
} from "../helpers/job-snapshot-tx";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Job visibility authorization (integration)", () => {
  const orgId = "11111111-1111-4111-8111-111111111111";
  const employeeId = "22222222-2222-4222-8222-222222222222";
  const candA = "44444444-4444-4444-8444-444444444444";
  const candB = "55555555-5555-4555-8555-555555555555";
  const privateJobId = "66666666-6666-4666-8666-666666666666";
  const globalJobId = "77777777-7777-4777-8777-777777777777";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: employeeId,
      email: "staff@citrux.com",
      role: "EMPLOYEE" as any,
      organizationId: orgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("creates candidate-private job lead with opportunity (not catalog)", async () => {
    const jobCreate = vi.fn().mockResolvedValue(
      withJobWriteFields(
        {
          id: privateJobId,
          title: "Private Analyst",
          companyName: "ABC Corp",
        },
        {
          organizationId: orgId,
          jobDescription: "Scoped lead for Candidate A",
        }
      )
    );
    const oppCreate = vi.fn().mockResolvedValue({ id: "88888888-8888-4888-8888-888888888888" });

    vi.mocked(withRlsContext).mockImplementation(async (_uid, fn) =>
      fn({
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candA }),
        },
        job: { create: jobCreate },
        candidateJobOpportunity: { create: oppCreate },
        ...jobSnapshotSyncTxStubs({ organizationId: orgId, jobId: privateJobId }),
      } as any)
    );

    const res = await createCandidateJobLeadAction({
      candidateId: candA,
      title: "Private Analyst",
      companyName: "ABC Corp",
      jobDescription: "Scoped lead for Candidate A",
      source: "LinkedIn",
    });

    expect(res.success).toBe(true);
    expect(jobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visibility: JobVisibility.CANDIDATE_PRIVATE,
          ownerCandidateId: candA,
        }),
      })
    );
    expect(oppCreate).toHaveBeenCalled();
    expect(logUserAuditEvent).toHaveBeenCalled();
  });

  it("desk search for Candidate A does not return Candidate B private jobs", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_uid, fn) =>
      fn({
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: candA }),
        },
        job: {
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            // Simulate Prisma applying the where; assert shape then return only allowed rows
            expect(where.AND[0].OR).toEqual([
              { visibility: "GLOBAL" },
              { visibility: "CANDIDATE_PRIVATE", ownerCandidateId: candA },
            ]);
            return [
              {
                id: globalJobId,
                title: "Tesla Role",
                companyName: "Tesla",
                location: "Remote",
                isRemote: true,
                employmentType: "FULL_TIME",
                salaryMin: null,
                salaryMax: null,
                salaryCurrency: "USD",
                source: "Careers",
                externalUrl: null,
                visibility: "GLOBAL",
              },
              {
                id: privateJobId,
                title: "Private Analyst",
                companyName: "ABC Corp",
                location: null,
                isRemote: false,
                employmentType: "FULL_TIME",
                salaryMin: null,
                salaryMax: null,
                salaryCurrency: "USD",
                source: "LinkedIn",
                externalUrl: null,
                visibility: "CANDIDATE_PRIVATE",
              },
            ];
          }),
        },
      } as any)
    );

    const res = await searchDeskJobsAction("", candA);
    expect(res.success).toBe(true);
    expect(res.data?.every((j) => j.visibility === "GLOBAL" || j.id === privateJobId)).toBe(true);
    expect(res.data?.some((j) => j.id === privateJobId)).toBe(true);
  });

  it("catalog search never includes private visibility", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: globalJobId,
        title: "Tesla Role",
        companyName: "Tesla",
        location: "Remote",
        isRemote: true,
        employmentType: "FULL_TIME",
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: "USD",
        source: "Careers",
        externalUrl: null,
        visibility: "GLOBAL",
      },
    ]);
    vi.mocked(withRlsContext).mockImplementation(async (_uid, fn) =>
      fn({ job: { findMany } } as any)
    );

    const res = await searchCatalogJobsAction("");
    expect(res.success).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          visibility: "GLOBAL",
          status: JobStatus.OPEN,
        }),
      })
    );
    expect(res.data?.every((j) => j.visibility === "GLOBAL")).toBe(true);
  });

  it("desk start rejects using another candidate's private job", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_uid, fn) =>
      fn({
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: candB,
            status: "ACTIVE",
            user: { firstName: "B", lastName: "User", email: "b@test.com" },
          }),
        },
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: privateJobId,
            status: JobStatus.OPEN,
            title: "Private Analyst",
            companyName: "ABC Corp",
            source: "LinkedIn",
            visibility: JobVisibility.CANDIDATE_PRIVATE,
            ownerCandidateId: candA,
            organizationId: orgId,
          }),
        },
      } as any)
    );

    const res = await startApplicationFromDeskAction({
      candidateId: candB,
      jobId: privateJobId,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/private to another candidate/i);
  });

  it("share to catalog requires admin", async () => {
    vi.mocked(requireAdmin).mockImplementation(() => {
      throw new Error("Access denied: requires one of [ADMIN]");
    });

    const res = await shareJobToCatalogAction({ jobId: privateJobId });
    expect(res.success).toBe(false);
    expect(requireEmployeeOrAdmin).toHaveBeenCalledTimes(0);
  });

  it("Candidate B desk search where excludes Candidate A private job", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: globalJobId,
        title: "Automation Engineer",
        companyName: "Tesla",
        location: "Remote",
        isRemote: true,
        employmentType: "FULL_TIME",
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: "USD",
        source: "Company Careers",
        externalUrl: null,
        visibility: "GLOBAL",
      },
    ]);

    vi.mocked(withRlsContext).mockImplementation(async (_uid, fn) =>
      fn({
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candB }) },
        job: { findMany },
      } as any)
    );

    const res = await searchDeskJobsAction("Private Analyst", candB);
    expect(res.success).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [
                { visibility: "GLOBAL" },
                { visibility: "CANDIDATE_PRIVATE", ownerCandidateId: candB },
              ],
            }),
          ]),
        }),
      })
    );
    expect(res.data?.some((j) => j.id === privateJobId)).toBe(false);
    expect(res.data?.every((j) => j.visibility === "GLOBAL")).toBe(true);
  });

  it("direct private-job detail ID access denied under Candidate B context", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_uid, fn) =>
      fn({
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candB }) },
        job: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            // Simulate DB applying deskJobsWhere: private owned by A is out of scope for B
            expect(where.AND[0]).toEqual(deskJobsWhere(orgId, candB));
            expect(where.AND[1]).toEqual({ id: privateJobId });
            return null;
          }),
        },
      } as any)
    );

    const res = await getDeskJobDetailAction(privateJobId, candB);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });

  it("Candidate A can load own private job detail by ID", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_uid, fn) =>
      fn({
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candA }) },
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: privateJobId,
            title: "Private Analyst",
            companyName: "ABC Corp",
            location: null,
            isRemote: false,
            employmentType: "FULL_TIME",
            salaryMin: null,
            salaryMax: null,
            salaryCurrency: "USD",
            source: "LinkedIn",
            externalUrl: null,
            jobDescription: "Private lead body",
            visibility: "CANDIDATE_PRIVATE",
            ownerCandidateId: candA,
          }),
        },
      } as any)
    );

    const res = await getDeskJobDetailAction(privateJobId, candA);
    expect(res.success).toBe(true);
    expect(res.data?.id).toBe(privateJobId);
    expect(res.data?.visibility).toBe("CANDIDATE_PRIVATE");
  });

  it("getDeskJobDetailAction refuses without candidateId", async () => {
    const res = await getDeskJobDetailAction(privateJobId);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/candidate/i);
    expect(withRlsContext).not.toHaveBeenCalled();
  });

  it("global catalog where never includes CANDIDATE_PRIVATE", () => {
    expect(catalogJobsWhere(orgId)).toEqual({
      organizationId: orgId,
      visibility: "GLOBAL",
    });
  });

  it("desk start allows GLOBAL job reuse for Candidate B", async () => {
    const appCreate = vi.fn().mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "DISCOVERED",
    });
    const oppFind = vi.fn().mockResolvedValue(null);
    const oppCreate = vi.fn().mockResolvedValue({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    vi.mocked(withRlsContext).mockImplementation(async (_uid, fn) =>
      fn({
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: candB,
            status: "ACTIVE",
            user: { firstName: "B", lastName: "User", email: "b@test.com" },
          }),
        },
        job: {
          findFirst: vi.fn().mockResolvedValue({
            id: globalJobId,
            status: JobStatus.OPEN,
            title: "Automation Engineer",
            companyName: "Tesla",
            source: "Company Careers",
            visibility: JobVisibility.GLOBAL,
            ownerCandidateId: null,
            organizationId: orgId,
          }),
        },
        candidateJobOpportunity: {
          findUnique: oppFind,
          create: oppCreate,
        },
        application: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: appCreate,
        },
        applicationStateHistory: { create: vi.fn() },
      } as any)
    );

    const res = await startApplicationFromDeskAction({
      candidateId: candB,
      jobId: globalJobId,
    });
    expect(res.success).toBe(true);
    expect(appCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          candidateId: candB,
          jobId: globalJobId,
          candidateJobOpportunityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }),
      })
    );
  });

  it("tenant isolation: private job from other org is not found", async () => {
    const otherOrgJobId = "99999999-9999-4999-8999-999999999999";
    vi.mocked(withRlsContext).mockImplementation(async (_uid, fn) =>
      fn({
        candidate: { findFirst: vi.fn().mockResolvedValue({ id: candA }) },
        job: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            // organizationId is inside deskJobsWhere — other-org row cannot match
            expect(where.AND[0].organizationId).toBe(orgId);
            return null;
          }),
        },
      } as any)
    );

    const res = await getDeskJobDetailAction(otherOrgJobId, candA);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });
});
