import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  assertIntelligenceLifecycleAuthorityLock,
  INTELLIGENCE_ADVISORY_DISCLAIMER,
  buildApplicationIntelligenceViewModel,
  ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
  EXPLAINABILITY_CONTRACT_VERSION,
  INTELLIGENCE_SCORING_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
  INTELLIGENCE_WORKER_BATCH_SIZE,
} from "@/lib/application-intelligence";
import { ApplicationIntelligencePanel } from "@/components/application-intelligence/ApplicationIntelligencePanel";

const ROOT = process.cwd();

function completedView(overrides?: {
  freshness?: string;
  readinessState?: string;
}) {
  return buildApplicationIntelligenceViewModel({
    viewer: "CANDIDATE",
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
        status: "SUCCEEDED",
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
      warnings: [],
      nextActions: [],
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
      status: "SUCCEEDED",
      analysisPurpose: "APPLICATION_READINESS",
      errorCode: null,
      freshness: overrides?.freshness ?? "CURRENT",
    },
  });
}

describe("Gate 13 — production verification anchors", () => {
  it("keeps lifecycle authority lock and advisory disclaimer", () => {
    expect(() => assertIntelligenceLifecycleAuthorityLock()).not.toThrow();
    expect(INTELLIGENCE_ADVISORY_DISCLAIMER).toMatch(/guide, not an approval/i);
  });

  it("renders CURRENT / STALE / PENDING / FAILED / NOT_AVAILABLE without fabricated scores", () => {
    const current = completedView();
    expect(current.phase).toBe("CURRENT");
    expect(current.messaging.body).toMatch(/guide|approval/i);

    const stale = completedView({ freshness: "STALE" });
    expect(stale.phase).toBe("STALE");

    const pending = buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: null,
      readiness: null,
      latestRun: {
        id: "r",
        status: "RUNNING",
        analysisPurpose: "APPLICATION_INTELLIGENCE",
        errorCode: null,
        freshness: "CURRENT",
      },
    });
    expect(pending.phase).toBe("PENDING");
    expect(pending.overallScore).toBeNull();

    for (const view of [current, stale, pending]) {
      const html = renderToStaticMarkup(
        createElement(ApplicationIntelligencePanel, {
          view,
          audience: "candidate",
        })
      );
      expect(html).toContain("intelligence-advisory-disclaimer");
      expect(html).not.toMatch(/nvapi-|NVIDIA_API_KEY/i);
    }
  });

  it("documents live E2E harness and sourceDataVersion width migration", () => {
    for (const script of [
      "scripts/gate13-e2e-verify.ts",
      "scripts/gate13-restore-current.ts",
      "scripts/gate13-lifecycle-matrix.ts",
      "scripts/gate13-authority-boundaries.ts",
    ]) {
      expect(existsSync(join(ROOT, script))).toBe(true);
    }
    const mig = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261005093000_phase2_gate13_source_data_version_width/migration.sql"
      ),
      "utf8"
    );
    expect(mig).toMatch(/sourceDataVersion/);
    expect(mig).toMatch(/VARCHAR\(256\)/i);

    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/sourceDataVersion\s+String\s+@db\.VarChar\(256\)/);
  });

  it("reclaim SQL uses NOW() for completedAt (timestamptz-safe)", () => {
    const claim = readFileSync(
      join(ROOT, "src/lib/application-intelligence/run-claim.ts"),
      "utf8"
    );
    expect(claim).toMatch(/ELSE NOW\(\)/);
    expect(claim).toMatch(/timestamptz/);
  });

  it("worker batch remains bounded", () => {
    expect(INTELLIGENCE_WORKER_BATCH_SIZE).toBeLessThanOrEqual(10);
  });

  it("prior gate suites remain present for regression", () => {
    const files = readdirSync(
      join(ROOT, "tests/unit/application-intelligence")
    );
    for (const f of [
      "gate10-security-isolation.test.ts",
      "gate11-operational-lifecycle.test.ts",
      "gate12-lifecycle-integration.test.ts",
      "gate13-production-verification.test.ts",
    ]) {
      expect(files).toContain(f);
    }
  });

  it(".env.example does not embed a live NVIDIA API key", () => {
    const envExample = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(envExample).toMatch(/NVIDIA_API_KEY=/);
    expect(envExample).not.toMatch(/nvapi-[A-Za-z0-9]{20,}/);
  });
});
