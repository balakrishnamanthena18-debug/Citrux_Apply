"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateCandidateProfileSelfAction,
  syncCandidateSkillsAction,
  upsertCandidateExperienceAction,
  deleteCandidateExperienceAction,
  upsertCandidateEducationAction,
  deleteCandidateEducationAction,
  upsertCandidateProjectAction,
  deleteCandidateProjectAction,
  upsertCandidateCertificationAction,
  deleteCandidateCertificationAction,
  requestDocumentUploadUrlAction,
  registerCandidateDocumentAction,
  getDocumentDownloadUrlAction,
  deleteCandidateDocumentAction,
  updateCandidateStatusAction,
} from "@/lib/candidate/actions";

interface Props {
  candidate: any;
  userEmail: string;
  userName: string;
}

export function CandidateProfileManager({ candidate, userEmail, userName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form editing states
  const [editingExperience, setEditingExperience] = useState<any | null>(null);
  const [isAddingExperience, setIsAddingExperience] = useState(false);

  const [editingEducation, setEditingEducation] = useState<any | null>(null);
  const [isAddingEducation, setIsAddingEducation] = useState(false);

  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [isAddingProject, setIsAddingProject] = useState(false);

  const [editingCertification, setEditingCertification] = useState<any | null>(null);
  const [isAddingCertification, setIsAddingCertification] = useState(false);

  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("RESUME");

  // Skills interactive tag editor state
  const [skillsList, setSkillsList] = useState<string[]>(candidate.skills.map((s: any) => s.name));
  const [newSkillInput, setNewSkillInput] = useState("");

  // Derived Profile Completeness (Presentation layer calculation)
  const completenessItems = [
    { label: "Contact & Location", completed: Boolean(candidate.phone && candidate.city && candidate.country) },
    { label: "Headline & Summary", completed: Boolean(candidate.headline && candidate.professionalSummary) },
    { label: "Technical Skills", completed: candidate.skills.length > 0 },
    { label: "Work Experience", completed: candidate.experiences.length > 0 },
    { label: "Education History", completed: candidate.educations.length > 0 },
    { label: "Uploaded Documents", completed: candidate.documents.length > 0 },
  ];
  const completedCount = completenessItems.filter((i) => i.completed).length;
  const completenessPercentage = Math.round((completedCount / completenessItems.length) * 100);

  const showFeedback = (type: "success" | "error", text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 5000);
  };

  const refreshData = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  // ----------------------------------------------------
  // Handlers for Profile Overview
  // ----------------------------------------------------
  const handleSaveOverview = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const res = await updateCandidateProfileSelfAction({
      phone: (formData.get("phone") as string) || null,
      city: (formData.get("city") as string) || null,
      state: (formData.get("state") as string) || null,
      country: (formData.get("country") as string) || "US",
      postalCode: (formData.get("postalCode") as string) || null,
      timezone: (formData.get("timezone") as string) || null,
      linkedinUrl: (formData.get("linkedinUrl") as string) || null,
      githubUrl: (formData.get("githubUrl") as string) || null,
      portfolioUrl: (formData.get("portfolioUrl") as string) || null,
      headline: (formData.get("headline") as string) || null,
      professionalSummary: (formData.get("professionalSummary") as string) || null,
      totalYearsExperience: formData.get("totalYearsExperience") ? Number(formData.get("totalYearsExperience")) : null,
      workAuthorization: (formData.get("workAuthorization") as any) || "CITIZEN",
      requiresSponsorship: formData.get("requiresSponsorship") === "true",
      visaDetails: (formData.get("visaDetails") as string) || null,
      targetRoles: (formData.get("targetRoles") as string)
        ? (formData.get("targetRoles") as string).split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      targetLocations: (formData.get("targetLocations") as string)
        ? (formData.get("targetLocations") as string).split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      remotePreference: (formData.get("remotePreference") as any) || "FLEXIBLE",
      desiredSalaryMin: formData.get("desiredSalaryMin") ? Number(formData.get("desiredSalaryMin")) : null,
      desiredSalaryMax: formData.get("desiredSalaryMax") ? Number(formData.get("desiredSalaryMax")) : null,
      salaryCurrency: (formData.get("salaryCurrency") as string) || "USD",
    });

    if (res.success) {
      showFeedback("success", "Profile overview updated successfully.");
      setActiveSection(null);
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to update profile overview.");
    }
  };

  // ----------------------------------------------------
  // Handlers for Skills
  // ----------------------------------------------------
  const handleAddSkill = () => {
    const trimmed = newSkillInput.trim();
    if (trimmed && !skillsList.includes(trimmed)) {
      setSkillsList([...skillsList, trimmed]);
      setNewSkillInput("");
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkillsList(skillsList.filter((s) => s !== skillToRemove));
  };

  const handleSaveSkills = async () => {
    const res = await syncCandidateSkillsAction(skillsList);
    if (res.success) {
      showFeedback("success", "Skills updated successfully.");
      setActiveSection(null);
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to update skills.");
    }
  };

  // ----------------------------------------------------
  // Handlers for Work Experience
  // ----------------------------------------------------
  const handleSaveExperience = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const isCurrent = formData.get("isCurrent") === "true";
    const startDate = formData.get("startDate") as string;
    const endDate = isCurrent ? null : (formData.get("endDate") as string) || null;

    const res = await upsertCandidateExperienceAction({
      id: editingExperience?.id,
      companyName: (formData.get("companyName") as string).trim(),
      jobTitle: (formData.get("jobTitle") as string).trim(),
      location: (formData.get("location") as string)?.trim() || null,
      startDate,
      endDate,
      isCurrent,
      description: (formData.get("description") as string)?.trim() || null,
    });

    if (res.success) {
      showFeedback("success", "Work experience saved.");
      setEditingExperience(null);
      setIsAddingExperience(false);
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to save experience.");
    }
  };

  const handleDeleteExperience = async (id: string) => {
    if (!confirm("Are you sure you want to delete this work experience entry?")) return;
    const res = await deleteCandidateExperienceAction(id);
    if (res.success) {
      showFeedback("success", "Experience entry removed.");
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to delete experience.");
    }
  };

  // ----------------------------------------------------
  // Handlers for Education
  // ----------------------------------------------------
  const handleSaveEducation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const res = await upsertCandidateEducationAction({
      id: editingEducation?.id,
      institution: (formData.get("institution") as string).trim(),
      degree: (formData.get("degree") as string).trim(),
      fieldOfStudy: (formData.get("fieldOfStudy") as string)?.trim() || null,
      graduationYear: formData.get("graduationYear") ? Number(formData.get("graduationYear")) : null,
      gpa: (formData.get("gpa") as string)?.trim() || null,
      honors: (formData.get("honors") as string)?.trim() || null,
    });

    if (res.success) {
      showFeedback("success", "Education entry saved.");
      setEditingEducation(null);
      setIsAddingEducation(false);
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to save education.");
    }
  };

  const handleDeleteEducation = async (id: string) => {
    if (!confirm("Are you sure you want to delete this education entry?")) return;
    const res = await deleteCandidateEducationAction(id);
    if (res.success) {
      showFeedback("success", "Education entry removed.");
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to delete education.");
    }
  };

  // ----------------------------------------------------
  // Handlers for Projects
  // ----------------------------------------------------
  const handleSaveProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const techRaw = (formData.get("technologies") as string) || "";
    const technologies = techRaw.split(",").map((t) => t.trim()).filter(Boolean);

    const res = await upsertCandidateProjectAction({
      id: editingProject?.id,
      title: (formData.get("title") as string).trim(),
      role: (formData.get("role") as string)?.trim() || null,
      url: (formData.get("url") as string)?.trim() || null,
      description: (formData.get("description") as string)?.trim() || null,
      technologies,
    });

    if (res.success) {
      showFeedback("success", "Project entry saved.");
      setEditingProject(null);
      setIsAddingProject(false);
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to save project.");
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project entry?")) return;
    const res = await deleteCandidateProjectAction(id);
    if (res.success) {
      showFeedback("success", "Project entry removed.");
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to delete project.");
    }
  };

  // ----------------------------------------------------
  // Handlers for Certifications
  // ----------------------------------------------------
  const handleSaveCertification = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const doesNotExpire = formData.get("doesNotExpire") === "true";

    const res = await upsertCandidateCertificationAction({
      id: editingCertification?.id,
      name: (formData.get("name") as string).trim(),
      issuingAuthority: (formData.get("issuingAuthority") as string).trim(),
      credentialId: (formData.get("credentialId") as string)?.trim() || null,
      credentialUrl: (formData.get("credentialUrl") as string)?.trim() || null,
      issueDate: (formData.get("issueDate") as string) || null,
      expirationDate: doesNotExpire ? null : ((formData.get("expirationDate") as string) || null),
      doesNotExpire,
    });

    if (res.success) {
      showFeedback("success", "Certification saved.");
      setEditingCertification(null);
      setIsAddingCertification(false);
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to save certification.");
    }
  };

  const handleDeleteCertification = async (id: string) => {
    if (!confirm("Are you sure you want to delete this certification?")) return;
    const res = await deleteCandidateCertificationAction(id);
    if (res.success) {
      showFeedback("success", "Certification entry removed.");
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to delete certification.");
    }
  };

  // ----------------------------------------------------
  // Handlers for Documents
  // ----------------------------------------------------
  const handleDownloadDoc = async (docId: string) => {
    const res = await getDocumentDownloadUrlAction(docId);
    if (res.success && res.data?.downloadUrl) {
      window.open(res.data.downloadUrl, "_blank");
    } else {
      showFeedback("error", res.error || "Failed to retrieve secure document download URL.");
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm("Are you sure you want to remove this document from your profile?")) return;
    const res = await deleteCandidateDocumentAction(docId);
    if (res.success) {
      showFeedback("success", "Document removed.");
      refreshData();
    } else {
      showFeedback("error", res.error || "Failed to delete document.");
    }
  };

  const handleUploadDoc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uploadFile) {
      showFeedback("error", "Please select a file to upload.");
      return;
    }

    // 1. Request secure signed upload URL
    const urlRes = await requestDocumentUploadUrlAction({
      candidateId: candidate.id,
      filename: uploadFile.name,
    });

    if (!urlRes.success || !urlRes.data) {
      showFeedback("error", urlRes.error || "Failed to request document upload URL.");
      return;
    }

    try {
      // 2. Direct upload to signed Supabase URL
      const uploadHttpRes = await fetch(urlRes.data.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
        body: uploadFile,
      });

      if (!uploadHttpRes.ok) {
        showFeedback("error", "Failed to upload document binary to secure storage.");
        return;
      }

      // 3. Register metadata in PostgreSQL
      const regRes = await registerCandidateDocumentAction({
        candidateId: candidate.id,
        documentType: docType as any,
        title: uploadFile.name,
        storagePath: urlRes.data.storagePath,
        fileSizeBytes: uploadFile.size,
        mimeType: uploadFile.type || "application/octet-stream",
        isDefault: true,
      });

      if (regRes.success) {
        showFeedback("success", "Document uploaded and registered successfully.");
        setIsUploadingDoc(false);
        setUploadFile(null);
        refreshData();
      } else {
        showFeedback("error", regRes.error || "Failed to register document metadata.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "An error occurred during file upload.");
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      {/* Toast / Inline Feedback */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-lg border text-xs font-semibold flex items-center justify-between shadow-sm transition ${
            feedbackMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
              : "bg-rose-50 text-rose-800 border-rose-300"
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button onClick={() => setFeedbackMessage(null)} className="text-slate-500 hover:text-slate-800 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Enterprise Dossier Profile Header */}
      <div className="bg-white p-6 sm:p-8 rounded-lg border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Canonical Career Profile
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              {userName || userEmail}
            </h1>
            <div className="text-sm font-medium text-slate-700">
              {candidate.headline || "Professional Headline Not Set"}
            </div>
            <div className="text-xs text-slate-500">
              {[candidate.city, candidate.state, candidate.country].filter(Boolean).join(", ") || "Location Not Provided"}
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  candidate.status === "ACTIVE"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : candidate.status === "ONBOARDING"
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-slate-100 text-slate-700 border border-slate-200"
                }`}
              >
                Status: {candidate.status}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  candidate.verificationStatus === "VERIFIED"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : candidate.verificationStatus === "PENDING_REVIEW"
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : "bg-slate-100 text-slate-700 border border-slate-200"
                }`}
              >
                Verification: {candidate.verificationStatus}
              </span>
            </div>

            {candidate.status === "ONBOARDING" && (
              <button
                onClick={async () => {
                  const res = await updateCandidateStatusAction({
                    candidateId: candidate.id,
                    targetStatus: "ACTIVE",
                  });
                  if (res.success) {
                    showFeedback("success", "Profile submitted for operational review.");
                    refreshData();
                  } else {
                    showFeedback("error", res.error || "Failed to submit profile.");
                  }
                }}
                className="mt-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm"
              >
                Submit Profile for Active Review
              </button>
            )}
          </div>
        </div>

        {/* Profile Completeness Checklist Bar */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-700">Profile Completeness: {completenessPercentage}%</span>
            <span className="text-slate-500">{completedCount} of {completenessItems.length} categories completed</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                completenessPercentage >= 80 ? "bg-emerald-500" : completenessPercentage >= 50 ? "bg-blue-500" : "bg-amber-500"
              }`}
              style={{ width: `${completenessPercentage}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-slate-500">
            {completenessItems.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1">
                <span className={item.completed ? "text-emerald-600 font-bold" : "text-slate-400"}>
                  {item.completed ? "✓" : "○"}
                </span>
                <span className={item.completed ? "text-slate-700" : "text-slate-400"}>{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Structured Verification Feedback Action Area */}
      {candidate.verificationNotes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-700 font-bold text-base">⚠️</span>
            <h2 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
              Verification Status & Candidate-Visible Correction Requests
            </h2>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed font-medium">
            {candidate.verificationNotes}
          </p>
          <p className="text-[11px] text-amber-700">
            Please update the requested career facts below. Your assigned specialist will verify the adjustments.
          </p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. Contact & Professional Overview (Read-First / Edit-Second)             */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">1. Professional Overview & Contact</h2>
            <p className="text-xs text-slate-500">Authoritative contact information and career summary.</p>
          </div>
          {activeSection !== "OVERVIEW" && (
            <button
              onClick={() => setActiveSection("OVERVIEW")}
              className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Edit Overview
            </button>
          )}
        </div>

        {activeSection !== "OVERVIEW" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-semibold text-slate-500">Email:</span>
              <p className="text-slate-900 mt-0.5">{userEmail}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Phone:</span>
              <p className="text-slate-900 mt-0.5">{candidate.phone || "Not provided"}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Location:</span>
              <p className="text-slate-900 mt-0.5">
                {[candidate.city, candidate.state, candidate.country].filter(Boolean).join(", ") || "Not provided"}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Work Authorization:</span>
              <p className="text-slate-900 mt-0.5">
                {candidate.workAuthorization} {candidate.requiresSponsorship ? "(Sponsorship Required)" : ""}
              </p>
            </div>
            {candidate.professionalSummary && (
              <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                <span className="font-semibold text-slate-500">Professional Summary:</span>
                <p className="mt-1 text-slate-700 whitespace-pre-line bg-slate-50 p-3 rounded leading-relaxed">
                  {candidate.professionalSummary}
                </p>
              </div>
            )}
            <div className="sm:col-span-2 flex flex-wrap gap-4 pt-2 border-t border-slate-100 text-slate-600">
              {candidate.linkedinUrl && (
                <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  LinkedIn Profile ↗
                </a>
              )}
              {candidate.githubUrl && (
                <a href={candidate.githubUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  GitHub Profile ↗
                </a>
              )}
              {candidate.portfolioUrl && (
                <a href={candidate.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Portfolio Website ↗
                </a>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveOverview} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700">Phone</label>
              <input
                name="phone"
                defaultValue={candidate.phone ?? ""}
                placeholder="+1 (555) 000-0000"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">City</label>
              <input
                name="city"
                defaultValue={candidate.city ?? ""}
                placeholder="San Francisco"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">State / Province</label>
              <input
                name="state"
                defaultValue={candidate.state ?? ""}
                placeholder="CA"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">Country</label>
              <input
                name="country"
                defaultValue={candidate.country}
                placeholder="US"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">LinkedIn URL</label>
              <input
                name="linkedinUrl"
                type="url"
                defaultValue={candidate.linkedinUrl ?? ""}
                placeholder="https://linkedin.com/in/username"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">GitHub URL</label>
              <input
                name="githubUrl"
                type="url"
                defaultValue={candidate.githubUrl ?? ""}
                placeholder="https://github.com/username"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block font-semibold text-slate-700">Professional Headline</label>
              <input
                name="headline"
                defaultValue={candidate.headline ?? ""}
                placeholder="Senior Full Stack Engineer | TypeScript, Next.js, PostgreSQL"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block font-semibold text-slate-700">Professional Summary</label>
              <textarea
                name="professionalSummary"
                rows={4}
                defaultValue={candidate.professionalSummary ?? ""}
                placeholder="Proven software engineer with 6+ years building mission-critical SaaS platforms..."
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-sans"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveSection(null)}
                className="px-3.5 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold"
              >
                {isPending ? "Saving..." : "Save Overview"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. Technical Skills (Chips / Tags Experience)                             */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">2. Technical & Professional Skills</h2>
            <p className="text-xs text-slate-500">Core technologies, tools, and domain skills used in application tailoring.</p>
          </div>
          {activeSection !== "SKILLS" && (
            <button
              onClick={() => setActiveSection("SKILLS")}
              className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Edit Skills
            </button>
          )}
        </div>

        {activeSection !== "SKILLS" ? (
          <div className="flex flex-wrap gap-2">
            {skillsList.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No skills added yet. Click &quot;Edit Skills&quot; to add your technical skills.</p>
            ) : (
              skillsList.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                >
                  {skill}
                </span>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
                placeholder="Type skill name (e.g. TypeScript, React) and press Add..."
                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:ring-1 focus:ring-slate-900"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-4 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                + Add
              </button>
            </div>

            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-md border border-slate-200 min-h-[50px]">
              {skillsList.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white text-slate-800 border border-slate-300 shadow-sm"
                >
                  <span>{skill}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="text-slate-400 hover:text-rose-600 font-bold text-xs"
                    title="Remove skill"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSkillsList(candidate.skills.map((s: any) => s.name));
                  setActiveSection(null);
                }}
                className="px-3.5 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSkills}
                disabled={isPending}
                className="px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold"
              >
                {isPending ? "Saving..." : "Save Skills"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. Work Experience (Structured Timeline Cards)                            */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">3. Work Experience</h2>
            <p className="text-xs text-slate-500">Employment chronology and key responsibilities.</p>
          </div>
          {!isAddingExperience && !editingExperience && (
            <button
              onClick={() => setIsAddingExperience(true)}
              className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition"
            >
              + Add Experience
            </button>
          )}
        </div>

        {/* Experience Editing Form */}
        {(isAddingExperience || editingExperience) && (
          <form onSubmit={handleSaveExperience} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <h3 className="font-bold text-slate-900">
              {editingExperience ? "Edit Work Experience" : "Add Work Experience"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Company Name *</label>
                <input
                  name="companyName"
                  required
                  defaultValue={editingExperience?.companyName ?? ""}
                  placeholder="Stripe, Google, Inc."
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Job Title *</label>
                <input
                  name="jobTitle"
                  required
                  defaultValue={editingExperience?.jobTitle ?? ""}
                  placeholder="Senior Software Engineer"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Location</label>
                <input
                  name="location"
                  defaultValue={editingExperience?.location ?? ""}
                  placeholder="San Francisco, CA or Remote"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Start Date (YYYY-MM-DD) *</label>
                <input
                  name="startDate"
                  type="date"
                  required
                  defaultValue={
                    editingExperience?.startDate
                      ? new Date(editingExperience.startDate).toISOString().slice(0, 10)
                      : ""
                  }
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">End Date (YYYY-MM-DD)</label>
                <input
                  name="endDate"
                  type="date"
                  defaultValue={
                    editingExperience?.endDate
                      ? new Date(editingExperience.endDate).toISOString().slice(0, 10)
                      : ""
                  }
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  id="isCurrentExp"
                  name="isCurrent"
                  value="true"
                  defaultChecked={editingExperience?.isCurrent ?? false}
                  className="rounded border-slate-300 text-slate-900"
                />
                <label htmlFor="isCurrentExp" className="font-semibold text-slate-700">
                  I currently work here
                </label>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700">Role Summary & Key Accomplishments</label>
              <textarea
                name="description"
                rows={3}
                defaultValue={editingExperience?.description ?? ""}
                placeholder="Architected high-throughput payment pipelines and led database migration..."
                className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-sans"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingExperience(null);
                  setIsAddingExperience(false);
                }}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 text-xs font-semibold bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                {isPending ? "Saving..." : "Save Experience"}
              </button>
            </div>
          </form>
        )}

        {/* Experience Cards */}
        {candidate.experiences.length === 0 && !isAddingExperience ? (
          <p className="text-xs text-slate-400 italic py-2">No work experiences added yet.</p>
        ) : (
          <div className="space-y-3">
            {candidate.experiences.map((exp: any) => (
              <div key={exp.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex justify-between items-start gap-4">
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{exp.jobTitle}</span>
                    <span className="text-slate-400">•</span>
                    <span className="font-semibold text-slate-700">{exp.companyName}</span>
                  </div>
                  <div className="text-slate-500">
                    {new Date(exp.startDate).toLocaleDateString([], { month: "short", year: "numeric" })} —{" "}
                    {exp.isCurrent ? "Present" : exp.endDate ? new Date(exp.endDate).toLocaleDateString([], { month: "short", year: "numeric" }) : ""}
                    {exp.location && ` | ${exp.location}`}
                  </div>
                  {exp.description && (
                    <p className="mt-2 text-slate-700 whitespace-pre-line leading-relaxed">{exp.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditingExperience(exp);
                      setIsAddingExperience(false);
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold"
                  >
                    Edit
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => handleDeleteExperience(exp.id)}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. Education History                                                      */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">4. Education History</h2>
            <p className="text-xs text-slate-500">Academic degrees, institutions, and graduation records.</p>
          </div>
          {!isAddingEducation && !editingEducation && (
            <button
              onClick={() => setIsAddingEducation(true)}
              className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition"
            >
              + Add Education
            </button>
          )}
        </div>

        {/* Education Form */}
        {(isAddingEducation || editingEducation) && (
          <form onSubmit={handleSaveEducation} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <h3 className="font-bold text-slate-900">
              {editingEducation ? "Edit Education" : "Add Education"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Institution Name *</label>
                <input
                  name="institution"
                  required
                  defaultValue={editingEducation?.institution ?? ""}
                  placeholder="University of California, Berkeley"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Degree *</label>
                <input
                  name="degree"
                  required
                  defaultValue={editingEducation?.degree ?? ""}
                  placeholder="Bachelor of Science"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Field of Study</label>
                <input
                  name="fieldOfStudy"
                  defaultValue={editingEducation?.fieldOfStudy ?? ""}
                  placeholder="Computer Science"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Graduation Year</label>
                <input
                  name="graduationYear"
                  type="number"
                  min={1950}
                  max={2050}
                  defaultValue={editingEducation?.graduationYear ?? ""}
                  placeholder="2022"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">GPA (Optional)</label>
                <input
                  name="gpa"
                  defaultValue={editingEducation?.gpa ?? ""}
                  placeholder="3.85 / 4.0"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Honors / Awards</label>
                <input
                  name="honors"
                  defaultValue={editingEducation?.honors ?? ""}
                  placeholder="Magna Cum Laude, Dean's List"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingEducation(null);
                  setIsAddingEducation(false);
                }}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 text-xs font-semibold bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                {isPending ? "Saving..." : "Save Education"}
              </button>
            </div>
          </form>
        )}

        {candidate.educations.length === 0 && !isAddingEducation ? (
          <p className="text-xs text-slate-400 italic py-2">No education history recorded.</p>
        ) : (
          <div className="space-y-3">
            {candidate.educations.map((edu: any) => (
              <div key={edu.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex justify-between items-start gap-4">
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-sm text-slate-900">
                    {edu.degree} {edu.fieldOfStudy && `in ${edu.fieldOfStudy}`}
                  </div>
                  <div className="text-slate-600 font-medium">{edu.institution}</div>
                  <div className="text-slate-500">
                    {edu.graduationYear && `Class of ${edu.graduationYear}`}
                    {edu.gpa && ` • GPA: ${edu.gpa}`}
                    {edu.honors && ` • ${edu.honors}`}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditingEducation(edu);
                      setIsAddingEducation(false);
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold"
                  >
                    Edit
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => handleDeleteEducation(edu.id)}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. Key Projects                                                           */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">5. Technical Projects</h2>
            <p className="text-xs text-slate-500">Notable software projects, architectures, and open-source contributions.</p>
          </div>
          {!isAddingProject && !editingProject && (
            <button
              onClick={() => setIsAddingProject(true)}
              className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition"
            >
              + Add Project
            </button>
          )}
        </div>

        {/* Project Form */}
        {(isAddingProject || editingProject) && (
          <form onSubmit={handleSaveProject} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <h3 className="font-bold text-slate-900">
              {editingProject ? "Edit Project" : "Add Project"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Project Title *</label>
                <input
                  name="title"
                  required
                  defaultValue={editingProject?.title ?? ""}
                  placeholder="Distributed Message Queue"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Role / Contribution</label>
                <input
                  name="role"
                  defaultValue={editingProject?.role ?? ""}
                  placeholder="Lead Architect"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Project / Repository URL</label>
                <input
                  name="url"
                  type="url"
                  defaultValue={editingProject?.url ?? ""}
                  placeholder="https://github.com/username/project"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block font-semibold text-slate-700">Technologies Used (comma-separated)</label>
                <input
                  name="technologies"
                  defaultValue={editingProject?.technologies ? editingProject.technologies.join(", ") : ""}
                  placeholder="Rust, Tokio, gRPC, Docker"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block font-semibold text-slate-700">Project Description</label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={editingProject?.description ?? ""}
                  placeholder="Designed an append-only distributed event stream supporting 100k events/sec..."
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-sans"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingProject(null);
                  setIsAddingProject(false);
                }}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 text-xs font-semibold bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                {isPending ? "Saving..." : "Save Project"}
              </button>
            </div>
          </form>
        )}

        {candidate.projects.length === 0 && !isAddingProject ? (
          <p className="text-xs text-slate-400 italic py-2">No projects recorded.</p>
        ) : (
          <div className="space-y-3">
            {candidate.projects.map((proj: any) => (
              <div key={proj.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex justify-between items-start gap-4">
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{proj.title}</span>
                    {proj.role && <span className="text-slate-500 font-medium">({proj.role})</span>}
                  </div>
                  {proj.url && (
                    <a href={proj.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-block text-xs">
                      {proj.url} ↗
                    </a>
                  )}
                  {proj.description && <p className="mt-1 text-slate-700 leading-relaxed">{proj.description}</p>}
                  {proj.technologies && proj.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {proj.technologies.map((t: string) => (
                        <span key={t} className="px-2 py-0.5 rounded bg-slate-200/70 text-slate-800 text-[10px] font-medium">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditingProject(proj);
                      setIsAddingProject(false);
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold"
                  >
                    Edit
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => handleDeleteProject(proj.id)}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 6. Certifications & Licenses                                              */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">6. Professional Certifications</h2>
            <p className="text-xs text-slate-500">Verified credentials and industry certifications.</p>
          </div>
          {!isAddingCertification && !editingCertification && (
            <button
              onClick={() => setIsAddingCertification(true)}
              className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition"
            >
              + Add Certification
            </button>
          )}
        </div>

        {/* Certification Form */}
        {(isAddingCertification || editingCertification) && (
          <form onSubmit={handleSaveCertification} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <h3 className="font-bold text-slate-900">
              {editingCertification ? "Edit Certification" : "Add Certification"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Certification Name *</label>
                <input
                  name="name"
                  required
                  defaultValue={editingCertification?.name ?? ""}
                  placeholder="AWS Certified Solutions Architect"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Issuing Organization *</label>
                <input
                  name="issuingAuthority"
                  required
                  defaultValue={editingCertification?.issuingAuthority ?? ""}
                  placeholder="Amazon Web Services"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Credential ID / Number</label>
                <input
                  name="credentialId"
                  defaultValue={editingCertification?.credentialId ?? ""}
                  placeholder="AWS-SAA-1234567"
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Issue Date</label>
                <input
                  name="issueDate"
                  type="date"
                  defaultValue={
                    editingCertification?.issueDate
                      ? new Date(editingCertification.issueDate).toISOString().slice(0, 10)
                      : ""
                  }
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Expiration Date</label>
                <input
                  name="expirationDate"
                  type="date"
                  defaultValue={
                    editingCertification?.expirationDate
                      ? new Date(editingCertification.expirationDate).toISOString().slice(0, 10)
                      : ""
                  }
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  id="doesNotExpireCert"
                  name="doesNotExpire"
                  value="true"
                  defaultChecked={editingCertification?.doesNotExpire ?? false}
                  className="rounded border-slate-300 text-slate-900"
                />
                <label htmlFor="doesNotExpireCert" className="font-semibold text-slate-700">
                  This certification does not expire
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingCertification(null);
                  setIsAddingCertification(false);
                }}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 text-xs font-semibold bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                {isPending ? "Saving..." : "Save Certification"}
              </button>
            </div>
          </form>
        )}

        {candidate.certifications.length === 0 && !isAddingCertification ? (
          <p className="text-xs text-slate-400 italic py-2">No certifications recorded.</p>
        ) : (
          <div className="space-y-3">
            {candidate.certifications.map((cert: any) => (
              <div key={cert.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex justify-between items-start gap-4">
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-sm text-slate-900">{cert.name}</div>
                  <div className="text-slate-600 font-medium">{cert.issuingAuthority}</div>
                  <div className="text-slate-500">
                    {cert.issueDate && `Issued: ${new Date(cert.issueDate).toLocaleDateString([], { month: "short", year: "numeric" })}`}
                    {cert.doesNotExpire ? " • Does not expire" : cert.expirationDate ? ` • Expires: ${new Date(cert.expirationDate).toLocaleDateString([], { month: "short", year: "numeric" })}` : ""}
                    {cert.credentialId && ` • ID: ${cert.credentialId}`}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditingCertification(cert);
                      setIsAddingCertification(false);
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold"
                  >
                    Edit
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => handleDeleteCertification(cert.id)}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 7. Authoritative Documents & Resume Inventory                             */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">7. Uploaded Documents & Resumes</h2>
            <p className="text-xs text-slate-500">Master resume files, cover letters, and transcripts used for tailored packaging.</p>
          </div>
          {!isUploadingDoc && (
            <button
              onClick={() => setIsUploadingDoc(true)}
              className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition"
            >
              + Upload Document
            </button>
          )}
        </div>

        {/* Upload Form */}
        {isUploadingDoc && (
          <form onSubmit={handleUploadDoc} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <h3 className="font-bold text-slate-900">Upload New Document</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Document Type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="RESUME">RESUME — Master Resume</option>
                  <option value="COVER_LETTER">COVER LETTER — Standard Cover Letter</option>
                  <option value="TRANSCRIPT">TRANSCRIPT — Academic Transcript</option>
                  <option value="CERTIFICATE">CERTIFICATE — Credential Proof</option>
                  <option value="OTHER">OTHER — Supplemental Document</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Select File (PDF, DOCX max 50MB) *</label>
                <input
                  type="file"
                  required
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsUploadingDoc(false);
                  setUploadFile(null);
                }}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 text-xs font-semibold bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !uploadFile}
                className="px-4 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {isPending ? "Uploading..." : "Upload & Register"}
              </button>
            </div>
          </form>
        )}

        {candidate.documents.length === 0 && !isUploadingDoc ? (
          <p className="text-xs text-slate-400 italic py-2">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {candidate.documents.map((doc: any) => (
              <div key={doc.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 truncate">{doc.title}</span>
                    <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {doc.documentType} (v{doc.versionNumber})
                    </span>
                    {doc.isDefault && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Uploaded: {new Date(doc.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} • {(doc.fileSizeBytes / 1024).toFixed(1)} KB
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleDownloadDoc(doc.id)}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold"
                  >
                    Download ↗
                  </button>
                  <button
                    onClick={() => handleDeleteDoc(doc.id)}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
