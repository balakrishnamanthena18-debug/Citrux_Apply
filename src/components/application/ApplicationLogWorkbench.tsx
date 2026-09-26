"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startApplicationFromDeskAction, getCandidateLogSummaryAction } from "@/lib/application/actions";

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
  "LinkedIn",
  "Indeed",
  "Company Career",
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

  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(initialSelectedCandidateId);
  const [candidateSummary, setCandidateSummary] = useState<CandidateLogSummary | null>(initialCandidateSummary);
  const [isLoadingCandidate, setIsLoadingCandidate] = useState<boolean>(false);

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

  // Handle candidate selection change
  async function handleCandidateChange(candidateId: string) {
    setSelectedCandidateId(candidateId);
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

      const selectedCand = candidates.find((c) => c.id === selectedCandidateId);
      setSuccessResult({
        applicationId: res.data.applicationId,
        jobId: res.data.jobId,
        candidateName: selectedCand ? selectedCand.fullName : "Candidate",
        role: title.trim(),
        company: companyName.trim(),
        source: source.trim(),
        isExistingJob: res.data.isExistingJob,
      });

      // Refresh candidate summary
      handleCandidateChange(selectedCandidateId);
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

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Application Desk</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
              Fast Intake Entry Point
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Quickly initialize candidate applications and launch directly into the operational workbench.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-3">
          <Link
            href="/employee/applications"
            className="text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
          >
            All Applications Console →
          </Link>
          <Link
            href="/employee/jobs"
            className="text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
          >
            Job Catalog →
          </Link>
        </div>
      </div>

      {/* 2. Operational Derived Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted Today</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{initialMetrics.todayCount}</p>
          <p className="text-xs text-emerald-600 font-medium mt-1">External submissions</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">This Week</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{initialMetrics.weekCount}</p>
          <p className="text-xs text-slate-500 font-medium mt-1">Past 7 days</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">This Month</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{initialMetrics.monthCount}</p>
          <p className="text-xs text-slate-500 font-medium mt-1">Calendar month</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Candidates</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{initialMetrics.activeCandidatesWorked}</p>
          <p className="text-xs text-indigo-600 font-medium mt-1">Worked by team</p>
        </div>

        <div className="col-span-2 sm:col-span-4 lg:col-span-1 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Applications by Source</p>
          <div className="mt-2 flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
            {Object.keys(initialMetrics.sourceCounts).length === 0 ? (
              <span className="text-xs text-slate-400">No data yet</span>
            ) : (
              Object.entries(initialMetrics.sourceCounts).map(([src, count]) => (
                <span
                  key={src}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                >
                  <span className="truncate max-w-[80px]">{src}</span>: <strong className="ml-1">{count}</strong>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successResult && (
        <div className="p-5 bg-indigo-50 border border-indigo-200 rounded-xl shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold">
                  ✓
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-indigo-900">
                  Application Created & Initialized in Lifecycle
                </h3>
                <p className="text-xs text-indigo-700 mt-0.5">
                  <strong>{successResult.role}</strong> at <strong>{successResult.company}</strong> for candidate <strong>{successResult.candidateName}</strong> initialized in status <span className="font-semibold uppercase text-indigo-900 bg-indigo-100 px-1.5 py-0.5 rounded text-[11px]">DISCOVERED</span>.
                  {successResult.isExistingJob && (
                    <span className="ml-2 text-indigo-600 italic">(Linked to existing Job in catalog)</span>
                  )}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white text-indigo-800 border border-indigo-200 shadow-sm">
              Status: DISCOVERED
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between pt-3 border-t border-indigo-200/60 gap-3">
            <p className="text-xs text-indigo-700">
              Open the application workbench to prepare materials, execute QA verification, and record external submission.
            </p>
            <div className="flex items-center space-x-2">
              <Link
                href={`/employee/applications/${successResult.applicationId}`}
                className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow transition"
              >
                OPEN APPLICATION WORKBENCH →
              </Link>
              <button
                type="button"
                onClick={() => handleResetForm(true)}
                className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition"
              >
                + Start Another
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-rose-900 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Workspace: 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Candidate-First Context & Recent History */}
        <div className="lg:col-span-5 space-y-6">
          {/* Candidate Selector Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div>
              <label htmlFor="candidate-select" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Candidate *
              </label>
              <select
                id="candidate-select"
                value={selectedCandidateId}
                onChange={(e) => handleCandidateChange(e.target.value)}
                className="w-full text-sm font-medium border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900"
              >
                <option value="">-- Select Candidate --</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.email}) {c.applicationAuthorizationMode === "MANAGED" ? "• Managed" : "• Review Req"}
                  </option>
                ))}
              </select>
            </div>

            {isLoadingCandidate && (
              <div className="text-xs text-slate-500 flex items-center justify-center py-4">
                Loading candidate context...
              </div>
            )}

            {candidateSummary && !isLoadingCandidate && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">{candidateSummary.candidate.fullName}</h2>
                    <p className="text-xs text-slate-500">{candidateSummary.candidate.email}</p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                      candidateSummary.candidate.applicationAuthorizationMode === "MANAGED"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {candidateSummary.candidate.applicationAuthorizationMode}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Today</p>
                    <p className="text-base font-bold text-slate-900">{candidateSummary.metrics.today}</p>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <p className="text-[10px] uppercase font-bold text-slate-500">This Week</p>
                    <p className="text-base font-bold text-slate-900">{candidateSummary.metrics.thisWeek}</p>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Total Submitted</p>
                    <p className="text-base font-bold text-slate-900">{candidateSummary.metrics.totalSubmitted}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Candidate-Specific Application History */}
          {candidateSummary && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Recent Applications ({candidateSummary.candidate.fullName})
                </h3>
                <Link
                  href={`/employee/applications?candidateId=${candidateSummary.candidate.id}`}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  View All →
                </Link>
              </div>

              {candidateSummary.recentApplications.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No applications recorded yet for this candidate.</p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto pr-1">
                  {candidateSummary.recentApplications.map((app) => (
                    <div key={app.id} className="py-2.5 flex items-start justify-between text-xs">
                      <div className="space-y-0.5">
                        <Link
                          href={`/employee/applications/${app.id}`}
                          className="font-bold text-slate-900 hover:text-indigo-600 truncate block max-w-[200px]"
                        >
                          {app.title}
                        </Link>
                        <p className="text-slate-600">{app.companyName}</p>
                        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                          <span className="font-medium text-slate-500">{app.source}</span>
                          <span>•</span>
                          <span>{app.location || (app.isRemote ? "Remote" : "On-site")}</span>
                          {app.salaryMin && app.salaryMax && (
                            <>
                              <span>•</span>
                              <span>${(app.salaryMin / 1000).toFixed(0)}k–${(app.salaryMax / 1000).toFixed(0)}k</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {app.status}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {new Date(app.appliedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: High-Speed Fast Application Entry Form */}
        <div className="lg:col-span-7">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6"
          >
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-base font-bold text-slate-900">Start Application Fast</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Resolves or creates the canonical Job, initializes the Application in the canonical lifecycle, and launches the Workbench.
              </p>
            </div>

            {/* Core Job Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Airbnb"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Job Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Staff Frontend Platform Engineer"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Source *
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900"
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  External Job URL
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Location & Compensation */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Remote / San Francisco"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Employment Type
                </label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900"
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center pt-6">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRemote}
                    onChange={(e) => setIsRemote(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="ml-2 text-xs font-semibold text-slate-700">Remote Eligible</span>
                </label>
              </div>
            </div>

            {/* Salary Range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Salary Minimum ($)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 195000"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Salary Maximum ($)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 240000"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Job Description
              </label>
              <textarea
                rows={3}
                placeholder="Paste key role requirements or summary..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400"
              />
            </div>

            {/* Internal Staff Notes */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Internal Staff Notes (Staff-only, candidate blind)
              </label>
              <textarea
                rows={2}
                placeholder="Optional internal notes or instructions for preparation/QA team..."
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder:text-slate-400"
              />
            </div>

            {/* Submit Action */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleResetForm(true)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 underline"
              >
                Clear Form
              </button>

              <button
                type="submit"
                disabled={isPending || !selectedCandidateId}
                className={`inline-flex items-center px-6 py-2.5 rounded-lg text-sm font-bold text-white shadow-sm transition ${
                  isPending || !selectedCandidateId
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                }`}
              >
                {isPending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Initializing...
                  </>
                ) : (
                  "Initialize Application & Open Workbench →"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
