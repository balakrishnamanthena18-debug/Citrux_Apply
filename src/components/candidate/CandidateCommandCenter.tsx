"use client";

import React, { useState, useMemo } from "react";
import { CandidateActionCenter, CandidateActionItem } from "./CandidateActionCenter";
import { CandidatePipeline, PipelineStageKey, getPipelineListSubtitle, getPipelineListTitle } from "./CandidatePipeline";
import { CandidateApplicationList } from "./CandidateApplicationList";
import { CandidateApplicationData } from "./CandidateApplicationCard";
import { CandidateProfileHealth } from "./CandidateProfileHealth";
import { CandidateSpecialistCard } from "./CandidateSpecialistCard";
import { CandidateDocumentVault, CandidateVaultDocument } from "./CandidateDocumentVault";
import { CandidateActivityFeed, CandidateActivityEvent } from "./CandidateActivityFeed";
import { PageHero } from "@/components/ui/PageHero";
import { MetricStrip } from "@/components/ui/MetricStrip";

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
    projectsCount: number;
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
    <div className="mx-auto max-w-6xl space-y-6 pb-6 sm:space-y-8 sm:pb-16">
      <PageHero
        eyebrow="Candidate desk"
        title={`${candidateGreetingTime}, ${candidateName}`}
        description="Here is what is happening across your active job search, tailored materials, and submission pipeline."
        primaryAction={
          stats.awaitingApprovalApplications > 0
            ? { label: "Review approvals", href: "/candidate/applications" }
            : { label: "View applications", href: "/candidate/applications" }
        }
        secondaryAction={{ label: "Message team", href: "/candidate/messages" }}
        tiles={[
          {
            label: "In pipeline",
            count: stats.activeApplications,
            href: "/candidate/applications",
            description: "Discovery, tailoring & review",
            tone: stats.activeApplications > 0 ? "blue" : "neutral",
          },
          {
            label: "Awaiting you",
            count: stats.awaitingApprovalApplications,
            href: "/candidate/applications",
            description:
              stats.awaitingApprovalApplications > 0
                ? "Approval needed before submission"
                : "No pending sign-offs",
            tone: stats.awaitingApprovalApplications > 0 ? "amber" : "neutral",
          },
          {
            label: "Submitted",
            count: stats.submittedApplications,
            href: "/candidate/applications",
            description: "Verified employer receipts",
            tone: stats.submittedApplications > 0 ? "blue" : "neutral",
          },
          {
            label: "Ready",
            count: stats.readyApplications,
            href: "/candidate/applications",
            description: "Packages cleared for submit",
            tone: stats.readyApplications > 0 ? "blue" : "neutral",
          },
          {
            label: "Documents",
            count: candidateProfile.documentsCount,
            href: "/candidate/profile",
            description:
              candidateProfile.verificationStatus === "VERIFIED"
                ? "Profile verified"
                : "Vault & profile readiness",
            tone: "neutral",
          },
        ]}
      />

      <MetricStrip
        items={[
          { label: "Active pipeline", value: stats.activeApplications, href: "/candidate/applications" },
          {
            label: "Awaiting your review",
            value: stats.awaitingApprovalApplications,
            href: "/candidate/applications",
            accent: stats.awaitingApprovalApplications > 0,
          },
          { label: "Submitted", value: stats.submittedApplications, href: "/candidate/applications", accent: true },
          { label: "Documents", value: candidateProfile.documentsCount, href: "/candidate/profile" },
        ]}
      />

      {/* Priority Candidate Action Center */}
      <CandidateActionCenter actions={actions} userName={candidateName} />

      {/* Operational Application Pipeline Track */}
      <div className="space-y-3">
        <CandidatePipeline
          activeStage={activeStage}
          onSelectStage={setActiveStage}
          counts={pipelineCounts}
        />

        {/* Filtered Continuous Application List — visually continuous with pipeline */}
        <CandidateApplicationList
          applications={applications}
          selectedStage={activeStage}
          onSelectStage={setActiveStage}
          title={getPipelineListTitle(activeStage)}
          subtitle={getPipelineListSubtitle(activeStage)}
          showViewAllLink={true}
        />
      </div>
      {/* Operational Context Grid (2 columns on desktop) */}
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
