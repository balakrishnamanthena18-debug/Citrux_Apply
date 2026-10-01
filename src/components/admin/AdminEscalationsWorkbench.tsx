"use client";

import React, { useState, useMemo, useTransition } from "react";
import { TransitionLink } from "@/components/ui/TransitionLink";
import {
  WorkbenchShell,
  WorkbenchHeader,
  WorkbenchToolbar,
  WorkbenchEmptyState,
  InstantTabs,
  TabItem,
  InstantSearch,
} from "@/components/workbench";
import { PendingButton } from "@/components/ui/PendingButton";
import { syncUrlParams } from "@/lib/client/urlSync";
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

  const handlePriorityChange = (key: string) => {
    setPriorityFilter(key);
    syncUrlParams({ priority: key === "ALL" ? null : key });
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    syncUrlParams({ search: term ? term : null });
  };

  const priorities: TabItem[] = useMemo(() => {
    return [
      { key: "ALL", label: "All Escalations", count: escalatedTasks.length },
      { key: "URGENT", label: "Urgent", count: escalatedTasks.filter((t) => t.priority === "URGENT").length, highlight: true },
      { key: "HIGH", label: "High", count: escalatedTasks.filter((t) => t.priority === "HIGH").length },
      { key: "NORMAL", label: "Normal", count: escalatedTasks.filter((t) => t.priority === "NORMAL").length },
      { key: "LOW", label: "Low", count: escalatedTasks.filter((t) => t.priority === "LOW").length },
    ];
  }, [escalatedTasks]);

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

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      <WorkbenchShell ariaLabel="Escalation Triage Console">
        <WorkbenchHeader
          title="Escalation Triage Console"
          description="Administrative oversight, reassignment, and blocker resolution for operational tasks flagged as ESCALATED."
          badge={`${escalatedTasks.length} Blocked`}
          badgeVariant="amber"
        />

        <WorkbenchToolbar>
          <InstantTabs
            tabs={priorities}
            activeTab={priorityFilter}
            onChange={handlePriorityChange}
          />
          <div className="w-full lg:w-72">
            <InstantSearch
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search keyword, assignee, candidate... (/)"
            />
          </div>
        </WorkbenchToolbar>

        {filteredTasks.length === 0 ? (
          <WorkbenchEmptyState
            title={escalatedTasks.length === 0 ? "No Escalated Tasks" : "No Matching Escalations"}
            description={
              escalatedTasks.length === 0
                ? "All operational tasks are progressing normally without blockers."
                : "Try adjusting your search terms or priority filters."
            }
            actionText={searchTerm || priorityFilter !== "ALL" ? "Reset Filters" : undefined}
            onAction={() => {
              setSearchTerm("");
              setPriorityFilter("ALL");
              syncUrlParams({ search: null, priority: null });
            }}
          />
        ) : (
          <div className="divide-y divide-slate-100 p-4 space-y-4">
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
                    <TransitionLink href={`/employee/tasks/${task.id}`} className="hover:underline">
                      {task.title}
                    </TransitionLink>
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
      </WorkbenchShell>
    </div>
  );
}
