#!/usr/bin/env node
/**
 * OOS Data Quality & Intelligence — CLI Audit Runner
 *
 * Usage:
 *   npx tsx scripts/audit-freehire.ts [--input <path>] [--output-dir <path>]
 *
 * Enforces frozen decisions:
 * - AI_MODE=offline
 * - DUPLICATE_MASTER_POLICY=none
 * - Non-destructive execution
 */

import * as fs from "fs";
import * as path from "path";
import {
  exportAllFindingsToCsv,
  exportDuplicatesToCsv,
  exportGeographyToCsv,
  exportReportToJson,
  runJobInventoryAudit,
  type FreeHireRawJobRecord,
} from "../src/lib/data-quality";

interface CliArgs {
  inputPath: string;
  outputDir: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let inputPath = path.resolve(process.cwd(), "freehire-us-audit-1000.json");
  let outputDir = path.resolve(process.cwd(), "audit-reports");

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && i + 1 < args.length) {
      inputPath = path.resolve(process.cwd(), args[++i]!);
    } else if (arg === "--output-dir" && i + 1 < args.length) {
      outputDir = path.resolve(process.cwd(), args[++i]!);
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
OOS Data Quality & Intelligence CLI (Phase 1)
Frozen Configuration: AI_MODE=offline, DUPLICATE_MASTER_POLICY=none

Options:
  --input <path>       Path to JSON dataset (default: ./freehire-us-audit-1000.json)
  --output-dir <path>  Directory to save output reports (default: ./audit-reports)
  --help, -h           Show this help message
`);
      process.exit(0);
    }
  }

  return { inputPath, outputDir };
}

async function main() {
  const { inputPath, outputDir } = parseArgs();

  console.log("=================================================");
  console.log(" OOS DATA QUALITY & INTELLIGENCE — AUDIT RUNNER");
  console.log(" Configuration: AI_MODE=offline | DUPLICATE_MASTER_POLICY=none");
  console.log("=================================================");
  console.log(`Input dataset:  ${inputPath}`);
  console.log(`Output directory: ${outputDir}`);

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
    console.error(`\n[ERROR] Failed to read or parse input JSON: ${err}`);
    process.exit(1);
  }

  let rawRecords: FreeHireRawJobRecord[] = [];
  if (Array.isArray(rawJson)) {
    rawRecords = rawJson as FreeHireRawJobRecord[];
  } else if (
    rawJson &&
    typeof rawJson === "object" &&
    "data" in rawJson &&
    Array.isArray((rawJson as { data: unknown }).data)
  ) {
    rawRecords = (rawJson as { data: FreeHireRawJobRecord[] }).data;
  } else {
    console.error(
      "\n[ERROR] Unrecognized JSON format. Expected array or object with 'data' array."
    );
    process.exit(1);
  }

  console.log(`Found ${rawRecords.length} records. Executing quality audit...`);

  const report = runJobInventoryAudit(rawRecords, {
    datasetName: path.basename(inputPath),
  });

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create timestamped filenames to prevent silent overwriting
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `freehire-audit-report-${timestamp}.json`);
  const duplicatesCsvPath = path.join(outputDir, `freehire-duplicates-${timestamp}.csv`);
  const geographyCsvPath = path.join(outputDir, `freehire-geography-${timestamp}.csv`);
  const allFindingsCsvPath = path.join(outputDir, `freehire-all-findings-${timestamp}.csv`);

  // Also maintain deterministic latest symlinks / standard copies for convenience
  const latestJsonPath = path.join(outputDir, "freehire-audit-report-latest.json");
  const latestDuplicatesCsvPath = path.join(outputDir, "freehire-duplicates-latest.csv");

  console.log("\nExporting audit artifacts...");
  const jsonContent = exportReportToJson(report);
  fs.writeFileSync(jsonPath, jsonContent, "utf-8");
  fs.writeFileSync(latestJsonPath, jsonContent, "utf-8");

  const duplicatesCsv = exportDuplicatesToCsv(report.findings);
  fs.writeFileSync(duplicatesCsvPath, duplicatesCsv, "utf-8");
  fs.writeFileSync(latestDuplicatesCsvPath, duplicatesCsv, "utf-8");

  const geographyCsv = exportGeographyToCsv(report.findings);
  fs.writeFileSync(geographyCsvPath, geographyCsv, "utf-8");

  const allFindingsCsv = exportAllFindingsToCsv(report.findings);
  fs.writeFileSync(allFindingsCsvPath, allFindingsCsv, "utf-8");

  // Output summary to console
  const s = report.summary;
  console.log("\n---------------- AUDIT SUMMARY ------------------");
  console.log(`Total Records Audited:         ${s.totalRecordsAudited}`);
  console.log(`AI Invocations:                ${s.aiReview.offlineInvocations} (AI_MODE=offline enforced)`);
  console.log(`Duplicate Master Selection:    ${s.duplicatePolicy} (no records merged or deleted)`);
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
  console.log("\n[HUMAN REVIEW]");
  console.log(`- Records Flagged For Review:       ${s.aiReview.recordsNeedingHumanReview}`);
  console.log("\n---------------- ARTIFACTS SAVED ----------------");
  console.log(`JSON Report:       ${jsonPath}`);
  console.log(`Duplicates CSV:    ${duplicatesCsvPath}`);
  console.log(`Geography CSV:     ${geographyCsvPath}`);
  console.log(`All Findings CSV:  ${allFindingsCsvPath}`);
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error("\n[FATAL] CLI execution failed:", err);
  process.exit(1);
});
