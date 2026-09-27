import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { ApplicationStatus, TaskStatus, TaskPriority } from "@/generated/prisma";
import Link from "next/link";

interface WorkItem {
  id: string;
  kind: "TASK" | "APPLICATION_SUBMIT" | "APPLICATION_PREPARE" | "APPLICATION_QA";
  title: string;
  candidateName: string;
  candidateId?: string;
  jobTitle?: string;
  companyName?: string;
  applicationId?: string;
  status: string;
  priority: TaskPriority | "HIGH" | "NORMAL" | "URGENT" | "LOW";
  priorityRank: number; // 1 (Overdue), 2 (Due Today), 3 (Urgent/High), 4 (Blocked), 5 (Ready/Action), 6 (Normal)
  dueDateContext?: string;
  isOverdue?: boolean;
  isDueToday?: boolean;
  actionUrl: string;
  actionLabel: string;
}

export default async function EmployeeWorkspacePage() {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const data = await withRlsContext(ctx.userId, async (tx) => {
    // 1. My Tasks Count
    const myTasksCount = await tx.task.count({
      where: {
        organizationId: ctx.organizationId,
        assignedEmployeeId: ctx.userId,
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED] },
      },
    });

    // 2. My Assigned Candidates Count
    const myCandidatesCount = await tx.candidate.count({
      where: {
        organizationId: ctx.organizationId,
        assignedEmployeeId: ctx.userId,
        status: { not: "ARCHIVED" },
      },
    });

    // 3. Active Applications Count (Assigned to employee or org)
    const activeApplicationsCount = await tx.application.count({
      where: {
        organizationId: ctx.organizationId,
        assignedEmployeeId: ctx.userId,
        status: { notIn: [ApplicationStatus.SUBMITTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.REJECTED, ApplicationStatus.FAILED] },
      },
    });

    // 4. Tasks Due Today / Overdue for Employee
    const dueTodayTasksCount = await tx.task.count({
      where: {
        organizationId: ctx.organizationId,
        assignedEmployeeId: ctx.userId,
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED] },
        dueDate: { lte: todayEnd },
      },
    });

    // 5. Assigned Tasks for Work Center
    const assignedTasks = await tx.task.findMany({
      where: {
        organizationId: ctx.organizationId,
        assignedEmployeeId: ctx.userId,
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED] },
      },
      include: {
        candidate: { include: { user: true } },
        job: true,
        application: { include: { job: true, candidate: { include: { user: true } } } },
        checklistItems: true,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 20,
    });

    // 6. Applications Ready for Submission
    const readyApplications = await tx.application.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: ApplicationStatus.READY,
      },
      include: {
        candidate: { include: { user: true } },
        job: true,
        assignedEmployee: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    });

    // 7. Applications Awaiting Candidate Approval
    const awaitingApprovalApps = await tx.application.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: ApplicationStatus.AWAITING_APPROVAL,
      },
      include: {
        candidate: { include: { user: true } },
        job: true,
        assignedEmployee: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    // 8. Tasks in Waiting or Blocked status
    const waitingOrBlockedTasks = await tx.task.findMany({
      where: {
        organizationId: ctx.organizationId,
        assignedEmployeeId: ctx.userId,
        status: { in: [TaskStatus.WAITING, TaskStatus.BLOCKED, TaskStatus.ESCALATED] },
      },
      include: {
        candidate: { include: { user: true } },
        job: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    // 9. Recent Submissions by this authenticated employee
    const myRecentSubmissions = await tx.applicationSubmission.findMany({
      where: {
        submittedById: ctx.userId,
        application: { organizationId: ctx.organizationId },
      },
      include: {
        application: {
          include: {
            candidate: { include: { user: true } },
            job: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: 5,
    });

    // 10. Applications in Review (QA queue)
    const qaReviewApps = await tx.application.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: ApplicationStatus.REVIEW,
      },
      include: {
        candidate: { include: { user: true } },
        job: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    return {
      myTasksCount,
      myCandidatesCount,
      activeApplicationsCount,
      dueTodayTasksCount,
      assignedTasks,
      readyApplications,
      awaitingApprovalApps,
      waitingOrBlockedTasks,
      myRecentSubmissions,
      qaReviewApps,
    };
  });

  // Assemble and prioritize Action Center "MY WORK" items
  const workItems: WorkItem[] = [];
  const now = new Date();

  // 1. Convert Tasks
  for (const task of data.assignedTasks) {
    const candName = task.candidate?.user
      ? [task.candidate.user.firstName, task.candidate.user.lastName].filter(Boolean).join(" ") || task.candidate.user.email
      : task.application?.candidate?.user
      ? [task.application.candidate.user.firstName, task.application.candidate.user.lastName].filter(Boolean).join(" ") || task.application.candidate.user.email
      : "General Operations";

    const jobTitle = task.job?.title || task.application?.job?.title;
    const company = task.job?.companyName || task.application?.job?.companyName;

    let isOverdue = false;
    let isDueToday = false;
    let dueContext = "No deadline";

    if (task.dueDate) {
      const due = new Date(task.dueDate);
      if (due < todayStart) {
        isOverdue = true;
        const diffDays = Math.ceil((todayStart.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        dueContext = `Overdue by ${diffDays}d (${due.toLocaleDateString([], { month: "short", day: "numeric" })})`;
      } else if (due <= todayEnd) {
        isDueToday = true;
        dueContext = "Due Today";
      } else {
        dueContext = `Due ${due.toLocaleDateString([], { month: "short", day: "numeric" })}`;
      }
    }

    let priorityRank = 6;
    if (isOverdue) priorityRank = 1;
    else if (isDueToday) priorityRank = 2;
    else if (task.priority === "URGENT" || task.priority === "HIGH") priorityRank = 3;
    else if (task.status === "BLOCKED" || task.status === "ESCALATED") priorityRank = 4;
    else if (task.status === "IN_PROGRESS" || task.status === "READY_FOR_REVIEW") priorityRank = 5;

    workItems.push({
      id: `task-${task.id}`,
      kind: "TASK",
      title: task.title,
      candidateName: candName,
      candidateId: task.candidateId || task.application?.candidateId,
      jobTitle,
      companyName: company,
      applicationId: task.applicationId || undefined,
      status: task.status,
      priority: task.priority,
      priorityRank,
      dueDateContext: dueContext,
      isOverdue,
      isDueToday,
      actionUrl: `/employee/tasks/${task.id}`,
      actionLabel: task.status === "READY_FOR_REVIEW" ? "Review Task →" : "Execute Task →",
    });
  }

  // 2. Add Ready to Submit Applications (High operational urgency)
  for (const app of data.readyApplications) {
    if (app.assignedEmployeeId === ctx.userId) {
      const candName = [app.candidate.user.firstName, app.candidate.user.lastName].filter(Boolean).join(" ") || app.candidate.user.email;
      workItems.push({
        id: `ready-${app.id}`,
        kind: "APPLICATION_SUBMIT",
        title: `Submit External Application for ${app.job.title}`,
        candidateName: candName,
        candidateId: app.candidateId,
        jobTitle: app.job.title,
        companyName: app.job.companyName,
        applicationId: app.id,
        status: "READY",
        priority: "HIGH",
        priorityRank: 2, // Urgent action required
        dueDateContext: "Ready to apply",
        actionUrl: `/employee/applications/${app.id}`,
        actionLabel: "Open Submission →",
      });
    }
  }

  // Sort strictly by priorityRank ascending
  workItems.sort((a, b) => a.priorityRank - b.priorityRank);

  const formattedCurrentDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Employee Workspace</h1>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            Your operational command surface for today&apos;s assignments, candidate workflows, and submissions.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold bg-white border border-slate-200 shadow-2xs text-slate-700">
            📅 {formattedCurrentDate}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
            Active Staff
          </span>
        </div>
      </div>

      {/* Primary Metric Strip (Derived strictly from authoritative database records) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: My Tasks */}
        <Link
          href="/employee/tasks?scope=mine"
          className="bg-white overflow-hidden rounded-lg border border-slate-200 p-5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition group"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">My Tasks</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 group-hover:text-blue-600 transition">
            {data.myTasksCount}
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-600 group-hover:text-blue-600 transition inline-flex items-center gap-1">
            <span>View Task Board</span>
            <span>→</span>
          </div>
        </Link>

        {/* Metric 2: My Candidates */}
        <Link
          href="/employee/candidates?scope=mine"
          className="bg-white overflow-hidden rounded-lg border border-slate-200 p-5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition group"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">My Candidates</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 group-hover:text-blue-600 transition">
            {data.myCandidatesCount}
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-600 group-hover:text-blue-600 transition inline-flex items-center gap-1">
            <span>View Candidate Directory</span>
            <span>→</span>
          </div>
        </Link>

        {/* Metric 3: Active Applications */}
        <Link
          href="/employee/applications?scope=mine"
          className="bg-white overflow-hidden rounded-lg border border-slate-200 p-5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition group"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Applications</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 group-hover:text-blue-600 transition">
            {data.activeApplicationsCount}
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-600 group-hover:text-blue-600 transition inline-flex items-center gap-1">
            <span>View Application Queue</span>
            <span>→</span>
          </div>
        </Link>

        {/* Metric 4: Due Today */}
        <Link
          href="/employee/tasks?scope=mine&filter=due_today"
          className={`overflow-hidden rounded-lg border p-5 shadow-2xs hover:shadow-xs transition group ${
            data.dueTodayTasksCount > 0 ? "bg-amber-50/50 border-amber-200" : "bg-white border-slate-200"
          }`}
        >
          <div className="text-xs font-bold uppercase tracking-wider text-amber-900">Due Today / Overdue</div>
          <div className="mt-2 text-2xl font-bold text-amber-950 group-hover:text-amber-800 transition">
            {data.dueTodayTasksCount}
          </div>
          <div className="mt-2 text-xs font-semibold text-amber-800 group-hover:underline inline-flex items-center gap-1">
            <span>Triage Deadlines</span>
            <span>→</span>
          </div>
        </Link>
      </div>

      {/* Dominant Primary Section: MY WORK */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>MY WORK</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-900 text-white font-mono font-semibold">
                {workItems.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Work that needs your attention — prioritized by deadlines, blockers, and operational status.
            </p>
          </div>
          <Link
            href="/employee/tasks?scope=mine"
            className="text-xs font-bold text-blue-600 hover:text-blue-800 transition inline-flex items-center gap-1"
          >
            <span>View All My Work</span>
            <span>→</span>
          </Link>
        </div>

        {workItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="text-3xl mb-2">🎉</div>
            <h3 className="text-sm font-bold text-slate-800">You&apos;re all caught up</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No pending tasks or urgent application actions are assigned to you right now.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {workItems.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="p-4 sm:p-5 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Priority Tag */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        item.priority === "URGENT" || item.isOverdue
                          ? "bg-rose-100 text-rose-800 border border-rose-200"
                          : item.priority === "HIGH" || item.isDueToday
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {item.isOverdue ? "OVERDUE" : item.isDueToday ? "DUE TODAY" : item.priority}
                    </span>

                    {/* Status Tag */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        item.status === "READY"
                          ? "bg-sky-100 text-sky-900 border border-sky-200"
                          : item.status === "IN_PROGRESS"
                          ? "bg-blue-100 text-blue-800"
                          : item.status === "BLOCKED" || item.status === "ESCALATED"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {item.status.replace(/_/g, " ")}
                    </span>

                    {/* Due Context */}
                    {item.dueDateContext && (
                      <span
                        className={`text-xs font-medium ${
                          item.isOverdue ? "text-rose-700 font-semibold" : item.isDueToday ? "text-amber-800 font-semibold" : "text-slate-500"
                        }`}
                      >
                        ⏱ {item.dueDateContext}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900">
                    <Link href={item.actionUrl} className="hover:text-blue-600 transition">
                      {item.title}
                    </Link>
                  </h3>

                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    {item.candidateName && (
                      <span>
                        Candidate:{" "}
                        {item.candidateId ? (
                          <Link href={`/employee/candidates/${item.candidateId}`} className="font-medium text-slate-700 hover:underline">
                            {item.candidateName}
                          </Link>
                        ) : (
                          <strong className="text-slate-700 font-medium">{item.candidateName}</strong>
                        )}
                      </span>
                    )}
                    {item.jobTitle && (
                      <>
                        <span>•</span>
                        <span>
                          Role: <strong className="text-slate-700 font-medium">{item.jobTitle}</strong>
                          {item.companyName && ` @ ${item.companyName}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Link
                    href={item.actionUrl}
                    className="px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition inline-flex items-center gap-1"
                  >
                    {item.actionLabel}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Two-Column Operational Surface: Ready for Submission & Dependencies (Waiting On) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section: READY FOR EXTERNAL SUBMISSION */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 bg-sky-50/50 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-600 animate-pulse" />
                <h2 className="text-sm font-bold text-sky-950">READY FOR EXTERNAL SUBMISSION</h2>
              </div>
              <p className="text-xs text-sky-900/80 mt-0.5">
                Approved packages ready for manual external submission on employer portals.
              </p>
            </div>
            <Link
              href="/employee/applications?status=READY"
              className="text-xs font-semibold text-sky-700 hover:text-sky-900 hover:underline"
            >
              View All ({data.readyApplications.length}) →
            </Link>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {data.readyApplications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No applications currently waiting for external submission.
              </div>
            ) : (
              data.readyApplications.map((app) => {
                const candName =
                  [app.candidate.user.firstName, app.candidate.user.lastName].filter(Boolean).join(" ") ||
                  app.candidate.user.email;

                return (
                  <div key={app.id} className="p-4 hover:bg-slate-50/75 transition flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/employee/candidates/${app.candidateId}`} className="font-semibold text-xs text-slate-900 hover:underline truncate">
                          {candName}
                        </Link>
                        <span className="text-xs text-slate-400">→</span>
                        <span className="text-xs text-slate-700 font-medium truncate">{app.job.title}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {app.job.companyName} {app.job.location && `• ${app.job.location}`}
                      </p>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span>QA: <strong className="text-emerald-700 font-semibold">Passed</strong></span>
                        <span>•</span>
                        <span>Mode: <strong className="text-slate-700">{app.candidate.applicationAuthorizationMode}</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/employee/applications/${app.id}`}
                        className="px-3.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-2xs transition"
                      >
                        Open Submission →
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Section: WAITING ON (Dependency Tracking) */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-bold text-slate-900">WAITING ON (DEPENDENCY TRACKING)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Work waiting on candidate authorization, QA decisions, or blocker resolutions.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {data.awaitingApprovalApps.length === 0 && data.waitingOrBlockedTasks.length === 0 && data.qaReviewApps.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active dependencies blocking your workflow.
              </div>
            ) : (
              <>
                {/* 1. Candidate Approvals */}
                {data.awaitingApprovalApps.map((app) => {
                  const candName =
                    [app.candidate.user.firstName, app.candidate.user.lastName].filter(Boolean).join(" ") ||
                    app.candidate.user.email;

                  return (
                    <div key={`wait-cand-${app.id}`} className="p-4 hover:bg-slate-50/75 transition flex items-center justify-between gap-4 text-xs">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px] uppercase">
                            Candidate Sign-off
                          </span>
                          <span className="font-semibold text-slate-900 truncate">{candName}</span>
                        </div>
                        <p className="text-slate-600 text-[11px] truncate">
                          Application for <strong>{app.job.title}</strong> at {app.job.companyName}
                        </p>
                      </div>
                      <Link
                        href={`/employee/applications/${app.id}`}
                        className="text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline shrink-0"
                      >
                        View Status →
                      </Link>
                    </div>
                  );
                })}

                {/* 2. QA Review Queue */}
                {data.qaReviewApps.map((app) => {
                  const candName =
                    [app.candidate.user.firstName, app.candidate.user.lastName].filter(Boolean).join(" ") ||
                    app.candidate.user.email;

                  return (
                    <div key={`wait-qa-${app.id}`} className="p-4 hover:bg-slate-50/75 transition flex items-center justify-between gap-4 text-xs">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 font-bold text-[10px] uppercase">
                            QA Decision
                          </span>
                          <span className="font-semibold text-slate-900 truncate">{app.job.title}</span>
                        </div>
                        <p className="text-slate-600 text-[11px] truncate">
                          Candidate: {candName} @ {app.job.companyName}
                        </p>
                      </div>
                      <Link
                        href={`/employee/applications/${app.id}`}
                        className="text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline shrink-0"
                      >
                        Review QA →
                      </Link>
                    </div>
                  );
                })}

                {/* 3. Blocked / Waiting Tasks */}
                {data.waitingOrBlockedTasks.map((t) => (
                  <div key={`wait-task-${t.id}`} className="p-4 hover:bg-slate-50/75 transition flex items-center justify-between gap-4 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px] uppercase">
                          {t.status}
                        </span>
                        <span className="font-semibold text-slate-900 truncate">{t.title}</span>
                      </div>
                      <p className="text-slate-500 text-[11px] truncate">
                        {t.blockedReason || t.waitingReason || t.escalationReason || "Awaiting resolution"}
                      </p>
                    </div>
                    <Link
                      href={`/employee/tasks/${t.id}`}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline shrink-0"
                    >
                      Resolve →
                    </Link>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Operational History: Recent Submissions Recorded by You */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-slate-900">MY RECORDED EXTERNAL SUBMISSIONS</h2>
            <p className="text-xs text-slate-500 mt-0.5">Authoritative audit log of external job portal submissions recorded by you.</p>
          </div>
          <Link href="/employee/applications?status=SUBMITTED" className="text-xs font-semibold text-slate-700 hover:underline">
            All Submitted Applications →
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          {data.myRecentSubmissions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No external submissions recorded by you yet.
            </div>
          ) : (
            data.myRecentSubmissions.map((sub) => {
              const candName =
                [sub.application.candidate.user.firstName, sub.application.candidate.user.lastName].filter(Boolean).join(" ") ||
                sub.application.candidate.user.email;

              return (
                <div key={sub.id} className="p-4 hover:bg-slate-50/75 transition flex items-center justify-between gap-4 text-xs">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{sub.application.job.companyName}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-700 font-medium">{sub.application.job.title}</span>
                    </div>
                    <div className="text-slate-500 flex items-center gap-2 text-[11px] flex-wrap">
                      <span>Candidate: <strong className="text-slate-700">{candName}</strong></span>
                      <span>•</span>
                      <span>Attempt #{sub.attemptNumber}</span>
                      <span>•</span>
                      <span>Submitted at {new Date(sub.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on {new Date(sub.submittedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {sub.externalReference && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-semibold">
                        Ref: {sub.externalReference}
                      </span>
                    )}
                    <Link
                      href={`/employee/applications/${sub.applicationId}`}
                      className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                    >
                      View
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
