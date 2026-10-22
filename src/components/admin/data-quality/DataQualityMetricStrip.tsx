"use client";

import React from "react";
import {
  Layers,
  Copy,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import type { ValidatedAuditReport } from "@/lib/data-quality/dashboard-schema";
import { resolveFindingReviewStatus, type ReviewStateMap } from "./review-state-store";

interface DataQualityMetricStripProps {
  report: ValidatedAuditReport;
  reviews: ReviewStateMap;
}

export function DataQualityMetricStrip({ report, reviews }: DataQualityMetricStripProps) {
  const s = report.summary;

  // Reconcile review progress counts from loaded report findings using resolved status
  // so stale fingerprints cannot count as reviewed or verified (DQ-AUDIT-03).
  let evidenceVerifiedCount = 0;
  let historicalUnstructuredCount = 0;
  let needsReviewCount = 0;
  let unreviewedCount = 0;
  let staleCount = 0;

  for (const f of report.findings) {
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

  const currentReviewedCount = evidenceVerifiedCount + historicalUnstructuredCount;
  // Workflow completion = current reviewed + current flagged
  const workflowCompletedCount = currentReviewedCount + needsReviewCount;
  const reviewProgressPct =
    report.findings.length > 0
      ? Math.round((workflowCompletedCount / report.findings.length) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {/* 1. Total Audited */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total Audited
          </span>
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-2xl font-bold text-slate-900">{s.totalRecordsAudited.toLocaleString()}</div>
        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
          AI_MODE=offline (0 calls)
        </div>
      </div>

      {/* 2. Duplicate Candidates */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">
            Duplicate Candidates
          </span>
          <Copy className="w-4 h-4 text-rose-500" />
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {s.duplicates.totalDuplicateCandidateRecords}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
          Across {s.duplicates.totalDuplicateCandidateGroups} groups (0 master)
        </div>
      </div>

      {/* 3. Distinct Same-Role Clusters */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            Distinct Same-Role
          </span>
          <Layers className="w-4 h-4 text-blue-500" />
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {s.duplicates.distinctSameRoleGroups}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
          Preserved distinct vacancies
        </div>
      </div>

      {/* 4. Geography Discrepancies */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
            Geography Issues
          </span>
          <MapPin className="w-4 h-4 text-amber-500" />
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {s.geography.explicitForeign + s.geography.metadataDiscrepancy + s.geography.missingLocation}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
          {s.geography.explicitForeign} foreign, {s.geography.metadataDiscrepancy} discr, {s.geography.missingLocation} missing
        </div>
      </div>

      {/* 5. Suspected Ingestion Batches */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Batch Timestamps
          </span>
          <Clock className="w-4 h-4 text-slate-400" />
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {s.freshness.suspectedIngestionBatchTimestamps}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
          Identical created/updated
        </div>
      </div>

      {/* 6. Review Progress */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#12A150]">
            Review Progress
          </span>
          <CheckCircle2 className="w-4 h-4 text-[#12A150]" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{reviewProgressPct}%</span>
          <span className="text-xs text-slate-500">
            ({workflowCompletedCount}/{report.findings.length})
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-1">
          <span className="inline-flex items-center text-emerald-700 font-semibold" title="Evidence-verified outcomes (EVIDENCE_OBSERVED)">
            {evidenceVerifiedCount} verified
          </span>
          {historicalUnstructuredCount > 0 && (
            <>
              <span>•</span>
              <span className="inline-flex items-center text-slate-600 font-medium" title="Historical reviews (unstructured evidence)">
                {historicalUnstructuredCount} legacy
              </span>
            </>
          )}
          {needsReviewCount > 0 && (
            <>
              <span>•</span>
              <span className="inline-flex items-center text-amber-700 font-medium" title="Flagged / Needs Review">
                {needsReviewCount} flagged
              </span>
            </>
          )}
          {staleCount > 0 && (
            <>
              <span>•</span>
              <span className="inline-flex items-center text-purple-700 font-semibold" title="Findings changed since review; requires re-verification">
                {staleCount} stale
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
