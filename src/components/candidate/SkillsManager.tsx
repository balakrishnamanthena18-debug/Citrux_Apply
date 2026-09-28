"use client";

import React, { useState } from "react";
import { syncCandidateSkillsAction } from "@/lib/candidate/actions";
import { SaveStateIndicator, SaveStatus } from "./SaveStateIndicator";

export interface CandidateSkillItem {
  id: string;
  name: string;
  provenance?: "CANDIDATE_PROVIDED" | "CANDIDATE_CONFIRMED" | "STAFF_VERIFIED" | "AI_SUGGESTED" | "SYSTEM_DERIVED";
}

interface Props {
  skills: CandidateSkillItem[];
  onSkillsChanged?: () => void;
}

export function SkillsManager({ skills, onSkillsChanged }: Props) {
  const [skillsList, setSkillsList] = useState<string[]>(skills.map((s) => s.name));
  const [newSkillInput, setNewSkillInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Common suggested skills for fast candidate onboarding
  const suggestedSkills = [
    "TypeScript",
    "React",
    "Node.js",
    "Next.js",
    "Python",
    "Go",
    "PostgreSQL",
    "AWS",
    "Docker",
    "Kubernetes",
    "GraphQL",
    "Redis",
    "System Design",
    "CI/CD",
  ].filter((s) => !skillsList.map((x) => x.toLowerCase()).includes(s.toLowerCase()));

  const handleAddSkill = (skillName?: string) => {
    const raw = skillName || newSkillInput;
    const trimmed = raw.trim();
    if (!trimmed) return;

    if (skillsList.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMessage(`"${trimmed}" is already in your skills list.`);
      return;
    }

    const updated = [...skillsList, trimmed];
    setSkillsList(updated);
    setNewSkillInput("");
    setErrorMessage(null);
    setSaveStatus("DIRTY");
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    const updated = skillsList.filter((s) => s !== skillToRemove);
    setSkillsList(updated);
    setSaveStatus("DIRTY");
    setErrorMessage(null);
  };

  const handleSave = async () => {
    setSaveStatus("SAVING");
    setErrorMessage(null);

    try {
      const res = await syncCandidateSkillsAction(skillsList);
      if (res.success) {
        setSaveStatus("SAVED");
        setLastSavedAt(new Date());
        onSkillsChanged?.();
        setTimeout(() => setSaveStatus("IDLE"), 2500);
      } else {
        setSaveStatus("ERROR");
        setErrorMessage(res.error || "Failed to update skills");
      }
    } catch {
      setSaveStatus("ERROR");
      setErrorMessage("Network error saving skills");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSkill();
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Technical & Professional Skills
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              {skillsList.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Authoritative competencies matched against job specifications
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SaveStateIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            errorMessage={errorMessage}
            onRetry={handleSave}
          />
          {saveStatus === "DIRTY" && (
            <button
              type="button"
              onClick={handleSave}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs cursor-pointer"
            >
              Save Skills Catalog
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5 text-xs">
        {/* Input Bar */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newSkillInput}
            onChange={(e) => setNewSkillInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a skill (e.g. Distributed Systems, Rust, Terraform) and press Enter..."
            className="flex-1 px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
          <button
            type="button"
            onClick={() => handleAddSkill()}
            disabled={!newSkillInput.trim()}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs disabled:opacity-40 cursor-pointer"
          >
            + Add Skill
          </button>
        </div>

        {/* Current Active Skills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Candidate Competencies ({skillsList.length})
            </span>
            <span className="text-[11px] text-slate-400">
              Click ✕ to remove
            </span>
          </div>

          {skillsList.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
              No skills listed yet. Add your core languages, frameworks, and architecture specialties above.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 p-3 bg-slate-50/50 rounded-lg border border-slate-100">
              {skillsList.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-white text-slate-800 border border-slate-200/90 shadow-2xs"
                >
                  <span>{skill}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="text-slate-400 hover:text-rose-600 font-bold transition ml-0.5"
                    title={`Remove ${skill}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Suggested Skills (Optional Quick-Add) */}
        {suggestedSkills.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Suggested Competencies (Click to add)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestedSkills.slice(0, 8).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleAddSkill(s)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200 transition cursor-pointer inline-flex items-center gap-1"
                >
                  <span>+ {s}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
