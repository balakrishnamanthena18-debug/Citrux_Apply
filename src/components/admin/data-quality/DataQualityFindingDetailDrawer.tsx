"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  ExternalLink,
  ShieldAlert,
  Copy,
  Layers,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Tag,
  Check,
} from "lucide-react";
import {
  isSafeHttpUrl,
  type ValidatedJobFinding,
} from "@/lib/data-quality/dashboard-schema";
import {
  resolveFindingReviewStatus,
  saveReviewEntry,
  type ReviewStateMap,
} from "./review-state-store";

interface DataQualityFindingDetailDrawerProps {
  finding: ValidatedJobFinding | null;
  datasetName: string;
  reviews: ReviewStateMap;
  onClose: () => void;
  onReviewsUpdated: (updated: ReviewStateMap) => void;
}

export function DataQualityFindingDetailDrawer({
  finding,
  datasetName,
  reviews,
  onClose,
  onReviewsUpdated,
}: DataQualityFindingDetailDrawerProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [notes, setNotes] = useState("");
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  const { status, entry, isStaleFingerprint } = finding
    ? resolveFindingReviewStatus(reviews, finding)
    : { status: "unreviewed" as const, entry: undefined, isStaleFingerprint: false };

  useEffect(() => {
    if (entry?.notes) {
      setNotes(entry.notes);
    } else {
      setNotes("");
    }
    setPersistenceError(null);
  }, [entry, finding]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!finding) return null;

  const handleCopyCanonical = () => {
    navigator.clipboard.writeText(finding.canonicalUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleUpdateStatus = (newStatus: "unreviewed" | "reviewed" | "needs_review") => {
    setPersistenceError(null);
    const res = saveReviewEntry(datasetName, finding, newStatus, notes);
    if (!res.success) {
      setPersistenceError(res.error || "Failed to persist review decision to browser storage.");
      return;
    }
    onReviewsUpdated(res.reviews);
  };

  const handleSaveNotes = () => {
    setPersistenceError(null);
    const res = saveReviewEntry(datasetName, finding, status, notes);
    if (!res.success) {
      setPersistenceError(res.error || "Failed to persist notes to browser storage.");
      return;
    }
    onReviewsUpdated(res.reviews);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/30 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
      <div
        className="bg-white w-full max-w-2xl h-full shadow-2xl border-l border-slate-200 flex flex-col transform transition-transform duration-200 overflow-hidden"
        role="dialog"
        aria-labelledby="drawer-title"
      >
        {/* Drawer Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/70 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-200/80 text-slate-700">
                {finding.source || finding.ats.provider}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {finding.recordId}
              </span>
            </div>
            <h2 id="drawer-title" className="text-lg font-bold text-slate-900 leading-snug">
              {finding.title || "Untitled Role"}
            </h2>
            <div className="text-xs font-medium text-slate-600 mt-0.5">
              {finding.company || "Unknown Employer"}
              {finding.location ? ` • ${finding.location}` : " • Location Missing"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
            aria-label="Close detail view"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700">
          {/* Review Decision Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 text-sm">
                Human Review Status
              </span>
              <div className="flex items-center gap-1.5">
                {status === "reviewed" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Reviewed
                  </span>
                )}
                {status === "needs_review" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Needs Review
                  </span>
                )}
                {status === "unreviewed" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700">
                    Unreviewed
                  </span>
                )}
              </div>
            </div>

            {isStaleFingerprint && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex gap-2 items-center">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Finding details changed in audit report since last review. Status reset to unreviewed.</span>
              </div>
            )}

            {persistenceError && (
              <div
                className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex gap-2 items-center"
                role="alert"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>{persistenceError}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleUpdateStatus("reviewed")}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs ${
                  status === "reviewed"
                    ? "bg-emerald-600 text-white ring-2 ring-emerald-600/30"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Reviewed</span>
              </button>

              <button
                type="button"
                onClick={() => handleUpdateStatus("needs_review")}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs ${
                  status === "needs_review"
                    ? "bg-amber-600 text-white ring-2 ring-amber-600/30"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Flag Needs Review</span>
              </button>

              {status !== "unreviewed" && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus("unreviewed")}
                  className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition shadow-2xs"
                  title="Reset to Unreviewed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Reviewer Notes */}
            <div className="pt-2 border-t border-slate-200/60">
              <label htmlFor="review-notes" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Auditor Notes (stored locally):
              </label>
              <div className="flex gap-2">
                <textarea
                  id="review-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={handleSaveNotes}
                  placeholder="Add notes for this finding..."
                  className="flex-1 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Duplicate Assessment */}
          <div className="space-y-2.5">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>Duplicate & Candidate Assessment</span>
            </h3>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Classification:</span>
                <span
                  className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold ${
                    finding.duplicate.isDuplicateCandidate
                      ? "bg-rose-100 text-rose-800"
                      : finding.duplicate.reasonCode === "SIMILAR_ROLE_DISTINCT_REQUISITION"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {finding.duplicate.reasonCode}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Confidence:</span>
                <span className="capitalize font-semibold text-slate-800">
                  {finding.duplicate.confidence}
                </span>
              </div>

              {finding.duplicate.duplicateGroupId && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Candidate Group ID:</span>
                  <span className="font-mono text-slate-700 text-[11px]">
                    {finding.duplicate.duplicateGroupId}
                  </span>
                </div>
              )}

              <div>
                <span className="text-slate-500 font-medium">Evidence:</span>
                <p className="mt-1 p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-800 font-mono text-[11px] leading-relaxed">
                  {finding.duplicate.evidence}
                </p>
              </div>

              {finding.duplicate.candidateIdsInGroup.length > 1 && (
                <div>
                  <span className="text-slate-500 font-medium">
                    All Member Records in Group ({finding.duplicate.candidateCountInGroup}):
                  </span>
                  <ul className="mt-1 space-y-1">
                    {finding.duplicate.candidateIdsInGroup.map((id) => (
                      <li
                        key={id}
                        className={`px-2 py-1 rounded-md text-[11px] font-mono ${
                          id === finding.recordId
                            ? "bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200"
                            : "bg-slate-50 text-slate-600"
                        }`}
                      >
                        {id} {id === finding.recordId && "(current)"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Master Policy Invariant notice */}
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/60 text-[11px] text-slate-500">
                <strong>Frozen Master Policy (`none`):</strong> All candidates remain preserved.
                No master record is designated, and zero records are merged or deleted.
              </div>
            </div>
          </div>

          {/* Section: Requisition Identity & ATS Normalization */}
          <div className="space-y-2.5">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-500" />
              <span>ATS Requisition Identity</span>
            </h3>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 font-medium">ATS Provider:</span>
                  <div className="font-semibold text-slate-800 uppercase mt-0.5">
                    {finding.ats.provider}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Requisition ID:</span>
                  <div className="font-mono font-semibold text-slate-900 mt-0.5">
                    {finding.ats.requisitionId || "None extracted"}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 font-medium">Normalized Canonical URL:</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="text"
                    readOnly
                    value={finding.canonicalUrl}
                    className="flex-1 font-mono text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-slate-800 truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopyCanonical}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
                    title="Copy Canonical URL"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {isSafeHttpUrl(finding.canonicalUrl) ? (
                    <a
                      href={finding.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
                      title="Open URL"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <span
                      className="p-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      title="External link disabled: URL scheme must be HTTP or HTTPS"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>

              {finding.ats.trackingParametersRemoved.length > 0 && (
                <div className="pt-1">
                  <span className="text-slate-400 font-medium">Tracking Parameters Stripped:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {finding.ats.trackingParametersRemoved.map((p) => (
                      <span key={p} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section: Geography Assessment */}
          <div className="space-y-2.5">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>Geographic Validation</span>
            </h3>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Status:</span>
                <span
                  className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold ${
                    finding.geography.status === "valid_us"
                      ? "bg-emerald-100 text-emerald-800"
                      : finding.geography.status === "explicit_foreign"
                      ? "bg-rose-100 text-rose-800"
                      : finding.geography.status === "metadata_discrepancy"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {finding.geography.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Raw Location:</span>
                  <div className="font-medium text-slate-800 mt-0.5">
                    {finding.geography.rawLocation || "None"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Detected Country:</span>
                  <div className="font-medium text-slate-800 mt-0.5">
                    {finding.geography.detectedCountry || "None"}
                  </div>
                </div>
              </div>

              {finding.geography.notes && (
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-700">
                  {finding.geography.notes}
                </div>
              )}
            </div>
          </div>

          {/* Section: Freshness Signals */}
          <div className="space-y-2.5">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Freshness & Ingestion Signals</span>
            </h3>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Vacancy Status:</span>
                <span className="px-2 py-0.5 rounded-md font-mono text-[11px] bg-slate-100 text-slate-700">
                  {finding.freshness.status}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Ingestion Batch Timestamp:</span>
                <span className="font-semibold text-slate-800">
                  {finding.freshness.suspectedIngestionBatch ? "Suspected Batch Ingestion" : "Distinct"}
                </span>
              </div>

              {finding.freshness.notes && (
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-700">
                  {finding.freshness.notes}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs transition"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
