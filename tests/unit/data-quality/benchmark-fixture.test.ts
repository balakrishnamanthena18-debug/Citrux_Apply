import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  benchmarkDatasetSchema,
  type BenchmarkDataset,
} from "@/lib/data-quality/benchmark-schema";

describe("OOS Data Quality & Intelligence — Phase 3 Ground-Truth Benchmark Fixture Validation", () => {
  const fixturePath = path.resolve(
    __dirname,
    "fixtures/ground-truth-benchmark.json"
  );
  let dataset: BenchmarkDataset;

  it("loads and parses the 100-record benchmark fixture without JSON syntax errors", () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const rawText = fs.readFileSync(fixturePath, "utf8");
    const parsed = JSON.parse(rawText);
    expect(parsed).toBeDefined();

    const validation = benchmarkDatasetSchema.safeParse(parsed);
    expect(validation.success).toBe(true);
    if (!validation.success) {
      console.error(validation.error.errors);
    }
    dataset = (validation as { success: true; data: BenchmarkDataset }).data;
  });

  describe("1. Dataset Completeness & Structural Integrity", () => {
    it("contains exactly 100 benchmark records with unique sequential IDs", () => {
      expect(dataset.version).toBe("1.0");
      expect(dataset.totalRecords).toBe(100);
      expect(dataset.records.length).toBe(100);

      const benchmarkIds = new Set<string>();
      const sourceIds = new Set<string>();

      for (let i = 0; i < dataset.records.length; i++) {
        const r = dataset.records[i]!;
        const expectedId = `BM-${String(i + 1).padStart(3, "0")}`;
        expect(r.benchmarkId).toBe(expectedId);

        expect(benchmarkIds.has(r.benchmarkId)).toBe(false);
        benchmarkIds.add(r.benchmarkId);

        expect(sourceIds.has(r.sourceRecordId)).toBe(false);
        sourceIds.add(r.sourceRecordId);
      }

      expect(benchmarkIds.size).toBe(100);
      expect(sourceIds.size).toBe(100);
    });

    it("verifies that composition summary counts match the actual records array", () => {
      const summary = dataset.compositionSummary;
      const records = dataset.records;

      const dupCounts = {
        confirmed: records.filter(
          (r) => r.groundTruth.duplicate.label === "confirmed_duplicate"
        ).length,
        distinct: records.filter(
          (r) => r.groundTruth.duplicate.label === "distinct_requisition"
        ).length,
        unique: records.filter(
          (r) => r.groundTruth.duplicate.label === "unique_record"
        ).length,
        unresolved: records.filter(
          (r) => r.groundTruth.duplicate.label === "unresolved"
        ).length,
      };

      expect(summary.confirmedDuplicateRecords).toBe(dupCounts.confirmed);
      expect(summary.distinctRequisitionRecords).toBe(dupCounts.distinct);
      expect(summary.uniqueRecords).toBe(dupCounts.unique);
      expect(summary.unresolvedDuplicateRecords).toBe(dupCounts.unresolved);
      expect(
        dupCounts.confirmed +
          dupCounts.distinct +
          dupCounts.unique +
          dupCounts.unresolved
      ).toBe(100);

      const geoCounts = {
        validUs: records.filter(
          (r) => r.groundTruth.geography.label === "valid_us"
        ).length,
        foreign: records.filter(
          (r) => r.groundTruth.geography.label === "explicit_foreign"
        ).length,
        discrepancy: records.filter(
          (r) => r.groundTruth.geography.label === "metadata_discrepancy"
        ).length,
        missing: records.filter(
          (r) => r.groundTruth.geography.label === "missing_location"
        ).length,
        unresolved: records.filter(
          (r) => r.groundTruth.geography.label === "unresolved"
        ).length,
      };

      expect(summary.validUsRecords).toBe(geoCounts.validUs);
      expect(summary.validUsRecords).toBe(76);
      expect(summary.explicitForeignRecords).toBe(geoCounts.foreign);
      expect(summary.explicitForeignRecords).toBe(14);
      expect(summary.metadataDiscrepancyRecords).toBe(geoCounts.discrepancy);
      expect(summary.metadataDiscrepancyRecords).toBe(6);
      expect(summary.missingLocationRecords).toBe(geoCounts.missing);
      expect(summary.missingLocationRecords).toBe(3);
      expect(summary.unresolvedGeographyRecords).toBe(geoCounts.unresolved);
      expect(summary.unresolvedGeographyRecords).toBe(1);
      expect(
        geoCounts.validUs +
          geoCounts.foreign +
          geoCounts.discrepancy +
          geoCounts.missing +
          geoCounts.unresolved
      ).toBe(100);

      const freshCounts = {
        identicalPattern: records.filter(
          (r) => r.groundTruth.freshness.label === "identical_timestamp_pattern"
        ).length,
        distinctValues: records.filter(
          (r) => r.groundTruth.freshness.label === "distinct_timestamp_values"
        ).length,
        unresolved: records.filter(
          (r) => r.groundTruth.freshness.label === "unresolved"
        ).length,
      };

      expect(summary.identicalTimestampPatternRecords).toBe(
        freshCounts.identicalPattern
      );
      expect(summary.identicalTimestampPatternRecords).toBe(57);
      expect(summary.distinctTimestampValuesRecords).toBe(
        freshCounts.distinctValues
      );
      expect(summary.distinctTimestampValuesRecords).toBe(43);
      expect(summary.unresolvedFreshnessRecords).toBe(freshCounts.unresolved);
      expect(summary.unresolvedFreshnessRecords).toBe(0);
      expect(
        freshCounts.identicalPattern +
          freshCounts.distinctValues +
          freshCounts.unresolved
      ).toBe(100);
    });
  });

  describe("2. Ground-Truth Rigor & Verification Evidence", () => {
    it("guarantees every ground-truth label includes evidence, rationale, verificationSource, and valid evidenceLevel", () => {
      const validTiers = new Set([
        "deterministic_dataset",
        "heuristic_inference",
        "unresolved_insufficient",
      ]);

      for (const r of dataset.records) {
        // Duplicate dimension
        const dup = r.groundTruth.duplicate;
        expect(dup.evidence.trim().length).toBeGreaterThan(5);
        expect(dup.rationale.trim().length).toBeGreaterThan(5);
        expect(dup.verificationSource).toBeDefined();
        expect(validTiers.has(dup.evidenceLevel)).toBe(true);

        // Geography dimension
        const geo = r.groundTruth.geography;
        expect(geo.evidence.trim().length).toBeGreaterThan(5);
        expect(geo.rationale.trim().length).toBeGreaterThan(5);
        expect(geo.verificationSource).toBeDefined();
        expect(validTiers.has(geo.evidenceLevel)).toBe(true);

        // Freshness dimension
        const fresh = r.groundTruth.freshness;
        expect(fresh.evidence.trim().length).toBeGreaterThan(5);
        expect(fresh.rationale.trim().length).toBeGreaterThan(5);
        expect(fresh.verificationSource).toBeDefined();
        expect(validTiers.has(fresh.evidenceLevel)).toBe(true);
      }
    });

    it("verifies that unresolved cases explicitly specify missing evidence and unresolved_insufficient tier", () => {
      const unresolvedDuplicates = dataset.records.filter(
        (r) => r.groundTruth.duplicate.label === "unresolved"
      );
      expect(unresolvedDuplicates.length).toBe(4);

      for (const r of unresolvedDuplicates) {
        const missing = r.groundTruth.duplicate.missingEvidence;
        expect(missing).toBeDefined();
        expect(typeof missing).toBe("string");
        expect(missing!.trim().length).toBeGreaterThan(10);
        expect(r.groundTruth.duplicate.verificationSource).toBe(
          "unresolved_insufficient_evidence"
        );
        expect(r.groundTruth.duplicate.evidenceLevel).toBe(
          "unresolved_insufficient"
        );
      }

      const unresolvedGeography = dataset.records.filter(
        (r) => r.groundTruth.geography.label === "unresolved"
      );
      expect(unresolvedGeography.length).toBe(1);

      for (const r of unresolvedGeography) {
        const missing = r.groundTruth.geography.missingEvidence;
        expect(missing).toBeDefined();
        expect(typeof missing).toBe("string");
        expect(missing!.trim().length).toBeGreaterThan(10);
        expect(r.groundTruth.geography.verificationSource).toBe(
          "unresolved_insufficient_evidence"
        );
        expect(r.groundTruth.geography.evidenceLevel).toBe(
          "unresolved_insufficient"
        );
        // BM-054 invariant: unresolved geography must have null resolvedCountry
        expect(r.groundTruth.geography.resolvedCountry).toBeNull();
      }
    });

    it("confirms duplicate candidate groups have valid group IDs and member clusters", () => {
      const confirmedDups = dataset.records.filter(
        (r) => r.groundTruth.duplicate.label === "confirmed_duplicate"
      );
      expect(confirmedDups.length).toBe(31);

      const groupMap = new Map<string, string[]>();
      for (const r of confirmedDups) {
        expect(r.groundTruth.duplicate.evidenceLevel).toBe(
          "deterministic_dataset"
        );
        const gid = r.groundTruth.duplicate.groundTruthGroupId;
        expect(gid).not.toBeNull();
        const list = groupMap.get(gid!) || [];
        list.push(r.benchmarkId);
        groupMap.set(gid!, list);
      }

      // Every confirmed duplicate group must have at least 2 member records in the benchmark
      for (const [gid, members] of groupMap.entries()) {
        expect(members.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("distinguishes distinct requisitions as heuristic_inference without assigning duplicate group IDs", () => {
      const distinctRoles = dataset.records.filter(
        (r) => r.groundTruth.duplicate.label === "distinct_requisition"
      );
      expect(distinctRoles.length).toBe(12);

      for (const r of distinctRoles) {
        expect(r.groundTruth.duplicate.groundTruthGroupId).toBeNull();
        expect(r.groundTruth.duplicate.verificationSource).toBe(
          "employer_distinct_requisition_ids"
        );
        // Stage 1.2: Distinct real-world opening is an inference from distinct req IDs
        expect(r.groundTruth.duplicate.evidenceLevel).toBe("heuristic_inference");
      }
    });
  });

  describe("3. Freshness & Timestamp Invariants (Stage 1.2.1 / 1.2.2 Cleanup)", () => {
    it("enforces that every record claiming identical_database_timestamps has all three timestamps equal and label identical_timestamp_pattern", () => {
      const identicalSourceRecords = dataset.records.filter(
        (r) =>
          r.groundTruth.freshness.verificationSource ===
          "identical_database_timestamps"
      );
      expect(identicalSourceRecords.length).toBe(57);

      for (const r of identicalSourceRecords) {
        expect(r.postedAt).not.toBeNull();
        expect(r.createdAt).not.toBeNull();
        expect(r.updatedAt).not.toBeNull();
        expect(r.postedAt).toBe(r.createdAt);
        expect(r.createdAt).toBe(r.updatedAt);
        expect(r.groundTruth.freshness.label).toBe(
          "identical_timestamp_pattern"
        );
        expect(r.groundTruth.freshness.hasIdenticalTimestamps).toBe(true);
        expect(r.groundTruth.freshness.ingestionProvenance).toBe(
          "suspected_batch"
        );
        // Stage 1.2.2: isIngestionBatch is omitted, avoiding encoding false or true as verified ground truth
        expect(r.groundTruth.freshness.isIngestionBatch).toBeUndefined();
      }
    });

    it("enforces that records with distinct timestamps are labeled distinct_timestamp_values with unknown provenance", () => {
      const distinctRecords = dataset.records.filter(
        (r) => !(r.postedAt === r.createdAt && r.createdAt === r.updatedAt)
      );
      expect(distinctRecords.length).toBe(43);

      for (const r of distinctRecords) {
        expect(r.groundTruth.freshness.verificationSource).toBe(
          "distinct_database_timestamps"
        );
        expect(r.groundTruth.freshness.label).toBe(
          "distinct_timestamp_values"
        );
        expect(r.groundTruth.freshness.hasIdenticalTimestamps).toBe(false);
        expect(r.groundTruth.freshness.ingestionProvenance).toBe("unknown");
        // Stage 1.2.2: isIngestionBatch is omitted
        expect(r.groundTruth.freshness.isIngestionBatch).toBeUndefined();
      }
    });

    it("enforces that isIngestionBatch is omitted across all benchmark records and cannot encode false/true as verified fact", () => {
      for (const r of dataset.records) {
        expect(r.groundTruth.freshness.isIngestionBatch).toBeUndefined();
      }
    });

    it("enforces that legacy composition aliases are removed and authoritative fields govern composition", () => {
      const summary = dataset.compositionSummary;
      expect(summary.identicalTimestampPatternRecords).toBe(57);
      expect(summary.distinctTimestampValuesRecords).toBe(43);
      expect(summary.unresolvedFreshnessRecords).toBe(0);

      // Verify that deprecated legacy aliases are not present
      expect((summary as Record<string, unknown>).timestampAnomalyRecords).toBeUndefined();
      expect((summary as Record<string, unknown>).genuineTimestampRecords).toBeUndefined();
    });

    it("enforces metric eligibility boundaries: no confirmed crawler batch or unverified genuine posting claims", () => {
      for (const r of dataset.records) {
        // Ingestion provenance can only be suspected_batch or unknown; never confirmed_batch or confirmed_realtime
        expect(
          ["suspected_batch", "unknown"].includes(
            r.groundTruth.freshness.ingestionProvenance
          )
        ).toBe(true);
        expect(r.groundTruth.freshness.ingestionProvenance).not.toBe(
          "confirmed_batch"
        );
        expect(r.groundTruth.freshness.ingestionProvenance).not.toBe(
          "confirmed_realtime"
        );
        // Deprecated/misleading labels must not exist
        expect((r.groundTruth.freshness.label as string)).not.toBe(
          "genuine_timestamp"
        );
        expect((r.groundTruth.freshness.label as string)).not.toBe(
          "timestamp_anomaly"
        );
      }
    });
  });

  describe("4. Frozen Contracts & Geography Invariant Preservation", () => {
    it("preserves DUPLICATE_MASTER_POLICY=none: zero master records are designated", () => {
      for (const r of dataset.records) {
        expect((r as Record<string, unknown>).isMaster).toBeUndefined();
        expect((r as Record<string, unknown>).isDeleted).toBeUndefined();
        expect((r as Record<string, unknown>).mergedInto).toBeUndefined();
      }
    });

    it("verifies geographic metadata discrepancies distinguish state-postal collisions without deleting US records", () => {
      const discrepancies = dataset.records.filter(
        (r) => r.groundTruth.geography.label === "metadata_discrepancy"
      );
      expect(discrepancies.length).toBe(6);

      for (const r of discrepancies) {
        expect(r.groundTruth.geography.resolvedCountry).toBe("USA");
        expect(r.groundTruth.geography.verificationSource).toBe(
          "state_postal_scraper_iso_collision"
        );
        expect(r.groundTruth.geography.evidenceLevel).toBe(
          "deterministic_dataset"
        );
      }
    });

    it("verifies explicit foreign postings are correctly tagged as non-US (including BM-100)", () => {
      const foreign = dataset.records.filter(
        (r) => r.groundTruth.geography.label === "explicit_foreign"
      );
      expect(foreign.length).toBe(14);

      for (const r of foreign) {
        expect(r.groundTruth.geography.resolvedCountry).toBe("Canada");
        expect(r.groundTruth.geography.verificationSource).toBe(
          "explicit_country_string_match"
        );
        expect(r.groundTruth.geography.evidenceLevel).toBe(
          "deterministic_dataset"
        );
      }

      // Explicit check on BM-100
      const bm100 = dataset.records.find((r) => r.benchmarkId === "BM-100");
      expect(bm100).toBeDefined();
      expect(bm100!.groundTruth.geography.label).toBe("explicit_foreign");
      expect(bm100!.groundTruth.geography.resolvedCountry).toBe("Canada");
      expect(bm100!.rawLocation).toBe("Halton Hills, ON, ca");
    });

    it("verifies city-only domestic locations BM-065 and BM-084 use employer_jurisdiction_context", () => {
      const bm065 = dataset.records.find((r) => r.benchmarkId === "BM-065");
      expect(bm065).toBeDefined();
      expect(bm065!.rawLocation).toBe("Missoula");
      expect(bm065!.groundTruth.geography.verificationSource).toBe(
        "employer_jurisdiction_context"
      );
      expect(bm065!.groundTruth.geography.evidenceLevel).toBe(
        "heuristic_inference"
      );

      const bm084 = dataset.records.find((r) => r.benchmarkId === "BM-084");
      expect(bm084).toBeDefined();
      expect(bm084!.rawLocation).toBe("Billings");
      expect(bm084!.groundTruth.geography.verificationSource).toBe(
        "employer_jurisdiction_context"
      );
      expect(bm084!.groundTruth.geography.evidenceLevel).toBe(
        "heuristic_inference"
      );
    });

    it("verifies missing locations are explicitly flagged without crashing", () => {
      const missing = dataset.records.filter(
        (r) => r.groundTruth.geography.label === "missing_location"
      );
      expect(missing.length).toBe(3);

      for (const r of missing) {
        expect(r.rawLocation).toBe("");
        expect(r.groundTruth.geography.resolvedCountry).toBeNull();
        expect(r.groundTruth.geography.verificationSource).toBe(
          "empty_location_field"
        );
        expect(r.groundTruth.geography.evidenceLevel).toBe(
          "deterministic_dataset"
        );
      }
    });
  });
});
