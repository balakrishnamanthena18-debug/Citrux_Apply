"use client";

import React from "react";
import Link from "next/link";
import type { DualTrackWorkflowStatus } from "@/lib/application/workflow-status";
import type { ApplicationPrerequisitesEvaluation } from "@/lib/application/prerequisites";
import type { ApplicationStatus } from "@/generated/prisma/enums";

interface ApplicationWorkspaceHeaderProps {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  createdAt: string;
  ownerDisplayName: string;
  ownerInactive: boolean;
  continuityOutsideScope: boolean;
  isRemote: boolean;
  location?: string | null;
  salaryText: string;
  employmentType: string;
  externalJobUrl?: string | null;
  status: ApplicationStatus | string;
  workflow: DualTrackWorkflowStatus;
  prerequisites: ApplicationPrerequisitesEvaluation;
}

function getStatusBadgeDetails(status: string) {
  switch (status) {
    case "DISCOVERED":
      return {
        label: "Discovered",
        classes: "bg-slate-100 text-slate-700 border-slate-200",
        dotColor: "bg-slate-400",
      };
    case "QUALIFIED":
      return {
        label: "Qualified",
        classes: "bg-blue-50 text-blue-700 border-blue-200",
        dotColor: "bg-blue-500",
      };
    case "PREPARING":
      return {
        label: "In Preparation",
        classes: "bg-indigo-50 text-indigo-700 border-indigo-200",
        dotColor: "bg-indigo-500",
      };
    case "REVIEW":
      return {
        label: "Quality Review Pending",
        classes: "bg-purple-50 text-purple-800 border-purple-200 font-semibold",
        dotColor: "bg-purple-600",
      };
    case "AWAITING_APPROVAL":
      return {
        label: "Candidate Sign-off Pending",
        classes: "bg-amber-50 text-amber-900 border-amber-300 font-semibold",
        dotColor: "bg-amber-500",
      };
    case "READY":
      return {
        label: "Ready to Submit",
        classes: "bg-sky-50 text-sky-900 border-sky-300 font-bold",
        dotColor: "bg-sky-600",
      };
    case "SUBMITTED":
      return {
        label: "Submitted to Employer",
        classes: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold",
        dotColor: "bg-emerald-600",
      };
    case "SUBMISSION_ISSUE":
      return {
        label: "Submission Issue",
        classes: "bg-rose-50 text-rose-800 border-rose-300 font-bold",
        dotColor: "bg-rose-600",
      };
    case "REVIEW_REQUIRED":
      return {
        label: "Incident Review Required",
        classes: "bg-rose-50 text-rose-800 border-rose-300 font-bold",
        dotColor: "bg-rose-600",
      };
    case "CORRECTION_APPROVED":
      return {
        label: "Correction Approved",
        classes: "bg-purple-50 text-purple-800 border-purple-200 font-semibold",
        dotColor: "bg-purple-600",
      };
    case "RESUBMISSION":
      return {
        label: "Resubmission Staged",
        classes: "bg-purple-50 text-purple-800 border-purple-200 font-semibold",
        dotColor: "bg-purple-600",
      };
    case "REJECTED":
      return {
        label: "Rejected",
        classes: "bg-red-50 text-red-800 border-red-200",
        dotColor: "bg-red-500",
      };
    case "WITHDRAWN":
      return {
        label: "Withdrawn",
        classes: "bg-slate-100 text-slate-800 border-slate-200",
        dotColor: "bg-slate-400",
      };
    case "FAILED":
      return {
        label: "Failed",
        classes: "bg-rose-50 text-rose-900 border-rose-300",
        dotColor: "bg-rose-600",
      };
    default:
      return {
        label: status.replace(/_/g, " "),
        classes: "bg-slate-100 text-slate-700 border-slate-200",
        dotColor: "bg-slate-500",
      };
  }
}

export function ApplicationWorkspaceHeader({
  applicationId: _applicationId,
  candidateId,
  candidateName,
  jobTitle,
  companyName,
  createdAt,
  ownerDisplayName,
  ownerInactive,
  continuityOutsideScope,
  isRemote,
  location,
  salaryText,
  employmentType,
  externalJobUrl,
  status,
  workflow: _workflow,
  prerequisites,
}: ApplicationWorkspaceHeaderProps) {
  const statusDetails = getStatusBadgeDetails(status);
  const isSafeJobUrl =
    prerequisites.safeJobUrl.isSafe && Boolean(prerequisites.safeJobUrl.sanitizedUrl);

  return (
    <header className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-4">
      {/* 1. Concise Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <Link
          href="/employee/applications"
          className="hover:text-slate-900 transition hover:underline"
        >
          Applications
        </Link>
        <span className="text-slate-300" aria-hidden="true">/</span>
        <Link
          href={`/employee/candidates/${candidateId}`}
          className="hover:text-slate-900 transition hover:underline font-semibold text-slate-700"
        >
          {candidateName}
        </Link>
        <span className="text-slate-300" aria-hidden="true">/</span>
        <span className="text-slate-900 font-bold truncate max-w-sm">{jobTitle}</span>
      </nav>

      {/* 2. Main Title Row with Status Pill and Contextual Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
              {jobTitle}
            </h1>
            {/* Single Authoritative Status Badge */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusDetails.classes}`}
            >
              <span className={`w-2 h-2 rounded-full ${statusDetails.dotColor}`} aria-hidden="true" />
              <span>{statusDetails.label}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-800 text-sm">{companyName}</span>
            <span className="text-slate-300" aria-hidden="true">•</span>
            <Link
              href={`/employee/candidates/${candidateId}`}
              className="text-indigo-600 hover:text-indigo-800 font-semibold hover:underline"
            >
              Candidate: {candidateName}
            </Link>
            <span className="text-slate-300" aria-hidden="true">•</span>
            <span>Created {createdAt}</span>
          </div>
        </div>

        {/* External Destination Button */}
        <div className="flex items-center gap-2 shrink-0">
          {externalJobUrl && isSafeJobUrl ? (
            <a
              href={prerequisites.safeJobUrl.sanitizedUrl || externalJobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/90 text-slate-700 text-xs font-semibold hover:bg-slate-100 hover:text-slate-900 transition inline-flex items-center gap-1.5 shadow-2xs"
            >
              <span>Employer Job Posting</span>
              <span className="text-slate-400" aria-hidden="true">↗</span>
            </a>
          ) : externalJobUrl ? (
            <span
              title={prerequisites.safeJobUrl.error || "Unsafe employer URL blocked"}
              className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 cursor-not-allowed"
            >
              <span>⚠️ Employer URL Blocked</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* 3. Streamlined Metadata Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-0.5">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Accountable Owner
          </span>
          <span
            className={`font-semibold block truncate ${
              ownerInactive
                ? "text-rose-700 font-bold"
                : continuityOutsideScope
                ? "text-amber-700"
                : "text-slate-800"
            }`}
          >
            {ownerInactive
              ? `⚠️ Inactive (${ownerDisplayName})`
              : continuityOutsideScope
              ? `${ownerDisplayName} (Scope)`
              : ownerDisplayName}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Location
          </span>
          <span className="font-medium text-slate-800 block truncate">
            {isRemote ? "🌐 Remote" : location || "On-site"}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Employment
          </span>
          <span className="font-medium text-slate-800 block truncate">
            {employmentType.replace(/_/g, " ")}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Compensation
          </span>
          <span
            className={`font-semibold block truncate ${
              salaryText === "Salary not disclosed"
                ? "text-slate-500 font-normal"
                : "text-emerald-700 font-bold"
            }`}
          >
            {salaryText}
          </span>
        </div>
      </div>
    </header>
  );
}
