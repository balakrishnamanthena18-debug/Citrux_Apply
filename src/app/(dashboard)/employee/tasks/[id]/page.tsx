import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import {
  assignTaskAction,
  transitionTaskStatusAction,
  updateTaskChecklistItemAction,
} from "@/lib/task/actions";
import { ALLOWED_TASK_TRANSITIONS } from "@/lib/task/constants";
import type { TaskStatus } from "@/generated/prisma";
import { RecordHeader } from "@/components/ui/RecordHeader";

export default async function EmployeeTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const { id: taskId } = await params;

  const { task, staffMembers } = await withRlsContext(ctx.userId, async (tx) => {
    const t = await tx.task.findUnique({
      where: { id: taskId, organizationId: ctx.organizationId },
      include: {
        assignedEmployee: true,
        createdBy: true,
        candidate: { include: { user: true } },
        job: true,
        application: { include: { job: true, candidate: { include: { user: true } } } },
        checklistItems: { orderBy: { orderIndex: "asc" } },
        stateHistory: {
          include: { changedBy: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!t) return { task: null, staffMembers: [] };

    const staff = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: ["EMPLOYEE", "ADMIN"] },
        status: "ACTIVE",
      },
      include: { user: true },
    });

    return { task: t, staffMembers: staff.map((m) => m.user) };
  });

  if (!task) {
    notFound();
  }

  const allowedNextStatuses = ALLOWED_TASK_TRANSITIONS[task.status] || [];

  async function handleAssign(formData: FormData) {
    "use server";
    const employeeId = formData.get("assignedEmployeeId") as string;
    await assignTaskAction({
      taskId,
      assignedEmployeeId: employeeId || null,
    });
    redirect(`/employee/tasks/${taskId}`);
  }

  async function handleStatusTransition(formData: FormData) {
    "use server";
    const targetStatus = formData.get("targetStatus") as TaskStatus;
    const reason = formData.get("reason") as string;

    await transitionTaskStatusAction({
      taskId,
      targetStatus,
      reason: reason || null,
    });
    redirect(`/employee/tasks/${taskId}`);
  }

  async function handleChecklistItemToggle(formData: FormData) {
    "use server";
    const checklistItemId = formData.get("checklistItemId") as string;
    const isCompleted = formData.get("isCompleted") === "true";

    await updateTaskChecklistItemAction({
      checklistItemId,
      isCompleted: !isCompleted,
    });
    redirect(`/employee/tasks/${taskId}`);
  }

  const candidateName = task.candidate?.user
    ? [task.candidate.user.firstName, task.candidate.user.lastName].filter(Boolean).join(" ") || task.candidate.user.email
    : task.application?.candidate?.user
    ? [task.application.candidate.user.firstName, task.application.candidate.user.lastName].filter(Boolean).join(" ") || task.application.candidate.user.email
    : undefined;

  const assignedStaffName = task.assignedEmployee
    ? [task.assignedEmployee.firstName, task.assignedEmployee.lastName].filter(Boolean).join(" ") || task.assignedEmployee.email
    : "Unassigned";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Task Record Header */}
      <RecordHeader
        breadcrumbs={[
          { label: "Task Workbench", href: "/employee/tasks" },
          { label: task.title },
        ]}
        title={task.title}
        subtitle={
          <>
            <span className="font-mono text-[11px] text-slate-500 uppercase">{task.type}</span>
            <span>•</span>
            <span>Created {new Date(task.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
          </>
        }
        statusBadge={
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded uppercase tracking-wider ${
                task.priority === "URGENT"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : task.priority === "HIGH"
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              {task.priority}
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded uppercase tracking-wider ${
                task.status === "COMPLETED"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : task.status === "BLOCKED" || task.status === "ESCALATED"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : task.status === "QA" || task.status === "READY_FOR_REVIEW"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : task.status === "IN_PROGRESS"
                  ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                  : "bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              {task.status.replace(/_/g, " ")}
            </span>
          </div>
        }
        metaItems={[
          {
            label: "Category",
            value: task.category,
          },
          {
            label: "Assignee",
            value: assignedStaffName,
          },
          {
            label: "Candidate",
            value: candidateName ? (
              task.candidateId ? (
                <Link href={`/employee/candidates/${task.candidateId}`} className="hover:underline font-semibold text-slate-900">
                  {candidateName}
                </Link>
              ) : (
                candidateName
              )
            ) : (
              "General"
            ),
          },
          {
            label: "Job / Role",
            value: task.job?.title || task.application?.job?.title || "N/A",
          },
          {
            label: "Due Date",
            value: task.dueDate ? new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" }) : "No deadline",
          },
          {
            label: "Checklist",
            value: `${task.checklistItems.filter((i) => i.isCompleted).length} / ${task.checklistItems.length} Done`,
          },
        ]}
      />

      {/* Reason Banners for Blocked / Waiting / Escalated */}
      {task.status === "BLOCKED" && task.blockedReason && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          <span className="font-bold">⛔ Blocker:</span> {task.blockedReason}
        </div>
      )}
      {task.status === "WAITING" && task.waitingReason && (
        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <span className="font-bold">⏳ Waiting:</span> {task.waitingReason}
        </div>
      )}
      {task.status === "ESCALATED" && task.escalationReason && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs">
          <span className="font-bold">🚨 Escalation Reason:</span> {task.escalationReason}
        </div>
      )}

      {/* 3-Column Layout: Checklist & Workflow, Context Cards, State History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1 & 2: Preparation Checklist & Status Transitions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Checklist */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Preparation & QA Checklist</h2>
              <span className="text-xs font-semibold text-slate-500">
                {task.checklistItems.filter((i) => i.isCompleted).length} / {task.checklistItems.length} completed
              </span>
            </div>

            {task.checklistItems.length === 0 ? (
              <div className="text-sm text-slate-500 italic py-4">No checklist items defined for this task.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {task.checklistItems.map((item) => (
                  <form key={item.id} action={handleChecklistItemToggle} className="flex items-center justify-between py-3">
                    <input type="hidden" name="checklistItemId" value={item.id} />
                    <input type="hidden" name="isCompleted" value={String(item.isCompleted)} />
                    <div className="flex items-center space-x-3">
                      <button
                        type="submit"
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          item.isCompleted
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-slate-300 hover:border-slate-400 bg-white"
                        }`}
                      >
                        {item.isCompleted && "✓"}
                      </button>
                      <span className={`text-sm ${item.isCompleted ? "line-through text-slate-400" : "text-slate-800"}`}>
                        {item.description}
                      </span>
                    </div>
                    {item.completedAt && (
                      <span className="text-[11px] text-slate-400">
                        {new Date(item.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </form>
                ))}
              </div>
            )}
          </div>

          {/* Status Transitions */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Task Lifecycle Controls</h2>

            {allowedNextStatuses.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-50 text-sm text-slate-500 italic">
                Task is in terminal status {task.status}. No further transitions permitted.
              </div>
            ) : (
              <form action={handleStatusTransition} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                    Select Target Status
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {allowedNextStatuses.map((st) => (
                      <label
                        key={st}
                        className="flex items-center space-x-2 border border-slate-200 rounded-lg p-3 hover:bg-slate-50 cursor-pointer text-xs font-medium text-slate-800"
                      >
                        <input type="radio" name="targetStatus" value={st} required className="text-slate-900" />
                        <span>{st}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Transition Reason (Mandatory for BLOCKED, WAITING, and ESCALATED)
                  </label>
                  <textarea
                    name="reason"
                    rows={2}
                    placeholder="Provide operational context or blocker details..."
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                  />
                </div>

                <button
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                >
                  Execute Status Transition
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Column 3: Context Linkages & State History */}
        <div className="space-y-8">
          {/* Linked Context Cards */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900">Linked Context</h3>

            {task.candidate && (
              <div className="p-3.5 rounded-lg border border-slate-100 bg-slate-50">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Candidate</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">
                  {task.candidate.user?.firstName || task.candidate.user?.email}
                </div>
                <div className="text-xs text-slate-500">Status: {task.candidate.status}</div>
                <Link
                  href={`/employee/candidates/${task.candidate.id}`}
                  className="text-xs text-indigo-600 hover:underline mt-2 inline-block font-medium"
                >
                  View Candidate Profile →
                </Link>
              </div>
            )}

            {task.job && (
              <div className="p-3.5 rounded-lg border border-slate-100 bg-slate-50">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Job Listing</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">{task.job.title}</div>
                <div className="text-xs text-slate-500">{task.job.companyName} • {task.job.status}</div>
              </div>
            )}

            {task.application && (
              <div className="p-3.5 rounded-lg border border-slate-100 bg-slate-50">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Application</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">{task.application.job.title}</div>
                <div className="text-xs text-slate-500">
                  Status: <span className="font-mono">{task.application.status}</span>
                </div>
                <Link
                  href={`/employee/applications/${task.application.id}`}
                  className="text-xs text-indigo-600 hover:underline mt-2 inline-block font-medium"
                >
                  Open Application Workbench →
                </Link>
              </div>
            )}
          </div>

          {/* State History Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-4">State History</h3>
            <div className="space-y-4">
              {task.stateHistory.map((h) => (
                <div key={h.id} className="border-l-2 border-slate-200 pl-3 py-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}
                    </span>
                    <span className="text-slate-400">{new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {h.reason && <p className="text-xs text-slate-600 mt-0.5 italic">{h.reason}</p>}
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    by {h.changedBy?.firstName || h.changedBy?.email}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
