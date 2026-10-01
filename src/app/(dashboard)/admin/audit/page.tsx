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
          <h1 className="text-2xl font-bold text-[#0F1720] tracking-tight">Authoritative Audit Trail</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Immutable, append-only security and operational audit records for organization governance.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm font-medium text-[#64748B] hover:text-[#0F1720] bg-white border border-[#E5EAE7] px-3 py-1.5 rounded-md hover:bg-[#F7F9F8] shadow-[0_10px_40px_rgba(15,23,32,0.03)]"
        >
          ← Back to Admin Console
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-[16px] border border-[#E5EAE7] shadow-[0_10px_40px_rgba(15,23,32,0.03)]">
        <form method="GET" className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-[#334155]">Audit Action</label>
            <select
              name="action"
              defaultValue={selectedAction ?? ""}
              className="mt-1 block w-full rounded-md border border-[#DDE5E0] px-3 py-1.5 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 bg-white"
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
            <label className="block text-xs font-medium text-[#334155]">Entity Type</label>
            <input
              name="entityType"
              defaultValue={selectedEntityType ?? ""}
              placeholder="e.g. Membership, PrivacyRequest..."
              className="mt-1 block w-full rounded-md border border-[#DDE5E0] px-3 py-1.5 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#334155]">Actor UUID</label>
            <input
              name="actorUserId"
              defaultValue={selectedActor ?? ""}
              placeholder="Filter by Actor User ID"
              className="mt-1 block w-full rounded-md border border-[#DDE5E0] px-3 py-1.5 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
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
              className="rounded-md bg-white border border-[#DDE5E0] px-3 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F7F9F8]"
            >
              Reset
            </Link>
          </div>
        </form>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-[16px] border border-[#E5EAE7] shadow-[0_10px_40px_rgba(15,23,32,0.03)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5EAE7] bg-[#F7F9F8] flex justify-between items-center">
          <span className="text-xs font-semibold text-[#334155]">
            Showing {auditEvents.length} of {totalCount} events (Page {currentPage} of {totalPages})
          </span>
        </div>

        <table className="min-w-full divide-y divide-[#E5EAE7]">
          <thead className="bg-[#F7F9F8]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wider">
                Timestamp (UTC)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wider">
                Actor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wider">
                Entity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wider">
                Details & Metadata
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-[#E5EAE7] font-mono text-xs">
            {auditEvents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-[#64748B] font-sans text-sm">
                  No audit events found matching criteria.
                </td>
              </tr>
            ) : (
              auditEvents.map((event) => (
                <tr key={event.id} className="hover:bg-[#F7F9F8]">
                  <td className="px-6 py-3 whitespace-nowrap text-[#64748B]">
                    {new Date(event.createdAt).toISOString()}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#EDF1EF] text-[#0F1720] border border-[#E5EAE7]">
                      {event.action}
                    </span>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-[#334155] font-sans">
                    {event.actor ? (
                      <div>
                        <div className="font-medium text-[#0F1720]">{event.actor.firstName} {event.actor.lastName}</div>
                        <div className="text-xs text-[#64748B] font-mono">{event.actor.email}</div>
                      </div>
                    ) : (
                      <span className="text-[#64748B]">{event.actorType}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-[#64748B]">
                    {event.entityType}:{event.entityId ?? "N/A"}
                  </td>
                  <td className="px-6 py-3 text-[#64748B] max-w-md break-all">
                    {event.details ? JSON.stringify(event.details) : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 bg-[#F7F9F8] border-t border-[#E5EAE7] flex justify-between items-center">
            <Link
              href={`/admin/audit?page=${Math.max(1, currentPage - 1)}${selectedAction ? `&action=${selectedAction}` : ""}${selectedEntityType ? `&entityType=${selectedEntityType}` : ""}`}
              className={`px-3 py-1 rounded text-xs font-medium border bg-white ${
                currentPage === 1 ? "pointer-events-none opacity-50 text-[#94A3B8]" : "text-[#334155] hover:bg-[#EDF1EF]"
              }`}
            >
              Previous
            </Link>
            <span className="text-xs text-[#64748B]">
              Page {currentPage} of {totalPages}
            </span>
            <Link
              href={`/admin/audit?page=${Math.min(totalPages, currentPage + 1)}${selectedAction ? `&action=${selectedAction}` : ""}${selectedEntityType ? `&entityType=${selectedEntityType}` : ""}`}
              className={`px-3 py-1 rounded text-xs font-medium border bg-white ${
                currentPage === totalPages ? "pointer-events-none opacity-50 text-[#94A3B8]" : "text-[#334155] hover:bg-[#EDF1EF]"
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
