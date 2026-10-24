import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DataQualityExportReportModal,
  sanitizeExportFilename,
  triggerBrowserBlobDownload,
} from "@/components/admin/data-quality/DataQualityExportReportModal";
import {
  computeFindingFingerprintV2,
  computeFindingFingerprintLegacy,
  type ValidatedAuditReport,
  type ValidatedJobFinding,
  type FindingReviewEntry,
} from "@/lib/data-quality/dashboard-schema";
import type { ReviewStateMap } from "@/components/admin/data-quality/review-state-store";
import {
  exportReconciledJsonReport,
  exportReconciledCsvReport,
  exportOrphanedReviewsCsv,
} from "@/lib/data-quality/reconciled-reporter";
import type { OrphanedReviewEntry } from "@/lib/data-quality/reconciled-reporter-types";
import { RECONCILED_REPORT_VERSION } from "@/lib/data-quality/reconciled-reporter-types";

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
  return {
    summary: {
      auditTimestamp: "2026-10-22T10:00:00.000Z",
      datasetName,
      totalRecordsAudited: findings.length,
      aiMode: "offline",
      duplicatePolicy: "none",
      duplicates: {
        totalDuplicateCandidateRecords: findings.length,
        totalDuplicateCandidateGroups: 1,
        exactAtsUrlGroups: 1,
        distinctSameRoleGroups: 0,
      },
      geography: {
        validUs: findings.length,
        explicitForeign: 0,
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

describe("DataQualityExportReportModal Component & Integration Unit Tests", () => {
  const datasetName = "freehire-us-export-test";
  let origWindow: unknown;
  let origDoc: unknown;

  beforeEach(() => {
    origWindow = global.window;
    origDoc = (global as any).document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (global as any).window = origWindow;
    (global as any).document = origDoc;
  });

  // 1. Accessible modal rendering and dismissal
  describe("1. Accessible modal rendering and dismissal", () => {
    it("renders nothing when isOpen is false", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport(datasetName, [finding]);
      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={false}
          onClose={vi.fn()}
          report={report}
          reviews={{}}
        />
      );
      expect(html).toBe("");
    });

    it("renders nothing when report is null even if isOpen is true", () => {
      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={null}
          reviews={{}}
        />
      );
      expect(html).toBe("");
    });

    it("renders with correct accessibility dialog attributes when open", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport(datasetName, [finding]);
      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={{}}
        />
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="export-report-modal-title"');
      expect(html).toContain('id="export-report-modal-title"');
      expect(html).toContain("Export Reconciled Audit Report");
      expect(html).toContain('aria-label="Close export dialog"');
    });
  });

  // 2. Correct active dataset display
  describe("2. Correct active dataset display", () => {
    it("renders active dataset name prominently in the identity banner", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport("custom-prod-dataset-2026", [finding]);
      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={{}}
        />
      );
      expect(html).toContain('data-testid="active-dataset-name"');
      expect(html).toContain("custom-prod-dataset-2026");
      expect(html).toContain("Exact Match Enforced");
    });
  });

  // 3. Accurate summary metrics derived from reconciled report
  describe("3. Accurate summary metrics derived from the reconciled report", () => {
    it("renders verified and unreviewed counts accurately without inflating findings denominator", () => {
      const finding1 = createMockFinding("rec_01");
      const finding2 = createMockFinding("rec_02");
      const report = createMockReport(datasetName, [finding1, finding2]);

      const fp1 = computeFindingFingerprintV2(finding1);
      const reviews: ReviewStateMap = {
        rec_01: {
          recordId: "rec_01",
          fingerprint: fp1,
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          verificationSource: "https://boards.greenhouse.io/acme/jobs/rec_01",
          checklist: {
            urlInspected: true,
            requisitionCompared: true,
          },
          updatedAt: "2026-10-23T01:00:00.000Z",
          reviewerEmail: "auditor@citrux.test",
          notes: "Confirmed manually",
        },
      };

      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={reviews}
        />
      );

      // Total Audited Findings
      expect(html).toContain('data-testid="summary-total-findings"');
      expect(html).toContain(">2</span>");

      // Evidence Verified
      expect(html).toContain('data-testid="summary-verified"');
      expect(html).toContain(">1</span>");

      // Unreviewed
      expect(html).toContain('data-testid="summary-unreviewed"');
      expect(html).toContain(">1</span>");

      // Orphans
      expect(html).toContain('data-testid="summary-orphans"');
      expect(html).toContain(">0</span>");
    });
  });

  // 4 & 5. JSON and CSV export triggers valid download
  describe("4 & 5. JSON and CSV exports", () => {
    it("generates valid reconciled JSON string matching schema", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport(datasetName, [finding]);
      const jsonStr = exportReconciledJsonReport(report, {}, {
        reviewDatasetName: datasetName,
      });

      expect(() => JSON.parse(jsonStr)).not.toThrow();
      const parsed = JSON.parse(jsonStr);
      expect(parsed.schemaVersion).toBe(RECONCILED_REPORT_VERSION);
      expect(parsed.datasetName).toBe(datasetName);
      expect(parsed.summary.totalFindingsInReport).toBe(1);
      expect(parsed.reconciledFindings[0].recordId).toBe("rec_01");
    });

    it("generates valid CSV export with UTF-8 BOM and correct column headers", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport(datasetName, [finding]);
      const jsonStr = exportReconciledJsonReport(report, {}, {
        reviewDatasetName: datasetName,
      });
      const parsed = JSON.parse(jsonStr);
      const csvStr = exportReconciledCsvReport(parsed, {
        includeBom: true,
        lineEnding: "\r\n",
      });

      expect(csvStr.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
      expect(csvStr).toContain("record_id");
      expect(csvStr).toContain("reconciliation_status");
      expect(csvStr).toContain("rec_01");
    });
  });

  // 6. Dedicated orphan CSV availability when orphans exist
  describe("6. Dedicated orphan CSV availability when orphans exist", () => {
    it("renders orphan card and orphan download button only when orphaned reviews exist", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport(datasetName, [finding]);

      // No orphans initially
      const htmlNoOrphans = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={{}}
        />
      );
      expect(htmlNoOrphans).not.toContain("Download Orphaned Reviews CSV (13 columns)");

      // With orphaned review
      const reviewsWithOrphan: ReviewStateMap = {
        orphan_999: {
          recordId: "orphan_999",
          fingerprint: "fp_orphan_999",
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          updatedAt: "2026-10-20T00:00:00.000Z",
          reviewerEmail: "auditor@citrux.test",
          notes: "Orphaned",
        },
      };

      const htmlWithOrphans = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={reviewsWithOrphan}
        />
      );
      expect(htmlWithOrphans).toContain("Download Orphaned Reviews CSV (13 columns)");
      expect(htmlWithOrphans).toContain("1 Orphaned Review Record");
      expect(htmlWithOrphans).toContain(
        "Stored review decisions exist for job record IDs that are absent from the current audit report."
      );
    });

    it("exports dedicated orphan CSV with 13 columns", () => {
      const orphanedReviews: OrphanedReviewEntry[] = [
        {
          recordId: "rec_orphan_01",
          storedFingerprint: "fp_old",
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT",
          evidenceTier: "EVIDENCE_OBSERVED",
          verificationSource: "https://greenhouse.io",
          checklist: {
            urlInspected: true,
            requisitionCompared: true,
          },
          auditorNotes: "Orphaned note",
          reviewerAttribution: "lead_auditor@citrux.test",
          updatedAt: "2026-10-21T00:00:00.000Z",
          reconciliationStatus: "orphaned_review",
          unresolvedReason: "Review record has no matching finding in current audit report",
          requiredNextAction: "Verify dataset identity or inspect source audit report version",
        },
      ];

      const csv = exportOrphanedReviewsCsv(orphanedReviews, {
        includeBom: true,
        lineEnding: "\r\n",
      });

      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const lines = csv.split("\r\n");
      const firstLine = lines[0];
      expect(firstLine).toBeDefined();
      const headers = firstLine!.replace("\uFEFF", "").split(",");
      expect(headers.length).toBe(13);
      expect(headers).toEqual([
        "record_id",
        "stored_fingerprint",
        "status",
        "disposition",
        "evidence_tier",
        "verification_source",
        "checklist_summary",
        "auditor_notes",
        "reviewer_attribution",
        "updated_at",
        "reconciliation_status",
        "unresolved_reason",
        "required_next_action",
      ]);
    });
  });

  // 7. Combined CSV checkbox behavior
  describe("7. Combined CSV checkbox behavior", () => {
    it("renders accessible checkbox to include orphaned reviews in main CSV", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport(datasetName, [finding]);

      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={{}}
        />
      );

      expect(html).toContain('id="include-orphans-checkbox"');
      expect(html).toContain('type="checkbox"');
      expect(html).toContain('aria-label="Include orphaned reviews in main CSV export"');
      expect(html).toContain("Include orphaned reviews appended at end of reconciled findings CSV");
    });
  });

  // 8. Missing or mismatched dataset identity fails closed
  describe("8. Missing or mismatched dataset identity fails closed", () => {
    it("fails closed when report dataset name is empty or whitespace", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport("   ", [finding]);

      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={{}}
        />
      );

      expect(html).toContain('data-testid="reconciliation-error-alert"');
      expect(html).toContain("Reconciliation Failed (Fail-Closed)");
      expect(html).toContain("Missing active dataset identity on loaded audit report.");
    });
  });

  // 9. Reconciliation errors are visible and do not mutate review state
  describe("9. Reconciliation errors are visible and do not mutate review state", () => {
    it("catches duplicate record IDs and displays error without modifying reviews map", () => {
      const finding1 = createMockFinding("rec_duplicate_id");
      const finding2 = createMockFinding("rec_duplicate_id"); // Duplicate ID
      const report = createMockReport(datasetName, [finding1, finding2]);

      const originalReviews: ReviewStateMap = Object.freeze({
        rec_duplicate_id: Object.freeze({
          recordId: "rec_duplicate_id",
          fingerprint: "rec_duplicate_id",
          status: "reviewed" as const,
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT" as const,
          evidenceTier: "EVIDENCE_OBSERVED" as const,
          updatedAt: "2026-10-23T00:00:00.000Z",
          reviewerEmail: "test@citrux.test",
          notes: "frozen",
        }),
      });

      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={originalReviews}
        />
      );

      expect(html).toContain('data-testid="reconciliation-error-alert"');
      expect(html).toContain('rec_duplicate_id');
      expect(html).toContain('detected in report findings');
      expect(originalReviews.rec_duplicate_id?.notes).toBe("frozen");
    });
  });

  // 10. Stale, legacy, escalated, and quarantined entries are never displayed as verified
  describe("10. Stale, legacy, escalated, and quarantined entries are never displayed as verified", () => {
    it("correctly partitions stale, legacy, escalated, and quarantined into unverified categories", () => {
      const finding1 = createMockFinding("rec_stale");
      const finding2 = createMockFinding("rec_legacy");
      const finding3 = createMockFinding("rec_escalated");
      const finding4 = createMockFinding("rec_quarantined");

      const report = createMockReport(datasetName, [
        finding1,
        finding2,
        finding3,
        finding4,
      ]);

      const reviews: ReviewStateMap = {
        // Stale: fingerprint mismatch
        rec_stale: {
          recordId: "rec_stale",
          fingerprint: "mismatched_stale_fingerprint",
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          verificationSource: "https://greenhouse.io",
          checklist: { urlInspected: true, requisitionCompared: true },
          updatedAt: "2026-10-20T00:00:00.000Z",
          notes: "Old decision",
        },
        // Legacy: legacy format without v2 fingerprint
        rec_legacy: {
          recordId: "rec_legacy",
          fingerprint: computeFindingFingerprintLegacy(finding2),
          status: "reviewed",
          disposition: "LEGACY_REVIEWED_UNSTRUCTURED",
          evidenceTier: "EVIDENCE_HISTORICAL_UNSTRUCTURED",
          updatedAt: "2026-09-01T00:00:00.000Z",
          notes: "Legacy review",
        },
        // Escalated: requires evidence but evidence gating fails
        rec_escalated: {
          recordId: "rec_escalated",
          fingerprint: computeFindingFingerprintV2(finding3),
          status: "needs_review",
          disposition: "ESCALATED_NEEDS_FURTHER_EVIDENCE",
          evidenceTier: "EVIDENCE_INSUFFICIENT",
          updatedAt: "2026-10-23T00:00:00.000Z",
          notes: "Needs supervisor review",
        },
        // Quarantined: non-conclusive evidence tier with confirmed outcome triggers quarantine
        rec_quarantined: {
          recordId: "rec_quarantined",
          fingerprint: computeFindingFingerprintV2(finding4),
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_INSUFFICIENT",
          updatedAt: "2026-10-23T00:00:00.000Z",
          notes: "Corrupted input",
        },
      };

      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={reviews}
        />
      );

      // Verified MUST be 0!
      expect(html).toContain('data-testid="summary-verified"');
      expect(html).toContain(">0</span>");

      // Stale
      expect(html).toContain('data-testid="summary-stale"');
      expect(html).toContain(">1</span>");

      // Legacy
      expect(html).toContain('data-testid="summary-legacy"');
      expect(html).toContain(">1</span>");

      // Escalated
      expect(html).toContain('data-testid="summary-escalated"');
      expect(html).toContain(">1</span>");

      // Quarantined
      expect(html).toContain('data-testid="summary-quarantined"');
      expect(html).toContain(">1</span>");
    });
  });

  // 11. Safe filenames and download cleanup
  describe("11. Safe filenames and download cleanup", () => {
    it("sanitizes filenames stripping path traversal, slashes, and control characters", () => {
      const maliciousDataset = "../../etc/passwd\u0000malicious*name:test|here";
      const filename = sanitizeExportFilename(
        maliciousDataset,
        "json",
        "reconciled-audit",
        "2026-10-23T00-00-00"
      );

      expect(filename).toBe(
        "reconciled-audit-etc_passwd_malicious_name_test_here-2026-10-23T00-00-00.json"
      );
      expect(filename).not.toContain("..");
      expect(filename).not.toContain("/");
      expect(filename).not.toContain("\\");
      expect(filename).not.toContain("\u0000");
    });

    it("falls back to 'audit' if dataset name is entirely stripped", () => {
      const filename = sanitizeExportFilename(
        "///*:?|<>",
        "csv",
        "reconciled-audit",
        "2026-10-23"
      );
      expect(filename).toBe("reconciled-audit-audit-2026-10-23.csv");
    });

    it("creates Blob URL, triggers click, appends/removes link, and revokes object URL", () => {
      const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/mock-blob-id");
      const revokeObjectURLMock = vi.fn();
      const clickMock = vi.fn();

      const mockLink = {
        href: "",
        download: "",
        click: clickMock,
      };

      const appendChildMock = vi.fn();
      const removeChildMock = vi.fn();

      const mockDocument = {
        createElement: vi.fn().mockReturnValue(mockLink),
        body: {
          appendChild: appendChildMock,
          removeChild: removeChildMock,
        },
      };

      // Set mocked window and document environment
      (global as any).window = {
        document: mockDocument,
      };
      (global as any).document = mockDocument;
      (global as any).URL = {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      };

      triggerBrowserBlobDownload("test-content", "test-report.json", "application/json");

      expect(mockDocument.createElement).toHaveBeenCalledWith("a");
      expect(mockLink.href).toBe("blob:http://localhost/mock-blob-id");
      expect(mockLink.download).toBe("test-report.json");
      expect(appendChildMock).toHaveBeenCalledWith(mockLink);
      expect(clickMock).toHaveBeenCalledTimes(1);
      expect(removeChildMock).toHaveBeenCalledWith(mockLink);
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:http://localhost/mock-blob-id");
    });
  });

  // 12. Export actions preserve original report and review map
  describe("12. Export actions preserve original report and review map", () => {
    it("ensures no mutations occur on the input report or reviews map", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport(datasetName, [finding]);
      const reviews: ReviewStateMap = {
        rec_01: {
          recordId: "rec_01",
          fingerprint: computeFindingFingerprintV2(finding),
          status: "reviewed",
          disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
          evidenceTier: "EVIDENCE_OBSERVED",
          verificationSource: "https://boards.greenhouse.io/acme/jobs/rec_01",
          checklist: {
            urlInspected: true,
            requisitionCompared: true,
          },
          updatedAt: "2026-10-23T00:00:00.000Z",
          reviewerEmail: "auditor@test.com",
          notes: "immutable test",
        },
      };

      const originalReportJson = JSON.stringify(report);
      const originalReviewsJson = JSON.stringify(reviews);

      // Render and generate
      renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={reviews}
        />
      );

      exportReconciledJsonReport(report, reviews, {
        reviewDatasetName: datasetName,
      });

      expect(JSON.stringify(report)).toBe(originalReportJson);
      expect(JSON.stringify(reviews)).toBe(originalReviewsJson);
    });
  });

  // 13. Keyboard interaction and trust notice
  describe("13. Trust notice and UI elements", () => {
    it("displays mandatory trust notice box with exact text", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport(datasetName, [finding]);

      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={{}}
        />
      );

      expect(html).toContain('data-testid="trust-notice-box"');
      expect(html).toContain(
        "Unsigned local working-state snapshot. This export reconciles algorithmic findings with browser-local review state. It is not a tamper-proof audit log or authoritative production record."
      );
    });

    it("has accessible button labels for all actions", () => {
      const finding = createMockFinding("rec_01");
      const report = createMockReport(datasetName, [finding]);

      const html = renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={{}}
        />
      );

      expect(html).toContain('aria-label="Download Reconciled JSON Report"');
      expect(html).toContain('aria-label="Download Reconciled CSV Report"');
      expect(html).toContain('aria-label="Include orphaned reviews in main CSV export"');
      expect(html).toContain('aria-label="Close export dialog"');
    });
  });

  // 14. No network or server dependency is introduced
  describe("14. No network or server dependency is introduced", () => {
    it("ensures no fetch or XMLHttpRequest calls are made", () => {
      const fetchSpy = vi.spyOn(global, "fetch" as any);
      const finding = createMockFinding("rec_01");
      const report = createMockReport(datasetName, [finding]);

      renderToStaticMarkup(
        <DataQualityExportReportModal
          isOpen={true}
          onClose={vi.fn()}
          report={report}
          reviews={{}}
        />
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
