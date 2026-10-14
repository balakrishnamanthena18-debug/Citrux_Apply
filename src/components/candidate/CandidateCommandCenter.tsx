"use client";

import React, { useState, useMemo } from "react";
import { CandidateActionItem } from "./CandidateActionCenter";
import { CandidatePipeline, PipelineStageKey, getPipelineListSubtitle, getPipelineListTitle } from "./CandidatePipeline";
import { CandidateApplicationList } from "./CandidateApplicationList";
import { CandidateApplicationData } from "./CandidateApplicationCard";
import { CandidateProfileHealth } from "./CandidateProfileHealth";
import { CandidateSpecialistCard } from "./CandidateSpecialistCard";
import { CandidateDocumentVault, CandidateVaultDocument } from "./CandidateDocumentVault";
import { CandidateActivityFeed, CandidateActivityEvent } from "./CandidateActivityFeed";
import { CandidateNextBestAction, NextBestActionData } from "./CandidateNextBestAction";
import { CandidateCareerProgress, CareerMilestone } from "./CandidateCareerProgress";
import { CandidateUpcomingEvents, CandidateUpcomingEventItem } from "./CandidateUpcomingEvents";
import { CandidateServiceStatus, CandidateServiceContractData } from "./CandidateServiceStatus";
import { PageHero } from "@/components/ui/PageHero";

interface Props {
  candidateName: string;
  candidateGreetingTime: string;
  actions: CandidateActionItem[];
  nextBestAction: NextBestActionData;
  careerMilestones: CareerMilestone[];
  currentStageName: string;
  upcomingEvents: CandidateUpcomingEventItem[];
  serviceContract?: CandidateServiceContractData | null;
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
    verificationNotes?: string | null;
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
    scheduledInterviewsCount?: number;
  };
}

export function CandidateCommandCenter({
  candidateName,
  candidateGreetingTime,
  actions,
  nextBestAction,
  careerMilestones,
  currentStageName,
  upcomingEvents,
  serviceContract,
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

  const interviewCount = stats.scheduledInterviewsCount ?? upcomingEvents.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-6 sm:space-y-8 sm:pb-16">
      {/* 1. Authoritative Customer Hero */}
      <PageHero
        eyebrow="Candidate desk"
        title={`${candidateGreetingTime}, ${candidateName}`}
        description="Authoritative overview of your verified career progress, tailored materials, and active employer pipeline."
        primaryAction={
          stats.awaitingApprovalApplications > 0
            ? { label: "Review approvals", href: "/candidate/applications" }
            : { label: "View applications", href: "/candidate/applications" }
        }
        secondaryAction={{ label: "Message desk", href: "/candidate/messages" }}
        tiles={[
          {
            label: "In pipeline",
            count: stats.activeApplications,
            href: "/candidate/applications",
            description: "Active in tailoring or submitted",
            tone: stats.activeApplications > 0 ? "blue" : "neutral",
            helpTopic: "active_pipeline",
          },
          {
            label: "Awaiting you",
            count: stats.awaitingApprovalApplications,
            href: "/candidate/applications",
            description:
              stats.awaitingApprovalApplications > 0
                ? "Sign-off needed before submission"
                : "No pending sign-offs",
            tone: stats.awaitingApprovalApplications > 0 ? "amber" : "neutral",
            helpTopic: "awaiting_approval",
          },
          {
            label: "Submitted",
            count: stats.submittedApplications,
            href: "/candidate/applications",
            description: "Verified employer receipts",
            tone: stats.submittedApplications > 0 ? "blue" : "neutral",
            helpTopic: "submitted_applications",
          },
          {
            label: "Interviews",
            count: interviewCount,
            href: "/candidate/interviews",
            description:
              interviewCount > 0
                ? "Scheduled employer rounds"
                : "Interview pipeline active",
            tone: interviewCount > 0 ? "blue" : "neutral",
            helpTopic: "interview_round_type",
          },
          {
            label: "Documents",
            count: candidateProfile.documentsCount,
            href: "/candidate/profile",
            description:
              candidateProfile.verificationStatus === "VERIFIED"
                ? "Profile verified in vault"
                : "Vault & profile readiness",
            tone: "neutral",
            helpTopic: "document_vault",
          },
        ]}
      />

      {/* 2. Focused Next Best Action (High visual priority, clear explanation of why it matters) */}
      <CandidateNextBestAction action={nextBestAction} />

      {/* 3. Transparent Career Progress & Milestone Journey */}
      <CandidateCareerProgress
        milestones={careerMilestones}
        currentStageName={currentStageName}
        activeApplicationsCount={stats.activeApplications}
        submittedApplicationsCount={stats.submittedApplications}
        interviewsCount={interviewCount}
      />

      {/* 4. Upcoming Events & Interview Operating System */}
      <CandidateUpcomingEvents events={upcomingEvents} />

      {/* 5. Service & Subscription Status (rendered only when applicable) */}
      {serviceContract && <CandidateServiceStatus contract={serviceContract} />}

      {/* 6. Authoritative Application Pipeline Track */}
      <div className="space-y-3">
        <CandidatePipeline
          activeStage={activeStage}
          onSelectStage={setActiveStage}
          counts={pipelineCounts}
        />

        {/* Filtered Continuous Application List */}
        <CandidateApplicationList
          applications={applications}
          selectedStage={activeStage}
          onSelectStage={setActiveStage}
          title={getPipelineListTitle(activeStage)}
          subtitle={getPipelineListSubtitle(activeStage)}
          showViewAllLink={true}
        />
      </div>

      {/* 7. Operational Context Grid (2 columns on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Left Column: Dedicated Specialist Desk & Document Vault */}
        <div className="space-y-5">
          <CandidateSpecialistCard
            specialist={specialist}
            activeApplicationsCount={stats.activeApplications}
          />
          <CandidateDocumentVault documents={documents} />
        </div>

        {/* Right Column: Profile Health & Chronological Activity Feed */}
        <div className="space-y-5">
          <CandidateProfileHealth candidate={candidateProfile} />
          <CandidateActivityFeed events={activities} />
        </div>
      </div>
    </div>
  );
}
