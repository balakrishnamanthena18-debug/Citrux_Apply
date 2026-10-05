import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildApplicationIntelligenceViewModel } from "@/lib/application-intelligence/presentation";
import type { ApplicationIntelligenceViewModel } from "@/lib/application-intelligence/presentation";
import { ApplicationIntelligenceSection } from "@/components/application-intelligence/ApplicationIntelligenceSection";
import { ApplicationIntelligencePanel } from "@/components/application-intelligence/ApplicationIntelligencePanel";
import {
  ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
  EXPLAINABILITY_CONTRACT_VERSION,
  INTELLIGENCE_SCORING_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
} from "@/lib/application-intelligence";

const ROOT = process.cwd();

function baseCompletedInput(overrides?: {
  freshness?: string;
  readinessState?: string;
  runStatus?: string;
  fitItems?: unknown[];
  blockers?: unknown[];
  warnings?: unknown[];
  unknowns?: unknown[];
  nextActions?: unknown[];
  overallScore?: number | null;
  viewer?: "CANDIDATE" | "STAFF";
}) {
  const fitItems = overrides?.fitItems ?? [
    {
      requirementId: "req-python",
      requirementValue: "5+ years Python",
      importance: "REQUIRED",
      status: "PARTIAL",
      reason: "3.5 verified years against 5+ threshold",
      explanation:
        'Requirement "5+ years Python (REQUIRED)" is PARTIAL. Candidate evidence: 3.5 verified years.',
      ruleId: "ALIGN.EXPERIENCE.THRESHOLD",
      candidateEvidence: {
        summary: "3.5 verified years",
        provenance: "VERIFIED",
      },
      requirementEvidence: {
        excerpt: "5+ years of Python experience",
        snapshotId: "snap-1",
      },
    },
    {
      requirementId: "req-aws",
      requirementValue: "AWS",
      importance: "PREFERRED",
      status: "MATCHED",
      reason: "Skill present",
      explanation: 'Requirement "AWS (PREFERRED)" is MATCHED.',
      ruleId: "ALIGN.SKILL.EXACT",
      candidateEvidence: {
        summary: "AWS",
        provenance: "CANDIDATE_PROVIDED",
      },
      requirementEvidence: {
        excerpt: "AWS preferred",
        snapshotId: "snap-1",
      },
    },
    {
      requirementId: "req-go",
      requirementValue: "Go",
      importance: "REQUIRED",
      status: "MISSING",
      reason: "No matching skill",
      explanation: 'Requirement "Go (REQUIRED)" is MISSING.',
      ruleId: "ALIGN.SKILL.EXACT",
      candidateEvidence: null,
      requirementEvidence: {
        excerpt: "Go experience required",
        snapshotId: "snap-1",
      },
    },
    {
      requirementId: "req-clearance",
      requirementValue: "Security clearance",
      importance: "PREFERRED",
      status: "UNKNOWN",
      reason: "No authoritative fact",
      explanation: 'Requirement "Security clearance (PREFERRED)" is UNKNOWN.',
      ruleId: "ALIGN.CATEGORY.UNSUPPORTED",
      candidateEvidence: null,
      requirementEvidence: {
        excerpt: "Clearance preferred",
        snapshotId: "snap-1",
      },
    },
  ];

  return {
    viewer: overrides?.viewer ?? ("CANDIDATE" as const),
    alignment: {
      id: "align-1",
      runId: "run-1",
      freshness: overrides?.freshness ?? "CURRENT",
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      overallScore:
        overrides && "overallScore" in overrides
          ? (overrides.overallScore as number | null)
          : 62,
      evidence: {
        schemaVersion: ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
        fitItems,
        scoringVersion: INTELLIGENCE_SCORING_VERSION,
        normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
        explainabilityVersion: EXPLAINABILITY_CONTRACT_VERSION,
      },
      run: {
        id: "run-1",
        status: overrides?.runStatus ?? "SUCCEEDED",
        analysisPurpose: "CANDIDATE_JOB_ALIGNMENT",
        requirementSetId: "set-1",
        snapshotId: "snap-1",
        errorCode: null,
      },
    },
    readiness: {
      id: "ready-1",
      runId: "run-2",
      freshness: overrides?.freshness ?? "CURRENT",
      readinessState: overrides?.readinessState ?? "READY_WITH_WARNINGS",
      blockers: overrides?.blockers ?? [],
      warnings: overrides?.warnings ?? [
        {
          code: "PREFERRED_REQUIREMENT_GAP",
          severity: "WARNING",
          message: "Preferred requirement gap",
          why: "A preferred requirement is not fully matched.",
          explanation: "Preferred gap warning",
          ruleId: "READINESS.PREFERRED_REQUIREMENT_GAP",
          resolveAction: "NONE",
        },
      ],
      nextActions: overrides?.nextActions ?? [
        { code: "REVIEW_PREFERRED_GAPS", label: "Review preferred gaps before submit" },
      ],
      evidence: {
        schemaVersion: "readiness-evidence.v1",
        readinessVersion: "readiness.v1",
        explainabilityVersion: EXPLAINABILITY_CONTRACT_VERSION,
        unknowns: overrides?.unknowns ?? [],
        normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
      },
      run: {
        id: "run-2",
        status: "SUCCEEDED",
        analysisPurpose: "APPLICATION_READINESS",
        errorCode: null,
      },
    },
    latestRun: {
      id: "run-2",
      status: overrides?.runStatus ?? "SUCCEEDED",
      analysisPurpose: "APPLICATION_READINESS",
      errorCode: null,
      freshness: overrides?.freshness ?? "CURRENT",
    },
  };
}

function renderSection(
  view: ApplicationIntelligenceViewModel,
  audience: "candidate" | "staff" = "candidate"
) {
  return renderToStaticMarkup(
    createElement(ApplicationIntelligenceSection, { view, audience })
  );
}

describe("Gate 9 — presentation view model", () => {
  it("builds CURRENT completed intelligence from persisted payloads", () => {
    const view = buildApplicationIntelligenceViewModel(baseCompletedInput());
    expect(view.phase).toBe("CURRENT");
    expect(view.overallScore).toBe(62);
    expect(view.readinessState).toBe("READY_WITH_WARNINGS");
    expect(view.counts).toEqual({
      matched: 1,
      partial: 1,
      missing: 1,
      unknown: 1,
      required: 2,
      preferred: 2,
    });
    expect(view.fitItems.some((f) => f.status === "MISSING")).toBe(true);
    expect(view.fitItems.some((f) => f.importance === "REQUIRED")).toBe(true);
    expect(view.fitItems.some((f) => f.importance === "PREFERRED")).toBe(true);
    expect(view.staffMeta).toBeNull();
  });

  it("exposes staff operational metadata only for STAFF viewer", () => {
    const candidate = buildApplicationIntelligenceViewModel(
      baseCompletedInput({ viewer: "CANDIDATE" })
    );
    const staff = buildApplicationIntelligenceViewModel(
      baseCompletedInput({ viewer: "STAFF" })
    );
    expect(candidate.staffMeta).toBeNull();
    expect(staff.staffMeta?.alignmentResultId).toBe("align-1");
    expect(staff.staffMeta?.readinessResultId).toBe("ready-1");
    expect(staff.staffMeta?.errorCode).toBeNull();
  });

  it("maps NOT_AVAILABLE / PENDING / FAILED / STALE phases", () => {
    const empty = buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: null,
      readiness: null,
      latestRun: null,
    });
    expect(empty.phase).toBe("NOT_AVAILABLE");
    expect(empty.messaging.title).toMatch(/hasn.?t been assessed/i);

    const pending = buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: null,
      readiness: null,
      latestRun: {
        id: "r1",
        status: "RUNNING",
        analysisPurpose: "APPLICATION_INTELLIGENCE",
        errorCode: null,
        freshness: "CURRENT",
      },
    });
    expect(pending.phase).toBe("PENDING");
    expect(pending.messaging.title).toMatch(/reviewing your profile/i);

    const failed = buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: null,
      readiness: null,
      latestRun: {
        id: "r1",
        status: "FAILED",
        analysisPurpose: "APPLICATION_INTELLIGENCE",
        errorCode: "PROVIDER_TIMEOUT",
        freshness: "CURRENT",
      },
    });
    expect(failed.phase).toBe("FAILED");
    expect(failed.messaging.title).toMatch(/couldn.?t complete the assessment/i);

    const stale = buildApplicationIntelligenceViewModel(
      baseCompletedInput({ freshness: "STALE" })
    );
    expect(stale.phase).toBe("STALE");
    expect(stale.messaging.title).toMatch(/out of date/i);
  });

  it("maps all readiness states without inventing scores", () => {
    for (const state of [
      "READY",
      "READY_WITH_WARNINGS",
      "REVIEW_REQUIRED",
      "BLOCKED",
      "UNKNOWN",
    ] as const) {
      const view = buildApplicationIntelligenceViewModel(
        baseCompletedInput({
          readinessState: state,
          overallScore: null,
          blockers:
            state === "BLOCKED"
              ? [
                  {
                    code: "MISSING_APPROVAL",
                    severity: "BLOCKER",
                    message: "Candidate approval missing",
                    why: "Approval is required before submit.",
                    resolveAction: "REQUEST_APPROVAL",
                  },
                ]
              : [],
        })
      );
      expect(view.readinessState).toBe(state);
      expect(view.overallScore).toBeNull();
    }
  });
});

describe("Gate 9 — UI rendering states", () => {
  it("renders intelligence section for completed analysis", () => {
    const html = renderSection(
      buildApplicationIntelligenceViewModel(baseCompletedInput())
    );
    expect(html).toContain("Application Assessment");
    expect(html).toContain('data-testid="application-intelligence-section"');
    expect(html).toContain("Good match, with a few things to review");
    expect(html).toContain("5+ years Python");
    expect(html).toContain("3.5 verified years");
    expect(html).toContain("View detailed assessment");
    // Technical enums remain available under detailed assessment disclosure
    expect(html).toContain("PARTIAL");
    expect(html).toContain("MATCHED");
    expect(html).toContain("MISSING");
    expect(html).toContain("UNKNOWN");
    expect(html).toContain("REQUIRED");
    expect(html).toContain("PREFERRED");
    expect(html).not.toContain("92%");
  });

  it("renders empty / pending / failed / stale states honestly", () => {
    const empty = renderSection(
      buildApplicationIntelligenceViewModel({
        viewer: "CANDIDATE",
        alignment: null,
        readiness: null,
        latestRun: null,
      })
    );
    expect(empty).toContain("hasn&#x27;t been assessed yet");
    expect(empty).toContain("does not mean that you are a poor match");

    const pending = renderSection(
      buildApplicationIntelligenceViewModel({
        viewer: "CANDIDATE",
        alignment: null,
        readiness: null,
        latestRun: {
          id: "r1",
          status: "QUEUED",
          analysisPurpose: "APPLICATION_INTELLIGENCE",
          errorCode: null,
          freshness: "CURRENT",
        },
      })
    );
    expect(pending).toContain("reviewing your profile");
    expect(pending).not.toContain("QUEUED");
    expect(pending).not.toContain("%");

    const failed = renderSection(
      buildApplicationIntelligenceViewModel({
        viewer: "CANDIDATE",
        alignment: null,
        readiness: null,
        latestRun: {
          id: "r1",
          status: "FAILED",
          analysisPurpose: "APPLICATION_INTELLIGENCE",
          errorCode: "SECRET_KEY_LEAK",
          freshness: "CURRENT",
        },
      })
    );
    expect(failed).toContain("couldn&#x27;t complete the assessment");
    expect(failed).not.toContain("SECRET_KEY_LEAK");
    expect(failed).not.toContain("stack");

    const stale = renderSection(
      buildApplicationIntelligenceViewModel(
        baseCompletedInput({ freshness: "STALE" })
      )
    );
    expect(stale).toContain("may be out of date");
    const stalePrimary = stale.split("View detailed assessment")[0]!;
    expect(stalePrimary).not.toMatch(/>STALE</);
  });

  it("renders readiness READY and BLOCKED with blockers / next actions", () => {
    const ready = renderSection(
      buildApplicationIntelligenceViewModel(
        baseCompletedInput({ readinessState: "READY", warnings: [], nextActions: [] })
      )
    );
    expect(ready).toContain("Strong match");

    const blocked = renderSection(
      buildApplicationIntelligenceViewModel(
        baseCompletedInput({
          readinessState: "BLOCKED",
          blockers: [
            {
              code: "MISSING_APPROVAL",
              severity: "BLOCKER",
              message: "Candidate approval missing",
              why: "Approval is required before submit.",
              resolveAction: "REQUEST_APPROVAL",
            },
          ],
          nextActions: [
            { code: "REQUEST_APPROVAL", label: "Request candidate approval" },
          ],
        })
      )
    );
    expect(blocked).toContain("Important to resolve");
    expect(blocked).toContain("Candidate approval missing");
    expect(blocked).toContain("candidate approval");
    expect(blocked).toContain("does not change");
    expect(blocked).toContain("application state");
  });

  it("hides staff metadata from candidates and shows it for staff", () => {
    const input = baseCompletedInput({ viewer: "STAFF" });
    const staffView = buildApplicationIntelligenceViewModel(input);
    const candidateView = buildApplicationIntelligenceViewModel({
      ...input,
      viewer: "CANDIDATE",
    });

    const staffHtml = renderSection(staffView, "staff");
    const candidateHtml = renderSection(candidateView, "candidate");

    expect(staffHtml).toContain("staff metadata");
    expect(staffHtml).toContain("align-1");
    expect(candidateHtml).not.toContain("staff metadata");
    expect(candidateHtml).not.toContain("align-1");
  });

  it("isolates intelligence load failure without inventing fit data", () => {
    const html = renderToStaticMarkup(
      createElement(ApplicationIntelligencePanel, {
        view: null,
        audience: "candidate",
        loadFailed: true,
      })
    );
    expect(html).toContain('data-testid="application-intelligence-error"');
    expect(html).toContain("couldn&#x27;t load your assessment");
    expect(html).not.toContain("matched");
    expect(html).not.toContain("Your match");
  });

  it("uses stacked cards and details disclosure (no giant table markup)", () => {
    const html = renderSection(
      buildApplicationIntelligenceViewModel(baseCompletedInput())
    );
    expect(html).not.toContain("<table");
    expect(html).toContain("<details");
    expect(html).toContain('aria-labelledby="application-intelligence-heading"');
    expect(html).toContain("focus-visible:ring-2");

    const pending = renderSection(
      buildApplicationIntelligenceViewModel({
        viewer: "CANDIDATE",
        alignment: null,
        readiness: null,
        latestRun: {
          id: "r1",
          status: "RUNNING",
          analysisPurpose: "APPLICATION_INTELLIGENCE",
          errorCode: null,
          freshness: "CURRENT",
        },
      })
    );
    expect(pending).toContain('role="status"');
  });
});

describe("Gate 9 — Application Detail integration + authorization boundaries", () => {
  it("integrates into candidate and employee application detail pages", () => {
    const candidatePage = readFileSync(
      join(ROOT, "src/app/(dashboard)/candidate/applications/[id]/page.tsx"),
      "utf8"
    );
    const employeePage = readFileSync(
      join(ROOT, "src/app/(dashboard)/employee/applications/[id]/page.tsx"),
      "utf8"
    );
    expect(candidatePage).toContain("ApplicationIntelligencePanel");
    expect(candidatePage).toContain("loadCandidateApplicationIntelligence");
    expect(candidatePage).toContain("candidateId: candidate.id");
    expect(candidatePage).toContain("intelligenceLoadFailed");
    expect(employeePage).toContain("ApplicationIntelligencePanel");
    expect(employeePage).toContain("loadStaffApplicationIntelligence");
    expect(employeePage).toContain("organizationId: ctx.organizationId");
    expect(employeePage).toContain("InternalNotesWidget");
  });

  it("loader enforces candidate ownership and staff org scope", () => {
    const loader = readFileSync(
      join(
        ROOT,
        "src/lib/application-intelligence/load-application-intelligence.ts"
      ),
      "utf8"
    );
    expect(loader).toContain("candidateId: params.candidateId");
    expect(loader).toContain("organizationId: params.organizationId");
    expect(loader).toContain("applicationAlignmentResult.findFirst");
    expect(loader).toContain("applicationReadinessResult.findFirst");
    expect(loader).not.toMatch(/computeDeterministicAlignment|computeDeterministicReadiness/);
    expect(loader).not.toMatch(/NvidiaDeepSeekAdapter|openai|anthropic/i);
  });

  it("does not create new top-level intelligence navigation", () => {
    const sidebar = readFileSync(
      join(ROOT, "src/components/navigation/AppSidebar.tsx"),
      "utf8"
    );
    const careerNav = readFileSync(
      join(ROOT, "src/components/candidate/CandidateCareerNav.tsx"),
      "utf8"
    );
    expect(sidebar).not.toMatch(/href=.*intelligence/i);
    expect(careerNav).not.toMatch(/href=.*intelligence/i);
  });

  it("UI remains read-only (no lifecycle / scoring mutation actions)", () => {
    const section = readFileSync(
      join(
        ROOT,
        "src/components/application-intelligence/ApplicationIntelligenceSection.tsx"
      ),
      "utf8"
    );
    const presentation = readFileSync(
      join(ROOT, "src/lib/application-intelligence/presentation.ts"),
      "utf8"
    );
    expect(section).not.toMatch(/transitionApplication|withdrawApplication|approveApplication/);
    expect(section).not.toMatch(/computeDeterministic/);
    expect(presentation).not.toMatch(/computeDeterministic/);
    expect(section).toMatch(/does not change/);
    expect(section).toMatch(/application state/);
  });
});

describe("Gate 9 — regressions Gate 4–8 contracts untouched by UI layer", () => {
  it("keeps Gate 8 explainability versions and MISSING vocabulary", () => {
    expect(EXPLAINABILITY_CONTRACT_VERSION).toBe("explainability.v1");
    expect(ALIGNMENT_EVIDENCE_SCHEMA_VERSION).toBe("alignment-evidence.v1");
    const human = readFileSync(
      join(ROOT, "src/lib/application-intelligence/human-assessment.ts"),
      "utf8"
    );
    expect(human).toContain("MISSING");
    expect(human).toContain("MATCHED");
    expect(human).not.toContain("MISMATCH");
  });

  it("does not add Evidence model or scoring weight changes in schema", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).not.toMatch(/model Evidence\b/);
    expect(schema).toContain("ApplicationAlignmentResult");
    expect(schema).toContain("ApplicationReadinessResult");
  });

  it("Gate 4–8 unit modules remain importable (smoke)", async () => {
    const g4 = await import(
      "@/lib/application-intelligence/pipeline"
    );
    const g6 = await import(
      "@/lib/application-intelligence/alignment"
    );
    const g7 = await import(
      "@/lib/application-intelligence/readiness"
    );
    const g8 = await import(
      "@/lib/application-intelligence/evidence-contract"
    );
    expect(typeof g4.executeIntelligenceRunPipeline).toBe("function");
    expect(typeof g6.computeDeterministicAlignment).toBe("function");
    expect(typeof g7.computeDeterministicReadiness).toBe("function");
    expect(typeof g8.enrichAlignmentEvidencePayload).toBe("function");
  });
});

describe("Gate 9 — loader authorization / IDOR", () => {
  it("denies candidate access when application is not owned", async () => {
    const {
      loadCandidateApplicationIntelligence,
      loadStaffApplicationIntelligence,
    } = await import(
      "@/lib/application-intelligence/load-application-intelligence"
    );

    const db = {
      application: {
        findFirst: async () => null,
      },
      applicationAlignmentResult: {
        findFirst: async () => {
          throw new Error("must not load intelligence before authz");
        },
      },
      applicationReadinessResult: {
        findFirst: async () => null,
      },
      applicationIntelligenceRun: {
        findFirst: async () => null,
      },
    } as any;

    const denied = await loadCandidateApplicationIntelligence({
      db,
      applicationId: "app-b",
      candidateId: "cand-a",
    });
    expect(denied).toEqual({ ok: false, reason: "NOT_FOUND" });

    const staffDenied = await loadStaffApplicationIntelligence({
      db,
      applicationId: "app-tenant-b",
      organizationId: "org-a",
    });
    expect(staffDenied).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("loads intelligence only after ownership/org check succeeds", async () => {
    const { loadCandidateApplicationIntelligence } = await import(
      "@/lib/application-intelligence/load-application-intelligence"
    );

    let alignmentQueried = false;
    const db = {
      application: {
        findFirst: async (args: {
          where: { id: string; candidateId: string };
        }) => {
          expect(args.where.id).toBe("app-a");
          expect(args.where.candidateId).toBe("cand-a");
          return { id: "app-a" };
        },
      },
      applicationAlignmentResult: {
        findFirst: async () => {
          alignmentQueried = true;
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
    if (ok.ok) {
      expect(ok.view.phase).toBe("NOT_AVAILABLE");
    }
    expect(alignmentQueried).toBe(true);
  });

  it("does not accept alignment/readiness result ids as authorization inputs", () => {
    const loader = readFileSync(
      join(
        ROOT,
        "src/lib/application-intelligence/load-application-intelligence.ts"
      ),
      "utf8"
    );
    expect(loader).not.toMatch(/alignmentResultId|readinessResultId/);
    expect(loader).toContain("where: { applicationId }");
  });
});
