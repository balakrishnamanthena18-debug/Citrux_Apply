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
        take: 200,
      }),
      tx.task.findMany({
        where: {
          organizationId: ctx.organizationId,
          assignedEmployeeId: { not: null },
        },
        select: {
          assignedEmployeeId: true,
          status: true,
        },
        take: 2000,
        orderBy: { updatedAt: "desc" },
      }),
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
        take: 2000,
        orderBy: { updatedAt: "desc" },
      }),
      tx.auditEvent.findMany({
        where: { organizationId: ctx.organizationId },
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 7,
      }),
    ]);

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

      const name =
        `${staff.user.firstName ?? ""} ${staff.user.lastName ?? ""}`.trim() ||
        staff.user.email;
      const initials =
        name
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

    const attentionItems = [
      {
        label: "Awaiting Candidate",
        count: awaitingCandidateCount,
        href: "/employee/applications",
        tone: awaitingCandidateCount > 0 ? ("amber" as const) : ("neutral" as const),
        description: "Pending candidate approval or review",
      },
      {
        label: "Escalations",
        count: escalatedTasksCount,
        href: "/admin/tasks/escalations",
        tone: escalatedTasksCount > 0 ? ("rose" as const) : ("neutral" as const),
        description: "Blocked work needing admin triage",
      },
      {
        label: "Review / QA",
        count: qaReviewTasksCount,
        href: "/employee/tasks",
        tone: qaReviewTasksCount > 0 ? ("blue" as const) : ("neutral" as const),
        description: "Tasks awaiting verification sign-off",
      },
      {
        label: "Submission Issues",
        count: submissionIssuesCount,
        href: "/employee/applications",
        tone: submissionIssuesCount > 0 ? ("rose" as const) : ("neutral" as const),
        description: "Portal or submission errors",
      },
      {
        label: "Blocked Tasks",
        count: blockedTasksCount,
        href: "/employee/tasks",
        tone: blockedTasksCount > 0 ? ("amber" as const) : ("neutral" as const),
        description: "Work stalled on dependencies",
      },
    ].sort((a, b) => b.count - a.count);

    return {
      organizationName: org?.name || "CitrUX Operations",
      primaryMetrics: {
        activeCandidates: activeCandidatesCount,
        activeApplications: activeApplicationsCount,
        submittedApplications: submittedApplicationsCount,
        activeEmployees: activeEmployeesCount,
      },
      attentionItems,
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
      staffWorkload: [...staffWorkload].sort((a, b) => b.totalActiveWork - a.totalActiveWork),
      recentActivity: recentAuditEvents.map((evt) => {
        let actionLabel = evt.action.replace(/_/g, " ").toLowerCase();
        actionLabel = actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1);

        const actorName = evt.actor
          ? `${evt.actor.firstName ?? ""} ${evt.actor.lastName ?? ""}`.trim() ||
            evt.actor.email
          : evt.actorType;

        return {
          id: evt.id,
          actionLabel,
          actor: actorName,
          entityType: evt.entityType,
          createdAt: evt.createdAt,
        };
      }),
    };
  });

  const currentDate = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const totalAttention = dashboardData.attentionItems.reduce((acc, item) => acc + item.count, 0);
  const primaryAttention = dashboardData.attentionItems.find((item) => item.count > 0);
  const funnelMax = Math.max(
    dashboardData.funnel.candidates,
    dashboardData.funnel.jobs,
    dashboardData.funnel.applications,
    dashboardData.funnel.prepared,
    dashboardData.funnel.submitted,
    1
  );

  const toneClasses = {
    amber: "bg-amber-50 text-amber-900 border-amber-200/80",
    rose: "bg-rose-50 text-rose-800 border-rose-200/80",
    blue: "bg-sky-50 text-sky-800 border-sky-200/80",
    neutral: "bg-[#F7F9F8] text-[#64748B] border-[#E5EAE7]",
  } as const;

  return (
    <div className="space-y-10 pb-8">
      {/* Hero: one job — clear the queue */}
      <section className="relative overflow-hidden rounded-[28px] border border-[#DDE5E0] bg-[linear-gradient(145deg,#0B3B2C_0%,#0F4A37_48%,#126B45_100%)] text-white shadow-[0_24px_60px_rgba(11,59,44,0.18)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 18%, rgba(198,244,50,0.45), transparent 42%), radial-gradient(circle at 88% 12%, rgba(255,255,255,0.18), transparent 36%)",
          }}
        />
        <div className="relative px-6 py-7 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                <span>{dashboardData.organizationName}</span>
                <span className="text-white/25">·</span>
                <span>{currentDate}</span>
              </div>
              <h1 className="text-[2rem] sm:text-[2.35rem] font-semibold tracking-[-0.04em] leading-[1.05] text-balance">
                {totalAttention === 0
                  ? "Operations are clear."
                  : `${totalAttention} item${totalAttention === 1 ? "" : "s"} need your attention.`}
              </h1>
              <p className="text-sm sm:text-[15px] leading-relaxed text-white/70 max-w-xl">
                {totalAttention === 0
                  ? "No escalations, blocked work, or candidate waits. Keep momentum on applications and staffing."
                  : "Triage the queue first. Pipeline health and staffing stay below once the desk is clear."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {primaryAttention ? (
                <Link
                  href={primaryAttention.href}
                  className="inline-flex items-center gap-2 rounded-full bg-[#C6F432] px-5 py-2.5 text-sm font-semibold text-[#0B3B2C] shadow-[0_10px_30px_rgba(198,244,50,0.28)] transition hover:bg-[#d4f75a] active:scale-[0.98]"
                >
                  Resolve {primaryAttention.label}
                  <span aria-hidden>→</span>
                </Link>
              ) : (
                <Link
                  href="/employee/applications"
                  className="inline-flex items-center gap-2 rounded-full bg-[#C6F432] px-5 py-2.5 text-sm font-semibold text-[#0B3B2C] shadow-[0_10px_30px_rgba(198,244,50,0.28)] transition hover:bg-[#d4f75a] active:scale-[0.98]"
                >
                  Open applications
                  <span aria-hidden>→</span>
                </Link>
              )}
              <Link
                href="/admin/tasks/escalations"
                className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/10"
              >
                Escalations
              </Link>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-8 xl:grid-cols-5">
            {dashboardData.attentionItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`group rounded-[16px] border px-3 py-3 transition sm:rounded-[18px] sm:px-4 sm:py-3.5 ${
                  item.count > 0
                    ? "border-white/15 bg-white/[0.08] hover:bg-white/[0.14]"
                    : "border-white/8 bg-black/10 hover:bg-black/15"
                }`}
              >
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/45 sm:text-[11px]">
                      {item.label}
                    </div>
                    <div className="mt-1.5 text-[1.45rem] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:mt-2 sm:text-[1.65rem]">
                      {item.count}
                    </div>
                  </div>
                  <span
                    className={`mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-bold tabular-nums sm:h-6 sm:min-w-6 sm:px-1.5 ${
                      item.count > 0 ? toneClasses[item.tone] : "border-white/10 bg-white/5 text-white/50"
                    }`}
                  >
                    {item.count > 0 ? "!" : "·"}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-white/45 group-hover:text-white/65 sm:mt-2 sm:text-[11px]">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Slim KPI strip — one composition, no card soup */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[22px] border border-[#E5EAE7] bg-[#E5EAE7] sm:grid-cols-4 shadow-[0_10px_40px_rgba(15,23,32,0.03)]">
        {[
          {
            label: "Active candidates",
            value: dashboardData.primaryMetrics.activeCandidates,
            href: "/employee/candidates",
          },
          {
            label: "Active applications",
            value: dashboardData.primaryMetrics.activeApplications,
            href: "/employee/applications",
          },
          {
            label: "Submitted",
            value: dashboardData.primaryMetrics.submittedApplications,
            href: "/employee/applications",
            accent: true,
          },
          {
            label: "Active staff",
            value: dashboardData.primaryMetrics.activeEmployees,
            href: "/admin/members",
          },
        ].map((metric) => (
          <Link
            key={metric.label}
            href={metric.href}
            className="bg-white px-3.5 py-3.5 transition hover:bg-[#F7F9F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#12A150] sm:px-5 sm:py-5"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">
              {metric.label}
            </div>
            <div
              className={`mt-2 text-[1.55rem] font-semibold tracking-[-0.04em] tabular-nums sm:mt-3 sm:text-[1.85rem] ${
                metric.accent ? "text-[#12A150]" : "text-[#0F1720]"
              }`}
            >
              {metric.value.toLocaleString()}
            </div>
          </Link>
        ))}
      </section>

      {/* Secondary: pipeline + funnel */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#0F1720]">
              Application pipeline
            </h2>
            <p className="mt-1 text-sm text-[#64748B]">
              State distribution and throughput after triage.
            </p>
          </div>
          <Link
            href="/employee/applications"
            className="hidden sm:inline-flex text-sm font-semibold text-[#12A150] hover:text-[#0B3B2C]"
          >
            View all →
          </Link>
        </div>

        <div className="rounded-[24px] border border-[#E5EAE7] bg-white p-5 sm:p-6 shadow-[0_10px_40px_rgba(15,23,32,0.03)]">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Total", value: dashboardData.appSummary.total },
              { label: "In progress", value: dashboardData.appSummary.inProgress },
              { label: "Ready", value: dashboardData.appSummary.ready, accent: "emerald" },
              { label: "Submitted", value: dashboardData.appSummary.submitted, accent: "sky" },
              { label: "Awaiting", value: dashboardData.appSummary.awaitingCandidate, accent: "amber" },
              { label: "Issues", value: dashboardData.appSummary.submissionIssues, accent: "rose" },
            ].map((cell) => (
              <div
                key={cell.label}
                className="rounded-[16px] border border-[#EDF1EF] bg-[#FCFDFC] px-3.5 py-3.5"
              >
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#94A3B8]">
                  {cell.label}
                </div>
                <div
                  className={`mt-2 text-xl font-semibold tabular-nums tracking-[-0.03em] ${
                    cell.accent === "emerald"
                      ? "text-[#12A150]"
                      : cell.accent === "sky"
                      ? "text-sky-700"
                      : cell.accent === "amber"
                      ? "text-amber-700"
                      : cell.accent === "rose"
                      ? "text-rose-700"
                      : "text-[#0F1720]"
                  }`}
                >
                  {cell.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-[#EDF1EF] pt-5">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">
              Throughput
            </div>
            <div className="space-y-3">
              {[
                { label: "Candidates", value: dashboardData.funnel.candidates },
                { label: "Open jobs", value: dashboardData.funnel.jobs },
                { label: "Applications", value: dashboardData.funnel.applications },
                { label: "Prepared", value: dashboardData.funnel.prepared },
                { label: "Submitted", value: dashboardData.funnel.submitted, strong: true },
              ].map((step) => (
                <div key={step.label} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3">
                  <div className="text-xs font-medium text-[#64748B]">{step.label}</div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#EDF1EF]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        step.strong ? "bg-[#12A150]" : "bg-[#0B3B2C]/70"
                      }`}
                      style={{ width: `${Math.max(6, (step.value / funnelMax) * 100)}%` }}
                    />
                  </div>
                  <div className="text-right text-xs font-semibold tabular-nums text-[#0F1720]">
                    {step.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tertiary: people + audit */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7 rounded-[24px] border border-[#E5EAE7] bg-white shadow-[0_10px_40px_rgba(15,23,32,0.03)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#EDF1EF] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-[-0.02em] text-[#0F1720]">
                Team workload
              </h2>
              <p className="mt-0.5 text-xs text-[#94A3B8]">
                {dashboardData.staffWorkload.length} active staff · sorted by open work
              </p>
            </div>
            <Link
              href="/admin/members"
              className="text-xs font-semibold text-[#12A150] hover:text-[#0B3B2C]"
            >
              Roster →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-[#FCFDFC] text-[10px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">People</th>
                  <th className="px-5 py-3 text-left font-semibold">Role</th>
                  <th className="px-5 py-3 text-center font-semibold">Open</th>
                  <th className="px-5 py-3 text-right font-semibold">Done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F3]">
                {dashboardData.staffWorkload.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-[#94A3B8]">
                      Assignments will appear once staff take work.
                    </td>
                  </tr>
                ) : (
                  dashboardData.staffWorkload.map((member) => (
                    <tr key={member.id} className="hover:bg-[#F7F9F8]/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0B3B2C] text-[10px] font-bold text-white">
                            {member.initials}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/admin/members/${member.id}`}
                              className="block truncate font-semibold text-[#0F1720] hover:text-[#12A150]"
                            >
                              {member.name}
                            </Link>
                            <div className="truncate font-mono text-[10px] text-[#94A3B8]">
                              {member.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-[#0F1720]">{member.designation}</div>
                        <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[#94A3B8]">
                          {member.role}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="font-semibold tabular-nums text-[#0F1720]">
                          {member.totalActiveWork}
                        </div>
                        <div className="text-[10px] text-[#94A3B8]">
                          {member.activeTasks}t · {member.activeApps}a
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold tabular-nums text-[#0F1720]">
                        {member.completedTasks}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-5 rounded-[24px] border border-[#E5EAE7] bg-white shadow-[0_10px_40px_rgba(15,23,32,0.03)] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-[#EDF1EF] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-[-0.02em] text-[#0F1720]">
                Recent activity
              </h2>
              <p className="mt-0.5 text-xs text-[#94A3B8]">Latest audit events</p>
            </div>
            <Link
              href="/admin/audit"
              className="text-xs font-semibold text-[#12A150] hover:text-[#0B3B2C]"
            >
              Audit →
            </Link>
          </div>

          <div className="flex-1 divide-y divide-[#F1F5F3]">
            {dashboardData.recentActivity.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-[#94A3B8]">
                No recent operational activity.
              </div>
            ) : (
              dashboardData.recentActivity.map((evt) => (
                <div key={evt.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-[#0F1720]">
                        {evt.actionLabel}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-[#64748B]">
                        {evt.actor}
                        {evt.entityType ? ` · ${evt.entityType}` : ""}
                      </div>
                    </div>
                    <time className="shrink-0 font-mono text-[10px] tabular-nums text-[#94A3B8]">
                      {new Date(evt.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
