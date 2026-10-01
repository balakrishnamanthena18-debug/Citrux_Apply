import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { ApplicationStatus, TaskStatus, TaskPriority } from "@/generated/prisma";
import Link from "next/link";
import { TelemetryGauge } from "@/components/ui/TelemetryGauge";
import { PageHero } from "@/components/ui/PageHero";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { SectionPanel } from "@/components/ui/SectionPanel";

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
    const [
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
    ] = await Promise.all([
      // 1. My Tasks Count
      tx.task.count({
        where: {
          organizationId: ctx.organizationId,
          assignedEmployeeId: ctx.userId,
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED] },
        },
      }),

      // 2. My Assigned Candidates Count
      tx.candidate.count({
        where: {
          organizationId: ctx.organizationId,
          assignedEmployeeId: ctx.userId,
          status: { not: "ARCHIVED" },
        },
      }),

      // 3. Active Applications Count (Assigned to employee or org)
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          assignedEmployeeId: ctx.userId,
          status: { notIn: [ApplicationStatus.SUBMITTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.REJECTED, ApplicationStatus.FAILED] },
        },
      }),

      // 4. Tasks Due Today / Overdue for Employee
      tx.task.count({
        where: {
          organizationId: ctx.organizationId,
          assignedEmployeeId: ctx.userId,
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED] },
          dueDate: { lte: todayEnd },
        },
      }),

      // 5. Assigned Tasks for Work Center
      tx.task.findMany({
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
      }),

      // 6. Applications Ready for Submission
      tx.application.findMany({
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
      }),

      // 7. Applications Awaiting Candidate Approval
      tx.application.findMany({
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
      }),

      // 8. Tasks in Waiting or Blocked status
      tx.task.findMany({
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
      }),

      // 9. Recent Submissions by this authenticated employee
      tx.applicationSubmission.findMany({
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
      }),

      // 10. Applications in Review (QA queue)
      tx.application.findMany({
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
      }),
    ]);

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
      <PageHero
        eyebrow={`${formattedCurrentDate} · Operational desk`}
        title={
          workItems.length === 0
            ? "Your desk is clear."
            : `${workItems.length} item${workItems.length === 1 ? "" : "s"} in your queue.`
        }
        description={
          workItems.length === 0
            ? "No pending tasks or urgent application actions are assigned to you right now."
            : "Triage SLA work first, then move ready packages to submission."
        }
        primaryAction={{
          label: workItems[0] ? workItems[0].actionLabel : "Fast Intake",
          href: workItems[0]?.actionUrl || "/employee/application-log",
        }}
        secondaryAction={{ label: "Open tasks", href: "/employee/tasks?scope=mine" }}
        tiles={[
          {
            label: "Active tasks",
            count: data.myTasksCount,
            href: "/employee/tasks?scope=mine",
            description: "Assigned operational work",
            tone: data.myTasksCount > 0 ? "blue" : "neutral",
          },
          {
            label: "Candidates",
            count: data.myCandidatesCount,
            href: "/employee/candidates?scope=mine",
            description: "Your assigned people",
            tone: "neutral",
          },
          {
            label: "Applications",
            count: data.activeApplicationsCount,
            href: "/employee/applications?scope=mine",
            description: "Live packages on your desk",
            tone: data.activeApplicationsCount > 0 ? "amber" : "neutral",
          },
          {
            label: "Due today",
            count: data.dueTodayTasksCount,
            href: "/employee/tasks?scope=mine&filter=due_today",
            description: "SLA risk window",
            tone: data.dueTodayTasksCount > 0 ? "amber" : "neutral",
          },
          {
            label: "Ready to submit",
            count: data.readyApplications?.length || 0,
            href: "/employee/applications?queue=ready",
            description: "Approved packages",
            tone: (data.readyApplications?.length || 0) > 0 ? "blue" : "neutral",
          },
        ]}
      />

      <MetricStrip
        items={[
          { label: "My active tasks", value: data.myTasksCount, href: "/employee/tasks?scope=mine" },
          { label: "Assigned candidates", value: data.myCandidatesCount, href: "/employee/candidates?scope=mine" },
          { label: "Active applications", value: data.activeApplicationsCount, href: "/employee/applications?scope=mine" },
          {
            label: "Due today / overdue",
            value: data.dueTodayTasksCount,
            href: "/employee/tasks?scope=mine&filter=due_today",
            accent: data.dueTodayTasksCount > 0,
          },
        ]}
      />

      {/* Primary Operational Workspace: MY WORK QUEUE */}
      <SectionPanel
        title="My work queue"
        description="Prioritized by SLA deadlines and operational dependencies"
        actionHref="/employee/tasks?scope=mine"
        actionLabel="Task board →"
        flush
      >
        {workItems.length === 0 ? (
          <div className="p-12 text-center text-[#64748B]">
            <div className="text-2xl mb-1 text-[#12A150]">✓</div>
            <h3 className="text-sm font-bold text-[#0F1720]">All caught up</h3>
            <p className="text-xs text-[#64748B] mt-0.5 max-w-sm mx-auto">
              No pending tasks or urgent application actions are assigned to you right now.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-2.5">
            {workItems.slice(0, 8).map((item, idx) => {
              const isTopItem = idx === 0;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-[14px] border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                    isTopItem
                      ? "border-[#12A150]/30 bg-[#12A150]/[0.04] hover:bg-[#12A150]/[0.07]"
                      : "border-[#E5EAE7] bg-white hover:bg-[#F7F9F8] hover:border-[#12A150]/30"
                  }`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          item.priority === "URGENT" || item.isOverdue
                            ? "bg-rose-50 text-rose-800 border border-rose-200"
                            : item.priority === "HIGH" || item.isDueToday
                            ? "bg-amber-50 text-amber-900 border border-amber-200"
                            : "bg-[#F7F9F8] text-[#64748B] border border-[#E5EAE7]"
                        }`}
                      >
                        {item.isOverdue ? "OVERDUE" : item.isDueToday ? "DUE TODAY" : item.priority}
                      </span>

                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          item.status === "READY"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : item.status === "IN_PROGRESS"
                            ? "bg-blue-50 text-blue-800 border border-blue-200"
                            : item.status === "BLOCKED" || item.status === "ESCALATED"
                            ? "bg-rose-50 text-rose-800 border border-rose-200"
                            : "bg-[#F7F9F8] text-[#64748B] border border-[#E5EAE7]"
                        }`}
                      >
                        {item.status.replace(/_/g, " ")}
                      </span>

                      {item.dueDateContext && (
                        <span
                          className={`text-[11px] font-medium ${
                            item.isOverdue ? "text-rose-700 font-semibold" : item.isDueToday ? "text-amber-800 font-semibold" : "text-[#64748B]"
                          }`}
                        >
                          ⏱ {item.dueDateContext}
                        </span>
                      )}
                    </div>

                    <h3 className="text-xs font-bold text-[#0F1720]">
                      <Link href={item.actionUrl} className="hover:text-[#12A150] transition">
                        {item.title}
                      </Link>
                    </h3>

                    <div className="flex items-center gap-2 text-[11px] text-[#64748B] flex-wrap">
                      {item.candidateName && (
                        <span>
                          Candidate:{" "}
                          {item.candidateId ? (
                            <Link href={`/employee/candidates/${item.candidateId}`} className="font-semibold text-[#0F1720] hover:underline">
                              {item.candidateName}
                            </Link>
                          ) : (
                            <strong className="text-[#0F1720] font-semibold">{item.candidateName}</strong>
                          )}
                        </span>
                      )}
                      {item.jobTitle && (
                        <>
                          <span>•</span>
                          <span>
                            Role: <strong className="text-[#0F1720] font-semibold">{item.jobTitle}</strong>
                            {item.companyName && ` @ ${item.companyName}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <Link
                      href={item.actionUrl}
                      className={`px-3.5 py-1.5 rounded-[11px] text-xs font-semibold shadow-2xs transition inline-flex items-center gap-1 ${
                        isTopItem
                          ? "bg-[#12A150] hover:bg-[#0E8541] text-white"
                          : "bg-[#0B3B2C] hover:bg-[#082D22] text-white"
                      }`}
                    >
                      {item.actionLabel}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionPanel>

      {/* 4. Two-Column Operational Surface: Ready for Submission & Dependencies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section: READY FOR EXTERNAL SUBMISSION */}
        <div className="bg-white rounded-[24px] border border-[#E5EAE7] shadow-[0_10px_40px_rgba(15,23,32,0.03)] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#E5EAE7] bg-[#FCFDFC] flex justify-between items-center">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#12A150]" />
                <h2 className="text-sm font-semibold tracking-[-0.02em] text-[#0F1720]">Ready for external submission</h2>
              </div>
              <p className="text-[11px] text-[#64748B] mt-0.5">
                Approved packages ready for manual external submission on employer portals.
              </p>
            </div>
            <Link
              href="/employee/applications?status=READY"
              className="text-xs font-semibold text-[#12A150] hover:text-[#0B3B2C] hover:underline shrink-0"
            >
              View All ({data.readyApplications.length}) →
            </Link>
          </div>

          <div className="divide-y divide-[#EDF1EF] flex-1">
            {data.readyApplications.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#64748B]">
                No applications currently waiting for external submission.
              </div>
            ) : (
              data.readyApplications.map((app) => {
                const candName =
                  [app.candidate.user.firstName, app.candidate.user.lastName].filter(Boolean).join(" ") ||
                  app.candidate.user.email;

                return (
                  <div key={app.id} className="p-4 hover:bg-[#12A150]/[0.035] transition flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/employee/candidates/${app.candidateId}`} className="font-semibold text-[#0F1720] hover:underline truncate">
                          {candName}
                        </Link>
                        <span className="text-[#94A3B8]">→</span>
                        <span className="text-[#0F1720] font-medium truncate">{app.job.title}</span>
                      </div>
                      <p className="text-[11px] text-[#64748B] truncate">
                        {app.job.companyName} {app.job.location && `• ${app.job.location}`}
                      </p>
                      <div className="text-[10px] text-[#64748B] flex items-center gap-2">
                        <span>QA: <strong className="text-[#12A150] font-semibold">Passed</strong></span>
                        <span>•</span>
                        <span>Mode: <strong className="text-[#0F1720]">{app.candidate.applicationAuthorizationMode}</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/employee/applications/${app.id}`}
                        className="px-3.5 py-1.5 rounded-[11px] bg-[#12A150] hover:bg-[#0E8541] text-white text-xs font-semibold shadow-2xs transition"
                      >
                        Submit →
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Section: WAITING ON (Dependency Tracking) */}
        <div className="bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#E5EAE7] bg-[#F7F9F8] flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold text-[#0F1720] uppercase tracking-wider">Dependencies & Attention Items</h2>
              <p className="text-[11px] text-[#64748B] mt-0.5">
                Work waiting on candidate authorization, QA decisions, or blocker resolutions.
              </p>
            </div>
          </div>

          <div className="divide-y divide-[#EDF1EF] flex-1">
            {data.awaitingApprovalApps.length === 0 && data.waitingOrBlockedTasks.length === 0 && data.qaReviewApps.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#64748B]">
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
                    <div key={`wait-cand-${app.id}`} className="p-4 hover:bg-[#12A150]/[0.035] transition flex items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 font-bold text-[10px] uppercase">
                            Candidate Sign-off
                          </span>
                          <span className="font-semibold text-[#0F1720] truncate">{candName}</span>
                        </div>
                        <p className="text-[#64748B] text-[11px] truncate">
                          Application for <strong>{app.job.title}</strong> at {app.job.companyName}
                        </p>
                      </div>
                      <Link
                        href={`/employee/applications/${app.id}`}
                        className="text-xs font-semibold text-[#12A150] hover:text-[#0B3B2C] hover:underline shrink-0"
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
                    <div key={`wait-qa-${app.id}`} className="p-4 hover:bg-[#12A150]/[0.035] transition flex items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-900 border border-purple-200 font-bold text-[10px] uppercase">
                            QA Decision
                          </span>
                          <span className="font-semibold text-[#0F1720] truncate">{app.job.title}</span>
                        </div>
                        <p className="text-[#64748B] text-[11px] truncate">
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
                  <div key={`wait-task-${t.id}`} className="p-4 hover:bg-[#12A150]/[0.035] transition flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-bold text-[10px] uppercase">
                          {t.status}
                        </span>
                        <span className="font-semibold text-[#0F1720] truncate">{t.title}</span>
                      </div>
                      <p className="text-[#64748B] text-[11px] truncate">
                        {t.blockedReason || t.waitingReason || t.escalationReason || "Awaiting resolution"}
                      </p>
                    </div>
                    <Link
                      href={`/employee/tasks/${t.id}`}
                      className="text-xs font-semibold text-[#12A150] hover:text-[#0B3B2C] hover:underline shrink-0"
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

      {/* 5. Authoritative Operational Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TelemetryGauge
          displayValue={`${data.dueTodayTasksCount} Due Today`}
          title="SLA Execution Status"
          subtitle="Real-time monitoring of tasks due today and overdue items across your worklist."
          category="Operational SLA"
          color={data.dueTodayTasksCount > 0 ? "amber" : "blue"}
          metrics={[
            { label: "Overdue / Due Today", value: `${data.dueTodayTasksCount} tasks` },
            { label: "Total Assigned Tasks", value: `${data.myTasksCount} active` },
          ]}
        />

        <TelemetryGauge
          displayValue={`${data.readyApplications.length} Ready`}
          title="Submission Readiness"
          subtitle="Packages with complete tailored materials and passed QA sign-off staged for application."
          category="Pipeline Staging"
          color="emerald"
          metrics={[
            { label: "Ready to Submit", value: `${data.readyApplications.length} packages` },
            { label: "Assigned Candidates", value: `${data.myCandidatesCount} active` },
          ]}
        />

        <TelemetryGauge
          displayValue={`${data.myRecentSubmissions.length} Submitted`}
          title="Submission Throughput"
          subtitle="Audit-recorded external portal submissions executed by you."
          category="Audit History"
          color="indigo"
          metrics={[
            { label: "Recent Submissions", value: `${data.myRecentSubmissions.length} recorded` },
            { label: "Active Applications", value: `${data.activeApplicationsCount} in queue` },
          ]}
        />
      </div>

      {/* 6. Operational History: Recent Submissions Recorded by You */}
      <div className="bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5EAE7] bg-[#F7F9F8] flex justify-between items-center">
          <div>
            <h2 className="text-xs font-bold text-[#0F1720] uppercase tracking-wider">My Recorded External Submissions</h2>
            <p className="text-[11px] text-[#64748B] mt-0.5">Authoritative audit log of external job portal submissions recorded by you.</p>
          </div>
          <Link href="/employee/applications?status=SUBMITTED" className="text-xs font-semibold text-[#12A150] hover:underline">
            All Submitted Applications →
          </Link>
        </div>

        <div className="divide-y divide-[#EDF1EF]">
          {data.myRecentSubmissions.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#64748B]">
              No external submissions recorded by you yet.
            </div>
          ) : (
            data.myRecentSubmissions.map((sub) => {
              const candName =
                [sub.application.candidate.user.firstName, sub.application.candidate.user.lastName].filter(Boolean).join(" ") ||
                sub.application.candidate.user.email;

              return (
                <div key={sub.id} className="p-4 hover:bg-[#12A150]/[0.035] transition flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#0F1720]">{sub.application.job.companyName}</span>
                      <span className="text-[#94A3B8]">·</span>
                      <span className="text-[#0F1720] font-medium">{sub.application.job.title}</span>
                    </div>
                    <div className="text-[#64748B] flex items-center gap-2 text-[11px] flex-wrap">
                      <span>Candidate: <strong className="text-[#0F1720]">{candName}</strong></span>
                      <span>•</span>
                      <span>Attempt #{sub.attemptNumber}</span>
                      <span>•</span>
                      <span>Submitted at {new Date(sub.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on {new Date(sub.submittedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {sub.externalReference && (
                      <span className="font-mono text-[11px] bg-[#F7F9F8] px-2.5 py-0.5 rounded-full border border-[#E5EAE7] text-[#64748B]">
                        Ref: {sub.externalReference}
                      </span>
                    )}
                    <Link
                      href={`/employee/applications/${sub.application.id}`}
                      className="text-xs font-semibold text-[#12A150] hover:underline"
                    >
                      View Record →
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
