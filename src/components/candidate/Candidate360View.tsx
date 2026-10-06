"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { Candidate360DTO } from "@/lib/candidate-360/types";
import type {
  EvidencedSkillDTO,
  CareerStrengthTier,
  FactAuthorityLevel,
  TimelineEventItem,
  CareerGapItem,
} from "@/lib/career/types";

interface Props {
  data: Candidate360DTO;
  onNavigateToSection?: (sectionKey: string) => void;
}

export function Candidate360View({ data, onNavigateToSection }: Props) {
  const { candidate, career, resume, applications, matching, outcomes, freshness } = data;

  // State for skill filter and expanded evidence cards
  const [selectedTier, setSelectedTier] = useState<"ALL" | CareerStrengthTier>("ALL");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [expandedTimelineType, setExpandedTimelineType] = useState<string>("ALL");

  const toggleSkillExpand = (skillNormalized: string) => {
    setExpandedSkill((prev) => (prev === skillNormalized ? null : skillNormalized));
  };

  const filteredSkills = career.skills.filter((s) => {
    if (selectedTier === "ALL") return true;
    return s.strengthTier === selectedTier;
  });

  const filteredTimeline = career.timeline.filter((item) => {
    if (expandedTimelineType === "ALL") return true;
    return item.type === expandedTimelineType;
  });

  const getAuthorityBadge = (level: FactAuthorityLevel | "SYSTEM_DERIVED" | string) => {
    switch (level) {
      case "VERIFIED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Verified Credential
          </span>
        );
      case "EVIDENCED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
            <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Supported by multiple records
          </span>
        );
      case "SYSTEM_DERIVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Found in resume
          </span>
        );
      case "SELF_DECLARED":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
            Core Competency
          </span>
        );
      case "STRONG":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
            Strong Capability
          </span>
        );
      case "EMERGING":
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
            Emerging Skill
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* ========================================================================= */}
      {/* 1. HERO / CAREER OVERVIEW */}
      {/* ========================================================================= */}
      <section aria-labelledby="career-overview-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded">
                Candidate 360 Profile
              </span>
              {candidate.verificationStatus === "VERIFIED" ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Verified Candidate
                </span>
              ) : (
                <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
                  Self-Service Profile
                </span>
              )}
            </div>

            <h1 id="career-overview-heading" className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              {candidate.fullName || "Your Career Profile"}
            </h1>

            {candidate.headline && (
              <p className="text-base sm:text-lg text-slate-700 font-medium max-w-3xl">
                {candidate.headline}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs sm:text-sm text-slate-500 pt-1">
              {candidate.location && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {candidate.location}
                </span>
              )}
              {candidate.totalYearsExperience !== null && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {candidate.totalYearsExperience} Years Experience
                </span>
              )}
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {candidate.workAuthorization ? candidate.workAuthorization.replace(/_/g, " ") : "Not specified"}
              </span>
            </div>
          </div>

          {/* Quick Metrics Badge Grid */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 shrink-0">
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-indigo-700">
                {career.careerSnapshot.verifiedSkillsCount + career.careerSnapshot.evidencedSkillsCount}
              </div>
              <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wider mt-0.5">
                Evidenced
              </div>
            </div>
            <div className="text-center border-x border-slate-200 px-3">
              <div className="text-xl sm:text-2xl font-bold text-emerald-700">
                {career.careerSnapshot.verifiedSkillsCount}
              </div>
              <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wider mt-0.5">
                Verified
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-slate-800">
                {career.careerSnapshot.totalEvidencedEntities}
              </div>
              <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wider mt-0.5">
                Sources
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. CORE STRENGTHS & CAPABILITIES (EVIDENCE HUB) */}
      {/* ========================================================================= */}
      <section aria-labelledby="strengths-hub-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 id="strengths-hub-heading" className="text-xl font-bold text-slate-900">
              Evidence & Career Strengths
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Capabilities corroborated across your work history, projects, certifications, and profile facts.
            </p>
          </div>

          {/* Tier Filter Tabs */}
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

        {/* Skills Evidence Grid */}
        {filteredSkills.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-sm font-medium text-slate-600">
              We don&apos;t have enough career evidence to highlight this yet.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Add projects or work experience to build up multi-source corroboration.
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
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-slate-900">{skill.name}</span>
                        {getTierBadge(skill.strengthTier)}
                        {getAuthorityBadge(skill.authorityLevel)}
                      </div>
                      <p className="text-xs text-slate-600">
                        {skill.strengthTier === "CORE"
                          ? `Core competency corroborated across ${skill.evidenceDepth} independent career records with recent active use.`
                          : skill.strengthTier === "STRONG"
                          ? `Strong capability backed by ${skill.evidenceDepth} independent career records.`
                          : `Emerging capability supported by 1 recorded source.`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
                        {skill.evidenceDepth} {skill.evidenceDepth === 1 ? "source" : "sources"}
                      </span>
                      <svg
                        className={`w-5 h-5 text-slate-400 transition-transform ${
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

                  {/* Expanded Evidence Details Drawer */}
                  {isExpanded && (
                    <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-2 border-t border-slate-100 space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Supporting Evidence Sources
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
                              {src.recency === "RECENT" && (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  Recent
                                </span>
                              )}
                            </div>
                            <p className="text-slate-600">{src.displayContext}</p>
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

      {/* ========================================================================= */}
      {/* 3. CAREER TIMELINE */}
      {/* ========================================================================= */}
      <section aria-labelledby="timeline-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 id="timeline-heading" className="text-xl font-bold text-slate-900">
              Chronological Career Timeline
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Verified sequence of your professional roles, projects, degrees, and credentials.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto overflow-x-auto max-w-full">
            {(["ALL", "EXPERIENCE", "PROJECT", "EDUCATION", "CERTIFICATION"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setExpandedTimelineType(type)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  expandedTimelineType === type
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {type === "ALL"
                  ? "All"
                  : type === "EXPERIENCE"
                  ? "Work"
                  : type === "PROJECT"
                  ? "Projects"
                  : type === "EDUCATION"
                  ? "Education"
                  : "Certs"}
              </button>
            ))}
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-sm font-medium text-slate-600">
              Your career milestones will appear here once added to your profile.
            </p>
          </div>
        ) : (
          <div className="relative border-l-2 border-slate-200 ml-3 sm:ml-4 pl-6 sm:pl-8 space-y-8">
            {filteredTimeline.map((item) => (
              <div key={item.id} className="relative group">
                {/* Timeline Node Dot */}
                <div
                  className={`absolute -left-[31px] sm:-left-[39px] top-1 w-4 h-4 rounded-full border-2 bg-white ${
                    item.isCurrent
                      ? "border-indigo-600 bg-indigo-600 ring-4 ring-indigo-50"
                      : "border-slate-400 group-hover:border-slate-600"
                  }`}
                />

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {item.displayDate}
                    </span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {item.type === "EXPERIENCE"
                        ? "Role"
                        : item.type === "PROJECT"
                        ? "Project"
                        : item.type === "EDUCATION"
                        ? "Degree"
                        : "Certification"}
                    </span>
                    {item.isCurrent && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Current
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                  {item.subtitle && (
                    <p className="text-xs sm:text-sm font-medium text-slate-600">{item.subtitle}</p>
                  )}

                  {item.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {item.technologies.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.details.length > 0 && (
                    <ul className="list-disc list-inside text-xs text-slate-600 pt-1 space-y-0.5">
                      {item.details.slice(0, 3).map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 4. AREAS TO STRENGTHEN (GAPS) */}
      {/* ========================================================================= */}
      <section aria-labelledby="gaps-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div>
          <h2 id="gaps-heading" className="text-xl font-bold text-slate-900">
            Actionable Areas to Strengthen
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Opportunities to add supporting project artifacts or complete profile sections to maximize career evidence depth.
          </p>
        </div>

        {career.gaps.length === 0 ? (
          <div className="p-5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3">
            <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-xs sm:text-sm font-medium text-emerald-900">
              Your career profile is robustly corroborated across projects, experience, and credentials.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {career.gaps.map((gap, i) => (
              <div
                key={i}
                className={`p-4 rounded-xl border space-y-2 ${
                  gap.type === "DATA_GAP"
                    ? "bg-amber-50/30 border-amber-200"
                    : "bg-blue-50/30 border-blue-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      gap.type === "DATA_GAP"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {gap.type === "DATA_GAP" ? "Missing Profile Information" : "Uncorroborated Skill"}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{gap.title}</h3>
                <p className="text-xs text-slate-600">{gap.description}</p>
                <p className="text-xs text-slate-700 font-medium pt-1">
                  💡 <span className="underline">{gap.recommendation}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 5. CAREER DIRECTION */}
      {/* ========================================================================= */}
      <section aria-labelledby="direction-heading" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div>
          <h2 id="direction-heading" className="text-xl font-bold text-slate-900">
            Career Direction & Target Goals
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Your explicit career aspirations and search boundaries (distinct from past history).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Target Roles
            </span>
            <div className="text-sm font-bold text-slate-900">
              {career.careerDirection.targetRoles.length > 0
                ? career.careerDirection.targetRoles.join(", ")
                : "Not specified"}
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Locations
            </span>
            <div className="text-sm font-bold text-slate-900">
              {career.careerDirection.targetLocations.length > 0
                ? career.careerDirection.targetLocations.join(", ")
                : "Flexible"}
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Workplace Mode
            </span>
            <div className="text-sm font-bold text-slate-900">
              {career.careerDirection.remotePreference.replace(/_/g, " ")}
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Target Compensation
            </span>
            <div className="text-sm font-bold text-slate-900">
              {career.careerDirection.desiredSalaryMin && career.careerDirection.desiredSalaryMax
                ? `$${career.careerDirection.desiredSalaryMin.toLocaleString()} – $${career.careerDirection.desiredSalaryMax.toLocaleString()} ${career.careerDirection.salaryCurrency}`
                : "Open to discussion"}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. OPERATIONAL SUBSYSTEM SNAPSHOTS (RESUME, MATCHES, APPLICATIONS, OUTCOMES) */}
      {/* ========================================================================= */}
      <section aria-labelledby="subsystem-snapshots-heading" className="space-y-4">
        <h2 id="subsystem-snapshots-heading" className="text-xl font-bold text-slate-900">
          Career Operations Snapshots
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Phase 4 Resume Intelligence Snapshot */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Resume Readiness
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-medium text-slate-600">
                  Phase 4
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                {resume.hasResume ? resume.atsLabel || "Parsed & Ready" : "No Resume Uploaded"}
              </h3>
              <p className="text-xs text-slate-500 line-clamp-2">
                {resume.atsSummary || "Resume is active and indexed for job alignment."}
              </p>
            </div>
            <Link
              href="/candidate/profile?section=documents"
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
            >
              Manage Documents →
            </Link>
          </div>

          {/* Phase 5 Job Matching Snapshot */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Job Matches
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-medium text-slate-600">
                  Phase 5
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                {matching.totalRelevantMatches} Relevant Matches
              </h3>
              <p className="text-xs text-slate-500">
                {matching.strongMatchCount} Strong Matches • {matching.savedOpportunitiesCount} Saved
              </p>
            </div>
            <Link
              href="/candidate/jobs"
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
            >
              Explore Matches →
            </Link>
          </div>

          {/* Phase 2 Application Intelligence Snapshot */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Applications
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-medium text-slate-600">
                  Phase 2
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                {applications.totalApplications} Active Applications
              </h3>
              <p className="text-xs text-slate-500">
                {applications.readyCount} Ready • {applications.blockedCount} Blockers
              </p>
            </div>
            <Link
              href="/candidate/applications"
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
            >
              View Applications →
            </Link>
          </div>

          {/* Phase 6 Outcome Ledger Snapshot */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Application Outcomes
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-medium text-slate-600">
                  Phase 6
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                {outcomes.totalOutcomes > 0
                  ? `${outcomes.interviewRequestsCount} Interviews • ${outcomes.offersCount} Offers`
                  : "No Outcomes Yet"}
              </h3>
              <p className="text-xs text-slate-500">
                {outcomes.totalOutcomes > 0
                  ? "Milestones recorded post-submission."
                  : "Milestones will appear post-submission."}
              </p>
            </div>
            <Link
              href="/candidate/applications"
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
            >
              View Outcomes →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
