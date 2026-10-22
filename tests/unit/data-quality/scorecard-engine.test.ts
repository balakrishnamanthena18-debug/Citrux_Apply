import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  benchmarkDatasetSchema,
  type BenchmarkDataset,
  type BenchmarkRecord,
} from "@/lib/data-quality/benchmark-schema";
import {
  generateQualityScorecard,
  qualityScorecardSchema,
  type QualityScorecard,
} from "@/lib/data-quality";

describe("OOS Data Quality & Intelligence — Phase 3, Stage 2: Offline Scorecard Engine", () => {
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
    const result = benchmarkDatasetSchema.safeParse(parsed);
    expect(result.success).toBe(true);
    dataset = (result as { success: true; data: BenchmarkDataset }).data;
    scorecard = generateQualityScorecard(dataset);
  });

  it("loads and parses the 100-record benchmark fixture", () => {
    expect(dataset.records.length).toBe(100);
  });

  describe("1. Scorecard Generation & Deterministic Serialization", () => {
    it("generates a valid scorecard conforming strictly to qualityScorecardSchema", () => {
      scorecard = generateQualityScorecard(dataset);
      const validation = qualityScorecardSchema.safeParse(scorecard);
      expect(validation.success).toBe(true);
      if (!validation.success) {
        console.error(validation.error.errors);
      }
      expect(scorecard.benchmarkIdentifier).toBe(
        "freehire-us-quality-benchmark-100"
      );
      expect(scorecard.benchmarkVersion).toBe("1.0");
      expect(scorecard.totalRecordsEvaluated).toBe(100);
    });

    it("produces byte-for-byte identical output on repeated runs without random or time-dependent fields", () => {
      const run1 = generateQualityScorecard(dataset);
      const run2 = generateQualityScorecard(dataset);

      const json1 = JSON.stringify(run1);
      const json2 = JSON.stringify(run2);
      expect(json1).toBe(json2);

      // Verify JSON serialization round-trip
      const parsedRoundTrip = JSON.parse(json1);
      const revalidation = qualityScorecardSchema.safeParse(parsedRoundTrip);
      expect(revalidation.success).toBe(true);
    });

    it("attaches runMetadata cleanly without mutating score payload core fields", () => {
      const runMetadata = {
        executionEnvironment: "vitest_test_runner",
        triggeredBy: "stage2_unit_test",
        notes: "deterministic audit run",
      };
      const scorecardWithMeta = generateQualityScorecard(dataset, runMetadata);
      expect(scorecardWithMeta.runMetadata).toBeDefined();
      expect(scorecardWithMeta.runMetadata?.executionEnvironment).toBe(
        "vitest_test_runner"
      );
      expect(scorecardWithMeta.runMetadata?.triggeredBy).toBe(
        "stage2_unit_test"
      );

      // Core scorecard metrics must remain strictly identical
      const { runMetadata: _, ...coreWithMeta } = scorecardWithMeta;
      const { runMetadata: __, ...coreWithoutMeta } = scorecard;
      expect(coreWithMeta).toEqual(coreWithoutMeta);
    });

    it("verifies frozen contract unverified condition notices are all false", () => {
      const notices = scorecard.unverifiedConditionsNotice;
      expect(notices.vacancyFreshnessVerified).toBe(false);
      expect(notices.postingDateAuthenticityVerified).toBe(false);
      expect(notices.employerClosureVerified).toBe(false);
      expect(notices.ingestionProvenanceVerified).toBe(false);
      expect(notices.notice).toContain("offline");
    });
  });

  describe("2. Deduplication Metrics & Ground-Truth Exclusion", () => {
    it("scores only records with evidenceLevel == deterministic_dataset (84 records)", () => {
      const dedup = scorecard.deduplication;
      expect(dedup.eligibility.totalRecords).toBe(100);
      expect(dedup.eligibility.eligibleRecords).toBe(84);
      expect(dedup.eligibility.excludedHeuristicRecords).toBe(12);
      expect(dedup.eligibility.excludedUnresolvedRecords).toBe(4);
      expect(dedup.eligibility.eligibleCoverageRatio).toBe(0.84);
    });

    it("evaluates pair-level deduplication metrics correctly against the 17 deterministic pairs", () => {
      const dedup = scorecard.deduplication;
      const pairMetrics = dedup.pairMetrics;

      expect(pairMetrics.totalEligiblePairs).toBe((84 * 83) / 2); // 3486 pairs
      expect(pairMetrics.groundTruthPositivePairs).toBe(17);
      expect(pairMetrics.predictedPositivePairs).toBe(17);

      expect(pairMetrics.metrics.truePositives).toBe(17);
      expect(pairMetrics.metrics.falsePositives).toBe(0);
      expect(pairMetrics.metrics.falseNegatives).toBe(0);
      expect(pairMetrics.metrics.trueNegatives).toBe(3486 - 17);

      expect(pairMetrics.metrics.precision).toBe(1.0);
      expect(pairMetrics.metrics.recall).toBe(1.0);
      expect(pairMetrics.metrics.f1Score).toBe(1.0);
    });

    it("evaluates record-level deduplication metrics correctly on the 84 eligible records", () => {
      const dedup = scorecard.deduplication;
      const recordMetrics = dedup.recordMetrics;

      expect(recordMetrics.metrics.support).toBe(31);
      expect(recordMetrics.metrics.truePositives).toBe(31);
      expect(recordMetrics.metrics.falsePositives).toBe(0);
      expect(recordMetrics.metrics.falseNegatives).toBe(0);
      expect(recordMetrics.metrics.trueNegatives).toBe(53);

      expect(recordMetrics.metrics.precision).toBe(1.0);
      expect(recordMetrics.metrics.recall).toBe(1.0);
      expect(recordMetrics.metrics.f1Score).toBe(1.0);
    });

    it("uses unordered_pairs_within_eligible_deterministic_records pair policy", () => {
      expect(scorecard.deduplication.pairGenerationPolicy).toBe(
        "unordered_pairs_within_eligible_deterministic_records"
      );
    });
  });

  describe("3. Geography Multiclass Metrics & Boundary Testing", () => {
    it("excludes 2 heuristic city-only records and 1 unresolved national record", () => {
      const geo = scorecard.geography;
      expect(geo.eligibility.totalRecords).toBe(100);
      expect(geo.eligibility.eligibleRecords).toBe(97);
      expect(geo.eligibility.excludedHeuristicRecords).toBe(2); // BM-065, BM-084
      expect(geo.eligibility.excludedUnresolvedRecords).toBe(1); // BM-054
      expect(geo.eligibility.eligibleCoverageRatio).toBe(0.97);
    });

    it("scores multiclass confusion matrix and reveals actual Phase 1 detector behavior", () => {
      const geo = scorecard.geography;
      const matrix = geo.confusionMatrix.matrix;

      // 74 valid_us records correctly detected as valid_us
      expect(matrix.valid_us!.valid_us).toBe(74);
      expect(matrix.valid_us!.explicit_foreign).toBe(0);
      expect(matrix.valid_us!.metadata_discrepancy).toBe(0);
      expect(matrix.valid_us!.missing_location).toBe(0);

      // 14 explicit_foreign: 1 detected as explicit_foreign, 13 misclassified as valid_us by Phase 1
      expect(matrix.explicit_foreign!.explicit_foreign).toBe(1);
      expect(matrix.explicit_foreign!.valid_us).toBe(13);
      expect(matrix.explicit_foreign!.metadata_discrepancy).toBe(0);
      expect(matrix.explicit_foreign!.missing_location).toBe(0);

      // 6 metadata_discrepancy: all 6 detected
      expect(matrix.metadata_discrepancy!.metadata_discrepancy).toBe(6);
      expect(matrix.metadata_discrepancy!.valid_us).toBe(0);

      // 3 missing_location: all 3 detected
      expect(matrix.missing_location!.missing_location).toBe(3);
      expect(matrix.missing_location!.valid_us).toBe(0);
    });

    it("verifies per-class precision, recall, and F1 handles detector limits truthfully", () => {
      const geo = scorecard.geography;
      const perClass = geo.perClassMetrics;

      // valid_us class: TP = 74, FP = 13 (from Canadian jobs), FN = 0
      const validUs = perClass.valid_us!;
      expect(validUs).toBeDefined();
      expect(validUs.truePositives).toBe(74);
      expect(validUs.falsePositives).toBe(13);
      expect(validUs.falseNegatives).toBe(0);
      expect(validUs.recall).toBe(1.0);
      expect(validUs.precision).toBeCloseTo(74 / 87, 4);

      // explicit_foreign class: TP = 1, FP = 0, FN = 13
      const foreign = perClass.explicit_foreign!;
      expect(foreign).toBeDefined();
      expect(foreign.truePositives).toBe(1);
      expect(foreign.falsePositives).toBe(0);
      expect(foreign.falseNegatives).toBe(13);
      expect(foreign.precision).toBe(1.0);
      expect(foreign.recall).toBeCloseTo(1 / 14, 4);

      // metadata_discrepancy class: TP = 6, FP = 0, FN = 0
      const discrepancy = perClass.metadata_discrepancy!;
      expect(discrepancy).toBeDefined();
      expect(discrepancy.truePositives).toBe(6);
      expect(discrepancy.precision).toBe(1.0);
      expect(discrepancy.recall).toBe(1.0);
      expect(discrepancy.f1Score).toBe(1.0);

      // missing_location class: TP = 3, FP = 0, FN = 0
      const missing = perClass.missing_location!;
      expect(missing).toBeDefined();
      expect(missing.truePositives).toBe(3);
      expect(missing.precision).toBe(1.0);
      expect(missing.recall).toBe(1.0);
      expect(missing.f1Score).toBe(1.0);

      // Overall accuracy: (74 + 1 + 6 + 3) / 97 = 84 / 97 ≈ 0.8660
      expect(geo.overallAccuracy).toBeCloseTo(84 / 97, 4);
    });

    it("treats missing location and metadata discrepancy as distinct separate classes", () => {
      const perClass = scorecard.geography.perClassMetrics;
      expect(perClass.missing_location).toBeDefined();
      expect(perClass.metadata_discrepancy).toBeDefined();
      expect(perClass.missing_location!.support).toBe(3);
      expect(perClass.metadata_discrepancy!.support).toBe(6);
    });
  });

  describe("4. Timestamp Pattern Metrics & Fixture Consistency", () => {
    it("confirms identical_timestamp_pattern and distinct_timestamp_values evaluate 100 eligible records", () => {
      const ts = scorecard.timestampPattern;
      expect(ts.eligibility.totalRecords).toBe(100);
      expect(ts.eligibility.eligibleRecords).toBe(100);
      expect(ts.eligibility.excludedHeuristicRecords).toBe(0);
      expect(ts.eligibility.excludedUnresolvedRecords).toBe(0);
      expect(ts.eligibility.eligibleCoverageRatio).toBe(1.0);
    });

    it("evaluates timestamp pattern accuracy against raw timestamp equality", () => {
      const ts = scorecard.timestampPattern;
      expect(ts.overallAccuracy).toBe(1.0);

      const identical = ts.perClassMetrics.identical_timestamp_pattern!;
      expect(identical).toBeDefined();
      expect(identical.support).toBe(57);
      expect(identical.truePositives).toBe(57);
      expect(identical.falsePositives).toBe(0);
      expect(identical.falseNegatives).toBe(0);
      expect(identical.precision).toBe(1.0);
      expect(identical.recall).toBe(1.0);
      expect(identical.f1Score).toBe(1.0);

      const distinct = ts.perClassMetrics.distinct_timestamp_values!;
      expect(distinct).toBeDefined();
      expect(distinct.support).toBe(43);
      expect(distinct.truePositives).toBe(43);
      expect(distinct.falsePositives).toBe(0);
      expect(distinct.falseNegatives).toBe(0);
      expect(distinct.precision).toBe(1.0);
      expect(distinct.recall).toBe(1.0);
      expect(distinct.f1Score).toBe(1.0);
    });

    it("verifies unverified freshness and provenance fields are NOT scored as ground truth", () => {
      const tsNotice = scorecard.timestampPattern.unverifiedConditionsNotice;
      expect(tsNotice.jobFreshnessScored).toBe(false);
      expect(tsNotice.employerPostingDateAuthenticityScored).toBe(false);
      expect(tsNotice.vacancyActiveClosedScored).toBe(false);
      expect(tsNotice.ingestionProvenanceScored).toBe(false);
      expect(tsNotice.explanation).toContain(
        "Offline feed telemetry cannot independently verify"
      );
    });
  });

  describe("5. Abstention & Human Review Escalation Metrics", () => {
    it("tracks unresolved records by dimension and calculates human review escalation rates", () => {
      const review = scorecard.abstentionAndReview;
      expect(review.totalUnresolvedRecords).toBe(5);
      expect(review.totalEscalatedUnresolvedRecords).toBe(4);
      expect(review.overallUnresolvedEscalationRate).toBe(0.8);

      // Duplicate dimension: 4 unresolved records (BM-044..BM-047)
      expect(review.byDimension.duplicate.unresolvedCount).toBe(4);
      expect(review.byDimension.duplicate.escalatedToReviewCount).toBe(4);
      expect(review.byDimension.duplicate.escalationRate).toBe(1.0);

      // Geography dimension: 1 unresolved record (BM-054)
      expect(review.byDimension.geography.unresolvedCount).toBe(1);
      expect(review.byDimension.geography.escalatedToReviewCount).toBe(0);
      expect(review.byDimension.geography.escalationRate).toBe(0.0);

      // Freshness dimension: 0 unresolved records
      expect(review.byDimension.freshness.unresolvedCount).toBe(0);
      expect(review.byDimension.freshness.escalatedToReviewCount).toBe(0);
      expect(review.byDimension.freshness.escalationRate).toBeNull();
    });

    it("confirms unresolved cases are excluded from true/false positive classification counts", () => {
      // In dedup: 84 eligible (31 confirmed + 53 unique). The 4 unresolved are NOT in the 84.
      const dedup = scorecard.deduplication;
      expect(dedup.recordMetrics.metrics.support).toBe(31);
      expect(dedup.recordMetrics.metrics.truePositives).toBe(31);
      expect(dedup.recordMetrics.metrics.trueNegatives).toBe(53);
      expect(dedup.recordMetrics.metrics.falsePositives).toBe(0);
      expect(dedup.recordMetrics.metrics.falseNegatives).toBe(0);
    });
  });

  describe("6. Machine-Readable Exclusions List & Limitations", () => {
    it("lists all 19 metric exclusion entries with benchmark IDs, dimension, evidenceLevel, and rationale", () => {
      const exclusions = scorecard.exclusionsAndLimitations.exclusionsList;
      expect(exclusions.length).toBe(19);
      expect(scorecard.exclusionsAndLimitations.exclusionsCount).toBe(19);

      const dedupExclusions = exclusions.filter(
        (e) => e.dimension === "duplicate"
      );
      expect(dedupExclusions.length).toBe(16); // 12 distinct_requisition + 4 unresolved

      const geoExclusions = exclusions.filter(
        (e) => e.dimension === "geography"
      );
      expect(geoExclusions.length).toBe(3); // 2 heuristic city-only + 1 unresolved

      for (const entry of exclusions) {
        expect(entry.benchmarkId).toMatch(/^BM-\d{3}$/);
        expect(["duplicate", "geography", "freshness"]).toContain(
          entry.dimension
        );
        expect([
          "heuristic_inference",
          "unresolved_insufficient",
        ]).toContain(entry.evidenceLevel);
        expect(entry.rationale.length).toBeGreaterThan(5);
        expect(entry.currentLabel).toBeDefined();
        expect(entry.exclusionRule).toBeDefined();
      }
    });

    it("includes explicit frozen contract limitations in the scorecard", () => {
      const limitations = scorecard.exclusionsAndLimitations.limitations;
      expect(limitations.length).toBeGreaterThanOrEqual(4);
      expect(limitations.some((l) => l.includes("AI_MODE=offline"))).toBe(
        true
      );
      expect(
        limitations.some((l) => l.includes("DUPLICATE_MASTER_POLICY=none"))
      ).toBe(true);
    });
  });

  describe("7. Boundary & Edge Cases", () => {
    it("handles an empty benchmark dataset gracefully without throwing NaN or divide-by-zero", () => {
      const emptyDataset = {
        datasetName: "BM-EMPTY",
        sourceDataset: "test-source.json",
        version: "1.0" as const,
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
      const validation = qualityScorecardSchema.safeParse(emptyScorecard);
      expect(validation.success).toBe(true);

      expect(emptyScorecard.totalRecordsEvaluated).toBe(0);
      expect(emptyScorecard.deduplication.eligibility.eligibleRecords).toBe(0);
      expect(emptyScorecard.deduplication.eligibility.eligibleCoverageRatio).toBe(0);
      expect(
        emptyScorecard.deduplication.pairMetrics.metrics.precision
      ).toBeNull();
      expect(
        emptyScorecard.deduplication.pairMetrics.metrics.recall
      ).toBeNull();
      expect(
        emptyScorecard.deduplication.pairMetrics.metrics.f1Score
      ).toBeNull();

      expect(emptyScorecard.geography.overallAccuracy).toBeNull();
      expect(emptyScorecard.timestampPattern.overallAccuracy).toBeNull();
      expect(emptyScorecard.exclusionsAndLimitations.exclusionsCount).toBe(0);
    });

    it("handles zero-denominator classes safely returning null precision/recall/f1", () => {
      // Create a single record dataset where only valid_us is present
      const singleRecord: BenchmarkRecord = {
        benchmarkId: "BM-001",
        sourceRecordId: "src-1",
        title: "Software Engineer",
        company: "Acme Inc",
        rawLocation: "San Francisco, CA, us",
        rawUrl: "https://boards.greenhouse.io/acme/jobs/101",
        canonicalUrl: "https://boards.greenhouse.io/acme/jobs/101",
        rawCountryCodes: ["us"],
        atsProvider: "generic",
        requisitionId: null,
        postedAt: "2026-09-01T00:00:00Z",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
        groundTruth: {
          duplicate: {
            label: "unique_record",
            groundTruthGroupId: null,
            evidenceLevel: "deterministic_dataset",
            evidence: "Single unique record",
            rationale: "No duplicates exist",
            verificationSource: "ats_provider_requisition_id",
          },
          geography: {
            label: "valid_us",
            resolvedCountry: "USA",
            evidenceLevel: "deterministic_dataset",
            evidence: "Clear US location",
            rationale: "San Francisco is in US",
            verificationSource: "state_postal_scraper_iso_collision",
          },
          freshness: {
            label: "identical_timestamp_pattern",
            hasIdenticalTimestamps: true,
            ingestionProvenance: "suspected_batch",
            evidenceLevel: "deterministic_dataset",
            evidence: "All timestamps match",
            rationale: "Batch ingestion pattern",
            verificationSource: "identical_database_timestamps",
          },
        },
      };

      const miniDataset = {
        datasetName: "BM-MINI",
        sourceDataset: "test-source.json",
        version: "1.0" as const,
        createdAt: "2026-10-22T00:00:00Z",
        totalRecords: 1,
        description: "Mini dataset with zero-denominator classes",
        compositionSummary: {
          confirmedDuplicateRecords: 0,
          distinctRequisitionRecords: 0,
          uniqueRecords: 1,
          unresolvedDuplicateRecords: 0,
          validUsRecords: 1,
          explicitForeignRecords: 0,
          metadataDiscrepancyRecords: 0,
          missingLocationRecords: 0,
          unresolvedGeographyRecords: 0,
          identicalTimestampPatternRecords: 1,
          distinctTimestampValuesRecords: 0,
          unresolvedFreshnessRecords: 0,
        },
        records: [singleRecord],
      };

      const miniScorecard = generateQualityScorecard(miniDataset);
      const validation = qualityScorecardSchema.safeParse(miniScorecard);
      expect(validation.success).toBe(true);

      // Geography explicit_foreign had 0 support and 0 predictions -> null precision, recall, f1
      const foreign = miniScorecard.geography.perClassMetrics.explicit_foreign!;
      expect(foreign).toBeDefined();
      expect(foreign.support).toBe(0);
      expect(foreign.truePositives).toBe(0);
      expect(foreign.precision).toBeNull();
      expect(foreign.recall).toBeNull();
      expect(foreign.f1Score).toBeNull();
    });

    it("throws an error when raw timestamps contradict hasIdenticalTimestamps", () => {
      const corruptedRecord: BenchmarkRecord = {
        benchmarkId: "BM-CORRUPT",
        sourceRecordId: "src-corrupt",
        title: "Engineer",
        company: "Acme",
        rawLocation: "Austin, TX, us",
        rawUrl: "https://jobs.lever.co/acme/1",
        canonicalUrl: "https://jobs.lever.co/acme/1",
        rawCountryCodes: ["us"],
        atsProvider: "generic",
        requisitionId: null,
        postedAt: "2026-09-01T10:00:00Z",
        createdAt: "2026-09-01T12:00:00Z", // Different!
        updatedAt: "2026-09-01T12:00:00Z",
        groundTruth: {
          duplicate: {
            label: "unique_record",
            groundTruthGroupId: null,
            evidenceLevel: "deterministic_dataset",
            evidence: "test",
            rationale: "test",
            verificationSource: "ats_provider_requisition_id",
          },
          geography: {
            label: "valid_us",
            resolvedCountry: "USA",
            evidenceLevel: "deterministic_dataset",
            evidence: "test",
            rationale: "test",
            verificationSource: "state_postal_scraper_iso_collision",
          },
          freshness: {
            label: "identical_timestamp_pattern",
            hasIdenticalTimestamps: true, // Lies! Timestamps are NOT identical
            ingestionProvenance: "suspected_batch",
            evidenceLevel: "deterministic_dataset",
            evidence: "test",
            rationale: "test",
            verificationSource: "identical_database_timestamps",
          },
        },
      };

      const corruptedDataset = {
        datasetName: "BM-CORRUPT",
        sourceDataset: "test-source.json",
        version: "1.0" as const,
        createdAt: "2026-10-22T00:00:00Z",
        totalRecords: 1,
        description: "Corrupted dataset",
        compositionSummary: {
          confirmedDuplicateRecords: 0,
          distinctRequisitionRecords: 0,
          uniqueRecords: 1,
          unresolvedDuplicateRecords: 0,
          validUsRecords: 1,
          explicitForeignRecords: 0,
          metadataDiscrepancyRecords: 0,
          missingLocationRecords: 0,
          unresolvedGeographyRecords: 0,
          identicalTimestampPatternRecords: 1,
          distinctTimestampValuesRecords: 0,
          unresolvedFreshnessRecords: 0,
        },
        records: [corruptedRecord],
      };

      expect(() => generateQualityScorecard(corruptedDataset)).toThrowError(
        /Fixture invariant violation on BM-CORRUPT/
      );
    });

    it("rejects malformed benchmark objects missing required fields", () => {
      const malformed = {
        benchmarkId: "BM-BAD",
        // missing version, records, etc.
      };

      expect(() =>
        generateQualityScorecard(malformed as unknown as BenchmarkDataset)
      ).toThrow();
    });
  });
});
