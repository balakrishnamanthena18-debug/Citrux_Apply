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
  const [reorderingId, setReorderingId] = useState<string | null>(null);

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

  const sortedProjects = [...projects].sort(
    (a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title)
  );

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
      setErrorMessage("Project name is required.");
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
        setErrorMessage(res.error || "We couldn't save your project.");
      }
    } catch {
      setSaveStatus("ERROR");
      setErrorMessage("We couldn't save your project. Please try again.");
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (
      !window.confirm(
        `Remove “${title}” from your projects? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await deleteCandidateProjectAction(id);
      if (res.success) {
        onProjectsChanged?.();
      } else {
        setErrorMessage(res.error || "We couldn't remove this project.");
      }
    } catch {
      setErrorMessage("We couldn't remove this project. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const moveProject = async (id: string, direction: "up" | "down") => {
    const index = sortedProjects.findIndex((p) => p.id === id);
    if (index < 0) return;
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= sortedProjects.length) return;

    const current = sortedProjects[index]!;
    const neighbor = sortedProjects[swapWith]!;
    setReorderingId(id);
    setErrorMessage(null);

    try {
      const first = await upsertCandidateProjectAction({
        id: current.id,
        title: current.title,
        role: current.role ?? null,
        url: current.url ?? "",
        description: current.description ?? null,
        highlights: current.highlights,
        technologies: current.technologies,
        startDate: formatDateForInput(current.startDate) || null,
        endDate: formatDateForInput(current.endDate) || null,
        orderIndex: neighbor.orderIndex,
      });
      const second = await upsertCandidateProjectAction({
        id: neighbor.id,
        title: neighbor.title,
        role: neighbor.role ?? null,
        url: neighbor.url ?? "",
        description: neighbor.description ?? null,
        highlights: neighbor.highlights,
        technologies: neighbor.technologies,
        startDate: formatDateForInput(neighbor.startDate) || null,
        endDate: formatDateForInput(neighbor.endDate) || null,
        orderIndex: current.orderIndex,
      });

      if (!first.success || !second.success) {
        setErrorMessage("We couldn't update the project order.");
        return;
      }
      onProjectsChanged?.();
    } catch {
      setErrorMessage("We couldn't update the project order.");
    } finally {
      setReorderingId(null);
    }
  };

  const formatMonthYear = (dateInput: string | Date | null | undefined): string => {
    if (!dateInput) return "";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString([], { month: "short", year: "numeric" });
  };

  return (
    <div
      className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden"
      data-testid="candidate-projects-section"
    >
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
            Showcase the work that best represents your career
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
        <form
          onSubmit={handleSave}
          className="p-5 border-b border-slate-200 bg-slate-50/40 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              {isCreatingNew ? "Add project" : `Edit project`}
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
            <div
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800"
              role="alert"
            >
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
                placeholder="e.g. Payments platform"
                required
                maxLength={200}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
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
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Project link
              </label>
              <input
                type="url"
                value={formState.url}
                onChange={(e) => setFormState({ ...formState, url: e.target.value })}
                placeholder="https://…"
                maxLength={500}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
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
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
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
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">
                Technologies you used
              </label>
              <input
                type="text"
                value={formState.technologiesText}
                onChange={(e) =>
                  setFormState({ ...formState, technologiesText: e.target.value })
                }
                placeholder="e.g. TypeScript, React, PostgreSQL"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Separate technologies with commas.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">
                What you built
              </label>
              <textarea
                value={formState.description}
                onChange={(e) =>
                  setFormState({ ...formState, description: e.target.value })
                }
                rows={3}
                placeholder="Describe the project and your contribution…"
                maxLength={5000}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">
                What you achieved
              </label>
              <textarea
                value={formState.highlightsText}
                onChange={(e) =>
                  setFormState({ ...formState, highlightsText: e.target.value })
                }
                rows={3}
                placeholder="One outcome per line&#10;e.g. Reduced sync lag from hours to minutes"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
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
              {saveStatus === "SAVING"
                ? "Saving…"
                : isCreatingNew
                  ? "Add project"
                  : "Save changes"}
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 && !isCreatingNew ? (
        <div className="p-10 text-center text-slate-500 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Add the work you&apos;re most proud of
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Projects help show what you can actually build and contribute. Add
            the work that best represents your career.
          </p>
          <button
            type="button"
            onClick={startCreate}
            className="text-xs font-semibold text-slate-900 hover:text-slate-700 pt-2 inline-block cursor-pointer underline-offset-2 hover:underline"
          >
            + Add your first project
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {sortedProjects.map((item, index) => {
            const dateRange = [
              formatMonthYear(item.startDate),
              formatMonthYear(item.endDate),
            ]
              .filter(Boolean)
              .join(" — ");

            return (
              <article
                key={item.id}
                className="p-5 hover:bg-slate-50/60 transition-colors space-y-3 text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {index === 0 && sortedProjects.length > 1 && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 border border-slate-200 bg-slate-50 px-1.5 py-0.5 rounded">
                          Show first
                        </span>
                      )}
                      <h3 className="text-sm font-bold text-slate-900">
                        {item.title}
                      </h3>
                      {item.role && (
                        <>
                          <span className="text-slate-400">•</span>
                          <span className="font-semibold text-slate-700">
                            {item.role}
                          </span>
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

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => moveProject(item.id, "up")}
                      disabled={index === 0 || reorderingId === item.id}
                      className="px-2 py-1 rounded-md text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition disabled:opacity-40 cursor-pointer"
                      aria-label={`Show ${item.title} earlier`}
                    >
                      Show earlier
                    </button>
                    <button
                      type="button"
                      onClick={() => moveProject(item.id, "down")}
                      disabled={
                        index === sortedProjects.length - 1 ||
                        reorderingId === item.id
                      }
                      className="px-2 py-1 rounded-md text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition disabled:opacity-40 cursor-pointer"
                      aria-label={`Show ${item.title} later`}
                    >
                      Show later
                    </button>
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
                      {deletingId === item.id ? "…" : "Remove"}
                    </button>
                  </div>
                </div>

                {item.description && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      What you built
                    </p>
                    <p className="text-slate-600 leading-relaxed max-w-3xl">
                      {item.description}
                    </p>
                  </div>
                )}

                {item.highlights.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      What you achieved
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                      {item.highlights.map((highlight, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.technologies.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                      Technologies
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.technologies.map((tech, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-slate-400">
                  Source: Your information
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
