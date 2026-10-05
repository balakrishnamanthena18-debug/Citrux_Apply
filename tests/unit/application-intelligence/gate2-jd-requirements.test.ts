import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
  assertSnapshotAnalysisBinding,
  assertSnapshotContentImmutable,
  buildSnapshotSourceVersionId,
  hashJobDescriptionContent,
  normalizeJdSourceForHash,
  captureJobDescriptionSnapshot,
} from "@/lib/application-intelligence/jd-snapshot";
import {
  JobRequirementSetPayloadSchema,
  RequirementsExtractionOutputSchema,
  assertRequiredPreferredNotCollapsed,
  normalizeRequirementValue,
  validateRequirementEvidenceAgainstSnapshot,
  type StructuredRequirement,
} from "@/lib/application-intelligence/requirements-contract";
import {
  buildStructuredJobFieldRequirements,
  invalidateRequirementSetsForJob,
  mapExtractionOutputToStructuredRequirements,
  persistJobRequirementSet,
  requirementSetIsUsableForSnapshot,
} from "@/lib/application-intelligence/requirement-set";
import {
  canAccessJobSnapshot,
  deniesPrivateJobSnapshotToOtherCandidate,
  rejectsCrossTenant,
} from "@/lib/application-intelligence/security";
import { freshnessAfterTrigger } from "@/lib/application-intelligence/stale";
import { INTELLIGENCE_AUDIT_ACTIONS } from "@/lib/application-intelligence/audit-contract";
import { NullAIProvider } from "@/lib/application-intelligence/providers/null-provider";
import {
  JOB_REQUIREMENT_SCHEMA_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
} from "@/lib/application-intelligence/constants";
import { logUserAuditEvent } from "@/lib/audit";

const ROOT = process.cwd();
const snapId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orgId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeEach(() => {
  vi.mocked(logUserAuditEvent).mockClear();
});

function req(partial: Partial<StructuredRequirement> & Pick<StructuredRequirement, "category" | "rawValue" | "importance">): StructuredRequirement {
  const raw = partial.rawValue;
  return {
    id: partial.id ?? randomUUID(),
    category: partial.category,
    rawValue: raw,
    normalizedValue: partial.normalizedValue ?? normalizeRequirementValue(raw),
    importance: partial.importance,
    confidence: partial.confidence ?? 0.9,
    derivation: partial.derivation ?? "SOURCE_JD",
    evidence: partial.evidence ?? {
      snapshotId: snapId,
      excerpt: raw,
    },
  };
}

describe("Gate 2 — JD snapshot hashing + versioning", () => {
  it("identical normalized JD → identical hash", () => {
    const a = hashJobDescriptionContent("  Hello\r\nWorld  ");
    const b = hashJobDescriptionContent("Hello\nWorld");
    expect(a).toBe(b);
    expect(normalizeJdSourceForHash("x\r\ny")).toBe("x\ny");
  });

  it("changed JD → changed hash", () => {
    expect(hashJobDescriptionContent("A")).not.toBe(hashJobDescriptionContent("B"));
  });

  it("builds deterministic source version id (never 'latest')", () => {
    const hash = hashJobDescriptionContent("JD");
    const v = buildSnapshotSourceVersionId(jobId, hash);
    expect(v).toContain(`job:${jobId}:jd:`);
    expect(v).not.toMatch(/latest/i);
  });

  it("refuses snapshot content mutation at application layer", () => {
    expect(() => assertSnapshotContentImmutable()).toThrow(/immutable/i);
  });

  it("binds analysis to exact snapshot ownership", () => {
    expect(() =>
      assertSnapshotAnalysisBinding({
        snapshotId: snapId,
        jobId,
        organizationId: orgId,
        expectedJobId: jobId,
        expectedOrganizationId: orgId,
      })
    ).not.toThrow();
    expect(() =>
      assertSnapshotAnalysisBinding({
        snapshotId: snapId,
        jobId,
        organizationId: orgId,
        expectedJobId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        expectedOrganizationId: orgId,
      })
    ).toThrow(/jobId mismatch/i);
  });

  it("RLS migration denies snapshot UPDATE/DELETE", () => {
    const sql = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261004120000_phase2_intelligence_foundation/migration.sql"
      ),
      "utf8"
    );
    expect(sql).toMatch(/job_description_snapshots_update[\s\S]*USING \(false\)/);
    expect(sql).toMatch(/job_description_snapshots_delete[\s\S]*USING \(false\)/);
  });
});

describe("Gate 2 — requirement model + required/preferred + evidence", () => {
  it("rejects invalid structured requirements", () => {
    const bad = JobRequirementSetPayloadSchema.safeParse({
      schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
      normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
      snapshotId: snapId,
      requirements: [
        {
          id: randomUUID(),
          category: "NOT_A_CATEGORY",
          rawValue: "React",
          normalizedValue: "react",
          importance: "REQUIRED",
          confidence: 1,
          derivation: "SOURCE_JD",
          evidence: { snapshotId: snapId, excerpt: "React" },
        },
      ],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects evidence that references a different snapshot", () => {
    const parsed = JobRequirementSetPayloadSchema.safeParse({
      schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
      normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
      snapshotId: snapId,
      requirements: [
        req({
          category: "REQUIRED_SKILL",
          rawValue: "React",
          importance: "REQUIRED",
          evidence: {
            snapshotId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            excerpt: "React",
          },
        }),
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("keeps REQUIRED and PREFERRED distinct; ambiguous stays NEEDS_REVIEW", () => {
    const requirements = [
      req({ category: "REQUIRED_SKILL", rawValue: "TypeScript", importance: "REQUIRED" }),
      req({ category: "PREFERRED_SKILL", rawValue: "GraphQL", importance: "PREFERRED" }),
      req({
        category: "EXPERIENCE",
        rawValue: "5+ years maybe",
        importance: "NEEDS_REVIEW",
      }),
    ];
    expect(() => assertRequiredPreferredNotCollapsed(requirements)).not.toThrow();
    expect(
      RequirementsExtractionOutputSchema.safeParse({
        kind: "requirements",
        requirements: [
          {
            category: "REQUIRED_SKILL",
            value: "Go",
            importance: "UNKNOWN",
            confidence: null,
            sourceEvidence: "experience with Go preferred or required",
          },
        ],
      }).success
    ).toBe(true);
  });

  it("rejects fabricated evidence not present in snapshot text", () => {
    const requirement = req({
      category: "REQUIRED_SKILL",
      rawValue: "InventedSkill",
      importance: "REQUIRED",
      evidence: { snapshotId: snapId, excerpt: "InventedSkill" },
    });
    const check = validateRequirementEvidenceAgainstSnapshot({
      snapshotId: snapId,
      snapshotText: "Must know React and TypeScript",
      requirement,
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.code).toBe("EVIDENCE_NOT_IN_SNAPSHOT");
  });

  it("accepts evidence excerpt found in snapshot", () => {
    const requirement = req({
      category: "REQUIRED_SKILL",
      rawValue: "React",
      importance: "REQUIRED",
      evidence: { snapshotId: snapId, excerpt: "React" },
    });
    expect(
      validateRequirementEvidenceAgainstSnapshot({
        snapshotId: snapId,
        snapshotText: "Must know React and TypeScript",
        requirement,
      }).ok
    ).toBe(true);
  });
});

describe("Gate 2 — normalization determinism", () => {
  it("normalizes explicit aliases only", () => {
    expect(normalizeRequirementValue("React.js")).toBe("react");
    expect(normalizeRequirementValue("ReactJS")).toBe("react");
    expect(normalizeRequirementValue("React")).toBe("react");
    expect(normalizeRequirementValue("ObscureFrameworkX")).toBe("ObscureFrameworkX");
  });
});

describe("Gate 2 — freshness after new snapshot", () => {
  it("marks JD change as RECOMPUTE_REQUIRED and blocks old set for new snapshot", () => {
    expect(freshnessAfterTrigger("JD_SNAPSHOT_CHANGED")).toBe("RECOMPUTE_REQUIRED");
    expect(
      requirementSetIsUsableForSnapshot({
        requirementSetSnapshotId: snapId,
        analysisSnapshotId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        freshness: "CURRENT",
      })
    ).toBe(false);
    expect(
      requirementSetIsUsableForSnapshot({
        requirementSetSnapshotId: snapId,
        analysisSnapshotId: snapId,
        freshness: "CURRENT",
      })
    ).toBe(true);
  });

  it("invalidateRequirementSetsForJob updates freshness and audits", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = { jobRequirementSet: { updateMany } } as any;
    const count = await invalidateRequirementSetsForJob(tx, {
      organizationId: orgId,
      jobId,
      actorUserId: "11111111-1111-4111-8111-111111111111",
      reason: "JD_SNAPSHOT_CHANGED",
      exceptSnapshotId: snapId,
    });

    expect(count).toBe(2);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jobId,
          freshness: "CURRENT",
          snapshotId: { not: snapId },
        }),
        data: { freshness: "RECOMPUTE_REQUIRED" },
      })
    );
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "JOB_REQUIREMENT_SET_INVALIDATED",
      })
    );
  });
});

describe("Gate 2 — security / isolation", () => {
  it("denies cross-tenant snapshot access", () => {
    expect(rejectsCrossTenant("org-a", "org-b")).toBe(true);
    expect(
      canAccessJobSnapshot({
        viewerOrganizationId: "org-a",
        snapshotOrganizationId: "org-b",
        role: "ADMIN",
        viewerUserId: "u1",
        isOrgPrivilegedStaff: true,
        jobVisibility: "GLOBAL",
      })
    ).toBe(false);
  });

  it("denies private job snapshot to other candidate", () => {
    expect(
      deniesPrivateJobSnapshotToOtherCandidate({
        jobVisibility: "CANDIDATE_PRIVATE",
        jobOwnerCandidateId: "cand-a",
        viewerCandidateId: "cand-b",
      })
    ).toBe(true);
    expect(
      canAccessJobSnapshot({
        viewerOrganizationId: orgId,
        snapshotOrganizationId: orgId,
        role: "CANDIDATE",
        viewerUserId: "u1",
        viewerCandidateId: "cand-b",
        jobVisibility: "CANDIDATE_PRIVATE",
        jobOwnerCandidateId: "cand-a",
        isOrgPrivilegedStaff: false,
      })
    ).toBe(false);
  });

  it("direct-id access still requires org + ownership guards", () => {
    expect(
      canAccessJobSnapshot({
        viewerOrganizationId: orgId,
        snapshotOrganizationId: orgId,
        role: "CANDIDATE",
        viewerUserId: "u1",
        viewerCandidateId: "cand-a",
        jobVisibility: "CANDIDATE_PRIVATE",
        jobOwnerCandidateId: "cand-a",
        isOrgPrivilegedStaff: false,
      })
    ).toBe(true);
  });
});

describe("Gate 2 — extraction contract without AI execution", () => {
  it("NullAIProvider refuses extraction (0 network)", async () => {
    const provider = new NullAIProvider();
    await expect(
      provider.extractRequirements({
        kind: "extract_requirements",
        organizationId: orgId,
        jobId,
        snapshotId: snapId,
        scopedContext: {},
      })
    ).rejects.toThrow(/refuses AI execution|CONFIGURATION_REQUIRED|not authorized/i);
  });

  it("maps extraction output only when evidence is in snapshot", () => {
    const mapped = mapExtractionOutputToStructuredRequirements({
      snapshotId: snapId,
      snapshotText: "Required: React. Preferred: GraphQL.",
      output: {
        kind: "requirements",
        requirements: [
          {
            category: "REQUIRED_SKILL",
            value: "React.js",
            importance: "REQUIRED",
            confidence: 0.8,
            sourceEvidence: "Required: React",
          },
        ],
      },
    });
    expect(mapped[0]?.normalizedValue).toBe("react");
    expect(mapped[0]?.derivation).toBe("AI_EXTRACTED");
  });

  it("builds structured job-field requirements without inventing JD text", () => {
    const fields = buildStructuredJobFieldRequirements({
      snapshotId: snapId,
      job: {
        location: "Remote - US",
        isRemote: true,
        employmentType: "FULL_TIME",
        salaryMin: 100000,
        salaryMax: 150000,
        salaryCurrency: "USD",
      },
    });
    expect(fields.some((f) => f.category === "LOCATION")).toBe(true);
    expect(fields.every((f) => f.derivation === "STRUCTURED_JOB_FIELD")).toBe(true);
    expect(fields.every((f) => f.evidence.snapshotId === snapId)).toBe(true);
  });

  it("persistJobRequirementSet rejects cross-job snapshot binding", async () => {
    const tx = {
      jobDescriptionSnapshot: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as any;
    await expect(
      persistJobRequirementSet(tx, {
        organizationId: orgId,
        jobId,
        snapshotId: snapId,
        actorUserId: "11111111-1111-4111-8111-111111111111",
        requirements: [],
      })
    ).rejects.toThrow(/Snapshot not found/i);
  });

  it("captureJobDescriptionSnapshot reuses identical content hash", async () => {
    const existing = {
      id: snapId,
      organizationId: orgId,
      jobId,
      contentHash: hashJobDescriptionContent("Same JD"),
      sourceVersionId: buildSnapshotSourceVersionId(
        jobId,
        hashJobDescriptionContent("Same JD")
      ),
    };
    const tx = {
      jobDescriptionSnapshot: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      },
    } as any;
    const result = await captureJobDescriptionSnapshot(tx, {
      id: jobId,
      organizationId: orgId,
      jobDescription: "Same JD",
      updatedAt: new Date(),
    });
    expect(result.created).toBe(false);
    expect(tx.jobDescriptionSnapshot.create).not.toHaveBeenCalled();
  });
});

describe("Gate 2 — audit + schema presence", () => {
  it("exposes requirement set audit actions without credential fields", () => {
    expect(INTELLIGENCE_AUDIT_ACTIONS.requirementSetCreated).toBe(
      "JOB_REQUIREMENT_SET_CREATED"
    );
    expect(INTELLIGENCE_AUDIT_ACTIONS.requirementSetInvalidated).toBe(
      "JOB_REQUIREMENT_SET_INVALIDATED"
    );
    expect(INTELLIGENCE_AUDIT_ACTIONS.jdSnapshotCreated).toBe(
      "JOB_DESCRIPTION_SNAPSHOT_CAPTURED"
    );
  });

  it("persists Gate 2 schema fields", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("normalizationVersion");
    expect(schema).toContain("JOB_REQUIREMENT_SET_CREATED");
    expect(schema).toContain("model JobRequirementSet");
    const mig = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261004150000_phase2_gate2_requirement_infrastructure/migration.sql"
      ),
      "utf8"
    );
    expect(mig).toContain("normalizationVersion");
    expect(mig).toContain("JOB_REQUIREMENT_SET_INVALIDATED");
  });
});
