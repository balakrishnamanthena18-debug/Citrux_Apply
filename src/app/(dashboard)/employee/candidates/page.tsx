import Link from "next/link";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";

export default async function EmployeeCandidatesListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const resolvedParams = await searchParams;
  const statusFilter = resolvedParams.status;
  const searchQuery = resolvedParams.search?.toLowerCase();

  const candidates = await withRlsContext(ctx.userId, async (tx) => {
    return tx.candidate.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(statusFilter && statusFilter !== "ALL" ? { status: statusFilter as any } : {}),
      },
      include: {
        user: true,
        assignedEmployee: true,
        skills: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  const filteredCandidates = searchQuery
    ? candidates.filter((c) => {
        const fullName = `${c.user.firstName ?? ""} ${c.user.lastName ?? ""}`.toLowerCase();
        const email = c.user.email.toLowerCase();
        const headline = (c.headline ?? "").toLowerCase();
        return fullName.includes(searchQuery) || email.includes(searchQuery) || headline.includes(searchQuery);
      })
    : candidates;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Candidate Directory</h1>
          <p className="mt-1 text-sm text-slate-500">
            Organization-wide candidate operational records, status tracking, and specialist assignment.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2">
          {["ALL", "ONBOARDING", "ACTIVE", "INACTIVE", "ARCHIVED"].map((st) => (
            <Link
              key={st}
              href={`/employee/candidates?status=${st}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                (!statusFilter && st === "ALL") || statusFilter === st
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {st}
            </Link>
          ))}
        </div>

        <form method="GET" className="flex gap-2">
          <input
            name="search"
            defaultValue={resolvedParams.search ?? ""}
            placeholder="Search by name, email, role..."
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            Search
          </button>
        </form>
      </div>

      {/* Candidates Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Candidate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Verification
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Assigned Specialist
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {filteredCandidates.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">
                  No candidates found matching the selected filters.
                </td>
              </tr>
            ) : (
              filteredCandidates.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-slate-900">
                      {[c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || "Unnamed Candidate"}
                    </div>
                    <div className="text-xs text-slate-500">{c.user.email}</div>
                    {c.headline && <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{c.headline}</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        c.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800"
                          : c.status === "ONBOARDING"
                          ? "bg-blue-100 text-blue-800"
                          : c.status === "INACTIVE"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        c.verificationStatus === "VERIFIED"
                          ? "bg-emerald-100 text-emerald-800"
                          : c.verificationStatus === "PENDING_REVIEW"
                          ? "bg-amber-100 text-amber-800"
                          : c.verificationStatus === "REJECTED"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {c.verificationStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700">
                    {c.assignedEmployee
                      ? [c.assignedEmployee.firstName, c.assignedEmployee.lastName].filter(Boolean).join(" ") || c.assignedEmployee.email
                      : <span className="text-slate-400 italic">Unassigned</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium">
                    <Link
                      href={`/employee/candidates/${c.id}`}
                      className="text-slate-900 hover:text-slate-700 font-semibold"
                    >
                      View Profile →
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
