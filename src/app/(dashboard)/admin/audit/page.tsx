import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { AuditAction } from "@/generated/prisma";
import Link from "next/link";

interface AuditPageProps {
  searchParams?: Promise<{
    action?: string;
    entityType?: string;
    actorUserId?: string;
    page?: string;
  }>;
}

export default async function AdminAuditPage({ searchParams }: AuditPageProps) {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const resolvedParams = searchParams ? await searchParams : {};
  const selectedAction = resolvedParams.action || undefined;
  const selectedEntityType = resolvedParams.entityType || undefined;
  const selectedActor = resolvedParams.actorUserId || undefined;
  const currentPage = Math.max(1, parseInt(resolvedParams.page || "1", 10));
  const limit = 50;
  const skip = (currentPage - 1) * limit;

  const { auditEvents, totalCount } = await withRlsContext(ctx.userId, async (tx) => {
    const whereClause: any = { organizationId: ctx.organizationId };

    if (selectedAction && Object.values(AuditAction).includes(selectedAction as AuditAction)) {
      whereClause.action = selectedAction as AuditAction;
    }
    if (selectedEntityType) {
      whereClause.entityType = selectedEntityType;
    }
    if (selectedActor) {
      whereClause.actorId = selectedActor;
    }

    const [events, count] = await Promise.all([
      tx.auditEvent.findMany({
        where: whereClause,
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      tx.auditEvent.count({ where: whereClause }),
    ]);

    return { auditEvents: events, totalCount: count };
  });

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Authoritative Audit Trail</h1>
          <p className="mt-1 text-sm text-slate-500">
            Immutable, append-only security and operational audit records for organization governance.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-md hover:bg-slate-50 shadow-sm"
        >
          ← Back to Admin Console
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <form method="GET" className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700">Audit Action</label>
            <select
              name="action"
              defaultValue={selectedAction ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 bg-white"
            >
              <option value="">All Actions</option>
              {Object.values(AuditAction).map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Entity Type</label>
            <input
              name="entityType"
              defaultValue={selectedEntityType ?? ""}
              placeholder="e.g. Membership, PrivacyRequest..."
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Actor UUID</label>
            <input
              name="actorUserId"
              defaultValue={selectedActor ?? ""}
              placeholder="Filter by Actor User ID"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div className="flex space-x-2">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Filter Logs
            </button>
            <Link
              href="/admin/audit"
              className="rounded-md bg-white border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset
            </Link>
          </div>
        </form>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-700">
            Showing {auditEvents.length} of {totalCount} events (Page {currentPage} of {totalPages})
          </span>
        </div>

        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Timestamp (UTC)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Entity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Details & Metadata
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200 font-mono text-xs">
            {auditEvents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500 font-sans text-sm">
                  No audit events found matching criteria.
                </td>
              </tr>
            ) : (
              auditEvents.map((event) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 whitespace-nowrap text-slate-600">
                    {new Date(event.createdAt).toISOString()}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                      {event.action}
                    </span>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-slate-700 font-sans">
                    {event.actor ? (
                      <div>
                        <div className="font-medium text-slate-900">{event.actor.firstName} {event.actor.lastName}</div>
                        <div className="text-xs text-slate-500 font-mono">{event.actor.email}</div>
                      </div>
                    ) : (
                      <span className="text-slate-500">{event.actorType}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-slate-600">
                    {event.entityType}:{event.entityId ?? "N/A"}
                  </td>
                  <td className="px-6 py-3 text-slate-500 max-w-md break-all">
                    {event.details ? JSON.stringify(event.details) : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
            <Link
              href={`/admin/audit?page=${Math.max(1, currentPage - 1)}${selectedAction ? `&action=${selectedAction}` : ""}${selectedEntityType ? `&entityType=${selectedEntityType}` : ""}`}
              className={`px-3 py-1 rounded text-xs font-medium border bg-white ${
                currentPage === 1 ? "pointer-events-none opacity-50 text-slate-400" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Previous
            </Link>
            <span className="text-xs text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <Link
              href={`/admin/audit?page=${Math.min(totalPages, currentPage + 1)}${selectedAction ? `&action=${selectedAction}` : ""}${selectedEntityType ? `&entityType=${selectedEntityType}` : ""}`}
              className={`px-3 py-1 rounded text-xs font-medium border bg-white ${
                currentPage === totalPages ? "pointer-events-none opacity-50 text-slate-400" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Next
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
