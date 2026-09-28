"use client";

import React, { useState } from "react";
import {
  upsertCandidateCertificationAction,
  deleteCandidateCertificationAction,
} from "@/lib/candidate/actions";
import { SaveStateIndicator, SaveStatus } from "./SaveStateIndicator";

export interface CandidateCertificationItem {
  id: string;
  name: string;
  issuingAuthority: string;
  credentialId?: string | null;
  credentialUrl?: string | null;
  issueDate?: string | Date | null;
  expirationDate?: string | Date | null;
  doesNotExpire: boolean;
}

interface Props {
  certifications: CandidateCertificationItem[];
  onCertificationsChanged?: () => void;
}

export function CertificationManager({
  certifications,
  onCertificationsChanged,
}: Props) {
  const [editingItem, setEditingItem] = useState<CandidateCertificationItem | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formState, setFormState] = useState({
    id: "",
    name: "",
    issuingAuthority: "",
    credentialId: "",
    credentialUrl: "",
    issueDate: "",
    expirationDate: "",
    doesNotExpire: false,
  });

  const formatDateForInput = (d: string | Date | null | undefined): string => {
    if (!d) return "";
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "";
    return dateObj.toISOString().split("T")[0] || "";
  };

  const startEdit = (item: CandidateCertificationItem) => {
    setEditingItem(item);
    setIsCreatingNew(false);
    setFormState({
      id: item.id,
      name: item.name,
      issuingAuthority: item.issuingAuthority,
      credentialId: item.credentialId || "",
      credentialUrl: item.credentialUrl || "",
      issueDate: formatDateForInput(item.issueDate),
      expirationDate: formatDateForInput(item.expirationDate),
      doesNotExpire: item.doesNotExpire,
    });
    setErrorMessage(null);
  };

  const startCreate = () => {
    setIsCreatingNew(true);
    setEditingItem(null);
    setFormState({
      id: "",
      name: "",
      issuingAuthority: "",
      credentialId: "",
      credentialUrl: "",
      issueDate: "",
      expirationDate: "",
      doesNotExpire: false,
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
    if (!formState.name.trim() || !formState.issuingAuthority.trim()) {
      setErrorMessage("Certification name and issuing authority are required.");
      return;
    }

    setSaveStatus("SAVING");
    setErrorMessage(null);

    try {
      const res = await upsertCandidateCertificationAction({
        id: formState.id || undefined,
        name: formState.name.trim(),
        issuingAuthority: formState.issuingAuthority.trim(),
        credentialId: formState.credentialId.trim() || null,
        credentialUrl: formState.credentialUrl.trim() || null,
        issueDate: formState.issueDate || null,
        expirationDate: formState.doesNotExpire ? null : formState.expirationDate || null,
        doesNotExpire: formState.doesNotExpire,
      });

      if (res.success) {
        setSaveStatus("SAVED");
        setIsCreatingNew(false);
        setEditingItem(null);
        onCertificationsChanged?.();
        setTimeout(() => setSaveStatus("IDLE"), 2500);
      } else {
        setSaveStatus("ERROR");
        setErrorMessage(res.error || "Failed to save certification");
      }
    } catch {
      setSaveStatus("ERROR");
      setErrorMessage("Network error saving certification");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove certification "${name}"?`)) return;

    setDeletingId(id);
    try {
      const res = await deleteCandidateCertificationAction(id);
      if (res.success) {
        onCertificationsChanged?.();
      } else {
        alert(res.error || "Failed to delete certification");
      }
    } catch {
      alert("Network error deleting certification");
    } finally {
      setDeletingId(null);
    }
  };

  const computeExpirationInfo = (cert: CandidateCertificationItem) => {
    if (cert.doesNotExpire) {
      return { text: "No expiration", status: "NEVER" };
    }
    if (!cert.expirationDate) {
      return { text: "Expiration unrecorded", status: "NONE" };
    }

    const exp = new Date(cert.expirationDate);
    const now = new Date();
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: "Expired", status: "EXPIRED" };
    }
    if (diffDays <= 60) {
      return { text: `Expires in ${diffDays} days`, status: "EXPIRING_SOON" };
    }
    return {
      text: `Expires ${exp.toLocaleDateString([], { month: "short", year: "numeric" })}`,
      status: "ACTIVE",
    };
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Certifications & Licensures
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              {certifications.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Verified industry credentials, cloud certifications, and technical licenses
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
              <span>+ Add Certification</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor Form Modal / Inline Section */}
      {(isCreatingNew || editingItem) && (
        <form onSubmit={handleSave} className="p-5 border-b border-slate-200 bg-slate-50/40 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              {isCreatingNew ? "Add New Certification" : `Edit: ${editingItem?.name}`}
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
                Certification Name *
              </label>
              <input
                type="text"
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                placeholder="e.g. AWS Certified Solutions Architect - Professional"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Issuing Authority / Organization *
              </label>
              <input
                type="text"
                value={formState.issuingAuthority}
                onChange={(e) => setFormState({ ...formState, issuingAuthority: e.target.value })}
                placeholder="e.g. Amazon Web Services, Linux Foundation, Google Cloud"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Credential ID
              </label>
              <input
                type="text"
                value={formState.credentialId}
                onChange={(e) => setFormState({ ...formState, credentialId: e.target.value })}
                placeholder="e.g. AWS-PSA-12345"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Credential Verification URL
              </label>
              <input
                type="url"
                value={formState.credentialUrl}
                onChange={(e) => setFormState({ ...formState, credentialUrl: e.target.value })}
                placeholder="https://credly.com/badges/..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Issue Date
              </label>
              <input
                type="date"
                value={formState.issueDate}
                onChange={(e) => setFormState({ ...formState, issueDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700">
                  Expiration Date
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-600">
                  <input
                    type="checkbox"
                    checked={formState.doesNotExpire}
                    onChange={(e) => setFormState({ ...formState, doesNotExpire: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Does not expire</span>
                </label>
              </div>

              {!formState.doesNotExpire && (
                <input
                  type="date"
                  value={formState.expirationDate}
                  onChange={(e) => setFormState({ ...formState, expirationDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                />
              )}
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
              {saveStatus === "SAVING" ? "Saving..." : isCreatingNew ? "Add Certification" : "Save Record"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {certifications.length === 0 && !isCreatingNew ? (
        <div className="p-10 text-center text-slate-500 space-y-2">
          <div className="text-2xl">📜</div>
          <h3 className="text-sm font-semibold text-slate-900">No certifications recorded</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Adding verified credentials empowers operations specialists to target specialized listings with hard licensing prerequisites.
          </p>
          <button
            type="button"
            onClick={startCreate}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 pt-2 inline-block cursor-pointer"
          >
            + Add First Certification →
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {certifications.map((item) => {
            const expInfo = computeExpirationInfo(item);
            return (
              <div
                key={item.id}
                className="p-5 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900">
                      {item.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        expInfo.status === "EXPIRED"
                          ? "bg-rose-50 text-rose-800 border-rose-200"
                          : expInfo.status === "EXPIRING_SOON"
                          ? "bg-amber-50 text-amber-800 border-amber-300 font-bold animate-pulse"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {expInfo.text}
                    </span>
                  </div>

                  <div className="text-slate-600 font-medium">
                    {item.issuingAuthority}
                  </div>

                  <div className="flex items-center gap-2 text-slate-500 pt-0.5 flex-wrap">
                    {item.credentialId && <span>Credential ID: {item.credentialId}</span>}
                    {item.credentialId && item.credentialUrl && <span>•</span>}
                    {item.credentialUrl && (
                      <a
                        href={item.credentialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
                      >
                        <span>Verify Credential</span>
                        <span>↗</span>
                      </a>
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
                    onClick={() => handleDelete(item.id, item.name)}
                    disabled={deletingId === item.id}
                    className="px-2.5 py-1 rounded-md text-xs font-medium text-rose-600 hover:bg-rose-50 transition disabled:opacity-50 cursor-pointer"
                  >
                    {deletingId === item.id ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
