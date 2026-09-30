"use client";

import React from "react";
import Link from "next/link";

export interface ProfileHealthItem {
  id: string;
  label: string;
  isComplete: boolean;
  details: string;
}

interface Props {
  candidate: {
    phone?: string | null;
    city?: string | null;
    country?: string | null;
    headline?: string | null;
    professionalSummary?: string | null;
    workAuthorization?: string | null;
    experiencesCount: number;
    educationsCount: number;
    skillsCount: number;
    documentsCount: number;
    verificationStatus?: string | null;
  };
}

export function CandidateProfileHealth({ candidate }: Props) {
  const items: ProfileHealthItem[] = [
    {
      id: "contact",
      label: "Contact & Location",
      isComplete: Boolean(candidate.phone && (candidate.city || candidate.country)),
      details: candidate.phone
        ? `${candidate.phone} · ${candidate.city || "Location set"}`
        : "Missing contact phone or location",
    },
    {
      id: "summary",
      label: "Professional Summary",
      isComplete: Boolean(candidate.headline && candidate.professionalSummary),
      details: candidate.headline
        ? candidate.headline
        : "Add headline & professional career focus",
    },
    {
      id: "experience",
      label: "Work Experience",
      isComplete: candidate.experiencesCount > 0,
      details:
        candidate.experiencesCount > 0
          ? `${candidate.experiencesCount} position${
              candidate.experiencesCount > 1 ? "s" : ""
            } recorded`
          : "No work experience entries added",
    },
    {
      id: "education",
      label: "Education History",
      isComplete: candidate.educationsCount > 0,
      details:
        candidate.educationsCount > 0
          ? `${candidate.educationsCount} education record${
              candidate.educationsCount > 1 ? "s" : ""
            }`
          : "No degree or institution added",
    },
    {
      id: "skills",
      label: "Technical & Professional Skills",
      isComplete: candidate.skillsCount > 0,
      details:
        candidate.skillsCount > 0
          ? `${candidate.skillsCount} skill${
              candidate.skillsCount > 1 ? "s" : ""
            } cataloged`
          : "Add core competencies & tools",
    },
    {
      id: "resume",
      label: "Tailoring Resume & Files",
      isComplete: candidate.documentsCount > 0,
      details:
        candidate.documentsCount > 0
          ? `${candidate.documentsCount} document${
              candidate.documentsCount > 1 ? "s" : ""
            } uploaded in vault`
          : "Upload base resume for tailoring",
    },
    {
      id: "work_auth",
      label: "Work Authorization",
      isComplete: Boolean(
        candidate.workAuthorization && candidate.workAuthorization !== "OTHER"
      ),
      details: candidate.workAuthorization
        ? candidate.workAuthorization.replace(/_/g, " ")
        : "Specify citizenship or visa eligibility",
    },
  ];

  const incompleteCount = items.filter((i) => !i.isComplete).length;

  return (
    <div className="bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E5EAE7] bg-[#F7F9F8] flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F1720]">
              Career Profile Health
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Canonical fact verification & profile completeness
            </p>
          </div>

          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              incompleteCount === 0
                ? "bg-[#12A150]/[0.08] text-[#0B3B2C] border border-[#12A150]/20"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}
          >
            {incompleteCount === 0
              ? "All Core Sections Complete"
              : `${incompleteCount} item${incompleteCount > 1 ? "s" : ""} to complete`}
          </span>
        </div>

        {/* Checklist */}
        <div className="divide-y divide-[#EDF1EF] px-5 py-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="py-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    item.isComplete
                      ? "bg-[#12A150]/[0.12] text-[#12A150]"
                      : "bg-[#F7F9F8] text-[#94A3B8] border border-[#E5EAE7]"
                  }`}
                >
                  {item.isComplete ? "✓" : "○"}
                </span>
                <span
                  className={`font-medium truncate ${
                    item.isComplete ? "text-[#0F1720]" : "text-[#64748B]"
                  }`}
                >
                  {item.label}
                </span>
              </div>

              <span
                className={`truncate text-right max-w-[180px] sm:max-w-[220px] ${
                  item.isComplete ? "text-[#64748B]" : "text-amber-700 font-medium"
                }`}
              >
                {item.details}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="px-5 py-3.5 border-t border-[#EDF1EF] bg-[#F7F9F8] flex items-center justify-between">
        <span className="text-xs text-[#64748B]">
          Canonical source of truth
        </span>
        <Link
          href="/candidate/profile"
          className="text-xs font-semibold text-[#12A150] hover:text-[#0B3B2C] inline-flex items-center gap-1"
        >
          <span>Review Career Profile</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
