import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { AuthorizationError } from "@/lib/errors";
import {
  CANDIDATE_JOB_MATCH_CURRENT_IDENTITY,
  MATCHING_CONTRACT_VERSION,
  assertAuthorizedJobForMatch,
  assertCandidateActionPatch,
  buildJobMatchIdempotencyKey,
  evaluateCandidateJobMatch,
  getCandidateSafeJobMatch,
  markCandidateJobMatchStale,
  upsertCurrentCandidateJobMatch,
  type AuthorizedMatchActor,
  type MatchCandidateInput,
  type MatchJobInput,
  type MatchStructuredRequirement,
} from "@/lib/job-matching";
import { normalizeRequirementValue } from "@/lib/application-intelligence/requirements-contract";
import { randomUUID } from "crypto";

const ROOT = join(__dirname, "../../..");
const MIGRATION = join(
  ROOT,
  "prisma/migrations/20261005140000_phase5_candidate_job_match/migration.sql"
);
const SCHEMA = join(ROOT, "prisma/schema.prisma");

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAND_A = "22222222-2222-4222-8222-222222222222";
const CAND_B = "33333333-3333-4333-8333-333333333333";
const USER_A = "66666666-6666-4666-8666-666666666666";
const USER_B = "77777777-7777-4777-8777-777777777777";
const JOB_G = "44444444-4444-4444-8444-444444444444";
const JOB_P = "55555555-5555-4555-8555-555555555555";
const JOB_2 = "99999999-9999-4999-8999-999999999999";

function req(
  partial: Omit<MatchStructuredRequirement, "normalizedValue"> & {
    normalizedValue?: string;
  }
): MatchStructuredRequirement {
  return {
    ...partial,
    normalizedValue:
      partial.normalizedValue ?? normalizeRequirementValue(partial.rawValue),
  };
}

function candidateA(
  overrides: Partial<MatchCandidateInput> = {}
): MatchCandidateInput {
  return {
    candidateId: CAND_A,
    organizationId: ORG,
    updatedAt: "2026-01-01T00:00:00.000Z",
    city: "Austin",
    state: "TX",
    country: "US",
    totalYearsExperience: 6,
    workAuthorization: "CITIZEN",
    requiresSponsorship: false,
    remotePreference: "FLEXIBLE",
    targetLocations: ["Austin, TX", "Remote - US"],
    targetRoles: ["Software Engineer"],
    desiredSalaryMin: 120000,
    desiredSalaryMax: 160000,
    salaryCurrency: "USD",
    skills: [
      { id: randomUUID(), name: "TypeScript" },
      { id: randomUUID(), name: "React" },
    ],
    experiences: [],
    educations: [],
    certifications: [],
    projects: [],
    ...overrides,
  };
}

function globalJob(overrides: Partial<MatchJobInput> = {}): MatchJobInput {
  return {
    jobId: JOB_G,
    organizationId: ORG,
    title: "Platform Engineer",
    companyName: "Gate13",
    location: "Remote - US",
    isRemote: true,
    employmentType: "FULL_TIME",
    salaryMin: 130000,
    salaryMax: 170000,
    salaryCurrency: "USD",
    status: "OPEN",
    visibility: "GLOBAL",
    ownerCandidateId: null,
    ...overrides,
  };
}

function evalFor(
  cand: MatchCandidateInput,
  job: MatchJobInput,
  extras: MatchStructuredRequirement[] = []
) {
  return evaluateCandidateJobMatch({
    candidate: cand,
    job,
    requirementSet: {
      requirementSetId: randomUUID(),
      snapshotId: randomUUID(),
      contentHash: "hash1",
      schemaVersion: "job-requirements.v1",
      normalizationVersion: "normalize.v1",
      extractionVersion: "extract.v1",
      freshness: "CURRENT",
      requirements: [
        req({
          id: randomUUID(),
          category: "REQUIRED_SKILL",
          rawValue: "TypeScript",
          importance: "REQUIRED",
        }),
        req({
          id: randomUUID(),
          category: "REQUIRED_SKILL",
          rawValue: "React",
          importance: "REQUIRED",
        }),
        ...extras,
      ],
    },
    asOf: new Date("2026-01-15T00:00:00.000Z"),
  });
}

describe("Phase 5A.5 — CandidateJobMatch persistence + security", () => {
  describe("schema / migration contract", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const schema = readFileSync(SCHEMA, "utf8");

    it("adds CandidateJobMatch model and table", () => {
      expect(schema).toContain("model CandidateJobMatch");
      expect(schema).toContain('@@map("candidate_job_matches")');
      expect(sql).toContain('CREATE TABLE "public"."candidate_job_matches"');
    });

    it("enforces UNIQUE current identity org+candidate+job", () => {
      expect(schema).toContain("@@unique([organizationId, candidateId, jobId])");
      expect(sql).toContain(
        '"candidate_job_matches_organizationId_candidateId_jobId_key"'
      );
      expect(CANDIDATE_JOB_MATCH_CURRENT_IDENTITY).toEqual([
        "organizationId",
        "candidateId",
        "jobId",
      ]);
    });

    it("does not unique on matchingContractVersion+sourceDataVersion as feed identity", () => {
      expect(schema).not.toMatch(
        /@@unique\(\[\s*organizationId,\s*candidateId,\s*jobId,\s*matchingContractVersion/
      );
      expect(schema).not.toMatch(
        /@@unique\(\[\s*organizationId,\s*candidateId,\s*jobId,\s*sourceDataVersion/
      );
    });

    it("enables FORCE RLS and grants", () => {
      expect(sql).toContain(
        'ALTER TABLE "public"."candidate_job_matches" ENABLE ROW LEVEL SECURITY'
      );
      expect(sql).toContain(
        'ALTER TABLE "public"."candidate_job_matches" FORCE ROW LEVEL SECURITY'
      );
      expect(sql).toContain("candidate_belongs_to_user");
      expect(sql).toContain("is_candidate_org_privileged_member");
      expect(sql).toContain(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."candidate_job_matches" TO oos_app_runtime'
      );
    });

    it("remediation migration enforces org consistency on INSERT/UPDATE", () => {
      const remedia = readFileSync(
        join(
          ROOT,
          "prisma/migrations/20261005144500_phase5a5_match_rls_org_qualify/migration.sql"
        ),
        "utf8"
      );
      expect(remedia).toContain(
        'c."organizationId" = candidate_job_matches."organizationId"'
      );
      expect(remedia).toContain("WITH CHECK");
    });

    it("does not broaden JobRequirementSet or Snapshot RLS", () => {
      expect(sql).not.toContain("job_requirement_sets_select");
      expect(sql).not.toContain("job_description_snapshots_select");
    });

    it("has no Application FK on CandidateJobMatch", () => {
      const modelBlock = schema.slice(schema.indexOf("model CandidateJobMatch"));
      const end = modelBlock.indexOf("\nmodel ");
      const block = end === -1 ? modelBlock : modelBlock.slice(0, end);
      expect(block).not.toContain("applicationId");
      expect(block).not.toContain("Application");
      expect(block).toContain("opportunityId");
    });

    it("adds required indexes", () => {
      expect(sql).toContain(
        "candidate_job_matches_candidateId_status_freshness_dismissedAt_idx"
      );
      expect(sql).toContain("candidate_job_matches_organizationId_jobId_idx");
      expect(sql).toContain("candidate_job_matches_status_leaseExpiresAt_idx");
    });

    it("adds Phase 5 audit actions", () => {
      expect(schema).toContain("JOB_MATCH_REQUESTED");
      expect(schema).toContain("JOB_MATCH_COMPLETED");
      expect(schema).toContain("JOB_MATCH_FAILED");
      expect(schema).toContain("JOB_MATCH_MARKED_STALE");
      expect(sql).toContain("JOB_MATCH_REQUESTED");
    });

    it("reuses IntelligenceResultFreshness", () => {
      expect(schema).toMatch(
        /freshness\s+IntelligenceResultFreshness/
      );
    });
  });

  describe("authorization helpers", () => {
    const actorA: AuthorizedMatchActor = {
      userId: USER_A,
      organizationId: ORG,
      role: "CANDIDATE",
      viewerCandidateId: CAND_A,
    };

    function mockTx(overrides: {
      candidate?: unknown;
      job?: unknown;
    }) {
      return {
        candidate: {
          findFirst: vi.fn(async () => overrides.candidate ?? null),
        },
        job: {
          findFirst: vi.fn(async () => overrides.job ?? null),
        },
      } as never;
    }

    it("allows GLOBAL job for authorized candidate", async () => {
      const tx = mockTx({
        candidate: { id: CAND_A, organizationId: ORG, userId: USER_A },
        job: {
          id: JOB_G,
          organizationId: ORG,
          status: "OPEN",
          visibility: "GLOBAL",
          ownerCandidateId: null,
        },
      });
      await expect(
        assertAuthorizedJobForMatch(tx, {
          actor: actorA,
          targetCandidateId: CAND_A,
          jobId: JOB_G,
        })
      ).resolves.toBeTruthy();
    });

    it("allows PRIVATE job only for owner candidate", async () => {
      const tx = mockTx({
        candidate: { id: CAND_A, organizationId: ORG, userId: USER_A },
        job: {
          id: JOB_P,
          organizationId: ORG,
          status: "OPEN",
          visibility: "CANDIDATE_PRIVATE",
          ownerCandidateId: CAND_A,
        },
      });
      await expect(
        assertAuthorizedJobForMatch(tx, {
          actor: actorA,
          targetCandidateId: CAND_A,
          jobId: JOB_P,
        })
      ).resolves.toBeTruthy();
    });

    it("denies PRIVATE job for non-owner candidate", async () => {
      const tx = mockTx({
        candidate: { id: CAND_B, organizationId: ORG, userId: USER_B },
        job: {
          id: JOB_P,
          organizationId: ORG,
          status: "OPEN",
          visibility: "CANDIDATE_PRIVATE",
          ownerCandidateId: CAND_A,
        },
      });
      await expect(
        assertAuthorizedJobForMatch(tx, {
          actor: {
            userId: USER_B,
            organizationId: ORG,
            role: "CANDIDATE",
            viewerCandidateId: CAND_B,
          },
          targetCandidateId: CAND_B,
          jobId: JOB_P,
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("denies Candidate A creating/acting for Candidate B", async () => {
      const tx = mockTx({
        candidate: { id: CAND_B, organizationId: ORG, userId: USER_B },
        job: {
          id: JOB_G,
          organizationId: ORG,
          status: "OPEN",
          visibility: "GLOBAL",
          ownerCandidateId: null,
        },
      });
      await expect(
        assertAuthorizedJobForMatch(tx, {
          actor: actorA,
          targetCandidateId: CAND_B,
          jobId: JOB_G,
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("denies cross-tenant candidate lookup", async () => {
      const tx = mockTx({ candidate: null, job: null });
      await expect(
        assertAuthorizedJobForMatch(tx, {
          actor: { ...actorA, organizationId: ORG_B },
          targetCandidateId: CAND_A,
          jobId: JOB_G,
        })
      ).rejects.toThrow();
    });
  });

  describe("candidate action field separation", () => {
    it("allows only candidate action fields", () => {
      expect(() =>
        assertCandidateActionPatch({ savedAt: new Date().toISOString() })
      ).not.toThrow();
    });

    it("rejects evaluation field mutation", () => {
      expect(() =>
        assertCandidateActionPatch({ category: "STRONG_MATCH" })
      ).toThrow(/cannot modify evaluation field/);
      expect(() =>
        assertCandidateActionPatch({ presentation: {} })
      ).toThrow();
      expect(() =>
        assertCandidateActionPatch({ sourceDataVersion: "x" })
      ).toThrow();
    });

    it("rejects identity field mutation", () => {
      expect(() =>
        assertCandidateActionPatch({ candidateId: CAND_B })
      ).toThrow();
      expect(() =>
        assertCandidateActionPatch({ organizationId: ORG_B })
      ).toThrow();
      expect(() => assertCandidateActionPatch({ jobId: JOB_2 })).toThrow();
    });
  });

  describe("upsert current-match identity", () => {
    const actorA: AuthorizedMatchActor = {
      userId: USER_A,
      organizationId: ORG,
      role: "CANDIDATE",
      viewerCandidateId: CAND_A,
    };

    let store: Map<string, Record<string, unknown>>;

    beforeEach(() => {
      store = new Map();
    });

    function identityKey(org: string, cand: string, job: string) {
      return `${org}:${cand}:${job}`;
    }

    function buildTx() {
      return {
        candidate: {
          findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
            if (where.id === CAND_A) {
              return { id: CAND_A, organizationId: ORG, userId: USER_A };
            }
            if (where.id === CAND_B) {
              return { id: CAND_B, organizationId: ORG, userId: USER_B };
            }
            return null;
          }),
        },
        job: {
          findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
            if (where.id === JOB_G) {
              return {
                id: JOB_G,
                organizationId: ORG,
                status: "OPEN",
                visibility: "GLOBAL",
                ownerCandidateId: null,
              };
            }
            if (where.id === JOB_2) {
              return {
                id: JOB_2,
                organizationId: ORG,
                status: "OPEN",
                visibility: "GLOBAL",
                ownerCandidateId: null,
              };
            }
            if (where.id === JOB_P) {
              return {
                id: JOB_P,
                organizationId: ORG,
                status: "OPEN",
                visibility: "CANDIDATE_PRIVATE",
                ownerCandidateId: CAND_A,
              };
            }
            return null;
          }),
        },
        candidateJobMatch: {
          findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
            if (where.organizationId_candidateId_jobId) {
              const w = where.organizationId_candidateId_jobId as {
                organizationId: string;
                candidateId: string;
                jobId: string;
              };
              return (
                store.get(identityKey(w.organizationId, w.candidateId, w.jobId)) ??
                null
              );
            }
            return null;
          }),
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const id = randomUUID();
            const row = { id, ...data };
            store.set(
              identityKey(
                String(data.organizationId),
                String(data.candidateId),
                String(data.jobId)
              ),
              row
            );
            return { id };
          }),
          update: vi.fn(
            async ({
              where,
              data,
            }: {
              where: { id: string };
              data: Record<string, unknown>;
            }) => {
              for (const [k, row] of store.entries()) {
                if (row.id === where.id) {
                  const next = { ...row, ...data };
                  store.set(k, next);
                  return { id: where.id };
                }
              }
              throw new Error("not found");
            }
          ),
          findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
            for (const row of store.values()) {
              if (row.id === where.id) return row;
            }
            return null;
          }),
        },
      } as never;
    }

    it("creates CandidateJobMatch", async () => {
      const tx = buildTx();
      const evaluation = evalFor(candidateA(), globalJob());
      const res = await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
        evaluation,
      });
      expect(res.created).toBe(true);
      expect(store.size).toBe(1);
    });

    it("recompute updates same row — no second current match", async () => {
      const tx = buildTx();
      const first = evalFor(candidateA(), globalJob());
      const a = await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
        evaluation: first,
      });
      const second = evalFor(
        candidateA({ desiredSalaryMin: 200000 }),
        globalJob({ salaryMin: 100000, salaryMax: 110000 })
      );
      expect(second.sourceDataVersion).not.toBe(first.sourceDataVersion);
      const b = await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
        evaluation: second,
      });
      expect(b.created).toBe(false);
      expect(b.matchId).toBe(a.matchId);
      expect(store.size).toBe(1);
      const row = store.get(identityKey(ORG, CAND_A, JOB_G))!;
      expect(row.sourceDataVersion).toBe(second.sourceDataVersion);
    });

    it("duplicate evaluation request is idempotent", async () => {
      const tx = buildTx();
      const evaluation = evalFor(candidateA(), globalJob());
      const a = await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
        evaluation,
      });
      const b = await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
        evaluation,
      });
      expect(b.idempotentReplay).toBe(true);
      expect(b.matchId).toBe(a.matchId);
      expect(store.size).toBe(1);
    });

    it("same job can have separate current matches for Candidate A and B", async () => {
      const tx = buildTx();
      const evalA = evalFor(candidateA(), globalJob());
      await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
        evaluation: evalA,
      });
      const actorB: AuthorizedMatchActor = {
        userId: USER_B,
        organizationId: ORG,
        role: "CANDIDATE",
        viewerCandidateId: CAND_B,
      };
      const evalB = evalFor(
        candidateA({ candidateId: CAND_B }),
        globalJob()
      );
      await upsertCurrentCandidateJobMatch(tx, {
        actor: actorB,
        targetCandidateId: CAND_B,
        jobId: JOB_G,
        evaluation: evalB,
      });
      expect(store.size).toBe(2);
    });

    it("same candidate can have matches for multiple jobs", async () => {
      const tx = buildTx();
      await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
        evaluation: evalFor(candidateA(), globalJob()),
      });
      await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_2,
        evaluation: evalFor(candidateA(), globalJob({ jobId: JOB_2 })),
      });
      expect(store.size).toBe(2);
    });

    it("persists STALE correctly", async () => {
      const tx = buildTx();
      const created = await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
        evaluation: evalFor(candidateA(), globalJob()),
      });
      await markCandidateJobMatchStale(tx, {
        actor: actorA,
        matchId: created.matchId,
      });
      const row = store.get(identityKey(ORG, CAND_A, JOB_G))!;
      expect(row.status).toBe("STALE");
      expect(row.freshness).toBe("STALE");
    });

    it("persists CURRENT freshness on success", async () => {
      const tx = buildTx();
      await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
        evaluation: evalFor(candidateA(), globalJob()),
      });
      const row = store.get(identityKey(ORG, CAND_A, JOB_G))!;
      expect(row.status).toBe("SUCCEEDED");
      expect(row.freshness).toBe("CURRENT");
      expect(row.matchingContractVersion).toBe(MATCHING_CONTRACT_VERSION);
    });

    it("candidate-safe payload has no raw requirement dump", async () => {
      const tx = buildTx();
      await upsertCurrentCandidateJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
        evaluation: evalFor(candidateA(), globalJob()),
      });
      const row = store.get(identityKey(ORG, CAND_A, JOB_G))!;
      // Wire getCandidateSafeJobMatch with findUnique returning row + job
      (tx as { candidateJobMatch: { findUnique: ReturnType<typeof vi.fn> } }).candidateJobMatch.findUnique =
        vi.fn(async () => ({
          ...row,
          job: {
            id: JOB_G,
            title: "Platform Engineer",
            companyName: "Gate13",
            location: "Remote - US",
            isRemote: true,
            employmentType: "FULL_TIME",
            salaryMin: 130000,
            salaryMax: 170000,
            salaryCurrency: "USD",
            status: "OPEN",
            visibility: "GLOBAL",
          },
        }));
      const safe = await getCandidateSafeJobMatch(tx, {
        actor: actorA,
        targetCandidateId: CAND_A,
        jobId: JOB_G,
      });
      const json = JSON.stringify(safe);
      expect(json).not.toContain("job-requirements.v1");
      expect(json).not.toContain("normalizationVersion");
      expect(json).not.toContain("extractedText");
      expect(json).not.toMatch(/\d+%/);
      expect(safe?.presentation).toBeTruthy();
    });

    it("idempotency key encodes evaluation version without being feed identity", () => {
      const k1 = buildJobMatchIdempotencyKey({
        organizationId: ORG,
        candidateId: CAND_A,
        jobId: JOB_G,
        matchingContractVersion: MATCHING_CONTRACT_VERSION,
        sourceDataVersion: "aaa",
      });
      const k2 = buildJobMatchIdempotencyKey({
        organizationId: ORG,
        candidateId: CAND_A,
        jobId: JOB_G,
        matchingContractVersion: MATCHING_CONTRACT_VERSION,
        sourceDataVersion: "bbb",
      });
      expect(k1).not.toBe(k2);
      expect(k1.length).toBe(64);
    });
  });
});
