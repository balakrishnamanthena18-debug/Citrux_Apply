import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import Link from "next/link";
import { Role, MembershipStatus, ApplicationStatus, TaskStatus } from "@/generated/prisma";

export default async function AdminDashboardPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const dashboardData = await withRlsContext(ctx.userId, async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: ctx.organizationId },
    });

    // Primary Metrics
    const activeCandidatesCount = await tx.candidate.count({
      where: { organizationId: ctx.organizationId, status: "ACTIVE" },
    });
    const activeApplicationsCount = await tx.application.count({
      where: {
        organizationId: ctx.organizationId,
        status: {
          notIn: [
            ApplicationStatus.SUBMITTED,
            ApplicationStatus.WITHDRAWN,
            ApplicationStatus.REJECTED,
            ApplicationStatus.FAILED,
          ],
        },
      },
    });
    const submittedApplicationsCount = await tx.application.count({
      where: {
        organizationId: ctx.organizationId,
        status: ApplicationStatus.SUBMITTED,
      },
    });
    const activeEmployeesCount = await tx.membership.count({
      where: {
        organizationId: ctx.organizationId,
        role: { in: [Role.ADMIN, Role.EMPLOYEE] },
        status: MembershipStatus.ACTIVE,
      },
    });

    // Needs Attention
    const awaitingCandidateCount = await tx.application.count({
      where: {
        organizationId: ctx.organizationId,
        status: {
          in: [
            ApplicationStatus.AWAITING_APPROVAL,
            ApplicationStatus.REVIEW_REQUIRED,
          ],
        },
      },
    });
    const escalatedTasksCount = await tx.task.count({
      where: {
        organizationId: ctx.organizationId,
        status: TaskStatus.ESCALATED,
      },
    });
    const qaReviewTasksCount = await tx.task.count({
      where: {
        organizationId: ctx.organizationId,
        status: {
          in: [TaskStatus.READY_FOR_REVIEW, TaskStatus.QA],
        },
      },
    });
    const submissionIssuesCount = await tx.application.count({
      where: {
        organizationId: ctx.organizationId,
        status: ApplicationStatus.SUBMISSION_ISSUE,
      },
    });
    const blockedTasksCount = await tx.task.count({
      where: {
        organizationId: ctx.organizationId,
        status: TaskStatus.BLOCKED,
      },
    });

    // Application Operations Breakdown
    const totalApplicationsCount = await tx.application.count({
      where: { organizationId: ctx.organizationId },
    });
    const readyApplicationsCount = await tx.application.count({
      where: {
        organizationId: ctx.organizationId,
        status: ApplicationStatus.READY,
      },
    });
    const inProgressApplicationsCount = await tx.application.count({
      where: {
        organizationId: ctx.organizationId,
        status: {
          in: [
            ApplicationStatus.DISCOVERED,
            ApplicationStatus.QUALIFIED,
            ApplicationStatus.PREPARING,
            ApplicationStatus.REVIEW,
          ],
        },
      },
    });

    // Funnel
    const totalCandidatesCount = await tx.candidate.count({
      where: { organizationId: ctx.organizationId },
    });
    const openJobsCount = await tx.job.count({
      where: { organizationId: ctx.organizationId, status: "OPEN" },
    });
    const preparedApplicationsCount = await tx.application.count({
      where: {
        organizationId: ctx.organizationId,
        status: {
          in: [ApplicationStatus.READY, ApplicationStatus.SUBMITTED],
        },
      },
    });

    // Staff for Workload
    const activeStaffMembers = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: [Role.ADMIN, Role.EMPLOYEE] },
        status: MembershipStatus.ACTIVE,
      },
      include: {
        user: true,
        designation: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Tasks for workload mapping
    const allTasks = await tx.task.findMany({
      where: {
        organizationId: ctx.organizationId,
        assignedEmployeeId: { not: null },
      },
      select: {
        assignedEmployeeId: true,
        status: true,
      },
    });

    // Applications for workload mapping
    const allApplications = await tx.application.findMany({
      where: {
        organizationId: ctx.organizationId,
        assignedEmployeeId: { not: null },
        status: {
          notIn: [
            ApplicationStatus.SUBMITTED,
            ApplicationStatus.WITHDRAWN,
            ApplicationStatus.REJECTED,
            ApplicationStatus.FAILED,
          ],
        },
      },
      select: {
        assignedEmployeeId: true,
      },
    });

    // Recent Audit Activity
    const recentAuditEvents = await tx.auditEvent.findMany({
      where: { organizationId: ctx.organizationId },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 7,
    });

    // Calculate per-employee workload
    const staffWorkload = activeStaffMembers.map((staff) => {
      const activeTasks = allTasks.filter(
        (t) =>
          t.assignedEmployeeId === staff.userId &&
          t.status !== TaskStatus.COMPLETED &&
          t.status !== TaskStatus.CANCELED
      ).length;

      const completedTasks = allTasks.filter(
        (t) =>
          t.assignedEmployeeId === staff.userId &&
          t.status === TaskStatus.COMPLETED
      ).length;

      const activeApps = allApplications.filter(
        (a) => a.assignedEmployeeId === staff.userId
      ).length;

      const totalActiveWork = activeTasks + activeApps;

      const name = `${staff.user.firstName ?? ""} ${staff.user.lastName ?? ""}`.trim() || staff.user.email;
      const initials = name
        .split(" ")
        .map((s) => s[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() || "E";

      return {
        id: staff.id,
        userId: staff.userId,
        name,
        email: staff.user.email,
        initials,
        role: staff.role,
        designation: staff.designation?.name || "Not assigned",
        activeTasks,
        activeApps,
        totalActiveWork,
        completedTasks,
      };
    });

    return {
      organizationName: org?.name || "CitrUX Operations",
      primaryMetrics: {
        activeCandidates: activeCandidatesCount,
        activeApplications: activeApplicationsCount,
        submittedApplications: submittedApplicationsCount,
        activeEmployees: activeEmployeesCount,
      },
      attentionItems: [
        {
          label: "Awaiting Candidate",
          count: awaitingCandidateCount,
          href: "/admin/applications",
          badgeType: awaitingCandidateCount > 0 ? "amber" : "neutral",
          description: "Applications pending candidate approval or review",
        },
        {
          label: "Escalations",
          count: escalatedTasksCount,
          href: "/admin/tasks/escalations",
          badgeType: escalatedTasksCount > 0 ? "red" : "neutral",
          description: "Tasks blocked and escalated for administrative triage",
        },
        {
          label: "Review / QA Required",
          count: qaReviewTasksCount,
          href: "/employee/tasks",
          badgeType: qaReviewTasksCount > 0 ? "blue" : "neutral",
          description: "Tasks awaiting double-verification QA sign-off",
        },
        {
          label: "Submission Issues",
          count: submissionIssuesCount,
          href: "/admin/applications",
          badgeType: submissionIssuesCount > 0 ? "red" : "neutral",
          description: "Applications flagged with portal/submission errors",
        },
        {
          label: "Blocked Tasks",
          count: blockedTasksCount,
          href: "/employee/tasks",
          badgeType: blockedTasksCount > 0 ? "amber" : "neutral",
          description: "Operational tasks currently blocked by dependencies",
        },
      ],
      appSummary: {
        total: totalApplicationsCount,
        ready: readyApplicationsCount,
        inProgress: inProgressApplicationsCount,
        submitted: submittedApplicationsCount,
        awaitingCandidate: awaitingCandidateCount,
        submissionIssues: submissionIssuesCount,
      },
      funnel: {
        candidates: totalCandidatesCount,
        jobs: openJobsCount,
        applications: totalApplicationsCount,
        prepared: preparedApplicationsCount,
        submitted: submittedApplicationsCount,
      },
      staffWorkload,
      recentActivity: recentAuditEvents.map((evt) => {
        let actionLabel = evt.action.replace(/_/g, " ").toLowerCase();
        actionLabel = actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1);

        const actorName = evt.actor
          ? `${evt.actor.firstName ?? ""} ${evt.actor.lastName ?? ""}`.trim() || evt.actor.email
          : evt.actorType;

        return {
          id: evt.id,
          action: evt.action,
          actionLabel,
          actor: actorName,
          entityType: evt.entityType,
          entityId: evt.entityId,
          createdAt: evt.createdAt,
        };
      }),
    };
  });

  const currentDate = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalAttentionItems = dashboardData.attentionItems.reduce(
    (acc, curr) => acc + curr.count,
    0
  );

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Admin Command Center
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 font-medium">
            Executive operations, organizational throughput signals, team workload distribution, and audit telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white text-slate-700 border border-slate-200 shadow-2xs">
            {currentDate}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-900 text-white shadow-2xs">
            {dashboardData.organizationName}
          </span>
        </div>
      </div>

      {/* 2. Primary Metrics Strip */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
          <div className="p-4">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              Active Candidates
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {dashboardData.primaryMetrics.activeCandidates}
            </div>
          </div>
          <div className="p-4">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              Active Applications
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {dashboardData.primaryMetrics.activeApplications}
            </div>
          </div>
          <div className="p-4">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              Submitted Applications
            </div>
            <div className="mt-1 text-2xl font-semibold text-emerald-700">
              {dashboardData.primaryMetrics.submittedApplications}
            </div>
          </div>
          <div className="p-4">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              Active Employees
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {dashboardData.primaryMetrics.activeEmployees}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Middle Row: Needs Attention + Application Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Needs Attention Panel (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/75 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Needs Attention
                </span>
                {totalAttentionItems > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    {totalAttentionItems}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Operational Action</span>
            </div>

            <div className="divide-y divide-slate-100">
              {dashboardData.attentionItems.map((item) => (
                <div
                  key={item.label}
                  className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex items-center justify-center min-w-5 px-1.5 py-0.5 rounded text-xs font-bold ${
                          item.count > 0 && item.badgeType === "red"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : item.count > 0 && item.badgeType === "amber"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : item.count > 0 && item.badgeType === "blue"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {item.count}
                      </span>
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {item.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5 pl-7">
                      {item.description}
                    </div>
                  </div>

                  <Link
                    href={item.href}
                    className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline flex-shrink-0"
                  >
                    View →
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 border-t border-slate-100 bg-slate-50/40 text-center">
            <span className="text-[11px] text-slate-500 font-medium">
              {totalAttentionItems === 0
                ? "No operational attention items. All systems progressing normally."
                : `${totalAttentionItems} action items requiring administrative or desk review.`}
            </span>
          </div>
        </div>

        {/* Application Operations Summary (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/75 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Application Operations
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Authoritative State Machine</span>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-md bg-slate-50/70 border border-slate-200/80">
                  <div className="text-[11px] font-medium text-slate-500">Total Pipeline</div>
                  <div className="text-xl font-bold text-slate-900 mt-0.5">
                    {dashboardData.appSummary.total}
                  </div>
                </div>

                <div className="p-3 rounded-md bg-slate-50/70 border border-slate-200/80">
                  <div className="text-[11px] font-medium text-slate-500">In Progress</div>
                  <div className="text-xl font-bold text-slate-900 mt-0.5">
                    {dashboardData.appSummary.inProgress}
                  </div>
                </div>

                <div className="p-3 rounded-md bg-slate-50/70 border border-slate-200/80">
                  <div className="text-[11px] font-medium text-emerald-700">Ready to Apply</div>
                  <div className="text-xl font-bold text-emerald-700 mt-0.5">
                    {dashboardData.appSummary.ready}
                  </div>
                </div>

                <div className="p-3 rounded-md bg-slate-50/70 border border-slate-200/80">
                  <div className="text-[11px] font-medium text-blue-700">Submitted</div>
                  <div className="text-xl font-bold text-blue-700 mt-0.5">
                    {dashboardData.appSummary.submitted}
                  </div>
                </div>

                <div className="p-3 rounded-md bg-slate-50/70 border border-slate-200/80">
                  <div className="text-[11px] font-medium text-amber-700">Awaiting Candidate</div>
                  <div className="text-xl font-bold text-amber-700 mt-0.5">
                    {dashboardData.appSummary.awaitingCandidate}
                  </div>
                </div>

                <div className="p-3 rounded-md bg-slate-50/70 border border-slate-200/80">
                  <div className="text-[11px] font-medium text-red-700">Submission Issues</div>
                  <div className="text-xl font-bold text-red-700 mt-0.5">
                    {dashboardData.appSummary.submissionIssues}
                  </div>
                </div>
              </div>

              {/* Restrained Funnel */}
              <div className="pt-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Operational Throughput Funnel
                </div>
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-medium truncate">Candidates</div>
                    <div className="font-bold text-slate-900 mt-0.5">{dashboardData.funnel.candidates}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-medium truncate">Open Jobs</div>
                    <div className="font-bold text-slate-900 mt-0.5">{dashboardData.funnel.jobs}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-medium truncate">Applications</div>
                    <div className="font-bold text-slate-900 mt-0.5">{dashboardData.funnel.applications}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-medium truncate">Prepared</div>
                    <div className="font-bold text-slate-900 mt-0.5">{dashboardData.funnel.prepared}</div>
                  </div>
                  <div className="p-2 rounded bg-emerald-50 border border-emerald-200">
                    <div className="text-[10px] text-emerald-800 font-medium truncate">Submitted</div>
                    <div className="font-bold text-emerald-800 mt-0.5">{dashboardData.funnel.submitted}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex justify-end">
            <Link
              href="/admin/applications"
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
            >
              View Application Operations →
            </Link>
          </div>
        </div>
      </div>

      {/* 4. Bottom Row: Team Workload + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Team Workload Table (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/75 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Team Workload ({dashboardData.staffWorkload.length})
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Active Assignments</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs">
                <thead className="bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 text-left">Employee</th>
                    <th scope="col" className="px-5 py-2.5 text-left">Role & Title</th>
                    <th scope="col" className="px-5 py-2.5 text-center">Active Work</th>
                    <th scope="col" className="px-5 py-2.5 text-right">Completed Tasks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboardData.staffWorkload.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-slate-400 italic">
                        Workload data will appear as operational assignments are recorded.
                      </td>
                    </tr>
                  ) : (
                    dashboardData.staffWorkload.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                              {member.initials}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/admin/members/${member.id}`}
                                className="font-semibold text-slate-900 hover:text-blue-600 transition-colors truncate block"
                              >
                                {member.name}
                              </Link>
                              <div className="text-[10px] text-slate-400 font-mono truncate">
                                {member.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="text-slate-800 font-medium">{member.designation}</div>
                          <span
                            className={`inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                              member.role === "ADMIN"
                                ? "bg-purple-50 text-purple-700 border border-purple-200/60"
                                : "bg-blue-50 text-blue-700 border border-blue-200/60"
                            }`}
                          >
                            {member.role}
                          </span>
                        </td>

                        <td className="px-5 py-3 whitespace-nowrap text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                              member.totalActiveWork > 0
                                ? "bg-blue-50 text-blue-700 border border-blue-200/60"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {member.totalActiveWork} items
                          </span>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {member.activeTasks} tasks • {member.activeApps} apps
                          </div>
                        </td>

                        <td className="px-5 py-3 whitespace-nowrap text-right font-mono font-semibold text-slate-700">
                          {member.completedTasks}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex justify-end">
            <Link
              href="/admin/members"
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
            >
              Manage Staff Roster →
            </Link>
          </div>
        </div>

        {/* Recent Operational Activity Feed (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/75 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Recent Activity
              </span>
              <span className="text-[11px] text-slate-400 font-medium">Immutable Telemetry</span>
            </div>

            <div className="divide-y divide-slate-100">
              {dashboardData.recentActivity.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 italic">
                  No recent operational activity.
                </div>
              ) : (
                dashboardData.recentActivity.map((evt) => (
                  <div key={evt.id} className="p-3.5 text-xs hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 truncate">
                        {evt.actionLabel}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono flex-shrink-0 ml-2">
                        {new Date(evt.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                      <span className="truncate">Actor: {evt.actor}</span>
                      {evt.entityType && (
                        <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 text-slate-600 flex-shrink-0 ml-2">
                          {evt.entityType}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex justify-end">
            <Link
              href="/admin/audit"
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
            >
              View Complete Audit Trail →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
