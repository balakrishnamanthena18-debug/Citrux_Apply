import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ANALYSIS_PURPOSE,
  FIT_STATUSES,
  GATE6_ALIGNMENT_AUDIT_ALIASES,
  IMPORTANCE_WEIGHTS,
  INTELLIGENCE_SCORING_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
  SCORING_WEIGHTS,
  assertAuthorizedExecutionChain,
  buildCandidateFactVersion,
  computeDeterministicAlignment,
  computeMergedExperienceYears,
  computeOverallScore,
  normalizeRequirementValue,
  requestCandidateJobAlignment,
  scoreDimensionFromFitStatuses,
} from "@/lib/application-intelligence";
import {
  ALIGNMENT_REQUIREMENT_SETS,
  G6_AS_OF,
  G6_CAND,
  G6_JOB,
  G6_ORG,
  G6_SET,
  G6_SNAP,
  baseCandidate,
  baseJob,
  req,
} from "./fixtures/candidate-job-alignment";

vi.mock("@/lib/audit", () => ({
  logSystemAuditEvent: vi.fn().mockResolvedValue(undefined),
  logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), security: vi.fn() },
}));

const runUpdate = vi.fn();
const runUpdateMany = vi.fn();
const runFindUnique = vi.fn();
const jobFindFirst = vi.fn();
const reqSetFindFirst = vi.fn();
const candFindFirst = vi.fn();
const alignmentCreate = vi.fn();
const transaction = vi.fn();
const txQueryRaw = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    applicationIntelligenceRun: {
      update: (...a: unknown[]) => runUpdate(...a),
      updateMany: (...a: unknown[]) => runUpdateMany(...a),
      findUnique: (...a: unknown[]) => runFindUnique(...a),
    },
    job: { findFirst: (...a: unknown[]) => jobFindFirst(...a) },
    jobRequirementSet: { findFirst: (...a: unknown[]) => reqSetFindFirst(...a) },
    candidate: { findFirst: (...a: unknown[]) => candFindFirst(...a) },
    applicationAlignmentResult: {
      create: (...a: unknown[]) => alignmentCreate(...a),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}));

import { logUserAuditEvent } from "@/lib/audit";
import { executeIntelligenceRunPipeline } from "@/lib/application-intelligence/pipeline";
import { MockAIProvider } from "@/lib/application-intelligence";

const ROOT = process.cwd();
const appId = "33333333-3333-4333-8333-333333333333";
const runId = "66666666-6666-4666-8666-666666666666";
const actorId = "77777777-7777-4777-8777-777777777777";
const alignId = "a1111111-1111-4111-8111-111111111111";

describe("Gate 6 — scoring.v1 contract", () => {
  it("keeps locked dimension weights and importance blend", () => {
    expect(Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(IMPORTANCE_WEIGHTS.REQUIRED).toBe(70);
    expect(IMPORTANCE_WEIGHTS.PREFERRED).toBe(30);
    expect(INTELLIGENCE_SCORING_VERSION).toBe("scoring.v1");
    expect(FIT_STATUSES).toEqual(["MATCHED", "PARTIAL", "MISSING", "UNKNOWN"]);
  });

  it("excludes UNKNOWN from overall score; all-unknown → null", () => {
    const allUnknown = computeOverallScore(
      Object.keys(SCORING_WEIGHTS).map((dimension) => ({
        dimension: dimension as keyof typeof SCORING_WEIGHTS,
        score: null,
        status: "UNKNOWN" as const,
      }))
    );
    expect(allUnknown.overallScore).toBeNull();

    const mixed = scoreDimensionFromFitStatuses([
      { importance: "REQUIRED", status: "MATCHED" },
      { importance: "PREFERRED", status: "MISSING" },
      { importance: "REQUIRED", status: "UNKNOWN" },
    ]);
    expect(mixed.status).toBe("SCORED");
    // REQUIRED avg 100 * 0.7 + PREFERRED 0 * 0.3 = 70
    expect(mixed.score).toBe(70);
  });
});

describe("Gate 6 — deterministic matching", () => {
  it("is reproducible for identical inputs", () => {
    const input = {
      requirements: ALIGNMENT_REQUIREMENT_SETS.perfectMatch,
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate(),
      job: baseJob(),
      asOf: G6_AS_OF,
    };
    const a = computeDeterministicAlignment(input);
    const b = computeDeterministicAlignment(input);
    expect(a).toEqual(b);
    expect(a.scoringVersion).toBe("scoring.v1");
    expect(a.normalizationVersion).toBe(JOB_REQUIREMENT_NORMALIZATION_VERSION);
    expect(a.overallScore).not.toBeNull();
    expect(a.overallScore).toBeGreaterThan(70);
  });

  it("matches normalized skills and keeps uncertain equivalence separate", () => {
    const result = computeDeterministicAlignment({
      requirements: ALIGNMENT_REQUIREMENT_SETS.duplicateSkills,
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate(),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(normalizeRequirementValue("React.js")).toBe("react");
    expect(normalizeRequirementValue("ReactJS")).toBe("react");
    expect(result.fitItems.every((f) => f.status === "MATCHED")).toBe(true);
  });

  it("skill missing vs unknown evidence", () => {
    const withSkills = computeDeterministicAlignment({
      requirements: [
        req({
          category: "REQUIRED_SKILL",
          rawValue: "COBOL",
          importance: "REQUIRED",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate(),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(withSkills.fitItems[0]?.status).toBe("MISSING");

    const noSkills = computeDeterministicAlignment({
      requirements: [
        req({
          category: "REQUIRED_SKILL",
          rawValue: "COBOL",
          importance: "REQUIRED",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate({
        skills: [],
        experiences: [],
        projects: [],
        totalYearsExperience: null,
      }),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(noSkills.fitItems[0]?.status).toBe("UNKNOWN");
  });

  it("experience MATCHED / PARTIAL / UNKNOWN", () => {
    const satisfied = computeDeterministicAlignment({
      requirements: [
        req({
          category: "EXPERIENCE",
          rawValue: "5 years of software experience",
          importance: "REQUIRED",
          excerpt: "5 years of software experience",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate({ totalYearsExperience: 6 }),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(satisfied.fitItems[0]?.status).toBe("MATCHED");

    const partial = computeDeterministicAlignment({
      requirements: ALIGNMENT_REQUIREMENT_SETS.experiencePartial,
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate({ totalYearsExperience: 6 }),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(partial.fitItems[0]?.status).toBe("PARTIAL");
    expect(partial.fitItems[0]?.reason).toMatch(/10 years/i);

    const missingExp = computeDeterministicAlignment({
      requirements: ALIGNMENT_REQUIREMENT_SETS.experiencePartial,
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate({
        totalYearsExperience: null,
        experiences: [],
      }),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(missingExp.fitItems[0]?.status).toBe("UNKNOWN");
  });

  it("does not double-count overlapping employment", () => {
    const years = computeMergedExperienceYears(
      [
        {
          id: "1",
          jobTitle: "A",
          companyName: "X",
          startDate: "2020-01-01",
          endDate: "2022-01-01",
          isCurrent: false,
          technologies: [],
        },
        {
          id: "2",
          jobTitle: "B",
          companyName: "Y",
          startDate: "2021-01-01",
          endDate: "2023-01-01",
          isCurrent: false,
          technologies: [],
        },
      ],
      G6_AS_OF
    );
    // Overlap merged → ~3 years, not 4
    expect(years).toBeGreaterThanOrEqual(2.9);
    expect(years).toBeLessThanOrEqual(3.2);
  });

  it("education / certification / location / work auth / salary cases", () => {
    const eduMatch = computeDeterministicAlignment({
      requirements: [
        req({
          category: "EDUCATION",
          rawValue: "Bachelor's degree",
          importance: "REQUIRED",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate(),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(eduMatch.fitItems[0]?.status).toBe("MATCHED");

    const eduUnknown = computeDeterministicAlignment({
      requirements: [
        req({
          category: "EDUCATION",
          rawValue: "Bachelor's degree",
          importance: "REQUIRED",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate({ educations: [] }),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(eduUnknown.fitItems[0]?.status).toBe("UNKNOWN");

    const certMissing = computeDeterministicAlignment({
      requirements: [
        req({
          category: "CERTIFICATION",
          rawValue: "PMP",
          importance: "REQUIRED",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate(),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(certMissing.fitItems[0]?.status).toBe("MISSING");

    const locUnknown = computeDeterministicAlignment({
      requirements: [
        req({
          category: "LOCATION",
          rawValue: "Berlin, Germany",
          importance: "REQUIRED",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate({
        city: null,
        state: null,
        targetLocations: [],
        remotePreference: "ONSITE",
      }),
      job: baseJob({ location: "Berlin, Germany", isRemote: false }),
      asOf: G6_AS_OF,
    });
    expect(["MISSING", "UNKNOWN"]).toContain(locUnknown.fitItems[0]?.status);

    const authUnknown = computeDeterministicAlignment({
      requirements: [
        req({
          category: "WORK_AUTHORIZATION",
          rawValue: "Ambiguous visa wording without clear rule",
          importance: "NEEDS_REVIEW",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate({ workAuthorization: "OTHER" }),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(authUnknown.fitItems[0]?.status).toBe("UNKNOWN");

    const salaryBad = computeDeterministicAlignment({
      requirements: [
        req({
          category: "SALARY",
          rawValue: "200000-250000 USD",
          importance: "PREFERRED",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate({
        desiredSalaryMin: 120000,
        desiredSalaryMax: 140000,
      }),
      job: baseJob({ salaryMin: 200000, salaryMax: 250000 }),
      asOf: G6_AS_OF,
    });
    expect(salaryBad.fitItems[0]?.status).toBe("MISSING");

    const salaryUnknown = computeDeterministicAlignment({
      requirements: [
        req({
          category: "SALARY",
          rawValue: "competitive",
          importance: "UNKNOWN",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate({
        desiredSalaryMin: null,
        desiredSalaryMax: null,
      }),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    expect(salaryUnknown.fitItems[0]?.status).toBe("UNKNOWN");
  });

  it("emits deterministic explanations and evidence", () => {
    const result = computeDeterministicAlignment({
      requirements: ALIGNMENT_REQUIREMENT_SETS.mixedRequiredPreferred,
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate(),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    for (const item of result.fitItems) {
      expect(item.reason.length).toBeGreaterThan(10);
      expect(item.requirementEvidence.snapshotId).toBe(G6_SNAP);
      expect(item.reason).not.toMatch(/probably|likely|appears/i);
    }
  });

  it("rejects cross-tenant and private-job misuse", () => {
    expect(() =>
      computeDeterministicAlignment({
        requirements: ALIGNMENT_REQUIREMENT_SETS.perfectMatch,
        requirementSetId: G6_SET,
        snapshotId: G6_SNAP,
        candidate: baseCandidate(),
        job: baseJob({
          organizationId: "99999999-9999-4999-8999-999999999999",
        }),
        asOf: G6_AS_OF,
      })
    ).toThrow(/Cross-tenant/i);

    expect(() =>
      computeDeterministicAlignment({
        requirements: ALIGNMENT_REQUIREMENT_SETS.perfectMatch,
        requirementSetId: G6_SET,
        snapshotId: G6_SNAP,
        candidate: baseCandidate(),
        job: baseJob({
          visibility: "CANDIDATE_PRIVATE",
          ownerCandidateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
        asOf: G6_AS_OF,
      })
    ).toThrow(/Private job/i);

    expect(() =>
      computeDeterministicAlignment({
        requirements: ALIGNMENT_REQUIREMENT_SETS.perfectMatch,
        requirementSetId: G6_SET,
        snapshotId: G6_SNAP,
        candidate: baseCandidate(),
        job: baseJob({
          visibility: "CANDIDATE_PRIVATE",
          ownerCandidateId: G6_CAND,
        }),
        asOf: G6_AS_OF,
      })
    ).not.toThrow();
  });

  it("rejects requirement evidence bound to a different snapshot", () => {
    const bad = req({
      category: "REQUIRED_SKILL",
      rawValue: "TypeScript",
      importance: "REQUIRED",
    });
    bad.evidence.snapshotId = "99999999-9999-4999-8999-999999999999";
    expect(() =>
      computeDeterministicAlignment({
        requirements: [bad],
        requirementSetId: G6_SET,
        snapshotId: G6_SNAP,
        candidate: baseCandidate(),
        job: baseJob(),
        asOf: G6_AS_OF,
      })
    ).toThrow(/snapshot/i);
  });

  it("candidate fact version changes when skills change", () => {
    const a = buildCandidateFactVersion(baseCandidate());
    const b = buildCandidateFactVersion(
      baseCandidate({
        skills: [
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Rust" },
        ],
        updatedAt: "2026-02-01T00:00:00.000Z",
      })
    );
    expect(a).not.toBe(b);
  });
});

describe("Gate 6 — request + pipeline (no LLM)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests alignment only with CURRENT requirement set for snapshot", async () => {
    const hash = "a".repeat(64);
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({ id: appId }),
      },
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: G6_JOB,
          organizationId: G6_ORG,
          jobDescription: "Must have TypeScript",
          updatedAt: new Date(),
          visibility: "GLOBAL",
          ownerCandidateId: null,
        }),
      },
      jobDescriptionSnapshot: {
        findUnique: vi.fn().mockResolvedValue({
          id: G6_SNAP,
          organizationId: G6_ORG,
          jobId: G6_JOB,
          contentHash: hash,
          sourceVersionId: `job:${G6_JOB}:jd:${hash.slice(0, 16)}`,
        }),
        create: vi.fn(),
      },
      jobRequirementSet: {
        findFirst: vi.fn().mockResolvedValue({
          id: G6_SET,
          snapshotId: G6_SNAP,
          freshness: "CURRENT",
          schemaVersion: "job-requirements.v1",
        }),
      },
      candidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: G6_CAND,
          updatedAt: new Date("2026-01-01"),
          skills: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "TS" }],
          experiences: [],
          educations: [],
          certifications: [],
        }),
      },
      applicationIntelligenceRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: runId,
          snapshotId: G6_SNAP,
          requirementSetId: G6_SET,
        }),
      },
    } as any;

    const first = await requestCandidateJobAlignment(tx, {
      organizationId: G6_ORG,
      candidateId: G6_CAND,
      applicationId: appId,
      jobId: G6_JOB,
      requestedById: actorId,
      candidateUpdatedAt: new Date("2026-01-01"),
    });
    expect(first.created).toBe(true);
    expect(tx.applicationIntelligenceRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          analysisPurpose: ANALYSIS_PURPOSE.CANDIDATE_JOB_ALIGNMENT,
          requirementSetId: G6_SET,
          scoringVersion: "scoring.v1",
          promptVersion: "deterministic.alignment.v1",
        }),
      })
    );
    expect(logUserAuditEvent).toHaveBeenCalled();
    expect(GATE6_ALIGNMENT_AUDIT_ALIASES.requested).toBe("ALIGNMENT_REQUESTED");
  });

  it("refuses alignment when requirement set is stale/missing", async () => {
    const tx = {
      application: { findFirst: vi.fn().mockResolvedValue({ id: appId }) },
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: G6_JOB,
          organizationId: G6_ORG,
          jobDescription: "JD",
          updatedAt: new Date(),
          visibility: "GLOBAL",
          ownerCandidateId: null,
        }),
      },
      jobDescriptionSnapshot: {
        findUnique: vi.fn().mockResolvedValue({
          id: G6_SNAP,
          organizationId: G6_ORG,
          jobId: G6_JOB,
          contentHash: "b".repeat(64),
          sourceVersionId: `job:${G6_JOB}:jd:${"b".repeat(16)}`,
        }),
      },
      jobRequirementSet: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;

    await expect(
      requestCandidateJobAlignment(tx, {
        organizationId: G6_ORG,
        candidateId: G6_CAND,
        applicationId: appId,
        jobId: G6_JOB,
        requestedById: actorId,
        candidateUpdatedAt: new Date(),
      })
    ).rejects.toThrow(/JobRequirementSet/i);
  });

  it("pipeline alignment path never calls provider and persists result", async () => {
    const provider = new MockAIProvider("valid_alignment");
    const extractSpy = vi.spyOn(provider, "extractRequirements");
    const analyzeSpy = vi.spyOn(provider, "analyzeJob");
    const fitSpy = vi.spyOn(provider, "analyzeCandidateFit");

    const requirements = ALIGNMENT_REQUIREMENT_SETS.perfectMatch;
    // Gate 8 evidence integrity validates excerpts against snapshot text.
    const snapText = [
      "TypeScript",
      "React",
      "5 years of software experience",
      "Bachelor's degree",
      "AWS Solutions Architect",
      "Austin, TX",
      "remote",
      "Must be authorized to work in the United States",
      "130000-170000 USD",
      "FULL_TIME",
    ].join(". ");

    runFindUnique
      .mockResolvedValueOnce({
        id: runId,
        organizationId: G6_ORG,
        candidateId: G6_CAND,
        applicationId: appId,
        jobId: G6_JOB,
        snapshotId: G6_SNAP,
        requirementSetId: G6_SET,
        analysisPurpose: ANALYSIS_PURPOSE.CANDIDATE_JOB_ALIGNMENT,
        sourceDataVersion: "snap:x|cand:y|mat:z",
        provider: "deterministic",
        model: "scoring.v1",
        promptVersion: "deterministic.alignment.v1",
        schemaVersion: "job-requirements.v1",
        scoringVersion: "scoring.v1",
        freshness: "CURRENT",
        attemptCount: 1,
        maxAttempts: 3,
        status: "RUNNING",
        createdAt: G6_AS_OF,
        requestedById: actorId,
        snapshot: {
          id: G6_SNAP,
          jobId: G6_JOB,
          organizationId: G6_ORG,
          contentHash: "c".repeat(64),
          sourceVersionId: `job:${G6_JOB}:jd:${"c".repeat(16)}`,
          sourceText: snapText,
        },
        job: {
          id: G6_JOB,
          organizationId: G6_ORG,
          visibility: "GLOBAL",
          ownerCandidateId: null,
        },
        application: {
          id: appId,
          organizationId: G6_ORG,
          candidateId: G6_CAND,
          jobId: G6_JOB,
        },
        requirementSet: {
          id: G6_SET,
          snapshotId: G6_SNAP,
          jobId: G6_JOB,
          organizationId: G6_ORG,
          freshness: "CURRENT",
        },
      })
      .mockResolvedValueOnce({
        status: "RUNNING",
        validatedPayload: null,
        requirementSetId: G6_SET,
        alignmentResult: null,
      })
      .mockResolvedValue({
        status: "RUNNING",
        createdAt: G6_AS_OF,
        requestedById: actorId,
        alignmentResult: null,
      });

    const cand = baseCandidate();
    candFindFirst.mockResolvedValue({
      id: cand.candidateId,
      organizationId: cand.organizationId,
      updatedAt: cand.updatedAt,
      city: cand.city,
      state: cand.state,
      country: cand.country,
      totalYearsExperience: cand.totalYearsExperience,
      workAuthorization: cand.workAuthorization,
      requiresSponsorship: cand.requiresSponsorship,
      remotePreference: cand.remotePreference,
      targetLocations: cand.targetLocations,
      targetRoles: cand.targetRoles,
      desiredSalaryMin: cand.desiredSalaryMin,
      desiredSalaryMax: cand.desiredSalaryMax,
      salaryCurrency: cand.salaryCurrency,
      skills: cand.skills,
      experiences: cand.experiences,
      educations: cand.educations,
      certifications: cand.certifications,
      projects: cand.projects,
      factAttestations: [],
    });
    const job = baseJob();
    jobFindFirst.mockResolvedValue({
      id: job.jobId,
      organizationId: job.organizationId,
      location: job.location,
      isRemote: job.isRemote,
      employmentType: job.employmentType,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      visibility: job.visibility,
      ownerCandidateId: job.ownerCandidateId,
    });
    reqSetFindFirst.mockResolvedValue({
      id: G6_SET,
      snapshotId: G6_SNAP,
      freshness: "CURRENT",
      requirements,
    });
    alignmentCreate.mockResolvedValue({ id: alignId });
    runUpdate.mockResolvedValue({});
    runUpdateMany.mockResolvedValue({ count: 1 });
    txQueryRaw.mockResolvedValue([
      {
        id: runId,
        status: "RUNNING",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        attemptCount: 1,
        maxAttempts: 3,
      },
    ]);
    transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        applicationIntelligenceRun: {
          findUnique: runFindUnique,
          update: runUpdate,
          updateMany: runUpdateMany,
        },
        applicationAlignmentResult: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: alignmentCreate,
          update: vi.fn(),
        },
        $queryRaw: (...args: unknown[]) => txQueryRaw(...args),
      })
    );

    const result = await executeIntelligenceRunPipeline(runId, {
      provider,
      actorUserId: actorId,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.alignmentResultId).toBe(alignId);
    expect(result.overallScore).not.toBeNull();
    expect(extractSpy).not.toHaveBeenCalled();
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(fitSpy).not.toHaveBeenCalled();
    expect(alignmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scoringVersion: "scoring.v1",
          applicationId: appId,
          organizationId: G6_ORG,
        }),
      })
    );
  });

  it("execution chain still enforces application scope for alignment", () => {
    expect(() =>
      assertAuthorizedExecutionChain({
        organizationId: G6_ORG,
        candidateId: G6_CAND,
        applicationId: appId,
        jobId: G6_JOB,
        snapshotId: G6_SNAP,
        analysisPurpose: ANALYSIS_PURPOSE.CANDIDATE_JOB_ALIGNMENT,
        snapshot: {
          id: G6_SNAP,
          jobId: G6_JOB,
          organizationId: G6_ORG,
        },
        job: {
          id: G6_JOB,
          organizationId: G6_ORG,
          visibility: "GLOBAL",
          ownerCandidateId: null,
        },
        application: {
          id: appId,
          organizationId: G6_ORG,
          candidateId: G6_CAND,
          jobId: G6_JOB,
        },
        requirementSet: {
          id: G6_SET,
          snapshotId: G6_SNAP,
          jobId: G6_JOB,
          organizationId: G6_ORG,
        },
      })
    ).not.toThrow();
  });
});

describe("Gate 6 — scope / schema discipline", () => {
  it("does not add speculative alignment tables or readiness UI", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model ApplicationAlignmentResult");
    expect(schema).not.toMatch(/model AlignmentScoreCard/);
    const alignment = readFileSync(
      join(ROOT, "src/lib/application-intelligence/alignment.ts"),
      "utf8"
    );
    const pipeline = readFileSync(
      join(ROOT, "src/lib/application-intelligence/pipeline.ts"),
      "utf8"
    );
    expect(alignment).not.toMatch(/NvidiaDeepSeekAdapter|openai|anthropic/i);
    expect(pipeline).toMatch(/executeDeterministicAlignmentBranch|CANDIDATE_JOB_ALIGNMENT/);
    expect(pipeline).toMatch(/llmCalls: 0/);
    expect(alignment).not.toMatch(/readinessState|READY_WITH_WARNINGS/);
  });

  it("keeps ApplicationAlignmentResult RLS insert org-privileged", () => {
    const mig = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261004120000_phase2_intelligence_foundation/migration.sql"
      ),
      "utf8"
    );
    expect(mig).toContain("application_alignment_results");
    expect(mig).toMatch(/application_alignment_results_insert/i);
    expect(mig).toMatch(/is_org_privileged_member/);
  });
});
