"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Candidate360DTO } from "@/lib/candidate-360/types";
import type {
  CareerStrengthTier,
  FactAuthorityLevel,
} from "@/lib/career/types";

interface Props {
  data: Candidate360DTO;
  // Optional children or slot components for mutations (Assignment, Status, Verification, Notes, Documents)
  actionSlots?: {
    assignmentControl?: React.ReactNode;
    verificationControl?: React.ReactNode;
    lifecycleControl?: React.ReactNode;
    documentsSection?: React.ReactNode;
    privateOpportunitiesSection?: React.ReactNode;
    notesWidget?: React.ReactNode;
  };
}

export function StaffCandidate360View({ data, actionSlots }: Props) {
  const { candidate, career, resume, applications, matching, outcomes, staffContext, freshness } = data;

  // State for interactive filters and expandable evidence drawers
  const [selectedTier, setSelectedTier] = useState<"ALL" | CareerStrengthTier>("ALL");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"EVIDENCE" | "APPLICATIONS" | "MATCHING" | "TIMELINE" | "GAPS" | "OUTCOMES" | "GOVERNANCE">("EVIDENCE");

  const toggleSkillExpand = (skillNormalized: string) => {
    setExpandedSkill((prev) => (prev === skillNormalized ? null : skillNormalized));
  };

  const filteredSkills = career.skills.filter((s) => {
    if (selectedTier === "ALL") return true;
    return s.strengthTier === selectedTier;
  });

  const filteredTimeline = career.timeline.filter((item) => {
    if (timelineFilter === "ALL") return true;
    return item.type === timelineFilter;
  });

  const getAuthorityBadge = (level: FactAuthorityLevel | "SYSTEM_DERIVED" | string) => {
    switch (level) {
      case "VERIFIED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Verified Credential
          </span>
        );
      case "EVIDENCED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
            <svg className="w-3 h-3 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Supported by multiple records
          </span>
        );
      case "SYSTEM_DERIVED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <svg className="w-3 h-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Found in resume
          </span>
        );
      case "SELF_DECLARED":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Added to profile
          </span>
        );
    }
  };

  const getTierBadge = (tier: CareerStrengthTier) => {
    switch (tier) {
      case "CORE":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
            Core Competency
          </span>
        );
      case "STRONG":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
            Strong Capability
          </span>
        );
      case "EMERGING":
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
            Emerging Skill
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ========================================================================= */}
      {/* 1. COMPACT PROFESSIONAL STAFF HEADER */}
      {/* ========================================================================= */}
      <header aria-label="Candidate 360 Header" className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-4">
        {/* Breadcrumb & Subsystem Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5">
            <Link href="/employee/candidates" className="text-slate-600 hover:text-slate-900 font-medium">
              Candidates Directory
            </Link>
            <span>/</span>
            <span className="text-slate-900 font-semibold">{candidate.fullName || candidate.email}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
              Staff Operational 360
            </span>
            <span className="text-[11px] text-slate-400">
              Computed {new Date(freshness.computedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Title, Headline, and Identity Block */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {candidate.fullName || "Candidate Record"}
              </h1>

              {/* Verification & Lifecycle Badges */}
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  candidate.verificationStatus === "VERIFIED"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : candidate.verificationStatus === "PENDING_REVIEW"
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : candidate.verificationStatus === "REJECTED"
                    ? "bg-rose-50 text-rose-800 border border-rose-200"
                    : "bg-slate-100 text-slate-700 border border-slate-200"
                }`}
              >
                {candidate.verificationStatus === "VERIFIED" ? "✓ Verified" : (candidate.verificationStatus ? candidate.verificationStatus.replace(/_/g, " ") : "Unverified")}
              </span>

              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  candidate.applicationAuthMode === "MANAGED"
                    ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                    : "bg-slate-100 text-slate-700 border border-slate-200"
                }`}
              >
                {candidate.applicationAuthMode === "MANAGED" ? "Managed Mode" : "Manual Review"}
              </span>
            </div>

            {candidate.headline && (
              <p className="text-sm font-medium text-slate-700 max-w-3xl">
                {candidate.headline}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 pt-0.5">
              <span>📧 {candidate.email}</span>
              {candidate.phone && <span>📞 {candidate.phone}</span>}
              {candidate.location && <span>📍 {candidate.location}</span>}
              {candidate.totalYearsExperience !== null && (
                <span>💼 {candidate.totalYearsExperience} Years Exp</span>
              )}
              <span>🛡️ {candidate.workAuthorization ? candidate.workAuthorization.replace(/_/g, " ") : "Not specified"} {candidate.requiresSponsorship ? "(Sponsorship Required)" : ""}</span>
            </div>
          </div>

          {/* Specialist & Quick Links Block */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0 bg-slate-50 p-3 rounded-lg border border-slate-200/80 text-xs">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Assigned Specialist
              </div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {candidate.assignedSpecialist ? candidate.assignedSpecialist.name : "Unassigned"}
              </div>
              <div className="text-slate-500 text-[11px]">
                {candidate.assignedSpecialist ? candidate.assignedSpecialist.email : "Assign specialist below"}
              </div>
            </div>

            <div className="flex sm:flex-col gap-1.5 w-full sm:w-auto border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-3">
              <Link
                href={`/employee/application-log?candidateId=${candidate.id}`}
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium text-center text-xs transition"
              >
                Application Desk →
              </Link>
              <Link
                href={`/employee/messages`}
                className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-center text-xs transition"
              >
                Messages
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. OPERATIONAL STATUS BAR (BOUNDED METRICS) */}
      {/* ========================================================================= */}
      <section aria-label="Operational Status Summary" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Applications */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Applications</span>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {applications.totalApplications}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {applications.readyCount} Ready • {applications.blockedCount} Blocked
          </div>
        </div>

        {/* Job Matches */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Matches</span>
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {matching.totalRelevantMatches}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {matching.strongMatchCount} Strong • {matching.savedOpportunitiesCount} Saved
          </div>
        </div>

        {/* Resume ATS Status */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Resume</span>
            <span className={`w-2 h-2 rounded-full ${resume.hasResume ? "bg-emerald-500" : "bg-amber-500"}`} />
          </div>
          <div className="text-sm font-bold text-slate-900 truncate">
            {resume.hasResume ? resume.atsLabel || "Parsed & Ready" : "No Resume"}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {resume.findingsCount} Findings • Phase 4
          </div>
        </div>

        {/* Outcomes */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Outcomes</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {outcomes.totalOutcomes}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {outcomes.interviewRequestsCount} Interviews • {outcomes.offersCount} Offers
          </div>
        </div>

        {/* Evidence Depth */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Evidence</span>
            <span className="w-2 h-2 rounded-full bg-purple-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {career.careerSnapshot.verifiedSkillsCount + career.careerSnapshot.evidencedSkillsCount}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {career.careerSnapshot.totalEvidencedEntities} Sources • Phase 7C
          </div>
        </div>

        {/* Staff Operations Context */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>Staff Context</span>
            <span className="w-2 h-2 rounded-full bg-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {staffContext ? staffContext.internalNotesCount : 0} Notes
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {staffContext ? staffContext.activeTasksCount : 0} Tasks • Confidential
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. OPERATIONAL NAVIGATION TABS */}
      {/* ========================================================================= */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto pb-1" aria-label="Staff 360 Sections">
          {[
            { key: "EVIDENCE", label: `Career Evidence (${career.skills.length})` },
            { key: "APPLICATIONS", label: `Applications (${applications.totalApplications})` },
            { key: "MATCHING", label: `Job Matches (${matching.totalRelevantMatches})` },
            { key: "TIMELINE", label: `Timeline (${career.timeline.length})` },
            { key: "GAPS", label: `Strengths & Gaps (${career.gaps.length})` },
            { key: "OUTCOMES", label: `Outcomes (${outcomes.totalOutcomes})` },
            { key: "GOVERNANCE", label: "Operations & Governance" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`py-2 px-3 border-b-2 font-medium text-xs whitespace-nowrap transition cursor-pointer ${
                activeTab === tab.key
                  ? "border-slate-900 text-slate-900 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ========================================================================= */}
      {/* 4. TAB CONTENT: CAREER EVIDENCE (STAFF HUB) */}
      {/* ========================================================================= */}
      {activeTab === "EVIDENCE" && (
        <section aria-labelledby="staff-evidence-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 id="staff-evidence-heading" className="text-lg font-bold text-slate-900">
                Authoritative Career Evidence & Competencies
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic cross-entity corroboration derived by Phase 7C Career Evidence Service.
              </p>
            </div>

            {/* Strength Tier Filters */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto overflow-x-auto max-w-full">
              {(["ALL", "CORE", "STRONG", "EMERGING"] as const).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setSelectedTier(tier)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedTier === tier
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tier === "ALL" ? "All Skills" : tier === "CORE" ? "Core" : tier === "STRONG" ? "Strong" : "Emerging"}
                </button>
              ))}
            </div>
          </div>

          {filteredSkills.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <p className="text-sm font-medium text-slate-600">
                No career evidence recorded in this strength tier yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSkills.map((skill) => {
                const isExpanded = expandedSkill === skill.normalizedName;
                return (
                  <div
                    key={skill.normalizedName}
                    className={`rounded-xl border transition-all ${
                      isExpanded
                        ? "border-indigo-300 bg-indigo-50/20 shadow-xs"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div
                      onClick={() => toggleSkillExpand(skill.normalizedName)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleSkillExpand(skill.normalizedName);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-slate-900">{skill.name}</span>
                          {getTierBadge(skill.strengthTier)}
                          {getAuthorityBadge(skill.authorityLevel)}
                          {skill.recency === "RECENT" && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                              Active Recency
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600">
                          {skill.strengthTier === "CORE"
                            ? `Core competency corroborated across ${skill.evidenceDepth} independent entities with verified recent activity.`
                            : skill.strengthTier === "STRONG"
                            ? `Strong capability corroborated across ${skill.evidenceDepth} independent entities.`
                            : `Emerging capability supported by 1 recorded entity.`}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded">
                          {skill.evidenceDepth} {skill.evidenceDepth === 1 ? "source entity" : "source entities"}
                        </span>
                        <svg
                          className={`w-4 h-4 text-slate-400 transition-transform ${
                            isExpanded ? "rotate-180 text-indigo-600" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded Staff Provenance Details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Corroborating Evidence Sources &amp; Provenance
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {skill.sources.map((src, idx) => (
                            <div
                              key={`${src.sourceType}-${src.sourceId}-${idx}`}
                              className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1 shadow-2xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-800">
                                  {src.sourceType === "EXPERIENCE"
                                    ? "💼 Work Experience"
                                    : src.sourceType === "PROJECT"
                                    ? "🚀 Portfolio Project"
                                    : src.sourceType === "CERTIFICATION"
                                    ? "📜 Certification"
                                    : src.sourceType === "DOCUMENT_EXTRACT"
                                    ? "📄 Resume Extract (Advisory)"
                                    : src.sourceType === "ATTESTATION"
                                    ? "🛡️ Staff Attestation"
                                    : "👤 Profile Skill"}
                                </span>
                                {src.isVerified && (
                                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    Verified
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-600">{src.displayContext}</p>
                              <div className="text-[10px] text-slate-400 pt-0.5">
                                Recency: {src.recency} • Recorded: {new Date(src.recordedAt).toLocaleDateString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 5. TAB CONTENT: APPLICATIONS (PHASE 2 SUMMARY) */}
      {/* ========================================================================= */}
      {activeTab === "APPLICATIONS" && (
        <section aria-labelledby="staff-applications-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <h2 id="staff-applications-heading" className="text-lg font-bold text-slate-900">
                Candidate Applications ({applications.totalApplications})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Staged and submitted applications managed on behalf of candidate.
              </p>
            </div>
            <Link
              href={`/employee/application-log?candidateId=${candidate.id}`}
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
            >
              Open Application Desk →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block">Ready for Submission</span>
              <span className="text-lg font-bold text-emerald-700">{applications.readyCount}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block">Blocked (Action Req.)</span>
              <span className="text-lg font-bold text-rose-700">{applications.blockedCount}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block">Warnings</span>
              <span className="text-lg font-bold text-amber-700">{applications.warningCount}</span>
            </div>
          </div>

          {applications.recentApplications.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
              No recent applications recorded.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {applications.recentApplications.map((app) => (
                <div key={app.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{app.jobTitle}</span>
                      <span className="text-xs text-slate-500">at {app.companyName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Created {new Date(app.createdAt).toLocaleDateString()}
                      {app.blockersCount > 0 && <span className="text-rose-600 font-semibold ml-2">⚠️ {app.blockersCount} Blockers</span>}
                      {app.warningsCount > 0 && <span className="text-amber-600 font-semibold ml-2">⚠️ {app.warningsCount} Warnings</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                      {app.status.replace(/_/g, " ")}
                    </span>
                    <Link
                      href={`/employee/applications/${app.id}`}
                      className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition"
                    >
                      Open Application
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 6. TAB CONTENT: JOB MATCHING (PHASE 5 SUMMARY) */}
      {/* ========================================================================= */}
      {activeTab === "MATCHING" && (
        <section aria-labelledby="staff-matching-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <h2 id="staff-matching-heading" className="text-lg font-bold text-slate-900">
                Job Matching Context ({matching.totalRelevantMatches})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic candidate-job alignments derived by Phase 5 matching engine.
              </p>
            </div>
            <Link
              href={`/employee/application-log?candidateId=${candidate.id}`}
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
            >
              Match Desk →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block">Total Relevant</span>
              <span className="text-lg font-bold text-indigo-700">{matching.totalRelevantMatches}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block">Strong Matches</span>
              <span className="text-lg font-bold text-emerald-700">{matching.strongMatchCount}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block">Good Matches</span>
              <span className="text-lg font-bold text-blue-700">{matching.goodMatchCount}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block">Saved / Requested</span>
              <span className="text-lg font-bold text-purple-700">{matching.savedOpportunitiesCount + matching.requestedOpportunitiesCount}</span>
            </div>
          </div>

          {matching.topMatches.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
              No top match opportunities currently populated.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {matching.topMatches.map((m) => (
                <div key={m.jobId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{m.jobTitle}</span>
                      <span className="text-xs text-slate-500">at {m.companyName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{m.location || "Location Flexible"}</span>
                      {m.isRemote && <span>• Remote</span>}
                      {m.isSaved && <span className="text-indigo-600 font-semibold">• Saved by Candidate</span>}
                      {m.isRequested && <span className="text-emerald-600 font-semibold">• Application Requested</span>}
                    </div>
                  </div>

                  <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                    {m.matchCategory}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 7. TAB CONTENT: TIMELINE (PHASE 7C) */}
      {/* ========================================================================= */}
      {activeTab === "TIMELINE" && (
        <section aria-labelledby="staff-timeline-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 id="staff-timeline-heading" className="text-lg font-bold text-slate-900">
                Chronological Career Timeline
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Exact chronological career milestone sequence (zero inferred promotions).
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto overflow-x-auto max-w-full">
              {(["ALL", "EXPERIENCE", "PROJECT", "EDUCATION", "CERTIFICATION"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setTimelineFilter(type)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                    timelineFilter === type
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {type === "ALL" ? "All" : type === "EXPERIENCE" ? "Work" : type === "PROJECT" ? "Projects" : type === "EDUCATION" ? "Education" : "Certs"}
                </button>
              ))}
            </div>
          </div>

          {filteredTimeline.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
              No timeline events recorded in this category.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative border-l-2 border-slate-200 ml-3 pl-6 space-y-6">
                {filteredTimeline.map((item) => (
                  <div key={item.id} className="relative group space-y-1">
                    <div
                      className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 bg-white ${
                        item.isCurrent ? "border-indigo-600 bg-indigo-600 ring-4 ring-indigo-50" : "border-slate-400"
                      }`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase">{item.displayDate}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        {item.type}
                      </span>
                      {item.isCurrent && (
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Current
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                    {item.subtitle && <p className="text-xs font-medium text-slate-600">{item.subtitle}</p>}

                    {item.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {item.technologies.map((t) => (
                          <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {item.details.length > 0 && (
                      <ul className="list-disc list-inside text-xs text-slate-600 pt-1 space-y-0.5">
                        {item.details.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {/* Dedicated Projects Provenance Container */}
              <div className="border-t border-slate-100 pt-4" data-testid="staff-candidate-projects">
                <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-3">
                  Portfolio Projects ({career.projects.length})
                </h3>
                {career.projects.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">No projects recorded yet.</span>
                ) : (
                  <div className="space-y-3">
                    {career.projects.map((proj) => (
                      <div key={proj.id} className="p-3.5 rounded border border-slate-100 bg-slate-50 text-xs space-y-2">
                        <div className="font-semibold text-slate-900 flex flex-wrap items-center justify-between gap-2">
                          <span>{proj.title}{proj.role ? ` · ${proj.role}` : ""}</span>
                          {proj.url && (
                            <a href={proj.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline shrink-0">
                              Open link →
                            </a>
                          )}
                        </div>
                        {proj.technologies?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {proj.technologies.map((tech, i) => (
                              <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium bg-white text-slate-700 border border-slate-200">
                                {tech}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-[11px] text-slate-400">Source: Candidate provided</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 8. TAB CONTENT: STRENGTHS & EVIDENCE GAPS (PHASE 7C) */}
      {/* ========================================================================= */}
      {activeTab === "GAPS" && (
        <section aria-labelledby="staff-gaps-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 id="staff-gaps-heading" className="text-lg font-bold text-slate-900">
              Areas to Strengthen &amp; Evidence Gaps
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Identified uncorroborated skills and missing profile records requiring staff or candidate action.
            </p>
          </div>

          {career.gaps.length === 0 ? (
            <div className="p-5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-xs sm:text-sm font-medium text-emerald-900">
                All profile claims are corroborated across multi-source career records.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {career.gaps.map((gap, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl border space-y-2 ${
                    gap.type === "DATA_GAP" ? "bg-amber-50/40 border-amber-200" : "bg-blue-50/40 border-blue-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        gap.type === "DATA_GAP" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {gap.type === "DATA_GAP" ? "Missing Profile Information" : "Uncorroborated Skill"}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{gap.title}</h3>
                  <p className="text-xs text-slate-600">{gap.description}</p>
                  <p className="text-xs text-slate-800 font-medium pt-1">
                    💡 Staff Recommendation: <span className="underline">{gap.recommendation}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 9. TAB CONTENT: OUTCOMES HISTORY (PHASE 6 SUMMARY) */}
      {/* ========================================================================= */}
      {activeTab === "OUTCOMES" && (
        <section aria-labelledby="staff-outcomes-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 id="staff-outcomes-heading" className="text-lg font-bold text-slate-900">
              Application Outcome Milestones ({outcomes.totalOutcomes})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable post-submission milestones recorded in the Phase 6 Outcome Ledger.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block">Interview Requests</span>
              <span className="text-lg font-bold text-indigo-700">{outcomes.interviewRequestsCount}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block">Offers Received</span>
              <span className="text-lg font-bold text-emerald-700">{outcomes.offersCount}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block">Employer Declines</span>
              <span className="text-lg font-bold text-rose-700">{outcomes.employerDeclinesCount}</span>
            </div>
          </div>

          {outcomes.recentOutcomes.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
              No outcome milestones recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {outcomes.recentOutcomes.map((o, idx) => (
                <div key={idx} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50/50">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-slate-900">{o.outcomeType.replace(/_/g, " ")}</span>
                    <div className="text-[11px] text-slate-400">
                      Recorded {new Date(o.recordedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      o.candidateVisible
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {o.candidateVisible ? "Candidate Visible" : "Staff Only"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 10. TAB CONTENT: OPERATIONS & GOVERNANCE SLOTS */}
      {/* ========================================================================= */}
      {activeTab === "GOVERNANCE" && (
        <section aria-labelledby="staff-governance-heading" className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 id="staff-governance-heading" className="text-lg font-bold text-slate-900">
              Operational Actions &amp; Lifecycle Governance
            </h2>
            <p className="text-xs text-slate-500">
              Authoritative mutation controls for specialist assignment, verification, and lifecycle transitions.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              {actionSlots?.assignmentControl}
              {actionSlots?.verificationControl}
              {actionSlots?.lifecycleControl}
            </div>
          </div>

          {/* Job Opportunities Slots */}
          {actionSlots?.privateOpportunitiesSection}

          {/* Documents Vault Slots */}
          {actionSlots?.documentsSection}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 11. CONFIDENTIAL STAFF NOTES WIDGET (ALWAYS VISIBLE AT BOTTOM) */}
      {/* ========================================================================= */}
      {actionSlots?.notesWidget && (
        <div className="pt-2">
          {actionSlots.notesWidget}
        </div>
      )}
    </div>
  );
}
