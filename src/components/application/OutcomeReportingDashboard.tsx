"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { Role } from "@/generated/prisma";
import {
  getOutcomeDetailAction,
  getOutcomeReportingAction,
} from "@/lib/application/outcome-reporting-actions";
import type {
  OutcomeDateRangePreset,
  OutcomeDetailDTO,
  OutcomeReportingFilters,
  OutcomeReportingResponseDTO,
} from "@/lib/application/outcome-reporting-types";

interface Props {
  initialData?: OutcomeReportingResponseDTO;
  role: Role;
}

export function OutcomeReportingDashboard({ initialData, role }: Props) {
  const [data, setData] = useState<OutcomeReportingResponseDTO | null>(
    initialData || null
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(null);
  const [outcomeDetail, setOutcomeDetail] = useState<OutcomeDetailDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Filters state
  const [dateRange, setDateRange] = useState<OutcomeDateRangePreset>("all");
  const [outcomeType, setOutcomeType] = useState<string>("ALL");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedEmployer, setSelectedEmployer] = useState<string>("");

  const loadReporting = useCallback(
    (customFilters?: Partial<OutcomeReportingFilters>) => {
      startTransition(async () => {
        setError(null);
        const filters: OutcomeReportingFilters = {
          dateRange: customFilters?.dateRange ?? dateRange,
          outcomeType: (customFilters?.outcomeType ?? outcomeType) as OutcomeReportingFilters["outcomeType"],
          employeeId: (customFilters?.employeeId ?? selectedEmployee) || undefined,
          teamKey: (customFilters?.teamKey ?? selectedTeam) || undefined,
          companyName: (customFilters?.companyName ?? selectedEmployer) || undefined,
        };

        const res = await getOutcomeReportingAction(filters);
        if (res.success) {
          setData(res.data);
        } else {
          setError(res.error);
        }
      });
    },
    [dateRange, outcomeType, selectedEmployee, selectedTeam, selectedEmployer]
  );

  useEffect(() => {
    if (!initialData) {
      loadReporting();
    }
  }, [initialData, loadReporting]);

  async function handleOpenDetail(outcomeId: string) {
    setSelectedOutcomeId(outcomeId);
    setDetailLoading(true);
    setDetailError(null);
    const res = await getOutcomeDetailAction(outcomeId);
    if (res.success) {
      setOutcomeDetail(res.data);
    } else {
      setDetailError(res.error);
    }
    setDetailLoading(false);
  }

  function handleCloseDetail() {
    setSelectedOutcomeId(null);
    setOutcomeDetail(null);
    setDetailError(null);
  }

  const isInitialLoading = !data && isPending;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Outcome Intelligence &amp; Reporting
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
              {role} SCOPE
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative post-submission outcome ledger analytics and operational conversion metrics.
          </p>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => loadReporting()}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
        >
          {isPending ? (
            <svg
              className="animate-spin h-3.5 w-3.5 text-slate-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          )}
          <span>{isPending ? "Refreshing…" : "Refresh"}</span>
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Filters
          </span>
          {/* Quick Date Presets */}
          <div className="flex flex-wrap gap-1">
            {(
              [
                { label: "All Time", value: "all" },
                { label: "7 Days", value: "7d" },
                { label: "30 Days", value: "30d" },
                { label: "90 Days", value: "90d" },
                { label: "This Year", value: "ytd" },
              ] as const
            ).map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => {
                  setDateRange(p.value);
                  loadReporting({ dateRange: p.value });
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  dateRange === p.value
                    ? "bg-slate-900 text-white font-semibold shadow-2xs"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Outcome Type Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Outcome Type
            </label>
            <select
              value={outcomeType}
              onChange={(e) => {
                setOutcomeType(e.target.value);
                loadReporting({ outcomeType: e.target.value as OutcomeReportingFilters["outcomeType"] });
              }}
              className="w-full text-xs rounded-lg border border-slate-300 bg-slate-50 p-2 text-slate-800 focus:bg-white focus:border-slate-900 focus:outline-hidden transition-colors"
            >
              <option value="ALL">All Outcomes</option>
              <option value="RECRUITER_CONTACT">Recruiter Contact</option>
              <option value="INTERVIEW_REQUESTED">Interview Requested</option>
              <option value="INTERVIEW_SCHEDULED">Interview Scheduled</option>
              <option value="OFFER_RECEIVED">Offer Received</option>
              <option value="EMPLOYER_REJECTION">Employer Rejection</option>
              <option value="CANDIDATE_REPORTED_ONLY">Candidate Reported Only</option>
              <option value="OTHER">Other Update</option>
            </select>
          </div>

          {/* Employee Filter */}
          {data?.availableFilters.employees && data.availableFilters.employees.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Employee Assignee
              </label>
              <select
                value={selectedEmployee}
                onChange={(e) => {
                  setSelectedEmployee(e.target.value);
                  loadReporting({ employeeId: e.target.value || null });
                }}
                className="w-full text-xs rounded-lg border border-slate-300 bg-slate-50 p-2 text-slate-800 focus:bg-white focus:border-slate-900 focus:outline-hidden transition-colors"
              >
                <option value="">All Scoped Staff</option>
                {data.availableFilters.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Team Filter */}
          {data?.availableFilters.teams && data.availableFilters.teams.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Team Key
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => {
                  setSelectedTeam(e.target.value);
                  loadReporting({ teamKey: e.target.value || null });
                }}
                className="w-full text-xs rounded-lg border border-slate-300 bg-slate-50 p-2 text-slate-800 focus:bg-white focus:border-slate-900 focus:outline-hidden transition-colors"
              >
                <option value="">All Teams</option>
                {data.availableFilters.teams.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Employer Filter */}
          {data?.availableFilters.employers && data.availableFilters.employers.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Employer / Company
              </label>
              <select
                value={selectedEmployer}
                onChange={(e) => {
                  setSelectedEmployer(e.target.value);
                  loadReporting({ companyName: e.target.value || null });
                }}
                className="w-full text-xs rounded-lg border border-slate-300 bg-slate-50 p-2 text-slate-800 focus:bg-white focus:border-slate-900 focus:outline-hidden transition-colors"
              >
                <option value="">All Employers</option>
                {data.availableFilters.employers.map((comp) => (
                  <option key={comp} value={comp}>
                    {comp}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-rose-600 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-xs font-semibold">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadReporting()}
            className="px-3 py-1 bg-rose-600 text-white font-semibold text-xs rounded-lg hover:bg-rose-700 transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}

      {/* Skeletons Loading View */}
      {isInitialLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-200 rounded-xl" />
            ))}
          </div>
          <div className="h-48 bg-slate-200 rounded-xl" />
          <div className="h-64 bg-slate-200 rounded-xl" />
        </div>
      )}

      {data && (
        <>
          {/* 1. OUTCOME PERFORMANCE: Key Volume Metrics */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Outcome Volume &amp; Status
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Submitted Applications */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  Submitted Apps
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {data.metrics.submittedApplicationsCount}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Distinct authoritative submissions
                </p>
              </div>

              {/* Recruiter Contacts */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide">
                  Recruiter Contacts
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {data.metrics.recruiterContactsCount}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {data.conversion.recruiterContactRate}% contact rate
                </p>
              </div>

              {/* Interview Requests */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">
                  Interview Requests
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {data.metrics.interviewRequestsCount}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {data.conversion.interviewRequestRate}% invitation rate
                </p>
              </div>

              {/* Interviews Scheduled */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-purple-600 uppercase tracking-wide">
                  Interviews Scheduled
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {data.metrics.interviewsScheduledCount}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {data.conversion.interviewScheduledRate}% scheduled rate
                </p>
              </div>

              {/* Offers Received */}
              <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                  Offers Received
                </span>
                <p className="text-2xl font-bold text-emerald-900 mt-1">
                  {data.metrics.offersReceivedCount}
                </p>
                <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                  {data.conversion.offerRate}% offer conversion
                </p>
              </div>

              {/* Employer Rejections */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wide">
                  Employer Rejections
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {data.metrics.employerRejectionsCount}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {data.conversion.employerRejectionRate}% rejection rate
                </p>
              </div>

              {/* Awaiting Outcome */}
              <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-2xs">
                <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">
                  Awaiting Outcome
                </span>
                <p className="text-2xl font-bold text-amber-950 mt-1">
                  {data.metrics.awaitingOutcomeCount}
                </p>
                <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                  Submitted with no active outcome
                </p>
              </div>

              {/* Candidate Reported Informational */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  Candidate Reported
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {data.metrics.candidateReportedCount}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {data.metrics.staffVerifiedCount} staff verified
                </p>
              </div>
            </div>
          </div>

          {/* 2. OUTCOME FUNNEL & PROGRESSION */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Outcome Conversion Funnel
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {/* Step 1 */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  1. Submitted
                </span>
                <p className="text-xl font-bold text-slate-900">
                  {data.metrics.submittedApplicationsCount}
                </p>
                <p className="text-[11px] text-slate-500 font-medium">100% baseline</p>
              </div>

              {/* Step 2 */}
              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-center space-y-1">
                <span className="text-[10px] font-bold text-blue-700 uppercase">
                  2. Recruiter Contact
                </span>
                <p className="text-xl font-bold text-blue-900">
                  {data.metrics.recruiterContactsCount}
                </p>
                <p className="text-[11px] text-blue-700 font-medium">
                  {data.conversion.recruiterContactRate}% of submitted
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-center space-y-1">
                <span className="text-[10px] font-bold text-indigo-700 uppercase">
                  3. Interview Requested
                </span>
                <p className="text-xl font-bold text-indigo-900">
                  {data.metrics.interviewRequestsCount}
                </p>
                <p className="text-[11px] text-indigo-700 font-medium">
                  {data.conversion.interviewRequestRate}% of submitted
                </p>
              </div>

              {/* Step 4 */}
              <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-lg text-center space-y-1">
                <span className="text-[10px] font-bold text-purple-700 uppercase">
                  4. Interview Scheduled
                </span>
                <p className="text-xl font-bold text-purple-900">
                  {data.metrics.interviewsScheduledCount}
                </p>
                <p className="text-[11px] text-purple-700 font-medium">
                  {data.conversion.interviewScheduledRate}% of submitted
                </p>
              </div>

              {/* Step 5 */}
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg text-center space-y-1">
                <span className="text-[10px] font-bold text-emerald-800 uppercase">
                  5. Offer Received
                </span>
                <p className="text-xl font-bold text-emerald-950">
                  {data.metrics.offersReceivedCount}
                </p>
                <p className="text-[11px] text-emerald-800 font-bold">
                  {data.conversion.offerRate}% conversion
                </p>
              </div>
            </div>
          </div>

          {/* 3. OUTCOME TIMING INTERVALS */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Time-to-Outcome Velocity
              </h3>
              {data.timing.hasRecordedTimingFallback && (
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                  Includes Recorded Timing (System Fallback)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  First Outcome
                </span>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {data.timing.avgDaysToFirstOutcome !== null
                    ? `${data.timing.avgDaysToFirstOutcome}d`
                    : "—"}
                </p>
                <p className="text-[10px] text-slate-500">Avg. days from submit</p>
              </div>

              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Recruiter Contact
                </span>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {data.timing.avgDaysToRecruiterContact !== null
                    ? `${data.timing.avgDaysToRecruiterContact}d`
                    : "—"}
                </p>
                <p className="text-[10px] text-slate-500">Avg. days from submit</p>
              </div>

              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Interview Request
                </span>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {data.timing.avgDaysToInterviewRequest !== null
                    ? `${data.timing.avgDaysToInterviewRequest}d`
                    : "—"}
                </p>
                <p className="text-[10px] text-slate-500">Avg. days from submit</p>
              </div>

              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/60">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Interview Scheduled
                </span>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {data.timing.avgDaysToInterviewScheduled !== null
                    ? `${data.timing.avgDaysToInterviewScheduled}d`
                    : "—"}
                </p>
                <p className="text-[10px] text-slate-500">Avg. days from submit</p>
              </div>

              <div className="p-3 rounded-lg border border-emerald-100 bg-emerald-50/30">
                <span className="text-[10px] font-bold text-emerald-800 uppercase">
                  Offer Received
                </span>
                <p className="text-lg font-bold text-emerald-950 mt-1">
                  {data.timing.avgDaysToOffer !== null
                    ? `${data.timing.avgDaysToOffer}d`
                    : "—"}
                </p>
                <p className="text-[10px] text-emerald-700">Avg. days from submit</p>
              </div>

              <div className="p-3 rounded-lg border border-rose-100 bg-rose-50/30">
                <span className="text-[10px] font-bold text-rose-800 uppercase">
                  Employer Rejection
                </span>
                <p className="text-lg font-bold text-rose-950 mt-1">
                  {data.timing.avgDaysToEmployerRejection !== null
                    ? `${data.timing.avgDaysToEmployerRejection}d`
                    : "—"}
                </p>
                <p className="text-[10px] text-rose-700">Avg. days from submit</p>
              </div>
            </div>
          </div>

          {/* 4. RECENT OUTCOMES ACTIVITY TABLE */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Recent Outcome Activity
              </h3>
              <span className="text-[11px] text-slate-500 font-medium">
                Showing latest {data.recentOutcomes.length} events
              </span>
            </div>

            {data.recentOutcomes.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm font-semibold text-slate-700">
                  No outcome activity yet
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Once submitted applications receive recorded updates, they will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Outcome</th>
                      <th className="py-2.5 px-3">Candidate</th>
                      <th className="py-2.5 px-3">Company &amp; Role</th>
                      <th className="py-2.5 px-3">Provenance</th>
                      <th className="py-2.5 px-3">Owner</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentOutcomes.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                          <p className="font-medium text-slate-900">
                            {new Date(item.occurredAt || item.recordedAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {item.isRecordedFallback ? "Recorded time" : "Occurred date"}
                          </p>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                              item.outcomeType === "OFFER_RECEIVED"
                                ? "bg-emerald-100 text-emerald-900"
                                : item.outcomeType === "EMPLOYER_REJECTION"
                                ? "bg-rose-100 text-rose-900"
                                : item.outcomeType === "INTERVIEW_SCHEDULED"
                                ? "bg-purple-100 text-purple-900"
                                : item.outcomeType === "INTERVIEW_REQUESTED"
                                ? "bg-indigo-100 text-indigo-900"
                                : item.outcomeType === "RECRUITER_CONTACT"
                                ? "bg-blue-100 text-blue-900"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {item.outcomeLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {item.candidateName}
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-900">{item.companyName}</p>
                          <p className="text-[11px] text-slate-500">{item.jobTitle}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.provenance === "CANDIDATE_REPORTED"
                                ? "bg-amber-100 text-amber-900"
                                : item.provenance === "STAFF_VERIFIED"
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-slate-200 text-slate-800"
                            }`}
                          >
                            {item.provenanceLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                          {item.ownerName}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(item.id)}
                            className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline cursor-pointer"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 5. ATTRIBUTION BREAKDOWNS (By Employee, Team, Manager, Employer) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Team */}
            {data.teamBreakdown && data.teamBreakdown.length > 0 && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Performance by Team
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-[11px]">
                        <th className="py-1.5 px-2">Team</th>
                        <th className="py-1.5 px-2 text-right">Submitted</th>
                        <th className="py-1.5 px-2 text-right">Interviews</th>
                        <th className="py-1.5 px-2 text-right">Offers</th>
                        <th className="py-1.5 px-2 text-right">Awaiting</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.teamBreakdown.map((t) => (
                        <tr key={t.dimensionKey}>
                          <td className="py-2 px-2 font-semibold text-slate-900">
                            {t.dimensionLabel}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-700">
                            {t.submittedCount}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-700">
                            {t.interviewsCount}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-800">
                            {t.offersCount}
                          </td>
                          <td className="py-2 px-2 text-right text-amber-800">
                            {t.awaitingCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* By Employee */}
            {data.employeeBreakdown && data.employeeBreakdown.length > 0 && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Performance by Employee
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-[11px]">
                        <th className="py-1.5 px-2">Staff Member</th>
                        <th className="py-1.5 px-2 text-right">Submitted</th>
                        <th className="py-1.5 px-2 text-right">Interviews</th>
                        <th className="py-1.5 px-2 text-right">Offers</th>
                        <th className="py-1.5 px-2 text-right">Awaiting</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.employeeBreakdown.map((e) => (
                        <tr key={e.dimensionKey}>
                          <td className="py-2 px-2 font-semibold text-slate-900">
                            {e.dimensionLabel}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-700">
                            {e.submittedCount}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-700">
                            {e.interviewsCount}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-800">
                            {e.offersCount}
                          </td>
                          <td className="py-2 px-2 text-right text-amber-800">
                            {e.awaitingCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* By Employer / Company */}
            {data.employerBreakdown && data.employerBreakdown.length > 0 && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3 lg:col-span-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Performance by Employer
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-[11px]">
                        <th className="py-1.5 px-2">Employer</th>
                        <th className="py-1.5 px-2 text-right">Submitted</th>
                        <th className="py-1.5 px-2 text-right">Interviews</th>
                        <th className="py-1.5 px-2 text-right">Offers</th>
                        <th className="py-1.5 px-2 text-right">Rejections</th>
                        <th className="py-1.5 px-2 text-right">Conversion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.employerBreakdown.map((emp) => (
                        <tr key={emp.dimensionKey}>
                          <td className="py-2 px-2 font-semibold text-slate-900">
                            {emp.dimensionLabel}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-700">
                            {emp.submittedCount}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-700">
                            {emp.interviewsCount}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-800">
                            {emp.offersCount}
                          </td>
                          <td className="py-2 px-2 text-right text-rose-700">
                            {emp.rejectionsCount}
                          </td>
                          <td className="py-2 px-2 text-right font-semibold text-slate-900">
                            {emp.conversionRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Outcome Detail Modal */}
      {selectedOutcomeId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="outcome-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3
                  id="outcome-detail-title"
                  className="text-sm font-bold text-slate-900"
                >
                  Outcome Record Detail
                </h3>
                <p className="text-xs text-slate-500">
                  Immutable event snapshot from outcome ledger
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseDetail}
                className="text-slate-400 hover:text-slate-600 font-bold text-base p-1 cursor-pointer"
                aria-label="Close detail modal"
              >
                ✕
              </button>
            </div>

            {detailLoading && (
              <div className="py-8 text-center text-xs text-slate-500 animate-pulse">
                Loading outcome detail…
              </div>
            )}

            {detailError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">
                {detailError}
              </div>
            )}

            {outcomeDetail && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      Outcome
                    </span>
                    <p className="font-bold text-slate-900">
                      {outcomeDetail.outcomeLabel}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      Provenance
                    </span>
                    <p className="font-bold text-slate-900">
                      {outcomeDetail.provenanceLabel}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      Candidate
                    </span>
                    <p className="font-semibold text-slate-800">
                      {outcomeDetail.candidateName}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      Company
                    </span>
                    <p className="font-semibold text-slate-800">
                      {outcomeDetail.companyName}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                    Timestamps
                  </span>
                  <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg space-y-1">
                    <p className="text-slate-700">
                      <span className="font-semibold">Recorded:</span>{" "}
                      {new Date(outcomeDetail.recordedAt).toLocaleString()}
                    </p>
                    <p className="text-slate-700">
                      <span className="font-semibold">Occurred:</span>{" "}
                      {outcomeDetail.occurredAt
                        ? new Date(outcomeDetail.occurredAt).toLocaleString()
                        : "Unknown (Using recorded timestamp fallback)"}
                    </p>
                  </div>
                </div>

                {outcomeDetail.notes && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      Operational Notes (Staff Internal)
                    </span>
                    <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 whitespace-pre-wrap">
                      {outcomeDetail.notes}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 border-t border-slate-100 pt-2">
                  <div>
                    <span className="font-semibold">Application Owner:</span>{" "}
                    {outcomeDetail.ownerName}
                  </div>
                  <div>
                    <span className="font-semibold">Actor:</span>{" "}
                    {outcomeDetail.actorName}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCloseDetail}
                className="px-4 py-1.5 bg-slate-900 text-white font-semibold rounded-lg text-xs hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
