import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  benchmarkDatasetSchema,
  type BenchmarkDataset,
} from "@/lib/data-quality/benchmark-schema";
import {
  generateQualityScorecard,
  type QualityScorecard,
  adaptBenchmarkToNormalizedRecord,
  detectDuplicates,
  validateGeography,
  evaluateAiReviewOffline,
  deriveDefaultReviewPriorities,
} from "@/lib/data-quality";
import {
  buildScorecardReportJson,
  generateScorecardMarkdownReport,
  reconcileScorecardExclusions,
  escapeMarkdownCell,
  escapeMarkdownText,
  scorecardReportJsonSchema,
  DEFAULT_INVENTORY_CONTEXT,
  type InventoryAuditContext,
  type ScorecardReportJson,
} from "@/lib/data-quality";

describe("OOS Data Quality & Intelligence — Phase 3, Stage 3: Offline Scorecard Reporter", () => {
  const fixturePath = path.resolve(
    __dirname,
    "fixtures/ground-truth-benchmark.json"
  );
  let dataset: BenchmarkDataset;
  let scorecard: QualityScorecard;

  beforeAll(() => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const raw = fs.readFileSync(fixturePath, "utf-8");
    const parsed = JSON.parse(raw);
    dataset = benchmarkDatasetSchema.parse(parsed);
    scorecard = generateQualityScorecard(dataset);
  });

  describe("1. Deterministic JSON Report & Schema Validation", () => {
    let reportJson: ScorecardReportJson;

    it("builds a complete ScorecardReportJson conforming to scorecardReportJsonSchema", () => {
      reportJson = buildScorecardReportJson(scorecard);
      const validation = scorecardReportJsonSchema.safeParse(reportJson);
      expect(validation.success).toBe(true);
      if (!validation.success) {
        console.error(validation.error.errors);
      }

      expect(reportJson.reportVersion).toBe("1.0");
      expect(reportJson.totalBenchmarkRecords).toBe(100);
      expect(reportJson.benchmarkIdentifier).toBe(
        "freehire-us-quality-benchmark-100"
      );
      expect(reportJson.benchmarkVersion).toBe("1.0");
      expect(reportJson.scorecardVersion).toBe("1.0");
    });

    it("produces byte-for-byte identical JSON output across repeated runs", () => {
      const run1 = buildScorecardReportJson(scorecard);
      const run2 = buildScorecardReportJson(scorecard);

      const json1 = JSON.stringify(run1);
      const json2 = JSON.stringify(run2);
      expect(json1).toBe(json2);

      // Verify JSON round-trip deserialization passes schema validation
      const parsed = JSON.parse(json1);
      const revalidation = scorecardReportJsonSchema.safeParse(parsed);
      expect(revalidation.success).toBe(true);
    });

    it("accepts custom inventory context and review priorities cleanly", () => {
      const customContext: InventoryAuditContext = {
        totalInventoryRecords: 5000,
        inventoryDatasetName: "custom-production-feed-5000.json",
        relationshipToBenchmark: "Custom enterprise inventory test context.",
        candidateDuplicatesInInventory: 120,
        foreignSignalsInInventory: 45,
        suspectedBatchTimestampsInInventory: 3200,
        humanReviewCountInInventory: 80,
      };

      const customReport = buildScorecardReportJson(scorecard, {
        inventoryContext: customContext,
        reportTitle: "Custom Enterprise Quality Scorecard",
      });

      expect(customReport.title).toBe("Custom Enterprise Quality Scorecard");
      expect(customReport.inventoryContext.totalInventoryRecords).toBe(5000);
      expect(customReport.inventoryContext.inventoryDatasetName).toBe(
        "custom-production-feed-5000.json"
      );
    });
  });

  describe("2. Markdown Report Structure & Completeness", () => {
    let markdown: string;

    beforeAll(() => {
      markdown = generateScorecardMarkdownReport(scorecard);
    });

    it("produces byte-for-byte identical Markdown output across repeated runs", () => {
      const run1 = generateScorecardMarkdownReport(scorecard);
      const run2 = generateScorecardMarkdownReport(scorecard);
      expect(run1).toBe(run2);
    });

    it("contains all required report sections and metadata headers", () => {
      expect(markdown).toContain("# OOS Data Quality & Intelligence Quality Scorecard Report");
      expect(markdown).toContain("**Scorecard Version:** `1.0`");
      expect(markdown).toContain("**Benchmark Version:** `1.0`");
      expect(markdown).toContain("AI_MODE=offline");
      expect(markdown).toContain("DUPLICATE_MASTER_POLICY=none");

      // Check section titles
      expect(markdown).toContain("## 1. Inventory Scope & Benchmark Relationship");
      expect(markdown).toContain("## 2. Key Quality Metrics Summary");
      expect(markdown).toContain("## 3. Deduplication Dimension Evaluation");
      expect(markdown).toContain("## 4. Geography Dimension Evaluation");
      expect(markdown).toContain("## 5. Timestamp Concurrency Evaluation (Invariant Check)");
      expect(markdown).toContain("## 6. Abstention & Human Review Escalation");
      expect(markdown).toContain("## 7. Actionable Human Review Priorities");
      expect(markdown).toContain("## 8. Quarantined Cases (Metric Exclusions)");
      expect(markdown).toContain("## 9. Metric Interpretation Boundaries & Limitations");
    });

    it("clearly distinguishes the 100-record benchmark from the 1,000-record inventory", () => {
      expect(markdown).toContain("Benchmark Scope (100 Records) vs Inventory Feed (1000 Records)");
      expect(markdown).toContain("freehire-us-quality-benchmark-100");
      expect(markdown).toContain("freehire-us-audit-1000.json");
      expect(markdown).toContain("100");
      expect(markdown).toContain("1000");
    });

    it("reports deduplication pair-level and record-level metrics with eligible denominators", () => {
      // 3,486 total pairs, 17 GT pairs, 17 Det pairs, 100.00% precision/recall/F1
      expect(markdown).toContain("3486 pairs");
      expect(markdown).toContain("17");
      expect(markdown).toContain("3469");
      expect(markdown).toContain("100.00%");
      expect(markdown).toContain("unordered_pairs_within_eligible_deterministic_records");

      // Record level: 84 records, 31 GT dup, 53 unique
      expect(markdown).toContain("84 records");
      expect(markdown).toContain("31");
      expect(markdown).toContain("53");
    });

    it("includes the 4x4 geography confusion matrix and per-class metrics", () => {
      // Matrix header and classes
      expect(markdown).toContain("valid_us");
      expect(markdown).toContain("explicit_foreign");
      expect(markdown).toContain("metadata_discrepancy");
      expect(markdown).toContain("missing_location");

      // Overall accuracy (86.60%) and Macro F1 (0.7631)
      expect(markdown).toContain("86.60%");
      expect(markdown).toContain("0.7631");

      // Per-class metrics
      expect(markdown).toContain("85.06%"); // valid_us precision (74/87)
      expect(markdown).toContain("7.14%");  // explicit_foreign recall (1/14)
      expect(markdown).toContain("0.1333"); // explicit_foreign F1
      expect(markdown).toContain("43.48%"); // valid_us specificity (10/23)
    });

    it("describes timestamp metrics strictly as a feed-field consistency invariant check", () => {
      expect(markdown).toContain("identical_timestamp_pattern");
      expect(markdown).toContain("distinct_timestamp_values");
      expect(markdown).toContain("Invariant Check");
      expect(markdown).toContain("Real-world vacancy freshness: **UNVERIFIED**");
      expect(markdown).toContain("Original employer posting date authenticity: **UNVERIFIED**");
      expect(markdown).toContain("Active vs closed vacancy status: **UNVERIFIED**");
      expect(markdown).toContain("Crawler batch ingestion provenance: **UNVERIFIED**");
    });

    it("reports abstention and escalation metrics with denominators", () => {
      // Duplicate: 4 of 4 (100.00%)
      expect(markdown).toContain("Duplicate Dimension");
      expect(markdown).toContain("100.00%");

      // Geography: 1 unresolved, 0 escalated (0.00%)
      expect(markdown).toContain("Geography Dimension");
      expect(markdown).toContain("0.00%");

      // Overall: 4 of 5 (80.00%)
      expect(markdown).toContain("80.00%");

      // Heuristic: 12 of 14 (85.71%)
      expect(markdown).toContain("85.71%");
    });

    it("lists all 19 metric exclusion entries with benchmark IDs, dimension, and reason", () => {
      expect(markdown).toContain("Total Quarantined Record Dimensions: **19**");
      // Check sample IDs from exclusions list
      expect(markdown).toContain("`BM-032`");
      expect(markdown).toContain("`BM-044`");
      expect(markdown).toContain("`BM-054`");
      expect(markdown).toContain("`BM-065`");
      expect(markdown).toContain("`BM-084`");
      expect(markdown).toContain("EXCLUDE_UNRESOLVED_DUPLICATE_FROM_BINARY_METRICS");
      expect(markdown).toContain("EXCLUDE_HEURISTIC_DISTINCT_FROM_CONFIRMED_VACANCIES");
      expect(markdown).toContain("EXCLUDE_UNRESOLVED_GEOGRAPHY_FROM_ACCURACY");
      expect(markdown).toContain("EXCLUDE_HEURISTIC_GEOGRAPHY_FROM_DETERMINISTIC_METRICS");
    });

    it("includes actionable human review priorities with target counts and sample IDs", () => {
      expect(markdown).toContain("## 7. Actionable Human Review Priorities");
      expect(markdown).toContain("**HIGH**");
      expect(markdown).toContain("MEDIUM");
      expect(markdown).toContain("LOW");
      expect(markdown).toContain("BM-032");
      expect(markdown).toContain("BM-044");
      expect(markdown).toContain("BM-048");
    });
  });

  describe("3. Metric Interpretation & Anti-Overclaiming Rules", () => {
    let markdown: string;

    beforeAll(() => {
      markdown = generateScorecardMarkdownReport(scorecard);
    });

    it("never claims that 100% deduplication proves general production accuracy", () => {
      expect(markdown).toContain(
        "This metric does **NOT** establish 100% accuracy on real-world web data containing fuzzy text variants"
      );
      expect(markdown).toContain(
        "They do NOT establish 100% deduplication on noisy or uncurated production data."
      );
    });

    it("never claims that identical timestamps prove freshness, active status, or crawler batch", () => {
      expect(markdown).toContain(
        "Identical timestamps do NOT prove a job is fresh, active, or ingested via a crawler batch."
      );
    });

    it("never claims that HTTP 200 proves a job is still open", () => {
      expect(markdown).toContain(
        "An HTTP 200 response proves web server reachability only; it does NOT prove an employer vacancy remains open or accepting applicants."
      );
    });

    it("never claims a record is globally unique merely because it is unique in the benchmark", () => {
      expect(markdown).toContain(
        "This does NOT prove they are globally unique across the broader 1,000-record inventory or live ATS feeds."
      );
    });

    it("preserves reported geography false negatives and explains the conflicting us and ca metadata limitation", () => {
      expect(markdown).toContain("Canadian Location Scraper Conflict Analysis");
      expect(markdown).toContain("rawCountryCodes: ['ca', 'us']");
      expect(markdown).toContain("Oakville, Milton, Halton Hills");
    });
  });

  describe("4. Markdown Escaping & Safe Rendering", () => {
    it("escapes table cell characters properly (pipes, brackets, backticks, HTML tags)", () => {
      expect(escapeMarkdownCell("Software Engineer | Level 2")).toBe(
        "Software Engineer \\| Level 2"
      );
      expect(escapeMarkdownCell("Company [US]")).toBe("Company \\[US\\]");
      expect(escapeMarkdownCell("Code `foo`")).toBe("Code \\`foo\\`");
      expect(escapeMarkdownCell("<script>alert(1)</script>")).toBe(
        "&lt;script&gt;alert(1)&lt;/script&gt;"
      );
      expect(escapeMarkdownCell("Line 1\nLine 2")).toBe("Line 1 Line 2");
      expect(escapeMarkdownCell(null)).toBe("-");
      expect(escapeMarkdownCell(undefined)).toBe("-");
      expect(escapeMarkdownCell("   ")).toBe("-");
    });

    it("escapes plain text characters properly", () => {
      expect(escapeMarkdownText("Hello <world> & friends")).toBe(
        "Hello &lt;world&gt; & friends"
      );
      expect(escapeMarkdownText(null)).toBe("");
      expect(escapeMarkdownText(undefined)).toBe("");
    });

    it("safely renders user-controlled strings inside generated markdown report without breaking table structure", () => {
      // Clone scorecard with malicious or tricky string characters
      const corruptedMetaScorecard: QualityScorecard = {
        ...scorecard,
        benchmarkIdentifier: "benchmark | injection <script> [test]",
        exclusionsAndLimitations: {
          ...scorecard.exclusionsAndLimitations,
          exclusionsList: [
            {
              dimension: "duplicate",
              benchmarkId: "BM-HACK",
              sourceRecordId: "src | with | pipes",
              evidenceLevel: "heuristic_inference",
              currentLabel: "distinct_requisition | inject",
              exclusionRule: "RULE_TEST",
              rationale: "Reason with <script>alert(1)</script> and `backticks` and [brackets]",
            },
          ],
          exclusionsCount: 1,
        },
      };

      const md = generateScorecardMarkdownReport(corruptedMetaScorecard);
      expect(md).toContain("\\| injection &lt;script&gt; \\[test\\]");
      expect(md).toContain("src \\| with \\| pipes");
      expect(md).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(md).toContain("\\`backticks\\`");
      expect(md).toContain("\\[brackets\\]");

      // Verify that markdown table formatting is preserved (each table row begins and ends with |)
      const tableLines = md
        .split("\n")
        .filter((line) => line.startsWith("|") && line.endsWith("|"));
      expect(tableLines.length).toBeGreaterThan(15);
      for (const line of tableLines) {
        // Unescaped pipes would cause column count mismatches; count valid pipe separators
        const pipeCount = (line.match(/(?<!\\)\|/g) || []).length;
        expect(pipeCount).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("5. Boundary & Edge Cases", () => {
    it("handles an empty scorecard gracefully without throwing NaN or divide-by-zero", () => {
      const emptyDataset: BenchmarkDataset = {
        datasetName: "BM-EMPTY",
        sourceDataset: "empty.json",
        version: "1.0",
        createdAt: "2026-10-22T00:00:00Z",
        totalRecords: 0,
        description: "Empty test dataset",
        compositionSummary: {
          confirmedDuplicateRecords: 0,
          distinctRequisitionRecords: 0,
          uniqueRecords: 0,
          unresolvedDuplicateRecords: 0,
          validUsRecords: 0,
          explicitForeignRecords: 0,
          metadataDiscrepancyRecords: 0,
          missingLocationRecords: 0,
          unresolvedGeographyRecords: 0,
          identicalTimestampPatternRecords: 0,
          distinctTimestampValuesRecords: 0,
          unresolvedFreshnessRecords: 0,
        },
        records: [],
      };

      const emptyScorecard = generateQualityScorecard(emptyDataset);
      const reportJson = buildScorecardReportJson(emptyScorecard);
      const validation = scorecardReportJsonSchema.safeParse(reportJson);
      expect(validation.success).toBe(true);

      const emptyMd = generateScorecardMarkdownReport(emptyScorecard);
      expect(emptyMd).toBeDefined();
      expect(emptyMd).toContain("| **Total Records** | **0** curated records |");
      expect(emptyMd).not.toContain("NaN");
    });

    it("rejects malformed scorecard objects missing required fields", () => {
      const badScorecard = {
        scorecardVersion: "1.0",
        // missing deduplication, geography, etc.
      };

      expect(() =>
        buildScorecardReportJson(badScorecard as unknown as QualityScorecard)
      ).toThrow();
    });
  });

  describe("6. Stage 3.1: Reporting Integrity & Metric Reconciliation Audits", () => {
    let markdown: string;
    let jsonReport: ScorecardReportJson;

    beforeAll(() => {
      markdown = generateScorecardMarkdownReport(scorecard);
      jsonReport = buildScorecardReportJson(scorecard);
    });

    it("Audit 1: reconciles timestamp metrics strictly to 57 identical and 43 distinct values", () => {
      // 1. Fixture labels: 57 identical_timestamp_pattern, 43 distinct_timestamp_values
      const gtLabels = dataset.records.map((r) => r.groundTruth.freshness.label);
      const gtIdentical = gtLabels.filter((l) => l === "identical_timestamp_pattern").length;
      const gtDistinct = gtLabels.filter((l) => l === "distinct_timestamp_values").length;
      expect(gtIdentical).toBe(57);
      expect(gtDistinct).toBe(43);

      // 2. Raw timestamp value equality: postedAt === createdAt && createdAt === updatedAt
      const rawIdenticalCount = dataset.records.filter(
        (r) =>
          Boolean(r.postedAt && r.createdAt && r.updatedAt) &&
          r.postedAt === r.createdAt &&
          r.createdAt === r.updatedAt
      ).length;
      expect(rawIdenticalCount).toBe(57);

      // 3. Scorecard engine output
      expect(scorecard.timestampPattern.perClassMetrics.identical_timestamp_pattern?.support).toBe(57);
      expect(scorecard.timestampPattern.perClassMetrics.identical_timestamp_pattern?.truePositives).toBe(57);
      expect(scorecard.timestampPattern.perClassMetrics.distinct_timestamp_values?.support).toBe(43);
      expect(scorecard.timestampPattern.perClassMetrics.distinct_timestamp_values?.truePositives).toBe(43);

      // 4. JSON reporter matches
      expect(jsonReport.scorecard.timestampPattern.perClassMetrics.identical_timestamp_pattern?.support).toBe(57);
      expect(jsonReport.scorecard.timestampPattern.perClassMetrics.distinct_timestamp_values?.support).toBe(43);

      // 5. Markdown report renders 57 and 43, and nowhere renders 81 or 19 for identical/distinct timestamp counts
      expect(markdown).toContain("| **`identical_timestamp_pattern`** | 57 | 57 | 100.00% | 100.00% | 1.0000 | Invariant Check |");
      expect(markdown).toContain("| **`distinct_timestamp_values`** | 43 | 43 | 100.00% | 100.00% | 1.0000 | Invariant Check |");
      expect(markdown).toContain("57 identical timestamp pattern");
      expect(markdown).not.toContain("81 identical timestamp pattern");
    });

    it("Audit 2: reconciles geography confusion matrix, accuracy (86.60%), and macro F1 (0.7631)", () => {
      // 1. Eligible denominator: 97 records (74 valid_us + 14 explicit_foreign + 6 metadata_discrepancy + 3 missing_location)
      expect(scorecard.geography.eligibility.eligibleRecords).toBe(97);
      expect(scorecard.geography.eligibility.excludedHeuristicRecords).toBe(2);
      expect(scorecard.geography.eligibility.excludedUnresolvedRecords).toBe(1);

      // 2. Confusion matrix exact values
      const matrix = scorecard.geography.confusionMatrix.matrix;
      expect(matrix.valid_us?.valid_us).toBe(74);
      expect(matrix.explicit_foreign?.valid_us).toBe(13); // 13 Canadian FN
      expect(matrix.explicit_foreign?.explicit_foreign).toBe(1);
      expect(matrix.metadata_discrepancy?.metadata_discrepancy).toBe(6);
      expect(matrix.missing_location?.missing_location).toBe(3);

      // 3. Per-class metrics
      expect(scorecard.geography.perClassMetrics.valid_us?.f1Score).toBe(0.9193);
      expect(scorecard.geography.perClassMetrics.explicit_foreign?.f1Score).toBe(0.1333);
      expect(scorecard.geography.perClassMetrics.metadata_discrepancy?.f1Score).toBe(1);
      expect(scorecard.geography.perClassMetrics.missing_location?.f1Score).toBe(1);

      // 4. Overall accuracy: 84 / 97 = 0.8660
      expect(scorecard.geography.overallAccuracy).toBe(0.866);

      // 5. Macro F1: (0.9193 + 0.1333 + 1.0 + 1.0) / 4 = 0.76315 -> 0.7631 (reconciled against 0.7121)
      expect(scorecard.geography.macroF1Score).toBe(0.7631);
      expect(markdown).toContain("0.7631");
      expect(markdown).not.toContain("0.7121");
    });

    it("Audit 3: verifies exact 19 exclusions and confirms metadata discrepancy is included (not excluded)", () => {
      const exclusions = scorecard.exclusionsAndLimitations.exclusionsList;
      expect(exclusions.length).toBe(19);

      // 12 heuristic distinct requisitions
      const heuristicDistinct = exclusions.filter(
        (e) => e.exclusionRule === "EXCLUDE_HEURISTIC_DISTINCT_FROM_CONFIRMED_VACANCIES"
      );
      expect(heuristicDistinct.length).toBe(12);

      // 4 unresolved duplicates
      const unresolvedDup = exclusions.filter(
        (e) => e.exclusionRule === "EXCLUDE_UNRESOLVED_DUPLICATE_FROM_BINARY_METRICS"
      );
      expect(unresolvedDup.length).toBe(4);

      // 2 heuristic city-only geography
      const heuristicGeo = exclusions.filter(
        (e) => e.exclusionRule === "EXCLUDE_HEURISTIC_GEOGRAPHY_FROM_DETERMINISTIC_METRICS"
      );
      expect(heuristicGeo.length).toBe(2);

      // 1 unresolved geography
      const unresolvedGeo = exclusions.filter(
        (e) => e.exclusionRule === "EXCLUDE_UNRESOLVED_GEOGRAPHY_FROM_ACCURACY"
      );
      expect(unresolvedGeo.length).toBe(1);

      // Confirm 0 metadata discrepancy exclusions (they are eligible records evaluated in confusion matrix)
      const metadataDiscrepancyExclusions = exclusions.filter(
        (e) => e.currentLabel === "metadata_discrepancy"
      );
      expect(metadataDiscrepancyExclusions.length).toBe(0);
      expect(scorecard.geography.perClassMetrics.metadata_discrepancy?.support).toBe(6);
    });

    it("Audit 4: traces review escalation to actual offline reviewer (16 needs_review vs 36 audit targets)", () => {
      // 1. Trace actual offline reviewer on all 100 benchmark records
      const normRecords = dataset.records.map(adaptBenchmarkToNormalizedRecord);
      const dupMap = detectDuplicates(normRecords);

      let actualNeedsReview = 0;
      let actualNotNeeded = 0;
      const escalatedBenchmarkIds: string[] = [];

      for (const norm of normRecords) {
        const geoFinding = validateGeography(norm);
        const dupFinding = dupMap.get(norm.recordId)!;
        const aiReview = evaluateAiReviewOffline(norm, dupFinding, geoFinding);
        if (aiReview.status === "needs_review") {
          actualNeedsReview++;
          escalatedBenchmarkIds.push(norm.recordId);
        } else {
          actualNotNeeded++;
        }
      }

      // Exactly 16 records marked needs_review (BM-032 to BM-047)
      expect(actualNeedsReview).toBe(16);
      expect(actualNotNeeded).toBe(84);
      expect(escalatedBenchmarkIds).toContain("BM-032");
      expect(escalatedBenchmarkIds).toContain("BM-047");

      // 2. Denominator breakdown of unresolved cases:
      // Unresolved duplicate: 4/4 (100.00%)
      expect(scorecard.abstentionAndReview.byDimension.duplicate.unresolvedCount).toBe(4);
      expect(scorecard.abstentionAndReview.byDimension.duplicate.escalatedToReviewCount).toBe(4);
      expect(scorecard.abstentionAndReview.byDimension.duplicate.escalationRate).toBe(1);

      // Unresolved geography: 1 total, 0 escalated (0.00%)
      expect(scorecard.abstentionAndReview.byDimension.geography.unresolvedCount).toBe(1);
      expect(scorecard.abstentionAndReview.byDimension.geography.escalatedToReviewCount).toBe(0);
      expect(scorecard.abstentionAndReview.byDimension.geography.escalationRate).toBe(0);

      // Overall unresolved escalation: 4/5 (80.00%)
      expect(scorecard.abstentionAndReview.totalUnresolvedRecords).toBe(5);
      expect(scorecard.abstentionAndReview.totalEscalatedUnresolvedRecords).toBe(4);
      expect(scorecard.abstentionAndReview.overallUnresolvedEscalationRate).toBe(0.8);

      // Heuristic escalation: 12/14 (85.71%)
      expect(scorecard.abstentionAndReview.totalHeuristicRecords).toBe(14);
      expect(scorecard.abstentionAndReview.totalEscalatedHeuristicRecords).toBe(12);
      expect(scorecard.abstentionAndReview.heuristicEscalationRate).toBe(0.8571);

      // 3. Reconcile the reported 36/100 figure from the Stage 3 deliverable:
      // The 36 figure was a conflation of non-standard benchmark cases:
      // 12 distinct requisitions + 24 non-valid-US geography records (14 foreign + 6 discrepancy + 3 missing + 1 unresolved) = 36.
      const distinctReqCount = dataset.records.filter(
        (r) => r.groundTruth.duplicate.label === "distinct_requisition"
      ).length;
      const nonValidUsCount = dataset.records.filter(
        (r) => r.groundTruth.geography.label !== "valid_us"
      ).length;
      expect(distinctReqCount + nonValidUsCount).toBe(36);

      // Contrast with actual offline reviewer runtime escalation: exactly 16 / 100 (16.00%)
      expect(actualNeedsReview).toBe(16);

      // Contrast with review priorities triage targets: 39 targets (14 high-geo + 4 high-dup + 12 med-dup + 9 low-geo)
      const reviewPriorities = deriveDefaultReviewPriorities(scorecard);
      const totalTriageTargets = reviewPriorities.reduce((sum, p) => sum + p.targetCount, 0);
      expect(totalTriageTargets).toBe(39);
    });

    it("Audit 5: traces 1,000-record inventory figures to audit report source fields and enforces isolation", () => {
      // 1. Verify default inventory context matches freehire-audit-report-latest.json
      expect(DEFAULT_INVENTORY_CONTEXT.totalInventoryRecords).toBe(1000);
      expect(DEFAULT_INVENTORY_CONTEXT.inventoryDatasetName).toBe("freehire-us-audit-1000.json");
      expect(DEFAULT_INVENTORY_CONTEXT.candidateDuplicatesInInventory).toBe(35);
      expect(DEFAULT_INVENTORY_CONTEXT.foreignSignalsInInventory).toBe(1);
      expect(DEFAULT_INVENTORY_CONTEXT.suspectedBatchTimestampsInInventory).toBe(764);
      expect(DEFAULT_INVENTORY_CONTEXT.humanReviewCountInInventory).toBe(16);

      // 2. Verify report explicitly warns that benchmark results do not represent the full 1,000 inventory
      expect(markdown).toContain("Benchmark Scope (100 Records) vs Inventory Feed (1000 Records)");
      expect(markdown).toContain(
        "Benchmark metrics evaluate rule fidelity on verified cases; they are not direct frequency counts of the broader 1,000-record inventory."
      );
    });
  });

  describe("7. Stage 4: Offline Report Usability & Acceptance", () => {
    let markdown: string;
    let jsonReport: ScorecardReportJson;

    beforeAll(() => {
      markdown = generateScorecardMarkdownReport(scorecard);
      jsonReport = buildScorecardReportJson(scorecard);
    });

    it("Requirement A: verifies traceability metadata in JSON and Markdown", () => {
      // 1. JSON report metadata
      expect(jsonReport.reportVersion).toBe("1.0");
      expect(jsonReport.benchmarkIdentifier).toBe("freehire-us-quality-benchmark-100");
      expect(jsonReport.benchmarkVersion).toBe("1.0");
      expect(jsonReport.scorecardVersion).toBe("1.0");
      expect(jsonReport.evaluationMethod).toBe("deterministic_offline_rule_evaluation");
      expect(jsonReport.evaluationInput).toBe("freehire-us-quality-benchmark-100");

      // 2. Markdown report header contains full traceability metadata
      expect(markdown).toContain("**Report Schema:** `1.0`");
      expect(markdown).toContain("**Scorecard Version:** `1.0`");
      expect(markdown).toContain("**Benchmark Version:** `1.0`");
      expect(markdown).toContain("**Evaluation Method:** `deterministic_offline_rule_evaluation`");
      expect(markdown).toContain("**Benchmark Identifier:** `freehire-us-quality-benchmark-100`");
      expect(markdown).toContain("AI_MODE=offline");
      expect(markdown).toContain("DUPLICATE_MASTER_POLICY=none");

      // 3. Unverified conditions and limitations visible in both JSON and Markdown
      expect(jsonReport.scorecard.unverifiedConditionsNotice.vacancyFreshnessVerified).toBe(false);
      expect(jsonReport.scorecard.unverifiedConditionsNotice.employerClosureVerified).toBe(false);
      expect(jsonReport.interpretationBoundaries.length).toBeGreaterThanOrEqual(7);
      expect(markdown).toContain("## 9. Metric Interpretation Boundaries & Limitations");
      expect(markdown).toContain("Real-world vacancy freshness: **UNVERIFIED**");
    });

    it("Requirement B: reports excluded dimension-pair counts separately from unique benchmark records affected", () => {
      // 1. JSON exclusions summary
      expect(jsonReport.exclusionsSummary).toBeDefined();
      expect(jsonReport.exclusionsSummary?.totalExcludedDimensionPairs).toBe(19);
      expect(jsonReport.exclusionsSummary?.uniqueBenchmarkRecordsAffected).toBe(19);
      expect(jsonReport.exclusionsSummary?.dimensionIndependenceNotice).toContain(
        "does NOT make the record ineligible for other evaluation dimensions"
      );

      // 2. Markdown section 8 reports both figures and the dimension independence notice
      expect(markdown).toContain("- **Total Excluded Record-Dimension Pairs:** **19**");
      expect(markdown).toContain("- **Unique Benchmark Records Affected:** **19** of 100 records");
      expect(markdown).toContain("Dimension Independence Notice");
      expect(markdown).toContain(
        "An exclusion of a record from one evaluation metric (e.g. deduplication due to heuristic distinct requisitions) applies strictly to that specific dimension."
      );
    });

    it("Requirement C: traces review priorities to findings and enforces non-deduplication across dimensions", () => {
      // 1. Priorities are derived strictly from scorecard findings
      expect(jsonReport.reviewPriorities.length).toBe(4);

      const highGeo = jsonReport.reviewPriorities.find(
        (p) => p.priority === "high" && p.dimension === "geography"
      );
      expect(highGeo).toBeDefined();
      expect(highGeo?.targetCount).toBe(14); // 13 foreign misses + 1 geo unresolved

      const highDup = jsonReport.reviewPriorities.find(
        (p) => p.priority === "high" && p.dimension === "duplicate"
      );
      expect(highDup).toBeDefined();
      expect(highDup?.targetCount).toBe(4); // 4 unresolved dups

      const medDup = jsonReport.reviewPriorities.find(
        (p) => p.priority === "medium" && p.dimension === "duplicate"
      );
      expect(medDup).toBeDefined();
      expect(medDup?.targetCount).toBe(12); // 12 distinct reqs

      const lowGeo = jsonReport.reviewPriorities.find(
        (p) => p.priority === "low" && p.dimension === "geography"
      );
      expect(lowGeo).toBeDefined();
      expect(lowGeo?.targetCount).toBe(9); // 3 missing location + 6 metadata discrepancy

      // 2. Total review targets = 39 (not deduplicated across dimensions)
      const totalTargets = jsonReport.reviewPriorities.reduce((s, p) => s + p.targetCount, 0);
      expect(totalTargets).toBe(39);

      // 3. Markdown includes explicit review attribution notice
      expect(markdown).toContain("Review Target Attribution Notice");
      expect(markdown).toContain("Review targets reflect candidate triage queues, not verified defects.");
    });

    it("Requirement D: renders understandable empty states when scorecard has 0 records", () => {
      const emptyDataset: BenchmarkDataset = {
        datasetName: "BM-EMPTY-STAGE4",
        sourceDataset: "empty.json",
        version: "1.0",
        createdAt: "2026-10-22T00:00:00Z",
        totalRecords: 0,
        description: "Empty test dataset for Stage 4 acceptance",
        compositionSummary: {
          confirmedDuplicateRecords: 0,
          distinctRequisitionRecords: 0,
          uniqueRecords: 0,
          unresolvedDuplicateRecords: 0,
          validUsRecords: 0,
          explicitForeignRecords: 0,
          metadataDiscrepancyRecords: 0,
          missingLocationRecords: 0,
          unresolvedGeographyRecords: 0,
          identicalTimestampPatternRecords: 0,
          distinctTimestampValuesRecords: 0,
          unresolvedFreshnessRecords: 0,
        },
        records: [],
      };

      const emptyScorecard = generateQualityScorecard(emptyDataset);
      const emptyJson = buildScorecardReportJson(emptyScorecard);
      expect(emptyJson.reviewPriorities).toHaveLength(0);
      expect(emptyJson.exclusionsSummary?.totalExcludedDimensionPairs).toBe(0);
      expect(emptyJson.exclusionsSummary?.uniqueBenchmarkRecordsAffected).toBe(0);

      const emptyMd = generateScorecardMarkdownReport(emptyScorecard);
      expect(emptyMd).toContain("*No actionable human review priorities identified for this evaluation.*");
      expect(emptyMd).toContain("*No record dimensions quarantined. Zero metric exclusions found.*");
      expect(emptyMd).toContain("- **Total Excluded Record-Dimension Pairs:** **0**");
      expect(emptyMd).toContain("- **Unique Benchmark Records Affected:** **0** of 0 records");
    });

    it("Requirement E: guarantees repeatability and separates variable metadata from deterministic metrics", () => {
      // 1. Two consecutive generations without options produces byte-for-byte identical output
      const runA_json = buildScorecardReportJson(scorecard);
      const runB_json = buildScorecardReportJson(scorecard);
      expect(JSON.stringify(runA_json)).toBe(JSON.stringify(runB_json));

      const runA_md = generateScorecardMarkdownReport(scorecard);
      const runB_md = generateScorecardMarkdownReport(scorecard);
      expect(runA_md).toBe(runB_md);

      // 2. Providing a custom generatedAt timestamp preserves schema validity without altering metrics
      const runWithTimestamp = buildScorecardReportJson(scorecard, {
        generatedAt: "2026-10-22T12:00:00.000Z",
      });
      expect(runWithTimestamp.generatedAt).toBe("2026-10-22T12:00:00.000Z");
      expect(runWithTimestamp.scorecard.deduplication.pairMetrics.metrics.precision).toBe(
        runA_json.scorecard.deduplication.pairMetrics.metrics.precision
      );
    });
  });

  describe("8. Stage 4.1: Final Integrity Reconciliation", () => {
    let markdown: string;
    let jsonReport: ScorecardReportJson;

    beforeAll(() => {
      jsonReport = buildScorecardReportJson(scorecard, { benchmark: dataset });
      markdown = generateScorecardMarkdownReport(scorecard, { benchmark: dataset });
    });

    it("Reconciles exclusions directly from actual scorecard data: pairs, unique records, per-dimension, and groupings", () => {
      const rec = reconcileScorecardExclusions(scorecard);

      // 1. Total excluded record-dimension pairs is exactly 19
      expect(rec.totalExcludedDimensionPairs).toBe(19);

      // 2. Unique benchmark IDs affected across all exclusions is 19
      expect(rec.uniqueBenchmarkRecordsAffected).toBe(19);

      // 3. Unique benchmark IDs affected per dimension
      expect(rec.uniqueBenchmarkIdsPerDimension.duplicate).toBe(16);
      expect(rec.uniqueBenchmarkIdsPerDimension.geography).toBe(3);
      expect(rec.uniqueBenchmarkIdsPerDimension.freshness).toBeUndefined();

      // 4. Benchmark IDs that appear in multiple dimensions: 0 in current benchmark
      expect(rec.multiDimensionBenchmarkIds).toEqual([]);

      // 5. Exclusions grouped by dimension, evidence level, and exclusion rule
      expect(rec.groupedExclusions).toEqual({
        "duplicate | heuristic_inference | EXCLUDE_HEURISTIC_DISTINCT_FROM_CONFIRMED_VACANCIES": 12,
        "duplicate | unresolved_insufficient | EXCLUDE_UNRESOLVED_DUPLICATE_FROM_BINARY_METRICS": 4,
        "geography | unresolved_insufficient | EXCLUDE_UNRESOLVED_GEOGRAPHY_FROM_ACCURACY": 1,
        "geography | heuristic_inference | EXCLUDE_HEURISTIC_GEOGRAPHY_FROM_DETERMINISTIC_METRICS": 2,
      });

      // Sum of grouped exclusions matches totalExcludedDimensionPairs
      const groupedSum = Object.values(rec.groupedExclusions).reduce((a, b) => a + b, 0);
      expect(groupedSum).toBe(19);

      // 6. JSON exclusionsSummary matches reconciled data
      expect(jsonReport.exclusionsSummary?.totalExcludedDimensionPairs).toBe(19);
      expect(jsonReport.exclusionsSummary?.uniqueBenchmarkRecordsAffected).toBe(19);
      expect(jsonReport.exclusionsSummary?.uniqueBenchmarkIdsPerDimension).toEqual({
        duplicate: 16,
        geography: 3,
      });
      expect(jsonReport.exclusionsSummary?.multiDimensionBenchmarkIds).toEqual([]);

      // 7. Markdown report renders the reconciled figures
      expect(markdown).toContain("- **Total Excluded Record-Dimension Pairs:** **19**");
      expect(markdown).toContain("- **Unique Benchmark Records Affected:** **19** of 100 records");
      expect(markdown).toContain("- **Unique Benchmark Records Affected per Dimension:** duplicate: 16, geography: 3");
      expect(markdown).toContain("- **Multi-Dimension Excluded Benchmark Records:** **0** (None)");
    });

    it("Regression test: handles multi-dimension overlapping exclusions without assuming pairs equals unique records", () => {
      // Create a mock scorecard where a benchmark ID appears in both duplicate and geography exclusions
      const mockScorecard: QualityScorecard = {
        ...scorecard,
        exclusionsAndLimitations: {
          exclusionsCount: 3,
          limitations: scorecard.exclusionsAndLimitations.limitations,
          exclusionsList: [
            {
              benchmarkId: "BM-OVERLAP-1",
              sourceRecordId: "src-1",
              dimension: "duplicate",
              evidenceLevel: "unresolved_insufficient",
              currentLabel: "unresolved",
              exclusionRule: "EXCLUDE_UNRESOLVED_DUPLICATE_FROM_BINARY_METRICS",
              rationale: "Duplicate ambiguity",
            },
            {
              benchmarkId: "BM-OVERLAP-1",
              sourceRecordId: "src-1",
              dimension: "geography",
              evidenceLevel: "unresolved_insufficient",
              currentLabel: "unresolved",
              exclusionRule: "EXCLUDE_UNRESOLVED_GEOGRAPHY_FROM_ACCURACY",
              rationale: "Geography ambiguity",
            },
            {
              benchmarkId: "BM-SINGLE-2",
              sourceRecordId: "src-2",
              dimension: "geography",
              evidenceLevel: "heuristic_inference",
              currentLabel: "valid_us",
              exclusionRule: "EXCLUDE_HEURISTIC_GEOGRAPHY_FROM_DETERMINISTIC_METRICS",
              rationale: "City-only location",
            },
          ],
        },
      };

      const reconciled = reconcileScorecardExclusions(mockScorecard);

      // 3 excluded pairs, but only 2 unique benchmark records affected!
      expect(reconciled.totalExcludedDimensionPairs).toBe(3);
      expect(reconciled.uniqueBenchmarkRecordsAffected).toBe(2);
      expect(reconciled.uniqueBenchmarkRecordsAffected).not.toBe(reconciled.totalExcludedDimensionPairs);

      // Per-dimension counts
      expect(reconciled.uniqueBenchmarkIdsPerDimension.duplicate).toBe(1);
      expect(reconciled.uniqueBenchmarkIdsPerDimension.geography).toBe(2);

      // Multi-dimension benchmark IDs correctly isolates BM-OVERLAP-1
      expect(reconciled.multiDimensionBenchmarkIds).toEqual(["BM-OVERLAP-1"]);

      // Verify report generator formats this overlapping case cleanly
      const mockJson = buildScorecardReportJson(mockScorecard);
      expect(mockJson.exclusionsSummary?.totalExcludedDimensionPairs).toBe(3);
      expect(mockJson.exclusionsSummary?.uniqueBenchmarkRecordsAffected).toBe(2);
      expect(mockJson.exclusionsSummary?.multiDimensionBenchmarkIds).toEqual(["BM-OVERLAP-1"]);

      const mockMd = generateScorecardMarkdownReport(mockScorecard);
      expect(mockMd).toContain("- **Total Excluded Record-Dimension Pairs:** **3**");
      expect(mockMd).toContain("- **Unique Benchmark Records Affected:** **2** of 100 records");
      expect(mockMd).toContain("BM-OVERLAP-1");
    });

    it("Reconciles review priorities: verifies all target IDs exist in fixture and derive without hardcoding", () => {
      const priorities = jsonReport.reviewPriorities;
      expect(priorities.length).toBe(4);

      const allFixtureIds = new Set(dataset.records.map((r) => r.benchmarkId));

      // Priority 1: High Geography (14 targets: 13 foreign misses + 1 geo unresolved)
      const p1 = priorities.find((p) => p.priority === "high" && p.dimension === "geography")!;
      expect(p1).toBeDefined();
      expect(p1.targetCount).toBe(14);
      expect(p1.targetBenchmarkIds).toBeDefined();
      expect(p1.targetBenchmarkIds?.length).toBe(14);
      for (const id of p1.targetBenchmarkIds!) {
        expect(allFixtureIds.has(id)).toBe(true);
      }
      expect(p1.targetBenchmarkIds).toContain("BM-054"); // geo unresolved
      expect(p1.targetBenchmarkIds).toContain("BM-100"); // foreign miss
      expect(p1.sampleBenchmarkIds).toEqual(p1.targetBenchmarkIds!.slice(0, 5));

      // Priority 2: High Duplicate (4 targets: unresolved duplicates)
      const p2 = priorities.find((p) => p.priority === "high" && p.dimension === "duplicate")!;
      expect(p2).toBeDefined();
      expect(p2.targetCount).toBe(4);
      expect(p2.targetBenchmarkIds).toEqual(["BM-044", "BM-045", "BM-046", "BM-047"]);
      for (const id of p2.targetBenchmarkIds!) {
        expect(allFixtureIds.has(id)).toBe(true);
      }
      expect(p2.sampleBenchmarkIds).toEqual(["BM-044", "BM-045", "BM-046", "BM-047"]);

      // Priority 3: Medium Duplicate (12 targets: heuristic distinct requisitions)
      const p3 = priorities.find((p) => p.priority === "medium" && p.dimension === "duplicate")!;
      expect(p3).toBeDefined();
      expect(p3.targetCount).toBe(12);
      expect(p3.targetBenchmarkIds?.length).toBe(12);
      expect(p3.targetBenchmarkIds).toEqual([
        "BM-032", "BM-033", "BM-034", "BM-035", "BM-036", "BM-037",
        "BM-038", "BM-039", "BM-040", "BM-041", "BM-042", "BM-043"
      ]);
      for (const id of p3.targetBenchmarkIds!) {
        expect(allFixtureIds.has(id)).toBe(true);
      }
      expect(p3.sampleBenchmarkIds).toEqual(["BM-032", "BM-033", "BM-034", "BM-035", "BM-036"]);

      // Priority 4: Low Geography (9 targets: 3 missing locations + 6 metadata discrepancies)
      const p4 = priorities.find((p) => p.priority === "low" && p.dimension === "geography")!;
      expect(p4).toBeDefined();
      expect(p4.targetCount).toBe(9);
      expect(p4.targetBenchmarkIds).toEqual([
        "BM-026", "BM-027", "BM-028", "BM-029", "BM-048", "BM-049", "BM-051", "BM-052", "BM-053"
      ]);
      for (const id of p4.targetBenchmarkIds!) {
        expect(allFixtureIds.has(id)).toBe(true);
      }
      expect(p4.sampleBenchmarkIds).toEqual(["BM-026", "BM-027", "BM-028", "BM-029", "BM-048"]);
    });

    it("Reconciles review queue assignments (39) vs unique benchmark records targeted (27) and calculates overlap (12)", () => {
      const rq = jsonReport.reviewQueuesSummary;
      expect(rq).toBeDefined();

      // 1. Total queue assignments = 14 + 4 + 12 + 9 = 39
      expect(rq?.totalQueueAssignments).toBe(39);

      // 2. Unique benchmark records targeted = 27
      expect(rq?.uniqueBenchmarkRecordsTargeted).toBe(27);

      // 3. Overlapping records count = 12
      expect(rq?.overlappingRecordsCount).toBe(12);

      // 4. Overlapping IDs:
      // BM-032..041 (10 records) in P1 (Geography) and P3 (Duplicate)
      // BM-046, BM-047 (2 records) in P1 (Geography) and P2 (Duplicate)
      const expectedOverlaps = [
        "BM-032", "BM-033", "BM-034", "BM-035", "BM-036",
        "BM-037", "BM-038", "BM-039", "BM-040", "BM-041",
        "BM-046", "BM-047",
      ].sort();
      expect(rq?.overlappingRecordIds).toEqual(expectedOverlaps);

      // 5. Mathematical consistency: unique (27) + overlaps (12) = total assignments (39)
      expect(rq!.uniqueBenchmarkRecordsTargeted + rq!.overlappingRecordsCount).toBe(rq!.totalQueueAssignments);

      // 6. Markdown renders the review queues summary
      expect(markdown).toContain("- **Total Queue Assignments:** **39**");
      expect(markdown).toContain("- **Unique Benchmark Records Targeted:** **27** of 100 records");
      expect(markdown).toContain("- **Cross-Dimension Overlapping Records:** **12** records");
      expect(markdown).toContain("`BM-032`, `BM-033`");
    });

    it("Enforces absence of unsupported sampling claims across fixture and reporter", () => {
      // 1. Fixture description uses evidence-supported language
      expect(dataset.description).not.toContain("representative sample");
      expect(dataset.description).not.toContain("verified ground-truth sample drawn from the inventory");
      expect(dataset.description).toContain("Curated 100-record benchmark fixture");

      // 2. Inventory context uses evidence-supported language
      expect(DEFAULT_INVENTORY_CONTEXT.relationshipToBenchmark).not.toContain("representative sample");
      expect(DEFAULT_INVENTORY_CONTEXT.relationshipToBenchmark).toContain("curated 100-record benchmark fixture");
      expect(DEFAULT_INVENTORY_CONTEXT.relationshipToBenchmark).toContain(
        "Deterministic fixture labels do not establish independent real-world ground truth"
      );

      // 3. Neither JSON nor Markdown reports contain unsupported sampling claims
      const jsonStr = JSON.stringify(jsonReport);
      expect(jsonStr).not.toContain("representative sample");
      expect(jsonStr).not.toContain("verified ground-truth sample drawn from the inventory");
      expect(markdown).not.toContain("representative sample");
      expect(markdown).not.toContain("verified ground-truth sample drawn from the inventory");
    });
  });
});
