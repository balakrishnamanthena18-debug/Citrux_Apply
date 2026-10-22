"use client";

import React, { useState, useMemo, useEffect, useTransition } from "react";
import {
  ShieldCheck,
  Upload,
  Download,
  Search,
  Filter,
  Copy,
  Layers,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileSearch,
  ArrowUpDown,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Tag,
} from "lucide-react";
import type {
  ValidatedAuditReport,
  ValidatedJobFinding,
  ReviewStatus,
} from "@/lib/data-quality/dashboard-schema";
import {
  loadReviewState,
  resolveFindingReviewStatus,
  measureLocalStorageUsage,
  type ReviewStateMap,
} from "./review-state-store";
import { DataQualityMetricStrip } from "./DataQualityMetricStrip";
import { DataQualityImportModal } from "./DataQualityImportModal";
import { DataQualityBackupModal } from "./DataQualityBackupModal";
import { DataQualityFindingDetailDrawer } from "./DataQualityFindingDetailDrawer";

type FindingCategoryFilter =
  | "ALL"
  | "P1_GEOGRAPHY"
  | "P2_DUPLICATES"
  | "P3_DISTINCT_ROLES"
  | "P4_LOCATION_DISCREPANCY"
  | "STALE_REVIEWS"
  | "DUPLICATES"
  | "DISTINCT_ROLES"
  | "GEOGRAPHY"
  | "TIMESTAMP_ANOMALIES"
  | "REVIEW_NEEDED";

interface DataQualityReviewWorkbenchProps {
  initialReport?: ValidatedAuditReport | null;
}

export function DataQualityReviewWorkbench({
  initialReport = null,
}: DataQualityReviewWorkbenchProps) {
  const [report, setReport] = useState<ValidatedAuditReport | null>(initialReport);
  const [filename, setFilename] = useState<string>(
    initialReport ? initialReport.summary.datasetName : ""
  );

  const [reviews, setReviews] = useState<ReviewStateMap>({});
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<ValidatedJobFinding | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FindingCategoryFilter>("ALL");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"ALL" | ReviewStatus>("ALL");
  const [providerFilter, setProviderFilter] = useState<string>("ALL");

  // Sorting & Pagination
  const [sortField, setSortField] = useState<"recordId" | "title" | "company" | "status">("recordId");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [isPending, startTransition] = useTransition();

  // Load reviews whenever report or dataset changes
  useEffect(() => {
    if (report?.summary.datasetName) {
      const saved = loadReviewState(report.summary.datasetName);
      setReviews(saved);
    }
  }, [report?.summary.datasetName]);

  const handleReportLoaded = (newReport: ValidatedAuditReport, name: string) => {
    setReport(newReport);
    setFilename(name);
    setCurrentPage(1);
    const loadedReviews = loadReviewState(newReport.summary.datasetName);
    setReviews(loadedReviews);
  };

  // Advisory storage usage
  const storageStats = useMemo(() => {
    return measureLocalStorageUsage(report?.summary.datasetName);
  }, [report?.summary.datasetName, reviews]);

  // Priority queue counts
  const queueCounts = useMemo(() => {
    if (!report) {
      return {
        all: 0,
        p1: 0,
        p2: 0,
        p3: 0,
        p4: 0,
        stale: 0,
      };
    }

    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    let p4 = 0;
    let stale = 0;

    for (const f of report.findings) {
      if (
        f.geography.status === "explicit_foreign" ||
        f.geography.status === "ambiguous" ||
        f.geography.status === "missing_location"
      ) {
        p1++;
      }
      if (f.duplicate.isDuplicateCandidate) {
        p2++;
      }
      if (f.duplicate.reasonCode === "SIMILAR_ROLE_DISTINCT_REQUISITION") {
        p3++;
      }
      if (f.geography.status === "metadata_discrepancy" || Boolean(f.geography.isDiscrepancy)) {
        p4++;
      }
      const { isStaleFingerprint } = resolveFindingReviewStatus(reviews, f);
      if (isStaleFingerprint) {
        stale++;
      }
    }

    return {
      all: report.findings.length,
      p1,
      p2,
      p3,
      p4,
      stale,
    };
  }, [report, reviews]);

  // Distinct providers for dropdown filter
  const availableProviders = useMemo(() => {
    if (!report) return [];
    const providers = new Set(report.findings.map((f) => f.ats.provider).filter(Boolean));
    return Array.from(providers).sort();
  }, [report]);

  // Filtered & Sorted findings
  const filteredFindings = useMemo(() => {
    if (!report) return [];

    return report.findings.filter((f) => {
      // 1. Category Tab Filter (including Stage 4.1 / Stage 5 priority queues)
      if (
        activeCategory === "P1_GEOGRAPHY" &&
        !(
          f.geography.status === "explicit_foreign" ||
          f.geography.status === "ambiguous" ||
          f.geography.status === "missing_location"
        )
      ) {
        return false;
      }
      if (activeCategory === "P2_DUPLICATES" && !f.duplicate.isDuplicateCandidate) {
        return false;
      }
      if (
        activeCategory === "P3_DISTINCT_ROLES" &&
        f.duplicate.reasonCode !== "SIMILAR_ROLE_DISTINCT_REQUISITION"
      ) {
        return false;
      }
      if (
        activeCategory === "P4_LOCATION_DISCREPANCY" &&
        !(f.geography.status === "metadata_discrepancy" || Boolean(f.geography.isDiscrepancy))
      ) {
        return false;
      }
      if (activeCategory === "STALE_REVIEWS") {
        const { isStaleFingerprint } = resolveFindingReviewStatus(reviews, f);
        if (!isStaleFingerprint) return false;
      }
      if (activeCategory === "DUPLICATES" && !f.duplicate.isDuplicateCandidate) return false;
      if (
        activeCategory === "DISTINCT_ROLES" &&
        f.duplicate.reasonCode !== "SIMILAR_ROLE_DISTINCT_REQUISITION"
      )
        return false;
      if (activeCategory === "GEOGRAPHY" && f.geography.status === "valid_us") return false;
      if (activeCategory === "TIMESTAMP_ANOMALIES" && !f.freshness.suspectedIngestionBatch)
        return false;
      if (activeCategory === "REVIEW_NEEDED" && f.aiReview.status !== "needs_review") return false;

      // 2. Review Status Filter
      const { status } = resolveFindingReviewStatus(reviews, f);
      if (reviewStatusFilter !== "ALL" && status !== reviewStatusFilter) return false;

      // 3. Provider Filter
      if (providerFilter !== "ALL" && f.ats.provider !== providerFilter) return false;

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = f.title?.toLowerCase().includes(q);
        const matchesCompany = f.company?.toLowerCase().includes(q);
        const matchesLocation = f.location?.toLowerCase().includes(q);
        const matchesId = f.recordId?.toLowerCase().includes(q);
        const matchesReq = f.ats.requisitionId?.toLowerCase().includes(q);
        const matchesUrl = f.canonicalUrl?.toLowerCase().includes(q);
        const matchesGroup = f.duplicate.duplicateGroupId?.toLowerCase().includes(q);

        if (
          !matchesTitle &&
          !matchesCompany &&
          !matchesLocation &&
          !matchesId &&
          !matchesReq &&
          !matchesUrl &&
          !matchesGroup
        ) {
          return false;
        }
      }

      return true;
    });
  }, [report, reviews, activeCategory, reviewStatusFilter, providerFilter, searchQuery]);

  // Sort
  const sortedFindings = useMemo(() => {
    return [...filteredFindings].sort((a, b) => {
      let comparison = 0;
      if (sortField === "recordId") {
        comparison = a.recordId.localeCompare(b.recordId);
      } else if (sortField === "title") {
        comparison = (a.title || "").localeCompare(b.title || "");
      } else if (sortField === "company") {
        comparison = (a.company || "").localeCompare(b.company || "");
      } else if (sortField === "status") {
        const statusA = resolveFindingReviewStatus(reviews, a).status;
        const statusB = resolveFindingReviewStatus(reviews, b).status;
        comparison = statusA.localeCompare(statusB);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredFindings, sortField, sortDirection, reviews]);

  // Pagination slice
  const paginatedFindings = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedFindings.slice(start, start + pageSize);
  }, [sortedFindings, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedFindings.length / pageSize) || 1;

  const handleToggleSort = (field: "recordId" | "title" | "company" | "status") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9F8] p-4 lg:p-8">
      {/* Workbench Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              OOS Data Quality & Intelligence
            </span>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-200 text-slate-700">
              AI_MODE=offline
            </span>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-200 text-slate-700">
              MASTER_POLICY=none
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Data Quality Review Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {report
              ? `Auditing dataset: ${report.summary.datasetName} (${report.summary.totalRecordsAudited.toLocaleString()} records)`
              : "Inspection & Human Review Interface for FreeHire US Job Audits"}
          </p>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {report && (
            <div
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 border transition ${
                storageStats.isNearQuota
                  ? "bg-rose-50 text-rose-800 border-rose-300"
                  : "bg-white text-slate-600 border-slate-200 shadow-2xs"
              }`}
              title={`Local Storage Quota: ~${Math.round(storageStats.quotaEstimateBytes / (1024 * 1024))} MB limit. Advisory only.`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  storageStats.isNearQuota ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                }`}
              />
              <span>Storage: {Math.round(storageStats.bytesUsed / 1024)} KB</span>
              {storageStats.isNearQuota && (
                <span className="text-[10px] text-rose-600 font-bold ml-1 uppercase">Near Quota</span>
              )}
            </div>
          )}

          {report && (
            <button
              type="button"
              onClick={() => setIsBackupModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Review Backup</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#082F26] hover:bg-[#0B3D32] shadow-2xs transition flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>{report ? "Change Report" : "Import Audit Report"}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {!report ? (
        /* Empty State: Prompt for Report Import */
        <div className="mt-12 max-w-xl mx-auto text-center py-16 px-6 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            <FileSearch className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            No Data Quality Report Loaded
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-2 leading-relaxed">
            Select or drag and drop a Phase 1 audit report JSON file (e.g. from{" "}
            <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">
              audit-reports/
            </code>
            ) to review findings, duplicate candidates, and geographic discrepancies.
          </p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#082F26] hover:bg-[#0B3D32] shadow-sm transition flex items-center gap-2"
            >
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>Import JSON Report</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          {/* Summary Metric Strip */}
          <DataQualityMetricStrip report={report} reviews={reviews} />

          {/* Workbench Tabs & Filter Toolbar */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden mb-6">
            {/* Category Tabs */}
            <div className="flex border-b border-slate-200/80 overflow-x-auto bg-slate-50/50 p-1 gap-1">
              {[
                { id: "ALL", label: "All Findings", count: queueCounts.all },
                { id: "P1_GEOGRAPHY", label: "P1: Geography Issues", count: queueCounts.p1 },
                { id: "P2_DUPLICATES", label: "P2: Duplicate Candidates", count: queueCounts.p2 },
                { id: "P3_DISTINCT_ROLES", label: "P3: Distinct Same-Role", count: queueCounts.p3 },
                { id: "P4_LOCATION_DISCREPANCY", label: "P4: Location Discrepancies", count: queueCounts.p4 },
                ...(queueCounts.stale > 0
                  ? [{ id: "STALE_REVIEWS", label: "Stale Reviews", count: queueCounts.stale }]
                  : []),
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(tab.id as FindingCategoryFilter);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                    activeCategory === tab.id
                      ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      tab.id === "STALE_REVIEWS"
                        ? "bg-amber-100 text-amber-800 font-bold"
                        : activeCategory === tab.id
                        ? "bg-slate-100 text-slate-800"
                        : "bg-slate-200/70 text-slate-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Filter Bar */}
            <div className="p-3.5 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between border-b border-slate-100">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by role, company, location, requisition ID..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              {/* Dropdown Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Review Status Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500">Review:</span>
                  <select
                    value={reviewStatusFilter}
                    onChange={(e) => {
                      setReviewStatusFilter(e.target.value as "ALL" | ReviewStatus);
                      setCurrentPage(1);
                    }}
                    className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="unreviewed">Unreviewed</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="needs_review">Needs Review</option>
                  </select>
                </div>

                {/* Provider Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500">ATS:</span>
                  <select
                    value={providerFilter}
                    onChange={(e) => {
                      setProviderFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
                  >
                    <option value="ALL">All Providers</option>
                    {availableProviders.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reset Filters */}
                {(searchQuery || reviewStatusFilter !== "ALL" || providerFilter !== "ALL" || activeCategory !== "ALL") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setActiveCategory("ALL");
                      setReviewStatusFilter("ALL");
                      setProviderFilter("ALL");
                      setCurrentPage(1);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
                    title="Reset all filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-slate-800"
                      onClick={() => handleToggleSort("recordId")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Record & ATS</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-slate-800"
                      onClick={() => handleToggleSort("title")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Role Title & Employer</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Audit Category / Finding</th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-slate-800"
                      onClick={() => handleToggleSort("status")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Review Status</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {paginatedFindings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400">
                        No audit findings match the current filter selection.
                      </td>
                    </tr>
                  ) : (
                    paginatedFindings.map((finding) => {
                      const { status, entry } = resolveFindingReviewStatus(reviews, finding);

                      return (
                        <tr
                          key={finding.recordId}
                          onClick={() => setSelectedFinding(finding)}
                          className="hover:bg-emerald-50/30 transition cursor-pointer group"
                        >
                          {/* Col 1: Record & ATS */}
                          <td className="py-3 px-4 font-mono">
                            <div className="font-semibold text-slate-900 truncate max-w-[150px]">
                              {finding.recordId}
                            </div>
                            <div className="text-[11px] text-slate-400 uppercase mt-0.5 flex items-center gap-1">
                              <span>{finding.ats.provider}</span>
                              {finding.ats.requisitionId && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[90px]">
                                    {finding.ats.requisitionId}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Col 2: Title & Company */}
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 group-hover:text-emerald-900 transition line-clamp-1">
                              {finding.title || "Untitled Role"}
                            </div>
                            <div className="text-slate-500 line-clamp-1 mt-0.5">
                              {finding.company || "Unknown Company"}
                            </div>
                          </td>

                          {/* Col 3: Location */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate max-w-[140px]">
                                {finding.location || (
                                  <span className="text-slate-400 italic">Missing</span>
                                )}
                              </span>
                              {finding.geography.status === "explicit_foreign" && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800">
                                  Foreign
                                </span>
                              )}
                              {finding.geography.status === "metadata_discrepancy" && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                                  Discr
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Col 4: Audit Category / Finding */}
                          <td className="py-3 px-4">
                            {finding.duplicate.isDuplicateCandidate ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <Copy className="w-3 h-3 shrink-0" />
                                <span>Duplicate ({finding.duplicate.candidateCountInGroup} in group)</span>
                              </span>
                            ) : finding.duplicate.reasonCode === "SIMILAR_ROLE_DISTINCT_REQUISITION" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                <Layers className="w-3 h-3 shrink-0" />
                                <span>Distinct Same-Role Cluster</span>
                              </span>
                            ) : finding.geography.status !== "valid_us" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span>{finding.geography.status}</span>
                              </span>
                            ) : finding.freshness.suspectedIngestionBatch ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>Batch Timestamp</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>Unique Vacancy</span>
                              </span>
                            )}
                          </td>

                          {/* Col 5: Review Status */}
                          <td className="py-3 px-4">
                            {status === "reviewed" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3" />
                                Reviewed
                              </span>
                            )}
                            {status === "needs_review" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                                <AlertTriangle className="w-3 h-3" />
                                Needs Review
                              </span>
                            )}
                            {status === "unreviewed" && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                                Unreviewed
                              </span>
                            )}
                          </td>

                          {/* Col 6: Actions */}
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFinding(finding);
                              }}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium text-[11px] transition shadow-2xs inline-flex items-center gap-1"
                            >
                              <span>Inspect</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Bar */}
            <div className="p-3.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
              <div>
                Showing{" "}
                <span className="font-semibold text-slate-800">
                  {sortedFindings.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-slate-800">
                  {Math.min(currentPage * pageSize, sortedFindings.length)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-800">
                  {sortedFindings.length.toLocaleString()}
                </span>{" "}
                filtered findings
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none"
                >
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    Previous
                  </button>
                  <span className="px-2 font-mono text-slate-700">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals & Slide-over Drawer */}
      <DataQualityImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onReportLoaded={handleReportLoaded}
      />

      {report && (
        <DataQualityBackupModal
          isOpen={isBackupModalOpen}
          onClose={() => setIsBackupModalOpen(false)}
          datasetName={report.summary.datasetName}
          reviews={reviews}
          onReviewsUpdated={(updated) => setReviews(updated)}
        />
      )}

      <DataQualityFindingDetailDrawer
        finding={selectedFinding}
        datasetName={report?.summary.datasetName || "default"}
        reviews={reviews}
        onClose={() => setSelectedFinding(null)}
        onReviewsUpdated={(updated) => setReviews(updated)}
      />
    </div>
  );
}
