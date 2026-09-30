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
      <div className="bg-[#0B3B2C] text-white rounded-[20px] p-6 sm:p-7 shadow-[0_4px_18px_rgba(15,23,32,0.06)] border border-[#0B3B2C]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#C6F432]">
                Candidate Command Center
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#12A150]" />
              <span className="text-xs text-white/70">
                Career Operations Desk
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {candidateGreetingTime}, {candidateName}
            </h1>
            <p className="text-xs sm:text-sm text-white/80 max-w-2xl">
              Here is what is happening across your active job search, tailored materials, and submission pipeline.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
            <Link
              href="/candidate/applications"
              className="flex-1 sm:flex-initial text-center px-4 py-2 rounded-[11px] text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition shadow-2xs"
            >
              All Applications
            </Link>
            <Link
              href="/candidate/messages"
              className="flex-1 sm:flex-initial text-center px-4 py-2 rounded-[11px] text-xs font-semibold bg-[#12A150] hover:bg-[#0E8541] text-white transition shadow-2xs"
            >
              Message Team
            </Link>
          </div>
        </div>

        {/* Horizontal Information & Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-xs">
          <div className="p-3.5 rounded-[14px] bg-white/[0.08] border border-white/10">
            <span className="text-[11px] font-semibold text-white/70 block">
              In Active Pipeline
            </span>
            <span className="text-xl font-bold text-white block mt-0.5">
              {stats.activeApplications}
            </span>
            <span className="text-[10px] text-white/60 block mt-0.5">
              Discovery, tailoring & review
            </span>
          </div>

          <div className="p-3.5 rounded-[14px] bg-amber-500/20 border border-amber-400/30">
            <span className="text-[11px] font-bold text-amber-200 block">
              Awaiting Your Review
            </span>
            <span className="text-xl font-bold text-white block mt-0.5">
              {stats.awaitingApprovalApplications}
            </span>
            <span className="text-[10px] text-amber-200/80 block mt-0.5">
              {stats.awaitingApprovalApplications > 0
                ? "Approval needed before submission"
                : "No pending sign-offs"}
            </span>
          </div>

          <div className="p-3.5 rounded-[14px] bg-[#12A150]/20 border border-[#12A150]/40">
            <span className="text-[11px] font-bold text-[#C6F432] block">
              Submitted Applications
            </span>
            <span className="text-xl font-bold text-white block mt-0.5">
              {stats.submittedApplications}
            </span>
            <span className="text-[10px] text-emerald-200/80 block mt-0.5">
              Verified employer receipts
            </span>
          </div>

          <div className="p-3.5 rounded-[14px] bg-white/[0.08] border border-white/10">
            <span className="text-[11px] font-semibold text-white/70 block">
              Profile Readiness
            </span>
            <span className="text-xl font-bold text-white block mt-0.5">
              {candidateProfile.verificationStatus === "VERIFIED"
                ? "Verified"
                : "Active"}
            </span>
            <span className="text-[10px] text-white/60 block mt-0.5">
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
