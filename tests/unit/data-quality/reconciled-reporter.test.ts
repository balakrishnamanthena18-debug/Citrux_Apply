import { describe, it, expect } from "vitest";
import {
  computeFindingFingerprintV2,
  computeFindingFingerprintLegacy,
  type ValidatedAuditReport,
  type ValidatedJobFinding,
  type FindingReviewEntry,
} from "@/lib/data-quality/dashboard-schema";
import { type ReviewStateMap } from "@/components/admin/data-quality/review-state-store";
import {
  reconcileFindingsWithReviews,
  exportReconciledJsonReport,
  exportReconciledCsvReport,
  exportOrphanedReviewsCsv,
  isFormulaInjectionTarget,
  sanitizeCsvCell,
  DatasetMismatchError,
  MissingDatasetIdentityError,
  DuplicateRecordIdError,
  resolveStoredFingerprintVersion,
  RECONCILED_CSV_COLUMNS,
} from "@/lib/data-quality/reconciled-reporter";
import {
  RECONCILED_REPORT_VERSION,
  RECONCILED_TRUST_MODEL_NOTICE,
  reconciledAuditReportJsonSchema,
} from "@/lib/data-quality/reconciled-reporter-types";

function createMockFinding(
  recordId: string,
  overrides: Partial<ValidatedJobFinding> = {}
): ValidatedJobFinding {
  return {
    recordId,
    publicSlug: `slug-${recordId}`,
    externalId: `ext-${recordId}`,
    source: "greenhouse",
    company: "Acme Healthcare",
    title: "Senior Full Stack Engineer",
    location: "Austin, TX",
    rawUrl: `https://boards.greenhouse.io/acme/jobs/${recordId}?gh_src=test`,
    canonicalUrl: `https://boards.greenhouse.io/acme/jobs/${recordId}`,
    ats: {
      provider: "greenhouse",
      requisitionId: `REQ-${recordId}`,
      trackingParametersRemoved: ["gh_src"],
      canonicalUrl: `https://boards.greenhouse.io/acme/jobs/${recordId}`,
      isAtsUrl: true,
    },
    duplicate: {
      duplicateGroupId: `grp-${recordId}`,
      isDuplicateCandidate: true,
      confidence: "high",
      reasonCode: "EXACT_ATS_CANONICAL_URL",
      evidence: "Canonical URL match across 2 postings",
      candidateIdsInGroup: [recordId],
      candidateCountInGroup: 2,
    },
    geography: {
      status: "valid_us",
      detectedCountry: "United States",
      rawLocation: "Austin, TX",
      rawCountryCodes: ["us"],
      isDiscrepancy: false,
      notes: "Valid US municipality",
    },
    freshness: {
      status: "active_signal",
      closureSignals: [],
      suspectedIngestionBatch: false,
      postedAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-02T12:00:00.000Z",
      ageDays: 4,
      notes: "Active signals present",
    },
    aiReview: {
      used: false,
      status: "needs_review",
      reason: "Automated candidate flag requires auditor review",
    },
    ...overrides,
  };
}

function createMockReport(
  datasetName: string,
  findings: ValidatedJobFinding[]
): ValidatedAuditReport {
  const dupCount = findings.filter(
    (f) => f.duplicate.isDuplicateCandidate
  ).length;
  const foreignCount = findings.filter(
    (f) => f.geography.status === "explicit_foreign"
  ).length;

  return {
    summary: {
      auditTimestamp: "2026-10-22T10:00:00.000Z",
      datasetName,
      totalRecordsAudited: findings.length,
      aiMode: "offline",
      duplicatePolicy: "none",
      duplicates: {
        totalDuplicateCandidateRecords: dupCount,
        totalDuplicateCandidateGroups: Math.ceil(dupCount / 2),
        exactAtsUrlGroups: Math.ceil(dupCount / 2),
        distinctSameRoleGroups: 0,
      },
      geography: {
        validUs: findings.length - foreignCount,
        explicitForeign: foreignCount,
        metadataDiscrepancy: 0,
        missingLocation: 0,
        ambiguous: 0,
      },
      freshness: {
        closureDetected: 0,
        suspectedIngestionBatchTimestamps: 0,
        unknownVacancyStatus: 0,
      },
      aiReview: {
        offlineInvocations: 0,
        networkCallsBlocked: 0,
        recordsNeedingHumanReview: findings.length,
      },
    },
    findings,
  };
}

describe("OOS Data Quality Engine — Pure Reconciled Reporting Engine (Stage 6.3A / 6.3B.1)", () => {
  const datasetName = "freehire-us-reconciled-audit-test";
  const fixedTimestamp = "2026-10-23T00:00:00.000Z";

  describe("1. Deterministic Output & Schema Validation", () => {
    it("produces byte-for-byte identical JSON and CSV reports across repeated executions", () => {
      const finding1 = createMockFinding("rec_001");
      const finding2 = createMockFinding("rec_002");
      const report = createMockReport(datasetName, [finding1, finding2]);

      const reviews: ReviewStateMap = {
        rec_001: {
          recordId: "rec_001",
          fingerprint: computeFindingFingerprintV2(finding1),
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
          reviewerEmail: "auditor@citrux.com",
          verificationSource: "Live Greenhouse portal verification",
          notes: "Confirmed redundant ATS duplicate",
          updatedAt: fixedTimestamp,
          history: [],
        },
      };

      const options = {
        reviewDatasetName: datasetName,
        generatedAt: fixedTimestamp,
        generatorVersion: "1.0.0",
      };

      const json1 = exportReconciledJsonReport(report, reviews, options);
      const json2 = exportReconciledJsonReport(report, reviews, options);
      expect(json1).toBe(json2);

      const parsed = JSON.parse(json1);
      const validation = reconciledAuditReportJsonSchema.safeParse(parsed);
      expect(validation.success).toBe(true);
      expect(parsed.schemaVersion).toBe(RECONCILED_REPORT_VERSION);
      expect(parsed.trustModelNotice).toBe(RECONCILED_TRUST_MODEL_NOTICE);

      const reconciledObj = reconcileFindingsWithReviews(
        report,
        reviews,
        options
      );
      const csv1 = exportReconciledCsvReport(reconciledObj, {
        includeBom: true,
      });
      const csv2 = exportReconciledCsvReport(reconciledObj, {
        includeBom: true,
      });
      expect(csv1).toBe(csv2);
    });

    it("sorts findings deterministically by recordId ascending regardless of input order", () => {
      const findingC = createMockFinding("rec_003");
      const findingA = createMockFinding("rec_001");
      const findingB = createMockFinding("rec_002");
      const report = createMockReport(datasetName, [
        findingC,
        findingA,
        findingB,
      ]);

      const result = reconcileFindingsWithReviews(
        report,
        {},
        {
          reviewDatasetName: datasetName,
          generatedAt: fixedTimestamp,
        }
      );
      const ids = result.reconciledFindings.map((f) => f.recordId);
      expect(ids).toEqual(["rec_001", "rec_002", "rec_003"]);
    });
  });

  describe("2. Evidence-Gated Verification Semantics", () => {
    it("confirms verified outcome ONLY when EVIDENCE_OBSERVED, complete checklist, and valid v2 fingerprint match", () => {
      const finding = createMockFinding("rec_verified_01");
      const report = createMockReport(datasetName, [finding]);

      const reviews: ReviewStateMap = {
        rec_verified_01: {
          recordId: "rec_verified_01",
          fingerprint: computeFindingFingerprintV2(finding),
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
          verificationSource: "Direct Greenhouse ATS portal inspect",
          reviewerEmail: "auditor@citrux.com",
          notes: "Factual duplicate verified",
          updatedAt: fixedTimestamp,
          history: [],
        },
      };

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const entry = result.reconciledFindings[0]!;

      expect(entry.resolution.reconciliationStatus).toBe("evidence_verified");
      expect(entry.resolution.isVerifiedOutcome).toBe(true);
      expect(entry.resolution.unresolvedReason).toBeNull();
      expect(entry.resolution.requiredNextAction).toBeNull();
      expect(result.summary.reconciliationBreakdown.evidenceVerified).toBe(1);
      expect(
        result.summary.dimensionBreakdown.duplicate.confirmedRedundant
      ).toBe(1);
    });

    it("strictly refuses to verify confirmed disposition when checklist is incomplete", () => {
      const finding = createMockFinding("rec_incomplete_chk_01");
      const report = createMockReport(datasetName, [finding]);

      const reviews: ReviewStateMap = {
        rec_incomplete_chk_01: {
          recordId: "rec_incomplete_chk_01",
          fingerprint: computeFindingFingerprintV2(finding),
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: false }, // Incomplete
          verificationSource: "Partial check",
          updatedAt: fixedTimestamp,
        },
      };

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const entry = result.reconciledFindings[0]!;

      expect(entry.resolution.reconciliationStatus).toBe(
        "quarantined_invalid_review"
      );
      expect(entry.resolution.isVerifiedOutcome).toBe(false);
      expect(entry.resolution.unresolvedReason).toContain(
        "mandates completion of checklist items"
      );
      expect(result.summary.reconciliationBreakdown.evidenceVerified).toBe(0);
      expect(result.summary.reconciliationBreakdown.quarantinedInvalid).toBe(1);
      expect(
        result.summary.dimensionBreakdown.duplicate.quarantinedInvalid
      ).toBe(1);
    });
  });

  describe("3. Stale Fingerprint Quarantine & F-01 Version Provenance", () => {
    it("marks review as stale and never promotes to verified when finding data has mutated, while preserving v2 version", () => {
      const originalFinding = createMockFinding("rec_mutated_01");
      const storedFp = computeFindingFingerprintV2(originalFinding);

      // Mutated finding (different canonical URL)
      const mutatedFinding = createMockFinding("rec_mutated_01", {
        canonicalUrl: "https://boards.greenhouse.io/acme/jobs/different-999",
      });
      const report = createMockReport(datasetName, [mutatedFinding]);

      const reviews: ReviewStateMap = {
        rec_mutated_01: {
          recordId: "rec_mutated_01",
          fingerprint: storedFp, // Stale fingerprint from prior finding state
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
          updatedAt: fixedTimestamp,
        },
      };

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const entry = result.reconciledFindings[0]!;

      // F-01: Stored v2 fingerprint MUST remain version "2.0" despite being stale
      expect(entry.integrity.fingerprintVersion).toBe("2.0");
      expect(entry.integrity.isStaleFingerprint).toBe(true);
      expect(entry.resolution.reconciliationStatus).toBe("stale_review");
      expect(entry.resolution.isVerifiedOutcome).toBe(false);
      expect(entry.resolution.unresolvedReason).toContain(
        "Job posting data has mutated"
      );
      expect(entry.resolution.requiredNextAction).toContain(
        "explicit re-verification"
      );
      expect(result.summary.reconciliationBreakdown.staleReview).toBe(1);
      expect(result.summary.reconciliationBreakdown.evidenceVerified).toBe(0);
      expect(result.summary.dimensionBreakdown.duplicate.staleReview).toBe(1);
    });

    it("correctly identifies version formats via resolveStoredFingerprintVersion", () => {
      expect(resolveStoredFingerprintVersion("fp_v2_0123456789abcdef")).toBe(
        "2.0"
      );
      expect(resolveStoredFingerprintVersion("fp_1a2b3c4d")).toBe("1.0");
      expect(resolveStoredFingerprintVersion("unknown_format")).toBe("unknown");
      expect(resolveStoredFingerprintVersion(null)).toBe("unknown");
      expect(resolveStoredFingerprintVersion(undefined)).toBe("unknown");
    });
  });

  describe("4. Legacy Unstructured Reviews", () => {
    it("preserves unmutated legacy reviews but strictly never elevates them to verified outcomes", () => {
      const finding = createMockFinding("rec_legacy_01");
      const legacyFp = computeFindingFingerprintLegacy(finding);
      const report = createMockReport(datasetName, [finding]);

      const reviews: ReviewStateMap = {
        rec_legacy_01: {
          recordId: "rec_legacy_01",
          fingerprint: legacyFp,
          status: "reviewed",
          notes: "Legacy auditor verification from Phase 2",
          updatedAt: fixedTimestamp,
        },
      };

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const entry = result.reconciledFindings[0]!;

      expect(entry.integrity.fingerprintVersion).toBe("1.0");
      expect(entry.resolution.reconciliationStatus).toBe(
        "legacy_unstructured_review"
      );
      expect(entry.resolution.isVerifiedOutcome).toBe(false);
      expect(entry.humanReviewOutcome.evidenceTier).toBe(
        "EVIDENCE_HISTORICAL_UNSTRUCTURED"
      );
      expect(entry.humanReviewOutcome.disposition).toBe(
        "LEGACY_REVIEWED_UNSTRUCTURED"
      );
      expect(result.summary.reconciliationBreakdown.legacyUnstructured).toBe(1);
      expect(result.summary.reconciliationBreakdown.evidenceVerified).toBe(0);
      expect(
        result.summary.dimensionBreakdown.duplicate.legacyUnstructured
      ).toBe(1);
    });
  });

  describe("5. Escalated & Quarantined Entries & F-06 Reviewer Attribution", () => {
    it("handles escalated reviews under EVIDENCE_INSUFFICIENT and distinguishes tier reasons", () => {
      const finding = createMockFinding("rec_escalated_01");
      const report = createMockReport(datasetName, [finding]);

      const reviews: ReviewStateMap = {
        rec_escalated_01: {
          recordId: "rec_escalated_01",
          fingerprint: computeFindingFingerprintV2(finding),
          status: "needs_review",
          disposition: "ESCALATED_NEEDS_FURTHER_EVIDENCE",
          evidenceTier: "EVIDENCE_INACCESSIBLE",
          verificationSource: "Target career portal returned HTTP 404",
          notes: "Page removed by employer",
          updatedAt: fixedTimestamp,
        },
      };

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const entry = result.reconciledFindings[0]!;

      expect(entry.resolution.reconciliationStatus).toBe(
        "escalated_needs_evidence"
      );
      expect(entry.resolution.isVerifiedOutcome).toBe(false);
      expect(entry.resolution.unresolvedReason).toContain(
        "Primary source inaccessible"
      );
      expect(
        result.summary.reconciliationBreakdown.escalatedNeedsEvidence
      ).toBe(1);
      expect(result.summary.dimensionBreakdown.duplicate.escalated).toBe(1);
    });

    it("quarantines reviews attempting confirmed dispositions with non-conclusive tiers", () => {
      const finding = createMockFinding("rec_invalid_gate_01");
      const report = createMockReport(datasetName, [finding]);

      // Direct violation: CONFIRMED disposition under EVIDENCE_INSUFFICIENT
      const reviews: ReviewStateMap = {
        rec_invalid_gate_01: {
          recordId: "rec_invalid_gate_01",
          fingerprint: computeFindingFingerprintV2(finding),
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_INSUFFICIENT",
          notes: "Attempted confirmation without primary evidence",
          updatedAt: fixedTimestamp,
        },
      };

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const entry = result.reconciledFindings[0]!;

      expect(entry.integrity.isQuarantined).toBe(true);
      expect(entry.resolution.reconciliationStatus).toBe(
        "quarantined_invalid_review"
      );
      expect(entry.resolution.isVerifiedOutcome).toBe(false);
      expect(result.summary.reconciliationBreakdown.quarantinedInvalid).toBe(1);
      expect(
        result.summary.dimensionBreakdown.duplicate.quarantinedInvalid
      ).toBe(1);
    });

    it("F-06: preserves reviewerUserId when reviewerEmail is absent without fabricating email", () => {
      const finding = createMockFinding("rec_attr_user_01");
      const report = createMockReport(datasetName, [finding]);

      const reviews: ReviewStateMap = {
        rec_attr_user_01: {
          recordId: "rec_attr_user_01",
          fingerprint: computeFindingFingerprintV2(finding),
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
          verificationSource: "Direct check",
          updatedAt: fixedTimestamp,
          history: [
            {
              auditId: "aud_01",
              recordId: "rec_attr_user_01",
              fingerprint: computeFindingFingerprintV2(finding),
              datasetName,
              disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
              evidenceTier: "EVIDENCE_OBSERVED",
              verificationSource: "Direct check",
              checklist: { urlInspected: true, requisitionCompared: true },
              reviewerUserId: "usr_supabase_admin_9876", // No reviewerEmail!
              notes: "Verified by admin ID",
              reviewedAt: fixedTimestamp,
            },
          ],
        },
      };

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const entry = result.reconciledFindings[0]!;

      expect(entry.humanReviewOutcome.reviewerAttribution).toBe(
        "usr_supabase_admin_9876"
      );
      expect(entry.humanReviewOutcome.reviewerAttribution).not.toContain("@");
    });
  });

  describe("6. Orphaned Review Preservation & F-05 CSV Parity", () => {
    it("preserves orphaned review records in a dedicated section and excludes them from finding denominators", () => {
      const finding1 = createMockFinding("rec_active_01");
      const report = createMockReport(datasetName, [finding1]);

      // reviews contains finding1 PLUS rec_orphaned_999 which is absent from report
      const reviews: ReviewStateMap = {
        rec_active_01: {
          recordId: "rec_active_01",
          fingerprint: computeFindingFingerprintV2(finding1),
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
          updatedAt: fixedTimestamp,
        },
        rec_orphaned_999: {
          recordId: "rec_orphaned_999",
          fingerprint: "fp_v2_orphaned_hash_12345",
          status: "reviewed",
          disposition: "GEO_CONFIRMED_FOREIGN",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { locationExamined: true, entityLocationVerified: true },
          verificationSource: "Primary Registry",
          notes: "Prior review for deleted finding",
          updatedAt: fixedTimestamp,
        },
      };

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });

      // Reconciled findings count must equal findings in report (1)
      expect(result.reconciledFindings).toHaveLength(1);
      expect(result.summary.totalFindingsInReport).toBe(1);
      expect(result.summary.uniqueRecordsWithFindings).toBe(1);

      // Orphaned review preserved separately
      expect(result.orphanedReviews).toHaveLength(1);
      expect(result.orphanedReviews[0]!.recordId).toBe("rec_orphaned_999");
      expect(result.orphanedReviews[0]!.reconciliationStatus).toBe(
        "orphaned_review"
      );
      expect(result.summary.reconciliationBreakdown.orphanedReviews).toBe(1);

      // Dedicated CSV export for orphans includes checklist_summary (F-05)
      const orphanCsv = exportOrphanedReviewsCsv(result.orphanedReviews, {
        includeBom: false,
      });
      expect(orphanCsv).toContain("rec_orphaned_999");
      expect(orphanCsv).toContain("orphaned_review");
      expect(orphanCsv).toContain("checklist_summary");
      expect(orphanCsv).toContain("2/2 completed");

      const headerCols = orphanCsv.split("\r\n")[0]!.split(",");
      expect(headerCols).toHaveLength(13);
    });
  });

  describe("7. Dataset Mismatch & F-02 Fail-Closed Identity Rejection", () => {
    it("rejects reconciliation by default when reviewDatasetName is missing (Fail-Closed)", () => {
      const finding = createMockFinding("rec_dataset_missing");
      const report = createMockReport("dataset-alpha", [finding]);

      // Missing reviewDatasetName must fail closed
      expect(() => {
        reconcileFindingsWithReviews(report, {});
      }).toThrowError(MissingDatasetIdentityError);

      // Whitespace only must also fail closed
      expect(() => {
        reconcileFindingsWithReviews(
          report,
          {},
          { reviewDatasetName: "   " }
        );
      }).toThrowError(MissingDatasetIdentityError);
    });

    it("rejects reconciliation by default when reviewDatasetName does not match report dataset", () => {
      const finding = createMockFinding("rec_dataset_01");
      const report = createMockReport("dataset-alpha", [finding]);

      expect(() => {
        reconcileFindingsWithReviews(
          report,
          {},
          {
            reviewDatasetName: "dataset-beta",
          }
        );
      }).toThrowError(DatasetMismatchError);
    });

    it("allows cross-dataset reconciliation only when allowCrossDataset: true is explicitly provided", () => {
      const finding = createMockFinding("rec_dataset_02");
      const report = createMockReport("dataset-alpha", [finding]);

      const result = reconcileFindingsWithReviews(
        report,
        {},
        {
          reviewDatasetName: "dataset-beta",
          allowCrossDataset: true,
        }
      );

      expect(result.datasetName).toBe("dataset-alpha");
      expect(result.reconciledFindings).toHaveLength(1);
    });
  });

  describe("8. Duplicate & Multiple Dimension Accounting (F-04 Additive Invariants)", () => {
    it("accurately reports unique records and fully additive dimension-specific breakdowns without double-counting", () => {
      // Finding with multiple flagged dimensions: duplicate candidate AND explicit foreign location
      const multiFinding = createMockFinding("rec_multi_01", {
        geography: {
          status: "explicit_foreign",
          detectedCountry: "Canada",
          rawLocation: "Toronto, ON",
          rawCountryCodes: ["ca"],
          isDiscrepancy: false,
          notes: "Canadian location",
        },
      });

      const singleFinding = createMockFinding("rec_single_02", {
        duplicate: {
          duplicateGroupId: null,
          isDuplicateCandidate: false,
          confidence: "distinct",
          reasonCode: "UNIQUE_RECORD",
          evidence: "Unique",
          candidateIdsInGroup: [],
          candidateCountInGroup: 1,
        },
      });

      const report = createMockReport(datasetName, [
        multiFinding,
        singleFinding,
      ]);
      const result = reconcileFindingsWithReviews(
        report,
        {},
        { reviewDatasetName: datasetName }
      );

      expect(result.summary.totalRecordsAudited).toBe(2);
      expect(result.summary.totalFindingsInReport).toBe(2);
      expect(result.summary.uniqueRecordsWithFindings).toBe(2);

      const dupBreakdown = result.summary.dimensionBreakdown.duplicate;
      const geoBreakdown = result.summary.dimensionBreakdown.geography;

      expect(dupBreakdown.totalFlagged).toBe(1);
      expect(geoBreakdown.totalFlagged).toBe(1);

      // F-04: Additive dimension breakdown check
      const dupSum =
        dupBreakdown.confirmedRedundant +
        dupBreakdown.confirmedDistinct +
        dupBreakdown.escalated +
        dupBreakdown.unreviewed +
        dupBreakdown.staleReview +
        dupBreakdown.legacyUnstructured +
        dupBreakdown.quarantinedInvalid;
      expect(dupSum).toBe(dupBreakdown.totalFlagged);

      const geoSum =
        geoBreakdown.confirmedUs +
        geoBreakdown.confirmedForeign +
        geoBreakdown.verifiedCollision +
        geoBreakdown.escalated +
        geoBreakdown.unreviewed +
        geoBreakdown.staleReview +
        geoBreakdown.legacyUnstructured +
        geoBreakdown.quarantinedInvalid;
      expect(geoSum).toBe(geoBreakdown.totalFlagged);
    });
  });

  describe("9. CSV Quoting, Unicode, CRLF & Formula-Injection Protection", () => {
    it("detects formula injection targets with leading whitespace and control characters", () => {
      expect(isFormulaInjectionTarget("=SUM(A1:B1)")).toBe(true);
      expect(isFormulaInjectionTarget("+12345")).toBe(true);
      expect(isFormulaInjectionTarget("-54321")).toBe(true);
      expect(isFormulaInjectionTarget("@HYPERLINK(url)")).toBe(true);

      // Leading whitespace and control characters (CR, LF, TAB, Space)
      expect(isFormulaInjectionTarget("   =CMD('calc')")).toBe(true);
      expect(isFormulaInjectionTarget("\t+555")).toBe(true);
      expect(isFormulaInjectionTarget("\r-999")).toBe(true);
      expect(isFormulaInjectionTarget("  \n @ALERT")).toBe(true);
      expect(isFormulaInjectionTarget("\u0000=MALICIOUS")).toBe(true);

      // Safe values
      expect(isFormulaInjectionTarget("Senior Software Engineer")).toBe(false);
      expect(isFormulaInjectionTarget("Austin, TX")).toBe(false);
      expect(isFormulaInjectionTarget("Acme Healthcare - US")).toBe(false);
      expect(isFormulaInjectionTarget("")).toBe(false);
    });

    it("neutralizes formula injection in CSV by prepending single quote while preserving raw string in JSON", () => {
      const maliciousFinding = createMockFinding("rec_injection_01", {
        title: "   =CMD('calc')",
        company: "+1234 Corporate Inc",
        location: " -Exploit attempt",
      });

      const report = createMockReport(datasetName, [maliciousFinding]);
      const reviews: ReviewStateMap = {
        rec_injection_01: {
          recordId: "rec_injection_01",
          fingerprint: computeFindingFingerprintV2(maliciousFinding),
          status: "needs_review",
          disposition: "ESCALATED_NEEDS_FURTHER_EVIDENCE",
          evidenceTier: "EVIDENCE_INSUFFICIENT",
          notes: "   @ALERT(1)",
          updatedAt: fixedTimestamp,
        },
      };

      // In JSON: raw source values are strictly preserved
      const jsonReport = exportReconciledJsonReport(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const parsedJson = JSON.parse(jsonReport);
      expect(parsedJson.reconciledFindings[0].title).toBe("   =CMD('calc')");
      expect(parsedJson.reconciledFindings[0].company).toBe(
        "+1234 Corporate Inc"
      );
      expect(
        parsedJson.reconciledFindings[0].humanReviewOutcome.auditorNotes
      ).toBe("   @ALERT(1)");

      // In CSV: formula-like values are neutralized with leading single quote
      const reconciled = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const csv = exportReconciledCsvReport(reconciled, { includeBom: false });

      expect(csv).toContain("'   =CMD('calc')");
      expect(csv).toContain("'+1234 Corporate Inc");
      expect(csv).toContain("'   @ALERT(1)");
    });

    it("formats CSV with proper quoting, French-Canadian accents, and CRLF line endings", () => {
      const unicodeFinding = createMockFinding("rec_unicode_01", {
        company: 'Société "Acme", Santé Inc.',
        location: "Montréal, Québec, Canada",
        title: "Directeur de l'Ingénierie",
      });

      const report = createMockReport(datasetName, [unicodeFinding]);
      const reconciled = reconcileFindingsWithReviews(
        report,
        {},
        { reviewDatasetName: datasetName }
      );
      const csv = exportReconciledCsvReport(reconciled, {
        includeBom: true,
        lineEnding: "\r\n",
      });

      // Includes UTF-8 BOM
      expect(csv.startsWith("\uFEFF")).toBe(true);

      // Line endings are CRLF
      expect(csv).toContain("\r\n");

      // Quotes inside cells are escaped as ""
      expect(csv).toContain('"Société ""Acme"", Santé Inc."');
      expect(csv).toContain('"Montréal, Québec, Canada"');
      expect(csv).toContain("Directeur de l'Ingénierie");

      // Valid CSV column headers
      const lines = csv.replace("\uFEFF", "").split("\r\n");
      const headers = lines[0]!.split(",");
      expect(headers).toEqual([...RECONCILED_CSV_COLUMNS]);
    });
  });

  describe("10. Storage Isolation & Trust Model Invariants", () => {
    it("operates strictly on explicit input datasets without touching global environment", () => {
      const finding = createMockFinding("rec_iso_01");
      const report = createMockReport(datasetName, [finding]);
      const reviews: ReviewStateMap = {};

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      expect(result.datasetName).toBe(datasetName);
      expect(result.trustModelNotice).toBe(RECONCILED_TRUST_MODEL_NOTICE);
      expect(result.trustModelNotice).toContain("unsigned operational snapshot");
      expect(result.trustModelNotice).toContain(
        "NOT constitute a cryptographically signed PKI audit log"
      );
    });
  });

  describe("11. Stage 6.3B.1 Regression Suite", () => {
    // Regression 1: Duplicate recordId in input findings
    it("Regression 1: fails safely when input report contains duplicate recordId values", () => {
      const findingA = createMockFinding("rec_duplicate_id_01");
      const findingB = createMockFinding("rec_duplicate_id_01", {
        title: "Conflicting Title with Identical Record ID",
      });
      const report = createMockReport(datasetName, [findingA, findingB]);

      expect(() => {
        reconcileFindingsWithReviews(
          report,
          {},
          { reviewDatasetName: datasetName }
        );
      }).toThrowError(DuplicateRecordIdError);
    });

    // Regression 2: Empty findings input
    it("Regression 2: produces valid deterministic empty JSON and CSV report when findings array is empty", () => {
      const emptyReport = createMockReport(datasetName, []);
      const result = reconcileFindingsWithReviews(
        emptyReport,
        {},
        {
          reviewDatasetName: datasetName,
          generatedAt: fixedTimestamp,
        }
      );

      expect(result.summary.totalRecordsAudited).toBe(0);
      expect(result.summary.totalFindingsInReport).toBe(0);
      expect(result.summary.uniqueRecordsWithFindings).toBe(0);
      expect(result.reconciledFindings).toHaveLength(0);
      expect(result.orphanedReviews).toHaveLength(0);

      const parsedValidation =
        reconciledAuditReportJsonSchema.safeParse(result);
      expect(parsedValidation.success).toBe(true);

      const csv = exportReconciledCsvReport(result, {
        includeBom: false,
        lineEnding: "\r\n",
      });
      const lines = csv.split("\r\n").filter((l) => l.length > 0);
      expect(lines).toHaveLength(1); // Header row only
      expect(lines[0]!.split(",")).toHaveLength(34);
    });

    // Regression 3: Stale modern v2 fingerprint maintains version "2.0"
    it("Regression 3: preserves fingerprintVersion as '2.0' when v2 finding is stale and outcome remains unverified", () => {
      const originalFinding = createMockFinding("rec_reg_stale_v2");
      const v2Hash = computeFindingFingerprintV2(originalFinding);

      const mutatedFinding = createMockFinding("rec_reg_stale_v2", {
        canonicalUrl:
          "https://boards.greenhouse.io/acme/jobs/mutated-canonical-url-999",
      });
      const report = createMockReport(datasetName, [mutatedFinding]);

      const reviews: ReviewStateMap = {
        rec_reg_stale_v2: {
          recordId: "rec_reg_stale_v2",
          fingerprint: v2Hash, // Valid v2 SHA-256 fingerprint from prior state
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
          updatedAt: fixedTimestamp,
        },
      };

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const entry = result.reconciledFindings[0]!;

      expect(entry.integrity.fingerprintVersion).toBe("2.0");
      expect(entry.integrity.isStaleFingerprint).toBe(true);
      expect(entry.resolution.reconciliationStatus).toBe("stale_review");
      expect(entry.resolution.isVerifiedOutcome).toBe(false);
    });

    // Regression 4: EVIDENCE_OBSERVED paired with unconfirmed or invalid disposition
    it("Regression 4: strictly quarantines and refuses to verify when EVIDENCE_OBSERVED is paired with an unconfirmed disposition", () => {
      const finding = createMockFinding("rec_reg_invalid_disp");
      const report = createMockReport(datasetName, [finding]);

      // Unconfirmed disposition (UNREVIEWED) paired with EVIDENCE_OBSERVED
      const reviews: ReviewStateMap = {
        rec_reg_invalid_disp: {
          recordId: "rec_reg_invalid_disp",
          fingerprint: computeFindingFingerprintV2(finding),
          status: "reviewed",
          disposition: "UNREVIEWED",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
          updatedAt: fixedTimestamp,
        },
      };

      const result = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const entry = result.reconciledFindings[0]!;

      expect(entry.resolution.reconciliationStatus).toBe(
        "quarantined_invalid_review"
      );
      expect(entry.resolution.isVerifiedOutcome).toBe(false);
      expect(entry.resolution.unresolvedReason).toContain(
        "Checklist verification incomplete for confirmed disposition"
      );
    });

    // Regression 5: Combined CSV export with orphan reviews enabled
    it("Regression 5: aligns every emitted row to exactly 34 columns when includeOrphanedReviews is enabled", () => {
      function parseCsvLine(line: string): string[] {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === "," && !inQuotes) {
            result.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current);
        return result;
      }

      const finding = createMockFinding("rec_reg_csv_01");
      const report = createMockReport(datasetName, [finding]);

      const reviews: ReviewStateMap = {
        rec_reg_csv_01: {
          recordId: "rec_reg_csv_01",
          fingerprint: computeFindingFingerprintV2(finding),
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
          updatedAt: fixedTimestamp,
        },
        rec_orphan_csv_99: {
          recordId: "rec_orphan_csv_99",
          fingerprint: "fp_v2_orphan_hash_9999",
          status: "reviewed",
          disposition: "GEO_CONFIRMED_FOREIGN",
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { locationExamined: true, entityLocationVerified: true },
          verificationSource: "Registry portal",
          notes: "Orphaned review notes",
          reviewerEmail: "orphan_auditor@citrux.com",
          updatedAt: fixedTimestamp,
        },
      };

      const reconciled = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const csv = exportReconciledCsvReport(reconciled, {
        includeOrphanedReviews: true,
        includeBom: false,
        lineEnding: "\r\n",
      });

      const lines = csv.split("\r\n").filter((l) => l.length > 0);
      expect(lines).toHaveLength(3); // Header, finding, orphan

      // Header row
      const headerCols = parseCsvLine(lines[0]!);
      expect(headerCols).toHaveLength(34);
      expect(headerCols).toEqual([...RECONCILED_CSV_COLUMNS]);

      // Finding row
      const findingCols = parseCsvLine(lines[1]!);
      expect(findingCols).toHaveLength(34);
      expect(findingCols[0]).toBe("rec_reg_csv_01");
      expect(findingCols[19]).toBe("evidence_verified");
      expect(findingCols[20]).toBe("TRUE");
      expect(findingCols[25]).toBe(
        "2/2 completed (requisitionCompared, urlInspected)"
      );

      // Orphan row
      const orphanCols = parseCsvLine(lines[2]!);
      expect(orphanCols).toHaveLength(34);
      expect(orphanCols[0]).toBe("rec_orphan_csv_99");
      expect(orphanCols[19]).toBe("orphaned_review");
      expect(orphanCols[20]).toBe("FALSE");
      expect(orphanCols[25]).toBe(
        "2/2 completed (entityLocationVerified, locationExamined)"
      );
      expect(orphanCols[26]).toBe("Orphaned review notes");
      expect(orphanCols[27]).toBe("orphan_auditor@citrux.com");
    });
  });
});
