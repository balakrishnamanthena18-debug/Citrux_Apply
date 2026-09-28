"use client";

import React, { useState } from "react";
import {
  upsertCandidateExperienceAction,
  deleteCandidateExperienceAction,
} from "@/lib/candidate/actions";
import { SaveStateIndicator, SaveStatus } from "./SaveStateIndicator";

export interface CandidateExperienceItem {
  id: string;
  companyName: string;
  jobTitle: string;
  location?: string | null;
  isCurrent: boolean;
  startDate: string | Date;
  endDate?: string | Date | null;
  description?: string | null;
  achievements: string[];
  technologies: string[];
  orderIndex: number;
}

interface Props {
  experiences: CandidateExperienceItem[];
  onExperiencesChanged?: () => void;
}

export function ExperienceEditor({ experiences, onExperiencesChanged }: Props) {
  const [editingItem, setEditingItem] = useState<CandidateExperienceItem | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form State
  const [formState, setFormState] = useState({
    id: "",
    companyName: "",
    jobTitle: "",
    location: "",
    isCurrent: false,
    startDate: "",
    endDate: "",
    description: "",
    achievementsText: "",
    technologiesText: "",
  });

  const formatDateForInput = (d: string | Date | null | undefined): string => {
    if (!d) return "";
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "";
    return dateObj.toISOString().split("T")[0] || "";
  };

  const startEdit = (item: CandidateExperienceItem) => {
    setEditingItem(item);
    setIsCreatingNew(false);
    setFormState({
      id: item.id,
      companyName: item.companyName,
      jobTitle: item.jobTitle,
      location: item.location || "",
      isCurrent: item.isCurrent,
      startDate: formatDateForInput(item.startDate),
      endDate: formatDateForInput(item.endDate),
      description: item.description || "",
      achievementsText: item.achievements.join("\n"),
      technologiesText: item.technologies.join(", "),
    });
    setErrorMessage(null);
  };

  const startCreate = () => {
    setIsCreatingNew(true);
    setEditingItem(null);
    setFormState({
      id: "",
      companyName: "",
      jobTitle: "",
      location: "",
      isCurrent: false,
      startDate: "",
      endDate: "",
      description: "",
      achievementsText: "",
      technologiesText: "",
    });
    setErrorMessage(null);
  };

  const handleCancel = () => {
    setIsCreatingNew(false);
    setEditingItem(null);
    setErrorMessage(null);
    setSaveStatus("IDLE");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.companyName.trim() || !formState.jobTitle.trim() || !formState.startDate) {
      setErrorMessage("Company name, job title, and start date are required.");
      return;
    }

    setSaveStatus("SAVING");
    setErrorMessage(null);

    const achievements = formState.achievementsText
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);

    const technologies = formState.technologiesText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await upsertCandidateExperienceAction({
        id: formState.id || undefined,
        companyName: formState.companyName.trim(),
        jobTitle: formState.jobTitle.trim(),
        location: formState.location.trim() || null,
        isCurrent: formState.isCurrent,
        startDate: formState.startDate,
        endDate: formState.isCurrent ? null : formState.endDate || null,
        description: formState.description.trim() || null,
        achievements,
        technologies,
      });

      if (res.success) {
        setSaveStatus("SAVED");
        setIsCreatingNew(false);
        setEditingItem(null);
        onExperiencesChanged?.();
        setTimeout(() => setSaveStatus("IDLE"), 2500);
      } else {
        setSaveStatus("ERROR");
        setErrorMessage(res.error || "Failed to save experience");
      }
    } catch {
      setSaveStatus("ERROR");
      setErrorMessage("Network error saving experience");
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete ${title}?`)) return;

    setDeletingId(id);
    try {
      const res = await deleteCandidateExperienceAction(id);
      if (res.success) {
        onExperiencesChanged?.();
      } else {
        alert(res.error || "Failed to delete experience");
      }
    } catch {
      alert("Network error deleting experience");
    } finally {
      setDeletingId(null);
    }
  };

  const formatMonthYear = (dateInput: string | Date | null | undefined): string => {
    if (!dateInput) return "Present";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString([], { month: "short", year: "numeric" });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Work Experience
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              {experiences.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Canonical employment history and verified role accomplishments
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SaveStateIndicator status={saveStatus} errorMessage={errorMessage} />
          {!isCreatingNew && !editingItem && (
            <button
              type="button"
              onClick={startCreate}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs cursor-pointer inline-flex items-center gap-1"
            >
              <span>+ Add Experience</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor Form Modal / Inline Section */}
      {(isCreatingNew || editingItem) && (
        <form onSubmit={handleSave} className="p-5 border-b border-slate-200 bg-slate-50/40 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              {isCreatingNew ? "Add New Work Experience" : `Edit: ${editingItem?.jobTitle} at ${editingItem?.companyName}`}
            </h3>
            <button
              type="button"
              onClick={handleCancel}
              className="text-slate-400 hover:text-slate-700 font-bold"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Employer / Company Name *
              </label>
              <input
                type="text"
                value={formState.companyName}
                onChange={(e) => setFormState({ ...formState, companyName: e.target.value })}
                placeholder="e.g. Stripe, Airbnb, Google"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Job Title *
              </label>
              <input
                type="text"
                value={formState.jobTitle}
                onChange={(e) => setFormState({ ...formState, jobTitle: e.target.value })}
                placeholder="e.g. Senior Frontend Engineer"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Location
              </label>
              <input
                type="text"
                value={formState.location}
                onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                placeholder="e.g. San Francisco, CA (or Remote)"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div className="flex items-center pt-6">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.isCurrent}
                  onChange={(e) => setFormState({ ...formState, isCurrent: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-slate-800">I currently work in this role</span>
              </label>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={formState.startDate}
                onChange={(e) => setFormState({ ...formState, startDate: e.target.value })}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            {!formState.isCurrent && (
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={formState.endDate}
                  onChange={(e) => setFormState({ ...formState, endDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">
                Technologies & Tools Used (Comma-separated)
              </label>
              <input
                type="text"
                value={formState.technologiesText}
                onChange={(e) => setFormState({ ...formState, technologiesText: e.target.value })}
                placeholder="e.g. React, TypeScript, PostgreSQL, GraphQL, Docker"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">
                Role Description & Scope
              </label>
              <textarea
                value={formState.description}
                onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                rows={3}
                placeholder="Overview of your core responsibilities and team context..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">
                Key Achievements & Impacts (One per line)
              </label>
              <textarea
                value={formState.achievementsText}
                onChange={(e) => setFormState({ ...formState, achievementsText: e.target.value })}
                rows={4}
                placeholder="• Scaled backend throughput 3x by decoupling monolith queries&#10;• Designed design token architecture used across 4 mobile apps"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
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
              {saveStatus === "SAVING" ? "Saving..." : isCreatingNew ? "Add Position" : "Save Changes"}
            </button>
          </div>
        </form>
      )}

      {/* Experience List */}
      {experiences.length === 0 && !isCreatingNew ? (
        <div className="p-10 text-center text-slate-500 space-y-2">
          <div className="text-2xl">💼</div>
          <h3 className="text-sm font-semibold text-slate-900">No work experience listed</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Adding your employment history provides authoritative facts for our operations team to assemble tailored bullet points.
          </p>
          <button
            type="button"
            onClick={startCreate}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 pt-2 inline-block cursor-pointer"
          >
            + Add First Position →
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {experiences.map((item) => (
            <div
              key={item.id}
              className="p-5 hover:bg-slate-50/60 transition-colors space-y-3 text-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900">
                      {item.jobTitle}
                    </h3>
                    <span className="text-slate-400">•</span>
                    <span className="font-semibold text-slate-700">
                      {item.companyName}
                    </span>
                    {item.isCurrent && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Current Role
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                    <span>
                      {formatMonthYear(item.startDate)} — {item.isCurrent ? "Present" : formatMonthYear(item.endDate)}
                    </span>
                    {item.location && (
                      <>
                        <span>•</span>
                        <span>{item.location}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="px-3 py-1 rounded-md text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition shadow-2xs cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.jobTitle)}
                    disabled={deletingId === item.id}
                    className="px-2.5 py-1 rounded-md text-xs font-medium text-rose-600 hover:bg-rose-50 transition disabled:opacity-50 cursor-pointer"
                  >
                    {deletingId === item.id ? "..." : "Delete"}
                  </button>
                </div>
              </div>

              {item.description && (
                <p className="text-slate-600 leading-relaxed max-w-3xl">
                  {item.description}
                </p>
              )}

              {item.achievements && item.achievements.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Key Highlights & Impact
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                    {item.achievements.map((ach, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {ach}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {item.technologies && item.technologies.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {item.technologies.map((tech, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
