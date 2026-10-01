"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus, TaskPriority, TaskCategory, TaskType } from "@/generated/prisma";
import { InstantTabs, TabItem } from "@/components/workbench/InstantTabs";
import { InstantSearch } from "@/components/workbench/InstantSearch";
import { InstantFilterBar, FilterDropdownConfig } from "@/components/workbench/InstantFilterBar";
import { TablePagination } from "@/components/workbench/TablePagination";
import { PendingButton } from "@/components/ui/PendingButton";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { createTaskAction } from "@/lib/task/actions";
import { syncUrlParams } from "@/lib/client/urlSync";

export interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  category: TaskCategory;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  assignedEmployeeId?: string | null;
  assignedEmployee?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
  candidateId?: string | null;
  candidate?: {
    id: string;
    user: {
      firstName?: string | null;
      lastName?: string | null;
      email: string;
    };
  } | null;
  jobId?: string | null;
  job?: {
    id: string;
    title: string;
    companyName: string;
  } | null;
  applicationId?: string | null;
  application?: {
    id: string;
    job?: {
      title: string;
      companyName: string;
    } | null;
  } | null;
  checklistItems: Array<{
    id: string;
    description: string;
    title?: string;
    isCompleted: boolean;
  }>;
}

export interface StaffOption {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}

export interface CandidateOption {
  id: string;
  user: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
}

export interface JobOption {
  id: string;
  title: string;
  companyName: string;
}

export interface ApplicationOption {
  id: string;
  job: {
    title: string;
    companyName: string;
  };
  candidate: {
    user: {
      firstName?: string | null;
      lastName?: string | null;
      email: string;
    };
  };
}

interface Props {
  currentUserId: string;
  tasks: TaskItem[];
  staffMembers: StaffOption[];
  candidates: CandidateOption[];
  jobs: JobOption[];
  applications: ApplicationOption[];
  canCreateTask: boolean;
  initialView?: string;
  initialStatus?: string;
  initialPriority?: string;
}

export function EmployeeTasksWorkbench({
  currentUserId,
  tasks,
  staffMembers,
  candidates,
  jobs,
  applications,
  canCreateTask,
  initialView = "all",
  initialStatus = "",
  initialPriority = "",
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<string>(initialView);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [priorityFilter, setPriorityFilter] = useState<string>(initialPriority);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayEnd = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  // Compute live task counts in memory
  const taskCounts = useMemo(() => {
    const all = tasks.length;
    let my = 0;
    let dueToday = 0;
    let overdue = 0;
    let inProgress = 0;
    let qa = 0;
    let blocked = 0;
    let completed = 0;

    for (const t of tasks) {
      if (t.assignedEmployeeId === currentUserId && t.status !== "COMPLETED" && t.status !== "CANCELED") my++;
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        if (d <= todayEnd && t.status !== "COMPLETED" && t.status !== "CANCELED") dueToday++;
        if (d < todayStart && t.status !== "COMPLETED" && t.status !== "CANCELED") overdue++;
      }
      if (t.status === "IN_PROGRESS") inProgress++;
      if (t.status === "QA" || t.status === "READY_FOR_REVIEW") qa++;
      if (t.status === "BLOCKED" || t.status === "ESCALATED" || t.status === "WAITING") blocked++;
      if (t.status === "COMPLETED") completed++;
    }

    return { all, my, dueToday, overdue, inProgress, qa, blocked, completed };
  }, [tasks, currentUserId, todayStart, todayEnd]);

  const tabs: TabItem[] = useMemo(
    () => [
      { key: "all", label: "All Tasks", count: taskCounts.all },
      { key: "my", label: "My Tasks", count: taskCounts.my },
      { key: "due_today", label: "Due Today", count: taskCounts.dueToday, highlight: true },
      { key: "overdue", label: "Overdue", count: taskCounts.overdue },
      { key: "in_progress", label: "In Progress", count: taskCounts.inProgress },
      { key: "qa", label: "QA & Review", count: taskCounts.qa },
      { key: "blocked", label: "Blocked / Escalated", count: taskCounts.blocked },
      { key: "completed", label: "Completed", count: taskCounts.completed },
    ],
    [taskCounts]
  );

  const handleViewChange = (newView: string) => {
    setView(newView);
    setPage(1);
    syncUrlParams({ view: newView === "all" ? null : newView });
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    setPage(1);
  };

  const handleFilterChange = (key: string, value: string) => {
    setPage(1);
    if (key === "status") {
      setStatusFilter(value);
      syncUrlParams({ status: value || null });
    } else if (key === "priority") {
      setPriorityFilter(value);
      syncUrlParams({ priority: value || null });
    }
  };

  const handleClearAll = () => {
    setSearchTerm("");
    setStatusFilter("");
    setPriorityFilter("");
    setView("all");
    setPage(1);
    syncUrlParams({ view: null, status: null, priority: null });
  };

  // Instant pure in-memory filtering (<3ms)
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // 1. View Filter
    if (view === "my") {
      result = result.filter((t) => t.assignedEmployeeId === currentUserId);
    } else if (view === "due_today") {
      result = result.filter(
        (t) => t.dueDate && new Date(t.dueDate) <= todayEnd && t.status !== "COMPLETED" && t.status !== "CANCELED"
      );
    } else if (view === "overdue") {
      result = result.filter(
        (t) => t.dueDate && new Date(t.dueDate) < todayStart && t.status !== "COMPLETED" && t.status !== "CANCELED"
      );
    } else if (view === "in_progress") {
      result = result.filter((t) => t.status === "IN_PROGRESS");
    } else if (view === "qa") {
      result = result.filter((t) => t.status === "QA" || t.status === "READY_FOR_REVIEW");
    } else if (view === "blocked") {
      result = result.filter((t) => t.status === "BLOCKED" || t.status === "ESCALATED" || t.status === "WAITING");
    } else if (view === "completed") {
      result = result.filter((t) => t.status === "COMPLETED");
    }

    // 2. Status Filter
    if (statusFilter) {
      result = result.filter((t) => t.status === statusFilter);
    }

    // 3. Priority Filter
    if (priorityFilter) {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    // 4. Search Filter
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => {
        const title = t.title.toLowerCase();
        const desc = (t.description || "").toLowerCase();
        const cand = `${t.candidate?.user?.firstName || ""} ${t.candidate?.user?.lastName || ""}`.toLowerCase();
        const job = (t.job?.title || t.application?.job?.title || "").toLowerCase();
        const company = (t.job?.companyName || t.application?.job?.companyName || "").toLowerCase();

        return title.includes(q) || desc.includes(q) || cand.includes(q) || job.includes(q) || company.includes(q);
      });
    }

    return result;
  }, [tasks, view, currentUserId, statusFilter, priorityFilter, searchTerm, todayStart, todayEnd]);

  const totalPages = Math.ceil(filteredTasks.length / pageSize) || 1;
  const paginatedTasks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, page, pageSize]);

  const filterConfigs: FilterDropdownConfig[] = [
    {
      key: "status",
      label: "Status",
      allLabel: "All Statuses",
      options: [
        { value: "TODO", label: "To Do" },
        { value: "IN_PROGRESS", label: "In Progress" },
        { value: "READY_FOR_REVIEW", label: "Ready for Review" },
        { value: "QA", label: "QA Verification" },
        { value: "BLOCKED", label: "Blocked" },
        { value: "WAITING", label: "Waiting" },
        { value: "ESCALATED", label: "Escalated" },
        { value: "COMPLETED", label: "Completed" },
        { value: "CANCELED", label: "Canceled" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      allLabel: "All Priorities",
      options: [
        { value: "URGENT", label: "Urgent" },
        { value: "HIGH", label: "High" },
        { value: "NORMAL", label: "Normal" },
        { value: "LOW", label: "Low" },
      ],
    },
  ];

  const filterValues: Record<string, string> = {
    status: statusFilter,
    priority: priorityFilter,
  };

  const isFiltered = Boolean(searchTerm.trim() || statusFilter || priorityFilter || view !== "all");

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError(null);
    const formData = new FormData(e.currentTarget);

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const category = formData.get("category") as any;
    const type = formData.get("type") as any;
    const priority = formData.get("priority") as any;
    const dueDate = formData.get("dueDate") as string;
    const assignedEmployeeId = formData.get("assignedEmployeeId") as string;
    const candidateId = formData.get("candidateId") as string;
    const jobId = formData.get("jobId") as string;
    const applicationId = formData.get("applicationId") as string;
    const checklistRaw = formData.get("checklistItems") as string;

    const checklistItems = checklistRaw
      ? checklistRaw
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [];

    const res = await createTaskAction({
      title,
      description: description || null,
      category,
      type,
      priority: priority || "NORMAL",
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      assignedEmployeeId: assignedEmployeeId || null,
      candidateId: candidateId || null,
      jobId: jobId || null,
      applicationId: applicationId || null,
      checklistItems,
    });

    if (res.success && res.data) {
      router.push(`/employee/tasks/${res.data.taskId}`);
    } else {
      setCreateError(res.error || "Failed to create task");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F1720] tracking-tight">Task Command & Execution</h1>
          <p className="mt-1 text-xs text-[#64748B] font-medium">
            Operational assignments, candidate checklist workflows, SLA deadlines, and QA verifications.
          </p>
        </div>
        {canCreateTask && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(!isCreateOpen)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>{isCreateOpen ? "Close Task Creator" : "+ Create Operational Task"}</span>
          </button>
        )}
      </div>

      {/* Instant 0ms View Selector Tabs */}
      <InstantTabs tabs={tabs} activeTab={view} onChange={handleViewChange} />

      {/* Create Task Drawer / Form (Controlled by Task Governance) */}
      {isCreateOpen && canCreateTask && (
        <div className="bg-white p-5 rounded-[16px] border border-[#E5EAE7] shadow-2xs space-y-4">
          <div className="border-b border-[#EDF1EF] pb-3">
            <h2 className="text-sm font-bold text-[#0F1720] uppercase tracking-wide">
              Create New Task Assignment
            </h2>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              Task governance enforces designated creators, assignees, and checklist rules.
            </p>
          </div>

          {createError && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Task Title *</label>
                <input
                  name="title"
                  required
                  placeholder="e.g. Verify Candidate Resume & QA Screening Answers"
                  className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#334155] mb-1">Category & Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    name="category"
                    defaultValue="APPLICATION"
                    className="rounded-md border border-[#DDE5E0] p-2 text-xs bg-white"
                  >
                    <option value="CANDIDATE">Candidate</option>
                    <option value="JOB">Job</option>
                    <option value="APPLICATION">Application</option>
                    <option value="QA">QA</option>
                    <option value="OPERATIONAL">Operational</option>
                  </select>

                  <select
                    name="type"
                    defaultValue="COMPLETE_APPLICATION"
                    className="rounded-md border border-[#DDE5E0] p-2 text-xs bg-white"
                  >
                    <option value="COMPLETE_PROFILE">Complete Profile</option>
                    <option value="UPLOAD_DOCUMENT">Upload Document</option>
                    <option value="VERIFY_INFORMATION">Verify Information</option>
                    <option value="APPROVE_APPLICATION">Approve Application</option>
                    <option value="PROVIDE_MISSING_INFO">Provide Missing Info</option>
                    <option value="REVIEW_JOB">Review Job</option>
                    <option value="QUALIFY_JOB">Qualify Job</option>
                    <option value="PREPARE_RESUME">Prepare Resume</option>
                    <option value="PREPARE_COVER_LETTER">Prepare Cover Letter</option>
                    <option value="PREPARE_SCREENING_ANSWERS">Prepare Screening Answers</option>
                    <option value="COMPLETE_APPLICATION">Complete Application</option>
                    <option value="VERIFY_APPLICATION">Verify Application</option>
                    <option value="SUBMIT_APPLICATION">Submit Application</option>
                    <option value="RESUME_QA">Resume QA</option>
                    <option value="APPLICATION_QA">Application QA</option>
                    <option value="SUBMISSION_QA">Submission QA</option>
                    <option value="CANDIDATE_ASSIGNMENT">Candidate Assignment</option>
                    <option value="CANDIDATE_REASSIGNMENT">Candidate Reassignment</option>
                    <option value="ESCALATION_HANDLING">Escalation Handling</option>
                    <option value="SUBMISSION_CORRECTION">Submission Correction</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Priority</label>
                <select
                  name="priority"
                  defaultValue="NORMAL"
                  className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs bg-white"
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent (SLA Priority)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#334155] mb-1">Due Date</label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#334155] mb-1">Assignee</label>
                <select
                  name="assignedEmployeeId"
                  defaultValue={currentUserId}
                  className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs bg-white"
                >
                  <option value="">Unassigned</option>
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {[s.firstName, s.lastName].filter(Boolean).join(" ") || s.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Linked Candidate</label>
                <select
                  name="candidateId"
                  className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs bg-white"
                >
                  <option value="">None</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || c.user.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#334155] mb-1">Linked Job</label>
                <select
                  name="jobId"
                  className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs bg-white"
                >
                  <option value="">None</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} @ {j.companyName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#334155] mb-1">Linked Application</label>
                <select
                  name="applicationId"
                  className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs bg-white"
                >
                  <option value="">None</option>
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.job?.title} for {a.candidate?.user?.firstName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">Task Checklists (one item per line)</label>
              <textarea
                name="checklistItems"
                rows={3}
                placeholder="1. Review resume summary&#10;2. Check application answers&#10;3. Submit to portal"
                className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-3.5 py-1.5 rounded-md border border-[#DDE5E0] bg-white text-[#334155] text-xs font-semibold hover:bg-[#F7F9F8] cursor-pointer"
              >
                Cancel
              </button>
              <PendingButton type="submit" pendingText="Creating Task...">
                Create Task
              </PendingButton>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-[16px] border border-[#E5EAE7] shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <InstantSearch
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search tasks, candidate, company, role..."
            className="min-w-[220px] flex-1 sm:flex-none"
          />

          <InstantFilterBar
            filters={filterConfigs}
            values={filterValues}
            onChange={handleFilterChange}
            onClearAll={handleClearAll}
            isFiltered={isFiltered}
          />
        </div>

        <div className="text-[11px] text-[#64748B] shrink-0">
          Showing <span className="font-semibold text-[#0F1720]">{filteredTasks.length}</span> tasks
        </div>
      </div>

      {/* Task List / Table */}
      <div className="bg-white rounded-[16px] border border-[#E5EAE7] shadow-2xs overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#64748B]">
            <p className="font-semibold text-[#334155]">No operational tasks match the selected view.</p>
            <p className="mt-1 text-[#94A3B8]">Switch tabs or create a new task.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#EDF1EF]">
            {paginatedTasks.map((t) => {
              const candName = t.candidate?.user
                ? [t.candidate.user.firstName, t.candidate.user.lastName].filter(Boolean).join(" ") || t.candidate.user.email
                : "General";

              const completedChecks = t.checklistItems.filter((c) => c.isCompleted).length;
              const totalChecks = t.checklistItems.length;

              return (
                <div
                  key={t.id}
                  className="p-4 hover:bg-[#F7F9F8]/75 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          t.priority === "URGENT"
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : t.priority === "HIGH"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-[#EDF1EF] text-[#334155]"
                        }`}
                      >
                        {t.priority}
                      </span>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          t.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : t.status === "BLOCKED" || t.status === "ESCALATED"
                            ? "bg-rose-100 text-rose-800"
                            : t.status === "QA" || t.status === "READY_FOR_REVIEW"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-blue-50 text-blue-800"
                        }`}
                      >
                        {t.status.replace(/_/g, " ")}
                      </span>

                      {t.dueDate && (
                        <span className="text-xs text-[#64748B] font-medium">
                          ⏱ Due {new Date(t.dueDate).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-semibold text-[#0F1720]">
                      <TransitionLink href={`/employee/tasks/${t.id}`} className="hover:text-blue-600 transition">
                        {t.title}
                      </TransitionLink>
                    </h3>

                    <div className="flex items-center gap-2 text-xs text-[#64748B] flex-wrap">
                      <span>Candidate: <strong className="text-[#334155]">{candName}</strong></span>
                      {(t.job || t.application?.job) && (
                        <>
                          <span>•</span>
                          <span>Role: <strong className="text-[#334155]">{t.job?.title || t.application?.job?.title}</strong></span>
                        </>
                      )}
                      {totalChecks > 0 && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-[11px] text-[#64748B]">
                            ✓ {completedChecks}/{totalChecks} checklist items
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <TransitionLink
                      href={`/employee/tasks/${t.id}`}
                      className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition"
                    >
                      Execute Task →
                    </TransitionLink>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filteredTasks.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
