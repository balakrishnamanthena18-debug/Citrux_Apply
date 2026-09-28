"use client";

import React, { useState } from "react";
import { updateCandidateProfileSelfAction } from "@/lib/candidate/actions";
import { SaveStateIndicator, SaveStatus } from "./SaveStateIndicator";

interface Props {
  candidate: any;
  onProfileUpdated?: (updatedCandidate: any) => void;
}

export function PersonalContactEditor({ candidate, onProfileUpdated }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Form local state
  const [formData, setFormData] = useState({
    phone: candidate.phone || "",
    city: candidate.city || "",
    state: candidate.state || "",
    country: candidate.country || "US",
    postalCode: candidate.postalCode || "",
    timezone: candidate.timezone || "",
    linkedinUrl: candidate.linkedinUrl || "",
    githubUrl: candidate.githubUrl || "",
    portfolioUrl: candidate.portfolioUrl || "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSaveStatus("DIRTY");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("SAVING");
    setErrorMessage(null);

    try {
      const res = await updateCandidateProfileSelfAction({
        phone: formData.phone.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        country: formData.country.trim() || "US",
        postalCode: formData.postalCode.trim() || null,
        timezone: formData.timezone.trim() || null,
        linkedinUrl: formData.linkedinUrl.trim() || null,
        githubUrl: formData.githubUrl.trim() || null,
        portfolioUrl: formData.portfolioUrl.trim() || null,
      });

      if (res.success) {
        setSaveStatus("SAVED");
        setLastSavedAt(new Date());
        setIsEditing(false);
        onProfileUpdated?.({ ...candidate, ...formData });
        setTimeout(() => setSaveStatus("IDLE"), 3000);
      } else {
        setSaveStatus("ERROR");
        setErrorMessage(res.error || "Failed to update personal contact details");
      }
    } catch {
      setSaveStatus("ERROR");
      setErrorMessage("Network error saving profile");
    }
  };

  const handleCancel = () => {
    setFormData({
      phone: candidate.phone || "",
      city: candidate.city || "",
      state: candidate.state || "",
      country: candidate.country || "US",
      postalCode: candidate.postalCode || "",
      timezone: candidate.timezone || "",
      linkedinUrl: candidate.linkedinUrl || "",
      githubUrl: candidate.githubUrl || "",
      portfolioUrl: candidate.portfolioUrl || "",
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
            Personal & Contact Information
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Canonical contact numbers, location, and verified web profiles
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
              Edit Details
            </button>
          )}
        </div>
      </div>

      {/* Read-Only View vs Inline Editing View */}
      {!isEditing ? (
        <div className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <span className="text-slate-400 font-medium block">Phone Number</span>
              <span className="font-semibold text-slate-900 mt-1 block">
                {candidate.phone || "—"}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">Location</span>
              <span className="font-semibold text-slate-900 mt-1 block">
                {[candidate.city, candidate.state, candidate.country].filter(Boolean).join(", ") || "—"}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">Postal Code</span>
              <span className="font-semibold text-slate-900 mt-1 block">
                {candidate.postalCode || "—"}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">Timezone</span>
              <span className="font-semibold text-slate-900 mt-1 block">
                {candidate.timezone || "—"}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">LinkedIn Profile</span>
              {candidate.linkedinUrl ? (
                <a
                  href={candidate.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-semibold mt-1 inline-flex items-center gap-1"
                >
                  <span>Open LinkedIn</span>
                  <span>↗</span>
                </a>
              ) : (
                <span className="text-slate-400 mt-1 block">—</span>
              )}
            </div>

            <div>
              <span className="text-slate-400 font-medium block">GitHub Profile</span>
              {candidate.githubUrl ? (
                <a
                  href={candidate.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-semibold mt-1 inline-flex items-center gap-1"
                >
                  <span>Open GitHub</span>
                  <span>↗</span>
                </a>
              ) : (
                <span className="text-slate-400 mt-1 block">—</span>
              )}
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <span className="text-slate-400 font-medium block">Portfolio / Personal Website</span>
              {candidate.portfolioUrl ? (
                <a
                  href={candidate.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-semibold mt-1 inline-flex items-center gap-1"
                >
                  <span>{candidate.portfolioUrl}</span>
                  <span>↗</span>
                </a>
              ) : (
                <span className="text-slate-400 mt-1 block">—</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+1 (555) 012-3456"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                City
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="San Francisco"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                State / Province
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                placeholder="CA"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Country
              </label>
              <input
                type="text"
                name="country"
                value={formData.country}
                onChange={handleChange}
                placeholder="US"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Postal Code
              </label>
              <input
                type="text"
                name="postalCode"
                value={formData.postalCode}
                onChange={handleChange}
                placeholder="94105"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Timezone
              </label>
              <input
                type="text"
                name="timezone"
                value={formData.timezone}
                onChange={handleChange}
                placeholder="America/Los_Angeles"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                LinkedIn Profile URL
              </label>
              <input
                type="url"
                name="linkedinUrl"
                value={formData.linkedinUrl}
                onChange={handleChange}
                placeholder="https://linkedin.com/in/username"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                GitHub Profile URL
              </label>
              <input
                type="url"
                name="githubUrl"
                value={formData.githubUrl}
                onChange={handleChange}
                placeholder="https://github.com/username"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Portfolio / Website URL
              </label>
              <input
                type="url"
                name="portfolioUrl"
                value={formData.portfolioUrl}
                onChange={handleChange}
                placeholder="https://portfolio.dev"
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
              {saveStatus === "SAVING" ? "Saving..." : "Save Contact Info"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
