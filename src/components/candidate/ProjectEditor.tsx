"use client";

import React, { useState } from "react";
import {
  upsertCandidateProjectAction,
  deleteCandidateProjectAction,
} from "@/lib/candidate/actions";
import { SaveStateIndicator, SaveStatus } from "./SaveStateIndicator";

export interface CandidateProjectItem {
  id: string;
  title: string;
  role?: string | null;
  url?: string | null;
  description?: string | null;
  highlights: string[];
  technologies: string[];
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  orderIndex: number;
}

interface Props {
  projects: CandidateProjectItem[];
  onProjectsChanged?: () => void;
}

export function ProjectEditor({ projects, onProjectsChanged }: Props) {
  const [editingItem, setEditingItem] = useState<CandidateProjectItem | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formState, setFormState] = useState({
    id: "",
    title: "",
    role: "",
    url: "",
    description: "",
    highlightsText: "",
    technologiesText: "",
    startDate: "",
    endDate: "",
  });

  const formatDateForInput = (d: string | Date | null | undefined): string => {
    if (!d) return "";
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "";
    return dateObj.toISOString().split("T")[0] || "";
  };

  const startEdit = (item: CandidateProjectItem) => {
    setEditingItem(item);
    setIsCreatingNew(false);
    setFormState({
      id: item.id,
      title: item.title,
      role: item.role || "",
      url: item.url || "",
      description: item.description || "",
      highlightsText: item.highlights.join("\n"),
      technologiesText: item.technologies.join(", "),
      startDate: formatDateForInput(item.startDate),
      endDate: formatDateForInput(item.endDate),
    });
    setErrorMessage(null);
  };

  const startCreate = () => {
    setIsCreatingNew(true);
    setEditingItem(null);
    setFormState({
      id: "",
      title: "",
      role: "",
      url: "",
      description: "",
      highlightsText: "",
      technologiesText: "",
      startDate: "",
      endDate: "",
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
    if (!formState.title.trim()) {
      setErrorMessage("Project title is required.");
      return;
    }

    setSaveStatus("SAVING");
    setErrorMessage(null);

    const highlights = formState.highlightsText
      .split("\n")
      .map((h) => h.trim())
      .filter(Boolean);

    const technologies = formState.technologiesText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await upsertCandidateProjectAction({
        id: formState.id || undefined,
        title: formState.title.trim(),
        role: formState.role.trim() || null,
        url: formState.url.trim() || "",
        description: formState.description.trim() || null,
        highlights,
        technologies,
        startDate: formState.startDate || null,
        endDate: formState.endDate || null,
        orderIndex: editingItem?.orderIndex ?? projects.length,
      });

      if (res.success) {
        setSaveStatus("SAVED");
        setIsCreatingNew(false);
        setEditingItem(null);
        onProjectsChanged?.();
        setTimeout(() => setSaveStatus("IDLE"), 2500);
      } else {
        setSaveStatus("ERROR");
        setErrorMessage(res.error || "Failed to save project");
      }
    } catch {
      setSaveStatus("ERROR");
      setErrorMessage("Unable to save project. Please try again.");
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete project “${title}”? This cannot be undone.`)) return;

    setDeletingId(id);
    try {
      const res = await deleteCandidateProjectAction(id);
      if (res.success) {
        onProjectsChanged?.();
      } else {
        setErrorMessage(res.error || "Failed to delete project");
      }
    } catch {
      setErrorMessage("Unable to delete project. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const formatMonthYear = (dateInput: string | Date | null | undefined): string => {
    if (!dateInput) return "";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString([], { month: "short", year: "numeric" });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Projects
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              {projects.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Your projects and practical work
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
              <span>+ Add project</span>
            </button>
          )}
        </div>
      </div>

      {(isCreatingNew || editingItem) && (
        <form onSubmit={handleSave} className="p-5 border-b border-slate-200 bg-slate-50/40 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              {isCreatingNew ? "Add project" : `Edit: ${editingItem?.title}`}
            </h3>
            <button
              type="button"
              onClick={handleCancel}
              className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              aria-label="Cancel editing"
            >
              ✕
            </button>
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">
                Project name *
              </label>
              <input
                type="text"
                value={formState.title}
                onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                placeholder="e.g. Inventory sync service"
                required
                maxLength={200}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Your role
              </label>
              <input
                type="text"
                value={formState.role}
                onChange={(e) => setFormState({ ...formState, role: e.target.value })}
                placeholder="e.g. Lead engineer"
                maxLength={100}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Project URL
              </label>
              <input
                type="url"
                value={formState.url}
                onChange={(e) => setFormState({ ...formState, url: e.target.value })}
                placeholder="https://…"
                maxLength={500}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Start date
              </label>
              <input
                type="date"
                value={formState.startDate}
                onChange={(e) => setFormState({ ...formState, startDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                End date
              </label>
              <input
                type="date"
                value={formState.endDate}
                onChange={(e) => setFormState({ ...formState, endDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">
                Technologies / skills (comma-separated)
              </label>
              <input
                type="text"
                value={formState.technologiesText}
                onChange={(e) => setFormState({ ...formState, technologiesText: e.target.value })}
                placeholder="e.g. TypeScript, PostgreSQL, React"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">
                Description
              </label>
              <textarea
                value={formState.description}
                onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                rows={3}
                placeholder="What you built, the problem it solved, and your contribution…"
                maxLength={5000}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">
                Highlights (one per line)
              </label>
              <textarea
                value={formState.highlightsText}
                onChange={(e) => setFormState({ ...formState, highlightsText: e.target.value })}
                rows={3}
                placeholder="Reduced sync lag from hours to minutes&#10;Shipped to 12 warehouse locations"
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
              {saveStatus === "SAVING" ? "Saving…" : isCreatingNew ? "Add project" : "Save changes"}
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 && !isCreatingNew ? (
        <div className="p-10 text-center text-slate-500 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">No projects added yet.</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Add projects to strengthen your career profile. Practical work helps specialists represent your experience accurately.
          </p>
          <button
            type="button"
            onClick={startCreate}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 pt-2 inline-block cursor-pointer"
          >
            + Add project →
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {projects.map((item) => {
            const dateRange = [formatMonthYear(item.startDate), formatMonthYear(item.endDate)]
              .filter(Boolean)
              .join(" — ");

            return (
              <div
                key={item.id}
                className="p-5 hover:bg-slate-50/60 transition-colors space-y-3 text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                      {item.role && (
                        <>
                          <span className="text-slate-400">•</span>
                          <span className="font-semibold text-slate-700">{item.role}</span>
                        </>
                      )}
                    </div>
                    {(dateRange || item.url) && (
                      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                        {dateRange && <span>{dateRange}</span>}
                        {item.url && (
                          <>
                            {dateRange && <span>•</span>}
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-medium truncate max-w-[220px]"
                            >
                              {item.url.replace(/^https?:\/\//, "")}
                            </a>
                          </>
                        )}
                      </div>
                    )}
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
                      onClick={() => handleDelete(item.id, item.title)}
                      disabled={deletingId === item.id}
                      className="px-2.5 py-1 rounded-md text-xs font-medium text-rose-600 hover:bg-rose-50 transition disabled:opacity-50 cursor-pointer"
                    >
                      {deletingId === item.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>

                {item.description && (
                  <p className="text-slate-600 leading-relaxed max-w-3xl">{item.description}</p>
                )}

                {item.highlights.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                    {item.highlights.map((highlight, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {highlight}
                      </li>
                    ))}
                  </ul>
                )}

                {item.technologies.length > 0 && (
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
            );
          })}
        </div>
      )}
    </div>
  );
}
