#!/usr/bin/env node
/**
 * OOS Data Quality & Intelligence — CLI Audit Runner
 *
 * Usage:
 *   npx tsx scripts/audit-freehire.ts [--input <path>] [--live-results <path>] [--output-dir <path>]
 *
 * Enforces frozen decisions:
 * - AI_MODE=offline
 * - DUPLICATE_MASTER_POLICY=none
 * - Non-destructive execution
 * - RFC 4180 CSV export with spreadsheet formula injection protection
 * - Comprehensive Markdown and JSON audit reporting
 */

import * as fs from "fs";
import * as path from "path";
import {
  exportActionableFindingsToCsv,
  exportAllFindingsToCsv,
  exportDuplicatesToCsv,
  exportGeographyToCsv,
  exportReportToJson,
  generateMarkdownAuditReport,
  runJobInventoryAudit,
  fullAuditReportSchema,
  type FreeHireRawJobRecord,
  type FullAuditReport,
  type LiveUrlCheckResult,
} from "../src/lib/data-quality";

interface CliArgs {
  inputPath: string;
  liveResultsPath: string | null;
  outputDir: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let inputPath = path.resolve(process.cwd(), "freehire-us-audit-1000.json");
  let outputDir = path.resolve(process.cwd(), "audit-reports");
  const defaultLiveResults = path.resolve(process.cwd(), "freehire-us-audit-50-results.json");
  let liveResultsPath: string | null = fs.existsSync(defaultLiveResults) ? defaultLiveResults : null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && i + 1 < args.length) {
      inputPath = path.resolve(process.cwd(), args[++i]!);
    } else if (arg === "--live-results" && i + 1 < args.length) {
      liveResultsPath = path.resolve(process.cwd(), args[++i]!);
    } else if (arg === "--output-dir" && i + 1 < args.length) {
      outputDir = path.resolve(process.cwd(), args[++i]!);
    } else if (arg === "--no-live-results") {
      liveResultsPath = null;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
OOS Data Quality & Intelligence CLI
Configuration: AI_MODE=offline | DUPLICATE_MASTER_POLICY=none

Options:
  --input <path>         Path to JSON dataset (raw feed or audit report) (default: ./freehire-us-audit-1000.json)
  --live-results <path>  Path to optional live check probe JSON (default: ./freehire-us-audit-50-results.json if present)
  --no-live-results      Disable loading live check probe results
  --output-dir <path>    Directory to save output reports (default: ./audit-reports)
  --help, -h             Show this help message
`);
      process.exit(0);
    }
  }

  return { inputPath, liveResultsPath, outputDir };
}

async function main() {
  const { inputPath, liveResultsPath, outputDir } = parseArgs();

  console.log("=================================================");
  console.log(" OOS DATA QUALITY & INTELLIGENCE — AUDIT RUNNER");
  console.log(" Configuration: AI_MODE=offline | DUPLICATE_MASTER_POLICY=none");
  console.log("=================================================");
  console.log(`Input dataset:        ${inputPath}`);
  console.log(`Live probe results:   ${liveResultsPath ? liveResultsPath : "None (strictly untested live)"}`);
  console.log(`Output directory:     ${outputDir}`);

  if (!fs.existsSync(inputPath)) {
    console.error(`\n[ERROR] Input file does not exist: ${inputPath}`);
    process.exit(1);
  }

  console.log("\nLoading and parsing dataset...");
  let rawJson: unknown;
  try {
    const rawContent = fs.readFileSync(inputPath, "utf-8");
    rawJson = JSON.parse(rawContent);
  } catch (err) {
    console.error(`\n[ERROR] Failed to read or parse input JSON:`, err);
    process.exit(1);
  }

  let liveResults: LiveUrlCheckResult[] | undefined;
  if (liveResultsPath && fs.existsSync(liveResultsPath)) {
    try {
      const probeContent = fs.readFileSync(liveResultsPath, "utf-8");
      liveResults = JSON.parse(probeContent) as LiveUrlCheckResult[];
      console.log(`Loaded ${liveResults.length} live URL check probe records.`);
    } catch (err) {
      console.warn(`[WARN] Could not parse live results file: ${err}`);
    }
  }

  let report: FullAuditReport;

  // Check if the input file is an already-completed FullAuditReport JSON
  const parsedAuditReport = fullAuditReportSchema.safeParse(rawJson);
  if (parsedAuditReport.success) {
    console.log("Detected pre-compiled audit report JSON.");
    report = parsedAuditReport.data as unknown as FullAuditReport;
  } else {
    // Treat as raw job records array
    let rawRecords: FreeHireRawJobRecord[] = [];
    if (Array.isArray(rawJson)) {
      rawRecords = rawJson as FreeHireRawJobRecord[];
    } else if (
      rawJson &&
      typeof rawJson === "object" &&
      "data" in rawJson &&
      Array.isArray((rawJson as { data: unknown[] }).data)
    ) {
      rawRecords = (rawJson as { data: FreeHireRawJobRecord[] }).data;
    } else if (
      rawJson &&
      typeof rawJson === "object" &&
      "jobs" in rawJson &&
      Array.isArray((rawJson as { jobs: unknown[] }).jobs)
    ) {
      rawRecords = (rawJson as { jobs: FreeHireRawJobRecord[] }).jobs;
    } else {
      console.error(
        "\n[ERROR] Unrecognized JSON format. Expected an array of job records or an object with a 'jobs' array or a FullAuditReport."
      );
      process.exit(1);
    }

    console.log(`\nFound ${rawRecords.length} records to audit. Executing quality audit across all dimensions...`);

    report = runJobInventoryAudit(rawRecords, {
      datasetName: path.basename(inputPath),
      liveResults,
    });
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create timestamped filenames
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `freehire-audit-report-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `freehire-audit-report-${timestamp}.md`);
  const actionableCsvPath = path.join(outputDir, `freehire-actionable-findings-${timestamp}.csv`);
  const duplicatesCsvPath = path.join(outputDir, `freehire-duplicates-${timestamp}.csv`);
  const geographyCsvPath = path.join(outputDir, `freehire-geography-${timestamp}.csv`);
  const allFindingsCsvPath = path.join(outputDir, `freehire-all-findings-${timestamp}.csv`);

  // Latest canonical pointers
  const latestJsonPath = path.join(outputDir, `freehire-audit-report-latest.json`);
  const latestMarkdownPath = path.join(outputDir, `freehire-audit-report-latest.md`);
  const latestActionableCsvPath = path.join(outputDir, `freehire-actionable-findings-latest.csv`);
  const latestDuplicatesCsvPath = path.join(outputDir, `freehire-duplicates-latest.csv`);
  const latestGeographyCsvPath = path.join(outputDir, `freehire-geography-latest.csv`);
  const latestAllFindingsCsvPath = path.join(outputDir, `freehire-all-findings-latest.csv`);

  console.log("\nExporting audit artifacts...");

  // 1. JSON Report
  const jsonContent = exportReportToJson(report);
  fs.writeFileSync(jsonPath, jsonContent, "utf-8");
  fs.writeFileSync(latestJsonPath, jsonContent, "utf-8");

  // 2. Human-Readable Markdown Report
  const markdownContent = generateMarkdownAuditReport(report);
  fs.writeFileSync(markdownPath, markdownContent, "utf-8");
  fs.writeFileSync(latestMarkdownPath, markdownContent, "utf-8");

  // 3. Actionable Findings CSV
  const actionableCsv = exportActionableFindingsToCsv(report.findings);
  fs.writeFileSync(actionableCsvPath, actionableCsv, "utf-8");
  fs.writeFileSync(latestActionableCsvPath, actionableCsv, "utf-8");

  // 4. Duplicate Candidates CSV
  const duplicatesCsv = exportDuplicatesToCsv(report.findings);
  fs.writeFileSync(duplicatesCsvPath, duplicatesCsv, "utf-8");
  fs.writeFileSync(latestDuplicatesCsvPath, duplicatesCsv, "utf-8");

  // 5. Geography CSV
  const geographyCsv = exportGeographyToCsv(report.findings);
  fs.writeFileSync(geographyCsvPath, geographyCsv, "utf-8");
  fs.writeFileSync(latestGeographyCsvPath, geographyCsv, "utf-8");

  // 6. All Findings CSV
  const allFindingsCsv = exportAllFindingsToCsv(report.findings);
  fs.writeFileSync(allFindingsCsvPath, allFindingsCsv, "utf-8");
  fs.writeFileSync(latestAllFindingsCsvPath, allFindingsCsv, "utf-8");

  // Output summary to console
  const s = report.summary;
  console.log("\n---------------- AUDIT SUMMARY ------------------");
  console.log(`Total Records Audited:         ${s.totalRecordsAudited}`);
  console.log(`AI Invocations:                ${s.aiReview.offlineInvocations} (AI_MODE=offline enforced)`);
  console.log(`Duplicate Master Selection:    ${s.duplicatePolicy} (no records merged or deleted)`);
  console.log("\n[SEVERITY BREAKDOWN]");
  if (s.severityCounts) {
    console.log(`- Critical:                     ${s.severityCounts.critical}`);
    console.log(`- High:                         ${s.severityCounts.high}`);
    console.log(`- Medium:                       ${s.severityCounts.medium}`);
    console.log(`- Low:                          ${s.severityCounts.low}`);
    console.log(`- Informational:                ${s.severityCounts.informational}`);
  }
  console.log("\n[DUPLICATE CANDIDATES]");
  console.log(`- Exact ATS URL Duplicate Groups:   ${s.duplicates.exactAtsUrlGroups}`);
  console.log(`- Total Duplicate Candidate Rows:   ${s.duplicates.totalDuplicateCandidateRecords}`);
  console.log(`- Distinct Same-Role Clusters:      ${s.duplicates.distinctSameRoleGroups} (distinct vacancies preserved)`);
  console.log("\n[GEOGRAPHIC INTEGRITY]");
  console.log(`- Valid US Locations:               ${s.geography.validUs}`);
  console.log(`- Explicit Foreign Locations:       ${s.geography.explicitForeign}`);
  console.log(`- Metadata Discrepancies:           ${s.geography.metadataDiscrepancy} (US location with scraper ISO code)`);
  console.log(`- Missing Locations:                ${s.geography.missingLocation}`);
  console.log(`- Ambiguous Locations:              ${s.geography.ambiguous}`);
  console.log("\n[FRESHNESS SIGNALS]");
  console.log(`- Ingestion Batch Timestamps:       ${s.freshness.suspectedIngestionBatchTimestamps} (batch ingestion evidence)`);
  console.log(`- Closure Phrases Detected:         ${s.freshness.closureDetected}`);
  console.log(`- Unknown Vacancy Status:           ${s.freshness.unknownVacancyStatus}`);
  if (s.urlQuality) {
    console.log("\n[APPLICATION URL QUALITY]");
    console.log(`- Valid Syntax:                     ${s.urlQuality.validSyntax}`);
    console.log(`- Live Probe Tested:                ${s.urlQuality.liveTested}`);
    console.log(`- HTTP 200 Reachable:               ${s.urlQuality.reachable}`);
    console.log(`- In-Page Closure Confirmed:        ${s.urlQuality.closureDetected}`);
    console.log(`- Untested Live URLs:               ${s.urlQuality.untested}`);
  }
  console.log("\n---------------- ARTIFACTS SAVED ----------------");
  console.log(`JSON Report:           ${jsonPath}`);
  console.log(`Markdown Report:       ${markdownPath}`);
  console.log(`Actionable CSV:        ${actionableCsvPath}`);
  console.log(`Duplicates CSV:        ${duplicatesCsvPath}`);
  console.log(`Geography CSV:         ${geographyCsvPath}`);
  console.log(`All Findings CSV:      ${allFindingsCsvPath}`);
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error("\n[FATAL] CLI execution failed:", err);
  process.exit(1);
});
