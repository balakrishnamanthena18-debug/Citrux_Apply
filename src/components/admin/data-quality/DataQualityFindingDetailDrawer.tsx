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
  FileCheck,
  HelpCircle,
  History,
  Lock,
} from "lucide-react";
import {
  isSafeHttpUrl,
  getRequiredChecklistItems,
  type ValidatedJobFinding,
  type EvidenceTier,
  type ReviewDisposition,
  type ReviewStatus,
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

const CHECKLIST_DEFINITIONS: Record<string, { label: string; description: string }> = {
  urlInspected: {
    label: "Inspect Primary Job URL",
    description: "Verify job posting URL and canonical ATS destination",
  },
  requisitionCompared: {
    label: "Compare Requisition IDs",
    description: "Verify requisition ID match or distinction across duplicate candidates",
  },
  locationExamined: {
    label: "Examine Raw Location Text",
    description: "Check location string against detected country and coordinates",
  },
  entityLocationVerified: {
    label: "Verify Entity Location",
    description: "Confirm official employer workplace location from trusted source",
  },
  vacancyStatusVerified: {
    label: "Verify Live Vacancy Status",
    description: "Verify role status directly on employer careers portal",
  },
  closureSignalsChecked: {
    label: "Check Expiration Signals",
    description: "Inspect ingestion timestamp batch patterns and closure indicators",
  },
};

export function DataQualityFindingDetailDrawer({
  finding,
  datasetName,
  reviews,
  onClose,
  onReviewsUpdated,
}: DataQualityFindingDetailDrawerProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [notes, setNotes] = useState("");
  const [evidenceTier, setEvidenceTier] = useState<EvidenceTier>("EVIDENCE_INSUFFICIENT");
  const [verificationSource, setVerificationSource] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  const { status, disposition, evidenceTier: currentEvidenceTier, entry, isStaleFingerprint } = finding
    ? resolveFindingReviewStatus(reviews, finding)
    : { status: "unreviewed" as ReviewStatus, disposition: undefined, evidenceTier: undefined, entry: undefined, isStaleFingerprint: false };

  useEffect(() => {
    if (entry && !isStaleFingerprint) {
      setNotes(entry.notes || "");
      if (entry.evidenceTier && entry.evidenceTier !== "EVIDENCE_HISTORICAL_UNSTRUCTURED") {
        setEvidenceTier(entry.evidenceTier);
      } else {
        setEvidenceTier("EVIDENCE_OBSERVED");
      }
      const lastAudit = entry.history?.[entry.history.length - 1];
      if (lastAudit?.verificationSource) {
        setVerificationSource(lastAudit.verificationSource);
      }
      if (lastAudit?.reviewerEmail) {
        setReviewerEmail(lastAudit.reviewerEmail);
      }
      setChecklist(entry.checklist || {});
    } else if (entry && isStaleFingerprint) {
      // DQ-AUDIT-04: When stale, require explicit re-verification with new evidence & checklist
      setNotes(entry.notes || "");
      setEvidenceTier("EVIDENCE_INSUFFICIENT");
      const lastAudit = entry.history?.[entry.history.length - 1];
      if (lastAudit?.reviewerEmail) {
        setReviewerEmail(lastAudit.reviewerEmail);
      }
      setVerificationSource("");
      setChecklist({});
    } else {
      setNotes("");
      setEvidenceTier("EVIDENCE_INSUFFICIENT");
      setVerificationSource("");
      setReviewerEmail("");
      setChecklist({});
    }
    setPersistenceError(null);
  }, [entry, finding, isStaleFingerprint]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!finding) return null;

  const isConfirmedEvidence = evidenceTier === "EVIDENCE_OBSERVED";

  // Compute available dispositions and applicable checklist keys for this finding
  const availableDispositions: ReviewDisposition[] = [];
  if (finding.duplicate.isDuplicateCandidate) {
    availableDispositions.push("DUPLICATE_CONFIRMED_REDUNDANT", "DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT");
  }
  if (finding.geography.status !== "valid_us") {
    availableDispositions.push("GEO_CONFIRMED_DOMESTIC_US", "GEO_CONFIRMED_FOREIGN", "GEO_METADATA_COLLISION_VERIFIED");
  }
  if (finding.freshness.suspectedIngestionBatch || finding.freshness.status === "closure_detected") {
    availableDispositions.push("TEMPORAL_VERIFIED_ACTIVE", "TEMPORAL_VERIFIED_CLOSED");
  }
  if (availableDispositions.length === 0) {
    availableDispositions.push("TEMPORAL_VERIFIED_ACTIVE", "TEMPORAL_VERIFIED_CLOSED");
  }

  const applicableChecklistKeys = Array.from(
    new Set(availableDispositions.flatMap((d) => getRequiredChecklistItems(d)))
  );

  const canConfirmDisposition = (targetDisp: ReviewDisposition): boolean => {
    if (!isConfirmedEvidence) return false;
    const required = getRequiredChecklistItems(targetDisp);
    return required.every((k) => checklist[k] === true);
  };

  const handleCopyCanonical = () => {
    navigator.clipboard.writeText(finding.canonicalUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleApplyDisposition = (
    targetDisposition: ReviewDisposition,
    explicitTier?: EvidenceTier
  ) => {
    setPersistenceError(null);
    const tierToUse = explicitTier ?? evidenceTier;

    const res = saveReviewEntry(datasetName, finding, targetDisposition, notes, {
      evidenceTier: tierToUse,
      verificationSource: verificationSource.trim() || undefined,
      reviewerEmail: reviewerEmail.trim() || undefined,
      checklist,
    });

    if (!res.success) {
      setPersistenceError(res.error || "Failed to persist review decision to browser storage.");
      return;
    }
    onReviewsUpdated(res.reviews);
  };

  const handleSaveNotes = () => {
    setPersistenceError(null);
    if (!entry) return;
    const res = saveReviewEntry(datasetName, finding, entry.disposition ?? "LEGACY_REVIEWED_UNSTRUCTURED", notes, {
      evidenceTier: entry.evidenceTier ?? evidenceTier,
      verificationSource: verificationSource.trim() || undefined,
      reviewerEmail: reviewerEmail.trim() || undefined,
      checklist,
    });
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
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-semibold text-slate-800 text-sm block">
                  Human Review & Disposition
                </span>
                <span className="text-[11px] text-slate-500">
                  Evidence-gated offline review ledger
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
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
                {disposition && disposition !== "UNREVIEWED" && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-200/90 text-slate-700 font-semibold">
                    {disposition}
                  </span>
                )}
              </div>
            </div>

            {/* Stale Fingerprint Invalidation Banner (DQ-AUDIT-04) */}
            {isStaleFingerprint && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
                <div className="flex gap-2 items-start font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>Stale Review Invalidation</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Underlying audit finding attributes changed in the report since the prior review.
                  The prior disposition has been invalidated and reset to unreviewed. To re-verify,
                  inspect the current finding data below, select an evidence tier, complete the verification
                  checklist, and explicitly confirm a new disposition.
                </p>
                <div className="text-[11px] font-medium text-amber-900 bg-amber-100/60 p-2 rounded border border-amber-200">
                  Prior disposition: <strong className="font-mono">{entry?.disposition || "UNKNOWN"}</strong> •
                  Manual re-verification required (one-click auto-approval removed per DQ-AUDIT-04).
                </div>
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

            {/* Evidence Tier Selector */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
              <label htmlFor="evidence-tier-select" className="block text-[11px] font-semibold text-slate-700">
                Evidence Tier (Mandatory Gate):
              </label>
              <select
                id="evidence-tier-select"
                value={evidenceTier}
                onChange={(e) => setEvidenceTier(e.target.value as EvidenceTier)}
                className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="EVIDENCE_OBSERVED">
                  EVIDENCE_OBSERVED — Primary evidence directly observed (Unlocks confirmed dispositions)
                </option>
                <option value="EVIDENCE_INSUFFICIENT">
                  EVIDENCE_INSUFFICIENT — Insufficient data (Mandates escalation)
                </option>
                <option value="EVIDENCE_INACCESSIBLE">
                  EVIDENCE_INACCESSIBLE — Primary source 404, auth wall, geoblocked (Mandates escalation)
                </option>
                <option value="EVIDENCE_CONFLICTING">
                  EVIDENCE_CONFLICTING — Conflicting employer sources or dates (Mandates escalation)
                </option>
              </select>
              {!isConfirmedEvidence && (
                <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1 mt-1">
                  <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                  <span>Non-conclusive evidence tier: Confirmed dispositions locked. Only escalation permitted.</span>
                </p>
              )}
            </div>

            {/* Review Verification Checklist (DQ-AUDIT-02 & DQ-AUDIT-04) */}
            {applicableChecklistKeys.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200/60">
                <div className="flex items-center justify-between">
                  <span className="block text-[11px] font-semibold text-slate-700">
                    Verification Checklist (Required for Confirmation):
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {applicableChecklistKeys.filter((k) => checklist[k]).length}/{applicableChecklistKeys.length} completed
                  </span>
                </div>
                <div className="space-y-1.5 bg-white p-2.5 rounded-lg border border-slate-200">
                  {applicableChecklistKeys.map((key) => {
                    const itemDef = CHECKLIST_DEFINITIONS[key] || {
                      label: key,
                      description: "Verification requirement",
                    };
                    const isChecked = !!checklist[key];
                    return (
                      <label
                        key={key}
                        className="flex items-start gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setChecklist((prev) => ({
                              ...prev,
                              [key]: e.target.checked,
                            }))
                          }
                          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div className="flex-1 text-xs">
                          <span className={`font-semibold ${isChecked ? "text-emerald-800" : "text-slate-800"}`}>
                            {itemDef.label}
                          </span>
                          <p className="text-[10px] text-slate-500 leading-tight">
                            {itemDef.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Operational Attribution Fields */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
              <div>
                <label htmlFor="verification-source" className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Verification Source:
                </label>
                <input
                  id="verification-source"
                  type="text"
                  placeholder="e.g. Greenhouse ATS live portal"
                  value={verificationSource}
                  onChange={(e) => setVerificationSource(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 bg-white p-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="reviewer-attribution" className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Reviewer Attribution:
                </label>
                <input
                  id="reviewer-attribution"
                  type="text"
                  placeholder="e.g. auditor@citrux.com"
                  value={reviewerEmail}
                  onChange={(e) => setReviewerEmail(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 bg-white p-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Contextual Disposition Buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-200/60">
              <span className="block text-[11px] font-semibold text-slate-700">
                Action / Disposition:
              </span>

              {/* Duplicate Candidate Actions */}
              {finding.duplicate.isDuplicateCandidate && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!canConfirmDisposition("DUPLICATE_CONFIRMED_REDUNDANT")}
                    onClick={() => handleApplyDisposition("DUPLICATE_CONFIRMED_REDUNDANT")}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs ${
                      !canConfirmDisposition("DUPLICATE_CONFIRMED_REDUNDANT")
                        ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                        : disposition === "DUPLICATE_CONFIRMED_REDUNDANT"
                        ? "bg-emerald-600 text-white ring-2 ring-emerald-600/30"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                    }`}
                    title={
                      !isConfirmedEvidence
                        ? "Requires EVIDENCE_OBSERVED tier"
                        : !canConfirmDisposition("DUPLICATE_CONFIRMED_REDUNDANT")
                        ? "Complete all required checklist items before confirming"
                        : undefined
                    }
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm Redundant Dup</span>
                  </button>

                  <button
                    type="button"
                    disabled={!canConfirmDisposition("DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT")}
                    onClick={() => handleApplyDisposition("DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT")}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs ${
                      !canConfirmDisposition("DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT")
                        ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                        : disposition === "DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT"
                        ? "bg-blue-600 text-white ring-2 ring-blue-600/30"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                    }`}
                    title={
                      !isConfirmedEvidence
                        ? "Requires EVIDENCE_OBSERVED tier"
                        : !canConfirmDisposition("DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT")
                        ? "Complete all required checklist items before confirming"
                        : undefined
                    }
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Confirm Distinct Headcount</span>
                  </button>
                </div>
              )}

              {/* Geography Actions */}
              {finding.geography.status !== "valid_us" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={!canConfirmDisposition("GEO_CONFIRMED_DOMESTIC_US")}
                    onClick={() => handleApplyDisposition("GEO_CONFIRMED_DOMESTIC_US")}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 shadow-2xs ${
                      !canConfirmDisposition("GEO_CONFIRMED_DOMESTIC_US")
                        ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                        : disposition === "GEO_CONFIRMED_DOMESTIC_US"
                        ? "bg-emerald-600 text-white ring-2 ring-emerald-600/30"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                    }`}
                    title={
                      !isConfirmedEvidence
                        ? "Requires EVIDENCE_OBSERVED tier"
                        : !canConfirmDisposition("GEO_CONFIRMED_DOMESTIC_US")
                        ? "Complete all required checklist items before confirming"
                        : undefined
                    }
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm US</span>
                  </button>

                  <button
                    type="button"
                    disabled={!canConfirmDisposition("GEO_CONFIRMED_FOREIGN")}
                    onClick={() => handleApplyDisposition("GEO_CONFIRMED_FOREIGN")}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 shadow-2xs ${
                      !canConfirmDisposition("GEO_CONFIRMED_FOREIGN")
                        ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                        : disposition === "GEO_CONFIRMED_FOREIGN"
                        ? "bg-rose-600 text-white ring-2 ring-rose-600/30"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                    }`}
                    title={
                      !isConfirmedEvidence
                        ? "Requires EVIDENCE_OBSERVED tier"
                        : !canConfirmDisposition("GEO_CONFIRMED_FOREIGN")
                        ? "Complete all required checklist items before confirming"
                        : undefined
                    }
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Confirm Foreign</span>
                  </button>

                  <button
                    type="button"
                    disabled={!canConfirmDisposition("GEO_METADATA_COLLISION_VERIFIED")}
                    onClick={() => handleApplyDisposition("GEO_METADATA_COLLISION_VERIFIED")}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 shadow-2xs ${
                      !canConfirmDisposition("GEO_METADATA_COLLISION_VERIFIED")
                        ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                        : disposition === "GEO_METADATA_COLLISION_VERIFIED"
                        ? "bg-amber-600 text-white ring-2 ring-amber-600/30"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-700"
                    }`}
                    title={
                      !isConfirmedEvidence
                        ? "Requires EVIDENCE_OBSERVED tier"
                        : !canConfirmDisposition("GEO_METADATA_COLLISION_VERIFIED")
                        ? "Complete all required checklist items before confirming"
                        : undefined
                    }
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Verify Collision</span>
                  </button>
                </div>
              )}

              {/* Temporal / Freshness Actions */}
              {(finding.freshness.suspectedIngestionBatch || finding.freshness.status === "closure_detected") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!canConfirmDisposition("TEMPORAL_VERIFIED_ACTIVE")}
                    onClick={() => handleApplyDisposition("TEMPORAL_VERIFIED_ACTIVE")}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs ${
                      !canConfirmDisposition("TEMPORAL_VERIFIED_ACTIVE")
                        ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                        : disposition === "TEMPORAL_VERIFIED_ACTIVE"
                        ? "bg-emerald-600 text-white ring-2 ring-emerald-600/30"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                    }`}
                    title={
                      !isConfirmedEvidence
                        ? "Requires EVIDENCE_OBSERVED tier"
                        : !canConfirmDisposition("TEMPORAL_VERIFIED_ACTIVE")
                        ? "Complete all required checklist items before confirming"
                        : undefined
                    }
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Verify Active Vacancy</span>
                  </button>

                  <button
                    type="button"
                    disabled={!canConfirmDisposition("TEMPORAL_VERIFIED_CLOSED")}
                    onClick={() => handleApplyDisposition("TEMPORAL_VERIFIED_CLOSED")}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs ${
                      !canConfirmDisposition("TEMPORAL_VERIFIED_CLOSED")
                        ? "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                        : disposition === "TEMPORAL_VERIFIED_CLOSED"
                        ? "bg-rose-600 text-white ring-2 ring-rose-600/30"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                    }`}
                    title={
                      !isConfirmedEvidence
                        ? "Requires EVIDENCE_OBSERVED tier"
                        : !canConfirmDisposition("TEMPORAL_VERIFIED_CLOSED")
                        ? "Complete all required checklist items before confirming"
                        : undefined
                    }
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Verify Closed Role</span>
                  </button>
                </div>
              )}

              {/* Standard Escalation & Reset Row */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleApplyDisposition(
                      "ESCALATED_NEEDS_FURTHER_EVIDENCE",
                      isConfirmedEvidence ? "EVIDENCE_INSUFFICIENT" : evidenceTier
                    )
                  }
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-2xs ${
                    disposition === "ESCALATED_NEEDS_FURTHER_EVIDENCE"
                      ? "bg-amber-600 text-white ring-2 ring-amber-600/30"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Escalate: Needs Evidence</span>
                </button>

                {status !== "unreviewed" && (
                  <button
                    type="button"
                    onClick={() => handleApplyDisposition("UNREVIEWED")}
                    className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition shadow-2xs"
                    title="Reset to Unreviewed"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Reviewer Notes */}
            <div className="pt-2 border-t border-slate-200/60">
              <label htmlFor="review-notes" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Auditor Notes (stored locally):
              </label>
              <textarea
                id="review-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleSaveNotes}
                placeholder="Add notes for this finding..."
                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Trust Model Notice */}
            <div className="p-2 rounded-lg bg-slate-100 text-[10px] text-slate-500">
              <strong>Notice:</strong> Browser-local operational attribution ledger. Not a cryptographic signature or tamper-proof audit record.
            </div>

            {/* Review History Viewer */}
            {entry?.history && entry.history.length > 0 && (
              <div className="pt-2 border-t border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Review Audit History ({entry.history.length} {entry.history.length === 1 ? "entry" : "entries"})</span>
                </button>

                {showHistory && (
                  <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                    {entry.history.map((h, idx) => (
                      <div key={h.auditId || idx} className="p-2 rounded bg-white border border-slate-200 text-[11px] space-y-0.5">
                        <div className="flex justify-between items-center text-slate-500 text-[10px]">
                          <span>{new Date(h.reviewedAt).toLocaleString()}</span>
                          <span className="font-mono">{h.evidenceTier}</span>
                        </div>
                        <div className="font-semibold text-slate-800 font-mono text-[10px]">
                          {h.disposition}
                        </div>
                        {h.reviewerEmail && (
                          <div className="text-slate-500 text-[10px]">
                            Reviewer: {h.reviewerEmail}
                          </div>
                        )}
                        {h.verificationSource && (
                          <div className="text-slate-500 text-[10px]">
                            Source: {h.verificationSource}
                          </div>
                        )}
                        {h.notes && (
                          <div className="text-slate-600 italic mt-0.5">&ldquo;{h.notes}&rdquo;</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
