import Link from "next/link";
import type { ApplicationStatus } from "@/generated/prisma";
import {
  formatSalary,
  getCandidateStatusPresentation,
  getCandidateActionRequirement,
  getNextExpectedStage,
} from "@/lib/utils/status-presenter";
import { formatApplicationDateTime } from "@/lib/utils/format-application-date";
import { ApplicationProgressTracker } from "@/components/ApplicationProgressTracker";

export interface CandidateApplicationHeaderProps {
  job: {
    title: string;
    companyName: string;
    location?: string | null;
    isRemote?: boolean;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
    employmentType: string;
    source?: string | null;
    externalUrl?: string | null;
  };
  status: ApplicationStatus;
  lastEventDate?: Date | string | null;
}

export function CandidateApplicationHeader({
  job,
  status,
  lastEventDate,
}: CandidateApplicationHeaderProps) {
  const presentation = getCandidateStatusPresentation(status);
  const actionReq = getCandidateActionRequirement(status);
  const nextStage = getNextExpectedStage(status);

  const salaryText = formatSalary(
    job.salaryMin,
    job.salaryMax,
    job.salaryCurrency
  );

  const formattedDate = lastEventDate
    ? formatApplicationDateTime(lastEventDate)
    : null;

  // Status dot semantic color mapping
  const statusDotColor = presentation.isIncident
    ? "bg-rose-500"
    : actionReq.isActionRequired
    ? "bg-amber-500 animate-pulse"
    : presentation.isTerminal
    ? "bg-slate-400"
    : status === "SUBMITTED"
    ? "bg-emerald-500"
    : "bg-blue-600";

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* 1. Job Identity & Navigation */}
      <div className="p-6 pb-5 space-y-3">
        <Link
          href="/candidate/applications"
          className="text-xs font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1.5 transition"
        >
          <span>←</span>
          <span>Back to My Applications</span>
        </Link>

        <div className="space-y-1">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {job.title}
              </h1>
              <p className="text-base font-semibold text-slate-700 mt-0.5">
                {job.companyName}
              </p>
            </div>

            {job.externalUrl && (
              <a
                href={job.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 self-start sm:self-auto shrink-0"
              >
                <span>External Posting</span>
                <span>↗</span>
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
            <span className="font-medium text-slate-700">
              {job.location || (job.isRemote ? "Remote" : "Location unspecified")}
            </span>
            <span className="text-slate-300">•</span>
            <span className="font-medium text-slate-700">{salaryText}</span>
            <span className="text-slate-300">•</span>
            <span>Type: {job.employmentType.replace(/_/g, " ")}</span>
            {job.source && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">Source: {job.source}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Single Authoritative Current State Treatment (Visually Dominant) */}
      <div className="border-t border-slate-100 bg-slate-50/60 p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
          {/* Dominant Current State Description */}
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor}`} />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Authoritative Current State
              </span>
            </div>

            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                {presentation.label}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                {presentation.description}
              </p>
            </div>

            {formattedDate && (
              <p className="text-[11px] font-medium text-slate-400">
                Recorded {formattedDate}
              </p>
            )}
          </div>

          {/* Action State & Next Stage Operational Cards */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 md:min-w-[270px] md:max-w-[310px] shrink-0">
            {/* Candidate Action Requirement */}
            <div
              className={`p-3 rounded-lg border text-xs space-y-1 transition ${
                actionReq.isActionRequired
                  ? "bg-amber-50/90 border-amber-300 text-amber-950"
                  : "bg-white border-slate-200/90 text-slate-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    actionReq.isActionRequired ? "text-amber-800" : "text-slate-400"
                  }`}
                >
                  Your Action
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    actionReq.isActionRequired
                      ? "bg-amber-200 text-amber-900"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {actionReq.isActionRequired ? "Action Required" : "No Action Required"}
                </span>
              </div>

              <p className="text-[11px] leading-snug">
                {actionReq.isActionRequired
                  ? "Review tailored application materials and authorize submission."
                  : presentation.isTerminal
                  ? "Application concluded. No further actions active."
                  : "Operations team is managing this step on your behalf."}
              </p>

              {actionReq.isActionRequired && (
                <div className="pt-1.5">
                  <a
                    href="#approval-section"
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 hover:text-amber-950 underline underline-offset-2"
                  >
                    <span>Review Materials</span>
                    <span>→</span>
                  </a>
                </div>
              )}
            </div>

            {/* Next Stage Expectation */}
            {nextStage && !presentation.isTerminal && (
              <div className="p-3 rounded-lg border bg-white border-slate-200/90 text-xs space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Next Expected Stage
                </div>
                <div className="font-semibold text-slate-900 text-xs">
                  {nextStage.stageName}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  {nextStage.description}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. 5-Stage Progression Stepper (Quieter Supporting Context) */}
      <div className="border-t border-slate-200/80 p-5 bg-white">
        <ApplicationProgressTracker status={status} />
      </div>
    </div>
  );
}
