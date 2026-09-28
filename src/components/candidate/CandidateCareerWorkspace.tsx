"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CandidateCareerNav, CareerSectionKey } from "./CandidateCareerNav";
import { ProfileOverviewSection } from "./ProfileOverviewSection";
import { PersonalContactEditor } from "./PersonalContactEditor";
import { ProfessionalSummaryEditor } from "./ProfessionalSummaryEditor";
import { ExperienceEditor } from "./ExperienceEditor";
import { EducationEditor } from "./EducationEditor";
import { SkillsManager } from "./SkillsManager";
import { CertificationManager } from "./CertificationManager";
import { WorkAuthorizationPanel } from "./WorkAuthorizationPanel";
import { JobPreferencesEditor } from "./JobPreferencesEditor";
import { ProfileVerificationPanel } from "./ProfileVerificationPanel";
import { CareerChangeHistory, CandidateHistoryItem } from "./CareerChangeHistory";
import { CandidateDocumentVault, CandidateVaultDocument } from "./CandidateDocumentVault";

interface Props {
  candidate: any;
  userEmail: string;
  userName: string;
  changeHistory?: CandidateHistoryItem[];
  initialSection?: CareerSectionKey;
}

export function CandidateCareerWorkspace({
  candidate: initialCandidate,
  userEmail,
  userName,
  changeHistory = [],
  initialSection = "overview",
}: Props) {
  const router = useRouter();
  const [candidate, setCandidate] = useState(initialCandidate);
  const [activeSection, setActiveSection] = useState<CareerSectionKey>(initialSection);

  const handleRefresh = () => {
    router.refresh();
  };

  const counts = {
    experiences: candidate.experiences?.length || 0,
    educations: candidate.educations?.length || 0,
    skills: candidate.skills?.length || 0,
    certifications: candidate.certifications?.length || 0,
    documents: candidate.documents?.length || 0,
    needsAttentionCount:
      candidate.verificationNotes || candidate.verificationStatus === "REJECTED" ? 1 : 0,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Workspace Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Career Operations Workspace
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              <span className="text-xs text-slate-400">
                Canonical Truth
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
              Career Profile & Boundaries
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Manage your authoritative career history, technical competencies, documents, and search boundaries.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <Link
              href="/candidate"
              className="flex-1 sm:flex-initial text-center px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition shadow-2xs"
            >
              ← Command Center
            </Link>
            <Link
              href="/candidate/applications"
              className="flex-1 sm:flex-initial text-center px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs"
            >
              My Applications
            </Link>
          </div>
        </div>

        {/* Mobile Horizontal Section Tabs (< 1024px) */}
        <div className="lg:hidden mt-4 pt-4 border-t border-slate-100 overflow-x-auto flex items-center gap-1.5 pb-1">
          {[
            { key: "overview", label: "Overview" },
            { key: "personal", label: "Contact" },
            { key: "summary", label: "Summary" },
            { key: "experience", label: `Experience (${counts.experiences})` },
            { key: "education", label: `Education (${counts.educations})` },
            { key: "skills", label: `Skills (${counts.skills})` },
            { key: "certifications", label: `Certs (${counts.certifications})` },
            { key: "work_auth", label: "Work Auth" },
            { key: "preferences", label: "Preferences" },
            { key: "documents", label: `Docs (${counts.documents})` },
            { key: "verification", label: "Verification" },
            { key: "history", label: "History" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSection(tab.key as CareerSectionKey)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer shrink-0 ${
                activeSection === tab.key
                  ? "bg-slate-900 text-white font-semibold shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3-Column Desktop Grid Layout (Left Nav | Center Editor | Right Context) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Career Section Nav (3 cols on lg) */}
        <div className="hidden lg:block lg:col-span-3 bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs sticky top-20">
          <CandidateCareerNav
            activeSection={activeSection}
            onSelectSection={setActiveSection}
            counts={counts}
          />
        </div>

        {/* CENTER COLUMN: Active Career Section Workspace (6 cols on lg, 9 cols on xl, or full on mobile) */}
        <div className="lg:col-span-6 xl:col-span-6 space-y-6">
          {activeSection === "overview" && (
            <ProfileOverviewSection
              candidate={candidate}
              userEmail={userEmail}
              userName={userName}
              onNavigateSection={setActiveSection}
            />
          )}

          {activeSection === "personal" && (
            <PersonalContactEditor
              candidate={candidate}
              onProfileUpdated={(updated) => {
                setCandidate(updated);
                handleRefresh();
              }}
            />
          )}

          {activeSection === "summary" && (
            <ProfessionalSummaryEditor
              candidate={candidate}
              onProfileUpdated={(updated) => {
                setCandidate(updated);
                handleRefresh();
              }}
            />
          )}

          {activeSection === "experience" && (
            <ExperienceEditor
              experiences={candidate.experiences || []}
              onExperiencesChanged={handleRefresh}
            />
          )}

          {activeSection === "education" && (
            <EducationEditor
              educations={candidate.educations || []}
              onEducationsChanged={handleRefresh}
            />
          )}

          {activeSection === "skills" && (
            <SkillsManager
              skills={candidate.skills || []}
              onSkillsChanged={handleRefresh}
            />
          )}

          {activeSection === "certifications" && (
            <CertificationManager
              certifications={candidate.certifications || []}
              onCertificationsChanged={handleRefresh}
            />
          )}

          {activeSection === "work_auth" && (
            <WorkAuthorizationPanel
              candidate={candidate}
              onProfileUpdated={(updated) => {
                setCandidate(updated);
                handleRefresh();
              }}
            />
          )}

          {activeSection === "preferences" && (
            <JobPreferencesEditor
              candidate={candidate}
              onProfileUpdated={(updated) => {
                setCandidate(updated);
                handleRefresh();
              }}
            />
          )}

          {activeSection === "documents" && (
            <CandidateDocumentVault
              documents={(candidate.documents || []) as unknown as CandidateVaultDocument[]}
              onDocumentDeleted={handleRefresh}
              onDocumentUploaded={(newDoc) => {
                setCandidate((prev: any) => ({
                  ...prev,
                  documents: [newDoc, ...(prev.documents || [])],
                }));
                handleRefresh();
              }}
              allowUploadRedirect={false}
            />
          )}

          {activeSection === "verification" && (
            <ProfileVerificationPanel
              candidate={candidate}
              onNavigateSection={setActiveSection}
            />
          )}

          {activeSection === "history" && (
            <CareerChangeHistory history={changeHistory} />
          )}
        </div>

        {/* RIGHT COLUMN: Record Context & Source Verification (3 cols on lg) */}
        <div className="lg:col-span-3 space-y-5 sticky top-20">
          {/* Record Provenance Context Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="font-semibold text-slate-900 uppercase tracking-wider text-[11px]">
                Record Provenance
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Canonical
              </span>
            </div>

            <p className="text-slate-600 leading-relaxed">
              All records in this workspace represent candidate-confirmed facts. AI and operations specialists never silently fabricate or alter your history.
            </p>

            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Authority:</span>
                <span className="font-medium text-slate-800">Candidate-Owned</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Verification:</span>
                <span className="font-medium text-slate-800">
                  {candidate.verificationStatus === "VERIFIED"
                    ? "✓ Staff Verified"
                    : "Active Standing"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Service Mode:</span>
                <span className="font-medium text-slate-800">
                  {candidate.applicationAuthorizationMode === "MANAGED" ? "Managed" : "Review Req."}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Specialist Assistance */}
          {candidate.assignedEmployee && (
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-2 text-xs">
              <span className="font-semibold text-slate-900 uppercase tracking-wider text-[11px] block">
                Assigned Specialist
              </span>
              <p className="text-slate-600">
                {[candidate.assignedEmployee.firstName, candidate.assignedEmployee.lastName].filter(Boolean).join(" ") || candidate.assignedEmployee.email}
              </p>
              <Link
                href="/candidate/messages"
                className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 pt-1"
              >
                <span>Message Specialist</span>
                <span>→</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
