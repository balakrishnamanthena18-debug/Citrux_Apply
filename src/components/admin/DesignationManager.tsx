"use client";

import { useState } from "react";
import {
  createDesignationAction,
  updateDesignationAction,
  setDesignationStatusAction,
} from "@/lib/admin/actions";
import type { DesignationStatus } from "@/generated/prisma";

export interface DesignationItem {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  status: DesignationStatus;
  createdAt: Date | string;
  _count?: {
    memberships: number;
  };
}

interface DesignationManagerProps {
  initialDesignations: DesignationItem[];
}

export function DesignationManager({ initialDesignations }: DesignationManagerProps) {
  const [designations, setDesignations] = useState<DesignationItem[]>(initialDesignations);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Modal State
  const [editingDesignation, setEditingDesignation] = useState<DesignationItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Action feedback
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const filtered = designations.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.code && d.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.description && d.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      statusFilter === "ALL" || d.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalCount = designations.length;
  const activeCount = designations.filter((d) => d.status === "ACTIVE").length;
  const archivedCount = designations.filter((d) => d.status === "ARCHIVED").length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    const res = await createDesignationAction({
      name: createName,
      code: createCode || undefined,
      description: createDescription || undefined,
    });

    if (!res.success || !res.data) {
      setCreateError(res.error || "Failed to create designation.");
      setCreateLoading(false);
      return;
    }

    setDesignations([
      {
        ...res.data,
        _count: { memberships: 0 },
      },
      ...designations,
    ]);
    setIsCreateOpen(false);
    setCreateName("");
    setCreateCode("");
    setCreateDescription("");
    setCreateLoading(false);
    setActionMessage({ type: "success", text: `Designation "${res.data.name}" created successfully.` });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDesignation) return;

    setEditLoading(true);
    setEditError(null);

    const res = await updateDesignationAction({
      designationId: editingDesignation.id,
      name: editName,
      code: editCode || undefined,
      description: editDescription || undefined,
    });

    if (!res.success || !res.data) {
      setEditError(res.error || "Failed to update designation.");
      setEditLoading(false);
      return;
    }

    setDesignations(
      designations.map((d) =>
        d.id === editingDesignation.id
          ? {
              ...d,
              name: res.data!.name,
              code: res.data!.code,
              description: res.data!.description,
            }
          : d
      )
    );
    setEditingDesignation(null);
    setEditLoading(false);
    setActionMessage({ type: "success", text: `Designation "${res.data.name}" updated successfully.` });
  }

  async function handleToggleStatus(item: DesignationItem) {
    const nextStatus = item.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    const confirmText =
      nextStatus === "ARCHIVED"
        ? `Are you sure you want to archive "${item.name}"? It will no longer be assignable to new employees, but historical records will be preserved.`
        : `Reactivate designation "${item.name}"?`;

    if (!window.confirm(confirmText)) return;

    const res = await setDesignationStatusAction({
      designationId: item.id,
      status: nextStatus,
    });

    if (!res.success || !res.data) {
      setActionMessage({ type: "error", text: res.error || "Failed to update designation status." });
      return;
    }

    setDesignations(
      designations.map((d) =>
        d.id === item.id ? { ...d, status: res.data!.status } : d
      )
    );
    setActionMessage({
      type: "success",
      text: `Designation "${item.name}" is now ${res.data.status.toLowerCase()}.`,
    });
  }

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Designations</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{totalCount}</p>
        </div>
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Active Titles</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{activeCount}</p>
        </div>
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Archived Titles</p>
          <p className="mt-2 text-3xl font-bold text-slate-600">{archivedCount}</p>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-md text-sm border flex justify-between items-center ${
            actionMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs font-semibold underline ml-4 hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Action Header & Filters */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by title, code, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-slate-300 pl-3 pr-8 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="ARCHIVED">Archived Only</option>
          </select>
        </div>

        <button
          onClick={() => {
            setCreateError(null);
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 shadow-sm"
        >
          + New Designation
        </button>
      </div>

      {/* Designations Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-900">
            Designation Catalog ({filtered.length})
          </h2>
        </div>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Title & Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Members
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                  No designations found matching your search.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-slate-900">
                      {item.name}
                      {item.status === "ARCHIVED" && (
                        <span className="ml-2 text-xs font-normal text-slate-400 italic">
                          (Archived)
                        </span>
                      )}
                    </div>
                    {item.code && (
                      <div className="font-mono text-xs text-slate-500 tracking-wide mt-0.5">
                        {item.code}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-600 max-w-md line-clamp-2">
                      {item.description || "—"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        item.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-100 text-slate-700 border-slate-300"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                    {item._count?.memberships ?? 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    <button
                      onClick={() => {
                        setEditingDesignation(item);
                        setEditName(item.name);
                        setEditCode(item.code || "");
                        setEditDescription(item.description || "");
                        setEditError(null);
                      }}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleStatus(item)}
                      className={`text-xs font-semibold underline ${
                        item.status === "ACTIVE"
                          ? "text-amber-700 hover:text-amber-900"
                          : "text-emerald-700 hover:text-emerald-900"
                      }`}
                    >
                      {item.status === "ACTIVE" ? "Archive" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Create New Designation</h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="rounded-md bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Designation Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Senior Application Specialist"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Code (Optional)</label>
                <input
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SR_APP_SPEC"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Brief summary of organizational duties or qualifications..."
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {createLoading ? "Creating..." : "Save Designation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingDesignation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Edit Designation</h3>
              <button
                onClick={() => setEditingDesignation(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="rounded-md bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                {editError}
              </div>
            )}

            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Designation Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Code (Optional)</label>
                <input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingDesignation(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {editLoading ? "Saving..." : "Update Designation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
