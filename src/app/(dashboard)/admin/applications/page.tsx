import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import Link from "next/link";
import { ApplicationStatus } from "@/generated/prisma";

export default async function AdminApplicationsPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const { applications, totalCount, statusCounts } = await withRlsContext(ctx.userId, async (tx) => {
    const apps = await tx.application.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        candidate: { include: { user: true } },
        job: true,
        assignedEmployee: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const total = await tx.application.count({
      where: { organizationId: ctx.organizationId },
    });

    const counts = await tx.application.groupBy({
      by: ["status"],
      where: { organizationId: ctx.organizationId },
      _count: true,
    });

    return { applications: apps, totalCount: total, statusCounts: counts };
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Application Operations Oversight</h1>
          <p className="text-sm text-slate-500 mt-1">
            Administrative monitoring, pipeline tracking, and audit review across all managed applications.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
          <div className="p-4">
            <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Total Applications</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1">{totalCount}</div>
          </div>
          {statusCounts.slice(0, 5).map((sc) => (
            <div key={sc.status} className="p-4">
              <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wide truncate">{sc.status.replace(/_/g, " ")}</div>
              <div className="text-2xl font-semibold text-slate-900 mt-1">{sc._count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Oversight Table */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/75 flex justify-between items-center">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Managed Applications ({applications.length})
          </h2>
        </div>
        <table className="min-w-full divide-y divide-slate-200/80 text-left text-xs">
          <thead className="bg-slate-50/75 font-semibold uppercase tracking-wider text-[11px] text-slate-500">
            <tr>
              <th className="px-5 py-3">Candidate</th>
              <th className="px-5 py-3">Job & Company</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Assignee</th>
              <th className="px-5 py-3">Created</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {applications.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                  No applications recorded.
                </td>
              </tr>
            ) : (
              applications.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50/60 transition-colors h-14">
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">
                      {app.candidate.user.firstName || app.candidate.user.lastName
                        ? `${app.candidate.user.firstName ?? ""} ${app.candidate.user.lastName ?? ""}`.trim()
                        : app.candidate.user.email}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">{app.candidate.user.email}</div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="font-medium text-slate-800">{app.job.title}</div>
                    <div className="text-[11px] text-slate-400">{app.job.companyName}</div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                      {app.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-600">
                    {app.assignedEmployee
                      ? `${app.assignedEmployee.firstName || ""} ${app.assignedEmployee.lastName || app.assignedEmployee.email}`.trim()
                      : <span className="text-slate-400 italic">Unassigned</span>}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-right">
                    <Link
                      href={`/employee/applications/${app.id}`}
                      className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
                    >
                      Inspect →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
