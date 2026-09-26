import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { assignTaskAction, transitionTaskStatusAction } from "@/lib/task/actions";
import { TaskStatus } from "@/generated/prisma";

export default async function AdminTaskEscalationsPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const { escalatedTasks, staffMembers } = await withRlsContext(ctx.userId, async (tx) => {
    const tasks = await tx.task.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: TaskStatus.ESCALATED,
      },
      include: {
        assignedEmployee: true,
        candidate: { include: { user: true } },
        job: true,
        application: { include: { job: true } },
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });

    const staff = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: ["EMPLOYEE", "ADMIN"] },
        status: "ACTIVE",
      },
      include: { user: true },
    });

    return {
      escalatedTasks: tasks,
      staffMembers: staff.map((m) => m.user),
    };
  });

  async function handleAdminTriage(formData: FormData) {
    "use server";
    const taskId = formData.get("taskId") as string;
    const action = formData.get("triageAction") as string;
    const targetEmployeeId = formData.get("targetEmployeeId") as string;
    const notes = formData.get("triageNotes") as string;

    if (action === "REASSIGN") {
      await assignTaskAction({
        taskId,
        assignedEmployeeId: targetEmployeeId || null,
      });
      await transitionTaskStatusAction({
        taskId,
        targetStatus: TaskStatus.ASSIGNED,
        reason: notes || `Admin reassigned escalated task to employee ${targetEmployeeId}`,
      });
    } else if (action === "RESUME") {
      await transitionTaskStatusAction({
        taskId,
        targetStatus: TaskStatus.IN_PROGRESS,
        reason: notes || "Admin resolved escalation and resumed active work",
      });
    } else if (action === "CANCEL") {
      await transitionTaskStatusAction({
        taskId,
        targetStatus: TaskStatus.CANCELED,
        reason: notes || "Admin cancelled escalated task",
      });
    }

    redirect("/admin/tasks/escalations");
  }

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
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-md bg-amber-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
            {escalatedTasks.length}
          </div>
          <div>
            <div className="text-sm font-bold text-amber-900">
              {escalatedTasks.length === 1 ? "1 Task Awaiting Administrative Triage" : `${escalatedTasks.length} Tasks Awaiting Administrative Triage`}
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              Review blockers, reassign operational ownership, or authorize task resolution.
            </div>
          </div>
        </div>
      </div>

      {/* Escalated Tasks List */}
      {escalatedTasks.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500 shadow-xs">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm font-semibold text-slate-800">No Escalated Tasks</div>
          <p className="text-xs text-slate-500 mt-1">All operational tasks are progressing normally without blockers.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {escalatedTasks.map((task) => (
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
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2.5">Admin Triage Actions</div>
                <form action={handleAdminTriage} className="space-y-2.5">
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
                          {s.firstName || s.email}
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

                  <button
                    type="submit"
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1.5 rounded-md text-xs transition-colors shadow-xs"
                  >
                    Execute Triage
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
