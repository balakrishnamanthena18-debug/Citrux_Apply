import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import Link from "next/link";

export default async function AdminSettingsPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const data = await withRlsContext(ctx.userId, async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: ctx.organizationId },
    });

    const activeDesignationsCount = await tx.designation.count({
      where: { organizationId: ctx.organizationId, status: "ACTIVE" },
    });
    const archivedDesignationsCount = await tx.designation.count({
      where: { organizationId: ctx.organizationId, status: "ARCHIVED" },
    });
    const activeStaffCount = await tx.membership.count({
      where: { organizationId: ctx.organizationId, status: "ACTIVE", role: { in: ["EMPLOYEE", "ADMIN"] } },
    });
    const invitedStaffCount = await tx.membership.count({
      where: { organizationId: ctx.organizationId, status: "INVITED", role: { in: ["EMPLOYEE", "ADMIN"] } },
    });

    return {
      organization: org,
      designations: {
        active: activeDesignationsCount,
        archived: archivedDesignationsCount,
        total: activeDesignationsCount + archivedDesignationsCount,
      },
      staff: {
        active: activeStaffCount,
        invited: invitedStaffCount,
      },
    };
  });

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <Link href="/admin/members" className="hover:text-slate-700">
            Governance
          </Link>
          <span>/</span>
          <span className="text-slate-900">Settings</span>
        </div>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Settings & Platform Architecture
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage organization structure, operational rules, security controls, and enterprise configuration.
            </p>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium bg-white text-slate-700 border border-slate-200 shadow-xs">
            Organization: {data.organization?.name || "CitrUX Operations"}
          </span>
        </div>
      </div>

      {/* Grid of Settings Categories */}
      <div className="space-y-6">
        {/* Category 1: Organization */}
        <section className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/75 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Organization
              </h2>
            </div>
            <span className="text-[11px] font-medium text-slate-400">Enterprise Structure</span>
          </div>

          <div className="divide-y divide-slate-100">
            {/* General */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">General</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Operating tenant profile ({data.organization?.name}), slug identifier ({data.organization?.slug}), and operational domain isolation.
                </p>
              </div>
              <div className="flex-shrink-0">
                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                  {data.organization?.id}
                </span>
              </div>
            </div>

            {/* Designations item */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Designations</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    {data.designations.active} Active
                  </span>
                  {data.designations.archived > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      {data.designations.archived} Archived
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Define official titles, job codes, and descriptions. Used for employee organizational identity without altering system RBAC permissions.
                </p>
              </div>
              <div className="flex-shrink-0">
                <Link
                  href="/admin/settings/designations"
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
                >
                  Configure Designations →
                </Link>
              </div>
            </div>

            {/* Departments */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Departments</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                    Configured via Staff Roster
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Operational department taxonomy, business units, and organizational division groupings.
                </p>
              </div>
              <span className="text-xs text-slate-400 italic">Dynamic</span>
            </div>

            {/* Teams */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Teams</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                    Configured via Staff Roster
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Functional unit assignments and desk routing team assignments.
                </p>
              </div>
              <span className="text-xs text-slate-400 italic">Dynamic</span>
            </div>

            {/* Locations */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Locations</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                    Remote / Multi-Regional
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Office hubs, regional clusters, and operational timezones.
                </p>
              </div>
              <span className="text-xs text-slate-400 italic">Global</span>
            </div>
          </div>
        </section>

        {/* Category 2: People & Access */}
        <section className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/75 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                People & Access
              </h2>
            </div>
            <span className="text-[11px] font-medium text-slate-400">Security & RBAC</span>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Roles & Permissions */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Roles & Permissions</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200/60">
                    3 Fixed Roles (ADMIN, EMPLOYEE, CANDIDATE)
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Fixed authorization boundaries enforced at Next.js server actions and database RLS. Designations cannot expand permissions.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                Kernel Enforced
              </span>
            </div>

            {/* Employee Access */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Employee Access & Governance</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    {data.staff.active} Active
                  </span>
                  {data.staff.invited > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                      {data.staff.invited} Pending
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Provision new staff, manage employee lifecycle, handle deactivations and reassignment of tasks/candidates.
                </p>
              </div>
              <div className="flex-shrink-0">
                <Link
                  href="/admin/members"
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
                >
                  Manage Roster →
                </Link>
              </div>
            </div>

            {/* Reporting Structure */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Reporting Structure</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    Hierarchical
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Tenant-isolated manager binding, anti-self-reporting guards, and automatic audit attribution on manager transitions.
                </p>
              </div>
              <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                Self-Enforcing
              </span>
            </div>
          </div>
        </section>

        {/* Category 3: Operations */}
        <section className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/75 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Operations
              </h2>
            </div>
            <span className="text-[11px] font-medium text-slate-400">Workflow Engines</span>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Application Rules */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Application Rules</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    14 Authoritative States
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Strict lifecycle transitions from DISCOVERED through READY to SUBMITTED with candidate approval modes and QA review gates.
                </p>
              </div>
              <div className="flex-shrink-0">
                <Link
                  href="/admin/applications"
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
                >
                  View Applications →
                </Link>
              </div>
            </div>

            {/* Task Rules */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Task Rules</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                    Governance Policy Active
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Control task creation, assignment, escalation and completion authority.
                </p>
              </div>
              <div className="flex-shrink-0">
                <Link
                  href="/admin/settings/task-rules"
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
                >
                  Configure Task Rules →
                </Link>
              </div>
            </div>

            {/* SLA & Escalations */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">SLA & Escalations</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                    Escalation Desk Active
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Overdue task SLA monitoring, automated escalation flags, and administrator manual resolution overrides.
                </p>
              </div>
              <div className="flex-shrink-0">
                <Link
                  href="/admin/tasks/escalations"
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
                >
                  Escalation Console →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Category 4: Communications */}
        <section className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/75 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Communications
              </h2>
            </div>
            <span className="text-[11px] font-medium text-slate-400">Messaging & Notifications</span>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Email */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Email</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    SMTP Connected
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Transactional email delivery for employee onboarding, password resets, and candidate notifications.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                notifications@citrux.in
              </span>
            </div>

            {/* Notifications */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Notifications</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Realtime in-app activity bell, unread counts, and broadcast refresh triggers across operational modules.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                Realtime Synchronized
              </span>
            </div>
          </div>
        </section>

        {/* Category 5: Security & Governance */}
        <section className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/75 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Security & Governance
              </h2>
            </div>
            <span className="text-[11px] font-medium text-slate-400">Zero Trust</span>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Security */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Security</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    FORCE RLS Enabled
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  PostgreSQL Row Level Security parameterization, tenant isolation, and strict session verification.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                PostgreSQL RLS
              </span>
            </div>

            {/* Audit & Compliance */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Audit & Compliance</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    Immutable Log
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Cryptographically attributed forensic event log and GDPR/CCPA privacy queue management.
                </p>
              </div>
              <div className="flex-shrink-0 flex items-center space-x-2">
                <Link
                  href="/admin/audit"
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
                >
                  Audit Trail →
                </Link>
                <Link
                  href="/admin/privacy"
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
                >
                  Privacy Queue →
                </Link>
              </div>
            </div>

            {/* Sessions */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">Sessions</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    HTTP-Only Cookies
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Encrypted cookie sessions, token invalidation on deactivation, and single-tenant scoping.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                Active
              </span>
            </div>
          </div>
        </section>

        {/* Category 6: System */}
        <section className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/75 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                System
              </h2>
            </div>
            <span className="text-[11px] font-medium text-slate-400">Core Engine</span>
          </div>

          <div className="divide-y divide-slate-100">
            {/* System Configuration */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">System Configuration</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    Production Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Antigravity Core runtime, Next.js 16 App Router, Prisma ORM 5.22, and distributed transaction management.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                v2.2.0-RELEASE
              </span>
            </div>

            {/* System Health */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-semibold text-slate-900">System Health</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    All Systems Operational
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Database latency, real-time subscriber status, SMTP transport responsiveness, and RLS constraint integrity.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-semibold text-emerald-700">Healthy</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
