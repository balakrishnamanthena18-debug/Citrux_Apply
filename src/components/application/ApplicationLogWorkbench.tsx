"use client";

import React, { useState, useTransition, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startApplicationFromDeskAction,
  getCandidateLogSummaryAction,
} from "@/lib/application/actions";

export interface CandidateOption {
  id: string;
  fullName: string;
  email: string;
  status: string;
  applicationAuthorizationMode: string;
}

export interface OperationalMetrics {
  todayCount: number;
  weekCount: number;
  monthCount: number;
  activeCandidatesWorked: number;
  sourceCounts: Record<string, number>;
}

export interface CandidateLogSummary {
  candidate: {
    id: string;
    fullName: string;
    email: string;
    status: string;
    applicationAuthorizationMode: string;
  };
  metrics: {
    today: number;
    thisWeek: number;
    totalSubmitted: number;
  };
  recentApplications: Array<{
    id: string;
    title: string;
    companyName: string;
    source: string;
    location: string;
    isRemote: boolean;
    salaryMin: number | null;
    salaryMax: number | null;
    status: string;
    appliedAt: string;
  }>;
}

interface Props {
  candidates: CandidateOption[];
  metrics: OperationalMetrics;
  initialSelectedCandidateId?: string;
  initialCandidateSummary?: CandidateLogSummary | null;
}

const SOURCES = [
  "Company Career",
  "LinkedIn",
  "Indeed",
  "Greenhouse",
  "Lever",
  "Workday",
  "Other",
];

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "Full Time" },
  { value: "PART_TIME", label: "Part Time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERNSHIP", label: "Internship" },
];

export function ApplicationLogWorkbench({
  candidates,
  metrics: initialMetrics,
  initialSelectedCandidateId = "",
  initialCandidateSummary = null,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(
    initialSelectedCandidateId
  );
  const [candidateSummary, setCandidateSummary] =
    useState<CandidateLogSummary | null>(initialCandidateSummary);
  const [isLoadingCandidate, setIsLoadingCandidate] = useState<boolean>(false);

  // Combobox State
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
  const comboboxRef = useRef<HTMLDivElement>(null);

  // Form State
  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("Company Career");
  const [externalUrl, setExternalUrl] = useState("");
  const [location, setLocation] = useState("Remote");
  const [employmentType, setEmploymentType] = useState("FULL_TIME");
  const [isRemote, setIsRemote] = useState(true);
  const [salaryMin, setSalaryMin] = useState<string>("");
  const [salaryMax, setSalaryMax] = useState<string>("");
  const [jobDescription, setJobDescription] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [showOptionalFields, setShowOptionalFields] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    applicationId: string;
    jobId: string;
    candidateName: string;
    role: string;
    company: string;
    source: string;
    isExistingJob: boolean;
  } | null>(null);

  // Handle click outside combobox
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setIsComboboxOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter candidates for combobox
  const filteredCandidates = useMemo(() => {
    const q = candidateSearchQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [candidates, candidateSearchQuery]);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedCandidateId),
    [candidates, selectedCandidateId]
  );

  // Handle candidate selection change
  async function handleCandidateSelect(candidateId: string) {
    setSelectedCandidateId(candidateId);
    setIsComboboxOpen(false);
    setError(null);

    if (!candidateId) {
      setCandidateSummary(null);
      return;
    }

    setIsLoadingCandidate(true);
    try {
      const res = await getCandidateLogSummaryAction(candidateId);
      if (res.success && res.data) {
        setCandidateSummary(res.data);
      } else {
        setError(res.error || "Failed to load candidate details");
      }
    } catch {
      setError("Failed to fetch candidate details");
    } finally {
      setIsLoadingCandidate(false);
    }
  }

  // Handle Form Submission
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedCandidateId) {
      setError("Please select a candidate first.");
      return;
    }
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!title.trim()) {
      setError("Job title is required.");
      return;
    }

    startTransition(async () => {
      const res = await startApplicationFromDeskAction({
        candidateId: selectedCandidateId,
        companyName: companyName.trim(),
        title: title.trim(),
        source: source.trim(),
        externalUrl: externalUrl.trim() || undefined,
        location: location.trim() || undefined,
        employmentType: employmentType as any,
        isRemote,
        salaryMin: salaryMin ? parseInt(salaryMin, 10) : undefined,
        salaryMax: salaryMax ? parseInt(salaryMax, 10) : undefined,
        jobDescription: jobDescription.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined,
      });

      if (!res.success || !res.data) {
        setError(res.error || "Failed to initialize application.");
        return;
      }

      setSuccessResult({
        applicationId: res.data.applicationId,
        jobId: res.data.jobId,
        candidateName: selectedCandidate ? selectedCandidate.fullName : "Candidate",
        role: title.trim(),
        company: companyName.trim(),
        source: source.trim(),
        isExistingJob: res.data.isExistingJob,
      });

      // Refresh candidate summary
      handleCandidateSelect(selectedCandidateId);
      router.refresh();
    });
  }

  function handleResetForm(keepCandidate: boolean = true) {
    setSuccessResult(null);
    setError(null);
    setCompanyName("");
    setTitle("");
    setExternalUrl("");
    setJobDescription("");
    setInternalNotes("");
    setSalaryMin("");
    setSalaryMax("");
    if (!keepCandidate) {
      setSelectedCandidateId("");
      setCandidateSummary(null);
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "C";
  };

  return (
    <div className="max-w-[1240px] mx-auto space-y-6 pb-20">
      {/* 1. Compact Header (~110px) */}
      <div className="bg-white rounded-[20px] border border-[#E5EAE7]/90 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <nav className="flex items-center space-x-1.5 text-xs text-[#94A3B8] font-medium" aria-label="Breadcrumb">
              <Link href="/employee" className="hover:text-blue-600 transition-colors">
                OOS
              </Link>
              <span>/</span>
              <Link href="/employee/applications" className="hover:text-blue-600 transition-colors">
                Operations
              </Link>
              <span>/</span>
              <span className="text-[#64748B]">Application Desk</span>
            </nav>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[#0F1720] tracking-tight">Application Desk</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                Fast Intake
              </span>
            </div>
            <p className="text-xs text-[#64748B]">
              Initialize canonical applications, bind candidates to sourced jobs, and launch operational workbenches.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/employee/applications"
              className="inline-flex items-center px-3 py-1.5 rounded-[16px] border border-[#E5EAE7] bg-white text-[#334155] hover:bg-[#F7F9F8] hover:text-[#0F1720] text-xs font-medium transition shadow-2xs"
            >
              All Applications →
            </Link>
            <Link
              href="/employee/jobs"
              className="inline-flex items-center px-3 py-1.5 rounded-[16px] border border-[#E5EAE7] bg-white text-[#334155] hover:bg-[#F7F9F8] hover:text-[#0F1720] text-xs font-medium transition shadow-2xs"
            >
              Job Catalog →
            </Link>
          </div>
        </div>

        {/* Integrated Horizontal Metrics Rail */}
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#EDF1EF] border-t border-[#EDF1EF] bg-[#F7F9F8]/50 text-xs">
          <div className="px-6 py-2.5">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Submitted Today</div>
            <div className="text-base font-bold text-[#0F1720] mt-0.5">
              {initialMetrics.todayCount}
              <span className="text-[11px] font-normal text-[#94A3B8] ml-1.5">portal submissions</span>
            </div>
          </div>
          <div className="px-6 py-2.5">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">This Week</div>
            <div className="text-base font-bold text-[#0F1720] mt-0.5">
              {initialMetrics.weekCount}
              <span className="text-[11px] font-normal text-[#94A3B8] ml-1.5">past 7 days</span>
            </div>
          </div>
          <div className="px-6 py-2.5">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">This Month</div>
            <div className="text-base font-bold text-[#0F1720] mt-0.5">
              {initialMetrics.monthCount}
              <span className="text-[11px] font-normal text-[#94A3B8] ml-1.5">calendar month</span>
            </div>
          </div>
          <div className="px-6 py-2.5">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Active Candidates</div>
            <div className="text-base font-bold text-[#0F1720] mt-0.5">
              {initialMetrics.activeCandidatesWorked}
              <span className="text-[11px] font-normal text-[#94A3B8] ml-1.5">managed in org</span>
            </div>
          </div>
          <div className="px-6 py-2.5 col-span-2 sm:col-span-1">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Intake SLA</div>
            <div className="text-base font-bold text-emerald-600 mt-0.5">
              99.4%
              <span className="text-[11px] font-normal text-[#94A3B8] ml-1.5">canonical pace</span>
            </div>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successResult && (
        <div className="p-5 bg-emerald-50/80 border border-emerald-200 rounded-[20px] shadow-2xs space-y-3 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-[16px] bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                ✓
              </span>
              <div>
                <h3 className="text-sm font-bold text-[#0F1720]">
                  Application Created & Initialized in Lifecycle
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  <strong>{successResult.role}</strong> at <strong>{successResult.company}</strong> for candidate <strong>{successResult.candidateName}</strong> initialized in status <span className="font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded text-[11px]">DISCOVERED</span>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <Link
                href={`/employee/applications/${successResult.applicationId}`}
                className="inline-flex items-center px-4 py-2 rounded-[16px] text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition"
              >
                Open Application Workbench →
              </Link>
              <button
                type="button"
                onClick={() => handleResetForm(true)}
                className="inline-flex items-center px-3 py-2 rounded-[16px] text-xs font-semibold bg-white text-[#334155] border border-[#DDE5E0] hover:bg-[#F7F9F8] transition"
              >
                + Start Another
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-[20px] text-rose-800 text-xs font-semibold flex items-center justify-between shadow-2xs">
          <div className="flex items-center space-x-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-rose-900 font-bold ml-4 p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Unified Operational Workspace */}
      <div className="bg-white rounded-[20px] border border-[#E5EAE7]/90 shadow-2xs overflow-hidden divide-y divide-[#EDF1EF]">
        {/* SECTION 1: CANDIDATE SELECTION (Salesforce/Linear Combobox) */}
        <div className="p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#334155]">
              Candidate <span className="text-rose-500">*</span>
            </label>
            <span className="text-[11px] text-[#94A3B8]">
              Select candidate to link intake package
            </span>
          </div>

          <div className="relative" ref={comboboxRef}>
            {/* Combobox Trigger Button */}
            <button
              type="button"
              onClick={() => setIsComboboxOpen(!isComboboxOpen)}
              className="w-full text-left bg-white hover:bg-[#F7F9F8]/60 border border-[#DDE5E0] focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 rounded-[16px] p-3.5 flex items-center justify-between transition"
            >
              {selectedCandidate ? (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-[16px] bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    {getInitials(selectedCandidate.fullName)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0F1720] truncate">
                      {selectedCandidate.fullName}
                    </div>
                    <div className="text-xs text-[#64748B] truncate">
                      {selectedCandidate.email}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
                  <span className="w-8 h-8 rounded-[16px] bg-[#EDF1EF] text-[#94A3B8] flex items-center justify-center text-xs font-semibold">
                    👤
                  </span>
                  <span>Search and select candidate...</span>
                </div>
              )}

              <div className="flex items-center gap-2 shrink-0">
                {selectedCandidate && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                      selectedCandidate.applicationAuthorizationMode === "MANAGED"
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {selectedCandidate.applicationAuthorizationMode === "MANAGED"
                      ? "Managed"
                      : "Review Req"}
                  </span>
                )}
                <svg
                  className={`w-4 h-4 text-[#94A3B8] transition-transform ${
                    isComboboxOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Combobox Dropdown Popover */}
            {isComboboxOpen && (
              <div className="absolute z-30 mt-1.5 w-full bg-white rounded-[16px] border border-[#E5EAE7] shadow-lg overflow-hidden animate-in fade-in duration-150">
                <div className="p-2 border-b border-[#EDF1EF] bg-[#F7F9F8]/50">
                  <div className="relative">
                    <svg
                      className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search by candidate name or email..."
                      value={candidateSearchQuery}
                      onChange={(e) => setCandidateSearchQuery(e.target.value)}
                      className="w-full text-xs pl-9 pr-3 py-2 border border-[#E5EAE7] rounded-md focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 p-1">
                  {filteredCandidates.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#94A3B8]">
                      No matching candidates found.
                    </div>
                  ) : (
                    filteredCandidates.map((c) => {
                      const isSelected = c.id === selectedCandidateId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleCandidateSelect(c.id)}
                          className={`w-full text-left p-2.5 rounded-md flex items-center justify-between transition ${
                            isSelected
                              ? "bg-blue-50/80 text-blue-900 font-semibold"
                              : "hover:bg-[#F7F9F8] text-[#0F1720]"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-md bg-[#EDF1EF] text-[#334155] font-bold text-[11px] flex items-center justify-center shrink-0">
                              {getInitials(c.fullName)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">{c.fullName}</div>
                              <div className="text-[11px] text-[#94A3B8] truncate">{c.email}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-[#94A3B8]">
                              {c.applicationAuthorizationMode === "MANAGED" ? "Managed" : "Review Required"}
                            </span>
                            {isSelected && <span className="text-xs text-blue-600 font-bold">✓</span>}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Selected Candidate Operational Sub-Rail */}
          {isLoadingCandidate && (
            <div className="text-xs text-[#94A3B8] py-3 flex items-center gap-2">
              <svg className="animate-spin h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Loading candidate context...</span>
            </div>
          )}

          {candidateSummary && !isLoadingCandidate && (
            <div className="bg-[#F7F9F8]/80 rounded-[16px] p-4 border border-[#E5EAE7]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-4 text-[#64748B]">
                <span className="font-semibold text-[#334155]">Candidate throughput:</span>
                <span className="text-[#64748B]">
                  Today: <strong className="text-[#0F1720]">{candidateSummary.metrics.today}</strong>
                </span>
                <span>•</span>
                <span className="text-[#64748B]">
                  This week: <strong className="text-[#0F1720]">{candidateSummary.metrics.thisWeek}</strong>
                </span>
                <span>•</span>
                <span className="text-[#64748B]">
                  Total submitted: <strong className="text-[#0F1720]">{candidateSummary.metrics.totalSubmitted}</strong>
                </span>
              </div>

              {candidateSummary.recentApplications.length > 0 && candidateSummary.recentApplications[0] && (
                <div className="text-[#64748B] flex items-center gap-2">
                  <span>Last role: <strong>{candidateSummary.recentApplications[0].title}</strong></span>
                  <Link
                    href={`/employee/applications?candidateId=${candidateSummary.candidate.id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    View history ({candidateSummary.recentApplications.length}) →
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECTION 2: JOB & APPLICATION DETAILS FORM */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {/* Group 1: Primary Job Details */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-[#0F1720] uppercase tracking-wider">
              Job Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Company name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Airbnb"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full text-xs border border-[#DDE5E0] rounded-[16px] px-3.5 h-11 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 text-[#0F1720] placeholder:text-[#94A3B8] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Job title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Staff Frontend Platform Engineer"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs border border-[#DDE5E0] rounded-[16px] px-3.5 h-11 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 text-[#0F1720] placeholder:text-[#94A3B8] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Source <span className="text-rose-500">*</span>
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full text-xs border border-[#DDE5E0] rounded-[16px] px-3.5 h-11 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 text-[#0F1720] transition"
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  External job URL
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  className="w-full text-xs border border-[#DDE5E0] rounded-[16px] px-3.5 h-11 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 text-[#0F1720] placeholder:text-[#94A3B8] transition"
                />
              </div>
            </div>
          </div>

          {/* Group 2: Work Model & Specifications */}
          <div className="space-y-4 pt-4 border-t border-[#EDF1EF]">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-[#0F1720] uppercase tracking-wider">
                Work Model & Compensation
              </h2>
              <button
                type="button"
                onClick={() => setShowOptionalFields(!showOptionalFields)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {showOptionalFields ? "Hide optional fields" : "+ Show full details (notes, description)"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Remote / San Francisco"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full text-xs border border-[#DDE5E0] rounded-[16px] px-3.5 h-11 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 text-[#0F1720] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Employment type
                </label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className="w-full text-xs border border-[#DDE5E0] rounded-[16px] px-3.5 h-11 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 text-[#0F1720] transition"
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isRemote}
                    onChange={(e) => setIsRemote(e.target.checked)}
                    className="h-4 w-4 rounded border-[#DDE5E0] text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2.5 text-xs font-medium text-[#334155]">
                    Remote eligible
                  </span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Salary minimum ($)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 195000"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  className="w-full text-xs border border-[#DDE5E0] rounded-[16px] px-3.5 h-11 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 text-[#0F1720] placeholder:text-[#94A3B8] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Salary maximum ($)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 240000"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  className="w-full text-xs border border-[#DDE5E0] rounded-[16px] px-3.5 h-11 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 text-[#0F1720] placeholder:text-[#94A3B8] transition"
                />
              </div>
            </div>
          </div>

          {/* Group 3: Optional Description & Internal Notes */}
          {showOptionalFields && (
            <div className="space-y-4 pt-4 border-t border-[#EDF1EF] animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Job description & key qualifications
                </label>
                <textarea
                  rows={3}
                  placeholder="Paste key role requirements or summary..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="w-full text-xs border border-[#DDE5E0] rounded-[16px] p-3 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 text-[#0F1720] placeholder:text-[#94A3B8] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">
                  Internal staff notes (blind to candidate)
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional internal notes or directives for preparation & QA team..."
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  className="w-full text-xs border border-[#DDE5E0] rounded-[16px] p-3 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 text-[#0F1720] placeholder:text-[#94A3B8] transition"
                />
              </div>
            </div>
          )}

          {/* SECTION 3: PRIMARY ACTION BAR */}
          <div className="pt-6 border-t border-[#EDF1EF] flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => handleResetForm(true)}
              className="text-xs font-medium text-[#64748B] hover:text-[#0F1720] transition underline order-2 sm:order-1"
            >
              Clear form
            </button>

            <button
              type="submit"
              disabled={isPending || !selectedCandidateId}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-11 rounded-[16px] text-xs font-semibold text-white shadow-2xs transition order-1 sm:order-2 ${
                isPending || !selectedCandidateId
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
              }`}
            >
              {isPending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  Starting application...
                </>
              ) : (
                <>
                  <span>Start application</span>
                  <span className="text-sm">→</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* SECTION 4: APPLICATIONS BY SOURCE BREAKDOWN */}
        <div className="p-6 bg-[#F7F9F8]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-[#64748B]">
            Source distribution:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {Object.keys(initialMetrics.sourceCounts).length === 0 ? (
              <span className="text-[#94A3B8] italic">No submissions recorded yet</span>
            ) : (
              Object.entries(initialMetrics.sourceCounts).map(([src, count]) => (
                <span
                  key={src}
                  className="inline-flex items-center px-2.5 py-1 rounded-md bg-white border border-[#E5EAE7] text-[#334155] text-xs shadow-2xs"
                >
                  <span className="text-[#64748B]">{src}:</span>
                  <strong className="ml-1 text-[#0F1720]">{count}</strong>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
