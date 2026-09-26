import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { DesignationManager } from "@/components/admin/DesignationManager";
import Link from "next/link";

export default async function AdminDesignationsPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const designations = await withRlsContext(ctx.userId, async (tx) => {
    return tx.designation.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: { name: "asc" },
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center space-x-2">
            <Link
              href="/admin/settings"
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Settings
            </Link>
            <span className="text-xs text-slate-400">/</span>
            <span className="text-xs font-semibold text-slate-500">Organization</span>
            <span className="text-xs text-slate-400">/</span>
            <span className="text-xs font-semibold text-slate-900">Designations</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">
            Organizational Designations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Define and govern official titles, job codes, and business descriptions across your operating entity.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href="/admin/settings"
            className="text-sm font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-md hover:bg-slate-50 shadow-sm"
          >
            ← Back to Settings
          </Link>
          <Link
            href="/admin/members"
            className="text-sm font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-md hover:bg-slate-50 shadow-sm"
          >
            Staff Roster
          </Link>
        </div>
      </div>

      <DesignationManager initialDesignations={designations} />
    </div>
  );
}
