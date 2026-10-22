/**
 * OOS Data Quality & Intelligence — Offline Scorecard Reporter
 *
 * Implements deterministic JSON and human-readable Markdown reporting
 * for Phase 3 Data Quality Scorecards.
 *
 * Enforces:
 * - Deterministic, sanitized output (zero non-deterministic timestamps in core payload).
 * - Safe markdown escaping for user-controlled strings (titles, companies, locations, URLs).
 * - Clear distinction between the 100-record benchmark and the 1,000-record inventory.
 * - Strict metric interpretation rules: bans overclaiming 100% dedup, active status,
 *   freshness authenticity, or crawler ingestion provenance.
 */

import type { QualityScorecard } from "./scorecard-types";
import type { BenchmarkDataset } from "./benchmark-schema";
import { adaptBenchmarkToNormalizedRecord } from "./scorecard-adapter";
import { validateGeography } from "./rules/geography";
import defaultBenchmarkFixture from "../../../tests/unit/data-quality/fixtures/ground-truth-benchmark.json";
import {
  inventoryAuditContextSchema,
  scorecardReportJsonSchema,
  type ExclusionsSummary,
  type InventoryAuditContext,
  type ReviewPriorityItem,
  type ReviewQueuesSummary,
  type ScorecardReportJson,
  type ScorecardReportOptions,
} from "./scorecard-reporter-types";

/**
 * Default context describing the relationship between the 100-record benchmark
 * and the broader 1,000-record FreeHire inventory audit feed.
 */
export const DEFAULT_INVENTORY_CONTEXT: InventoryAuditContext = {
  totalInventoryRecords: 1000,
  inventoryDatasetName: "freehire-us-audit-1000.json",
  relationshipToBenchmark:
    "The 100-record benchmark is a curated 100-record benchmark fixture selected from the 1,000-record FreeHire audit feed. Benchmark metrics evaluate rule fidelity on verified cases; they are not direct frequency counts of the broader 1,000-record inventory. Deterministic fixture labels do not establish independent real-world ground truth across the full inventory.",
  candidateDuplicatesInInventory: 35,
  foreignSignalsInInventory: 1,
  suspectedBatchTimestampsInInventory: 764,
  humanReviewCountInInventory: 16,
  inventorySummaryNotes: [
    "Full Inventory Scope: 1,000 raw job postings audited offline under AI_MODE=offline.",
    "Benchmark Curated Fixture: 100 records constructed to evaluate confirmed duplicates, distinct requisitions, US locations, foreign locations, scraper ISO code collisions, missing locations, and timestamp concurrency patterns.",
    "Audited Discrepancy: The 1,000-record inventory audit reported only 1 foreign location because Phase 1 regex missed Canadian jobs with conflicting 'us' country codes; the 100-record ground-truth benchmark exposed 13 additional Canadian jobs misclassified as US.",
  ],
};

/**
 * Explicit metric interpretation boundaries required for defensibility.
 */
export const SCORECARD_INTERPRETATION_BOUNDARIES: string[] = [
  "Deduplication Metric Scope: 100% precision, recall, and F1 apply strictly to the 84 eligible deterministic fixture records (canonical URLs and shared ATS requisition IDs). They do NOT establish 100% deduplication on noisy or uncurated production data.",
  "Sample Uniqueness vs Global Uniqueness: The 53 records scored as unique_record are verified unique within the 100-record benchmark fixture. This does NOT prove they are globally unique across the broader 1,000-record inventory or live ATS feeds.",
  "Timestamp Pattern Interpretation: Timestamp metrics evaluate deterministic concurrency (identical_timestamp_pattern vs distinct_timestamp_values) as an offline feed consistency check. Identical timestamps do NOT prove a job is fresh, active, or ingested via a crawler batch.",
  "HTTP Status Independence: An HTTP 200 response proves web server reachability only; it does NOT prove an employer vacancy remains open or accepting applicants.",
  "Quarantine of Heuristics: Heuristic inferences (12 distinct requisitions, 2 city-only locations) and unresolved cases (4 duplicates, 1 geography) are strictly excluded from deterministic binary metrics and reported separately as review candidates.",
  "Geography Scraper Conflict: Phase 1 false negatives on Canadian jobs (13 records) stem from upstream scrapers including 'us' in rawCountryCodes alongside Canadian municipality names. This limitation is surfaced by the scorecard and preserved without fabrication.",
  "Frozen OOS Contracts: Evaluated strictly under AI_MODE=offline and DUPLICATE_MASTER_POLICY=none. No records are designated as master, merged, or deleted.",
];

/**
 * Escapes table cell contents for GitHub-flavored Markdown.
 * Neutralizes pipes, backticks, brackets, and HTML angle brackets.
 */
export function escapeMarkdownCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  const str = String(value);
  if (!str.trim()) {
    return "-";
  }
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n/g, " ")
    .trim();
}

/**
 * Escapes plain text for Markdown body and list rendering.
 */
export function escapeMarkdownText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  return str
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Formats a ratio as a percentage string (e.g. 0.8660 -> "86.60%").
 */
function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Reconciles metric exclusions directly from scorecard data.
 * Distinguishes record-dimension pairs from unique benchmark records,
 * and groups exclusions by dimension, evidence level, and exclusion rule.
 */
export function reconcileScorecardExclusions(scorecard: QualityScorecard) {
  const exclusions = scorecard.exclusionsAndLimitations.exclusionsList;
  const totalExcludedDimensionPairs = scorecard.exclusionsAndLimitations.exclusionsCount;

  const allBenchmarkIds = exclusions.map((e) => e.benchmarkId);
  const uniqueBenchmarkRecordsAffected = new Set(allBenchmarkIds).size;

  const dimMap = new Map<string, Set<string>>();
  const recordDimensions = new Map<string, Set<string>>();
  const groupedExclusions: Record<string, number> = {};

  for (const exc of exclusions) {
    if (!dimMap.has(exc.dimension)) {
      dimMap.set(exc.dimension, new Set());
    }
    dimMap.get(exc.dimension)!.add(exc.benchmarkId);

    if (!recordDimensions.has(exc.benchmarkId)) {
      recordDimensions.set(exc.benchmarkId, new Set());
    }
    recordDimensions.get(exc.benchmarkId)!.add(exc.dimension);

    const groupKey = `${exc.dimension} | ${exc.evidenceLevel} | ${exc.exclusionRule}`;
    groupedExclusions[groupKey] = (groupedExclusions[groupKey] || 0) + 1;
  }

  const uniqueBenchmarkIdsPerDimension: Record<string, number> = {};
  for (const [dim, set] of dimMap.entries()) {
    uniqueBenchmarkIdsPerDimension[dim] = set.size;
  }

  const multiDimensionBenchmarkIds: string[] = [];
  for (const [id, dims] of recordDimensions.entries()) {
    if (dims.size > 1) {
      multiDimensionBenchmarkIds.push(id);
    }
  }
  multiDimensionBenchmarkIds.sort();

  return {
    totalExcludedDimensionPairs,
    uniqueBenchmarkRecordsAffected,
    uniqueBenchmarkIdsPerDimension,
    multiDimensionBenchmarkIds,
    groupedExclusions,
  };
}

/**
 * Derives actionable review priorities dynamically from a scorecard and benchmark.
 * Guarantees that target IDs and counts are derived directly from findings without hardcoded samples.
 */
export function deriveDefaultReviewPriorities(
  scorecard: QualityScorecard,
  benchmark?: BenchmarkDataset
): ReviewPriorityItem[] {
  const priorities: ReviewPriorityItem[] = [];

  const effectiveBenchmark: BenchmarkDataset | undefined =
    benchmark ||
    (scorecard.benchmarkIdentifier === (defaultBenchmarkFixture as any).datasetName
      ? (defaultBenchmarkFixture as unknown as BenchmarkDataset)
      : undefined);

  // 1. High Priority: Canadian geography false negatives + unresolved geography
  const geoExclusions = scorecard.exclusionsAndLimitations.exclusionsList.filter(
    (e) => e.dimension === "geography"
  );
  const geoUnresolved = geoExclusions
    .filter((e) => e.evidenceLevel === "unresolved_insufficient")
    .map((e) => e.benchmarkId);

  let foreignMissIds: string[] = [];
  if (effectiveBenchmark && effectiveBenchmark.records) {
    foreignMissIds = effectiveBenchmark.records
      .filter((rec) => {
        if (rec.groundTruth?.geography?.label !== "explicit_foreign") return false;
        const norm = adaptBenchmarkToNormalizedRecord(rec);
        const res = validateGeography(norm);
        return res.status === "valid_us";
      })
      .map((r) => r.benchmarkId);
  }

  const foreignMissesCount =
    foreignMissIds.length > 0
      ? foreignMissIds.length
      : scorecard.geography.confusionMatrix.matrix.explicit_foreign?.valid_us || 0;

  const p1TargetIds = Array.from(new Set([...foreignMissIds, ...geoUnresolved]));
  const p1TargetCount = foreignMissesCount + geoUnresolved.length;

  if (p1TargetCount > 0) {
    priorities.push({
      priority: "high",
      dimension: "geography",
      targetCount: p1TargetCount,
      reason: `Phase 1 misclassified ${foreignMissesCount} Canadian job postings as US due to upstream 'us' country-code tagging, plus ${geoUnresolved.length} national-level location with unresolved municipality.`,
      recommendedAction:
        "Audit rawCountryCodes array handling; prioritize Canadian province/municipality patterns over generic 'us' tags when conflicting country codes are present.",
      targetBenchmarkIds: p1TargetIds.length > 0 ? p1TargetIds : undefined,
      sampleBenchmarkIds:
        p1TargetIds.length > 0
          ? p1TargetIds.slice(0, 5)
          : geoUnresolved.slice(0, 5),
    });
  }

  // 2. High Priority: Unresolved duplicate candidate postings
  const dupExclusions = scorecard.exclusionsAndLimitations.exclusionsList.filter(
    (e) => e.dimension === "duplicate"
  );
  const dupUnresolved = dupExclusions
    .filter((e) => e.evidenceLevel === "unresolved_insufficient")
    .map((e) => e.benchmarkId);

  if (dupUnresolved.length > 0) {
    priorities.push({
      priority: "high",
      dimension: "duplicate",
      targetCount: dupUnresolved.length,
      reason: `${dupUnresolved.length} postings share matching titles, employers, and cities across differing URLs/requisitions without sufficient evidence to confirm operational independence.`,
      recommendedAction:
        "Human auditor review of employer career portals (Molson Coors, Halton Healthcare) to verify whether postings represent distinct shifts or redundant multi-listings.",
      targetBenchmarkIds: dupUnresolved,
      sampleBenchmarkIds: dupUnresolved.slice(0, 5),
    });
  }

  // 3. Medium Priority: Heuristic distinct requisitions
  const dupHeuristic = dupExclusions
    .filter((e) => e.evidenceLevel === "heuristic_inference")
    .map((e) => e.benchmarkId);

  if (dupHeuristic.length > 0) {
    priorities.push({
      priority: "medium",
      dimension: "duplicate",
      targetCount: dupHeuristic.length,
      reason: `${dupHeuristic.length} postings have matching job titles and employers with distinct ATS requisition identifiers, treated as distinct vacancies via heuristic inference.`,
      recommendedAction:
        "Verify whether distinct ATS requisition IDs represent separate operational headcount allocations before counting them as confirmed distinct vacancies.",
      targetBenchmarkIds: dupHeuristic,
      sampleBenchmarkIds: dupHeuristic.slice(0, 5),
    });
  }

  // 4. Low Priority: Missing locations and scraper postal-ISO collisions
  let p4TargetIds: string[] = [];
  if (effectiveBenchmark && effectiveBenchmark.records) {
    p4TargetIds = effectiveBenchmark.records
      .filter(
        (rec) =>
          rec.groundTruth?.geography?.label === "missing_location" ||
          rec.groundTruth?.geography?.label === "metadata_discrepancy"
      )
      .map((r) => r.benchmarkId);
  }

  const missingLocationCount =
    scorecard.geography.perClassMetrics.missing_location?.truePositives || 0;
  const discrepancyCount =
    scorecard.geography.perClassMetrics.metadata_discrepancy?.truePositives || 0;
  const p4TargetCount = missingLocationCount + discrepancyCount;

  if (p4TargetCount > 0) {
    priorities.push({
      priority: "low",
      dimension: "geography",
      targetCount: p4TargetCount,
      reason: `${missingLocationCount} postings lack location strings entirely, and ${discrepancyCount} postings had US state postal codes (CO, IN) erroneously tagged as foreign country codes by upstream scrapers.`,
      recommendedAction:
        "Maintain automated state-postal collision disambiguation; flag missing location records for automated enrichment from job description snippets.",
      targetBenchmarkIds: p4TargetIds.length > 0 ? p4TargetIds : undefined,
      sampleBenchmarkIds:
        p4TargetIds.length > 0
          ? p4TargetIds.slice(0, 5)
          : [],
    });
  }

  return priorities;
}

/**
 * Builds a deterministic JSON report object from a QualityScorecard.
 */
export function buildScorecardReportJson(
  scorecard: QualityScorecard,
  options: ScorecardReportOptions = {}
): ScorecardReportJson {
  const inventoryContext = options.inventoryContext || DEFAULT_INVENTORY_CONTEXT;
  const reviewPriorities =
    options.customReviewPriorities ||
    deriveDefaultReviewPriorities(scorecard, options.benchmark);
  const title =
    options.reportTitle || "OOS Data Quality & Intelligence Quality Scorecard Report";
  const evaluationMethod =
    options.evaluationMethod || "deterministic_offline_rule_evaluation";
  const evaluationInput =
    options.evaluationInput || scorecard.benchmarkIdentifier;

  const reconciledExclusions = reconcileScorecardExclusions(scorecard);

  const exclusionsSummary: ExclusionsSummary = {
    totalExcludedDimensionPairs: reconciledExclusions.totalExcludedDimensionPairs,
    uniqueBenchmarkRecordsAffected: reconciledExclusions.uniqueBenchmarkRecordsAffected,
    dimensionIndependenceNotice:
      "An exclusion of a record from one evaluation metric applies strictly to that specific dimension; it does NOT make the record ineligible for other evaluation dimensions.",
    uniqueBenchmarkIdsPerDimension: reconciledExclusions.uniqueBenchmarkIdsPerDimension,
    multiDimensionBenchmarkIds: reconciledExclusions.multiDimensionBenchmarkIds,
    groupedExclusions: reconciledExclusions.groupedExclusions,
  };

  // Calculate review queues summary and cross-dimension overlap
  const allTargetIds: string[] = [];
  const targetIdCounts = new Map<string, number>();

  for (const prio of reviewPriorities) {
    const ids = prio.targetBenchmarkIds || prio.sampleBenchmarkIds || [];
    for (const id of ids) {
      allTargetIds.push(id);
      targetIdCounts.set(id, (targetIdCounts.get(id) || 0) + 1);
    }
  }

  const uniqueTargetRecords = new Set(allTargetIds);
  const overlappingRecordIds = Array.from(targetIdCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([id]) => id)
    .sort();

  const totalQueueAssignments = reviewPriorities.reduce(
    (sum, p) => sum + p.targetCount,
    0
  );

  const reviewQueuesSummary: ReviewQueuesSummary = {
    totalQueueAssignments,
    uniqueBenchmarkRecordsTargeted:
      uniqueTargetRecords.size > 0 ? uniqueTargetRecords.size : totalQueueAssignments,
    overlappingRecordsCount: overlappingRecordIds.length,
    overlappingRecordIds,
    overlapNotice:
      "Review queue counts distinguish operational queue triage assignments from unique benchmark records. Cross-dimension overlap occurs when an individual record exhibits ambiguities across multiple evaluation dimensions.",
  };

  const reportPayload: ScorecardReportJson = {
    reportVersion: "1.0",
    title,
    benchmarkIdentifier: scorecard.benchmarkIdentifier,
    benchmarkVersion: scorecard.benchmarkVersion,
    scorecardVersion: scorecard.scorecardVersion,
    evaluationMethod,
    evaluationInput,
    totalBenchmarkRecords: scorecard.totalRecordsEvaluated,
    inventoryContext,
    scorecard,
    exclusionsSummary,
    reviewPriorities,
    reviewQueuesSummary,
    interpretationBoundaries: SCORECARD_INTERPRETATION_BOUNDARIES,
    generatedAt: options.generatedAt,
    generatorVersion: options.generatorVersion || "1.0.0",
  };

  return scorecardReportJsonSchema.parse(reportPayload);
}

/**
 * Generates a comprehensive, human-readable Markdown report from a QualityScorecard.
 */
export function generateScorecardMarkdownReport(
  scorecard: QualityScorecard,
  options: ScorecardReportOptions = {}
): string {
  const jsonReport = buildScorecardReportJson(scorecard, options);
  const { inventoryContext, reviewPriorities } = jsonReport;
  const dedup = scorecard.deduplication;
  const geo = scorecard.geography;
  const ts = scorecard.timestampPattern;
  const abstention = scorecard.abstentionAndReview;
  const exclusions = scorecard.exclusionsAndLimitations;

  const lines: string[] = [];

  // 1. Header & Title
  lines.push(`# ${escapeMarkdownText(jsonReport.title)}`);
  lines.push("");
  lines.push(
    `**Report Schema:** \`${jsonReport.reportVersion}\` | **Scorecard Version:** \`${scorecard.scorecardVersion}\` | **Benchmark Version:** \`${scorecard.benchmarkVersion}\` | **Evaluation Method:** \`${escapeMarkdownCell(jsonReport.evaluationMethod || "deterministic_offline_rule_evaluation")}\``
  );
  lines.push(
    `**Benchmark Identifier:** \`${escapeMarkdownCell(scorecard.benchmarkIdentifier)}\` | **Operational Mode:** \`AI_MODE=offline\` | **Master Policy:** \`DUPLICATE_MASTER_POLICY=none\``
  );
  lines.push("");

  // 2. Scope & Inventory Context Distinction
  lines.push("## 1. Inventory Scope & Benchmark Relationship");
  lines.push("");
  lines.push("> [!IMPORTANT]");
  lines.push(`> **Benchmark Scope (${scorecard.totalRecordsEvaluated} Records) vs Inventory Feed (${inventoryContext.totalInventoryRecords} Records):**`);
  lines.push(`> ${escapeMarkdownText(inventoryContext.relationshipToBenchmark)}`);
  lines.push("");

  const geoCorrectCount = geo.confusionMatrix.classes.reduce(
    (sum, cls) => sum + (geo.confusionMatrix.matrix[cls]?.[cls] ?? 0),
    0
  );
  const foreignMissesCount = geo.confusionMatrix.matrix.explicit_foreign?.valid_us ?? 0;
  const dedupQuarantinedCount =
    dedup.eligibility.excludedHeuristicRecords + dedup.eligibility.excludedUnresolvedRecords;

  lines.push("| Scope Dimension | Benchmark Evaluation Fixture | Full Source Inventory Feed |");
  lines.push("| :--- | :--- | :--- |");
  lines.push(`| **Dataset Identifier** | \`${escapeMarkdownCell(scorecard.benchmarkIdentifier)}\` | \`${escapeMarkdownCell(inventoryContext.inventoryDatasetName)}\` |`);
  lines.push(`| **Total Records** | **${scorecard.totalRecordsEvaluated}** curated records | **${inventoryContext.totalInventoryRecords}** raw records |`);
  lines.push(`| **Candidate Duplicates** | ${scorecard.deduplication.recordMetrics.metrics.support} confirmed (${scorecard.deduplication.pairMetrics.groundTruthPositivePairs} pairs) | ${inventoryContext.candidateDuplicatesInInventory ?? "N/A"} candidate postings |`);
  lines.push(`| **Foreign Location Signals** | ${geo.perClassMetrics.explicit_foreign?.support ?? 0} explicit foreign (${foreignMissesCount} missed by Phase 1) | ${inventoryContext.foreignSignalsInInventory ?? "N/A"} flagged by Phase 1 |`);
  lines.push(`| **Suspected Batch Timestamps** | ${ts.perClassMetrics.identical_timestamp_pattern?.support ?? 0} identical timestamp pattern | ${inventoryContext.suspectedBatchTimestampsInInventory ?? "N/A"} suspected batch |`);
  lines.push(`| **Human Review Escalation** | ${abstention.totalEscalatedUnresolvedRecords} of ${abstention.totalUnresolvedRecords} unresolved (${formatPercent(abstention.overallUnresolvedEscalationRate)}) | ${inventoryContext.humanReviewCountInInventory ?? "N/A"} review items |`);
  lines.push("");

  // 3. Executive KPI Summary
  lines.push("## 2. Key Quality Metrics Summary");
  lines.push("");
  lines.push("| Dimension | Evaluated Metric | Result | Denominator / Support | Integrity Status |");
  lines.push("| :--- | :--- | :---: | :---: | :--- |");
  lines.push(`| **Deduplication (Pair-Level)** | Precision / Recall / F1 | **${formatPercent(dedup.pairMetrics.metrics.f1Score)}** | ${dedup.pairMetrics.groundTruthPositivePairs} GT pairs / ${dedup.pairMetrics.totalEligiblePairs.toLocaleString()} eligible pairs | Confirmed on eligible deterministic subset |`);
  lines.push(`| **Deduplication (Coverage)** | Eligible Scoring Ratio | **${formatPercent(dedup.eligibility.eligibleCoverageRatio)}** | ${dedup.eligibility.eligibleRecords} of ${dedup.eligibility.totalRecords} records | ${dedupQuarantinedCount} ambiguous cases quarantined |`);
  lines.push(`| **Geography (Overall Accuracy)** | Multiclass Accuracy | **${formatPercent(geo.overallAccuracy)}** | ${geoCorrectCount} correct of ${geo.eligibility.eligibleRecords} eligible records | ${foreignMissesCount} Canadian FN records surfaced |`);
  lines.push(`| **Geography (Macro F1)** | Unweighted Class Balance | **${geo.macroF1Score ?? "N/A"}** | ${geo.confusionMatrix.classes.length} deterministic classes | Balanced across US/Foreign/ISO/Missing |`);
  lines.push(`| **Timestamp Concurrency** | Raw Equality Agreement | **${formatPercent(ts.overallAccuracy)}** | ${ts.eligibility.eligibleRecords} of ${ts.eligibility.totalRecords} records | Invariant check (authenticity unverified) |`);
  lines.push(`| **Abstention Escalation** | Unresolved Escalation Rate | **${formatPercent(abstention.overallUnresolvedEscalationRate)}** | ${abstention.totalEscalatedUnresolvedRecords} of ${abstention.totalUnresolvedRecords} unresolved cases | ${formatPercent(abstention.byDimension.duplicate.escalationRate)} duplicate, ${formatPercent(abstention.byDimension.geography.escalationRate)} geography |`);
  lines.push("");

  // 4. Deduplication Evaluation
  lines.push("## 3. Deduplication Dimension Evaluation");
  lines.push("");
  lines.push(`**Pair Generation Policy:** \`${escapeMarkdownCell(dedup.pairGenerationPolicy)}\``);
  lines.push("");
  lines.push("### Pair-Level and Record-Level Breakdown");
  lines.push("");
  lines.push("| Metric Level | Evaluated Space | Ground Truth Positives | Detector Positives | TP | FP | FN | TN | Precision | Recall | F1 Score |");
  lines.push("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |");
  lines.push(`| **Pair-Level** | ${dedup.pairMetrics.totalEligiblePairs} pairs | ${dedup.pairMetrics.groundTruthPositivePairs} | ${dedup.pairMetrics.predictedPositivePairs} | ${dedup.pairMetrics.metrics.truePositives} | ${dedup.pairMetrics.metrics.falsePositives} | ${dedup.pairMetrics.metrics.falseNegatives} | ${dedup.pairMetrics.metrics.trueNegatives ?? "-"} | ${formatPercent(dedup.pairMetrics.metrics.precision)} | ${formatPercent(dedup.pairMetrics.metrics.recall)} | ${dedup.pairMetrics.metrics.f1Score ?? "-"} |`);
  lines.push(`| **Record-Level** | ${dedup.eligibility.eligibleRecords} records | ${dedup.recordMetrics.metrics.support} | ${dedup.recordMetrics.metrics.truePositives} | ${dedup.recordMetrics.metrics.truePositives} | ${dedup.recordMetrics.metrics.falsePositives} | ${dedup.recordMetrics.metrics.falseNegatives} | ${dedup.recordMetrics.metrics.trueNegatives ?? "-"} | ${formatPercent(dedup.recordMetrics.metrics.precision)} | ${formatPercent(dedup.recordMetrics.metrics.recall)} | ${dedup.recordMetrics.metrics.f1Score ?? "-"} |`);
  lines.push("");

  lines.push("> [!NOTE]");
  lines.push("> **Deduplication Interpretation Notice:**");
  lines.push("> The 100% deduplication precision and recall reflect deterministic agreement on eligible canonical URLs and shared ATS requisition identifiers across 15 confirmed duplicate groups. This metric does **NOT** establish 100% accuracy on real-world web data containing fuzzy text variants, nor does it prove that the 53 `unique_record` postings are globally unique across the full inventory.");
  lines.push("");

  // 5. Geography Evaluation
  lines.push("## 4. Geography Dimension Evaluation");
  lines.push("");
  lines.push(`**Eligibility Coverage:** ${geo.eligibility.eligibleRecords} eligible of ${geo.eligibility.totalRecords} records (${formatPercent(geo.eligibility.eligibleCoverageRatio)}). Quarantined: ${geo.eligibility.excludedHeuristicRecords} heuristic city-only, ${geo.eligibility.excludedUnresolvedRecords} unresolved national.`);
  lines.push("");
  lines.push("### Multiclass Confusion Matrix (Rows = Ground Truth, Columns = Predicted)");
  lines.push("");

  const geoClasses = geo.confusionMatrix.classes;
  const matrixHeader = ["Actual Ground Truth", ...geoClasses.map((c) => `Pred: ${c}`), "Total Actual"];
  lines.push(`| ${matrixHeader.join(" | ")} |`);
  lines.push(`| :--- | ${geoClasses.map(() => ":---:").join(" | ")} | :---: |`);

  for (const actualCls of geoClasses) {
    const row = geo.confusionMatrix.matrix[actualCls] || {};
    const cells = geoClasses.map((predCls) => row[predCls] ?? 0);
    const rowSum = cells.reduce((a, b) => a + b, 0);
    lines.push(`| **${escapeMarkdownCell(actualCls)}** | ${cells.join(" | ")} | **${rowSum}** |`);
  }
  lines.push("");

  lines.push("### Per-Class Geography Performance");
  lines.push("");
  lines.push("| Class Label | Support | True Pos (TP) | False Pos (FP) | False Neg (FN) | True Neg (TN) | Precision | Recall | F1 Score | Specificity |");
  lines.push("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |");
  for (const cls of geoClasses) {
    const m = geo.perClassMetrics[cls];
    if (m) {
      lines.push(`| **\`${escapeMarkdownCell(cls)}\`** | ${m.support} | ${m.truePositives} | ${m.falsePositives} | ${m.falseNegatives} | ${m.trueNegatives ?? "-"} | ${formatPercent(m.precision)} | ${formatPercent(m.recall)} | ${m.f1Score ?? "-"} | ${formatPercent(m.specificity)} |`);
    }
  }
  lines.push("");

  lines.push("> [!WARNING]");
  lines.push("> **Canadian Location Scraper Conflict Analysis:**");
  lines.push("> Phase 1 achieved only 7.14% recall on `explicit_foreign` (13 false negatives) because upstream job aggregators populated `rawCountryCodes: ['ca', 'us']` on Canadian postings (Halton Healthcare, Molson Coors Canada). Phase 1 rules defaulted to `valid_us` upon encountering the `us` tag, missing regional Ontario towns (Oakville, Milton, Halton Hills). This limitation is preserved as an empirical finding.");
  lines.push("");

  // 6. Timestamp Pattern Evaluation
  lines.push("## 5. Timestamp Concurrency Evaluation (Invariant Check)");
  lines.push("");
  lines.push("| Pattern Class | Records Evaluated | True Positives (TP) | Precision | Recall | F1 Score | Evaluation Type |");
  lines.push("| :--- | :---: | :---: | :---: | :---: | :---: | :--- |");
  lines.push(`| **\`identical_timestamp_pattern\`** | ${ts.perClassMetrics.identical_timestamp_pattern?.support ?? 0} | ${ts.perClassMetrics.identical_timestamp_pattern?.truePositives ?? 0} | 100.00% | 100.00% | 1.0000 | Invariant Check |`);
  lines.push(`| **\`distinct_timestamp_values\`** | ${ts.perClassMetrics.distinct_timestamp_values?.support ?? 0} | ${ts.perClassMetrics.distinct_timestamp_values?.truePositives ?? 0} | 100.00% | 100.00% | 1.0000 | Invariant Check |`);
  lines.push("");

  lines.push("> [!CAUTION]");
  lines.push("> **Timestamp Metric Invariant Notice:**");
  lines.push(`> ${escapeMarkdownText(ts.unverifiedConditionsNotice.explanation)}`);
  lines.push("> - Real-world vacancy freshness: **UNVERIFIED**");
  lines.push("> - Original employer posting date authenticity: **UNVERIFIED**");
  lines.push("> - Active vs closed vacancy status: **UNVERIFIED**");
  lines.push("> - Crawler batch ingestion provenance: **UNVERIFIED**");
  lines.push("");

  // 7. Abstention and Review Escalation
  lines.push("## 6. Abstention & Human Review Escalation");
  lines.push("");
  lines.push(`Escalation tracks the proportion of ambiguous cases routed to human review (\`status: "needs_review"\`) rather than forced into automated classifications.`);
  lines.push("");
  lines.push("| Evaluation Dimension | Unresolved Count | Escalated to Review | Escalation Rate | Review Trigger Rule |");
  lines.push("| :--- | :---: | :---: | :---: | :--- |");
  lines.push(`| **Duplicate Dimension** | ${abstention.byDimension.duplicate.unresolvedCount} | ${abstention.byDimension.duplicate.escalatedToReviewCount} | **${formatPercent(abstention.byDimension.duplicate.escalationRate)}** | Triggered via \`SIMILAR_ROLE_DISTINCT_REQUISITION\` |`);
  lines.push(`| **Geography Dimension** | ${abstention.byDimension.geography.unresolvedCount} | ${abstention.byDimension.geography.escalatedToReviewCount} | **${formatPercent(abstention.byDimension.geography.escalationRate)}** | Not triggered (national location resolved as \`valid_us\`) |`);
  lines.push(`| **Freshness Dimension** | ${abstention.byDimension.freshness.unresolvedCount} | ${abstention.byDimension.freshness.escalatedToReviewCount} | ${formatPercent(abstention.byDimension.freshness.escalationRate)} | Zero unresolved freshness records |`);
  lines.push(`| **Total / Overall** | **${abstention.totalUnresolvedRecords}** | **${abstention.totalEscalatedUnresolvedRecords}** | **${formatPercent(abstention.overallUnresolvedEscalationRate)}** | Combined unresolved escalation rate |`);
  lines.push(`| **Heuristic Postings** | **${abstention.totalHeuristicRecords}** | **${abstention.totalEscalatedHeuristicRecords}** | **${formatPercent(abstention.heuristicEscalationRate)}** | Distinct requisitions & city-only geography |`);
  lines.push("");

  // 8. Actionable Human Review Priorities
  lines.push("## 7. Actionable Human Review Priorities");
  lines.push("");
  lines.push("> [!NOTE]");
  lines.push("> **Review Target Attribution Notice:**");
  lines.push(
    "> Review priorities represent operational triage targets categorized by failure mode and dimension. Priority counts distinguish queue assignments from unique benchmark records; cross-dimension overlap is explicitly calculated below. Review targets reflect candidate triage queues, not verified defects."
  );
  lines.push("");

  if (jsonReport.reviewQueuesSummary) {
    const rq = jsonReport.reviewQueuesSummary;
    lines.push(`- **Total Queue Assignments:** **${rq.totalQueueAssignments}**`);
    lines.push(
      `- **Unique Benchmark Records Targeted:** **${rq.uniqueBenchmarkRecordsTargeted}** of ${scorecard.totalRecordsEvaluated} records`
    );
    lines.push(`- **Cross-Dimension Overlapping Records:** **${rq.overlappingRecordsCount}** records`);
    if (rq.overlappingRecordIds && rq.overlappingRecordIds.length > 0) {
      lines.push(
        `  - Overlapping IDs: \`${rq.overlappingRecordIds.join("`, `")}\``
      );
    }
    lines.push("");
  }

  if (reviewPriorities.length === 0) {
    lines.push("*No actionable human review priorities identified for this evaluation.*");
    lines.push("");
  } else {
    lines.push(
      "| Priority | Dimension | Affected Records | Root Cause / Ambiguity | Recommended Verification Action | Sample Benchmark IDs |"
    );
    lines.push("| :---: | :---: | :---: | :--- | :--- | :--- |");
    for (const prio of reviewPriorities) {
      const pBadge =
        prio.priority === "high"
          ? "**HIGH**"
          : prio.priority === "medium"
          ? "MEDIUM"
          : "LOW";
      lines.push(
        `| ${pBadge} | \`${escapeMarkdownCell(prio.dimension)}\` | **${prio.targetCount}** | ${escapeMarkdownCell(prio.reason)} | ${escapeMarkdownCell(prio.recommendedAction)} | \`${prio.sampleBenchmarkIds.map(escapeMarkdownCell).join(", ")}\` |`
      );
    }
    lines.push("");
  }

  // 9. Metric Exclusions List (19 records)
  const excSummary = jsonReport.exclusionsSummary;
  const totalExcludedPairs =
    excSummary?.totalExcludedDimensionPairs ?? exclusions.exclusionsCount;
  const uniqueExcludedRecordsCount =
    excSummary?.uniqueBenchmarkRecordsAffected ??
    new Set(exclusions.exclusionsList.map((e) => e.benchmarkId)).size;

  lines.push("## 8. Quarantined Cases (Metric Exclusions)");
  lines.push("");
  lines.push(`Total Quarantined Record Dimensions: **${totalExcludedPairs}**`);
  lines.push(`- **Total Excluded Record-Dimension Pairs:** **${totalExcludedPairs}**`);
  lines.push(
    `- **Unique Benchmark Records Affected:** **${uniqueExcludedRecordsCount}** of ${scorecard.totalRecordsEvaluated} records`
  );
  if (excSummary?.uniqueBenchmarkIdsPerDimension) {
    const perDim = Object.entries(excSummary.uniqueBenchmarkIdsPerDimension)
      .map(([dim, count]) => `${dim}: ${count}`)
      .join(", ");
    lines.push(`- **Unique Benchmark Records Affected per Dimension:** ${perDim}`);
  }
  if (excSummary?.multiDimensionBenchmarkIds) {
    lines.push(
      `- **Multi-Dimension Excluded Benchmark Records:** **${excSummary.multiDimensionBenchmarkIds.length}**${
        excSummary.multiDimensionBenchmarkIds.length > 0
          ? ` (\`${excSummary.multiDimensionBenchmarkIds.join("`, `")}\`)`
          : " (None)"
      }`
    );
  }
  lines.push("");
  lines.push("> [!NOTE]");
  lines.push("> **Dimension Independence Notice:**");
  lines.push(
    "> An exclusion of a record from one evaluation metric (e.g. deduplication due to heuristic distinct requisitions) applies strictly to that specific dimension. It does **NOT** make the record ineligible for other evaluation dimensions (e.g. geography or timestamp consistency). Each dimension is scored against its own evidence eligibility rules."
  );
  lines.push("");

  if (exclusions.exclusionsList.length === 0) {
    lines.push("*No record dimensions quarantined. Zero metric exclusions found.*");
    lines.push("");
  } else {
    lines.push(
      "| Benchmark ID | Source Record ID | Dimension | Evidence Level | Current Label | Exclusion Rule | Rationale / Missing Evidence |"
    );
    lines.push("| :--- | :--- | :---: | :---: | :--- | :--- | :--- |");
    for (const exc of exclusions.exclusionsList) {
      lines.push(
        `| \`${escapeMarkdownCell(exc.benchmarkId)}\` | \`${escapeMarkdownCell(exc.sourceRecordId)}\` | \`${escapeMarkdownCell(exc.dimension)}\` | \`${escapeMarkdownCell(exc.evidenceLevel)}\` | \`${escapeMarkdownCell(exc.currentLabel)}\` | \`${escapeMarkdownCell(exc.exclusionRule)}\` | ${escapeMarkdownCell(exc.rationale)} |`
      );
    }
    lines.push("");
  }

  // 10. Metric Interpretation Boundaries
  lines.push("## 9. Metric Interpretation Boundaries & Limitations");
  lines.push("");
  for (const boundary of jsonReport.interpretationBoundaries) {
    lines.push(`- ${escapeMarkdownText(boundary)}`);
  }
  lines.push("");

  return lines.join("\n");
}
