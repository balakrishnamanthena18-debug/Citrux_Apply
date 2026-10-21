"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  ShieldAlert,
} from "lucide-react";
import {
  exportReviewStateBackup,
  importReviewStateBackup,
  clearDatasetReviewState,
  loadReviewState,
  type ReviewStateMap,
} from "./review-state-store";

interface DataQualityBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetName: string;
  reviews: ReviewStateMap;
  onReviewsUpdated: (updated: ReviewStateMap) => void;
}

export function DataQualityBackupModal({
  isOpen,
  onClose,
  datasetName,
  reviews,
  onReviewsUpdated,
}: DataQualityBackupModalProps) {
  const [importStatus, setImportStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [pendingCrossDataset, setPendingCrossDataset] = useState<{
    fileContent: string;
    backupDatasetName: string;
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

  const reviewedEntriesCount = Object.keys(reviews).length;

  const handleExportBackup = () => {
    const jsonStr = exportReviewStateBackup(datasetName, reviews);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `dq-review-backup-${datasetName}-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExecuteImport = (text: string, allowCrossDataset: boolean) => {
    const res = importReviewStateBackup(datasetName, text, { allowCrossDataset });
    if (res.success) {
      setPendingCrossDataset(null);
      setImportStatus({
        success: true,
        message: `Successfully imported ${res.importedCount} review records.`,
      });
      const updated = loadReviewState(datasetName);
      onReviewsUpdated(updated);
    } else if (res.requiresConfirmation && res.backupDatasetName) {
      setPendingCrossDataset({
        fileContent: text,
        backupDatasetName: res.backupDatasetName,
      });
      setImportStatus(null);
    } else {
      setPendingCrossDataset(null);
      setImportStatus({
        success: false,
        message: res.error || "Failed to import review backup.",
      });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportStatus(null);
    setPendingCrossDataset(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      handleExecuteImport(text, false);
    } catch (err) {
      setImportStatus({
        success: false,
        message: err instanceof Error ? err.message : "Failed to read backup file.",
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleClearState = () => {
    if (window.confirm("Are you sure you want to clear all local review decisions for this dataset? This cannot be undone unless you have downloaded a backup.")) {
      clearDatasetReviewState(datasetName);
      onReviewsUpdated({});
      setImportStatus({
        success: true,
        message: "Cleared local review state for this dataset.",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        role="dialog"
        aria-labelledby="backup-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100/80 text-blue-700 flex items-center justify-center">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <h2 id="backup-modal-title" className="text-base font-semibold text-slate-900">
                Review State Backup & Restore
              </h2>
              <p className="text-xs text-slate-500">
                Manage device-local review decisions for `{datasetName}`
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
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/70 text-amber-900 text-xs flex gap-2.5 items-start">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Browser-Local State Notice:</strong> Your review statuses (reviewed, needs review)
              are saved in your browser's LocalStorage only. They are not shared with teammates
              unless you export this JSON backup.
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/70 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-medium">Recorded Decisions:</span>
              <span className="font-bold text-slate-900">{reviewedEntriesCount} records</span>
            </div>

            <div className="pt-2 border-t border-slate-200/60 flex gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={reviewedEntriesCount === 0}
                className="flex-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs flex items-center justify-center gap-1.5 disabled:opacity-50 transition"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export Backup (JSON)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs flex items-center justify-center gap-1.5 transition"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Restore Backup (JSON)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
          </div>

          {/* Cross-Dataset Confirmation Required Warning (SEC-04) */}
          {pendingCrossDataset && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2.5" role="alert">
              <div className="flex gap-2 items-start font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Cross-Dataset Restore Confirmation Required</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                This backup was exported from <strong>&ldquo;{pendingCrossDataset.backupDatasetName}&rdquo;</strong>, but the currently loaded report is <strong>&ldquo;{datasetName}&rdquo;</strong>.
                Restoring will apply matching finding fingerprints to the current dataset.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingCrossDataset(null)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteImport(pendingCrossDataset.fileContent, true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-xs font-semibold shadow-2xs"
                >
                  Confirm Cross-Dataset Restore
                </button>
              </div>
            </div>
          )}

          {importStatus && (
            <div
              className={`p-3 rounded-xl text-xs flex gap-2 items-center ${
                importStatus.success
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {importStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{importStatus.message}</span>
            </div>
          )}

          {reviewedEntriesCount > 0 && (
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleClearState}
                className="text-xs text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 font-medium transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset all local reviews for this report</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-end">
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
