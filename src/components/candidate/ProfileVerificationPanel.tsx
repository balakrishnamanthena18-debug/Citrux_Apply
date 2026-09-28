"use client";

import React from "react";
import Link from "next/link";
import { CareerSectionKey } from "./CandidateCareerNav";

interface Props {
  candidate: any;
  onNavigateSection: (section: CareerSectionKey) => void;
}

export function ProfileVerificationPanel({
  candidate,
  onNavigateSection,
}: Props) {
  const verifiedDateText = candidate.verifiedAt
    ? new Date(candidate.verifiedAt).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const factualVerificationChecklist = [
    {
      title: "Contact & Identification",
      isConfirmed: Boolean(candidate.phone && candidate.country),
      statusText: candidate.phone ? "Candidate Confirmed" : "Missing Details",
      section: "personal" as CareerSectionKey,
    },
    {
      title: "Professional Summary & Scope",
      isConfirmed: Boolean(candidate.headline && candidate.professionalSummary),
      statusText: candidate.headline ? "Candidate Confirmed" : "Needs Definition",
      section: "summary" as CareerSectionKey,
    },
    {
      title: "Work Experience Facts",
      isConfirmed: candidate.experiences && candidate.experiences.length > 0,
      statusText:
        candidate.experiences && candidate.experiences.length > 0
          ? `${candidate.experiences.length} Positions Active`
          : "Unpopulated",
      section: "experience" as CareerSectionKey,
    },
    {
      title: "Education Credentials",
      isConfirmed: candidate.educations && candidate.educations.length > 0,
      statusText:
        candidate.educations && candidate.educations.length > 0
          ? `${candidate.educations.length} Degrees Recorded`
          : "Unpopulated",
      section: "education" as CareerSectionKey,
    },
    {
      title: "Technical Skills",
      isConfirmed: candidate.skills && candidate.skills.length > 0,
      statusText:
        candidate.skills && candidate.skills.length > 0
          ? `${candidate.skills.length} Competencies Active`
          : "Needs Selection",
      section: "skills" as CareerSectionKey,
    },
    {
      title: "Work Authorization Declaration",
      isConfirmed: Boolean(candidate.workAuthorization && candidate.workAuthorization !== "OTHER"),
      statusText: candidate.workAuthorization ? candidate.workAuthorization.replace(/_/g, " ") : "Not Declared",
      section: "work_auth" as CareerSectionKey,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden space-y-6 p-5 sm:p-6 text-xs">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Profile Verification & Canonical Fact Provenance
          </h2>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              candidate.verificationStatus === "VERIFIED"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : candidate.verificationStatus === "PENDING_REVIEW"
                ? "bg-amber-50 text-amber-800 border border-amber-200"
                : candidate.verificationStatus === "REJECTED"
                ? "bg-rose-50 text-rose-800 border border-rose-200"
                : "bg-slate-100 text-slate-700 border border-slate-200"
            }`}
          >
            {candidate.verificationStatus === "VERIFIED"
              ? "✓ Staff Verified"
              : candidate.verificationStatus === "PENDING_REVIEW"
              ? "Under Verification Review"
              : candidate.verificationStatus === "REJECTED"
              ? "Correction Requested"
              : "Self-Confirmed"}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Factual audit verification of your canonical career record conducted by company operations
        </p>
      </div>

      {/* Verification Status Card */}
      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/90 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="font-semibold text-slate-900">
            {candidate.verificationStatus === "VERIFIED"
              ? "Verified Canonical Record"
              : "Active Candidate-Provided Record"}
          </span>
          {verifiedDateText && (
            <span className="text-slate-500 text-[11px]">
              Verified on {verifiedDateText}
            </span>
          )}
        </div>

        <p className="text-slate-600 leading-relaxed">
          {candidate.verificationStatus === "VERIFIED"
            ? "Our operations team has confirmed and verified your career facts, dates, and work authorization. Application tailoring proceeds directly using these verified milestones."
            : candidate.verificationStatus === "PENDING_REVIEW"
            ? "Your canonical career facts have been submitted and are undergoing verification review by your assigned specialist."
            : candidate.verificationStatus === "REJECTED"
            ? "Our operations team identified items that need your attention or clarification before submission staging can proceed."
            : "Your canonical facts are active. You can edit any section at any time to keep your operations team up to date."}
        </p>
      </div>

      {/* Candidate Visible Verification Notes if Any */}
      {candidate.verificationNotes && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Operations Team Verification Note:</span>
          </div>
          <p className="leading-relaxed whitespace-pre-wrap">
            {candidate.verificationNotes}
          </p>
        </div>
      )}

      {/* Factual Provenance Concept Card */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Fact Provenance & Authority Status
        </h3>

        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
          {factualVerificationChecklist.map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 bg-white flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    item.isConfirmed
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-400 border border-slate-300"
                  }`}
                >
                  {item.isConfirmed ? "✓" : "○"}
                </span>
                <span className="font-medium text-slate-900">{item.title}</span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`text-[11px] ${
                    item.isConfirmed ? "text-slate-500" : "text-amber-700 font-medium"
                  }`}
                >
                  {item.statusText}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateSection(item.section)}
                  className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                >
                  Edit →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
