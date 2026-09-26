import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { createTaskAction } from "@/lib/task/actions";
import { canUserCreateTask } from "@/lib/task/governance";
import { TaskStatus, TaskPriority, TaskCategory, TaskType } from "@/generated/prisma";

export default async function EmployeeTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; priority?: string }>;
}) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const params = await searchParams;
  const currentView = params.view || "all";
  const currentStatus = params.status;
  const currentPriority = params.priority;

  const { tasks, staffMembers, candidates, jobs, applications, canCreateTask } = await withRlsContext(ctx.userId, async (tx) => {
    const canCreate = await canUserCreateTask(tx, ctx);

    const allTasks = await tx.task.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        assignedEmployee: true,
        candidate: { include: { user: true } },
        job: true,
        application: { include: { job: true } },
        checklistItems: true,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    const staff = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: ["EMPLOYEE", "ADMIN"] },
        status: "ACTIVE",
      },
      include: { user: true },
    });

    const cands = await tx.candidate.findMany({
      where: { organizationId: ctx.organizationId },
      include: { user: true },
      take: 50,
    });

    const openJobs = await tx.job.findMany({
      where: { organizationId: ctx.organizationId, status: "OPEN" },
      take: 50,
    });

    const activeApps = await tx.application.findMany({
      where: { organizationId: ctx.organizationId },
      include: { job: true, candidate: { include: { user: true } } },
      take: 50,
    });

    return {
      tasks: allTasks,
      staffMembers: staff.map((m) => m.user),
      candidates: cands,
      jobs: openJobs,
      applications: activeApps,
      canCreateTask: canCreate,
    };
  });

  // Calculate Metrics
  const myTasksCount = tasks.filter((t) => t.assignedEmployeeId === ctx.userId).length;
  const backlogCount = tasks.filter((t) => t.status === "BACKLOG").length;
  const qaCount = tasks.filter((t) => t.status === "QA" || t.status === "READY_FOR_REVIEW").length;
  const blockedEscalatedCount = tasks.filter((t) => t.status === "BLOCKED" || t.status === "ESCALATED").length;

  // Filter Tasks by View
  let filteredTasks = tasks;
  if (currentView === "my") {
    filteredTasks = filteredTasks.filter((t) => t.assignedEmployeeId === ctx.userId);
  } else if (currentView === "backlog") {
    filteredTasks = filteredTasks.filter((t) => t.status === "BACKLOG");
  } else if (currentView === "qa") {
    filteredTasks = filteredTasks.filter((t) => t.status === "QA" || t.status === "READY_FOR_REVIEW");
  } else if (currentView === "blocked") {
    filteredTasks = filteredTasks.filter((t) => t.status === "BLOCKED" || t.status === "ESCALATED");
  }

  if (currentStatus) {
    filteredTasks = filteredTasks.filter((t) => t.status === currentStatus);
  }
  if (currentPriority) {
    filteredTasks = filteredTasks.filter((t) => t.priority === currentPriority);
  }

  async function handleCreateTask(formData: FormData) {
    "use server";
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
      redirect(`/employee/tasks/${res.data.taskId}`);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Task & Preparation Workbench</h1>
          <p className="text-sm text-slate-600 mt-1">
            Operational work allocation, preparation checklists, QA review gates, and administrative triage.
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <Link
          href="/employee/tasks?view=all"
          className={`p-4 rounded-xl border transition-all ${
            currentView === "all" ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="text-xs uppercase tracking-wider font-semibold opacity-75">All Tasks</div>
          <div className="text-2xl font-bold mt-1">{tasks.length}</div>
        </Link>
        <Link
          href="/employee/tasks?view=my"
          className={`p-4 rounded-xl border transition-all ${
            currentView === "my" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="text-xs uppercase tracking-wider font-semibold opacity-75">My Tasks</div>
          <div className="text-2xl font-bold mt-1">{myTasksCount}</div>
        </Link>
        <Link
          href="/employee/tasks?view=backlog"
          className={`p-4 rounded-xl border transition-all ${
            currentView === "backlog" ? "bg-slate-700 text-white border-slate-700 shadow-sm" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="text-xs uppercase tracking-wider font-semibold opacity-75">Backlog / Unassigned</div>
          <div className="text-2xl font-bold mt-1">{backlogCount}</div>
        </Link>
        <Link
          href="/employee/tasks?view=qa"
          className={`p-4 rounded-xl border transition-all ${
            currentView === "qa" ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="text-xs uppercase tracking-wider font-semibold opacity-75">QA / Review Queue</div>
          <div className="text-2xl font-bold mt-1">{qaCount}</div>
        </Link>
        <Link
          href="/employee/tasks?view=blocked"
          className={`p-4 rounded-xl border transition-all ${
            currentView === "blocked" ? "bg-rose-600 text-white border-rose-600 shadow-sm" : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="text-xs uppercase tracking-wider font-semibold opacity-75">Blocked / Escalated</div>
          <div className="text-2xl font-bold mt-1">{blockedEscalatedCount}</div>
        </Link>
      </div>

      {/* Main Grid: Create Task Drawer + Task Table */}
      <div className={`grid grid-cols-1 ${canCreateTask ? "lg:grid-cols-3" : ""} gap-8`}>
        {/* Left Column: Create Task Form (Only for authorized task creators) */}
        {canCreateTask && (
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm sticky top-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Create Operational Task</h2>
              <form action={handleCreateTask} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Task Title *</label>
                  <input
                    type="text"
                    name="title"
                    required
                    placeholder="e.g. Tailor resume for Stripe SWE role"
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Description</label>
                  <textarea
                    name="description"
                    rows={2}
                    placeholder="Operational notes and requirements..."
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Category *</label>
                    <select
                      name="category"
                      required
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="APPLICATION">APPLICATION</option>
                      <option value="QA">QA</option>
                      <option value="CANDIDATE">CANDIDATE</option>
                      <option value="JOB">JOB</option>
                      <option value="OPERATIONAL">OPERATIONAL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Priority</label>
                    <select
                      name="priority"
                      defaultValue="NORMAL"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="LOW">LOW</option>
                      <option value="NORMAL">NORMAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Task Type *</label>
                  <select
                    name="type"
                    required
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="PREPARE_RESUME">PREPARE_RESUME</option>
                    <option value="PREPARE_COVER_LETTER">PREPARE_COVER_LETTER</option>
                    <option value="PREPARE_SCREENING_ANSWERS">PREPARE_SCREENING_ANSWERS</option>
                    <option value="APPLICATION_QA">APPLICATION_QA</option>
                    <option value="RESUME_QA">RESUME_QA</option>
                    <option value="SUBMISSION_QA">SUBMISSION_QA</option>
                    <option value="SUBMIT_APPLICATION">SUBMIT_APPLICATION</option>
                    <option value="SUBMISSION_CORRECTION">SUBMISSION_CORRECTION</option>
                    <option value="VERIFY_INFORMATION">VERIFY_INFORMATION</option>
                    <option value="COMPLETE_PROFILE">COMPLETE_PROFILE</option>
                    <option value="REVIEW_JOB">REVIEW_JOB</option>
                    <option value="QUALIFY_JOB">QUALIFY_JOB</option>
                    <option value="ESCALATION_HANDLING">ESCALATION_HANDLING</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Assignee</label>
                    <select
                      name="assignedEmployeeId"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="">Unassigned (Backlog)</option>
                      {staffMembers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.firstName || s.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Due Date</label>
                    <input
                      type="date"
                      name="dueDate"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    />
                  </div>
                </div>

                {/* Context Linkages */}
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase">Context Linkages</div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Candidate</label>
                    <select name="candidateId" className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white">
                      <option value="">None</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.user?.firstName ? `${c.user.firstName} (${c.user.email})` : c.user?.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Job</label>
                    <select name="jobId" className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white">
                      <option value="">None</option>
                      {jobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.title} @ {j.companyName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Application</label>
                    <select name="applicationId" className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white">
                      <option value="">None</option>
                      {applications.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.job.title} - {a.candidate.user?.firstName || a.candidate.user?.email} ({a.status})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Checklist items */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Preparation Checklist (One item per line)
                  </label>
                  <textarea
                    name="checklistItems"
                    rows={3}
                    placeholder="Tailor keywords&#10;Format PDF export&#10;Verify work authorization"
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                >
                  Create Task
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Task List Table Column */}
        <div className={canCreateTask ? "lg:col-span-2" : "col-span-full"}>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <span className="font-semibold text-slate-800 text-sm">
                Showing {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"}
              </span>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <div className="text-4xl mb-3">📋</div>
                <div className="text-base font-semibold text-slate-700">No tasks in this view</div>
                <p className="text-xs text-slate-500 mt-1">
                  {canCreateTask
                    ? "Create a new operational task using the workbench form."
                    : "Operational tasks assigned to you or in the team queue will appear here."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredTasks.map((t) => {
                  const isUrgent = t.priority === "URGENT";
                  const isBlocked = t.status === "BLOCKED" || t.status === "ESCALATED";
                  const completedItems = t.checklistItems.filter((i) => i.isCompleted).length;

                  return (
                    <Link
                      key={t.id}
                      href={`/employee/tasks/${t.id}`}
                      className="block p-5 hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-4">
                          <div className="flex items-center space-x-2">
                            {/* Priority Badge */}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                isUrgent
                                  ? "bg-rose-100 text-rose-800"
                                  : t.priority === "HIGH"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {t.priority}
                            </span>

                            {/* Status Badge */}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                t.status === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isBlocked
                                  ? "bg-rose-100 text-rose-800"
                                  : t.status === "QA" || t.status === "READY_FOR_REVIEW"
                                  ? "bg-blue-100 text-blue-800"
                                  : t.status === "IN_PROGRESS"
                                  ? "bg-indigo-100 text-indigo-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {t.status}
                            </span>

                            <span className="text-xs text-slate-400 font-mono">{t.type}</span>
                          </div>

                          <h3 className="text-base font-semibold text-slate-900 mt-1.5">{t.title}</h3>

                          {t.description && (
                            <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{t.description}</p>
                          )}

                          {/* Context Tags */}
                          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-slate-500">
                            {t.candidate && (
                              <span className="inline-flex items-center bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                                👤 {t.candidate.user?.firstName || t.candidate.user?.email}
                              </span>
                            )}
                            {t.job && (
                              <span className="inline-flex items-center bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                                💼 {t.job.companyName}
                              </span>
                            )}
                            {t.application && (
                              <span className="inline-flex items-center bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono text-[11px]">
                                App: {t.application.status}
                              </span>
                            )}
                            {t.checklistItems.length > 0 && (
                              <span className="inline-flex items-center text-slate-600 text-[11px]">
                                ☑️ {completedItems}/{t.checklistItems.length} checked
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Assignee & Due Date */}
                        <div className="text-right flex flex-col items-end">
                          <span className="text-xs font-medium text-slate-700">
                            {t.assignedEmployee ? (
                              <span className="text-indigo-600">👤 {t.assignedEmployee.firstName || t.assignedEmployee.email}</span>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </span>
                          {t.dueDate && (
                            <span className="text-[11px] text-slate-500 mt-1">
                              Due: {new Date(t.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
