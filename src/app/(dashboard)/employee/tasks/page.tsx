import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { canUserCreateTask } from "@/lib/task/governance";
import {
  EmployeeTasksWorkbench,
  TaskItem,
  StaffOption,
  CandidateOption,
  JobOption,
  ApplicationOption,
} from "@/components/task/EmployeeTasksWorkbench";

interface Props {
  searchParams?: Promise<{
    scope?: string;
    filter?: string;
    view?: string;
    status?: string;
    priority?: string;
  }>;
}

export default async function EmployeeTasksPage({ searchParams }: Props) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const params = searchParams ? await searchParams : {};
  const currentScope = params.scope;
  const currentFilter = params.filter;
  const currentView = params.view || (currentScope === "mine" ? "my" : currentFilter === "due_today" ? "due_today" : "all");
  const currentStatus = params.status || "";
  const currentPriority = params.priority || "";

  const data = await withRlsContext(ctx.userId, async (tx) => {
    const canCreate = await canUserCreateTask(tx, ctx);

    const allTasks = await tx.task.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        assignedEmployee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        candidate: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        job: { select: { id: true, title: true, companyName: true } },
        application: {
          select: {
            id: true,
            job: { select: { title: true, companyName: true } },
          },
        },
        checklistItems: {
          select: { id: true, description: true, isCompleted: true },
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 250,
    });

    const staff = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: ["EMPLOYEE", "ADMIN"] },
        status: "ACTIVE",
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      take: 100,
    });

    const cands = await tx.candidate.findMany({
      where: { organizationId: ctx.organizationId, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      take: 100,
    });

    const openJobs = await tx.job.findMany({
      where: { organizationId: ctx.organizationId, status: "OPEN" },
      select: { id: true, title: true, companyName: true },
      take: 100,
    });

    const activeApps = await tx.application.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        job: { select: { title: true, companyName: true } },
        candidate: {
          select: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
      take: 100,
    });

    return {
      tasks: allTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        type: t.type,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        assignedEmployeeId: t.assignedEmployeeId,
        assignedEmployee: t.assignedEmployee ? {
          id: t.assignedEmployee.id,
          firstName: t.assignedEmployee.firstName,
          lastName: t.assignedEmployee.lastName,
          email: t.assignedEmployee.email,
        } : null,
        candidateId: t.candidateId,
        candidate: t.candidate ? {
          id: t.candidate.id,
          user: {
            firstName: t.candidate.user?.firstName,
            lastName: t.candidate.user?.lastName,
            email: t.candidate.user?.email || "",
          },
        } : null,
        jobId: t.jobId,
        job: t.job ? {
          id: t.job.id,
          title: t.job.title,
          companyName: t.job.companyName,
        } : null,
        applicationId: t.applicationId,
        application: t.application ? {
          id: t.application.id,
          job: t.application.job ? {
            title: t.application.job.title,
            companyName: t.application.job.companyName,
          } : null,
        } : null,
        checklistItems: t.checklistItems.map((c) => ({
          id: c.id,
          title: c.description,
          description: c.description,
          isCompleted: c.isCompleted,
        })),
      })),
      staffMembers: staff.map((m) => m.user) as StaffOption[],
      candidates: cands as CandidateOption[],
      jobs: openJobs as JobOption[],
      applications: activeApps as ApplicationOption[],
      canCreateTask: canCreate,
    };
  });

  return (
    <EmployeeTasksWorkbench
      currentUserId={ctx.userId}
      tasks={data.tasks}
      staffMembers={data.staffMembers}
      candidates={data.candidates}
      jobs={data.jobs}
      applications={data.applications}
      canCreateTask={data.canCreateTask}
      initialView={currentView}
      initialStatus={currentStatus}
      initialPriority={currentPriority}
    />
  );
}
