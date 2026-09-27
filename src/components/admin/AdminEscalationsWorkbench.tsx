"use client";

import React, { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { InstantSearch } from "@/components/workbench/InstantSearch";
import { PendingButton } from "@/components/ui/PendingButton";
import type { TaskPriority, TaskStatus } from "@/generated/prisma";

export interface EscalatedTaskItem {
  id: string;
  title: string;
  type: string;
  priority: TaskPriority;
  status: TaskStatus;
  escalationReason?: string | null;
  assignedEmployee?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
  candidate?: {
    user?: {
      firstName?: string | null;
      lastName?: string | null;
      email: string;
    } | null;
  } | null;
  job?: {
    title: string;
    companyName: string;
  } | null;
  application?: {
    status: string;
  } | null;
}

export interface StaffOption {
  id: string;
  name: string;
}

interface Props {
  escalatedTasks: EscalatedTaskItem[];
  staffMembers: StaffOption[];
  onTriageAction: (formData: FormData) => Promise<void>;
}

export function AdminEscalationsWorkbench({
  escalatedTasks,
  staffMembers,
  onTriageAction,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [isPending, startTransition] = useTransition();
  const [activeTriageTaskId, setActiveTriageTaskId] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    let list = escalatedTasks;

    if (priorityFilter !== "ALL") {
      list = list.filter((t) => t.priority === priorityFilter);
    }

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const title = t.title.toLowerCase();
        const reason = (t.escalationReason || "").toLowerCase();
        const cand = `${t.candidate?.user?.firstName || ""} ${t.candidate?.user?.lastName || ""}`.toLowerCase();
        const emp = `${t.assignedEmployee?.firstName || ""} ${t.assignedEmployee?.lastName || ""}`.toLowerCase();
        const job = `${t.job?.title || ""} ${t.job?.companyName || ""}`.toLowerCase();

        return (
          title.includes(q) ||
          reason.includes(q) ||
          cand.includes(q) ||
          emp.includes(q) ||
          job.includes(q)
        );
      });
    }

    return list;
  }, [escalatedTasks, priorityFilter, searchTerm]);

  const priorities = ["ALL", "LOW", "MEDIUM", "HIGH", "URGENT"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Escalation Console</h1>
          <p className="text-sm text-slate-500 mt-1">
            Administrative triage, reassignment, and resolution for operational tasks flagged as ESCALATED.
          </p>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-md bg-amber-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
            {escalatedTasks.length}
          </div>
          <div>
            <div className="text-sm font-bold text-amber-900">
              {escalatedTasks.length === 1
                ? "1 Task Awaiting Administrative Triage"
                : `${escalatedTasks.length} Tasks Awaiting Administrative Triage`}
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              Review blockers, reassign operational ownership, or authorize task resolution.
            </div>
          </div>
        </div>

        {/* Priority Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {priorities.map((p) => {
            const count = p === "ALL" ? escalatedTasks.length : escalatedTasks.filter((t) => t.priority === p).length;
            const isSelected = priorityFilter === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? "bg-amber-700 text-white shadow-xs"
                    : "bg-amber-100/70 text-amber-900 hover:bg-amber-200/70"
                }`}
              >
                {p} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Instant Search Bar */}
      <div className="w-full max-w-md">
        <InstantSearch
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Filter escalations by keyword, assignee, candidate..."
        />
      </div>

      {/* Escalated Tasks List */}
      {filteredTasks.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500 shadow-xs">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm font-semibold text-slate-800">
            {escalatedTasks.length === 0 ? "No Escalated Tasks" : "No Matching Escalations"}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {escalatedTasks.length === 0
              ? "All operational tasks are progressing normally without blockers."
              : "Try adjusting your search terms or priority filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="bg-white rounded-lg border border-amber-200/80 p-5 shadow-xs flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5"
            >
              {/* Task Details & Context */}
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase tracking-wider">
                    ESCALATED
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase tracking-wider">
                    {task.priority}
                  </span>
                  <span className="text-xs font-mono text-slate-500">{task.type}</span>
                </div>

                <h3 className="text-base font-bold text-slate-900">
                  <Link href={`/employee/tasks/${task.id}`} className="hover:underline">
                    {task.title}
                  </Link>
                </h3>

                {/* Escalation Reason */}
                {task.escalationReason && (
                  <div className="mt-2.5 p-2.5 rounded-md bg-amber-50/60 border border-amber-200/60 text-xs text-amber-900">
                    <span className="font-bold">Reason:</span> {task.escalationReason}
                  </div>
                )}

                {/* Context Tags */}
                <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-slate-600">
                  {task.assignedEmployee && (
                    <span className="inline-flex items-center bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                      Assignee: {task.assignedEmployee.firstName || task.assignedEmployee.email}
                    </span>
                  )}
                  {task.candidate && (
                    <span className="inline-flex items-center bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                      Candidate: {task.candidate.user?.firstName || task.candidate.user?.email}
                    </span>
                  )}
                  {task.job && (
                    <span className="inline-flex items-center bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                      Job: {task.job.companyName} ({task.job.title})
                    </span>
                  )}
                  {task.application && (
                    <span className="inline-flex items-center bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono text-[10px]">
                      App: {task.application.status}
                    </span>
                  )}
                </div>
              </div>

              {/* Admin Triage Form Box */}
              <div className="bg-slate-50/70 rounded-lg p-4 border border-slate-200 w-full lg:w-96 flex-shrink-0">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                  Admin Triage Actions
                </div>
                <form
                  action={(formData) => {
                    setActiveTriageTaskId(task.id);
                    startTransition(async () => {
                      await onTriageAction(formData);
                      setActiveTriageTaskId(null);
                    });
                  }}
                  className="space-y-2.5"
                >
                  <input type="hidden" name="taskId" value={task.id} />

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Triage Resolution *</label>
                    <select
                      name="triageAction"
                      required
                      className="w-full text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white font-medium"
                    >
                      <option value="RESUME">Resume Work (Clear Blocker → IN_PROGRESS)</option>
                      <option value="REASSIGN">Reassign Staff (Set Assignee → ASSIGNED)</option>
                      <option value="CANCEL">Cancel Task (Unresolvable → CANCELED)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Target Assignee (If Reassigning)</label>
                    <select
                      name="targetEmployeeId"
                      className="w-full text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white"
                    >
                      <option value="">Keep current / Unassigned</option>
                      {staffMembers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Triage Notes</label>
                    <input
                      type="text"
                      name="triageNotes"
                      placeholder="Operational decision rationale..."
                      className="w-full text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white"
                    />
                  </div>

                  <PendingButton
                    type="submit"
                    isPending={isPending && activeTriageTaskId === task.id}
                    pendingText="Executing..."
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1.5 rounded-md text-xs transition-colors shadow-xs"
                  >
                    Execute Triage
                  </PendingButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
