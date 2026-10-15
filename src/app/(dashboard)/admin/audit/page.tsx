import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { AuditAction } from "@/generated/prisma";
import Link from "next/link";
import { AuditInvestigationWorkbench, type AuditKpis } from "@/components/admin/AuditInvestigationWorkbench";
import { getActionsForCategory } from "@/lib/audit/catalog";
import { sanitizeObject } from "@/lib/utils/sanitization";

interface AuditPageProps {
  searchParams?: Promise<{
    action?: string;
    category?: string;
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: string;
    limit?: string;
    sortOrder?: "asc" | "desc";
  }>;
}

export default async function AdminAuditPage({ searchParams }: AuditPageProps) {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const resolvedParams = searchParams ? await searchParams : {};
  const selectedCategory = resolvedParams.category || "ALL";
  const selectedAction = resolvedParams.action || undefined;
  const selectedEntityType = resolvedParams.entityType || undefined;
  const selectedEntityId = resolvedParams.entityId || undefined;
  const selectedActor = resolvedParams.actorUserId || undefined;
  const startDate = resolvedParams.startDate || undefined;
  const endDate = resolvedParams.endDate || undefined;
  const searchTerm = resolvedParams.search || undefined;
  const sortOrder = resolvedParams.sortOrder === "asc" ? "asc" : "desc";
  const currentPage = Math.max(1, parseInt(resolvedParams.page || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(resolvedParams.limit || "25", 10)));
  const skip = (currentPage - 1) * limit;

  const { auditEvents, totalCount, kpis, knownActors } = await withRlsContext(ctx.userId, async (tx) => {
    const whereClause: any = { organizationId: ctx.organizationId };

    if (selectedCategory && selectedCategory !== "ALL") {
      const catActions = getActionsForCategory(selectedCategory);
      if (selectedAction && Object.values(AuditAction).includes(selectedAction as AuditAction)) {
        if (catActions.includes(selectedAction as AuditAction)) {
          whereClause.action = selectedAction as AuditAction;
        } else {
          whereClause.action = { in: [] };
        }
      } else {
        whereClause.action = { in: catActions };
      }
    } else if (selectedAction && Object.values(AuditAction).includes(selectedAction as AuditAction)) {
      whereClause.action = selectedAction as AuditAction;
    }

    if (selectedEntityType) {
      whereClause.entityType = { contains: selectedEntityType, mode: "insensitive" };
    }
    if (selectedEntityId) {
      whereClause.entityId = { contains: selectedEntityId, mode: "insensitive" };
    }
    if (selectedActor) {
      whereClause.actorId = selectedActor;
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        const s = startDate.length === 10 ? `${startDate}T00:00:00.000Z` : startDate;
        const parsedStart = new Date(s);
        if (!isNaN(parsedStart.getTime())) {
          whereClause.createdAt.gte = parsedStart;
        }
      }
      if (endDate) {
        const e = endDate.length === 10 ? `${endDate}T23:59:59.999Z` : endDate;
        const parsedEnd = new Date(e);
        if (!isNaN(parsedEnd.getTime())) {
          whereClause.createdAt.lte = parsedEnd;
        }
      }
    }

    if (searchTerm) {
      const term = searchTerm.trim().toLowerCase();
      const matchingActions = Object.values(AuditAction).filter(
        (a) => a.toLowerCase().includes(term) || a.replace(/_/g, " ").toLowerCase().includes(term)
      );

      whereClause.OR = [
        ...(matchingActions.length > 0 ? [{ action: { in: matchingActions } }] : []),
        { entityType: { contains: term, mode: "insensitive" } },
        { entityId: { contains: term, mode: "insensitive" } },
        { ipAddress: { contains: term, mode: "insensitive" } },
        { actor: { email: { contains: term, mode: "insensitive" } } },
        { actor: { firstName: { contains: term, mode: "insensitive" } } },
        { actor: { lastName: { contains: term, mode: "insensitive" } } },
      ];
    }

    // Main bounded query
    const events = await tx.auditEvent.findMany({
      where: whereClause,
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [{ createdAt: sortOrder }, { id: sortOrder }],
      skip,
      take: limit,
    });

    const count = await tx.auditEvent.count({ where: whereClause });

    // Real KPI metrics scoped to tenant
    const [totalOrgEvents, securityAlertsCount, authLoginsCount, actorGroups] = await Promise.all([
      tx.auditEvent.count({ where: { organizationId: ctx.organizationId } }),
      tx.auditEvent.count({
        where: {
          organizationId: ctx.organizationId,
          action: {
            in: [
              AuditAction.SECURITY_ALERT,
              AuditAction.ACCESS_DENIED,
              AuditAction.SECURITY_ALERT_INVALID_STORAGE_PATH,
            ],
          },
        },
      }),
      tx.auditEvent.count({
        where: {
          organizationId: ctx.organizationId,
          action: AuditAction.USER_LOGIN,
        },
      }),
      tx.auditEvent.groupBy({
        by: ["actorId"],
        where: {
          organizationId: ctx.organizationId,
          actorId: { not: null },
        },
      }),
    ]);

    // Known staff / actors for filter dropdowns
    const staffMembers = await tx.membership.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      take: 50,
    });

    const actorList = staffMembers.map((m) => ({
      id: m.user.id,
      name: `${m.user.firstName || ""} ${m.user.lastName || ""}`.trim() || m.user.email,
      email: m.user.email,
    }));

    const kpisData: AuditKpis = {
      totalEvents: totalOrgEvents,
      securityEvents: securityAlertsCount,
      authSessions: authLoginsCount,
      activeActors: actorGroups.length,
    };

    return {
      auditEvents: events,
      totalCount: count,
      kpis: kpisData,
      knownActors: actorList,
    };
  });

  const sanitizedEvents = auditEvents.map((evt) => ({
    ...evt,
    details: (evt.details ? sanitizeObject(evt.details) : null) as Record<string, unknown> | null,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#0F1720] tracking-tight">Authoritative Audit Trail</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              Append-Only
            </span>
          </div>
          <p className="mt-1 text-xs text-[#64748B] max-w-2xl leading-relaxed">
            Immutable, append-only security and operational audit records under organizational governance.
            Inspect actor actions, state transitions, and forensic metadata with tenant isolation.
          </p>
        </div>

        <Link
          href="/admin"
          className="self-start sm:self-auto text-xs font-semibold text-[#64748B] hover:text-[#0F1720] bg-white border border-[#E5EAE7] px-3.5 py-2 rounded-[10px] hover:bg-[#F7F9F8] shadow-2xs transition-colors"
        >
          ← Back to Admin Console
        </Link>
      </div>

      {/* Interactive Workbench with Real Data */}
      <AuditInvestigationWorkbench
        initialEvents={sanitizedEvents as any}
        initialTotalCount={totalCount}
        initialFilters={{
          category: selectedCategory,
          action: selectedAction,
          actorUserId: selectedActor,
          entityType: selectedEntityType,
          entityId: selectedEntityId,
          startDate,
          endDate,
          search: searchTerm,
          page: currentPage,
          limit,
          sortOrder,
        }}
        kpis={kpis}
        knownActors={knownActors}
      />
    </div>
  );
}
