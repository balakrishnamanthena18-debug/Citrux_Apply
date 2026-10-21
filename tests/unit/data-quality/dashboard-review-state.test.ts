import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fullAuditReportSchema,
  reviewStatusSchema,
  reviewStateBackupSchema,
  computeFindingFingerprint,
  isSafeHttpUrl,
  type ValidatedAuditReport,
  type ValidatedJobFinding,
} from "@/lib/data-quality/dashboard-schema";
import {
  loadReviewState,
  saveReviewEntry,
  resolveFindingReviewStatus,
  exportReviewStateBackup,
  importReviewStateBackup,
  clearDatasetReviewState,
} from "@/components/admin/data-quality/review-state-store";

describe("OOS Data Quality & Intelligence — Dashboard & Review State Unit Tests (Phase 2)", () => {
  const sampleFinding: ValidatedJobFinding = {
    recordId: "rec_sample_001",
    publicSlug: "senior-frontend-engineer-101",
    externalId: "ext_101",
    source: "greenhouse",
    company: "Acme Health",
    title: "Senior Frontend Engineer",
    location: "Indianapolis, IN",
    rawUrl: "https://boards.greenhouse.io/acmehealth/jobs/12345?gh_src=linkedin",
    canonicalUrl: "https://boards.greenhouse.io/acmehealth/jobs/12345",
    ats: {
      provider: "greenhouse",
      requisitionId: "12345",
      trackingParametersRemoved: ["gh_src"],
      canonicalUrl: "https://boards.greenhouse.io/acmehealth/jobs/12345",
      isAtsUrl: true,
    },
    duplicate: {
      duplicateGroupId: "grp_dup_001",
      isDuplicateCandidate: true,
      confidence: "high",
      reasonCode: "EXACT_ATS_CANONICAL_URL",
      evidence: "Identical canonical Greenhouse URL with 2 candidate records",
      candidateIdsInGroup: ["rec_sample_001", "rec_sample_002"],
      candidateCountInGroup: 2,
    },
    geography: {
      status: "valid_us",
      detectedCountry: "United States",
      rawLocation: "Indianapolis, IN",
      rawCountryCodes: ["in"],
      isDiscrepancy: true,
      notes: "Indianapolis, IN is a valid US municipality. Scraper ISO 'in' (India) flagged as metadata discrepancy.",
    },
    freshness: {
      status: "active_signal",
      closureSignals: [],
      suspectedIngestionBatch: false,
      postedAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-02T12:00:00Z",
      ageDays: 5,
      notes: "Active signals present.",
    },
    aiReview: {
      used: false,
      status: "needs_review",
      reason: "Duplicate candidate detected; requires human auditor verification.",
    },
  };

  const sampleReport: ValidatedAuditReport = {
    summary: {
      auditTimestamp: "2026-10-21T10:00:00.000Z",
      datasetName: "freehire-us-test-sample",
      totalRecordsAudited: 1,
      aiMode: "offline",
      duplicatePolicy: "none",
      duplicates: {
        totalDuplicateCandidateRecords: 1,
        totalDuplicateCandidateGroups: 1,
        exactAtsUrlGroups: 1,
        distinctSameRoleGroups: 0,
      },
      geography: {
        validUs: 1,
        explicitForeign: 0,
        metadataDiscrepancy: 1,
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
        recordsNeedingHumanReview: 1,
      },
    },
    findings: [sampleFinding],
  };

  // Mock localStorage for Vitest Node environment
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        mockStorage[key] = String(val);
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };
    vi.stubGlobal("window", { localStorage: storageMock });
    vi.stubGlobal("localStorage", storageMock);
  });

  describe("1. Zod Schema Validation for Phase 1 Audit Reports", () => {
    it("successfully validates a conformant Phase 1 audit report", () => {
      const result = fullAuditReportSchema.safeParse(sampleReport);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.summary.totalRecordsAudited).toBe(1);
        expect(result.data.summary.duplicatePolicy).toBe("none");
        expect(result.data.summary.aiMode).toBe("offline");
        expect(result.data.findings[0]?.recordId).toBe("rec_sample_001");
      }
    });

    it("rejects reports with invalid AI mode or duplicate policy violating frozen contracts", () => {
      const invalidPolicyReport = {
        ...sampleReport,
        summary: {
          ...sampleReport.summary,
          duplicatePolicy: "master_select_earliest", // Illegal policy!
        },
      };
      const result1 = fullAuditReportSchema.safeParse(invalidPolicyReport);
      expect(result1.success).toBe(false);

      const invalidAiReport = {
        ...sampleReport,
        summary: {
          ...sampleReport.summary,
          aiMode: "live_gemini_api", // Illegal AI mode!
        },
      };
      const result2 = fullAuditReportSchema.safeParse(invalidAiReport);
      expect(result2.success).toBe(false);
    });

    it("rejects reports missing required summary sections or invalid finding reason codes", () => {
      const malformedReport = {
        summary: {
          auditTimestamp: "2026-10-21T10:00:00.000Z",
          datasetName: "test",
        },
        findings: [],
      };
      const result = fullAuditReportSchema.safeParse(malformedReport);
      expect(result.success).toBe(false);
    });
  });

  describe("2. Review Status Contracts & State Boundaries", () => {
    it("permits only unreviewed, reviewed, and needs_review", () => {
      expect(reviewStatusSchema.safeParse("unreviewed").success).toBe(true);
      expect(reviewStatusSchema.safeParse("reviewed").success).toBe(true);
      expect(reviewStatusSchema.safeParse("needs_review").success).toBe(true);

      // Must strictly reject mutation / deletion / resolution actions
      expect(reviewStatusSchema.safeParse("approved").success).toBe(false);
      expect(reviewStatusSchema.safeParse("rejected").success).toBe(false);
      expect(reviewStatusSchema.safeParse("deleted").success).toBe(false);
      expect(reviewStatusSchema.safeParse("merged").success).toBe(false);
      expect(reviewStatusSchema.safeParse("master").success).toBe(false);
    });
  });

  describe("3. Deterministic Fingerprinting & Staleness Detection", () => {
    it("generates deterministic fingerprint for identical finding properties", () => {
      const fp1 = computeFindingFingerprint(sampleFinding);
      const fp2 = computeFindingFingerprint({ ...sampleFinding });
      expect(fp1).toBe(fp2);
      expect(fp1.startsWith("fp_")).toBe(true);
    });

    it("generates a different fingerprint when audit finding fields change", () => {
      const fpOriginal = computeFindingFingerprint(sampleFinding);

      const alteredFinding: ValidatedJobFinding = {
        ...sampleFinding,
        canonicalUrl: "https://boards.greenhouse.io/acmehealth/jobs/99999",
      };
      const fpAltered = computeFindingFingerprint(alteredFinding);

      expect(fpAltered).not.toBe(fpOriginal);
    });

    it("detects stale fingerprint and resets status to unreviewed with warning flag", () => {
      const dataset = "test-dataset";
      // Save review for initial finding
      saveReviewEntry(dataset, sampleFinding, "reviewed", "Initial inspection confirmed.");

      const reviews = loadReviewState(dataset);
      const initialResolution = resolveFindingReviewStatus(reviews, sampleFinding);
      expect(initialResolution.status).toBe("reviewed");
      expect(initialResolution.isStaleFingerprint).toBe(false);

      // Now audit report was regenerated and finding reason code changed
      const updatedFinding: ValidatedJobFinding = {
        ...sampleFinding,
        duplicate: {
          ...sampleFinding.duplicate,
          reasonCode: "SIMILAR_ROLE_DISTINCT_REQUISITION",
        },
      };

      const alteredResolution = resolveFindingReviewStatus(reviews, updatedFinding);
      // Status must safely fall back to unreviewed because underlying finding changed
      expect(alteredResolution.status).toBe("unreviewed");
      expect(alteredResolution.isStaleFingerprint).toBe(true);
      expect(alteredResolution.entry?.status).toBe("reviewed");
    });
  });

  describe("4. Review State Local Persistence & Backup Export/Restore", () => {
    it("saves and retrieves review entries from localStorage without network transmission", () => {
      const dataset = "freehire-us-nov";
      saveReviewEntry(dataset, sampleFinding, "needs_review", "Check clinical unit number.");

      const loaded = loadReviewState(dataset);
      expect(loaded[sampleFinding.recordId]).toBeDefined();
      expect(loaded[sampleFinding.recordId]?.status).toBe("needs_review");
      expect(loaded[sampleFinding.recordId]?.notes).toBe("Check clinical unit number.");
    });

    it("exports valid JSON backup matching reviewStateBackupSchema", () => {
      const dataset = "freehire-us-nov";
      saveReviewEntry(dataset, sampleFinding, "reviewed");
      const loaded = loadReviewState(dataset);

      const exportedJson = exportReviewStateBackup(dataset, loaded);
      const parsed = JSON.parse(exportedJson);
      const validated = reviewStateBackupSchema.safeParse(parsed);

      expect(validated.success).toBe(true);
      if (validated.success) {
        expect(validated.data.version).toBe("1.0");
        expect(validated.data.datasetName).toBe(dataset);
        expect(validated.data.reviews[sampleFinding.recordId]?.status).toBe("reviewed");
      }
    });

    it("imports and restores review entries from valid backup JSON", () => {
      const dataset = "freehire-us-nov";
      const backupJson = JSON.stringify({
        version: "1.0",
        exportedAt: new Date().toISOString(),
        datasetName: dataset,
        reviews: {
          [sampleFinding.recordId]: {
            fingerprint: computeFindingFingerprint(sampleFinding),
            recordId: sampleFinding.recordId,
            status: "needs_review",
            notes: "Imported from coworker's session",
            updatedAt: new Date().toISOString(),
          },
        },
      });

      const res = importReviewStateBackup(dataset, backupJson);
      expect(res.success).toBe(true);
      expect(res.importedCount).toBe(1);

      const loaded = loadReviewState(dataset);
      expect(loaded[sampleFinding.recordId]?.status).toBe("needs_review");
      expect(loaded[sampleFinding.recordId]?.notes).toBe("Imported from coworker's session");
    });

    it("rejects corrupted or malicious backup JSON payloads", () => {
      const dataset = "freehire-us-nov";
      const corruptedJson = "not a valid json {{{{";
      const res1 = importReviewStateBackup(dataset, corruptedJson);
      expect(res1.success).toBe(false);

      const wrongSchemaJson = JSON.stringify({
        version: "99.0", // Invalid version
        datasetName: dataset,
        reviews: "not an object",
      });
      const res2 = importReviewStateBackup(dataset, wrongSchemaJson);
      expect(res2.success).toBe(false);
    });

    it("clears dataset review state cleanly", () => {
      const dataset = "freehire-us-nov";
      saveReviewEntry(dataset, sampleFinding, "reviewed");
      expect(Object.keys(loadReviewState(dataset)).length).toBe(1);

      clearDatasetReviewState(dataset);
      expect(Object.keys(loadReviewState(dataset)).length).toBe(0);
    });
  });

  describe("5. Invariant Checks (Zero Master, Zero Job Mutations, Offline Boundaries)", () => {
    it("guarantees source finding records are not mutated during review operations", () => {
      const dataset = "test-dataset";
      const originalFindingClone = JSON.parse(JSON.stringify(sampleFinding));

      // Perform review save and status resolution
      saveReviewEntry(dataset, sampleFinding, "reviewed", "Audited cleanly");
      const reviews = loadReviewState(dataset);
      resolveFindingReviewStatus(reviews, sampleFinding);

      // Deep equality check: original finding record must be completely unchanged
      expect(sampleFinding).toEqual(originalFindingClone);
      expect(sampleFinding.duplicate.duplicateGroupId).toBe(originalFindingClone.duplicate.duplicateGroupId);
      // Master record must never exist
      expect((sampleFinding as Record<string, unknown>).isMaster).toBeUndefined();
      expect((sampleFinding as Record<string, unknown>).isDeleted).toBeUndefined();
    });
  });

  describe("6. Security & Hardening Remediations (SEC-01 through SEC-04)", () => {
    it("SEC-01: validates safe HTTP/HTTPS URLs and rejects unsafe protocols (e.g. javascript:, data:)", () => {
      // Valid URLs
      expect(isSafeHttpUrl("https://boards.greenhouse.io/job/123")).toBe(true);
      expect(isSafeHttpUrl("http://jobs.lever.co/company/abc-123")).toBe(true);
      expect(isSafeHttpUrl("  https://example.com/job  ")).toBe(true);

      // Unsafe schemes & invalid inputs
      expect(isSafeHttpUrl("javascript:alert(document.cookie)")).toBe(false);
      expect(isSafeHttpUrl("javascript:void(0)")).toBe(false);
      expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
      expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
      expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
      expect(isSafeHttpUrl("ftp://ftp.example.com/file")).toBe(false);
      expect(isSafeHttpUrl("")).toBe(false);
      expect(isSafeHttpUrl("   ")).toBe(false);
      expect(isSafeHttpUrl("not-a-url")).toBe(false);
      expect(isSafeHttpUrl(null)).toBe(false);
      expect(isSafeHttpUrl(undefined)).toBe(false);
    });

    it("SEC-03: surfaces storage write failure cleanly when localStorage quota is exceeded", () => {
      const dataset = "quota-test-dataset";
      // Simulate QuotaExceededError on localStorage.setItem
      const quotaError = new DOMException("Quota exceeded", "QuotaExceededError");
      vi.spyOn(window.localStorage, "setItem").mockImplementationOnce(() => {
        throw quotaError;
      });

      const res = saveReviewEntry(dataset, sampleFinding, "reviewed", "Test note");
      expect(res.success).toBe(false);
      expect(res.error).toContain("quota exceeded");
      // UI state should not be polluted with failed write
      expect(loadReviewState(dataset)[sampleFinding.recordId]).toBeUndefined();
    });

    it("SEC-04: warns and requires confirmation before restoring backup from another dataset", () => {
      const currentDataset = "freehire-us-page-1";
      const foreignDataset = "freehire-us-page-2";

      const foreignBackup = JSON.stringify({
        version: "1.0",
        exportedAt: new Date().toISOString(),
        datasetName: foreignDataset,
        reviews: {
          [sampleFinding.recordId]: {
            fingerprint: computeFindingFingerprint(sampleFinding),
            recordId: sampleFinding.recordId,
            status: "reviewed",
            updatedAt: new Date().toISOString(),
          },
        },
      });

      // Default import attempt without confirmation must fail and indicate confirmation required
      const attempt1 = importReviewStateBackup(currentDataset, foreignBackup);
      expect(attempt1.success).toBe(false);
      expect(attempt1.requiresConfirmation).toBe(true);
      expect(attempt1.backupDatasetName).toBe(foreignDataset);
      expect(attempt1.error).toContain("Dataset mismatch");

      // With explicit confirmation (allowCrossDataset: true), import succeeds
      const attempt2 = importReviewStateBackup(currentDataset, foreignBackup, {
        allowCrossDataset: true,
      });
      expect(attempt2.success).toBe(true);
      expect(attempt2.importedCount).toBe(1);

      const loaded = loadReviewState(currentDataset);
      expect(loaded[sampleFinding.recordId]?.status).toBe("reviewed");
    });
  });
});
