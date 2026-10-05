"use client";

import React from "react";
import Link from "next/link";
import { CareerSectionKey } from "./CandidateCareerNav";

interface Props {
  candidate: any;
  userEmail: string;
  userName: string;
  onNavigateSection: (section: CareerSectionKey) => void;
}

export function ProfileOverviewSection({
  candidate,
  userEmail,
  userName,
  onNavigateSection,
}: Props) {
  const completenessItems = [
    {
      id: "personal",
      label: "Contact Information",
      section: "personal" as CareerSectionKey,
      isComplete: Boolean(candidate.phone && (candidate.city || candidate.country)),
      detail: candidate.phone
        ? `${candidate.phone} · ${candidate.city || "Location recorded"}`
        : "Missing contact phone or location",
    },
    {
      id: "summary",
      label: "Professional Summary",
      section: "summary" as CareerSectionKey,
      isComplete: Boolean(candidate.headline && candidate.professionalSummary),
      detail: candidate.headline || "Headline and career focus missing",
    },
    {
      id: "experience",
      label: "Work Experience",
      section: "experience" as CareerSectionKey,
      isComplete: candidate.experiences && candidate.experiences.length > 0,
      detail:
        candidate.experiences && candidate.experiences.length > 0
          ? `${candidate.experiences.length} positions recorded`
          : "No experience entries added",
    },
    {
      id: "education",
      label: "Education History",
      section: "education" as CareerSectionKey,
      isComplete: candidate.educations && candidate.educations.length > 0,
      detail:
        candidate.educations && candidate.educations.length > 0
          ? `${candidate.educations.length} education records`
          : "No degrees recorded",
    },
    {
      id: "skills",
      label: "Skills Catalog",
      section: "skills" as CareerSectionKey,
      isComplete: candidate.skills && candidate.skills.length > 0,
      detail:
        candidate.skills && candidate.skills.length > 0
          ? `${candidate.skills.length} technical competencies cataloged`
          : "No skills cataloged yet",
    },
    {
      id: "projects",
      label: "Projects",
      section: "projects" as CareerSectionKey,
      isComplete: candidate.projects && candidate.projects.length > 0,
      detail:
        candidate.projects && candidate.projects.length > 0
          ? `${candidate.projects.length} project(s) recorded`
          : "No projects added yet",
    },
    {
      id: "work_auth",
      label: "Work Authorization",
      section: "work_auth" as CareerSectionKey,
      isComplete: Boolean(candidate.workAuthorization && candidate.workAuthorization !== "OTHER"),
      detail: candidate.workAuthorization ? candidate.workAuthorization.replace(/_/g, " ") : "Not configured",
    },
    {
      id: "documents",
      label: "Master Documents & Resume",
      section: "documents" as CareerSectionKey,
      isComplete: candidate.documents && candidate.documents.length > 0,
      detail:
        candidate.documents && candidate.documents.length > 0
          ? `${candidate.documents.length} document(s) uploaded in vault`
          : "No master resume uploaded",
    },
    {
      id: "preferences",
      label: "Job Search Boundaries",
      section: "preferences" as CareerSectionKey,
      isComplete: Boolean(candidate.targetRoles && candidate.targetRoles.length > 0),
      detail:
        candidate.targetRoles && candidate.targetRoles.length > 0
          ? `${candidate.targetRoles.length} target role(s) configured`
          : "Target roles unconfigured",
    },
  ];

  const incompleteItems = completenessItems.filter((i) => !i.isComplete);

  return (
    <div className="space-y-6">
      {/* Identity Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-slate-900 text-white font-bold text-lg flex items-center justify-center shadow-2xs shrink-0">
              {userName.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900 truncate">{userName}</h2>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    candidate.verificationStatus === "VERIFIED"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : candidate.verificationStatus === "PENDING_REVIEW"
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                >
                  {candidate.verificationStatus === "VERIFIED"
                    ? "✓ Staff Verified"
                    : candidate.verificationStatus === "PENDING_REVIEW"
                    ? "Verification Pending"
                    : "Candidate Confirmed"}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {candidate.headline || userEmail}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Canonical Career Record · Managed by Operations OS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => onNavigateSection("personal")}
              className="flex-1 sm:flex-initial text-center px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition shadow-2xs cursor-pointer"
            >
              Edit Contact
            </button>
            <button
              type="button"
              onClick={() => onNavigateSection("preferences")}
              className="flex-1 sm:flex-initial text-center px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs cursor-pointer"
            >
              Job Boundaries
            </button>
          </div>
        </div>
      </div>

      {/* Verification / Alert Banner if Action Needed */}
      {candidate.verificationNotes && (
        <div className="bg-amber-50/70 border border-amber-300 rounded-xl p-4 sm:p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-800 font-bold text-sm">⚠️</span>
              <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                Specialist Verification Note
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection("verification")}
              className="text-xs font-semibold text-amber-900 underline cursor-pointer"
            >
              View Verification Panel →
            </button>
          </div>
          <p className="text-xs text-amber-900 leading-relaxed">
            {candidate.verificationNotes}
          </p>
        </div>
      )}

      {/* Factual Career Health Checklist */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Canonical Record Health & Completeness
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified career facts utilized for resume tailoring and application staging
            </p>
          </div>

          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              incompleteItems.length === 0
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            {incompleteItems.length === 0
              ? "All Core Sections Configured"
              : `${incompleteItems.length} section(s) need attention`}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {completenessItems.map((item) => (
            <div
              key={item.id}
              className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    item.isComplete
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-400 border border-slate-300"
                  }`}
                >
                  {item.isComplete ? "✓" : "○"}
                </span>

                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{item.label}</div>
                  <div className={`truncate mt-0.5 ${item.isComplete ? "text-slate-500" : "text-amber-700 font-medium"}`}>
                    {item.detail}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateSection(item.section)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition shadow-2xs shrink-0 cursor-pointer"
              >
                {item.isComplete ? "Edit" : "Configure →"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
