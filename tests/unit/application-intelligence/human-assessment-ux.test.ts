import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildApplicationIntelligenceViewModel } from "@/lib/application-intelligence/presentation";
import {
  CANDIDATE_ADVISORY_DISCLAIMER,
  CANDIDATE_ASSESSMENT_HEADING,
  buildAssessmentSummary,
  buildWhatWeFoundLines,
  candidatePrimaryHtmlHasJargon,
  humanFitExplanation,
  humanFitStatusLabel,
  humanFreshnessLabel,
  humanImportanceLabel,
  humanPhaseMessaging,
  humanReadinessLabel,
  humanRecommendation,
  selectReviewItems,
  selectStrengthItems,
} from "@/lib/application-intelligence/human-assessment";
import { ApplicationIntelligenceSection } from "@/components/application-intelligence/ApplicationIntelligenceSection";
import { ApplicationIntelligencePanel } from "@/components/application-intelligence/ApplicationIntelligencePanel";
import {
  ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
  EXPLAINABILITY_CONTRACT_VERSION,
  INTELLIGENCE_ADVISORY_DISCLAIMER,
  INTELLIGENCE_SCORING_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
  assertIntelligenceLifecycleAuthorityLock,
} from "@/lib/application-intelligence";

function baseCompletedInput(overrides?: {
  freshness?: string;
  readinessState?: string;
  runStatus?: string;
  fitItems?: unknown[];
  blockers?: unknown[];
  warnings?: unknown[];
  nextActions?: unknown[];
  overallScore?: number | null;
  viewer?: "CANDIDATE" | "STAFF";
}) {
  const fitItems = overrides?.fitItems ?? [
    {
      requirementId: "req-ts",
      requirementValue: "TypeScript",
      importance: "REQUIRED",
      status: "MATCHED",
      explanation: 'Requirement "TypeScript (REQUIRED)" is MATCHED.',
      ruleId: "ALIGN.SKILL.EXACT",
      candidateEvidence: {
        summary: "TypeScript",
        provenance: "CANDIDATE_PROVIDED",
      },
      requirementEvidence: {
        excerpt: "TypeScript required",
        snapshotId: "snap-1",
      },
    },
    {
      requirementId: "req-graphql",
      requirementValue: "GraphQL",
      importance: "PREFERRED",
      status: "MISSING",
      explanation: 'Requirement "GraphQL (PREFERRED)" is MISSING.',
      ruleId: "ALIGN.SKILL.EXACT",
      candidateEvidence: null,
      requirementEvidence: {
        excerpt: "GraphQL preferred",
        snapshotId: "snap-1",
      },
    },
    {
      requirementId: "req-python",
      requirementValue: "5+ years Python",
      importance: "REQUIRED",
      status: "PARTIAL",
      explanation: "Partial years",
      ruleId: "ALIGN.EXPERIENCE.THRESHOLD",
      candidateEvidence: {
        summary: "3.5 verified years",
        provenance: "VERIFIED",
      },
      requirementEvidence: {
        excerpt: "5+ years Python",
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
          : 68,
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
      warnings: overrides?.warnings ?? [],
      nextActions: overrides?.nextActions ?? [
        {
          code: "REVIEW_PREFERRED_GAPS",
          label: "Review preferred gaps before submit",
        },
      ],
      evidence: {
        schemaVersion: "readiness-evidence.v1",
        readinessVersion: "readiness.v1",
        explainabilityVersion: EXPLAINABILITY_CONTRACT_VERSION,
        unknowns: [],
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

function renderCandidate(view = buildApplicationIntelligenceViewModel(baseCompletedInput())) {
  return renderToStaticMarkup(
    createElement(ApplicationIntelligenceSection, {
      view,
      audience: "candidate",
    })
  );
}

describe("Human-language Application Assessment UX", () => {
  it("renders CURRENT human-readable assessment", () => {
    const html = renderCandidate();
    expect(html).toContain(CANDIDATE_ASSESSMENT_HEADING);
    expect(html).toContain("How well your profile matches this job");
    expect(html).toContain("68 / 100");
    expect(html).toContain("Good match, with a few things to review");
    expect(html).toContain("Your strengths");
    expect(html).toContain("Things to review");
    expect(html).toContain("What we recommend");
    expect(html).toContain("Assessment current");
    expect(candidatePrimaryHtmlHasJargon(html)).toBe(false);
    expect(html).not.toContain("Persisted scoring contract");
    // Technical enum may remain only under Assessment details
    expect(html).toContain("Assessment details");
  });

  it("renders NOT_AVAILABLE human-readable state", () => {
    const view = buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: null,
      readiness: null,
      latestRun: null,
    });
    expect(view.messaging.title).toMatch(/hasn.?t been assessed/i);
    const html = renderCandidate(view);
    expect(html).toContain("hasn&#x27;t been assessed yet");
    expect(html).toContain("does not mean that you are a poor match");
    expect(html).toContain("Not assessed yet");
    expect(html).not.toMatch(/>NOT_AVAILABLE</);
  });

  it("renders PENDING human-readable state", () => {
    const view = buildApplicationIntelligenceViewModel({
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
    expect(humanPhaseMessaging("PENDING").title).toMatch(/reviewing your profile/i);
    const html = renderCandidate(view);
    expect(html).toContain("Assessment in progress");
    expect(html).not.toContain("QUEUED");
    expect(html).not.toContain("RUNNING");
  });

  it("renders FAILED human-readable state without failure codes", () => {
    const view = buildApplicationIntelligenceViewModel({
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
    const html = renderCandidate(view);
    expect(html).toContain("couldn&#x27;t complete the assessment");
    expect(html).toContain("not affected");
    expect(html).not.toContain("PROVIDER_TIMEOUT");
  });

  it("translates readiness states", () => {
    expect(humanReadinessLabel("READY")).toBe("Strong match");
    expect(humanReadinessLabel("READY_WITH_WARNINGS")).toMatch(/Good match/i);
    expect(humanReadinessLabel("REVIEW_REQUIRED")).toMatch(/Review needed/i);
    expect(humanReadinessLabel("BLOCKED")).toMatch(/need attention/i);
    expect(humanReadinessLabel("UNKNOWN")).toMatch(/enough information/i);
  });

  it("translates fit statuses", () => {
    expect(humanFitStatusLabel("MATCHED")).toMatch(/meet this requirement/i);
    expect(humanFitStatusLabel("PARTIAL")).toMatch(/partially/i);
    expect(humanFitStatusLabel("MISSING")).toMatch(/couldn.?t find/i);
    expect(humanFitStatusLabel("UNKNOWN")).toMatch(/couldn.?t determine/i);
  });

  it("uses required vs preferred language without inventing facts", () => {
    const preferredMissing = {
      requirementId: "g",
      requirementValue: "GraphQL",
      importance: "PREFERRED" as const,
      status: "MISSING" as const,
      explanation: "missing",
      ruleId: "ALIGN.SKILL.EXACT",
      candidateEvidenceSummary: null,
      candidateProvenance: null,
      jobEvidenceExcerpt: "GraphQL preferred",
      snapshotId: "snap-1",
    };
    const text = humanFitExplanation(preferredMissing);
    expect(text).toMatch(/optional/i);
    expect(text).toMatch(/GraphQL/i);
    expect(text).not.toMatch(/excellent API/i);
    expect(humanImportanceLabel("REQUIRED")).toMatch(/Important/i);
    expect(humanImportanceLabel("PREFERRED")).toBe("Optional");
  });

  it("builds strengths and review areas from persisted fit items only", () => {
    const view = buildApplicationIntelligenceViewModel(baseCompletedInput());
    const strengths = selectStrengthItems(view.fitItems);
    const reviews = selectReviewItems(view.fitItems);
    expect(strengths.every((s) => s.status === "MATCHED")).toBe(true);
    expect(strengths.some((s) => s.requirementValue === "TypeScript")).toBe(true);
    expect(reviews.some((r) => r.requirementValue === "GraphQL")).toBe(true);
    expect(reviews.every((r) => r.status !== "MATCHED")).toBe(true);
  });

  it("surfaces blockers and recommendations in human language", () => {
    const view = buildApplicationIntelligenceViewModel(
      baseCompletedInput({
        readinessState: "BLOCKED",
        blockers: [
          {
            code: "MISSING_WORK_AUTH",
            severity: "BLOCKER",
            message: "Work authorization information is missing from your profile",
            why: "We need this information before the application can proceed.",
            resolveAction: "UPDATE_PROFILE",
          },
        ],
        nextActions: [
          { code: "UPDATE_PROFILE", label: "Complete QA review" },
        ],
      })
    );
    const html = renderCandidate(view);
    expect(html).toContain("Important to resolve");
    expect(html).toContain("Work authorization information is missing");
    expect(html).toContain("What we recommend");
    expect(humanRecommendation(view.nextActions)).toMatch(/quality review/i);
    const primary = html.split("View detailed assessment")[0]!;
    expect(primary).not.toContain("BLOCKED");
    expect(primary).toContain("Important to resolve");
  });

  it("keeps advisory disclaimer and freshness language", () => {
    expect(CANDIDATE_ADVISORY_DISCLAIMER).toMatch(/guide, not an approval/i);
    expect(INTELLIGENCE_ADVISORY_DISCLAIMER).toMatch(/guide, not an approval/i);
    expect(humanFreshnessLabel("CURRENT")).toBe("Assessment current");
    expect(humanFreshnessLabel("STALE")).toMatch(/out of date/i);
    const stale = renderCandidate(
      buildApplicationIntelligenceViewModel(
        baseCompletedInput({ freshness: "STALE" })
      )
    );
    expect(stale).toContain("may be out of date");
    const primary = stale.split("View detailed assessment")[0]!;
    expect(primary).not.toContain(">STALE<");
    expect(primary).not.toMatch(/>STALE</);
  });

  it("uses progressive disclosure for evidence and technical details", () => {
    const html = renderCandidate();
    expect(html).toContain("View detailed assessment");
    expect(html).toContain("Assessment details");
    expect(html).toContain("Why we say this");
    expect(html).toContain("<details");
    // Technical enums may exist only under detailed assessment
    const primary = html.split("View detailed assessment")[0]!;
    expect(primary).not.toContain("scoring.v1");
    expect(primary).not.toContain("ALIGN.SKILL.EXACT");
  });

  it("keeps primary candidate UI free of engineering jargon", () => {
    const html = renderCandidate();
    expect(candidatePrimaryHtmlHasJargon(html)).toBe(false);
    expect(html).not.toContain("Persisted scoring");
    expect(html).not.toContain("Application Intelligence");
  });

  it("does not fabricate candidate facts in summary copy", () => {
    const view = buildApplicationIntelligenceViewModel(baseCompletedInput());
    const summary = buildAssessmentSummary(view);
    expect(summary.summaryParagraph).not.toMatch(/excellent|guaranteed|interview/i);
    const findings = buildWhatWeFoundLines(view);
    expect(findings.some((f) => f.kind === "matched")).toBe(true);
    expect(findings.some((f) => f.kind === "missing")).toBe(true);
  });

  it("preserves candidate vs staff authorization surfaces", () => {
    const staffView = buildApplicationIntelligenceViewModel(
      baseCompletedInput({ viewer: "STAFF" })
    );
    const candidateView = buildApplicationIntelligenceViewModel(
      baseCompletedInput({ viewer: "CANDIDATE" })
    );
    const staffHtml = renderToStaticMarkup(
      createElement(ApplicationIntelligenceSection, {
        view: staffView,
        audience: "staff",
      })
    );
    const candidateHtml = renderToStaticMarkup(
      createElement(ApplicationIntelligenceSection, {
        view: candidateView,
        audience: "candidate",
      })
    );
    expect(staffHtml).toContain("staff metadata");
    expect(staffHtml).toContain("align-1");
    expect(candidateHtml).not.toContain("align-1");
    expect(candidateHtml).toContain('data-testid="intelligence-advisory-disclaimer"');
  });

  it("keeps Gate 14 authority lock and load-failure safety", () => {
    expect(() => assertIntelligenceLifecycleAuthorityLock()).not.toThrow();
    const failed = renderToStaticMarkup(
      createElement(ApplicationIntelligencePanel, {
        view: null,
        audience: "candidate",
        loadFailed: true,
      })
    );
    expect(failed).toContain("application-intelligence-error");
    expect(failed).toContain(CANDIDATE_ASSESSMENT_HEADING);
    expect(failed).not.toContain("68 / 100");
  });
});
