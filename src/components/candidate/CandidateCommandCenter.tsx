"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { CandidateActionCenter, CandidateActionItem } from "./CandidateActionCenter";
import { CandidatePipeline, PipelineStageKey } from "./CandidatePipeline";
import { CandidateApplicationList } from "./CandidateApplicationList";
import { CandidateApplicationData } from "./CandidateApplicationCard";
import { CandidateProfileHealth } from "./CandidateProfileHealth";
import { CandidateSpecialistCard } from "./CandidateSpecialistCard";
import { CandidateDocumentVault, CandidateVaultDocument } from "./CandidateDocumentVault";
import { CandidateActivityFeed, CandidateActivityEvent } from "./CandidateActivityFeed";

interface Props {
  candidateName: string;
  candidateGreetingTime: string;
  actions: CandidateActionItem[];
  applications: CandidateApplicationData[];
  candidateProfile: {
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
  specialist?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    designationName?: string | null;
  } | null;
  documents: CandidateVaultDocument[];
  activities: CandidateActivityEvent[];
  stats: {
    totalApplications: number;
    activeApplications: number;
    awaitingApprovalApplications: number;
    submittedApplications: number;
    readyApplications: number;
    preparingApplications: number;
    underReviewApplications: number;
    employerResponseApplications: number;
  };
}

export function CandidateCommandCenter({
  candidateName,
  candidateGreetingTime,
  actions,
  applications,
  candidateProfile,
  specialist,
  documents,
  activities,
  stats,
}: Props) {
  const [activeStage, setActiveStage] = useState<PipelineStageKey>("ALL");

  const pipelineCounts = useMemo(
    () => ({
      total: stats.totalApplications,
      preparing: stats.preparingApplications,
      underReview: stats.underReviewApplications,
      awaitingApproval: stats.awaitingApprovalApplications,
      ready: stats.readyApplications,
      submitted: stats.submittedApplications,
      employerResponse: stats.employerResponseApplications,
    }),
    [stats]
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* 1. Header with Restrained Height & Clear Hierarchy */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Candidate Command Center
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              <span className="text-xs text-slate-400">
                Career Operations Desk
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {candidateGreetingTime}, {candidateName}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Here is what is happening across your active job search, tailored materials, and submission pipeline.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
            <Link
              href="/candidate/applications"
              className="flex-1 sm:flex-initial text-center px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition shadow-2xs"
            >
              All Applications
            </Link>
            <Link
              href="/candidate/messages"
              className="flex-1 sm:flex-initial text-center px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs"
            >
              Message Team
            </Link>
          </div>
        </div>

        {/* Horizontal Information & Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100 text-xs">
          <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 block">
              In Active Pipeline
            </span>
            <span className="text-lg font-bold text-slate-900 block mt-0.5">
              {stats.activeApplications}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Discovery, tailoring & review
            </span>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200/80">
            <span className="text-[11px] font-semibold text-amber-800 block">
              Awaiting Your Review
            </span>
            <span className="text-lg font-bold text-amber-950 block mt-0.5">
              {stats.awaitingApprovalApplications}
            </span>
            <span className="text-[10px] text-amber-700 block mt-0.5">
              {stats.awaitingApprovalApplications > 0
                ? "Approval needed before submission"
                : "No pending sign-offs"}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200/80">
            <span className="text-[11px] font-semibold text-emerald-800 block">
              Submitted Applications
            </span>
            <span className="text-lg font-bold text-emerald-950 block mt-0.5">
              {stats.submittedApplications}
            </span>
            <span className="text-[10px] text-emerald-700 block mt-0.5">
              Verified employer receipts
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 block">
              Profile Readiness
            </span>
            <span className="text-lg font-bold text-slate-900 block mt-0.5">
              {candidateProfile.verificationStatus === "VERIFIED"
                ? "Verified"
                : "Active"}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {candidateProfile.documentsCount} documents in vault
            </span>
          </div>
        </div>
      </div>

      {/* 2. Priority Candidate Action Center */}
      <CandidateActionCenter actions={actions} userName={candidateName} />

      {/* 3. Operational Application Pipeline Track */}
      <CandidatePipeline
        activeStage={activeStage}
        onSelectStage={setActiveStage}
        counts={pipelineCounts}
      />

      {/* 4. Filtered Continuous Application List */}
      <CandidateApplicationList
        applications={applications}
        selectedStage={activeStage}
        onSelectStage={setActiveStage}
        title={
          activeStage === "ALL"
            ? "Active & Recent Applications"
            : `Pipeline: ${activeStage.replace(/_/g, " ")}`
        }
        subtitle="Continuous operational list with transparent stage statuses and direct candidate actions"
        showViewAllLink={true}
      />

      {/* 5. Operational Context Grid (2 columns on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Specialist & Document Vault */}
        <div className="space-y-6 flex flex-col justify-between">
          <CandidateSpecialistCard
            specialist={specialist}
            activeApplicationsCount={stats.activeApplications}
          />
          <CandidateDocumentVault documents={documents} />
        </div>

        {/* Right Column: Profile Health & Recent Activities */}
        <div className="space-y-6 flex flex-col justify-between">
          <CandidateProfileHealth candidate={candidateProfile} />
          <CandidateActivityFeed events={activities} />
        </div>
      </div>
    </div>
  );
}
