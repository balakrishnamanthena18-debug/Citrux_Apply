import { describe, it, expect } from "vitest";
import {
  assertJobUsableForCandidate,
  catalogJobsWhere,
  deskJobsWhere,
} from "@/lib/job/visibility";
import { AuthorizationError } from "@/lib/errors";
import {
  CandidateJobLeadCreateSchema,
  JobCreateSchema,
} from "@/lib/validation/application.schemas";

describe("job visibility domain helpers", () => {
  const orgId = "11111111-1111-4111-8111-111111111111";
  const candA = "22222222-2222-4222-8222-222222222222";
  const candB = "33333333-3333-4333-8333-333333333333";

  it("catalog where is GLOBAL-only", () => {
    expect(catalogJobsWhere(orgId)).toEqual({
      organizationId: orgId,
      visibility: "GLOBAL",
    });
  });

  it("desk where includes GLOBAL and selected candidate private leads", () => {
    const where = deskJobsWhere(orgId, candA);
    expect(where.organizationId).toBe(orgId);
    expect(where.status).toBe("OPEN");
    expect(where.OR).toEqual([
      { visibility: "GLOBAL" },
      { visibility: "CANDIDATE_PRIVATE", ownerCandidateId: candA },
    ]);
  });

  it("allows GLOBAL job for any candidate", () => {
    expect(() =>
      assertJobUsableForCandidate(
        {
          id: "44444444-4444-4444-8444-444444444444",
          organizationId: orgId,
          status: "OPEN",
          visibility: "GLOBAL",
          ownerCandidateId: null,
        },
        orgId,
        candA
      )
    ).not.toThrow();
  });

  it("allows private job for owning candidate", () => {
    expect(() =>
      assertJobUsableForCandidate(
        {
          id: "44444444-4444-4444-8444-444444444444",
          organizationId: orgId,
          status: "OPEN",
          visibility: "CANDIDATE_PRIVATE",
          ownerCandidateId: candA,
        },
        orgId,
        candA
      )
    ).not.toThrow();
  });

  it("denies private job for another candidate", () => {
    expect(() =>
      assertJobUsableForCandidate(
        {
          id: "44444444-4444-4444-8444-444444444444",
          organizationId: orgId,
          status: "OPEN",
          visibility: "CANDIDATE_PRIVATE",
          ownerCandidateId: candA,
        },
        orgId,
        candB
      )
    ).toThrow(AuthorizationError);
  });

  it("denies job from another organization even if visibility GLOBAL", () => {
    expect(() =>
      assertJobUsableForCandidate(
        {
          id: "44444444-4444-4444-8444-444444444444",
          organizationId: "99999999-9999-4999-8999-999999999999",
          status: "OPEN",
          visibility: "GLOBAL",
          ownerCandidateId: null,
        },
        orgId,
        candA
      )
    ).toThrow();
  });
});

describe("job create schemas", () => {
  const base = {
    title: "Automation Engineer",
    companyName: "Tesla",
    jobDescription: "Build automation platforms.",
  };

  it("defaults catalog create to GLOBAL", () => {
    const parsed = JobCreateSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.visibility).toBe("GLOBAL");
    }
  });

  it("rejects GLOBAL create with ownerCandidateId", () => {
    const parsed = JobCreateSchema.safeParse({
      ...base,
      visibility: "GLOBAL",
      ownerCandidateId: "22222222-2222-4222-8222-222222222222",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires candidateId for private job lead", () => {
    const parsed = CandidateJobLeadCreateSchema.safeParse(base);
    expect(parsed.success).toBe(false);
  });

  it("accepts candidate job lead payload", () => {
    const parsed = CandidateJobLeadCreateSchema.safeParse({
      ...base,
      candidateId: "22222222-2222-4222-8222-222222222222",
      source: "LinkedIn",
    });
    expect(parsed.success).toBe(true);
  });
});
