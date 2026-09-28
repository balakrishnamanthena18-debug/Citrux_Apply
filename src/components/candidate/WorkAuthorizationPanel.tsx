"use client";

import React, { useState } from "react";
import { updateCandidateProfileSelfAction } from "@/lib/candidate/actions";
import { SaveStateIndicator, SaveStatus } from "./SaveStateIndicator";

interface Props {
  candidate: any;
  onProfileUpdated?: (updatedCandidate: any) => void;
}

export function WorkAuthorizationPanel({ candidate, onProfileUpdated }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const [formData, setFormData] = useState({
    country: candidate.country || "US",
    workAuthorization: candidate.workAuthorization || "CITIZEN",
    requiresSponsorship: Boolean(candidate.requiresSponsorship),
    visaDetails: candidate.visaDetails || "",
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("SAVING");
    setErrorMessage(null);

    try {
      const res = await updateCandidateProfileSelfAction({
        country: formData.country,
        workAuthorization: formData.workAuthorization as any,
        requiresSponsorship: formData.requiresSponsorship,
        visaDetails: formData.visaDetails.trim() || null,
      });

      if (res.success) {
        setSaveStatus("SAVED");
        setLastSavedAt(new Date());
        setIsEditing(false);
        onProfileUpdated?.({
          ...candidate,
          ...formData,
        });
        setTimeout(() => setSaveStatus("IDLE"), 2500);
      } else {
        setSaveStatus("ERROR");
        setErrorMessage(res.error || "Failed to update work authorization");
      }
    } catch {
      setSaveStatus("ERROR");
      setErrorMessage("Network error saving work authorization");
    }
  };

  const handleCancel = () => {
    setFormData({
      country: candidate.country || "US",
      workAuthorization: candidate.workAuthorization || "CITIZEN",
      requiresSponsorship: Boolean(candidate.requiresSponsorship),
      visaDetails: candidate.visaDetails || "",
    });
    setIsEditing(false);
    setSaveStatus("IDLE");
    setErrorMessage(null);
  };

  const authLabels: Record<string, string> = {
    CITIZEN: "Citizen / National",
    PERMANENT_RESIDENT: "Permanent Resident (Green Card / PR)",
    WORK_VISA: "Employment Authorized Work Visa (H-1B, L-1, O-1, TN, etc.)",
    STUDENT_VISA: "Student Visa with Work Authorization (F-1 OPT / STEM OPT)",
    REQUIRES_SPONSORSHIP: "Requires Employer Visa Sponsorship",
    OTHER: "Other / Unspecified Status",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Work Authorization & Eligibility
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
              🔒 Confidential & Encrypted
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Strictly controls legal eligibility screening and employer sponsorship matching
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SaveStateIndicator status={saveStatus} errorMessage={errorMessage} lastSavedAt={lastSavedAt} />
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition shadow-2xs cursor-pointer"
            >
              Edit Authorization
            </button>
          )}
        </div>
      </div>

      {/* Security Callout Banner */}
      <div className="p-4 bg-slate-50/60 border-b border-slate-100 flex items-start gap-3 text-xs text-slate-600">
        <span className="text-sm shrink-0">🛡️</span>
        <p className="leading-relaxed">
          <strong className="text-slate-800 font-semibold">Privacy Boundary: </strong>
          Your work authorization details are only used by authorized operations specialists to filter compliant employer job applications. This information is never disclosed publicly.
        </p>
      </div>

      {/* Content */}
      {!isEditing ? (
        <div className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-slate-400 font-medium block">Primary Work Jurisdiction</span>
              <span className="font-semibold text-slate-900 mt-1 block">
                {candidate.country || "US"}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">Legal Authorization Category</span>
              <span className="font-semibold text-slate-900 mt-1 block">
                {authLabels[candidate.workAuthorization] || candidate.workAuthorization || "Citizen"}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">Future Employer Sponsorship</span>
              <span className="font-semibold text-slate-900 mt-1 block">
                {candidate.requiresSponsorship
                  ? "⚠️ Requires employer sponsorship now or in future"
                  : "✓ Does not require employer visa sponsorship"}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">Visa Subtype & Notes</span>
              <span className="font-semibold text-slate-800 mt-1 block">
                {candidate.visaDetails || "None provided"}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          <div className="space-y-4">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Primary Work Country / Jurisdiction
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="e.g. US, Canada, United Kingdom, India"
                required
                className="w-full sm:w-80 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Legal Work Authorization Status *
              </label>
              <select
                value={formData.workAuthorization}
                onChange={(e) => setFormData({ ...formData, workAuthorization: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="CITIZEN">Citizen / National</option>
                <option value="PERMANENT_RESIDENT">Permanent Resident (Green Card / PR)</option>
                <option value="WORK_VISA">Work Visa (H-1B, L-1, O-1, TN, E-3, etc.)</option>
                <option value="STUDENT_VISA">Student Work Authorization (F-1 OPT / CPT / STEM)</option>
                <option value="REQUIRES_SPONSORSHIP">Requires Employer Sponsorship</option>
                <option value="OTHER">Other / Need Specialist Clarification</option>
              </select>
            </div>

            <div className="pt-2">
              <label className="inline-flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.requiresSponsorship}
                  onChange={(e) => setFormData({ ...formData, requiresSponsorship: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-slate-800">
                  I will require employer sponsorship (now or in future) to maintain work eligibility
                </span>
              </label>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Visa Specifics / Expiry Timeline (Optional)
              </label>
              <input
                type="text"
                value={formData.visaDetails}
                onChange={(e) => setFormData({ ...formData, visaDetails: e.target.value })}
                placeholder="e.g. STEM OPT valid through June 2028; H-1B transfer required"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveStatus === "SAVING"}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {saveStatus === "SAVING" ? "Saving..." : "Save Authorization Settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
