import { describe, it, expect, vi, beforeEach } from "vitest";
import { PromoteToCatalogSchema } from "@/lib/job-discovery/contracts";
import { promoteDiscoveredJobToCatalogAction } from "@/lib/job-discovery/actions";

// Mock dependencies for unit testing action logic
vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn().mockResolvedValue({
    userId: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    role: "EMPLOYEE",
  }),
  requireEmployeeOrAdmin: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn((userId, fn) => fn({
    candidate: {
      findFirst: vi.fn(),
    },
    job: {
      create: vi.fn(),
    },
    discoveredJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    candidateJobOpportunity: {
      create: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  })),
}));

vi.mock("@/lib/job-matching/population", () => ({
  populateJobMatchWorkForJob: vi.fn().mockResolvedValue({ enqueued: 1 }),
}));

describe("PromoteToCatalog Visibility & Owner Candidate Constraints", () => {
  describe("1. PromoteToCatalogSchema Validation", () => {
    it("accepts valid GLOBAL catalog promotion with no owner candidate", () => {
      const result = PromoteToCatalogSchema.safeParse({
        discoveredJobId: "33333333-3333-4333-8333-333333333333",
        visibility: "GLOBAL",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visibility).toBe("GLOBAL");
        expect(result.data.ownerCandidateId).toBeUndefined();
      }
    });

    it("rejects GLOBAL catalog promotion with an ownerCandidateId", () => {
      const result = PromoteToCatalogSchema.safeParse({
        discoveredJobId: "33333333-3333-4333-8333-333333333333",
        visibility: "GLOBAL",
        ownerCandidateId: "44444444-4444-4444-8444-444444444444",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Catalog jobs cannot have an owner candidate"
        );
      }
    });

    it("rejects CANDIDATE_PRIVATE promotion when ownerCandidateId is missing", () => {
      const result = PromoteToCatalogSchema.safeParse({
        discoveredJobId: "33333333-3333-4333-8333-333333333333",
        visibility: "CANDIDATE_PRIVATE",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Candidate-private jobs require an owner candidate"
        );
      }
    });

    it("accepts CANDIDATE_PRIVATE promotion with valid ownerCandidateId", () => {
      const candidateId = "44444444-4444-4444-8444-444444444444";
      const result = PromoteToCatalogSchema.safeParse({
        discoveredJobId: "33333333-3333-4333-8333-333333333333",
        visibility: "CANDIDATE_PRIVATE",
        ownerCandidateId: candidateId,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visibility).toBe("CANDIDATE_PRIVATE");
        expect(result.data.ownerCandidateId).toBe(candidateId);
      }
    });
  });

  describe("2. promoteDiscoveredJobToCatalogAction Guards", () => {
    it("fails cleanly with validation message when CANDIDATE_PRIVATE is submitted without candidate", async () => {
      const res = await promoteDiscoveredJobToCatalogAction({
        jobData: {
          title: "Support Worker – Catering",
          companyName: "Calvary",
        },
        visibility: "CANDIDATE_PRIVATE",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe(
        "Candidate-private jobs require an assigned candidate (ownerCandidateId)."
      );
    });

    it("fails cleanly when target candidate does not exist in the organization", async () => {
      const res = await promoteDiscoveredJobToCatalogAction({
        jobData: {
          title: "Support Worker – Catering",
          companyName: "Calvary",
        },
        visibility: "CANDIDATE_PRIVATE",
        ownerCandidateId: "55555555-5555-4555-8555-555555555555",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Selected candidate was not found in your organization or is archived.");
    });
  });
});
