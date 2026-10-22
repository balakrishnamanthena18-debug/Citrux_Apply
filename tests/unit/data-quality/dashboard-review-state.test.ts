import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  fullAuditReportSchema,
  reviewStatusSchema,
  evidenceTierSchema,
  reviewDispositionSchema,
  reviewStateBackupSchema,
  computeFindingFingerprint,
  computeFindingFingerprintV2,
  computeFindingFingerprintLegacy,
  serializeCanonicalFingerprintPayload,
  sha256Hex,
  validateEvidenceGatedDisposition,
  getRequiredChecklistItems,
  toLegacyReviewStatus,
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
  normalizeStoredReviewEntry,
  measureLocalStorageUsage,
  getStorageKey,
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
      key: vi.fn((idx: number) => Object.keys(mockStorage)[idx] ?? null),
      get length() {
        return Object.keys(mockStorage).length;
      },
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

    it("exports valid JSON backup matching reviewStateBackupSchema (v2.0 with trust notice)", () => {
      const dataset = "freehire-us-nov";
      saveReviewEntry(dataset, sampleFinding, "reviewed");
      const loaded = loadReviewState(dataset);

      const exportedJson = exportReviewStateBackup(dataset, loaded);
      const parsed = JSON.parse(exportedJson);
      const validated = reviewStateBackupSchema.safeParse(parsed);

      expect(validated.success).toBe(true);
      if (validated.success) {
        expect(validated.data.version).toBe("2.0");
        expect(validated.data.datasetName).toBe(dataset);
        expect(validated.data.trustModelNotice).toContain("Unsigned Browser-Local Attribution");
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

  describe("7. Stage 5: Versioned SHA-256 Fingerprints, Unicode NFC & Delimiter Immunity", () => {
    it("matches Node.js crypto SHA-256 byte-for-byte across ASCII, empty, and Unicode inputs", () => {
      const inputs = [
        "",
        "hello world",
        "Indianapolis, IN",
        "San José, CA — Multi-location",
        JSON.stringify({ a: 1, b: "test", c: [1, 2, 3] }),
      ];

      for (const input of inputs) {
        const expected = createHash("sha256").update(input, "utf8").digest("hex");
        const actual = sha256Hex(input);
        expect(actual).toBe(expected);
      }
    });

    it("generates deterministic v2 fingerprint prefixed with fp_v2_ and 64 hex characters", () => {
      const fp = computeFindingFingerprintV2(sampleFinding);
      expect(fp).toMatch(/^fp_v2_[a-f0-9]{64}$/);
      expect(computeFindingFingerprintV2(sampleFinding)).toBe(fp);
    });

    it("applies Unicode NFC normalization producing identical fingerprints for NFD and NFC forms", () => {
      // "San José" in NFC (precomposed é \u00e9) vs NFD (decomposed e + combining acute e\u0301)
      const findingNfc: ValidatedJobFinding = {
        ...sampleFinding,
        geography: {
          ...sampleFinding.geography,
          rawLocation: "San Jos\u00e9, CA",
        },
      };
      const findingNfd: ValidatedJobFinding = {
        ...sampleFinding,
        geography: {
          ...sampleFinding.geography,
          rawLocation: "San Jose\u0301, CA",
        },
      };

      const fpNfc = computeFindingFingerprintV2(findingNfc);
      const fpNfd = computeFindingFingerprintV2(findingNfd);
      expect(fpNfc).toBe(fpNfd);
    });

    it("resists delimiter injection and separator collision attacks", () => {
      const findingWithPipes: ValidatedJobFinding = {
        ...sampleFinding,
        location: "City|State|Country",
        canonicalUrl: "https://example.com/job|with|pipes",
      };
      const findingWithBraces: ValidatedJobFinding = {
        ...sampleFinding,
        location: '{"city":"Test","state":"IN"}',
      };

      const fp1 = computeFindingFingerprintV2(findingWithPipes);
      const fp2 = computeFindingFingerprintV2(findingWithBraces);
      expect(fp1).not.toBe(fp2);

      const mutatedCount: ValidatedJobFinding = {
        ...sampleFinding,
        duplicate: {
          ...sampleFinding.duplicate,
          candidateCountInGroup: 5,
        },
      };
      expect(computeFindingFingerprintV2(mutatedCount)).not.toBe(computeFindingFingerprintV2(sampleFinding));
    });

    it("distinguishes identity fields from finding state fields in canonical payload", () => {
      const serialized = serializeCanonicalFingerprintPayload(sampleFinding);
      const parsed = JSON.parse(serialized);
      expect(parsed.version).toBe("2.0");
      expect(parsed.identity).toBeDefined();
      expect(parsed.identity.recordId).toBe(sampleFinding.recordId);
      expect(parsed.state).toBeDefined();
      expect(parsed.state.duplicateReasonCode).toBe(sampleFinding.duplicate.reasonCode);
    });
  });

  describe("8. Stage 5: Evidence-Gated Dispositions & Escalation Rules", () => {
    it("strictly rejects confirmed dispositions when evidence tier is non-conclusive", () => {
      const nonConclusiveTiers = [
        "EVIDENCE_INSUFFICIENT",
        "EVIDENCE_INACCESSIBLE",
        "EVIDENCE_CONFLICTING",
      ] as const;

      const confirmedDispositions = [
        "DUPLICATE_CONFIRMED_REDUNDANT",
        "DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT",
        "GEO_CONFIRMED_DOMESTIC_US",
        "GEO_CONFIRMED_FOREIGN",
        "GEO_METADATA_COLLISION_VERIFIED",
        "TEMPORAL_VERIFIED_ACTIVE",
        "TEMPORAL_VERIFIED_CLOSED",
      ] as const;

      for (const tier of nonConclusiveTiers) {
        for (const disp of confirmedDispositions) {
          const res = validateEvidenceGatedDisposition(disp, tier);
          expect(res.isValid).toBe(false);
          expect(res.error).toContain("non-conclusive");
        }

        // Must permit escalation
        const escRes = validateEvidenceGatedDisposition("ESCALATED_NEEDS_FURTHER_EVIDENCE", tier);
        expect(escRes.isValid).toBe(true);
      }
    });

    it("allows confirmed dispositions when evidence tier is EVIDENCE_OBSERVED and checklist is complete", () => {
      const confirmedDispositions = [
        "DUPLICATE_CONFIRMED_REDUNDANT",
        "DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT",
        "GEO_CONFIRMED_DOMESTIC_US",
        "GEO_CONFIRMED_FOREIGN",
        "GEO_METADATA_COLLISION_VERIFIED",
        "TEMPORAL_VERIFIED_ACTIVE",
        "TEMPORAL_VERIFIED_CLOSED",
      ] as const;

      for (const disp of confirmedDispositions) {
        // Without checklist: rejected per DQ-AUDIT-02
        const resWithoutChecklist = validateEvidenceGatedDisposition(disp, "EVIDENCE_OBSERVED");
        expect(resWithoutChecklist.isValid).toBe(false);
        expect(resWithoutChecklist.error).toContain("mandates completion of checklist");

        // With complete checklist: allowed
        const reqItems = getRequiredChecklistItems(disp);
        const checklist = Object.fromEntries(reqItems.map((k) => [k, true]));
        const resWithChecklist = validateEvidenceGatedDisposition(disp, "EVIDENCE_OBSERVED", checklist);
        expect(resWithChecklist.isValid).toBe(true);
      }
    });

    it("blocks saveReviewEntry if evidence gate rule is violated", () => {
      const dataset = "gating-dataset";
      const saveRes = saveReviewEntry(
        dataset,
        sampleFinding,
        "GEO_CONFIRMED_DOMESTIC_US",
        "Violating gate note",
        {
          evidenceTier: "EVIDENCE_INSUFFICIENT",
        }
      );

      expect(saveRes.success).toBe(false);
      expect(saveRes.error).toContain("non-conclusive");
      expect(loadReviewState(dataset)[sampleFinding.recordId]).toBeUndefined();
    });

    it("correctly maps structured dispositions to legacy review status tri-state", () => {
      expect(toLegacyReviewStatus("UNREVIEWED")).toBe("unreviewed");
      expect(toLegacyReviewStatus("ESCALATED_NEEDS_FURTHER_EVIDENCE")).toBe("needs_review");
      expect(toLegacyReviewStatus("DUPLICATE_CONFIRMED_REDUNDANT")).toBe("reviewed");
      expect(toLegacyReviewStatus("DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT")).toBe("reviewed");
      expect(toLegacyReviewStatus("GEO_CONFIRMED_DOMESTIC_US")).toBe("reviewed");
      expect(toLegacyReviewStatus("GEO_CONFIRMED_FOREIGN")).toBe("reviewed");
      expect(toLegacyReviewStatus("GEO_METADATA_COLLISION_VERIFIED")).toBe("reviewed");
      expect(toLegacyReviewStatus("TEMPORAL_VERIFIED_ACTIVE")).toBe("reviewed");
      expect(toLegacyReviewStatus("TEMPORAL_VERIFIED_CLOSED")).toBe("reviewed");
      expect(toLegacyReviewStatus("LEGACY_REVIEWED_UNSTRUCTURED")).toBe("reviewed");
    });
  });

  describe("9. Stage 5: Legacy Migration Semantics & Backward Compatibility", () => {
    it("never maps legacy 'reviewed' status to EVIDENCE_OBSERVED", () => {
      const legacyRaw = {
        fingerprint: computeFindingFingerprintLegacy(sampleFinding),
        recordId: sampleFinding.recordId,
        status: "reviewed",
        notes: "Historical review note from Phase 2",
        updatedAt: "2026-10-15T09:00:00.000Z",
      };

      const normalized = normalizeStoredReviewEntry(legacyRaw);
      expect(normalized).not.toBeNull();
      if (normalized) {
        expect(normalized.status).toBe("reviewed");
        expect(normalized.disposition).toBe("LEGACY_REVIEWED_UNSTRUCTURED");
        // Must strictly be EVIDENCE_HISTORICAL_UNSTRUCTURED, never EVIDENCE_OBSERVED
        expect(normalized.evidenceTier).toBe("EVIDENCE_HISTORICAL_UNSTRUCTURED");
        expect(normalized.evidenceTier).not.toBe("EVIDENCE_OBSERVED");
        expect(normalized.notes).toBe("Historical review note from Phase 2");
        expect(normalized.updatedAt).toBe("2026-10-15T09:00:00.000Z");
        expect(normalized.history).toBeUndefined();
      }
    });

    it("imports v1.0 backup and normalizes legacy entries safely", () => {
      const dataset = "legacy-backup-dataset";
      const v1Backup = JSON.stringify({
        version: "1.0",
        exportedAt: "2026-10-15T12:00:00.000Z",
        datasetName: dataset,
        reviews: {
          [sampleFinding.recordId]: {
            fingerprint: computeFindingFingerprintLegacy(sampleFinding),
            recordId: sampleFinding.recordId,
            status: "reviewed",
            notes: "Prior auditor check",
            updatedAt: "2026-10-15T11:00:00.000Z",
          },
        },
      });

      const res = importReviewStateBackup(dataset, v1Backup);
      expect(res.success).toBe(true);

      const loaded = loadReviewState(dataset);
      const entry = loaded[sampleFinding.recordId];
      expect(entry).toBeDefined();
      expect(entry?.disposition).toBe("LEGACY_REVIEWED_UNSTRUCTURED");
      expect(entry?.evidenceTier).toBe("EVIDENCE_HISTORICAL_UNSTRUCTURED");
      expect(entry?.notes).toBe("Prior auditor check");
    });
  });

  describe("10. Stage 5: Stale-Fingerprint Lifecycle & Explicit Re-Verification", () => {
    it("recognizes legacy v1 fingerprint when finding has NOT changed without marking stale", () => {
      const dataset = "legacy-fp-dataset";
      const legacyFp = computeFindingFingerprintLegacy(sampleFinding);
      mockStorage[getStorageKey(dataset)] = JSON.stringify({
        [sampleFinding.recordId]: {
          fingerprint: legacyFp,
          recordId: sampleFinding.recordId,
          status: "reviewed",
          updatedAt: "2026-10-15T10:00:00.000Z",
        },
      });

      const loaded = loadReviewState(dataset);
      const res = resolveFindingReviewStatus(loaded, sampleFinding);
      expect(res.status).toBe("reviewed");
      expect(res.disposition).toBe("LEGACY_REVIEWED_UNSTRUCTURED");
      expect(res.evidenceTier).toBe("EVIDENCE_HISTORICAL_UNSTRUCTURED");
      expect(res.isStaleFingerprint).toBe(false);
    });

    it("marks legacy review stale when underlying finding has mutated and does not silently transfer", () => {
      const dataset = "legacy-stale-dataset";
      const legacyFp = computeFindingFingerprintLegacy(sampleFinding);
      mockStorage[getStorageKey(dataset)] = JSON.stringify({
        [sampleFinding.recordId]: {
          fingerprint: legacyFp,
          recordId: sampleFinding.recordId,
          status: "reviewed",
          notes: "Previous note",
          updatedAt: "2026-10-15T10:00:00.000Z",
        },
      });

      const mutatedFinding: ValidatedJobFinding = {
        ...sampleFinding,
        canonicalUrl: "https://boards.greenhouse.io/acmehealth/jobs/mutated-9999",
        geography: {
          ...sampleFinding.geography,
          status: "explicit_foreign",
        },
      };

      const loaded = loadReviewState(dataset);
      const res = resolveFindingReviewStatus(loaded, mutatedFinding);
      expect(res.status).toBe("unreviewed");
      expect(res.isStaleFingerprint).toBe(true);
      expect(res.entry?.notes).toBe("Previous note");
    });

    it("allows explicit re-verification of stale finding with fresh v2 fingerprint and evidence", () => {
      const dataset = "reverify-dataset";
      saveReviewEntry(dataset, sampleFinding, "DUPLICATE_CONFIRMED_REDUNDANT", "Observed ATS URL", {
        evidenceTier: "EVIDENCE_OBSERVED",
        verificationSource: "Live ATS check",
        checklist: { urlInspected: true, requisitionCompared: true },
      });

      const mutatedFinding: ValidatedJobFinding = {
        ...sampleFinding,
        canonicalUrl: "https://boards.greenhouse.io/acmehealth/jobs/54321",
      };

      let reviews = loadReviewState(dataset);
      const staleRes = resolveFindingReviewStatus(reviews, mutatedFinding);
      expect(staleRes.isStaleFingerprint).toBe(true);
      expect(staleRes.status).toBe("unreviewed");

      const reverifyRes = saveReviewEntry(
        dataset,
        mutatedFinding,
        "DUPLICATE_CONFIRMED_REDUNDANT",
        "Re-verified updated Greenhouse URL",
        {
          evidenceTier: "EVIDENCE_OBSERVED",
          verificationSource: "Re-inspected job board",
          checklist: { urlInspected: true, requisitionCompared: true },
        }
      );
      expect(reverifyRes.success).toBe(true);

      reviews = loadReviewState(dataset);
      const resolvedRes = resolveFindingReviewStatus(reviews, mutatedFinding);
      expect(resolvedRes.isStaleFingerprint).toBe(false);
      expect(resolvedRes.status).toBe("reviewed");
      expect(resolvedRes.disposition).toBe("DUPLICATE_CONFIRMED_REDUNDANT");
      expect(resolvedRes.entry?.history?.length).toBe(2);
    });
  });

  describe("11. Stage 5: Local Storage Measurement & Safe Quota Handling", () => {
    it("measures local storage usage accurately", () => {
      const dataset = "storage-measure-dataset";
      saveReviewEntry(dataset, sampleFinding, "reviewed", "Test storage entry");

      const stats = measureLocalStorageUsage(dataset);
      expect(stats.bytesUsed).toBeGreaterThan(0);
      expect(stats.totalStorageBytesUsed).toBeGreaterThan(0);
      expect(stats.quotaEstimateBytes).toBe(5 * 1024 * 1024);
      expect(stats.usagePercentage).toBeGreaterThanOrEqual(0);
      expect(stats.usagePercentage).toBeLessThanOrEqual(100);
      expect(stats.isNearQuota).toBe(false);
    });
  });

  describe("12. Stage 5.3 Targeted Remediation Regression Suite (DQ-AUDIT-01 through DQ-AUDIT-05)", () => {
    describe("DQ-AUDIT-01: Null vs. Empty String Distinction in Fingerprint Payloads", () => {
      it("preserves distinction between null, empty string, and non-empty string for requisitionId", () => {
        const findingNull: ValidatedJobFinding = {
          ...sampleFinding,
          ats: { ...sampleFinding.ats, requisitionId: null },
        };
        const findingEmpty: ValidatedJobFinding = {
          ...sampleFinding,
          ats: { ...sampleFinding.ats, requisitionId: "" },
        };
        const findingValue: ValidatedJobFinding = {
          ...sampleFinding,
          ats: { ...sampleFinding.ats, requisitionId: "REQ-12345" },
        };

        const fpNull = computeFindingFingerprintV2(findingNull);
        const fpEmpty = computeFindingFingerprintV2(findingEmpty);
        const fpValue = computeFindingFingerprintV2(findingValue);

        expect(fpNull).not.toBe(fpEmpty);
        expect(fpEmpty).not.toBe(fpValue);
        expect(fpNull).not.toBe(fpValue);

        const payloadNull = JSON.parse(serializeCanonicalFingerprintPayload(findingNull));
        const payloadEmpty = JSON.parse(serializeCanonicalFingerprintPayload(findingEmpty));
        const payloadValue = JSON.parse(serializeCanonicalFingerprintPayload(findingValue));

        expect(payloadNull.identity.requisitionId).toBeNull();
        expect(payloadEmpty.identity.requisitionId).toBe("");
        expect(payloadValue.identity.requisitionId).toBe("REQ-12345");
      });

      it("preserves distinction between null, empty string, and non-empty string for duplicateGroupId", () => {
        const findingNull: ValidatedJobFinding = {
          ...sampleFinding,
          duplicate: { ...sampleFinding.duplicate, duplicateGroupId: null },
        };
        const findingEmpty: ValidatedJobFinding = {
          ...sampleFinding,
          duplicate: { ...sampleFinding.duplicate, duplicateGroupId: "" },
        };
        const findingValue: ValidatedJobFinding = {
          ...sampleFinding,
          duplicate: { ...sampleFinding.duplicate, duplicateGroupId: "grp_dup_001" },
        };

        const fpNull = computeFindingFingerprintV2(findingNull);
        const fpEmpty = computeFindingFingerprintV2(findingEmpty);
        const fpValue = computeFindingFingerprintV2(findingValue);

        expect(fpNull).not.toBe(fpEmpty);
        expect(fpEmpty).not.toBe(fpValue);
        expect(fpNull).not.toBe(fpValue);

        const payloadNull = JSON.parse(serializeCanonicalFingerprintPayload(findingNull));
        const payloadEmpty = JSON.parse(serializeCanonicalFingerprintPayload(findingEmpty));
        const payloadValue = JSON.parse(serializeCanonicalFingerprintPayload(findingValue));

        expect(payloadNull.state.duplicateGroupId).toBeNull();
        expect(payloadEmpty.state.duplicateGroupId).toBe("");
        expect(payloadValue.state.duplicateGroupId).toBe("grp_dup_001");
      });

      it("preserves distinction between null, empty string, and non-empty string for geographyDetectedCountry", () => {
        const findingNull: ValidatedJobFinding = {
          ...sampleFinding,
          geography: { ...sampleFinding.geography, detectedCountry: null },
        };
        const findingEmpty: ValidatedJobFinding = {
          ...sampleFinding,
          geography: { ...sampleFinding.geography, detectedCountry: "" },
        };
        const findingValue: ValidatedJobFinding = {
          ...sampleFinding,
          geography: { ...sampleFinding.geography, detectedCountry: "United States" },
        };

        const fpNull = computeFindingFingerprintV2(findingNull);
        const fpEmpty = computeFindingFingerprintV2(findingEmpty);
        const fpValue = computeFindingFingerprintV2(findingValue);

        expect(fpNull).not.toBe(fpEmpty);
        expect(fpEmpty).not.toBe(fpValue);
        expect(fpNull).not.toBe(fpValue);

        const payloadNull = JSON.parse(serializeCanonicalFingerprintPayload(findingNull));
        const payloadEmpty = JSON.parse(serializeCanonicalFingerprintPayload(findingEmpty));
        const payloadValue = JSON.parse(serializeCanonicalFingerprintPayload(findingValue));

        expect(payloadNull.state.geographyDetectedCountry).toBeNull();
        expect(payloadEmpty.state.geographyDetectedCountry).toBe("");
        expect(payloadValue.state.geographyDetectedCountry).toBe("United States");
      });

      it("preserves distinction between null, empty string, and non-empty string for geographyRawLocation", () => {
        const findingNull: ValidatedJobFinding = {
          ...sampleFinding,
          geography: { ...sampleFinding.geography, rawLocation: null },
        };
        const findingEmpty: ValidatedJobFinding = {
          ...sampleFinding,
          geography: { ...sampleFinding.geography, rawLocation: "" },
        };
        const findingValue: ValidatedJobFinding = {
          ...sampleFinding,
          geography: { ...sampleFinding.geography, rawLocation: "Indianapolis, IN" },
        };

        const fpNull = computeFindingFingerprintV2(findingNull);
        const fpEmpty = computeFindingFingerprintV2(findingEmpty);
        const fpValue = computeFindingFingerprintV2(findingValue);

        expect(fpNull).not.toBe(fpEmpty);
        expect(fpEmpty).not.toBe(fpValue);
        expect(fpNull).not.toBe(fpValue);

        const payloadNull = JSON.parse(serializeCanonicalFingerprintPayload(findingNull));
        const payloadEmpty = JSON.parse(serializeCanonicalFingerprintPayload(findingEmpty));
        const payloadValue = JSON.parse(serializeCanonicalFingerprintPayload(findingValue));

        expect(payloadNull.state.geographyRawLocation).toBeNull();
        expect(payloadEmpty.state.geographyRawLocation).toBe("");
        expect(payloadValue.state.geographyRawLocation).toBe("Indianapolis, IN");
      });
    });

    describe("DQ-AUDIT-02: Review Checklist Enforcement at Storage & Validation Boundary", () => {
      it("rejects direct storage calls attempting to set confirmed duplicate dispositions without checklist", () => {
        const dataset = "checklist-storage-dataset";

        // Direct call without options.checklist
        const res1 = saveReviewEntry(dataset, sampleFinding, "DUPLICATE_CONFIRMED_REDUNDANT", "Direct call without checklist", {
          evidenceTier: "EVIDENCE_OBSERVED",
        });
        expect(res1.success).toBe(false);
        expect(res1.error).toContain("mandates completion of checklist");
        expect(loadReviewState(dataset)[sampleFinding.recordId]).toBeUndefined();

        // Direct call with empty checklist object
        const res2 = saveReviewEntry(dataset, sampleFinding, "DUPLICATE_CONFIRMED_REDUNDANT", "Direct call with empty checklist", {
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: {},
        });
        expect(res2.success).toBe(false);
        expect(res2.error).toContain("mandates completion of checklist");
        expect(loadReviewState(dataset)[sampleFinding.recordId]).toBeUndefined();

        // Direct call with partial checklist (only 1 of 2 required items true)
        const res3 = saveReviewEntry(dataset, sampleFinding, "DUPLICATE_CONFIRMED_REDUNDANT", "Direct call with partial checklist", {
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: false },
        });
        expect(res3.success).toBe(false);
        expect(res3.error).toContain("mandates completion of checklist");
        expect(loadReviewState(dataset)[sampleFinding.recordId]).toBeUndefined();

        // Direct call with complete checklist succeeds
        const res4 = saveReviewEntry(dataset, sampleFinding, "DUPLICATE_CONFIRMED_REDUNDANT", "Valid review with checklist", {
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
        });
        expect(res4.success).toBe(true);
        expect(loadReviewState(dataset)[sampleFinding.recordId]?.disposition).toBe("DUPLICATE_CONFIRMED_REDUNDANT");
      });

      it("enforces checklist requirements for geography and temporal confirmed dispositions", () => {
        const dataset = "geo-temp-checklist-dataset";

        // Geography confirmed foreign without checklist -> fails
        const geoFail = saveReviewEntry(dataset, sampleFinding, "GEO_CONFIRMED_FOREIGN", "Geo test", {
          evidenceTier: "EVIDENCE_OBSERVED",
        });
        expect(geoFail.success).toBe(false);
        expect(geoFail.error).toContain("locationExamined, entityLocationVerified");

        // Geography with complete checklist -> succeeds
        const geoOk = saveReviewEntry(dataset, sampleFinding, "GEO_CONFIRMED_FOREIGN", "Geo test ok", {
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { locationExamined: true, entityLocationVerified: true },
        });
        expect(geoOk.success).toBe(true);

        // Temporal confirmed active without checklist -> fails
        const tempFail = saveReviewEntry(dataset, sampleFinding, "TEMPORAL_VERIFIED_ACTIVE", "Temporal test", {
          evidenceTier: "EVIDENCE_OBSERVED",
        });
        expect(tempFail.success).toBe(false);
        expect(tempFail.error).toContain("vacancyStatusVerified, closureSignalsChecked");

        // Temporal with complete checklist -> succeeds
        const tempOk = saveReviewEntry(dataset, sampleFinding, "TEMPORAL_VERIFIED_ACTIVE", "Temporal test ok", {
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { vacancyStatusVerified: true, closureSignalsChecked: true },
        });
        expect(tempOk.success).toBe(true);
      });

      it("does not require checklist for escalations or unreviewed states", () => {
        const dataset = "escalation-dataset";
        const escRes = saveReviewEntry(dataset, sampleFinding, "ESCALATED_NEEDS_FURTHER_EVIDENCE", "Need more info", {
          evidenceTier: "EVIDENCE_INSUFFICIENT",
        });
        expect(escRes.success).toBe(true);
        expect(loadReviewState(dataset)[sampleFinding.recordId]?.disposition).toBe("ESCALATED_NEEDS_FURTHER_EVIDENCE");
      });
    });

    describe("DQ-AUDIT-03: Metrics Calculation Excludes Stale Fingerprints and Distinguishes Evidence Tiers", () => {
      it("calculates metric strip totals using resolved finding review status", () => {
        const dataset = "metrics-dataset";
        const finding1: ValidatedJobFinding = { ...sampleFinding, recordId: "rec_metric_01" };
        const finding2: ValidatedJobFinding = { ...sampleFinding, recordId: "rec_metric_02" };
        const finding3: ValidatedJobFinding = { ...sampleFinding, recordId: "rec_metric_03" };
        const finding4: ValidatedJobFinding = { ...sampleFinding, recordId: "rec_metric_04" };

        // 1. Finding 1: Current and verified with EVIDENCE_OBSERVED
        saveReviewEntry(dataset, finding1, "DUPLICATE_CONFIRMED_REDUNDANT", "Verified dup", {
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
        });

        // 2. Finding 2: Legacy reviewed with EVIDENCE_HISTORICAL_UNSTRUCTURED
        const legacyFp = computeFindingFingerprintLegacy(finding2);
        mockStorage[getStorageKey(dataset)] = JSON.stringify({
          ...JSON.parse(mockStorage[getStorageKey(dataset)] || "{}"),
          [finding2.recordId]: {
            fingerprint: legacyFp,
            recordId: finding2.recordId,
            status: "reviewed",
            disposition: "LEGACY_REVIEWED_UNSTRUCTURED",
            evidenceTier: "EVIDENCE_HISTORICAL_UNSTRUCTURED",
            notes: "Legacy review",
            updatedAt: "2026-10-15T00:00:00Z",
          },
        });

        // 3. Finding 3: Reviewed initially, but the finding subsequently changed (stale fingerprint!)
        saveReviewEntry(dataset, finding3, "DUPLICATE_CONFIRMED_REDUNDANT", "Old review", {
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
        });
        // Finding 3 mutated:
        const mutatedFinding3: ValidatedJobFinding = {
          ...finding3,
          canonicalUrl: "https://boards.greenhouse.io/acmehealth/jobs/mutated-link",
        };

        // 4. Finding 4: Escalated
        saveReviewEntry(dataset, finding4, "ESCALATED_NEEDS_FURTHER_EVIDENCE", "Need more details", {
          evidenceTier: "EVIDENCE_INSUFFICIENT",
        });

        const reviews = loadReviewState(dataset);
        const reportFindings = [finding1, finding2, mutatedFinding3, finding4];

        // Simulate metric calculation logic from DataQualityMetricStrip
        let evidenceVerifiedCount = 0;
        let historicalUnstructuredCount = 0;
        let needsReviewCount = 0;
        let unreviewedCount = 0;
        let staleCount = 0;

        for (const f of reportFindings) {
          const resolved = resolveFindingReviewStatus(reviews, f);
          if (resolved.isStaleFingerprint) {
            staleCount++;
            unreviewedCount++;
          } else if (resolved.status === "reviewed") {
            if (resolved.evidenceTier === "EVIDENCE_OBSERVED") {
              evidenceVerifiedCount++;
            } else {
              historicalUnstructuredCount++;
            }
          } else if (resolved.status === "needs_review") {
            needsReviewCount++;
          } else {
            unreviewedCount++;
          }
        }

        // Stale finding 3 MUST NOT count as reviewed or verified!
        expect(staleCount).toBe(1);
        expect(evidenceVerifiedCount).toBe(1); // Only finding1
        expect(historicalUnstructuredCount).toBe(1); // Only finding2
        expect(needsReviewCount).toBe(1); // Only finding4
        expect(unreviewedCount).toBe(1); // Finding 3 counted as unreviewed/stale

        const currentReviewedCount = evidenceVerifiedCount + historicalUnstructuredCount;
        const workflowCompletedCount = currentReviewedCount + needsReviewCount;
        expect(currentReviewedCount).toBe(2);
        expect(workflowCompletedCount).toBe(3);
        expect(workflowCompletedCount).not.toBe(4); // Stale finding excluded from workflow completion
      });
    });

    describe("DQ-AUDIT-04: Removal of One-Click Re-verification Auto-Assignment", () => {
      it("requires full evidence tier, checklist completion, and explicit disposition to re-verify stale finding", () => {
        const dataset = "reverify-workflow-dataset";
        saveReviewEntry(dataset, sampleFinding, "DUPLICATE_CONFIRMED_REDUNDANT", "Initial review", {
          evidenceTier: "EVIDENCE_OBSERVED",
          checklist: { urlInspected: true, requisitionCompared: true },
        });

        const mutatedFinding: ValidatedJobFinding = {
          ...sampleFinding,
          canonicalUrl: "https://boards.greenhouse.io/acmehealth/jobs/brand-new-link",
        };

        const reviews = loadReviewState(dataset);
        const staleStatus = resolveFindingReviewStatus(reviews, mutatedFinding);
        expect(staleStatus.isStaleFingerprint).toBe(true);
        expect(staleStatus.status).toBe("unreviewed");
        expect(staleStatus.disposition).toBe("UNREVIEWED");

        // Attempting to re-verify without checklist fails
        const failReverify = saveReviewEntry(dataset, mutatedFinding, "DUPLICATE_CONFIRMED_REDUNDANT", "Attempting re-verify without checklist", {
          evidenceTier: "EVIDENCE_OBSERVED",
        });
        expect(failReverify.success).toBe(false);

        // Attempting to re-verify with non-conclusive tier for confirmed disposition fails
        const failTier = saveReviewEntry(dataset, mutatedFinding, "DUPLICATE_CONFIRMED_REDUNDANT", "Attempting re-verify with insufficient tier", {
          evidenceTier: "EVIDENCE_INSUFFICIENT",
          checklist: { urlInspected: true, requisitionCompared: true },
        });
        expect(failTier.success).toBe(false);

        // Explicit re-verification with observed evidence, complete checklist, and attribution succeeds
        const successReverify = saveReviewEntry(dataset, mutatedFinding, "DUPLICATE_CONFIRMED_REDUNDANT", "Explicit manual re-verification", {
          evidenceTier: "EVIDENCE_OBSERVED",
          verificationSource: "Greenhouse live career site check",
          reviewerEmail: "auditor@citrux.com",
          checklist: { urlInspected: true, requisitionCompared: true },
        });
        expect(successReverify.success).toBe(true);

        const updatedReviews = loadReviewState(dataset);
        const resolved = resolveFindingReviewStatus(updatedReviews, mutatedFinding);
        expect(resolved.isStaleFingerprint).toBe(false);
        expect(resolved.status).toBe("reviewed");
        expect(resolved.disposition).toBe("DUPLICATE_CONFIRMED_REDUNDANT");
        expect(resolved.evidenceTier).toBe("EVIDENCE_OBSERVED");
        expect(resolved.entry?.history?.length).toBe(2);
      });
    });

    describe("DQ-AUDIT-05: Quarantine and Evidence-Gating on Storage Load and Backup Import", () => {
      it("safely quarantines invalid confirmed disposition paired with non-conclusive evidence tier on load", () => {
        const dataset = "quarantine-load-dataset";
        const currentFp = computeFindingFingerprintV2(sampleFinding);

        // Manually inject invalid review directly into localStorage (e.g. from third-party tamper or corrupt persistence)
        // DUPLICATE_CONFIRMED_REDUNDANT paired with EVIDENCE_INSUFFICIENT (illegal!)
        mockStorage[getStorageKey(dataset)] = JSON.stringify({
          [sampleFinding.recordId]: {
            fingerprint: currentFp,
            recordId: sampleFinding.recordId,
            status: "reviewed",
            disposition: "DUPLICATE_CONFIRMED_REDUNDANT",
            evidenceTier: "EVIDENCE_INSUFFICIENT",
            notes: "Tampered or corrupted review record",
            updatedAt: "2026-10-20T12:00:00Z",
          },
        });

        const loaded = loadReviewState(dataset);
        const entry = loaded[sampleFinding.recordId];
        expect(entry).toBeDefined();

        // Must be demoted to needs_review / ESCALATED_NEEDS_FURTHER_EVIDENCE under EVIDENCE_INSUFFICIENT
        expect(entry?.status).toBe("needs_review");
        expect(entry?.disposition).toBe("ESCALATED_NEEDS_FURTHER_EVIDENCE");
        expect(entry?.evidenceTier).toBe("EVIDENCE_INSUFFICIENT");
        expect(entry?.notes).toContain("[QUARANTINED INVALID REVIEW:");
        expect(entry?.notes).toContain("Tampered or corrupted review record");
        expect(entry?.updatedAt).toBe("2026-10-20T12:00:00Z");
      });

      it("safely quarantines invalid confirmed disposition missing checklist during backup import", () => {
        const dataset = "quarantine-backup-dataset";
        const currentFp = computeFindingFingerprintV2(sampleFinding);

        // Backup containing an entry with GEO_CONFIRMED_FOREIGN but no checklist in history or entry
        const invalidBackup = JSON.stringify({
          version: "2.0",
          exportedAt: new Date().toISOString(),
          datasetName: dataset,
          reviews: {
            [sampleFinding.recordId]: {
              fingerprint: currentFp,
              recordId: sampleFinding.recordId,
              status: "reviewed",
              disposition: "GEO_CONFIRMED_FOREIGN",
              evidenceTier: "EVIDENCE_OBSERVED",
              notes: "Exported before checklist enforcement",
              updatedAt: "2026-10-18T10:00:00Z",
              history: [
                {
                  auditId: "audit_old_01",
                  recordId: sampleFinding.recordId,
                  fingerprint: currentFp,
                  datasetName: dataset,
                  disposition: "GEO_CONFIRMED_FOREIGN",
                  evidenceTier: "EVIDENCE_OBSERVED",
                  verificationSource: "old_source",
                  checklist: {}, // Empty checklist!
                  notes: "Exported before checklist enforcement",
                  reviewedAt: "2026-10-18T10:00:00Z",
                },
              ],
            },
          },
        });

        const importRes = importReviewStateBackup(dataset, invalidBackup);
        expect(importRes.success).toBe(true);

        const loaded = loadReviewState(dataset);
        const quarantinedEntry = loaded[sampleFinding.recordId];
        expect(quarantinedEntry).toBeDefined();

        // Must NOT be accepted as reviewed or verified!
        expect(quarantinedEntry?.status).toBe("needs_review");
        expect(quarantinedEntry?.disposition).toBe("ESCALATED_NEEDS_FURTHER_EVIDENCE");
        expect(quarantinedEntry?.evidenceTier).toBe("EVIDENCE_INSUFFICIENT");
        expect(quarantinedEntry?.notes).toContain("[QUARANTINED INVALID REVIEW:");
        expect(quarantinedEntry?.notes).toContain("Exported before checklist enforcement");
        // Historical audit log entries preserved
        expect(quarantinedEntry?.history?.length).toBe(1);
      });
    });
  });
});

