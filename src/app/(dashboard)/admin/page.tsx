import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import Link from "next/link";
import { Role, MembershipStatus, ApplicationStatus, TaskStatus } from "@/generated/prisma";

export default async function AdminDashboardPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const dashboardData = await withRlsContext(ctx.userId, async (tx) => {
    const [
      org,
      activeCandidatesCount,
      activeApplicationsCount,
      submittedApplicationsCount,
      activeEmployeesCount,
      awaitingCandidateCount,
      escalatedTasksCount,
      qaReviewTasksCount,
      submissionIssuesCount,
      blockedTasksCount,
      totalApplicationsCount,
      readyApplicationsCount,
      inProgressApplicationsCount,
      totalCandidatesCount,
      openJobsCount,
      preparedApplicationsCount,
      activeStaffMembers,
      allTasks,
      allApplications,
      recentAuditEvents,
    ] = await Promise.all([
      tx.organization.findUnique({
        where: { id: ctx.organizationId },
      }),
      // Primary Metrics
      tx.candidate.count({
        where: { organizationId: ctx.organizationId, status: "ACTIVE" },
      }),
      tx.application.count({
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
      }),
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          status: ApplicationStatus.SUBMITTED,
        },
      }),
      tx.membership.count({
        where: {
          organizationId: ctx.organizationId,
          role: { in: [Role.ADMIN, Role.EMPLOYEE] },
          status: MembershipStatus.ACTIVE,
        },
      }),
      // Needs Attention
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          status: {
            in: [
              ApplicationStatus.AWAITING_APPROVAL,
              ApplicationStatus.REVIEW_REQUIRED,
            ],
          },
        },
      }),
      tx.task.count({
        where: {
          organizationId: ctx.organizationId,
          status: TaskStatus.ESCALATED,
        },
      }),
      tx.task.count({
        where: {
          organizationId: ctx.organizationId,
          status: {
            in: [TaskStatus.READY_FOR_REVIEW, TaskStatus.QA],
          },
        },
      }),
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          status: ApplicationStatus.SUBMISSION_ISSUE,
        },
      }),
      tx.task.count({
        where: {
          organizationId: ctx.organizationId,
          status: TaskStatus.BLOCKED,
        },
      }),
      // Application Operations Breakdown
      tx.application.count({
        where: { organizationId: ctx.organizationId },
      }),
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          status: ApplicationStatus.READY,
        },
      }),
      tx.application.count({
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
      }),
      // Funnel
      tx.candidate.count({
        where: { organizationId: ctx.organizationId },
      }),
      tx.job.count({
        where: { organizationId: ctx.organizationId, status: "OPEN" },
      }),
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          status: {
            in: [ApplicationStatus.READY, ApplicationStatus.SUBMITTED],
          },
        },
      }),
      // Staff for Workload
      tx.membership.findMany({
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
      }),
      // Tasks for workload mapping
      tx.task.findMany({
        where: {
          organizationId: ctx.organizationId,
          assignedEmployeeId: { not: null },
        },
        select: {
          assignedEmployeeId: true,
          status: true,
        },
      }),
      // Applications for workload mapping
      tx.application.findMany({
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
      }),
      // Recent Audit Activity
      tx.auditEvent.findMany({
        where: { organizationId: ctx.organizationId },
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 7,
      }),
    ]);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5EAE7] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#12A150] animate-pulse" />
            <h1 className="text-xl font-bold text-[#0F1720] tracking-tight">
              Admin Command Center
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-[#64748B] font-medium">
            Executive operations, organizational throughput signals, team workload distribution, and audit telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white text-[#64748B] border border-[#E5EAE7] shadow-2xs">
            {currentDate}
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#0B3B2C] text-white shadow-2xs">
            {dashboardData.organizationName}
          </span>
        </div>
      </div>

      {/* 2. Primary Metrics Strip */}
      <div className="bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E5EAE7]">
          <div className="p-5">
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
              Active Candidates
            </div>
            <div className="mt-2 text-2xl font-bold text-[#0F1720] tracking-tight">
              {dashboardData.primaryMetrics.activeCandidates.toLocaleString()}
            </div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
              Active Applications
            </div>
            <div className="mt-2 text-2xl font-bold text-[#0F1720] tracking-tight">
              {dashboardData.primaryMetrics.activeApplications.toLocaleString()}
            </div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-semibold text-[#12A150] uppercase tracking-wider">
              Submitted Applications
            </div>
            <div className="mt-2 text-2xl font-bold text-[#12A150] tracking-tight">
              {dashboardData.primaryMetrics.submittedApplications.toLocaleString()}
            </div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
              Active Employees
            </div>
            <div className="mt-2 text-2xl font-bold text-[#0F1720] tracking-tight">
              {dashboardData.primaryMetrics.activeEmployees.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Middle Row: Needs Attention + Application Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Needs Attention Panel (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-[#E5EAE7] bg-[#F7F9F8] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-[#0F1720] uppercase tracking-wider">
                  Needs Attention
                </span>
                {totalAttentionItems > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    {totalAttentionItems}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[#94A3B8] font-medium">Operational Action</span>
            </div>

            <div className="divide-y divide-[#EDF1EF]">
              {dashboardData.attentionItems.map((item) => (
                <div
                  key={item.label}
                  className="px-5 py-3.5 flex items-center justify-between hover:bg-[#12A150]/[0.035] transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex items-center justify-center min-w-5 px-2 py-0.5 rounded-full text-xs font-bold ${
                          item.count > 0 && item.badgeType === "red"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : item.count > 0 && item.badgeType === "amber"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : item.count > 0 && item.badgeType === "blue"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-[#F7F9F8] text-[#64748B] border border-[#E5EAE7]"
                        }`}
                      >
                        {item.count}
                      </span>
                      <span className="text-xs font-semibold text-[#0F1720] truncate">
                        {item.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#64748B] truncate mt-0.5 pl-7">
                      {item.description}
                    </div>
                  </div>

                  <Link
                    href={item.href}
                    className="inline-flex items-center text-xs font-semibold text-[#12A150] hover:text-[#0B3B2C] hover:underline flex-shrink-0"
                  >
                    View →
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3.5 border-t border-[#EDF1EF] bg-[#F7F9F8] text-center">
            <span className="text-[11px] text-[#64748B] font-medium">
              {totalAttentionItems === 0
                ? "No operational attention items. All systems progressing normally."
                : `${totalAttentionItems} action items requiring administrative or desk review.`}
            </span>
          </div>
        </div>

        {/* Application Operations Summary (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-[#E5EAE7] bg-[#F7F9F8] flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F1720] uppercase tracking-wider">
                Application Operations
              </span>
              <span className="text-[11px] text-[#94A3B8] font-medium">Authoritative State Machine</span>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-[14px] bg-[#F7F9F8] border border-[#E5EAE7]">
                  <div className="text-[11px] font-semibold text-[#64748B]">Total Pipeline</div>
                  <div className="text-xl font-bold text-[#0F1720] mt-1">
                    {dashboardData.appSummary.total}
                  </div>
                </div>

                <div className="p-3.5 rounded-[14px] bg-[#F7F9F8] border border-[#E5EAE7]">
                  <div className="text-[11px] font-semibold text-[#64748B]">In Progress</div>
                  <div className="text-xl font-bold text-[#0F1720] mt-1">
                    {dashboardData.appSummary.inProgress}
                  </div>
                </div>

                <div className="p-3.5 rounded-[14px] bg-[#12A150]/[0.05] border border-[#12A150]/20">
                  <div className="text-[11px] font-semibold text-[#12A150]">Ready to Apply</div>
                  <div className="text-xl font-bold text-[#12A150] mt-1">
                    {dashboardData.appSummary.ready}
                  </div>
                </div>

                <div className="p-3.5 rounded-[14px] bg-blue-50/50 border border-blue-200/60">
                  <div className="text-[11px] font-semibold text-blue-700">Submitted</div>
                  <div className="text-xl font-bold text-blue-700 mt-1">
                    {dashboardData.appSummary.submitted}
                  </div>
                </div>

                <div className="p-3.5 rounded-[14px] bg-amber-50/50 border border-amber-200/60">
                  <div className="text-[11px] font-semibold text-amber-700">Awaiting Candidate</div>
                  <div className="text-xl font-bold text-amber-700 mt-1">
                    {dashboardData.appSummary.awaitingCandidate}
                  </div>
                </div>

                <div className="p-3.5 rounded-[14px] bg-rose-50/50 border border-rose-200/60">
                  <div className="text-[11px] font-semibold text-rose-700">Submission Issues</div>
                  <div className="text-xl font-bold text-rose-700 mt-1">
                    {dashboardData.appSummary.submissionIssues}
                  </div>
                </div>
              </div>

              {/* Restrained Funnel */}
              <div className="pt-2">
                <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">
                  Operational Throughput Funnel
                </div>
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-[12px] bg-[#F7F9F8] border border-[#E5EAE7]">
                    <div className="text-[10px] text-[#64748B] font-medium truncate">Candidates</div>
                    <div className="font-bold text-[#0F1720] mt-0.5">{dashboardData.funnel.candidates}</div>
                  </div>
                  <div className="p-2.5 rounded-[12px] bg-[#F7F9F8] border border-[#E5EAE7]">
                    <div className="text-[10px] text-[#64748B] font-medium truncate">Open Jobs</div>
                    <div className="font-bold text-[#0F1720] mt-0.5">{dashboardData.funnel.jobs}</div>
                  </div>
                  <div className="p-2.5 rounded-[12px] bg-[#F7F9F8] border border-[#E5EAE7]">
                    <div className="text-[10px] text-[#64748B] font-medium truncate">Applications</div>
                    <div className="font-bold text-[#0F1720] mt-0.5">{dashboardData.funnel.applications}</div>
                  </div>
                  <div className="p-2.5 rounded-[12px] bg-[#F7F9F8] border border-[#E5EAE7]">
                    <div className="text-[10px] text-[#64748B] font-medium truncate">Prepared</div>
                    <div className="font-bold text-[#0F1720] mt-0.5">{dashboardData.funnel.prepared}</div>
                  </div>
                  <div className="p-2.5 rounded-[12px] bg-[#12A150]/[0.08] border border-[#12A150]/30">
                    <div className="text-[10px] text-[#12A150] font-semibold truncate">Submitted</div>
                    <div className="font-bold text-[#0B3B2C] mt-0.5">{dashboardData.funnel.submitted}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-[#EDF1EF] bg-[#F7F9F8] flex justify-end">
            <Link
              href="/admin/applications"
              className="inline-flex items-center px-3.5 py-1.5 rounded-[10px] text-xs font-semibold text-[#0F1720] bg-white border border-[#E5EAE7] hover:bg-[#F7F9F8] hover:border-[#12A150]/30 shadow-2xs transition-colors"
            >
              View Application Operations →
            </Link>
          </div>
        </div>
      </div>

      {/* 4. Bottom Row: Team Workload + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Team Workload Table (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-[#E5EAE7] bg-[#F7F9F8] flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F1720] uppercase tracking-wider">
                Team Workload ({dashboardData.staffWorkload.length})
              </span>
              <span className="text-[11px] text-[#94A3B8] font-medium">Active Assignments</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#EDF1EF] text-xs">
                <thead className="bg-[#F7F9F8] text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left">Employee</th>
                    <th scope="col" className="px-5 py-3 text-left">Role & Title</th>
                    <th scope="col" className="px-5 py-3 text-center">Active Work</th>
                    <th scope="col" className="px-5 py-3 text-right">Completed Tasks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF1EF]">
                  {dashboardData.staffWorkload.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-[#94A3B8] italic">
                        Workload data will appear as operational assignments are recorded.
                      </td>
                    </tr>
                  ) : (
                    dashboardData.staffWorkload.map((member) => (
                      <tr key={member.id} className="hover:bg-[#12A150]/[0.035] transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#0B3B2C] text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 shadow-2xs">
                              {member.initials}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/admin/members/${member.id}`}
                                className="font-semibold text-[#0F1720] hover:text-[#12A150] transition-colors truncate block"
                              >
                                {member.name}
                              </Link>
                              <div className="text-[10px] text-[#64748B] font-mono truncate">
                                {member.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="text-[#0F1720] font-medium">{member.designation}</div>
                          <span
                            className={`inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              member.role === "ADMIN"
                                ? "bg-purple-50 text-purple-700 border border-purple-200/60"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                            }`}
                          >
                            {member.role}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 whitespace-nowrap text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              member.totalActiveWork > 0
                                ? "bg-[#12A150]/[0.08] text-[#0B3B2C] border border-[#12A150]/20"
                                : "bg-[#F7F9F8] text-[#64748B] border border-[#E5EAE7]"
                            }`}
                          >
                            {member.totalActiveWork} items
                          </span>
                          <div className="text-[10px] text-[#94A3B8] mt-0.5">
                            {member.activeTasks} tasks • {member.activeApps} apps
                          </div>
                        </td>

                        <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono font-semibold text-[#0F1720]">
                          {member.completedTasks}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-[#EDF1EF] bg-[#F7F9F8] flex justify-end">
            <Link
              href="/admin/members"
              className="inline-flex items-center px-3.5 py-1.5 rounded-[10px] text-xs font-semibold text-[#0F1720] bg-white border border-[#E5EAE7] hover:bg-[#F7F9F8] hover:border-[#12A150]/30 shadow-2xs transition-colors"
            >
              Manage Staff Roster →
            </Link>
          </div>
        </div>

        {/* Recent Operational Activity Feed (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-[#E5EAE7] bg-[#F7F9F8] flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F1720] uppercase tracking-wider">
                Recent Activity
              </span>
              <span className="text-[11px] text-[#94A3B8] font-medium">Immutable Telemetry</span>
            </div>

            <div className="divide-y divide-[#EDF1EF]">
              {dashboardData.recentActivity.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#94A3B8] italic">
                  No recent operational activity.
                </div>
              ) : (
                dashboardData.recentActivity.map((evt) => (
                  <div key={evt.id} className="p-3.5 text-xs hover:bg-[#12A150]/[0.035] transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#0F1720] truncate">
                        {evt.actionLabel}
                      </span>
                      <span className="text-[10px] text-[#94A3B8] font-mono flex-shrink-0 ml-2">
                        {new Date(evt.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-[#64748B]">
                      <span className="truncate">Actor: {evt.actor}</span>
                      {evt.entityType && (
                        <span className="font-mono text-[10px] bg-[#F7F9F8] px-2 py-0.5 rounded-full border border-[#E5EAE7] text-[#64748B] flex-shrink-0 ml-2">
                          {evt.entityType}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-[#EDF1EF] bg-[#F7F9F8] flex justify-end">
            <Link
              href="/admin/audit"
              className="inline-flex items-center px-3.5 py-1.5 rounded-[10px] text-xs font-semibold text-[#0F1720] bg-white border border-[#E5EAE7] hover:bg-[#F7F9F8] hover:border-[#12A150]/30 shadow-2xs transition-colors"
            >
              View Complete Audit Trail →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
