"use client";

import React, { useState, useTransition, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startApplicationFromDeskAction,
  getCandidateLogSummaryAction,
  searchDeskCandidatesAction,
  searchDeskJobsAction,
  getDeskJobDetailAction,
} from "@/lib/application/actions";
import { formatSalary } from "@/lib/utils/status-presenter";

export interface CandidateOption {
  id: string;
  fullName: string;
  email: string;
  status: string;
  applicationAuthorizationMode: string;
}

export interface JobOption {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  isRemote: boolean;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  source: string | null;
  externalUrl: string | null;
  jobDescription: string | null;
}

export interface OperationalMetrics {
  todayCount: number;
  weekCount: number;
  monthCount: number;
  activeCandidatesWorked: number;
  /** Authoritative OPEN job catalog size (not bounded selector length). */
  openJobsCount: number;
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
  jobs: JobOption[];
  metrics: OperationalMetrics;
  initialSelectedCandidateId?: string;
  initialSelectedJobId?: string;
  initialCandidateSummary?: CandidateLogSummary | null;
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "Full Time",
  PART_TIME: "Part Time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
};

function employmentLabel(type: string): string {
  return EMPLOYMENT_TYPE_LABELS[type] || type.replace(/_/g, " ");
}

function jobLocationLabel(job: JobOption): string {
  if (job.isRemote) return "Remote";
  return job.location?.trim() || "On-site";
}

function jobReturnHref(candidateId: string): string {
  const params = new URLSearchParams();
  params.set("returnTo", "application-log");
  if (candidateId) params.set("candidateId", candidateId);
  return `/employee/jobs?${params.toString()}`;
}

export function ApplicationLogWorkbench({
  candidates: initialCandidates,
  jobs: initialJobs,
  metrics: initialMetrics,
  initialSelectedCandidateId = "",
  initialSelectedJobId = "",
  initialCandidateSummary = null,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchedCandidates, setSearchedCandidates] = useState<CandidateOption[] | null>(null);
  const [searchedJobs, setSearchedJobs] = useState<JobOption[] | null>(null);
  const [jobDetailCache, setJobDetailCache] = useState<Record<string, JobOption>>({});

  const [selectedCandidateId, setSelectedCandidateId] = useState(initialSelectedCandidateId);
  const [selectedJobId, setSelectedJobId] = useState(initialSelectedJobId);
  const [candidateSummary, setCandidateSummary] =
    useState<CandidateLogSummary | null>(initialCandidateSummary);
  const [isLoadingCandidate, setIsLoadingCandidate] = useState(false);

  const [isCandidateOpen, setIsCandidateOpen] = useState(false);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
  const [debouncedCandidateQuery, setDebouncedCandidateQuery] = useState("");
  const candidateComboboxRef = useRef<HTMLDivElement>(null);

  const [isJobOpen, setIsJobOpen] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState("");
  const [debouncedJobQuery, setDebouncedJobQuery] = useState("");
  const jobComboboxRef = useRef<HTMLDivElement>(null);

  const [internalNotes, setInternalNotes] = useState("");
  const [changeJobConfirmOpen, setChangeJobConfirmOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    applicationId: string;
    jobId: string;
    candidateName: string;
    role: string;
    company: string;
    source: string;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedCandidateQuery(candidateSearchQuery.trim()),
      200
    );
    return () => clearTimeout(t);
  }, [candidateSearchQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedJobQuery(jobSearchQuery.trim()), 200);
    return () => clearTimeout(t);
  }, [jobSearchQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (candidateComboboxRef.current && !candidateComboboxRef.current.contains(target)) {
        setIsCandidateOpen(false);
      }
      if (jobComboboxRef.current && !jobComboboxRef.current.contains(target)) {
        setIsJobOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Server-side candidate search (bounded). Empty query uses initial page rows.
  useEffect(() => {
    if (!debouncedCandidateQuery) return;
    let cancelled = false;
    void (async () => {
      const res = await searchDeskCandidatesAction(debouncedCandidateQuery);
      if (cancelled || !res.success || !res.data) return;
      setSearchedCandidates(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedCandidateQuery]);

  // Server-side job search (bounded). Empty query uses initial page rows.
  useEffect(() => {
    if (!debouncedJobQuery) return;
    let cancelled = false;
    void (async () => {
      const res = await searchDeskJobsAction(debouncedJobQuery);
      if (cancelled || !res.success || !res.data) return;
      setSearchedJobs(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedJobQuery]);

  const filteredCandidates = useMemo(
    () => (debouncedCandidateQuery ? searchedCandidates ?? [] : initialCandidates),
    [debouncedCandidateQuery, searchedCandidates, initialCandidates]
  );
  const filteredJobs = useMemo(
    () => (debouncedJobQuery ? searchedJobs ?? [] : initialJobs),
    [debouncedJobQuery, searchedJobs, initialJobs]
  );
  const jobs = initialJobs;

  const selectedCandidate = useMemo(
    () =>
      filteredCandidates.find((c) => c.id === selectedCandidateId) ||
      initialCandidates.find((c) => c.id === selectedCandidateId),
    [filteredCandidates, initialCandidates, selectedCandidateId]
  );

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return (
      jobDetailCache[selectedJobId] ||
      filteredJobs.find((j) => j.id === selectedJobId) ||
      initialJobs.find((j) => j.id === selectedJobId) ||
      null
    );
  }, [selectedJobId, jobDetailCache, filteredJobs, initialJobs]);

  const hasUnsavedApplicationState = Boolean(internalNotes.trim());

  async function handleCandidateSelect(candidateId: string) {
    setSelectedCandidateId(candidateId);
    setIsCandidateOpen(false);
    setCandidateSearchQuery("");
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

  async function selectJob(jobId: string) {
    setSelectedJobId(jobId);
    setIsJobOpen(false);
    setJobSearchQuery("");
    setChangeJobConfirmOpen(false);
    setError(null);

    const existing =
      jobDetailCache[jobId] ||
      filteredJobs.find((j) => j.id === jobId) ||
      initialJobs.find((j) => j.id === jobId);
    if (existing?.jobDescription) {
      setJobDetailCache((prev) => ({ ...prev, [jobId]: existing }));
      return;
    }

    const res = await getDeskJobDetailAction(jobId);
    if (res.success && res.data) {
      setJobDetailCache((prev) => ({ ...prev, [jobId]: res.data! }));
    }
  }

  function requestChangeJob() {
    if (hasUnsavedApplicationState && selectedJobId) {
      setChangeJobConfirmOpen(true);
      return;
    }
    setSelectedJobId("");
    setIsJobOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedCandidateId) {
      setError("Select a candidate.");
      return;
    }
    if (!selectedJobId || !selectedJob) {
      setError("Select a job.");
      return;
    }

    startTransition(async () => {
      const res = await startApplicationFromDeskAction({
        candidateId: selectedCandidateId,
        jobId: selectedJobId,
        internalNotes: internalNotes.trim() || undefined,
      });

      if (!res.success || !res.data) {
        setError(res.error || "Failed to initialize application.");
        return;
      }

      setSuccessResult({
        applicationId: res.data.applicationId,
        jobId: res.data.jobId,
        candidateName: selectedCandidate?.fullName || "Candidate",
        role: selectedJob.title,
        company: selectedJob.companyName,
        source: selectedJob.source || "Other",
      });

      setInternalNotes("");
      handleCandidateSelect(selectedCandidateId);
      router.refresh();
    });
  }

  function handleResetForm(keepCandidate: boolean = true) {
    setSuccessResult(null);
    setError(null);
    setInternalNotes("");
    setSelectedJobId("");
    if (!keepCandidate) {
      setSelectedCandidateId("");
      setCandidateSummary(null);
    }
  }

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "C";

  const recordJobHref = selectedCandidateId
    ? jobReturnHref(selectedCandidateId)
    : "/employee/jobs";

  return (
    <div className="max-w-[1240px] mx-auto space-y-6 pb-20">
      {/* Header */}
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
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EDF1EF] text-[#0B3B2C] border border-[#DDE5E0]">
                Candidate → Job → Application
              </span>
            </div>
            <p className="text-xs text-[#64748B]">
              Select an existing candidate and job from the catalog, then create the application record.
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

        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#EDF1EF] border-t border-[#EDF1EF] bg-[#F7F9F8]/50 text-xs">
          <div className="px-6 py-2.5">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Submitted Today</div>
            <div className="text-base font-bold text-[#0F1720] mt-0.5">{initialMetrics.todayCount}</div>
          </div>
          <div className="px-6 py-2.5">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">This Week</div>
            <div className="text-base font-bold text-[#0F1720] mt-0.5">{initialMetrics.weekCount}</div>
          </div>
          <div className="px-6 py-2.5">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">This Month</div>
            <div className="text-base font-bold text-[#0F1720] mt-0.5">{initialMetrics.monthCount}</div>
          </div>
          <div className="px-6 py-2.5">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Active Candidates</div>
            <div className="text-base font-bold text-[#0F1720] mt-0.5">{initialMetrics.activeCandidatesWorked}</div>
          </div>
          <div className="px-6 py-2.5 col-span-2 sm:col-span-1">
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Open Jobs</div>
            <div className="text-base font-bold text-[#0F1720] mt-0.5">
              {initialMetrics.openJobsCount ?? jobs.length}
            </div>
          </div>
        </div>
      </div>

      {successResult && (
        <div className="p-5 bg-emerald-50/80 border border-emerald-200 rounded-[20px] shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-[16px] bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                ✓
              </span>
              <div>
                <h3 className="text-sm font-bold text-[#0F1720]">Application Created</h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  <strong>{successResult.role}</strong> at <strong>{successResult.company}</strong> for{" "}
                  <strong>{successResult.candidateName}</strong> — status{" "}
                  <span className="font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded text-[11px]">
                    DISCOVERED
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              <Link
                href={`/employee/applications/${successResult.applicationId}`}
                className="inline-flex items-center px-4 py-2 rounded-[16px] text-xs font-semibold bg-[#0B3B2C] hover:bg-[#0a3226] text-white shadow-2xs transition"
              >
                Open Application →
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

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-[20px] text-rose-800 text-xs font-semibold flex items-center justify-between shadow-2xs">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-600 hover:text-rose-900 font-bold ml-4 p-1">
            ✕
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-[20px] border border-[#E5EAE7]/90 shadow-2xs overflow-hidden divide-y divide-[#EDF1EF]"
      >
        {/* 1. CANDIDATE */}
        <div className="p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-semibold text-[#334155] uppercase tracking-wider">
              Candidate <span className="text-rose-500">*</span>
            </label>
            <span className="text-[11px] text-[#94A3B8]">Search and select candidate</span>
          </div>

          <div className="relative" ref={candidateComboboxRef}>
            <button
              type="button"
              onClick={() => {
                setIsCandidateOpen(!isCandidateOpen);
                setIsJobOpen(false);
              }}
              className="w-full text-left bg-white hover:bg-[#F7F9F8]/60 border border-[#DDE5E0] focus:border-[#12A150] focus:ring-1 focus:ring-[#12A150]/20 rounded-[16px] p-3.5 flex items-center justify-between transition"
            >
              {selectedCandidate ? (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-[16px] bg-[#0B3B2C] text-white font-bold text-xs flex items-center justify-center shrink-0">
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
              <svg
                className={`w-4 h-4 text-[#94A3B8] transition-transform shrink-0 ${isCandidateOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isCandidateOpen && (
              <div className="absolute z-30 mt-1.5 w-full bg-white rounded-[16px] border border-[#E5EAE7] shadow-lg overflow-hidden">
                <div className="p-2 border-b border-[#EDF1EF] bg-[#F7F9F8]/50">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search by name or email..."
                    value={candidateSearchQuery}
                    onChange={(e) => setCandidateSearchQuery(e.target.value)}
                    className="w-full text-xs border border-[#DDE5E0] rounded-[12px] px-3 h-10 bg-white focus:outline-none focus:border-[#12A150] text-[#0F1720]"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredCandidates.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-[#64748B]">No matching candidates.</div>
                  ) : (
                    filteredCandidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleCandidateSelect(c.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-[#F7F9F8] transition flex items-center gap-3 ${
                          c.id === selectedCandidateId ? "bg-[#F0F7F3]" : ""
                        }`}
                      >
                        <div className="w-8 h-8 rounded-[16px] bg-[#0B3B2C] text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {getInitials(c.fullName)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[#0F1720] truncate">{c.fullName}</div>
                          <div className="text-xs text-[#64748B] truncate">{c.email}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {isLoadingCandidate && (
            <p className="text-xs text-[#94A3B8]">Loading candidate summary…</p>
          )}
        </div>

        {/* 2. JOB */}
        <div className="p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-semibold text-[#334155] uppercase tracking-wider">
              Job <span className="text-rose-500">*</span>
            </label>
            <span className="text-[11px] text-[#94A3B8]">From Job Catalog</span>
          </div>

          {selectedJob ? (
            <div className="rounded-[16px] border border-[#DDE5E0] bg-[#F7F9F8]/60 p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Selected Job
                  </div>
                  <div className="text-base font-bold text-[#0F1720] leading-snug">
                    {selectedJob.title}
                  </div>
                  <div className="text-sm font-medium text-[#334155]">{selectedJob.companyName}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#64748B] pt-1">
                    <span>{jobLocationLabel(selectedJob)}</span>
                    <span>
                      {formatSalary(
                        selectedJob.salaryMin,
                        selectedJob.salaryMax,
                        selectedJob.salaryCurrency
                      )}
                    </span>
                    <span>{selectedJob.source || "Other"}</span>
                  </div>
                  {selectedJob.externalUrl && (
                    <a
                      href={selectedJob.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#0B3B2C] font-medium hover:underline pt-1"
                    >
                      External Posting ↗
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={requestChangeJob}
                  className="shrink-0 text-xs font-semibold text-[#0B3B2C] border border-[#DDE5E0] bg-white hover:bg-white px-3 py-1.5 rounded-[12px] transition"
                >
                  Change job
                </button>
              </div>

              {changeJobConfirmOpen && (
                <div className="rounded-[12px] border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-xs text-amber-900 font-medium">
                    Changing the job will update the application target.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setChangeJobConfirmOpen(false)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-[10px] border border-[#DDE5E0] bg-white text-[#334155]"
                    >
                      Keep current
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedJobId("");
                        setChangeJobConfirmOpen(false);
                        setIsJobOpen(true);
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-[10px] bg-[#0B3B2C] text-white"
                    >
                      Change job
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="relative" ref={jobComboboxRef}>
              <button
                type="button"
                onClick={() => {
                  setIsJobOpen(!isJobOpen);
                  setIsCandidateOpen(false);
                }}
                className="w-full text-left bg-white hover:bg-[#F7F9F8]/60 border border-[#DDE5E0] focus:border-[#12A150] focus:ring-1 focus:ring-[#12A150]/20 rounded-[16px] p-3.5 flex items-center justify-between transition"
              >
                <span className="text-sm text-[#94A3B8]">Search and select job...</span>
                <svg
                  className={`w-4 h-4 text-[#94A3B8] transition-transform shrink-0 ${isJobOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isJobOpen && (
                <div className="absolute z-30 mt-1.5 w-full bg-white rounded-[16px] border border-[#E5EAE7] shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-[#EDF1EF] bg-[#F7F9F8]/50">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search title, company, location, source..."
                      value={jobSearchQuery}
                      onChange={(e) => setJobSearchQuery(e.target.value)}
                      className="w-full text-xs border border-[#DDE5E0] rounded-[12px] px-3 h-10 bg-white focus:outline-none focus:border-[#12A150] text-[#0F1720]"
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {jobs.length === 0 ? (
                      <div className="px-4 py-8 text-center space-y-3">
                        <p className="text-xs font-semibold text-[#334155]">No jobs in the catalog yet.</p>
                        <Link
                          href={recordJobHref}
                          className="inline-flex items-center px-3 py-2 rounded-[12px] text-xs font-semibold bg-[#0B3B2C] text-white"
                        >
                          Record a job
                        </Link>
                      </div>
                    ) : filteredJobs.length === 0 ? (
                      <div className="px-4 py-8 text-center space-y-3">
                        <p className="text-xs font-semibold text-[#334155]">No matching jobs found.</p>
                        <Link
                          href={recordJobHref}
                          className="inline-flex items-center px-3 py-2 rounded-[12px] text-xs font-semibold border border-[#DDE5E0] bg-white text-[#0B3B2C]"
                        >
                          Record a new job
                        </Link>
                      </div>
                    ) : (
                      filteredJobs.map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => selectJob(j.id)}
                          className="w-full text-left px-4 py-3.5 hover:bg-[#F7F9F8] transition border-b border-[#F1F5F3] last:border-0"
                        >
                          <div className="text-sm font-semibold text-[#0F1720]">{j.title}</div>
                          <div className="text-xs font-medium text-[#334155] mt-0.5">{j.companyName}</div>
                          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[11px] text-[#64748B]">
                            <span>
                              {jobLocationLabel(j)}
                              {" · "}
                              {formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              {j.source || "Other"}
                              {j.externalUrl ? <span aria-hidden>↗</span> : null}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  {jobs.length > 0 && (
                    <div className="p-3 border-t border-[#EDF1EF] bg-[#F7F9F8]/80 text-center">
                      <p className="text-[11px] text-[#64748B] mb-2">Can&apos;t find the job?</p>
                      <Link
                        href={recordJobHref}
                        className="inline-flex items-center text-xs font-semibold text-[#0B3B2C] hover:underline"
                      >
                        + Record a new job
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. JOB DETAILS (read-only from Job record) */}
        {selectedJob && (
          <div className="p-6 sm:p-8 space-y-4 bg-[#F7F9F8]/40">
            <h2 className="text-xs font-bold text-[#0F1720] uppercase tracking-wider">Job Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">Company</div>
                <div className="text-sm font-medium text-[#0F1720]">{selectedJob.companyName}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">Job title</div>
                <div className="text-sm font-medium text-[#0F1720]">{selectedJob.title}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">Source</div>
                <div className="text-sm font-medium text-[#0F1720]">{selectedJob.source || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">Location</div>
                <div className="text-sm font-medium text-[#0F1720]">{jobLocationLabel(selectedJob)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">Employment type</div>
                <div className="text-sm font-medium text-[#0F1720]">
                  {employmentLabel(selectedJob.employmentType)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">Salary</div>
                <div className="text-sm font-medium text-[#0F1720]">
                  {formatSalary(
                    selectedJob.salaryMin,
                    selectedJob.salaryMax,
                    selectedJob.salaryCurrency
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">
                  External posting
                </div>
                {selectedJob.externalUrl ? (
                  <a
                    href={selectedJob.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-[#0B3B2C] hover:underline inline-flex items-center gap-1"
                  >
                    Open external job ↗
                  </a>
                ) : (
                  <div className="text-sm text-[#94A3B8]">Not provided</div>
                )}
              </div>
              {selectedJob.jobDescription && (
                <div className="sm:col-span-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">
                    Job description
                  </div>
                  <div className="text-sm text-[#334155] whitespace-pre-wrap rounded-[12px] border border-[#E5EAE7] bg-white p-3 max-h-48 overflow-y-auto">
                    {selectedJob.jobDescription}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. APPLICATION */}
        <div className="p-6 sm:p-8 space-y-5">
          <h2 className="text-xs font-bold text-[#0F1720] uppercase tracking-wider">Application</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">Candidate</div>
              <div className="text-sm font-medium text-[#0F1720]">
                {selectedCandidate?.fullName || "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">Job</div>
              <div className="text-sm font-medium text-[#0F1720]">
                {selectedJob
                  ? `${selectedJob.title} — ${selectedJob.companyName}`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">
                Application status
              </div>
              <div className="text-sm font-semibold text-[#0F1720]">DISCOVERED</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">
                Assigned employee
              </div>
              <div className="text-sm font-medium text-[#0F1720]">You (current session)</div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1">
              Notes <span className="text-[#94A3B8] font-normal">(application-specific, optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Internal notes for preparation & QA…"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              className="w-full text-xs border border-[#DDE5E0] rounded-[16px] p-3 bg-white focus:outline-none focus:border-[#12A150] focus:ring-1 focus:ring-[#12A150]/20 text-[#0F1720] placeholder:text-[#94A3B8] transition"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <p className="text-[11px] text-[#94A3B8]">
              Application references the selected Job by ID. Job details are not copied.
            </p>
            <button
              type="submit"
              disabled={isPending || !selectedCandidateId || !selectedJobId}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-[16px] text-xs font-semibold bg-[#0B3B2C] text-white hover:bg-[#0a3226] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-2xs"
            >
              {isPending ? "Creating…" : "Create Application"}
            </button>
          </div>
        </div>
      </form>

      {/* Candidate recent applications (preserved operational context) */}
      {candidateSummary && candidateSummary.recentApplications.length > 0 && (
        <div className="bg-white rounded-[20px] border border-[#E5EAE7]/90 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-[#EDF1EF]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F1720]">
              Recent Applications — {candidateSummary.candidate.fullName}
            </h2>
            <p className="text-[11px] text-[#64748B] mt-1">
              Today {candidateSummary.metrics.today} · This week {candidateSummary.metrics.thisWeek} ·
              Submitted total {candidateSummary.metrics.totalSubmitted}
            </p>
          </div>
          <ul className="divide-y divide-[#EDF1EF]">
            {candidateSummary.recentApplications.map((app) => (
              <li key={app.id} className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-semibold text-[#0F1720]">{app.title}</div>
                  <div className="text-[#64748B]">
                    {app.companyName} · {app.source} · {app.location}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-[#334155]">{app.status}</span>
                  <Link
                    href={`/employee/applications/${app.id}`}
                    className="text-[#0B3B2C] font-semibold hover:underline"
                  >
                    Open →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
