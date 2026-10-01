import { redirect } from "next/navigation";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { assignTaskAction, transitionTaskStatusAction } from "@/lib/task/actions";
import { TaskStatus } from "@/generated/prisma";
import { AdminEscalationsWorkbench } from "@/components/admin/AdminEscalationsWorkbench";

export default async function AdminTaskEscalationsPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const { escalatedTasks, staffMembers } = await withRlsContext(ctx.userId, async (tx) => {
    const [tasks, staff] = await Promise.all([
      tx.task.findMany({
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
        take: 100,
      }),
      tx.membership.findMany({
        where: {
          organizationId: ctx.organizationId,
          role: { in: ["EMPLOYEE", "ADMIN"] },
          status: "ACTIVE",
        },
        include: { user: true },
      }),
    ]);

    return {
      escalatedTasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        type: t.type,
        priority: t.priority,
        status: t.status,
        escalationReason: t.escalationReason,
        assignedEmployee: t.assignedEmployee ? {
          firstName: t.assignedEmployee.firstName,
          lastName: t.assignedEmployee.lastName,
          email: t.assignedEmployee.email,
        } : null,
        candidate: t.candidate ? {
          user: {
            firstName: t.candidate.user?.firstName,
            lastName: t.candidate.user?.lastName,
            email: t.candidate.user?.email || "",
          }
        } : null,
        job: t.job ? {
          title: t.job.title,
          companyName: t.job.companyName,
        } : null,
        application: t.application ? {
          status: t.application.status,
        } : null,
      })),
      staffMembers: staff.map((m) => ({
        id: m.user.id,
        name: `${m.user.firstName || ""} ${m.user.lastName || m.user.email}`.trim(),
      })),
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
    <AdminEscalationsWorkbench
      escalatedTasks={escalatedTasks}
      staffMembers={staffMembers}
      onTriageAction={handleAdminTriage}
    />
  );
}

