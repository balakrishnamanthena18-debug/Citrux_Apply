"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  X,
  FileJson,
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import {
  fullAuditReportSchema,
  type ValidatedAuditReport,
} from "@/lib/data-quality/dashboard-schema";

interface DataQualityImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReportLoaded: (report: ValidatedAuditReport, filename: string) => void;
}

export function DataQualityImportModal({
  isOpen,
  onClose,
  onReportLoaded,
}: DataQualityImportModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{
    report: ValidatedAuditReport;
    filename: string;
    fileSizeBytes: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    setError(null);
    setParsedPreview(null);
    setLoading(true);

    try {
      if (!file.name.endsWith(".json")) {
        throw new Error("Only .json audit report files are supported.");
      }

      // 50MB reasonable ceiling for local in-memory audit payloads
      if (file.size > 50 * 1024 * 1024) {
        throw new Error("File exceeds 50MB client memory ceiling.");
      }

      const text = await file.text();
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(text);
      } catch (jsonErr) {
        throw new Error(
          `JSON syntax error: ${jsonErr instanceof Error ? jsonErr.message : "Malformed JSON"}`
        );
      }

      // Validate against Phase 1 FullAuditReport schema
      const validation = fullAuditReportSchema.safeParse(rawJson);
      if (!validation.success) {
        const issues = validation.error.errors.slice(0, 3).map((e) => {
          const path = e.path.join(".");
          return `${path ? `at '${path}': ` : ""}${e.message}`;
        });
        throw new Error(
          `Invalid audit report schema:\n• ${issues.join("\n• ")}${
            validation.error.errors.length > 3
              ? `\n...and ${validation.error.errors.length - 3} more schema discrepancies.`
              : ""
          }`
        );
      }

      setParsedPreview({
        report: validation.data,
        filename: file.name,
        fileSizeBytes: file.size,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = () => {
    if (parsedPreview) {
      onReportLoaded(parsedPreview.report, parsedPreview.filename);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-labelledby="import-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
              <FileSearch className="w-4 h-4" />
            </div>
            <div>
              <h2 id="import-modal-title" className="text-base font-semibold text-slate-900">
                Import Data Quality Audit Report
              </h2>
              <p className="text-xs text-slate-500">
                Client-side JSON parser for Phase 1 audit outputs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Drag & Drop Area */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              dragActive
                ? "border-emerald-500 bg-emerald-50/40"
                : "border-slate-200 hover:border-emerald-400 hover:bg-slate-50/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleProcessFile(e.target.files[0]);
                }
              }}
            />

            {loading ? (
              <div className="flex flex-col items-center justify-center py-4">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
                <span className="text-sm font-medium text-slate-700">
                  Parsing and validating schema client-side...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6 text-slate-400" />
                </div>
                <div className="text-sm font-semibold text-slate-800">
                  Click to select or drag and drop local JSON report
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Expected schema: Phase 1 FullAuditReport (`audit-reports/*.json`)
                </p>
              </div>
            )}
          </div>

          {/* Error Notice */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-800 text-xs flex gap-2.5 items-start">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="whitespace-pre-line font-mono">{error}</div>
            </div>
          )}

          {/* Parsed Preview Card */}
          {parsedPreview && (
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-2.5">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Validated Phase 1 Audit Report</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 bg-white/80 p-3 rounded-lg border border-emerald-100">
                <div>
                  <span className="text-slate-400 font-medium">Filename:</span>{" "}
                  <span className="font-semibold text-slate-900 truncate">
                    {parsedPreview.filename}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Dataset:</span>{" "}
                  <span className="font-semibold text-slate-900 truncate">
                    {parsedPreview.report.summary.datasetName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Audited Records:</span>{" "}
                  <span className="font-semibold text-slate-900">
                    {parsedPreview.report.summary.totalRecordsAudited.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Findings:</span>{" "}
                  <span className="font-semibold text-slate-900">
                    {parsedPreview.report.findings.length.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Audit Timestamp:</span>{" "}
                  <span className="font-semibold text-slate-900">
                    {new Date(parsedPreview.report.summary.auditTimestamp).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">AI Mode:</span>{" "}
                  <span className="font-semibold text-slate-900 uppercase">
                    {parsedPreview.report.summary.aiMode}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Privacy Disclaimer */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/60 text-[11px] text-slate-500 flex gap-2 items-center">
            <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              <strong>Zero Server Upload:</strong> This file is read directly in your browser&apos;s
              memory. Records are never sent over the network or saved to a database.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!parsedPreview || loading}
            onClick={handleConfirmImport}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#082F26] hover:bg-[#0B3D32] disabled:opacity-50 transition shadow-xs flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Load Report into Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
}
