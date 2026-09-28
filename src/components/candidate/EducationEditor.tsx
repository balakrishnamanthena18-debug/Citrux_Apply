"use client";

import React, { useState } from "react";
import {
  upsertCandidateEducationAction,
  deleteCandidateEducationAction,
} from "@/lib/candidate/actions";
import { SaveStateIndicator, SaveStatus } from "./SaveStateIndicator";

export interface CandidateEducationItem {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  graduationYear?: number | null;
  gpa?: string | null;
  honors?: string | null;
  orderIndex: number;
}

interface Props {
  educations: CandidateEducationItem[];
  onEducationsChanged?: () => void;
}

export function EducationEditor({ educations, onEducationsChanged }: Props) {
  const [editingItem, setEditingItem] = useState<CandidateEducationItem | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formState, setFormState] = useState({
    id: "",
    institution: "",
    degree: "",
    fieldOfStudy: "",
    startDate: "",
    endDate: "",
    graduationYear: "",
    gpa: "",
    honors: "",
  });

  const formatDateForInput = (d: string | Date | null | undefined): string => {
    if (!d) return "";
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "";
    return dateObj.toISOString().split("T")[0] || "";
  };

  const startEdit = (item: CandidateEducationItem) => {
    setEditingItem(item);
    setIsCreatingNew(false);
    setFormState({
      id: item.id,
      institution: item.institution,
      degree: item.degree,
      fieldOfStudy: item.fieldOfStudy || "",
      startDate: formatDateForInput(item.startDate),
      endDate: formatDateForInput(item.endDate),
      graduationYear: item.graduationYear ? String(item.graduationYear) : "",
      gpa: item.gpa || "",
      honors: item.honors || "",
    });
    setErrorMessage(null);
  };

  const startCreate = () => {
    setIsCreatingNew(true);
    setEditingItem(null);
    setFormState({
      id: "",
      institution: "",
      degree: "",
      fieldOfStudy: "",
      startDate: "",
      endDate: "",
      graduationYear: "",
      gpa: "",
      honors: "",
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
    if (!formState.institution.trim() || !formState.degree.trim()) {
      setErrorMessage("Institution and Degree are required.");
      return;
    }

    setSaveStatus("SAVING");
    setErrorMessage(null);

    const gradYearNum = formState.graduationYear.trim()
      ? Number(formState.graduationYear)
      : null;

    try {
      const res = await upsertCandidateEducationAction({
        id: formState.id || undefined,
        institution: formState.institution.trim(),
        degree: formState.degree.trim(),
        fieldOfStudy: formState.fieldOfStudy.trim() || null,
        startDate: formState.startDate || null,
        endDate: formState.endDate || null,
        graduationYear: gradYearNum,
        gpa: formState.gpa.trim() || null,
        honors: formState.honors.trim() || null,
      });

      if (res.success) {
        setSaveStatus("SAVED");
        setIsCreatingNew(false);
        setEditingItem(null);
        onEducationsChanged?.();
        setTimeout(() => setSaveStatus("IDLE"), 2500);
      } else {
        setSaveStatus("ERROR");
        setErrorMessage(res.error || "Failed to save education record");
      }
    } catch {
      setSaveStatus("ERROR");
      setErrorMessage("Network error saving education record");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove education record from ${name}?`)) return;

    setDeletingId(id);
    try {
      const res = await deleteCandidateEducationAction(id);
      if (res.success) {
        onEducationsChanged?.();
      } else {
        alert(res.error || "Failed to delete education record");
      }
    } catch {
      alert("Network error deleting education record");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Education History
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              {educations.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Academic credentials, degrees, institutions, and honors
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
              <span>+ Add Education</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor Form Modal / Inline Section */}
      {(isCreatingNew || editingItem) && (
        <form onSubmit={handleSave} className="p-5 border-b border-slate-200 bg-slate-50/40 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              {isCreatingNew ? "Add Academic Credential" : `Edit: ${editingItem?.degree} at ${editingItem?.institution}`}
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
                Institution / University *
              </label>
              <input
                type="text"
                value={formState.institution}
                onChange={(e) => setFormState({ ...formState, institution: e.target.value })}
                placeholder="e.g. Stanford University, University of Waterloo"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Degree / Qualification *
              </label>
              <input
                type="text"
                value={formState.degree}
                onChange={(e) => setFormState({ ...formState, degree: e.target.value })}
                placeholder="e.g. Bachelor of Science, Master of Engineering"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Field of Study / Major
              </label>
              <input
                type="text"
                value={formState.fieldOfStudy}
                onChange={(e) => setFormState({ ...formState, fieldOfStudy: e.target.value })}
                placeholder="e.g. Computer Science, Electrical Engineering"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Graduation Year
              </label>
              <input
                type="number"
                value={formState.graduationYear}
                onChange={(e) => setFormState({ ...formState, graduationYear: e.target.value })}
                min="1960"
                max="2035"
                placeholder="e.g. 2021"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                GPA / Grade (Optional)
              </label>
              <input
                type="text"
                value={formState.gpa}
                onChange={(e) => setFormState({ ...formState, gpa: e.target.value })}
                placeholder="e.g. 3.9 / 4.0, First Class"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Honors / Academic Awards
              </label>
              <input
                type="text"
                value={formState.honors}
                onChange={(e) => setFormState({ ...formState, honors: e.target.value })}
                placeholder="e.g. Magna Cum Laude, Dean's Honors List"
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
              {saveStatus === "SAVING" ? "Saving..." : isCreatingNew ? "Add Education" : "Save Record"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {educations.length === 0 && !isCreatingNew ? (
        <div className="p-10 text-center text-slate-500 space-y-2">
          <div className="text-2xl">🎓</div>
          <h3 className="text-sm font-semibold text-slate-900">No education records listed</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Degrees and university qualifications provide screening criteria matching for candidate applications.
          </p>
          <button
            type="button"
            onClick={startCreate}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 pt-2 inline-block cursor-pointer"
          >
            + Add Education Record →
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {educations.map((item) => (
            <div
              key={item.id}
              className="p-5 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">
                    {item.degree}
                    {item.fieldOfStudy ? ` in ${item.fieldOfStudy}` : ""}
                  </h3>
                  {item.graduationYear && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      Class of {item.graduationYear}
                    </span>
                  )}
                </div>

                <div className="text-slate-600 font-medium">
                  {item.institution}
                </div>

                {(item.gpa || item.honors) && (
                  <div className="flex items-center gap-2 text-slate-500 pt-0.5">
                    {item.gpa && <span>GPA: {item.gpa}</span>}
                    {item.gpa && item.honors && <span>•</span>}
                    {item.honors && <span className="italic">{item.honors}</span>}
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
                  onClick={() => handleDelete(item.id, item.institution)}
                  disabled={deletingId === item.id}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-rose-600 hover:bg-rose-50 transition disabled:opacity-50 cursor-pointer"
                >
                  {deletingId === item.id ? "..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
