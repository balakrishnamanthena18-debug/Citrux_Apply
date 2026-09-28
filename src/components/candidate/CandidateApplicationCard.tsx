"use client";

import React from "react";
import Link from "next/link";
import type { ApplicationStatus } from "@/generated/prisma";
import {
  getCandidateStatusPresentation,
  getCandidateActionRequirement,
  formatSalary,
} from "@/lib/utils/status-presenter";

export interface CandidateApplicationData {
  id: string;
  status: ApplicationStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  job: {
    id: string;
    title: string;
    companyName: string;
    location?: string | null;
    isRemote?: boolean;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
    source?: string | null;
    employmentType?: string | null;
  };
  submissions?: Array<{
    id: string;
    attemptNumber: number;
    submittedAt: string | Date;
  }>;
}

interface Props {
  application: CandidateApplicationData;
}

export function CandidateApplicationCard({ application }: Props) {
  const presentation = getCandidateStatusPresentation(application.status);
  const actionReq = getCandidateActionRequirement(application.status);
  const salaryText = formatSalary(
    application.job.salaryMin,
    application.job.salaryMax,
    application.job.salaryCurrency
  );
  const latestSub = application.submissions?.[0];

  const updatedDateText = new Date(application.updatedAt).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      {/* Left Details */}
      <div className="space-y-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${presentation.badgeClass}`}
          >
            {presentation.label}
          </span>

          {actionReq.isActionRequired && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
              ⚠️ {actionReq.actionText}
            </span>
          )}

          <span className="text-xs text-slate-400">
            Updated {updatedDateText}
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-base font-semibold text-slate-900">
            <Link
              href={`/candidate/applications/${application.id}`}
              className="hover:text-blue-600 transition"
            >
              {application.job.title}
            </Link>
          </h3>
          <span className="text-xs text-slate-400 font-normal">at</span>
          <span className="text-sm font-semibold text-slate-700">
            {application.job.companyName}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
          <span>
            {application.job.isRemote
              ? "🌐 Remote"
              : application.job.location || "Location unspecified"}
          </span>
          <span>•</span>
          <span
            className={
              salaryText === "Salary not disclosed"
                ? "text-slate-400"
                : "text-emerald-700 font-semibold"
            }
          >
            {salaryText}
          </span>
          {application.job.source && (
            <>
              <span>•</span>
              <span className="text-slate-500">
                Source: {application.job.source}
              </span>
            </>
          )}
        </div>

        <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
          {presentation.description}
        </p>

        {application.status === "SUBMITTED" && latestSub && (
          <div className="text-[11px] text-emerald-800 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 mt-1">
            <span>✓</span>
            <span>
              Submitted on{" "}
              {new Date(latestSub.submittedAt).toLocaleDateString([], {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              (Confirmation recorded)
            </span>
          </div>
        )}
      </div>

      {/* Right Action Button */}
      <div className="shrink-0 flex items-center">
        <Link
          href={`/candidate/applications/${application.id}`}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 shadow-2xs ${
            actionReq.isActionRequired
              ? "bg-amber-600 hover:bg-amber-700 text-white"
              : "bg-slate-900 hover:bg-slate-800 text-white"
          }`}
        >
          <span>{actionReq.isActionRequired ? "Review & Authorize" : "View Application"}</span>
          <span className="text-[13px] leading-none">→</span>
        </Link>
      </div>
    </div>
  );
}
