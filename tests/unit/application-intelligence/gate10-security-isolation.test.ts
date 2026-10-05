import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  buildApplicationIntelligenceViewModel,
  loadCandidateApplicationIntelligence,
  loadStaffApplicationIntelligence,
  canViewCandidateVisibleIntelligence,
  canAccessJobSnapshot,
  rejectsCrossTenant,
  rejectsCrossCandidate,
  assertEvidenceAccessScope,
  assertIntelligenceScopeComplete,
  CREDENTIALS_NEVER_EXPOSED,
  isInternalSystem,
  isStaffOnly,
  EXPERIMENTAL_PROVIDER_ENV_KEY,
} from "@/lib/application-intelligence";
import { ApplicationIntelligenceSection } from "@/components/application-intelligence/ApplicationIntelligenceSection";

const ROOT = process.cwd();

const INTEL_TABLES = [
  "job_description_snapshots",
  "job_requirement_sets",
  "application_intelligence_runs",
  "application_alignment_results",
  "application_readiness_results",
  "candidate_fact_attestations",
] as const;

function readMigrations(): string {
  const dir = join(ROOT, "prisma/migrations");
  return readdirSync(dir)
    .filter((name) => !name.startsWith("."))
    .flatMap((name) => {
      const sqlPath = join(dir, name, "migration.sql");
      try {
        return [readFileSync(sqlPath, "utf8")];
      } catch {
        return [];
      }
    })
    .join("\n");
}

function completedView(viewer: "CANDIDATE" | "STAFF" = "CANDIDATE") {
  return buildApplicationIntelligenceViewModel({
    viewer,
    alignment: {
      id: "align-a",
      runId: "run-a",
      freshness: "CURRENT",
      scoringVersion: "scoring.v1",
      overallScore: 70,
      evidence: {
        schemaVersion: "alignment-evidence.v1",
        fitItems: [
          {
            requirementId: "r1",
            requirementValue: "TypeScript",
            importance: "REQUIRED",
            status: "MATCHED",
            reason: "present",
            explanation: "MATCHED TypeScript",
            ruleId: "ALIGN.SKILL.EXACT",
            candidateEvidence: {
              summary: "TypeScript",
              provenance: "CANDIDATE_PROVIDED",
            },
            requirementEvidence: {
              excerpt: "TypeScript required",
              snapshotId: "snap-a",
            },
          },
        ],
        scoringVersion: "scoring.v1",
        normalizationVersion: "normalize.v1",
        explainabilityVersion: "explainability.v1",
      },
      run: {
        id: "run-a",
        status: "SUCCEEDED",
        analysisPurpose: "CANDIDATE_JOB_ALIGNMENT",
        requirementSetId: "set-a",
        snapshotId: "snap-a",
        errorCode: "SHOULD_NOT_LEAK_TO_CANDIDATE",
      },
    },
    readiness: {
      id: "ready-a",
      runId: "run-b",
      freshness: "CURRENT",
      readinessState: "READY",
      blockers: [],
      warnings: [],
      nextActions: [{ code: "NONE", label: "No action" }],
      evidence: {
        schemaVersion: "readiness-evidence.v1",
        readinessVersion: "readiness.v1",
        explainabilityVersion: "explainability.v1",
        unknowns: [],
      },
      run: {
        id: "run-b",
        status: "SUCCEEDED",
        analysisPurpose: "APPLICATION_READINESS",
        errorCode: "PROVIDER_TIMEOUT",
      },
    },
    latestRun: {
      id: "run-b",
      status: "SUCCEEDED",
      analysisPurpose: "APPLICATION_READINESS",
      errorCode: "PROVIDER_TIMEOUT",
      freshness: "CURRENT",
    },
  });
}

describe("Gate 10 — FORCE RLS + grants on intelligence tables", () => {
  it("FORCE ROW LEVEL SECURITY on every Phase 2 intelligence table", () => {
    const sql = readMigrations();
    for (const table of INTEL_TABLES) {
      expect(sql).toContain(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE "public"."${table}" FORCE ROW LEVEL SECURITY`);
    }
  });

  it("grants oos_app_runtime privileges on intelligence tables", () => {
    const gate10 = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261005080000_phase2_gate10_intelligence_force_rls/migration.sql"
      ),
      "utf8"
    );
    for (const table of INTEL_TABLES) {
      expect(gate10).toContain(`"${table}"`);
      expect(gate10).toContain("oos_app_runtime");
    }
  });

  it("does not introduce intelligence-specific SECURITY DEFINER functions", () => {
    const phase2Sql = readdirSync(join(ROOT, "prisma/migrations"))
      .filter((n) => n.includes("phase2_") || n.includes("gate10_intelligence"))
      .map((n) => {
        try {
          return readFileSync(join(ROOT, "prisma/migrations", n, "migration.sql"), "utf8");
        } catch {
          return "";
        }
      })
      .join("\n");
    // Policies may call existing helpers; no new DEFINER bodies for intelligence.
    expect(phase2Sql).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION[\s\S]{0,200}intelligence/i
    );
  });
});

describe("Gate 10 — access-path inventory invariants", () => {
  it("detail pages use ownership-checking loaders (not trust-only authorized loader)", () => {
    const candidatePage = readFileSync(
      join(ROOT, "src/app/(dashboard)/candidate/applications/[id]/page.tsx"),
      "utf8"
    );
    const employeePage = readFileSync(
      join(ROOT, "src/app/(dashboard)/employee/applications/[id]/page.tsx"),
      "utf8"
    );
    expect(candidatePage).toContain("loadCandidateApplicationIntelligence");
    expect(candidatePage).toContain("candidateId: candidate.id");
    expect(candidatePage).not.toContain("loadAuthorizedApplicationIntelligence");
    expect(employeePage).toContain("loadStaffApplicationIntelligence");
    expect(employeePage).toContain("organizationId: ctx.organizationId");
    expect(employeePage).not.toContain("loadAuthorizedApplicationIntelligence");
  });

  it("loader never authorizes via alignment/readiness/run result IDs", () => {
    const loader = readFileSync(
      join(
        ROOT,
        "src/lib/application-intelligence/load-application-intelligence.ts"
      ),
      "utf8"
    );
    expect(loader).not.toMatch(/params\.(alignmentResultId|readinessResultId|runId)/);
    expect(loader).toContain("where: { applicationId }");
    expect(loader).toContain("candidateId: params.candidateId");
    expect(loader).toContain("organizationId: params.organizationId");
  });

  it("cron worker authenticates by CRON_SECRET and does not accept client org/candidate IDs", () => {
    const cron = readFileSync(
      join(ROOT, "src/app/api/cron/intelligence-worker/route.ts"),
      "utf8"
    );
    expect(cron).toContain("CRON_SECRET");
    expect(cron).toContain("Unauthorized");
    expect(cron).not.toContain("organizationId");
    expect(cron).not.toContain("candidateId");
    expect(cron).not.toContain("alignmentResultId");
  });

  it("no unguarded intelligence HTTP API routes beyond cron worker", () => {
    const apiRoot = join(ROOT, "src/app/api");
    const stack = [apiRoot];
    const routes: string[] = [];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.name === "route.ts") routes.push(full);
      }
    }
    const intelRoutes = routes.filter((r) =>
      /intelligence|alignment|readiness|requirement-set|snapshot/i.test(r)
    );
    expect(intelRoutes).toEqual([
      join(ROOT, "src/app/api/cron/intelligence-worker/route.ts"),
    ]);
  });
});

describe("Gate 10 — tenant / candidate / application isolation (loaders)", () => {
  it("Candidate A cannot load Candidate B application intelligence", async () => {
    const db = {
      application: {
        findFirst: async (args: {
          where: { id: string; candidateId: string };
        }) => {
          if (
            args.where.id === "app-b" &&
            args.where.candidateId === "cand-a"
          ) {
            return null;
          }
          return { id: args.where.id };
        },
      },
      applicationAlignmentResult: {
        findFirst: async () => {
          throw new Error("must not query intelligence after DENY");
        },
      },
      applicationReadinessResult: { findFirst: async () => null },
      applicationIntelligenceRun: { findFirst: async () => null },
    } as any;

    const denied = await loadCandidateApplicationIntelligence({
      db,
      applicationId: "app-b",
      candidateId: "cand-a",
    });
    expect(denied).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("Org A staff cannot load Org B application intelligence", async () => {
    const db = {
      application: {
        findFirst: async () => null,
      },
      applicationAlignmentResult: {
        findFirst: async () => {
          throw new Error("must not query intelligence after DENY");
        },
      },
      applicationReadinessResult: { findFirst: async () => null },
      applicationIntelligenceRun: { findFirst: async () => null },
    } as any;

    const denied = await loadStaffApplicationIntelligence({
      db,
      applicationId: "app-org-b",
      organizationId: "org-a",
    });
    expect(denied).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("same candidate different application cannot load sibling intelligence by mismatched ownership filter", async () => {
    // Authorization is application-scoped: ownership check uses exact applicationId.
    let queriedApplicationId: string | null = null;
    const db = {
      application: {
        findFirst: async (args: {
          where: { id: string; candidateId: string };
        }) => {
          expect(args.where.candidateId).toBe("cand-a");
          if (args.where.id === "app-a") return { id: "app-a" };
          return null;
        },
      },
      applicationAlignmentResult: {
        findFirst: async (args: { where: { applicationId: string } }) => {
          queriedApplicationId = args.where.applicationId;
          return null;
        },
      },
      applicationReadinessResult: {
        findFirst: async () => null,
      },
      applicationIntelligenceRun: {
        findFirst: async () => null,
      },
    } as any;

    const ok = await loadCandidateApplicationIntelligence({
      db,
      applicationId: "app-a",
      candidateId: "cand-a",
    });
    expect(ok.ok).toBe(true);
    expect(queriedApplicationId).toBe("app-a");

    const denyB = await loadCandidateApplicationIntelligence({
      db,
      applicationId: "app-b",
      candidateId: "cand-a",
    });
    expect(denyB.ok).toBe(false);
  });

  it("rejectsCrossTenant / rejectsCrossCandidate helpers enforce graph edges", () => {
    expect(rejectsCrossTenant("org-a", "org-b")).toBe(true);
    expect(rejectsCrossTenant("org-a", "org-a")).toBe(false);
    expect(rejectsCrossCandidate("cand-a", "cand-b")).toBe(true);
    expect(rejectsCrossCandidate("cand-a", "cand-a")).toBe(false);
  });
});

describe("Gate 10 — private job + role matrix", () => {
  it("blocks Candidate B from Candidate A private job snapshot", () => {
    expect(
      canAccessJobSnapshot({
        viewerOrganizationId: "org-a",
        snapshotOrganizationId: "org-a",
        role: "CANDIDATE",
        viewerUserId: "user-b",
        viewerCandidateId: "cand-b",
        jobVisibility: "CANDIDATE_PRIVATE",
        jobOwnerCandidateId: "cand-a",
        isOrgPrivilegedStaff: false,
      })
    ).toBe(false);

    expect(
      canAccessJobSnapshot({
        viewerOrganizationId: "org-a",
        snapshotOrganizationId: "org-a",
        role: "CANDIDATE",
        viewerUserId: "user-a",
        viewerCandidateId: "cand-a",
        jobVisibility: "CANDIDATE_PRIVATE",
        jobOwnerCandidateId: "cand-a",
        isOrgPrivilegedStaff: false,
      })
    ).toBe(true);
  });

  it("assertEvidenceAccessScope denies cross-tenant and private-job leaks", () => {
    expect(() =>
      assertEvidenceAccessScope({
        viewerOrganizationId: "org-a",
        recordOrganizationId: "org-b",
        viewerCandidateId: "cand-b",
        recordCandidateId: "cand-a",
        role: "CANDIDATE",
        jobVisibility: "GLOBAL",
        jobOwnerCandidateId: null,
      })
    ).toThrow(/Cross-tenant evidence access denied/i);

    expect(() =>
      assertEvidenceAccessScope({
        viewerOrganizationId: "org-a",
        recordOrganizationId: "org-a",
        viewerCandidateId: "cand-b",
        recordCandidateId: "cand-a",
        role: "CANDIDATE",
        jobVisibility: "CANDIDATE_PRIVATE",
        jobOwnerCandidateId: "cand-a",
      })
    ).toThrow(/Cross-candidate|Private job evidence access denied/i);
  });

  it("role matrix: candidate own-only; staff same-org; unauthenticated denied by sameOrganization=false", () => {
    expect(
      canViewCandidateVisibleIntelligence({
        role: "CANDIDATE",
        viewerUserId: "u-a",
        candidateUserId: "u-a",
        sameOrganization: true,
      })
    ).toBe(true);
    expect(
      canViewCandidateVisibleIntelligence({
        role: "CANDIDATE",
        viewerUserId: "u-a",
        candidateUserId: "u-b",
        sameOrganization: true,
      })
    ).toBe(false);
    expect(
      canViewCandidateVisibleIntelligence({
        role: "EMPLOYEE",
        viewerUserId: "staff",
        candidateUserId: "u-a",
        sameOrganization: true,
      })
    ).toBe(true);
    expect(
      canViewCandidateVisibleIntelligence({
        role: "ADMIN",
        viewerUserId: "admin",
        candidateUserId: "u-a",
        sameOrganization: false,
      })
    ).toBe(false);
  });
});

describe("Gate 10 — parameter confusion + client manipulation", () => {
  it("scope completeness rejects missing parent fields", () => {
    expect(() =>
      assertIntelligenceScopeComplete({
        organizationId: "org",
        candidateId: "cand",
        applicationId: "",
        jobId: "job",
      } as any)
    ).toThrow(/applicationId/);
  });

  it("request helpers re-validate org+candidate+application+job (source contract)", () => {
    for (const file of ["runs.ts", "alignment.ts", "readiness.ts"]) {
      const src = readFileSync(
        join(ROOT, "src/lib/application-intelligence", file),
        "utf8"
      );
      expect(src).toMatch(/organizationId/);
      expect(src).toMatch(/candidateId/);
      expect(src).toMatch(/applicationId/);
      expect(src).toMatch(/jobId/);
      expect(src).toMatch(/findFirst|findUnique/);
    }
  });

  it("UI/components never accept organizationId or candidateId as client props for authorization", () => {
    const section = readFileSync(
      join(
        ROOT,
        "src/components/application-intelligence/ApplicationIntelligenceSection.tsx"
      ),
      "utf8"
    );
    const panel = readFileSync(
      join(
        ROOT,
        "src/components/application-intelligence/ApplicationIntelligencePanel.tsx"
      ),
      "utf8"
    );
    expect(section).not.toMatch(/organizationId|candidateId/);
    expect(panel).not.toMatch(/organizationId|candidateId/);
  });
});

describe("Gate 10 — internal information + provider secret boundary", () => {
  it("candidate view model nulls staffMeta and never surfaces error diagnostics", () => {
    const view = completedView("CANDIDATE");
    expect(view.staffMeta).toBeNull();
    const html = renderToStaticMarkup(
      createElement(ApplicationIntelligenceSection, {
        view,
        audience: "candidate",
      })
    );
    expect(html).not.toContain("SHOULD_NOT_LEAK_TO_CANDIDATE");
    expect(html).not.toContain("PROVIDER_TIMEOUT");
    expect(html).not.toContain("Staff operational metadata");
    expect(html).not.toContain("InternalNote");
    expect(html).not.toContain("NVIDIA");
    expect(html).not.toContain("nvapi-");
  });

  it("staff view may include operational ids but not credentials", () => {
    const view = completedView("STAFF");
    expect(view.staffMeta?.alignmentResultId).toBe("align-a");
    const html = renderToStaticMarkup(
      createElement(ApplicationIntelligenceSection, {
        view,
        audience: "staff",
      })
    );
    expect(html).toContain("staff metadata");
    expect(html).not.toContain("NVIDIA_API_KEY");
    expect(html).not.toContain("nvapi-");
    expect(isStaffOnly("failureDiagnostics")).toBe(true);
    expect(isInternalSystem("rawProviderPayload")).toBe(true);
    expect(CREDENTIALS_NEVER_EXPOSED).toBe(true);
    expect(EXPERIMENTAL_PROVIDER_ENV_KEY).toBe("NVIDIA_API_KEY");
  });

  it("source tree intelligence UI/loaders never reference NVIDIA_API_KEY", () => {
    const files = [
      "src/lib/application-intelligence/load-application-intelligence.ts",
      "src/lib/application-intelligence/presentation.ts",
      "src/components/application-intelligence/ApplicationIntelligenceSection.tsx",
      "src/components/application-intelligence/ApplicationIntelligencePanel.tsx",
      "src/app/(dashboard)/candidate/applications/[id]/page.tsx",
      "src/app/(dashboard)/employee/applications/[id]/page.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src).not.toMatch(/NVIDIA_API_KEY|nvapi-/);
    }
  });
});

describe("Gate 10 — historical / failed run isolation (authorization unchanged)", () => {
  it("STALE and FAILED phases still go through ownership loaders", async () => {
    const stale = buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: {
        id: "align-stale",
        runId: "run-stale",
        freshness: "STALE",
        scoringVersion: "scoring.v1",
        overallScore: 40,
        evidence: { fitItems: [] },
        run: {
          id: "run-stale",
          status: "SUCCEEDED",
          analysisPurpose: "CANDIDATE_JOB_ALIGNMENT",
          requirementSetId: "set",
          snapshotId: "snap",
          errorCode: null,
        },
      },
      readiness: null,
      latestRun: {
        id: "run-stale",
        status: "SUCCEEDED",
        analysisPurpose: "CANDIDATE_JOB_ALIGNMENT",
        errorCode: null,
        freshness: "STALE",
      },
    });
    expect(stale.phase).toBe("STALE");

    const failed = buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: null,
      readiness: null,
      latestRun: {
        id: "run-fail",
        status: "FAILED",
        analysisPurpose: "APPLICATION_INTELLIGENCE",
        errorCode: "SECRET",
        freshness: "CURRENT",
      },
    });
    expect(failed.phase).toBe("FAILED");
    expect(failed.staffMeta).toBeNull();
    const html = renderToStaticMarkup(
      createElement(ApplicationIntelligenceSection, {
        view: failed,
        audience: "candidate",
      })
    );
    expect(html).not.toContain("SECRET");
  });
});

describe("Gate 10 — negative matrix (formal)", () => {
  const matrix: Array<{
    actor: string;
    target: string;
    expected: "ALLOW" | "DENY";
    check: () => boolean;
  }> = [
    {
      actor: "Candidate A",
      target: "Own intelligence",
      expected: "ALLOW",
      check: () =>
        canViewCandidateVisibleIntelligence({
          role: "CANDIDATE",
          viewerUserId: "a",
          candidateUserId: "a",
          sameOrganization: true,
        }),
    },
    {
      actor: "Candidate A",
      target: "Candidate B intelligence",
      expected: "DENY",
      check: () =>
        !canViewCandidateVisibleIntelligence({
          role: "CANDIDATE",
          viewerUserId: "a",
          candidateUserId: "b",
          sameOrganization: true,
        }),
    },
    {
      actor: "Candidate A",
      target: "Org B intelligence",
      expected: "DENY",
      check: () =>
        !canViewCandidateVisibleIntelligence({
          role: "CANDIDATE",
          viewerUserId: "a",
          candidateUserId: "a",
          sameOrganization: false,
        }) && rejectsCrossTenant("org-a", "org-b"),
    },
    {
      actor: "Employee A",
      target: "Authorized org application",
      expected: "ALLOW",
      check: () =>
        canViewCandidateVisibleIntelligence({
          role: "EMPLOYEE",
          viewerUserId: "e",
          candidateUserId: "a",
          sameOrganization: true,
        }),
    },
    {
      actor: "Employee A",
      target: "Other organization",
      expected: "DENY",
      check: () =>
        !canViewCandidateVisibleIntelligence({
          role: "EMPLOYEE",
          viewerUserId: "e",
          candidateUserId: "a",
          sameOrganization: false,
        }),
    },
    {
      actor: "Admin A",
      target: "Other organization",
      expected: "DENY",
      check: () =>
        !canViewCandidateVisibleIntelligence({
          role: "ADMIN",
          viewerUserId: "admin",
          candidateUserId: "a",
          sameOrganization: false,
        }),
    },
    {
      actor: "Anonymous",
      target: "Any intelligence",
      expected: "DENY",
      check: () =>
        !canViewCandidateVisibleIntelligence({
          role: "CANDIDATE",
          viewerUserId: "",
          candidateUserId: "a",
          sameOrganization: false,
        }),
    },
  ];

  for (const row of matrix) {
    it(`${row.actor} → ${row.target} = ${row.expected}`, () => {
      expect(row.check()).toBe(true);
    });
  }
});

describe("Gate 10 — performance safety (no get-all-then-filter)", () => {
  it("loaders constrain by applicationId / ownership before intelligence reads", () => {
    const loader = readFileSync(
      join(
        ROOT,
        "src/lib/application-intelligence/load-application-intelligence.ts"
      ),
      "utf8"
    );
    expect(loader).not.toMatch(/findMany\(\s*\)/);
    expect(loader).not.toMatch(/findMany\(\{\s*\}\)/);
    expect(loader).toContain('where: { applicationId }');
    expect(loader).toContain("findFirst");
  });
});
