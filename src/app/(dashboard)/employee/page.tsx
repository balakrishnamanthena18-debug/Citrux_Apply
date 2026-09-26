import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { ApplicationStatus, TaskStatus } from "@/generated/prisma";
import Link from "next/link";

export default async function EmployeeWorkspacePage() {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const data = await withRlsContext(ctx.userId, async (tx) => {
    const [
      assignedCandidatesCount,
      totalCandidatesCount,
      activeTasksCount,
      myAssignedTasks,
      activeApplicationsCount,
      readyApplications,
      myRecentSubmissions,
      openJobsCount,
    ] = await Promise.all([
      tx.candidate.count({
        where: { organizationId: ctx.organizationId, assignedEmployeeId: ctx.userId },
      }),
      tx.candidate.count({
        where: { organizationId: ctx.organizationId },
      }),
      tx.task.count({
        where: {
          organizationId: ctx.organizationId,
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED] },
        },
      }),
      tx.task.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED] },
        },
        include: {
          assignedEmployee: true,
          application: {
            include: {
              candidate: { include: { user: true } },
              job: true,
            },
          },
          checklistItems: true,
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 5,
      }),
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          status: { notIn: [ApplicationStatus.SUBMITTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.REJECTED] },
        },
      }),
      // Applications ready for external submission
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
        take: 5,
      }),
      // Recent submissions by this authenticated employee
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
      tx.job.count({
        where: { organizationId: ctx.organizationId, status: "OPEN" },
      }),
    ]);

    return {
      assignedCandidatesCount,
      totalCandidatesCount,
      activeTasksCount,
      myAssignedTasks,
      activeApplicationsCount,
      readyApplications,
      myRecentSubmissions,
      openJobsCount,
    };
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Employee Workspace</h1>
          <p className="mt-1 text-xs text-slate-500">
            Operations console for candidate qualification, task execution, QA review gates, and manual external submissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
            Active Staff: {ctx.email}
          </span>
        </div>
      </div>

      {/* Operational Metrics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden rounded-lg border border-slate-200 p-5 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">My Assigned Candidates</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{data.assignedCandidatesCount}</span>
            <span className="text-xs text-slate-400">of {data.totalCandidatesCount} total</span>
          </div>
          <div className="mt-3">
            <Link href="/employee/candidates" className="text-xs font-semibold text-slate-900 hover:underline">
              View Candidates →
            </Link>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg border border-slate-200 p-5 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Active Operational Tasks</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{data.activeTasksCount}</div>
          <div className="mt-3">
            <Link href="/employee/tasks" className="text-xs font-semibold text-slate-900 hover:underline">
              Open Task Board →
            </Link>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg border border-slate-200 p-5 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Applications in Pipeline</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{data.activeApplicationsCount}</div>
          <div className="mt-3">
            <Link href="/employee/applications" className="text-xs font-semibold text-slate-900 hover:underline">
              View Application Queue →
            </Link>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg border border-slate-200 p-5 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Ready for Submission</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-700">{data.readyApplications.length}</span>
            <span className="text-xs text-blue-600 font-medium">action required</span>
          </div>
          <div className="mt-3">
            <Link href="/employee/applications?status=READY" className="text-xs font-semibold text-blue-700 hover:underline">
              View Ready Queue →
            </Link>
          </div>
        </div>
      </div>

      {/* Two Column Operational Focus: Ready to Submit & Priority Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ready to Submit Action Area */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 bg-blue-50/40 flex justify-between items-center">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <h2 className="text-sm font-semibold text-blue-950">Ready for External Submission</h2>
              </div>
              <p className="text-xs text-blue-800/80">Approved packages ready for manual submission on employer sites</p>
            </div>
            <Link href="/employee/applications?status=READY" className="text-xs font-semibold text-blue-700 hover:underline">
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
                const candidateName =
                  [app.candidate.user.firstName, app.candidate.user.lastName].filter(Boolean).join(" ") ||
                  app.candidate.user.email;

                return (
                  <div key={app.id} className="p-4 hover:bg-slate-50/75 transition flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900 truncate">{candidateName}</span>
                        <span className="text-xs text-slate-400">→</span>
                        <span className="text-xs text-slate-700 font-medium truncate">{app.job.title}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {app.job.companyName} {app.job.location && `• ${app.job.location}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/employee/applications/${app.id}`}
                        className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition"
                      >
                        Submit Now →
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Priority Task Execution Queue */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Priority Task Queue</h2>
              <p className="text-xs text-slate-500">Active preparation checklists and QA verification tasks</p>
            </div>
            <Link href="/employee/tasks" className="text-xs font-semibold text-slate-700 hover:underline">
              All Tasks →
            </Link>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {data.myAssignedTasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active operational tasks pending.
              </div>
            ) : (
              data.myAssignedTasks.map((t: any) => {
                const totalChecklist = t.checklistItems?.length || 0;
                const completedChecklist = t.checklistItems?.filter((c: any) => c.isCompleted).length || 0;
                const candidateName = t.application?.candidate?.user
                  ? [t.application.candidate.user.firstName, t.application.candidate.user.lastName].filter(Boolean).join(" ") || t.application.candidate.user.email
                  : "Unlinked Candidate";

                return (
                  <div key={t.id} className="p-4 hover:bg-slate-50/75 transition flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900 truncate">{t.title}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            t.priority === "URGENT" || t.priority === "HIGH"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {t.priority}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        For: <span className="font-medium text-slate-700">{candidateName}</span>
                        {t.application?.job && ` • ${t.application.job.title}`}
                      </p>
                      {totalChecklist > 0 && (
                        <div className="text-[10px] text-slate-400">
                          Checklist: {completedChecklist}/{totalChecklist} completed
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                          t.status === "IN_PROGRESS"
                            ? "bg-blue-50 text-blue-700"
                            : t.status === "ASSIGNED"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {t.status}
                      </span>
                      <Link
                        href={`/employee/tasks/${t.id}`}
                        className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition"
                      >
                        Execute
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* My Recent Submissions Feed */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">My Recorded Submissions</h2>
            <p className="text-xs text-slate-500">External applications submitted by you</p>
          </div>
          <Link href="/employee/applications?status=SUBMITTED" className="text-xs font-semibold text-slate-700 hover:underline">
            All Submitted Applications →
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          {data.myRecentSubmissions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No submissions recorded by you yet.
            </div>
          ) : (
            data.myRecentSubmissions.map((sub) => {
              const candidateName =
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
                    <div className="text-slate-500 flex items-center gap-2 text-[11px]">
                      <span>Candidate: <strong className="text-slate-700">{candidateName}</strong></span>
                      <span>•</span>
                      <span>Attempt #{sub.attemptNumber}</span>
                      <span>•</span>
                      <span>Submitted at {new Date(sub.submittedAt).toLocaleTimeString()} on {new Date(sub.submittedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {sub.externalReference && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                        Ref: {sub.externalReference}
                      </span>
                    )}
                    <Link
                      href={`/employee/applications/${sub.applicationId}`}
                      className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium transition"
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
