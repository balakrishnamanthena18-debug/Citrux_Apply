import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  LIFECYCLE_AUTHORITY_MATRIX,
  INTELLIGENCE_ADVISORY_DISCLAIMER,
  STAFF_AUTHORITY_GUIDANCE,
  AUTHORITY_STATUS_NAMESPACES,
  assertIntelligenceLifecycleAuthorityLock,
  readinessIsNotApplicationState,
  GATE1_AUTHORITY_LOCK,
  INTELLIGENCE_MAY_CALL_MUTATION_GATEWAY,
  intelligenceMayMutateApplicationStatus,
  intelligenceMayCompleteQa,
  intelligenceMayApproveApplication,
  intelligenceMaySubmitApplication,
  AUTHORITY_BOUNDARIES,
  PHASE2_MUTATION_GATEWAY,
  freshnessAfterTrigger,
  buildSourceDataVersion,
  isPresentableAsCurrent,
  buildApplicationIntelligenceViewModel,
  computeDeterministicReadiness,
  ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
  EXPLAINABILITY_CONTRACT_VERSION,
  INTELLIGENCE_SCORING_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
} from "@/lib/application-intelligence";
import { ApplicationIntelligenceSection } from "@/components/application-intelligence/ApplicationIntelligenceSection";
import { ApplicationIntelligencePanel } from "@/components/application-intelligence/ApplicationIntelligencePanel";
import { baseReadinessInput } from "./fixtures/application-readiness";

const ROOT = process.cwd();
const INTEL_DIR = join(ROOT, "src/lib/application-intelligence");

const FORBIDDEN_MUTATION_PATTERNS = [
  /prisma\.application\.update\b/,
  /\.application\.update\s*\(/,
  /applicationStateHistory\.create/,
  /applicationSubmission\.create/,
  /applicationQaReview\.create/,
  /transitionApplicationStatusAction/,
  /candidateApproveApplicationAction/,
  /candidateRequestRevisionAction/,
  /recordApplicationSubmissionAction/,
  /withdrawApplicationAction/,
  /from\s+"@\/lib\/qa\/actions"/,
  /from\s+"@\/lib\/submission\/actions"/,
  /from\s+"@\/lib\/application\/actions"/,
];

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...collectTsFiles(full));
    else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function completedView(overrides?: {
  freshness?: string;
  readinessState?: string;
  viewer?: "CANDIDATE" | "STAFF";
  runStatus?: string;
}) {
  return buildApplicationIntelligenceViewModel({
    viewer: overrides?.viewer ?? "CANDIDATE",
    alignment: {
      id: "align-1",
      runId: "run-1",
      freshness: overrides?.freshness ?? "CURRENT",
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      overallScore: 82,
      evidence: {
        schemaVersion: ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
        fitItems: [],
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
      blockers: [],
      warnings: [
        {
          code: "PREFERRED_REQUIREMENT_GAP",
          severity: "WARNING",
          message: "Preferred gap",
          why: "Preferred not matched",
          explanation: "Preferred gap",
          ruleId: "READINESS.PREFERRED_REQUIREMENT_GAP",
          resolveAction: "NONE",
        },
      ],
      nextActions: [{ code: "REVIEW_PREFERRED_GAPS", label: "Review preferred gaps" }],
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
  });
}

describe("Gate 12 — authority matrix", () => {
  it("locks intelligence as advisory against lifecycle authorities", () => {
    expect(() => assertIntelligenceLifecycleAuthorityLock()).not.toThrow();
    expect(INTELLIGENCE_MAY_CALL_MUTATION_GATEWAY).toBe(false);
    expect(GATE1_AUTHORITY_LOCK.mayMutateApplicationStatus).toBe(false);
    expect(intelligenceMayMutateApplicationStatus()).toBe(false);
    expect(intelligenceMayCompleteQa()).toBe(false);
    expect(intelligenceMayApproveApplication()).toBe(false);
    expect(intelligenceMaySubmitApplication()).toBe(false);
    expect(AUTHORITY_BOUNDARIES.INTELLIGENCE).toBe("ADVISORY_ANALYSIS");
    expect(AUTHORITY_BOUNDARIES.QA).toBe("HUMAN_VERIFICATION_GATE");
    expect(AUTHORITY_BOUNDARIES.APPROVAL).toBe("CANDIDATE_OR_AUTHORIZED_DECISION");
    expect(AUTHORITY_BOUNDARIES.SUBMISSION).toBe("AUTHORITATIVE_EXTERNAL_ACTION");
    expect(readinessIsNotApplicationState()).toBe(true);

    const decisions = LIFECYCLE_AUTHORITY_MATRIX.map((r) => r.decision);
    expect(decisions).toEqual(
      expect.arrayContaining([
        "QA verification",
        "Candidate approval",
        "External submission",
        "Application state",
        "ApplicationStateHistory",
      ])
    );
    expect(
      LIFECYCLE_AUTHORITY_MATRIX.every(
        (r) =>
          r.intelligenceRole === "ADVISORY" ||
          r.intelligenceRole === "READ_ONLY" ||
          r.intelligenceRole === "OWN_ARTIFACT" ||
          r.intelligenceRole === "FORBIDDEN"
      )
    ).toBe(true);
  });

  it("keeps mutation gateway pointing at canonical lifecycle modules", () => {
    expect(PHASE2_MUTATION_GATEWAY.approval.module).toBe("src/lib/qa/actions.ts");
    expect(PHASE2_MUTATION_GATEWAY.submission.module).toBe(
      "src/lib/submission/actions.ts"
    );
    expect(PHASE2_MUTATION_GATEWAY.application.transition).toBe(
      "transitionApplicationStatusAction"
    );
    expect(PHASE2_MUTATION_GATEWAY.forbiddenLegacyPaths.length).toBeGreaterThan(0);
  });
});

describe("Gate 12 — static mutation scan (intelligence tree)", () => {
  it("forbids lifecycle mutation / gateway imports across intelligence modules", () => {
    const files = collectTsFiles(INTEL_DIR);
    expect(files.length).toBeGreaterThan(20);

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // Contract docs may name forbidden paths as strings — exclude those files.
      if (
        file.endsWith("mutation-gateway.ts") ||
        file.endsWith("lifecycle-authority.ts") ||
        file.endsWith("qa-alignment.ts") ||
        file.endsWith("data-contract.ts")
      ) {
        continue;
      }
      for (const pattern of FORBIDDEN_MUTATION_PATTERNS) {
        expect(src, `${file} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("pipeline and worker remain free of side-effect creators", () => {
    const pipeline = readFileSync(join(INTEL_DIR, "pipeline.ts"), "utf8");
    const worker = readFileSync(join(INTEL_DIR, "worker.ts"), "utf8");
    for (const src of [pipeline, worker]) {
      expect(src).not.toMatch(/notification|sendEmail|createTask|createMessage/i);
      expect(src).not.toMatch(/applicationStateHistory/);
    }
  });
});

describe("Gate 12 — QA / approval / submission boundaries", () => {
  it("READY intelligence does not imply QA verified or approval granted", () => {
    // Incomplete QA while PREPARING → advisory QA_PENDING; never mutates QA rows.
    const readyButQaPending = computeDeterministicReadiness(
      baseReadinessInput({
        applicationStatus: "PREPARING",
        approvalStatus: "NOT_REQUIRED",
        authorizationMode: "MANAGED",
        qa: { id: null, decision: null, verifiedCount: 0, criterionCount: 0 },
      })
    );
    expect(readyButQaPending.readinessState).not.toBe("READY");
    expect(readyButQaPending.warnings.some((w) => w.code === "QA_PENDING")).toBe(
      true
    );

    const blockedButApproved = computeDeterministicReadiness(
      baseReadinessInput({
        applicationStatus: "READY",
        approvalStatus: "APPROVED",
        material: {
          ...baseReadinessInput().material!,
          candidateDocumentId: null,
          documentCandidateId: null,
        },
      })
    );
    // Missing resume binding → blocked advisory; approval remains an independent input.
    expect(blockedButApproved.readinessState).toBe("BLOCKED");
    expect(baseReadinessInput().approvalStatus).toBe("APPROVED");
  });

  it("separates application REVIEW_REQUIRED from intelligence REVIEW_REQUIRED", () => {
    const correction = computeDeterministicReadiness(
      baseReadinessInput({
        applicationStatus: "REVIEW_REQUIRED",
        approvalStatus: "APPROVED",
      })
    );
    expect(correction.blockers.some((b) => b.code === "SUBMISSION_CORRECTION_REVIEW")).toBe(
      true
    );
    expect(correction.readinessState).not.toBe("REVIEW_REQUIRED");
    expect(correction.readinessState).toBe("BLOCKED");

    const authMode = computeDeterministicReadiness(
      baseReadinessInput({
        applicationStatus: "AWAITING_APPROVAL",
        approvalStatus: "PENDING",
        authorizationMode: "REVIEW_REQUIRED",
      })
    );
    expect(authMode.readinessState).toBe("REVIEW_REQUIRED");
  });

  it("terminal and submitted applications stay advisory-only", () => {
    const withdrawn = computeDeterministicReadiness(
      baseReadinessInput({ applicationStatus: "WITHDRAWN" })
    );
    expect(withdrawn.readinessState).toBe("UNKNOWN");
    const rejected = computeDeterministicReadiness(
      baseReadinessInput({ applicationStatus: "REJECTED" })
    );
    expect(rejected.readinessState).toBe("UNKNOWN");
    const submitted = computeDeterministicReadiness(
      baseReadinessInput({ applicationStatus: "SUBMITTED" })
    );
    expect(submitted.readinessState).toBe("BLOCKED");
    expect(submitted.blockers.some((b) => b.code === "ALREADY_SUBMITTED")).toBe(
      true
    );
  });
});

describe("Gate 12 — freshness / material / candidate / JD change", () => {
  it("material and candidate changes map to STALE; JD to RECOMPUTE_REQUIRED", () => {
    expect(freshnessAfterTrigger("APPLICATION_MATERIAL_CHANGED")).toBe("STALE");
    expect(freshnessAfterTrigger("CANDIDATE_PROFILE_CHANGED")).toBe("STALE");
    expect(freshnessAfterTrigger("JD_SNAPSHOT_CHANGED")).toBe("RECOMPUTE_REQUIRED");
    expect(isPresentableAsCurrent("STALE", "SUCCEEDED")).toBe(false);
    expect(isPresentableAsCurrent("CURRENT", "SUCCEEDED")).toBe(true);
  });

  it("source version binds materials and candidate timestamps separately", () => {
    const v1 = buildSourceDataVersion({
      snapshotContentHash: "hashaaaaaaaaaaaa",
      candidateUpdatedAt: "2026-01-01T00:00:00.000Z",
      materialsFingerprint: "resume-v1",
    });
    const resumeV2 = buildSourceDataVersion({
      snapshotContentHash: "hashaaaaaaaaaaaa",
      candidateUpdatedAt: "2026-01-01T00:00:00.000Z",
      materialsFingerprint: "resume-v2",
    });
    const candV2 = buildSourceDataVersion({
      snapshotContentHash: "hashaaaaaaaaaaaa",
      candidateUpdatedAt: "2026-02-01T00:00:00.000Z",
      materialsFingerprint: "resume-v1",
    });
    expect(v1).not.toBe(resumeV2);
    expect(v1).not.toBe(candV2);
  });

  it("wires material and candidate stale markers into lifecycle write paths", () => {
    const appActions = readFileSync(
      join(ROOT, "src/lib/application/actions.ts"),
      "utf8"
    );
    expect(appActions).toMatch(/markApplicationIntelligenceStale/);
    expect(appActions).toMatch(/APPLICATION_MATERIAL_CHANGED/);

    const candActions = readFileSync(
      join(ROOT, "src/lib/candidate/actions.ts"),
      "utf8"
    );
    expect(candActions).toMatch(/markCandidateApplicationIntelligenceStale/);
    expect(candActions).toMatch(/CANDIDATE_PROFILE_CHANGED/);

    const runs = readFileSync(join(INTEL_DIR, "runs.ts"), "utf8");
    expect(runs).toMatch(/markCandidateApplicationIntelligenceStale/);
    expect(runs).toMatch(/markJobApplicationIntelligenceStale/);
  });
});

describe("Gate 12 — status namespace separation", () => {
  it("documents distinct namespaces for blockers vs QA vs approval vs lifecycle", () => {
    expect(AUTHORITY_STATUS_NAMESPACES.applicationState).toContain("Application.status");
    expect(AUTHORITY_STATUS_NAMESPACES.intelligenceReadiness).toContain(
      "readinessState"
    );
    expect(AUTHORITY_STATUS_NAMESPACES.qaStatus).toMatch(/QA/i);
    expect(AUTHORITY_STATUS_NAMESPACES.candidateApproval).toContain("approvalStatus");
    expect(AUTHORITY_STATUS_NAMESPACES.intelligenceBlocker).toMatch(/advisory/i);
    expect(STAFF_AUTHORITY_GUIDANCE.intelligence).toMatch(/Advisory/i);
    expect(STAFF_AUTHORITY_GUIDANCE.qa).toMatch(/Quality control/i);
    expect(STAFF_AUTHORITY_GUIDANCE.submission).toMatch(/Execution/i);
  });

  it("UI phases remain independent of application lifecycle states", () => {
    const preparing = completedView({ readinessState: "READY" });
    expect(preparing.phase).toBe("CURRENT");
    expect(preparing.readinessState).toBe("READY");
    // View model has no applicationStatus field — cannot collapse into lifecycle.
    expect((preparing as { applicationStatus?: string }).applicationStatus).toBeUndefined();

    const stale = completedView({ freshness: "STALE", readinessState: "BLOCKED" });
    expect(stale.phase).toBe("STALE");
    expect(stale.messaging.body).toMatch(/advisory/i);
  });
});

describe("Gate 12 — candidate / staff UX", () => {
  it("renders advisory disclaimer and intelligence-readiness labeling", () => {
    const view = completedView();
    expect(view.messaging.body).toMatch(/advisory/i);
    expect(view.messaging.body).toMatch(/does not approve|approval/i);
    expect(INTELLIGENCE_ADVISORY_DISCLAIMER).toMatch(/advisory/i);

    const candidateHtml = renderToStaticMarkup(
      createElement(ApplicationIntelligenceSection, {
        view,
        audience: "candidate",
      })
    );
    expect(candidateHtml).toContain("intelligence-advisory-disclaimer");
    expect(candidateHtml).toMatch(/Intelligence is advisory/);
    expect(candidateHtml).toMatch(/Intelligence readiness/);
    expect(candidateHtml).toMatch(/Not application status/);
    expect(candidateHtml).not.toMatch(/AI approved your application/i);
    expect(candidateHtml).not.toMatch(/guarantees? (an )?interview/i);

    const staffHtml = renderToStaticMarkup(
      createElement(ApplicationIntelligenceSection, {
        view: completedView({ viewer: "STAFF" }),
        audience: "staff",
      })
    );
    expect(staffHtml).toMatch(/QA, approval, and submission remain separate/);
  });

  it("renders lifecycle-phase companion states without fabricating intelligence", () => {
    const unavailable = buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: null,
      readiness: null,
      latestRun: null,
    });
    expect(unavailable.phase).toBe("NOT_AVAILABLE");

    const pending = buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: null,
      readiness: null,
      latestRun: {
        id: "run-q",
        status: "QUEUED",
        analysisPurpose: "APPLICATION_INTELLIGENCE",
        errorCode: null,
        freshness: "CURRENT",
      },
    });
    expect(pending.phase).toBe("PENDING");

    const failed = buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: null,
      readiness: null,
      latestRun: {
        id: "run-f",
        status: "FAILED",
        analysisPurpose: "APPLICATION_INTELLIGENCE",
        errorCode: "PROVIDER_ERROR",
        freshness: "CURRENT",
      },
    });
    expect(failed.phase).toBe("FAILED");
    expect(failed.messaging.body).toMatch(/workflow is unaffected/i);

    for (const view of [
      completedView(),
      completedView({ freshness: "STALE" }),
      unavailable,
      pending,
      failed,
    ]) {
      const html = renderToStaticMarkup(
        createElement(ApplicationIntelligencePanel, {
          view,
          audience: "candidate",
        })
      );
      expect(html).toBeTruthy();
      expect(html).toContain("intelligence-advisory-disclaimer");
      expect(html).not.toMatch(/hydration/i);
    }
  });
});

describe("Gate 12 — security / operational regression anchors", () => {
  it("FORCE RLS migration and Gate 10/11 suites remain present", () => {
    const mig = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261005080000_phase2_gate10_intelligence_force_rls/migration.sql"
      ),
      "utf8"
    );
    expect(mig).toMatch(/FORCE ROW LEVEL SECURITY/i);

    const files = readdirSync(join(ROOT, "tests/unit/application-intelligence"));
    expect(files).toContain("gate10-security-isolation.test.ts");
    expect(files).toContain("gate11-operational-lifecycle.test.ts");
    expect(files).toContain("gate12-lifecycle-integration.test.ts");
  });
});
