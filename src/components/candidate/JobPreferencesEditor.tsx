"use client";

import React, { useState } from "react";
import { updateCandidateProfileSelfAction } from "@/lib/candidate/actions";
import { formatSalary } from "@/lib/utils/status-presenter";
import { SaveStateIndicator, SaveStatus } from "./SaveStateIndicator";

interface Props {
  candidate: any;
  onProfileUpdated?: (updatedCandidate: any) => void;
}

export function JobPreferencesEditor({ candidate, onProfileUpdated }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const [formData, setFormData] = useState({
    targetRoles: (candidate.targetRoles || []) as string[],
    targetLocations: (candidate.targetLocations || []) as string[],
    remotePreference: candidate.remotePreference || "FLEXIBLE",
    desiredSalaryMin: candidate.desiredSalaryMin ? String(candidate.desiredSalaryMin) : "",
    desiredSalaryMax: candidate.desiredSalaryMax ? String(candidate.desiredSalaryMax) : "",
    salaryCurrency: candidate.salaryCurrency || "USD",
    applicationAuthorizationMode: candidate.applicationAuthorizationMode || "MANAGED",
  });

  const [newRoleInput, setNewRoleInput] = useState("");
  const [newLocationInput, setNewLocationInput] = useState("");

  const handleAddRole = () => {
    const trimmed = newRoleInput.trim();
    if (trimmed && !formData.targetRoles.includes(trimmed)) {
      setFormData({
        ...formData,
        targetRoles: [...formData.targetRoles, trimmed],
      });
      setNewRoleInput("");
      setSaveStatus("DIRTY");
    }
  };

  const handleRemoveRole = (role: string) => {
    setFormData({
      ...formData,
      targetRoles: formData.targetRoles.filter((r) => r !== role),
    });
    setSaveStatus("DIRTY");
  };

  const handleAddLocation = () => {
    const trimmed = newLocationInput.trim();
    if (trimmed && !formData.targetLocations.includes(trimmed)) {
      setFormData({
        ...formData,
        targetLocations: [...formData.targetLocations, trimmed],
      });
      setNewLocationInput("");
      setSaveStatus("DIRTY");
    }
  };

  const handleRemoveLocation = (loc: string) => {
    setFormData({
      ...formData,
      targetLocations: formData.targetLocations.filter((l) => l !== loc),
    });
    setSaveStatus("DIRTY");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("SAVING");
    setErrorMessage(null);

    const minSalaryNum = formData.desiredSalaryMin.trim()
      ? Number(formData.desiredSalaryMin)
      : null;
    const maxSalaryNum = formData.desiredSalaryMax.trim()
      ? Number(formData.desiredSalaryMax)
      : null;

    try {
      const res = await updateCandidateProfileSelfAction({
        targetRoles: formData.targetRoles,
        targetLocations: formData.targetLocations,
        remotePreference: formData.remotePreference as any,
        desiredSalaryMin: minSalaryNum,
        desiredSalaryMax: maxSalaryNum,
        salaryCurrency: formData.salaryCurrency,
        applicationAuthorizationMode: formData.applicationAuthorizationMode as any,
      });

      if (res.success) {
        setSaveStatus("SAVED");
        setLastSavedAt(new Date());
        setIsEditing(false);
        onProfileUpdated?.({
          ...candidate,
          targetRoles: formData.targetRoles,
          targetLocations: formData.targetLocations,
          remotePreference: formData.remotePreference,
          desiredSalaryMin: minSalaryNum,
          desiredSalaryMax: maxSalaryNum,
          salaryCurrency: formData.salaryCurrency,
          applicationAuthorizationMode: formData.applicationAuthorizationMode,
        });
        setTimeout(() => setSaveStatus("IDLE"), 2500);
      } else {
        setSaveStatus("ERROR");
        setErrorMessage(res.error || "Failed to update job preferences");
      }
    } catch {
      setSaveStatus("ERROR");
      setErrorMessage("Network error saving job preferences");
    }
  };

  const handleCancel = () => {
    setFormData({
      targetRoles: (candidate.targetRoles || []) as string[],
      targetLocations: (candidate.targetLocations || []) as string[],
      remotePreference: candidate.remotePreference || "FLEXIBLE",
      desiredSalaryMin: candidate.desiredSalaryMin ? String(candidate.desiredSalaryMin) : "",
      desiredSalaryMax: candidate.desiredSalaryMax ? String(candidate.desiredSalaryMax) : "",
      salaryCurrency: candidate.salaryCurrency || "USD",
      applicationAuthorizationMode: candidate.applicationAuthorizationMode || "MANAGED",
    });
    setIsEditing(false);
    setSaveStatus("IDLE");
    setErrorMessage(null);
  };

  const remoteLabels: Record<string, string> = {
    REMOTE_ONLY: "Remote Only",
    HYBRID: "Hybrid (Remote + On-site)",
    ONSITE: "On-site Only",
    FLEXIBLE: "Flexible (Open to Remote or On-site)",
  };

  const salaryDisplay = formatSalary(
    candidate.desiredSalaryMin,
    candidate.desiredSalaryMax,
    candidate.salaryCurrency
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Job Search Boundaries & Preferences
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              {formData.targetRoles.length} Target Roles
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Defines the operational rules for role qualification, target compensation, and authorization mode
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
              Edit Preferences
            </button>
          )}
        </div>
      </div>

      {/* View vs Edit */}
      {!isEditing ? (
        <div className="p-5 space-y-4 text-xs">
          <div>
            <span className="text-slate-400 font-medium block">Target Job Titles</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {candidate.targetRoles && candidate.targetRoles.length > 0 ? (
                candidate.targetRoles.map((role: string, idx: number) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                  >
                    {role}
                  </span>
                ))
              ) : (
                <span className="text-slate-400 italic">No target roles configured</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div>
              <span className="text-slate-400 font-medium block">Work Mode Preference</span>
              <span className="font-semibold text-slate-900 mt-1 block">
                {remoteLabels[candidate.remotePreference] || candidate.remotePreference || "Flexible"}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">Target Compensation</span>
              <span className="font-semibold text-slate-900 mt-1 block">
                {salaryDisplay}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">Application Authorization Mode</span>
              <span className="font-semibold text-slate-900 mt-1 block">
                {candidate.applicationAuthorizationMode === "MANAGED"
                  ? "Managed (Specialist submittals)"
                  : "Review Required (Per-application approval)"}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <span className="text-slate-400 font-medium block">Target Locations</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {candidate.targetLocations && candidate.targetLocations.length > 0 ? (
                candidate.targetLocations.map((loc: string, idx: number) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                  >
                    {loc}
                  </span>
                ))
              ) : (
                <span className="text-slate-400 italic">No specific location restrictions</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          {/* Target Roles */}
          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              Target Job Titles
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newRoleInput}
                onChange={(e) => setNewRoleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddRole();
                  }
                }}
                placeholder="e.g. Senior Frontend Engineer, Staff Product Architect"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              <button
                type="button"
                onClick={handleAddRole}
                className="px-3.5 py-2 rounded-lg bg-slate-900 text-white font-semibold text-xs shadow-2xs hover:bg-slate-800 transition cursor-pointer"
              >
                Add Role
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {formData.targetRoles.map((role) => (
                <span
                  key={role}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white text-slate-800 border border-slate-200 shadow-2xs"
                >
                  <span>{role}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRole(role)}
                    className="text-slate-400 hover:text-rose-600 font-bold ml-1"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Locations */}
          <div className="pt-2 border-t border-slate-100">
            <label className="font-semibold text-slate-700 block mb-1">
              Target Geographic Locations
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newLocationInput}
                onChange={(e) => setNewLocationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddLocation();
                  }
                }}
                placeholder="e.g. San Francisco, CA, New York, NY, Austin, TX, Remote US"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              <button
                type="button"
                onClick={handleAddLocation}
                className="px-3.5 py-2 rounded-lg bg-slate-900 text-white font-semibold text-xs shadow-2xs hover:bg-slate-800 transition cursor-pointer"
              >
                Add Location
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {formData.targetLocations.map((loc) => (
                <span
                  key={loc}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white text-slate-800 border border-slate-200 shadow-2xs"
                >
                  <span>{loc}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveLocation(loc)}
                    className="text-slate-400 hover:text-rose-600 font-bold ml-1"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Modes & Salary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Work Mode Preference
              </label>
              <select
                value={formData.remotePreference}
                onChange={(e) => {
                  setFormData({ ...formData, remotePreference: e.target.value as any });
                  setSaveStatus("DIRTY");
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="FLEXIBLE">Flexible (Remote or On-site)</option>
                <option value="REMOTE_ONLY">Remote Only</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ONSITE">On-site Only</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Desired Minimum Salary (Annual)
              </label>
              <input
                type="number"
                value={formData.desiredSalaryMin}
                onChange={(e) => {
                  setFormData({ ...formData, desiredSalaryMin: e.target.value });
                  setSaveStatus("DIRTY");
                }}
                placeholder="e.g. 140000"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Desired Maximum / Target Salary
              </label>
              <input
                type="number"
                value={formData.desiredSalaryMax}
                onChange={(e) => {
                  setFormData({ ...formData, desiredSalaryMax: e.target.value });
                  setSaveStatus("DIRTY");
                }}
                placeholder="e.g. 180000"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3 pt-2">
              <label className="font-semibold text-slate-700 block mb-1">
                Application Authorization Mode
              </label>
              <select
                value={formData.applicationAuthorizationMode}
                onChange={(e) => {
                  setFormData({ ...formData, applicationAuthorizationMode: e.target.value as any });
                  setSaveStatus("DIRTY");
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="MANAGED">Managed Authorization (Operations automatically prepares & submits approved matching roles)</option>
                <option value="REVIEW_REQUIRED">Review Required (You must explicitly review and sign off on every application before submission)</option>
              </select>
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
              {saveStatus === "SAVING" ? "Saving..." : "Save Job Preferences"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
