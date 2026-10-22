/**
 * OOS Data Quality & Intelligence — Phase 3 Scorecard Engine
 *
 * Deterministic offline quality evaluation engine that executes actual Phase 1 rules
 * against the Ground-Truth Quality Benchmark, calculating defensible metrics,
 * confusion matrices, coverage ratios, and review escalation rates.
 *
 * Strict Principles:
 * - Deterministic: Same benchmark inputs always yield byte-for-byte identical output.
 * - Meaningful Denominators Only: Excludes heuristic and unresolved cases from binary
 *   accuracy metrics; safely returns null when denominators are zero.
 * - Does not treat sample uniqueness as real-world uniqueness.
 * - Does not score unverified freshness or crawler ingestion provenance.
 * - AI_MODE=offline and DUPLICATE_MASTER_POLICY=none strictly preserved.
 */

import type { BenchmarkDataset, BenchmarkRecord } from "./benchmark-schema";
import { evaluateAiReviewOffline } from "./intelligence/offline-reviewer";
import { detectDuplicates } from "./rules/duplicates";
import { evaluateFreshness } from "./rules/freshness";
import { validateGeography } from "./rules/geography";
import { adaptBenchmarkToNormalizedRecord } from "./scorecard-adapter";
import type {
  AbstentionAndReviewScorecard,
  ClassificationMetrics,
  ConfusionMatrix,
  DeduplicationScorecard,
  DimensionEligibility,
  GeographyScorecard,
  MetricExclusionEntry,
  QualityScorecard,
  ScorecardRunMetadata,
  TimestampPatternScorecard,
} from "./scorecard-types";
import { qualityScorecardSchema } from "./scorecard-types";

/**
 * Safely computes classification metrics handling zero-denominator conditions without NaN.
 */
function computeClassificationMetrics(
  tp: number,
  fp: number,
  fn: number,
  tn?: number
): ClassificationMetrics {
  const support = tp + fn;
  const precision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(4)) : null;
  const recall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(4)) : null;
  const f1Score =
    precision !== null && recall !== null && precision + recall > 0
      ? Number(((2 * precision * recall) / (precision + recall)).toFixed(4))
      : null;
  const specificity =
    tn !== undefined
      ? tn + fp > 0
        ? Number((tn / (tn + fp)).toFixed(4))
        : null
      : undefined;

  return {
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    trueNegatives: tn,
    support,
    precision,
    recall,
    f1Score,
    specificity,
  };
}

/**
 * Generates an unordered pair key for two IDs ensuring consistent ordering.
 */
function makePairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

/**
 * Evaluates the Deduplication dimension against eligible ground-truth records.
 */
function evaluateDeduplicationScorecard(
  benchmark: BenchmarkDataset,
  normalizedRecords: ReturnType<typeof adaptBenchmarkToNormalizedRecord>[]
): { scorecard: DeduplicationScorecard; exclusions: MetricExclusionEntry[] } {
  const exclusions: MetricExclusionEntry[] = [];
  const records = benchmark.records;

  let eligibleRecordsCount = 0;
  let excludedHeuristicCount = 0;
  let excludedUnresolvedCount = 0;

  const eligibleRecordIds = new Set<string>();

  for (const r of records) {
    const dup = r.groundTruth.duplicate;
    if (dup.evidenceLevel === "unresolved_insufficient") {
      excludedUnresolvedCount++;
      exclusions.push({
        dimension: "duplicate",
        benchmarkId: r.benchmarkId,
        sourceRecordId: r.sourceRecordId,
        evidenceLevel: "unresolved_insufficient",
        currentLabel: dup.label,
        exclusionRule: "EXCLUDE_UNRESOLVED_DUPLICATE_FROM_BINARY_METRICS",
        rationale: dup.missingEvidence || "Insufficient evidence to confirm duplicate or distinct status.",
      });
    } else if (dup.evidenceLevel === "heuristic_inference") {
      excludedHeuristicCount++;
      exclusions.push({
        dimension: "duplicate",
        benchmarkId: r.benchmarkId,
        sourceRecordId: r.sourceRecordId,
        evidenceLevel: "heuristic_inference",
        currentLabel: dup.label,
        exclusionRule: "EXCLUDE_HEURISTIC_DISTINCT_FROM_CONFIRMED_VACANCIES",
        rationale: "Distinct requisition IDs represent identifier differences; separate real-world openings require employer verification.",
      });
    } else {
      eligibleRecordsCount++;
      eligibleRecordIds.add(r.benchmarkId);
    }
  }

  // 1. Run actual Phase 1 detector on all normalized records
  const detectedMap = detectDuplicates(normalizedRecords);

  // 2. Build Ground-Truth Positive Pairs from confirmed duplicates
  const gtGroups = new Map<string, string[]>();
  for (const r of records) {
    if (
      eligibleRecordIds.has(r.benchmarkId) &&
      r.groundTruth.duplicate.label === "confirmed_duplicate" &&
      r.groundTruth.duplicate.groundTruthGroupId
    ) {
      const gid = r.groundTruth.duplicate.groundTruthGroupId;
      const list = gtGroups.get(gid) || [];
      list.push(r.benchmarkId);
      gtGroups.set(gid, list);
    }
  }

  const gtPositivePairs = new Set<string>();
  for (const members of gtGroups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        gtPositivePairs.add(makePairKey(members[i]!, members[j]!));
      }
    }
  }

  // 3. Build Predicted Positive Pairs from detector outputs within eligible records
  const detGroups = new Map<string, string[]>();
  for (const norm of normalizedRecords) {
    if (eligibleRecordIds.has(norm.recordId)) {
      const finding = detectedMap.get(norm.recordId);
      if (finding?.isDuplicateCandidate && finding.duplicateGroupId) {
        const list = detGroups.get(finding.duplicateGroupId) || [];
        list.push(norm.recordId);
        detGroups.set(finding.duplicateGroupId, list);
      }
    }
  }

  const detPositivePairs = new Set<string>();
  for (const members of detGroups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        detPositivePairs.add(makePairKey(members[i]!, members[j]!));
      }
    }
  }

  // 4. Compute Pair-Level Confusion Counts
  let pairTp = 0;
  let pairFp = 0;
  for (const pair of detPositivePairs) {
    if (gtPositivePairs.has(pair)) {
      pairTp++;
    } else {
      pairFp++;
    }
  }

  let pairFn = 0;
  for (const pair of gtPositivePairs) {
    if (!detPositivePairs.has(pair)) {
      pairFn++;
    }
  }

  const totalEligiblePairs =
    eligibleRecordsCount > 1
      ? (eligibleRecordsCount * (eligibleRecordsCount - 1)) / 2
      : 0;
  const pairTn = Math.max(0, totalEligiblePairs - pairTp - pairFp - pairFn);

  // 5. Compute Record-Level Confusion Counts (Eligible records only)
  let recTp = 0;
  let recFp = 0;
  let recFn = 0;
  let recTn = 0;

  for (const r of records) {
    if (eligibleRecordIds.has(r.benchmarkId)) {
      const isGtDup = r.groundTruth.duplicate.label === "confirmed_duplicate";
      const finding = detectedMap.get(r.benchmarkId);
      const isDetDup = Boolean(finding?.isDuplicateCandidate);

      if (isGtDup && isDetDup) recTp++;
      else if (!isGtDup && isDetDup) recFp++;
      else if (isGtDup && !isDetDup) recFn++;
      else recTn++;
    }
  }

  const eligibleCoverageRatio =
    records.length > 0 ? Number((eligibleRecordsCount / records.length).toFixed(4)) : 0;

  const scorecard: DeduplicationScorecard = {
    eligibility: {
      totalRecords: records.length,
      eligibleRecords: eligibleRecordsCount,
      excludedHeuristicRecords: excludedHeuristicCount,
      excludedUnresolvedRecords: excludedUnresolvedCount,
      eligibleCoverageRatio,
    },
    pairMetrics: {
      totalEligiblePairs,
      groundTruthPositivePairs: gtPositivePairs.size,
      predictedPositivePairs: detPositivePairs.size,
      metrics: computeClassificationMetrics(pairTp, pairFp, pairFn, pairTn),
    },
    recordMetrics: {
      metrics: computeClassificationMetrics(recTp, recFp, recFn, recTn),
    },
    pairGenerationPolicy: "unordered_pairs_within_eligible_deterministic_records",
    notes:
      "Deduplication evaluated on deterministic canonical URLs and shared ATS requisition IDs. 12 distinct requisition roles and 4 unresolved cases are strictly quarantined from binary metrics.",
  };

  return { scorecard, exclusions };
}

/**
 * Evaluates the Geography dimension against eligible ground-truth records.
 */
function evaluateGeographyScorecard(
  benchmark: BenchmarkDataset,
  normalizedRecords: ReturnType<typeof adaptBenchmarkToNormalizedRecord>[]
): { scorecard: GeographyScorecard; exclusions: MetricExclusionEntry[] } {
  const exclusions: MetricExclusionEntry[] = [];
  const records = benchmark.records;
  const classes = [
    "valid_us",
    "explicit_foreign",
    "metadata_discrepancy",
    "missing_location",
  ];

  // Initialize square confusion matrix
  const matrix: Record<string, Record<string, number>> = {};
  for (const c1 of classes) {
    matrix[c1] = {};
    for (const c2 of classes) {
      matrix[c1][c2] = 0;
    }
  }

  let eligibleRecordsCount = 0;
  let excludedHeuristicCount = 0;
  let excludedUnresolvedCount = 0;

  const normalizedMap = new Map<string, (typeof normalizedRecords)[0]>();
  for (const n of normalizedRecords) {
    normalizedMap.set(n.recordId, n);
  }

  for (const r of records) {
    const geo = r.groundTruth.geography;
    if (geo.evidenceLevel === "unresolved_insufficient") {
      excludedUnresolvedCount++;
      exclusions.push({
        dimension: "geography",
        benchmarkId: r.benchmarkId,
        sourceRecordId: r.sourceRecordId,
        evidenceLevel: "unresolved_insufficient",
        currentLabel: geo.label,
        exclusionRule: "EXCLUDE_UNRESOLVED_GEOGRAPHY_FROM_ACCURACY",
        rationale: geo.missingEvidence || "Lacks structured municipality/state fields.",
      });
    } else if (geo.evidenceLevel === "heuristic_inference") {
      excludedHeuristicCount++;
      exclusions.push({
        dimension: "geography",
        benchmarkId: r.benchmarkId,
        sourceRecordId: r.sourceRecordId,
        evidenceLevel: "heuristic_inference",
        currentLabel: geo.label,
        exclusionRule: "EXCLUDE_HEURISTIC_GEOGRAPHY_FROM_DETERMINISTIC_METRICS",
        rationale: "Domestic status inferred via employer context; raw location contains city name only.",
      });
    } else {
      eligibleRecordsCount++;
      const norm = normalizedMap.get(r.benchmarkId)!;
      const detectedFinding = validateGeography(norm);
      const detectedStatus = detectedFinding.status;
      const gtStatus = geo.label;

      if (matrix[gtStatus] && matrix[gtStatus][detectedStatus] !== undefined) {
        matrix[gtStatus][detectedStatus]++;
      }
    }
  }

  // Compute per-class precision, recall, F1
  let totalCorrect = 0;
  const perClassMetrics: Record<string, ClassificationMetrics> = {};
  const f1Scores: number[] = [];

  for (const cls of classes) {
    const tp = matrix[cls]![cls]!;
    totalCorrect += tp;

    let fn = 0;
    for (const c of classes) {
      if (c !== cls) fn += matrix[cls]![c]!;
    }

    let fp = 0;
    for (const c of classes) {
      if (c !== cls) fp += matrix[c]![cls]!;
    }

    let tn = 0;
    for (const c1 of classes) {
      if (c1 !== cls) {
        for (const c2 of classes) {
          if (c2 !== cls) tn += matrix[c1]![c2]!;
        }
      }
    }

    const metrics = computeClassificationMetrics(tp, fp, fn, tn);
    perClassMetrics[cls] = metrics;
    if (metrics.f1Score !== null) {
      f1Scores.push(metrics.f1Score);
    }
  }

  const overallAccuracy =
    eligibleRecordsCount > 0
      ? Number((totalCorrect / eligibleRecordsCount).toFixed(4))
      : null;
  const macroF1Score =
    f1Scores.length > 0
      ? Number((f1Scores.reduce((a, b) => a + b, 0) / f1Scores.length).toFixed(4))
      : null;
  const eligibleCoverageRatio =
    records.length > 0 ? Number((eligibleRecordsCount / records.length).toFixed(4)) : 0;

  const scorecard: GeographyScorecard = {
    eligibility: {
      totalRecords: records.length,
      eligibleRecords: eligibleRecordsCount,
      excludedHeuristicRecords: excludedHeuristicCount,
      excludedUnresolvedRecords: excludedUnresolvedCount,
      eligibleCoverageRatio,
    },
    overallAccuracy,
    macroF1Score,
    confusionMatrix: {
      classes,
      matrix,
    },
    perClassMetrics,
    notes:
      "Geography evaluated across 4 deterministic classes. 2 employer-inferred city-only cases and 1 unresolved national-level location are quarantined.",
  };

  return { scorecard, exclusions };
}

/**
 * Evaluates the Timestamp-pattern dimension.
 */
function evaluateTimestampPatternScorecard(
  benchmark: BenchmarkDataset,
  normalizedRecords: ReturnType<typeof adaptBenchmarkToNormalizedRecord>[]
): { scorecard: TimestampPatternScorecard; exclusions: MetricExclusionEntry[] } {
  const exclusions: MetricExclusionEntry[] = [];
  const records = benchmark.records;
  const classes = ["identical_timestamp_pattern", "distinct_timestamp_values"];

  const matrix: Record<string, Record<string, number>> = {};
  for (const c1 of classes) {
    matrix[c1] = {};
    for (const c2 of classes) {
      matrix[c1][c2] = 0;
    }
  }

  let eligibleRecordsCount = 0;
  let excludedHeuristicCount = 0;
  let excludedUnresolvedCount = 0;

  const normalizedMap = new Map<string, (typeof normalizedRecords)[0]>();
  for (const n of normalizedRecords) {
    normalizedMap.set(n.recordId, n);
  }

  for (const r of records) {
    const freshGt = r.groundTruth.freshness;

    // Verify raw timestamp equality integrity against hasIdenticalTimestamps
    const rawIsIdentical = Boolean(
      r.postedAt &&
        r.createdAt &&
        r.updatedAt &&
        r.postedAt === r.createdAt &&
        r.createdAt === r.updatedAt
    );

    if (freshGt.hasIdenticalTimestamps !== rawIsIdentical) {
      throw new Error(
        `Fixture invariant violation on ${r.benchmarkId}: hasIdenticalTimestamps does not agree with raw timestamps.`
      );
    }

    if (freshGt.label === "unresolved") {
      excludedUnresolvedCount++;
      exclusions.push({
        dimension: "freshness",
        benchmarkId: r.benchmarkId,
        sourceRecordId: r.sourceRecordId,
        evidenceLevel: "unresolved_insufficient",
        currentLabel: freshGt.label,
        exclusionRule: "EXCLUDE_UNRESOLVED_FRESHNESS_FROM_PATTERN_METRICS",
        rationale: "Timestamps missing or insufficient to evaluate pattern equality.",
      });
      continue;
    }

    eligibleRecordsCount++;
    const norm = normalizedMap.get(r.benchmarkId)!;
    const freshFinding = evaluateFreshness(norm);

    // Detector outputs suspectedIngestionBatch if posted_at === created_at === updated_at
    const detectedLabel = freshFinding.suspectedIngestionBatch
      ? "identical_timestamp_pattern"
      : "distinct_timestamp_values";
    const gtLabel = freshGt.label;

    if (matrix[gtLabel] && matrix[gtLabel][detectedLabel] !== undefined) {
      matrix[gtLabel][detectedLabel]++;
    }
  }

  let totalCorrect = 0;
  const perClassMetrics: Record<string, ClassificationMetrics> = {};
  const f1Scores: number[] = [];

  for (const cls of classes) {
    const tp = matrix[cls]![cls]!;
    totalCorrect += tp;

    let fn = 0;
    for (const c of classes) {
      if (c !== cls) fn += matrix[cls]![c]!;
    }

    let fp = 0;
    for (const c of classes) {
      if (c !== cls) fp += matrix[c]![cls]!;
    }

    let tn = 0;
    for (const c1 of classes) {
      if (c1 !== cls) {
        for (const c2 of classes) {
          if (c2 !== cls) tn += matrix[c1]![c2]!;
        }
      }
    }

    const metrics = computeClassificationMetrics(tp, fp, fn, tn);
    perClassMetrics[cls] = metrics;
    if (metrics.f1Score !== null) {
      f1Scores.push(metrics.f1Score);
    }
  }

  const overallAccuracy =
    eligibleRecordsCount > 0
      ? Number((totalCorrect / eligibleRecordsCount).toFixed(4))
      : null;
  const macroF1Score =
    f1Scores.length > 0
      ? Number((f1Scores.reduce((a, b) => a + b, 0) / f1Scores.length).toFixed(4))
      : null;
  const eligibleCoverageRatio =
    records.length > 0 ? Number((eligibleRecordsCount / records.length).toFixed(4)) : 0;

  const scorecard: TimestampPatternScorecard = {
    eligibility: {
      totalRecords: records.length,
      eligibleRecords: eligibleRecordsCount,
      excludedHeuristicRecords: excludedHeuristicCount,
      excludedUnresolvedRecords: excludedUnresolvedCount,
      eligibleCoverageRatio,
    },
    overallAccuracy,
    macroF1Score,
    confusionMatrix: {
      classes,
      matrix,
    },
    perClassMetrics,
    unverifiedConditionsNotice: {
      jobFreshnessScored: false,
      employerPostingDateAuthenticityScored: false,
      vacancyActiveClosedScored: false,
      ingestionProvenanceScored: false,
      explanation:
        "Offline feed telemetry cannot independently verify vacancy lifespan, original employer publication date, or crawler engine execution. Evaluations evaluate only observable timestamp equality.",
    },
    notes:
      "Evaluates deterministic timestamp concurrency pattern (identical_timestamp_pattern vs distinct_timestamp_values). Neither genuine vacancy age nor crawler ingestion batch is treated as verified ground truth.",
  };

  return { scorecard, exclusions };
}

/**
 * Evaluates Abstention and Review Escalation metrics across all dimensions.
 */
function evaluateAbstentionAndReview(
  benchmark: BenchmarkDataset,
  normalizedRecords: ReturnType<typeof adaptBenchmarkToNormalizedRecord>[]
): AbstentionAndReviewScorecard {
  const records = benchmark.records;
  const detectedDuplicates = detectDuplicates(normalizedRecords);

  const normalizedMap = new Map<string, (typeof normalizedRecords)[0]>();
  for (const n of normalizedRecords) {
    normalizedMap.set(n.recordId, n);
  }

  let dupUnresolved = 0;
  let dupEscalated = 0;

  let geoUnresolved = 0;
  let geoEscalated = 0;

  let freshUnresolved = 0;
  let freshEscalated = 0;

  let totalHeuristic = 0;
  let totalHeuristicEscalated = 0;

  for (const r of records) {
    const norm = normalizedMap.get(r.benchmarkId)!;
    const dupFinding = detectedDuplicates.get(r.benchmarkId)!;
    const geoFinding = validateGeography(norm);
    const aiReview = evaluateAiReviewOffline(norm, dupFinding, geoFinding);
    const isEscalated = aiReview.status === "needs_review";

    // Track duplicate dimension unresolved
    if (r.groundTruth.duplicate.evidenceLevel === "unresolved_insufficient") {
      dupUnresolved++;
      if (isEscalated) dupEscalated++;
    }

    // Track geography dimension unresolved
    if (r.groundTruth.geography.evidenceLevel === "unresolved_insufficient") {
      geoUnresolved++;
      if (isEscalated) geoEscalated++;
    }

    // Track freshness dimension unresolved
    if (r.groundTruth.freshness.evidenceLevel === "unresolved_insufficient") {
      freshUnresolved++;
      if (isEscalated) freshEscalated++;
    }

    // Track heuristic cases across dimensions
    const isHeuristic =
      r.groundTruth.duplicate.evidenceLevel === "heuristic_inference" ||
      r.groundTruth.geography.evidenceLevel === "heuristic_inference" ||
      r.groundTruth.freshness.evidenceLevel === "heuristic_inference";

    if (isHeuristic) {
      totalHeuristic++;
      if (isEscalated) totalHeuristicEscalated++;
    }
  }

  const dupEscalationRate =
    dupUnresolved > 0 ? Number((dupEscalated / dupUnresolved).toFixed(4)) : null;
  const geoEscalationRate =
    geoUnresolved > 0 ? Number((geoEscalated / geoUnresolved).toFixed(4)) : null;
  const freshEscalationRate =
    freshUnresolved > 0 ? Number((freshEscalated / freshUnresolved).toFixed(4)) : null;

  const totalUnresolved = dupUnresolved + geoUnresolved + freshUnresolved;
  const totalEscalatedUnresolved = dupEscalated + geoEscalated + freshEscalated;
  const overallUnresolvedEscalationRate =
    totalUnresolved > 0
      ? Number((totalEscalatedUnresolved / totalUnresolved).toFixed(4))
      : null;

  const heuristicEscalationRate =
    totalHeuristic > 0
      ? Number((totalHeuristicEscalated / totalHeuristic).toFixed(4))
      : null;

  return {
    byDimension: {
      duplicate: {
        unresolvedCount: dupUnresolved,
        escalatedToReviewCount: dupEscalated,
        escalationRate: dupEscalationRate,
      },
      geography: {
        unresolvedCount: geoUnresolved,
        escalatedToReviewCount: geoEscalated,
        escalationRate: geoEscalationRate,
      },
      freshness: {
        unresolvedCount: freshUnresolved,
        escalatedToReviewCount: freshEscalated,
        escalationRate: freshEscalationRate,
      },
    },
    totalUnresolvedRecords: totalUnresolved,
    totalEscalatedUnresolvedRecords: totalEscalatedUnresolved,
    overallUnresolvedEscalationRate,
    totalHeuristicRecords: totalHeuristic,
    totalEscalatedHeuristicRecords: totalHeuristicEscalated,
    heuristicEscalationRate,
    notes:
      "Escalation rate defines the proportion of ambiguous/unresolved cases appropriately escalated to human review (needs_review) rather than forced into automated classifications.",
  };
}

/**
 * Main entry point: Generates a complete, deterministic, JSON-serializable Quality Scorecard.
 *
 * @param benchmark Validated ground-truth benchmark dataset
 * @param runMetadata Optional execution metadata (kept separate from deterministic payload)
 * @returns Fully validated QualityScorecard
 */
export function generateQualityScorecard(
  benchmark: BenchmarkDataset,
  runMetadata?: ScorecardRunMetadata
): QualityScorecard {
  // 1. Adapt benchmark records to normalized rule records
  const normalizedRecords = benchmark.records.map((r, i) =>
    adaptBenchmarkToNormalizedRecord(r, i)
  );

  // 2. Evaluate Deduplication
  const { scorecard: deduplication, exclusions: dupExclusions } =
    evaluateDeduplicationScorecard(benchmark, normalizedRecords);

  // 3. Evaluate Geography
  const { scorecard: geography, exclusions: geoExclusions } =
    evaluateGeographyScorecard(benchmark, normalizedRecords);

  // 4. Evaluate Timestamp Pattern
  const { scorecard: timestampPattern, exclusions: freshExclusions } =
    evaluateTimestampPatternScorecard(benchmark, normalizedRecords);

  // 5. Evaluate Abstention and Review
  const abstentionAndReview = evaluateAbstentionAndReview(
    benchmark,
    normalizedRecords
  );

  // 6. Aggregate machine-readable exclusions list
  const allExclusions = [
    ...dupExclusions,
    ...geoExclusions,
    ...freshExclusions,
  ];

  const limitations = [
    "Offline evaluation: Zero external network or ATS queries performed (AI_MODE=offline). Real-world vacancy activity cannot be verified.",
    "Duplicate Master Policy: DUPLICATE_MASTER_POLICY=none strictly enforced. Records are never merged or deleted.",
    "Timestamp Authenticity: Posted and created timestamps reflect feed payload entries, not verified original employer publication times.",
    "Sample Uniqueness: Records marked unique in this 100-record benchmark sample are not guaranteed to be globally unique in the full inventory.",
  ];

  const benchmarkIdentifier =
    benchmark.datasetName ||
    (benchmark as unknown as { benchmarkId?: string }).benchmarkId ||
    "benchmark-dataset";

  const scorecard: QualityScorecard = {
    scorecardVersion: "1.0",
    benchmarkIdentifier,
    benchmarkVersion: benchmark.version,
    totalRecordsEvaluated: benchmark.records.length,
    deduplication,
    geography,
    timestampPattern,
    abstentionAndReview,
    unverifiedConditionsNotice: {
      vacancyFreshnessVerified: false,
      postingDateAuthenticityVerified: false,
      employerClosureVerified: false,
      ingestionProvenanceVerified: false,
      notice:
        "Frozen OOS evaluation rules: AI_MODE=offline, DUPLICATE_MASTER_POLICY=none. Real-world vacancy authenticity, employer closure, and crawler ingestion provenance are unverified and excluded from quality scoring.",
    },
    exclusionsAndLimitations: {
      exclusionsCount: allExclusions.length,
      exclusionsList: allExclusions,
      limitations,
    },
    runMetadata,
  };

  // 7. Validate through runtime Zod schema to ensure complete contract conformity
  const parseResult = qualityScorecardSchema.safeParse(scorecard);
  if (!parseResult.success) {
    throw new Error(
      `Scorecard contract validation failed: ${JSON.stringify(
        parseResult.error.format()
      )}`
    );
  }

  return parseResult.data;
}
