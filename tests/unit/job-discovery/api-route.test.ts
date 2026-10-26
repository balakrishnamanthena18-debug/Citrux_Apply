import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "@/app/api/jobs/search/route";
import * as actions from "@/lib/job-discovery/actions";
import { NextRequest } from "next/server";

vi.mock("@/lib/job-discovery/actions", () => ({
  searchDiscoveredJobsAction: vi.fn(),
}));

describe("/api/jobs/search Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles POST request with search filters and returns 200 with live jobs", async () => {
    const mockResponse = {
      jobs: [
        {
          id: "live_job_1",
          title: "Full Stack Engineer",
          companyName: "Acme Corp",
          providerId: "freehire",
          externalId: "ext-1",
          externalUrl: "https://example.com/job/1",
          canonicalUrl: "https://example.com/job/1",
          sourceAttribution: "FreeHire Live",
          verificationStatus: "SOURCE_CONFIRMED",
          availabilityStatus: "OPEN",
          qualityScore: 90,
          isDuplicate: false,
          duplicateGroupId: null,
          promotedToJobId: null,
          employmentType: "FULL_TIME",
          workArrangement: "REMOTE",
          industry: "Technology",
          seniorityLevel: "Senior",
          experienceMin: 5,
          experienceMax: null,
          salaryMin: 120000,
          salaryMax: 160000,
          salaryCurrency: "USD",
          salaryPeriod: "YEARLY",
          country: "US",
          state: "CA",
          city: "San Francisco",
          jobDescription: "Exciting engineering role",
          requiredSkills: ["React", "TypeScript", "Node.js"],
          preferredSkills: ["GraphQL"],
          postedAt: new Date().toISOString(),
          closingDate: null,
          lastSeenAt: new Date().toISOString(),
          firstCollectedAt: new Date().toISOString(),
          lastCheckedAt: new Date().toISOString(),
          isSaved: false,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      isLive: true,
      providerStatuses: [
        {
          providerId: "freehire",
          providerName: "FreeHire Open ATS",
          status: "SUCCESS",
          latencyMs: 120,
          count: 1,
        },
      ],
    };

    vi.spyOn(actions, "searchDiscoveredJobsAction").mockResolvedValueOnce({
      success: true,
      data: mockResponse as any,
    });

    const req = new NextRequest("http://localhost:3000/api/jobs/search", {
      method: "POST",
      body: JSON.stringify({
        query: "Full Stack",
        countries: ["US"],
        workArrangements: ["REMOTE"],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.isLive).toBe(true);
    expect(body.jobs.length).toBe(1);
    expect(body.jobs[0].title).toBe("Full Stack Engineer");
    expect(actions.searchDiscoveredJobsAction).toHaveBeenCalledWith({
      query: "Full Stack",
      countries: ["US"],
      workArrangements: ["REMOTE"],
    });
  });

  it("handles GET request by extracting search parameters and calling searchDiscoveredJobsAction", async () => {
    vi.spyOn(actions, "searchDiscoveredJobsAction").mockResolvedValueOnce({
      success: true,
      data: {
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        isLive: true,
      } as any,
    });

    const req = new NextRequest(
      "http://localhost:3000/api/jobs/search?q=React&country=US&industry=Technology&workArrangement=REMOTE&page=2&pageSize=10&sortBy=relevance"
    );

    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(actions.searchDiscoveredJobsAction).toHaveBeenCalledWith({
      query: "React",
      countries: ["US"],
      industries: ["Technology"],
      workArrangements: ["REMOTE"],
      seniorityLevels: undefined,
      page: 2,
      pageSize: 10,
      sortBy: "relevance",
    });
  });

  it("returns 400 when searchDiscoveredJobsAction returns an error", async () => {
    vi.spyOn(actions, "searchDiscoveredJobsAction").mockResolvedValueOnce({
      success: false,
      error: "Invalid query parameter",
    });

    const req = new NextRequest("http://localhost:3000/api/jobs/search", {
      method: "POST",
      body: JSON.stringify({ query: "" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Invalid query parameter");
  });
});
