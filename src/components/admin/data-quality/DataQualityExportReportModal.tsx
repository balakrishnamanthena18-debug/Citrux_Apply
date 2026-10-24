"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Download,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  AlertCircle,
  HelpCircle,
  Info,
} from "lucide-react";
import type { ValidatedAuditReport } from "@/lib/data-quality/dashboard-schema";
import type { ReviewStateMap } from "./review-state-store";
import {
  reconcileFindingsWithReviews,
  exportReconciledJsonReport,
  exportReconciledCsvReport,
  exportOrphanedReviewsCsv,
} from "@/lib/data-quality/reconciled-reporter";
import type { ReconciledAuditReportJson } from "@/lib/data-quality/reconciled-reporter-types";

/**
 * Sanitizes a dataset name and generates a safe, filesystem-compliant export filename.
 * Strips path traversal, slashes, control characters, and unsafe symbols.
 */
export function sanitizeExportFilename(
  datasetName: string,
  extension: "json" | "csv",
  prefix = "reconciled-audit",
  timestamp?: string
): string {
  const cleanDataset =
    datasetName
      .replace(/\.\./g, "")
      .replace(/[/\\?%*:|"<>]/g, "_")
      .replace(/[\u0000-\u001F\s]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "audit";
  const ts = timestamp || new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${cleanDataset}-${ts}.${extension}`;
}

/**
 * Triggers a browser-side file download via Blob URL without server calls.
 * Cleans up DOM links and revokes temporary object URLs immediately after click.
 */
export function triggerBrowserBlobDownload(
  content: string,
  filename: string,
  mimeType: string
) {
  if (typeof window === "undefined" || !window.document) return;
  const doc = window.document;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = filename;
  doc.body.appendChild(link);
  link.click();
  doc.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface DataQualityExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ValidatedAuditReport | null;
  reviews: ReviewStateMap;
}

export function DataQualityExportReportModal({
  isOpen,
  onClose,
  report,
  reviews,
}: DataQualityExportReportModalProps) {
  const [includeOrphansInCsv, setIncludeOrphansInCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportMessage, setLastExportMessage] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Compute reconciled report summary dynamically with fail-closed dataset identity
  const reconciliationResult = useMemo(() => {
    if (!report) return null;
    try {
      const datasetName = report.summary.datasetName;
      if (!datasetName || !datasetName.trim()) {
        return {
          success: false as const,
          error: "Missing active dataset identity on loaded audit report.",
        };
      }

      const reconciled = reconcileFindingsWithReviews(report, reviews, {
        reviewDatasetName: datasetName,
      });

      return {
        success: true as const,
        reconciled,
      };
    } catch (err) {
      return {
        success: false as const,
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during report reconciliation.",
      };
    }
  }, [report, reviews]);

  if (!isOpen || !report) return null;

  const datasetName = report.summary.datasetName;
  const isReconciledReady = reconciliationResult?.success === true;
  const reconciledData: ReconciledAuditReportJson | undefined =
    reconciliationResult?.success ? reconciliationResult.reconciled : undefined;

  const orphanCount =
    reconciledData?.summary.reconciliationBreakdown.orphanedReviews ?? 0;

  const handleDownloadJson = () => {
    setExportError(null);
    setLastExportMessage(null);
    try {
      const jsonStr = exportReconciledJsonReport(report, reviews, {
        reviewDatasetName: datasetName,
      });
      const filename = sanitizeExportFilename(datasetName, "json");
      triggerBrowserBlobDownload(jsonStr, filename, "application/json");
      setLastExportMessage(`Successfully exported JSON: ${filename}`);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to export JSON report."
      );
    }
  };

  const handleDownloadCsv = () => {
    if (!reconciledData) return;
    setExportError(null);
    setLastExportMessage(null);
    try {
      const csvStr = exportReconciledCsvReport(reconciledData, {
        includeOrphanedReviews: includeOrphansInCsv,
        includeBom: true,
        lineEnding: "\r\n",
      });
      const filename = sanitizeExportFilename(datasetName, "csv");
      triggerBrowserBlobDownload(
        csvStr,
        filename,
        "text/csv;charset=utf-8;"
      );
      setLastExportMessage(
        `Successfully exported CSV: ${filename}${
          includeOrphansInCsv ? " (including orphaned reviews)" : ""
        }`
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to export CSV report."
      );
    }
  };

  const handleDownloadOrphansCsv = () => {
    if (!reconciledData || orphanCount === 0) return;
    setExportError(null);
    setLastExportMessage(null);
    try {
      const orphanCsv = exportOrphanedReviewsCsv(
        reconciledData.orphanedReviews,
        {
          includeBom: true,
          lineEnding: "\r\n",
        }
      );
      const filename = sanitizeExportFilename(
        datasetName,
        "csv",
        "orphaned-reviews"
      );
      triggerBrowserBlobDownload(
        orphanCsv,
        filename,
        "text/csv;charset=utf-8;"
      );
      setLastExportMessage(`Successfully exported Orphan CSV: ${filename}`);
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : "Failed to export orphaned reviews CSV."
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-report-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="export-report-modal-title"
                className="text-base font-semibold text-slate-900"
              >
                Export Reconciled Audit Report
              </h2>
              <p className="text-xs text-slate-500">
                Reconcile automated findings with verified review decisions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            aria-label="Close export dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Active Dataset Identity Banner */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Active Dataset Identity
              </span>
              <span
                data-testid="active-dataset-name"
                className="font-mono text-xs font-bold text-slate-800 break-all"
              >
                {datasetName}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-semibold border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Exact Match Enforced</span>
            </div>
          </div>

          {/* Reconciliation Error Banner */}
          {!isReconciledReady && (
            <div
              data-testid="reconciliation-error-alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">
                  Reconciliation Failed (Fail-Closed)
                </span>
                <span>{reconciliationResult?.error}</span>
              </div>
            </div>
          )}

          {/* Export Error Banner */}
          {exportError && (
            <div
              data-testid="export-error-alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Export Error</span>
                <span>{exportError}</span>
              </div>
            </div>
          )}

          {/* Export Success Banner */}
          {lastExportMessage && (
            <div
              data-testid="export-success-alert"
              className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">{lastExportMessage}</span>
            </div>
          )}

          {/* Reconciled Summary Breakdown */}
          {isReconciledReady && reconciledData && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">
                  Reconciled Audit Summary
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Schema v{reconciledData.schemaVersion}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {/* Findings Denominator */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                    Audited Findings
                  </span>
                  <span
                    data-testid="summary-total-findings"
                    className="text-lg font-bold text-slate-900"
                  >
                    {reconciledData.summary.totalFindingsInReport}
                  </span>
                </div>

                {/* Evidence Verified */}
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold block">
                    Verified Outcomes
                  </span>
                  <span
                    data-testid="summary-verified"
                    className="text-lg font-bold text-emerald-800"
                  >
                    {
                      reconciledData.summary.reconciliationBreakdown
                        .evidenceVerified
                    }
                  </span>
                </div>

                {/* Unreviewed Findings */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                    Unreviewed
                  </span>
                  <span
                    data-testid="summary-unreviewed"
                    className="text-lg font-bold text-slate-800"
                  >
                    {reconciledData.summary.reconciliationBreakdown.unreviewed}
                  </span>
                </div>

                {/* Escalated Reviews */}
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                  <span className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold block">
                    Escalated
                  </span>
                  <span
                    data-testid="summary-escalated"
                    className="text-lg font-bold text-amber-800"
                  >
                    {
                      reconciledData.summary.reconciliationBreakdown
                        .escalatedNeedsEvidence
                    }
                  </span>
                </div>

                {/* Stale Reviews */}
                <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200">
                  <span className="text-[10px] uppercase tracking-wider text-purple-700 font-semibold block">
                    Stale Reviews
                  </span>
                  <span
                    data-testid="summary-stale"
                    className="text-lg font-bold text-purple-800"
                  >
                    {reconciledData.summary.reconciliationBreakdown.staleReview}
                  </span>
                </div>

                {/* Legacy Reviews */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                    Legacy Reviews
                  </span>
                  <span
                    data-testid="summary-legacy"
                    className="text-lg font-bold text-slate-700"
                  >
                    {
                      reconciledData.summary.reconciliationBreakdown
                        .legacyUnstructured
                    }
                  </span>
                </div>

                {/* Quarantined Invalid */}
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200">
                  <span className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold block">
                    Quarantined
                  </span>
                  <span
                    data-testid="summary-quarantined"
                    className="text-lg font-bold text-rose-800"
                  >
                    {
                      reconciledData.summary.reconciliationBreakdown
                        .quarantinedInvalid
                    }
                  </span>
                </div>

                {/* Orphaned Reviews */}
                <div
                  className={`p-2.5 rounded-lg border ${
                    orphanCount > 0
                      ? "bg-purple-50 border-purple-300"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <span
                    className={`text-[10px] uppercase tracking-wider font-semibold block ${
                      orphanCount > 0 ? "text-purple-700" : "text-slate-500"
                    }`}
                  >
                    Orphaned Reviews
                  </span>
                  <span
                    data-testid="summary-orphans"
                    className={`text-lg font-bold ${
                      orphanCount > 0 ? "text-purple-900" : "text-slate-800"
                    }`}
                  >
                    {orphanCount}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Orphan Notice Card if orphans exist */}
          {orphanCount > 0 && (
            <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 text-xs text-purple-900">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <Info className="w-4 h-4 text-purple-700" />
                <span>
                  {orphanCount} Orphaned Review Record{orphanCount > 1 ? "s" : ""}{" "}
                  Preserved
                </span>
              </div>
              <p className="text-[11px] text-purple-800/90 leading-relaxed mb-2">
                Stored review decisions exist for job record IDs that are absent
                from the current audit report. They are preserved without
                inflating the findings denominator.
              </p>
              <button
                type="button"
                onClick={handleDownloadOrphansCsv}
                disabled={!isReconciledReady}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-900 bg-white border border-purple-300 hover:bg-purple-100/60 shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                aria-label="Download Orphaned Reviews CSV"
              >
                <Download className="w-3.5 h-3.5 text-purple-700" />
                <span>Download Orphaned Reviews CSV (13 columns)</span>
              </button>
            </div>
          )}

          {/* Export Action Controls */}
          <div className="space-y-3 pt-1 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-800 block">
              Generate Export Artifacts
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Action 1: JSON Export */}
              <button
                type="button"
                onClick={handleDownloadJson}
                disabled={!isReconciledReady}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Download Reconciled JSON Report"
              >
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span>Download JSON Report</span>
              </button>

              {/* Action 2: CSV Export */}
              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={!isReconciledReady}
                className="w-full px-4 py-3 rounded-xl bg-[#082F26] hover:bg-[#0B3D32] text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Download Reconciled CSV Report"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Download Reconciled CSV</span>
              </button>
            </div>

            {/* Combined CSV Option Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                id="include-orphans-checkbox"
                type="checkbox"
                checked={includeOrphansInCsv}
                onChange={(e) => setIncludeOrphansInCsv(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                aria-label="Include orphaned reviews in main CSV export"
              />
              <label
                htmlFor="include-orphans-checkbox"
                className="text-xs text-slate-600 cursor-pointer select-none"
              >
                Include orphaned reviews appended at end of reconciled findings CSV
              </label>
            </div>
          </div>

          {/* Trust Notice Box */}
          <div
            data-testid="trust-notice-box"
            className="p-3 rounded-xl bg-slate-100 border border-slate-200/80 text-[11px] text-slate-600 leading-relaxed flex items-start gap-2"
          >
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <span>
              Unsigned local working-state snapshot. This export reconciles
              algorithmic findings with browser-local review state. It is not a
              tamper-proof audit log or authoritative production record.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
