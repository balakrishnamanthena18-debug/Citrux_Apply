"use client";

import React, { useState } from "react";
import { updateCandidateProfileSelfAction } from "@/lib/candidate/actions";
import { SaveStateIndicator, SaveStatus } from "./SaveStateIndicator";

interface Props {
  candidate: any;
  onProfileUpdated?: (updatedCandidate: any) => void;
}

export function ProfessionalSummaryEditor({ candidate, onProfileUpdated }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const [formData, setFormData] = useState({
    headline: candidate.headline || "",
    professionalSummary: candidate.professionalSummary || "",
    totalYearsExperience: candidate.totalYearsExperience !== undefined && candidate.totalYearsExperience !== null
      ? String(candidate.totalYearsExperience)
      : "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSaveStatus("DIRTY");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("SAVING");
    setErrorMessage(null);

    const yearsNum = formData.totalYearsExperience.trim()
      ? Number(formData.totalYearsExperience)
      : null;

    try {
      const res = await updateCandidateProfileSelfAction({
        headline: formData.headline.trim() || null,
        professionalSummary: formData.professionalSummary.trim() || null,
        totalYearsExperience: yearsNum,
      });

      if (res.success) {
        setSaveStatus("SAVED");
        setLastSavedAt(new Date());
        setIsEditing(false);
        onProfileUpdated?.({
          ...candidate,
          headline: formData.headline,
          professionalSummary: formData.professionalSummary,
          totalYearsExperience: yearsNum,
        });
        setTimeout(() => setSaveStatus("IDLE"), 3000);
      } else {
        setSaveStatus("ERROR");
        setErrorMessage(res.error || "Failed to update professional summary");
      }
    } catch {
      setSaveStatus("ERROR");
      setErrorMessage("Network error saving professional summary");
    }
  };

  const handleCancel = () => {
    setFormData({
      headline: candidate.headline || "",
      professionalSummary: candidate.professionalSummary || "",
      totalYearsExperience: candidate.totalYearsExperience !== undefined && candidate.totalYearsExperience !== null
        ? String(candidate.totalYearsExperience)
        : "",
    });
    setIsEditing(false);
    setSaveStatus("IDLE");
    setErrorMessage(null);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Professional Summary & Career Focus
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Core career headline and narrative summary used for tailored materials
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SaveStateIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            errorMessage={errorMessage}
          />
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition shadow-2xs cursor-pointer"
            >
              Edit Summary
            </button>
          )}
        </div>
      </div>

      {/* View vs Edit */}
      {!isEditing ? (
        <div className="p-5 space-y-4 text-xs">
          <div>
            <span className="text-slate-400 font-medium block">Professional Headline</span>
            <p className="text-sm font-semibold text-slate-900 mt-1">
              {candidate.headline || "No headline set. Click Edit Summary to define your primary career identity."}
            </p>
          </div>

          <div>
            <span className="text-slate-400 font-medium block">Total Years Experience</span>
            <p className="font-semibold text-slate-800 mt-1">
              {candidate.totalYearsExperience !== null && candidate.totalYearsExperience !== undefined
                ? `${candidate.totalYearsExperience} Years`
                : "Not specified"}
            </p>
          </div>

          <div>
            <span className="text-slate-400 font-medium block">Executive Professional Summary</span>
            {candidate.professionalSummary ? (
              <p className="text-slate-700 mt-1.5 whitespace-pre-wrap leading-relaxed bg-slate-50/70 p-4 rounded-lg border border-slate-100 font-sans">
                {candidate.professionalSummary}
              </p>
            ) : (
              <p className="text-slate-400 italic mt-1">
                No summary added yet. Provide a summary highlighting your domain focus, technical expertise, and career accomplishments.
              </p>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Professional Headline
            </label>
            <input
              type="text"
              name="headline"
              value={formData.headline}
              onChange={handleChange}
              placeholder="e.g. Staff Distributed Systems Engineer | Cloud Architecture & Platform"
              maxLength={255}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Total Years of Professional Experience
            </label>
            <input
              type="number"
              name="totalYearsExperience"
              value={formData.totalYearsExperience}
              onChange={handleChange}
              min="0"
              max="60"
              step="0.5"
              placeholder="e.g. 8"
              className="w-48 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Professional Summary
            </label>
            <textarea
              name="professionalSummary"
              value={formData.professionalSummary}
              onChange={handleChange}
              rows={6}
              placeholder="Detail your core engineering background, architecture accomplishments, and leadership scope..."
              maxLength={5000}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white leading-relaxed font-sans"
            />
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
              {saveStatus === "SAVING" ? "Saving..." : "Save Professional Summary"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
