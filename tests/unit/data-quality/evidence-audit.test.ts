import { describe, expect, it } from "vitest";
import {
  classifyRecordEvidence,
  evaluateSourceQuality,
  evaluateUrlQuality,
  exportActionableFindingsToCsv,
  fullAuditReportSchema,
  generateMarkdownAuditReport,
  normalizeRecord,
  runJobInventoryAudit,
  validateGeography,
  validateUrlSyntax,
  type FreeHireRawJobRecord,
  type LiveUrlCheckResult,
} from "@/lib/data-quality";

describe("OOS Data Quality & Intelligence — Evidence & Audit Extensions", () => {
  const baseRawJob: FreeHireRawJobRecord = {
    public_slug: "test-software-engineer-acme-123",
    source: "taleo",
    external_id: "acme:REQ-100",
    url: "https://acme.taleo.net/jobdetail.ftl?job=REQ-100&utm_source=freehire.me",
    title: "Software Engineer",
    company: "Acme Corp",
    location: "Austin, TX",
    description: "Build distributed software systems in a collaborative team.",
    countries: ["us"],
    posted_at: "2026-10-20T12:00:00Z",
    created_at: "2026-10-20T12:00:00Z",
    updated_at: "2026-10-20T12:00:00Z",
  };

  describe("1. Dimension D: Source and Ingestion Quality Rules", () => {
    it("flags healthy records with all core fields as healthy with high reliability", () => {
      const norm = normalizeRecord(baseRawJob, 0);
      const res = evaluateSourceQuality(baseRawJob, norm);

      expect(res.status).toBe("anomalous_ingestion"); // because posted_at == created_at == updated_at
      expect(res.missingFields).toHaveLength(0);
      expect(res.malformedFields).toHaveLength(0);
      expect(res.sourceReliability).toBe("high");
    });

    it("detects missing location and flags missing_required_fields", () => {
      const raw = { ...baseRawJob, location: null };
      const norm = normalizeRecord(raw, 0);
      const res = evaluateSourceQuality(raw, norm);

      expect(res.status).toBe("missing_required_fields");
      expect(res.missingFields).toContain("location");
    });

    it("detects malformed URL syntax and flags malformed_record", () => {
      const raw = { ...baseRawJob, url: "not-a-valid-url" };
      const norm = normalizeRecord(raw, 0);
      const res = evaluateSourceQuality(raw, norm);

      expect(res.status).toBe("malformed_record");
      expect(res.malformedFields).toContain("url_syntax");
    });

    it("downgrades source reliability for unverified or missing providers", () => {
      const raw = { ...baseRawJob, source: "unknown_scraper" };
      const norm = normalizeRecord(raw, 0);
      const res = evaluateSourceQuality(raw, norm);

      expect(res.sourceReliability).toBe("moderate");
    });
  });

  describe("2. Dimension E: Application URL Quality & Live Probe Integration", () => {
    it("validates RFC 3986 URL syntax properly", () => {
      expect(validateUrlSyntax("https://example.com/jobs/1").isValid).toBe(true);
      expect(validateUrlSyntax("http://example.com").isValid).toBe(true);
      expect(validateUrlSyntax("javascript:alert(1)").isValid).toBe(false);
      expect(validateUrlSyntax("").isValid).toBe(false);
      expect(validateUrlSyntax("ftp://invalid.com").isValid).toBe(false);
    });

    it("strictly leaves liveCheckStatus as 'untested' if no probe result is provided", () => {
      const norm = normalizeRecord(baseRawJob, 0);
      const res = evaluateUrlQuality(norm, null);

      expect(res.status).toBe("valid_syntax");
      expect(res.syntaxValid).toBe(true);
      expect(res.liveCheckStatus).toBe("untested");
      expect(res.httpStatus).toBeNull();
      expect(res.notes).toContain("untested");
    });

    it("records reachable HTTP 200 outcome when live probe result is supplied", () => {
      const norm = normalizeRecord(baseRawJob, 0);
      const live: LiveUrlCheckResult = {
        url: baseRawJob.url,
        http: 200,
        title_match: 0.95,
        closure: [],
        error: null,
      };

      const res = evaluateUrlQuality(norm, live);
      expect(res.liveCheckStatus).toBe("reachable");
      expect(res.httpStatus).toBe(200);
      expect(res.titleMatchScore).toBe(0.95);
      expect(res.closureSignals).toHaveLength(0);
    });

    it("records explicit closure text detected on live reachable page", () => {
      const norm = normalizeRecord(baseRawJob, 0);
      const live: LiveUrlCheckResult = {
        url: baseRawJob.url,
        http: 200,
        title_match: 0.2,
        closure: ["job is no longer available"],
        error: null,
      };

      const res = evaluateUrlQuality(norm, live);
      expect(res.liveCheckStatus).toBe("reachable");
      expect(res.closureSignals).toContain("job is no longer available");
      expect(res.notes).toContain("job is no longer available");
    });

    it("classifies connection timeout as connection_error", () => {
      const norm = normalizeRecord(baseRawJob, 0);
      const live: LiveUrlCheckResult = {
        url: baseRawJob.url,
        http: null,
        error: "ConnectTimeoutError: Connection timed out after 15s",
      };

      const res = evaluateUrlQuality(norm, live);
      expect(res.liveCheckStatus).toBe("connection_error");
    });
  });

  describe("3. Evidence and Severity Taxonomy", () => {
    it("assigns Critical severity to confirmed explicit foreign jobs in US feed", () => {
      const foreignJob: FreeHireRawJobRecord = {
        ...baseRawJob,
        location: "Vancouver, BC, Canada",
        countries: ["us"],
      };
      const report = runJobInventoryAudit([foreignJob], { datasetName: "test" });
      const finding = report.findings[0]!;

      expect(finding.geography.status).toBe("explicit_foreign");
      expect(finding.severity).toBe("Critical");
      expect(finding.findingCategory).toBe("confirmed_finding");
      expect(finding.evidenceItems?.some((e) => e.dimension === "geographic_quality")).toBe(true);
    });

    it("assigns Critical severity to live-confirmed closed positions", () => {
      const liveCheck: LiveUrlCheckResult = {
        url: baseRawJob.url,
        http: 200,
        closure: ["position has been filled"],
        error: null,
      };

      const report = runJobInventoryAudit([baseRawJob], {
        datasetName: "test",
        liveResults: [liveCheck],
      });
      const finding = report.findings[0]!;

      expect(finding.freshness.status).toBe("closure_detected");
      expect(finding.severity).toBe("Critical");
      expect(finding.findingCategory).toBe("confirmed_finding");
    });

    it("assigns High severity to exact canonical ATS URL duplicates", () => {
      const job1 = { ...baseRawJob, external_id: "ext-1" };
      const job2 = { ...baseRawJob, external_id: "ext-2" };

      const report = runJobInventoryAudit([job1, job2], { datasetName: "dup-test" });

      expect(report.summary.duplicates.exactAtsUrlGroups).toBe(1);
      expect(report.summary.duplicates.totalDuplicateCandidateRecords).toBe(2);
      expect(report.findings[0]!.severity).toBe("High");
      expect(report.findings[0]!.duplicate.isDuplicateCandidate).toBe(true);
    });

    it("assigns Informational severity to same-role distinct headcount clusters", () => {
      const role1: FreeHireRawJobRecord = {
        ...baseRawJob,
        url: "https://tenet.taleo.net/jobdetail.ftl?job=REQ-A",
        title: "Registered Nurse - ICU",
        company: "Tenet Healthcare",
        location: "Detroit, MI",
      };
      const role2: FreeHireRawJobRecord = {
        ...baseRawJob,
        url: "https://tenet.taleo.net/jobdetail.ftl?job=REQ-B",
        title: "Registered Nurse - ICU",
        company: "Tenet Healthcare",
        location: "Detroit, MI",
      };

      const report = runJobInventoryAudit([role1, role2], { datasetName: "cluster-test" });

      expect(report.summary.duplicates.distinctSameRoleGroups).toBe(1);
      expect(report.summary.duplicates.totalDuplicateCandidateRecords).toBe(0); // NOT marked duplicates!
      expect(report.findings[0]!.duplicate.reasonCode).toBe("SIMILAR_ROLE_DISTINCT_REQUISITION");
      expect(report.findings[0]!.duplicate.isDuplicateCandidate).toBe(false);
    });
  });

  describe("4. Report Generation & Export Integrity", () => {
    it("generates valid human-readable Markdown report with all required sections", () => {
      const report = runJobInventoryAudit([baseRawJob], { datasetName: "markdown-test" });
      const md = generateMarkdownAuditReport(report);

      expect(md).toContain("# FreeHire Data Quality & Evidence-Based Audit Report");
      expect(md).toContain("## 1. Executive Summary");
      expect(md).toContain("## 2. Severity and Finding Category Breakdown");
      expect(md).toContain("## 3. Duplicate Detection Summary");
      expect(md).toContain("## 4. Geographic Quality Summary");
      expect(md).toContain("## 5. Freshness and Vacancy-Status Summary");
      expect(md).toContain("## 6. Source and Ingestion Quality Summary");
      expect(md).toContain("## 7. Application URL Quality Summary");
      expect(md).toContain("## 8. Representative Evidence for Flagged Findings");
      expect(md).toContain("## 9. Recommended Remediation Priorities");
      expect(md).toContain("## 10. Audit Limitations and Unverified Assumptions");
    });

    it("exports actionable findings CSV with formula injection protection", () => {
      const maliciousJob: FreeHireRawJobRecord = {
        ...baseRawJob,
        title: "=CMD|' /C calc'!A0",
        company: "@DDE('calc')",
        location: "+12345",
      };

      const report = runJobInventoryAudit([maliciousJob], { datasetName: "csv-test" });
      const csv = exportActionableFindingsToCsv(report.findings);

      expect(csv).toContain("finding_id,record_id,severity,category");
      // Check that spreadsheet formula injection is neutralized with leading quote
      expect(csv).toContain("'=CMD");
      expect(csv).toContain("'@DDE");
      expect(csv).toContain("'+12345");
    });

    it("validates generated report against fullAuditReportSchema", () => {
      const report = runJobInventoryAudit([baseRawJob], { datasetName: "schema-test" });
      const parseResult = fullAuditReportSchema.safeParse(report);

      expect(parseResult.success).toBe(true);
    });
  });

  describe("5. Edge Cases & Resilience", () => {
    it("handles empty findings gracefully without throwing", () => {
      const report = runJobInventoryAudit([], { datasetName: "empty-test" });
      expect(report.summary.totalRecordsAudited).toBe(0);
      expect(report.findings).toHaveLength(0);

      const md = generateMarkdownAuditReport(report);
      expect(md).toContain("Total Records Audited:** `0`");

      const csv = exportActionableFindingsToCsv(report.findings);
      expect(csv).toBe("finding_id,record_id,severity,category,dimension,company,title,location,ats_provider,ats_requisition_id,reason_flagged,observed_evidence,recommended_action,verification_status,canonical_url,raw_url");
    });

    it("preserves unsupported extension fields in registry", () => {
      const customJob = {
        ...baseRawJob,
        extra_custom_score: 99,
        nested_metadata: { flags: ["beta"] },
      };

      const report = runJobInventoryAudit([customJob], { datasetName: "unsupported-test" });
      expect(report.summary.unsupportedFieldsObserved).toContain("extra_custom_score");
      expect(report.summary.unsupportedFieldsObserved).toContain("nested_metadata");
      expect(report.findings[0]!.unsupportedFieldsPresent).toContain("extra_custom_score");
    });
  });
});
