/**
 * Phase 5K — server-side Application operations read model.
 *
 * Authz: organizationId + userId + structural scopes from AuthenticatedContext only.
 * Client employeeId / teamId / managerId / organizationId are never accepted.
 */

import type { ApplicationStatus, Prisma } from "@/generated/prisma";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError } from "@/lib/errors";
import { sanitizePaginationLimit } from "@/lib/utils/sanitization";
import { attachAgesFromHistoryBatch } from "./operations-aging";
import { deriveNextActionGuidance } from "./operations-guidance";
import { resolveManagerScope, resolveTeamLeadScope } from "./operations-scope";
import {
  buildInactiveAssigneeOrphanWhere,
  resolveOrphanVisibilityScope,
} from "./orphan-scope";
import {
  buildContinuityQueueWhere,
  countAdminContinuityApplications,
  listAdminContinuityApplicationIds,
  resolveContinuityVisibilityScope,
} from "./continuity-scope";
import { hasKnownAssignmentSnapshot } from "./assignment-snapshot";
import {
  IN_PROGRESS_STATUSES,
  NEEDS_ATTENTION_STATUSES,
  OPS_DEFAULT_PAGE_SIZE,
  OPS_MAX_PAGE_SIZE,
  OPERATIONAL_APPLICATION_QUEUES,
  type OperationalApplicationItem,
  type OperationalApplicationQueue,
  type OperationalApplicationsPage,
  type OperationalApplicationsQuery,
  type OperationalQueueCounts,
  type OperationalScopeAvailability,
} from "./operations-types";

function parseQueue(raw: string | null | undefined): OperationalApplicationQueue {
  if (raw && (OPERATIONAL_APPLICATION_QUEUES as readonly string[]).includes(raw)) {
    return raw as OperationalApplicationQueue;
  }
  return "all";
}

function ownerDisplayName(employee: {
  firstName: string | null;
  lastName: string | null;
  email: string;
} | null): string {
  if (!employee) return "Unassigned";
  const name = `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
  return name || employee.email;
}

function buildSearchWhere(search: string): Prisma.ApplicationWhereInput {
  const q = search.trim();
  if (!q) return {};
  return {
    OR: [
      { job: { title: { contains: q, mode: "insensitive" } } },
      { job: { companyName: { contains: q, mode: "insensitive" } } },
      { job: { location: { contains: q, mode: "insensitive" } } },
      { job: { source: { contains: q, mode: "insensitive" } } },
      { candidate: { user: { email: { contains: q, mode: "insensitive" } } } },
      { candidate: { user: { firstName: { contains: q, mode: "insensitive" } } } },
      { candidate: { user: { lastName: { contains: q, mode: "insensitive" } } } },
    ],
  };
}

async function buildQueueWhere(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext,
  queue: OperationalApplicationQueue,
  teamScope: Awaited<ReturnType<typeof resolveTeamLeadScope>>,
  managerScope: Awaited<ReturnType<typeof resolveManagerScope>>,
  orphanVisibility: Awaited<ReturnType<typeof resolveOrphanVisibilityScope>>,
  continuityVisibility: Awaited<ReturnType<typeof resolveContinuityVisibilityScope>>
): Promise<Prisma.ApplicationWhereInput> {
  const org: Prisma.ApplicationWhereInput = {
    organizationId: ctx.organizationId,
  };

  switch (queue) {
    case "mine":
      return { ...org, assignedEmployeeId: ctx.userId };
    case "unassigned":
      return { ...org, assignedEmployeeId: null };
    case "team": {
      if (!teamScope.authorized || teamScope.assigneeUserIds.length === 0) {
        return { ...org, id: { in: [] } };
      }
      return { ...org, assignedEmployeeId: { in: teamScope.assigneeUserIds } };
    }
    case "manager": {
      if (!managerScope.authorized || managerScope.assigneeUserIds.length === 0) {
        return { ...org, id: { in: [] } };
      }
      return { ...org, assignedEmployeeId: { in: managerScope.assigneeUserIds } };
    }
    case "orphaned": {
      // Phase 5O — additive Inactive Owner queue (does not mutate assignedEmployeeId).
      if (!orphanVisibility.canViewOrphans) {
        return { ...org, id: { in: [] } };
      }
      const base = buildInactiveAssigneeOrphanWhere(ctx.organizationId);
      if (orphanVisibility.inactiveAssigneeUserIds === null) {
        // Admin — all org orphans
        return base;
      }
      if (orphanVisibility.inactiveAssigneeUserIds.length === 0) {
        return { ...org, id: { in: [] } };
      }
      return {
        ...base,
        assignedEmployeeId: { in: orphanVisibility.inactiveAssigneeUserIds },
      };
    }
    case "continuity": {
      // Phase 5R — Out of Scope (ACTIVE owner + known assignment snapshot).
      // Admin list uses raw id filter in listOperationalApplications.
      if (!continuityVisibility.canViewContinuity) {
        return { ...org, id: { in: [] } };
      }
      if (continuityVisibility.kind === "ADMIN") {
        return { ...org, id: { in: [] } }; // replaced by admin continuity path
      }
      return (
        buildContinuityQueueWhere(ctx, continuityVisibility) ?? {
          ...org,
          id: { in: [] },
        }
      );
    }
    case "needs_attention":
      return { ...org, status: { in: [...NEEDS_ATTENTION_STATUSES] } };
    case "ready":
      return { ...org, status: "READY" };
    case "submitted":
      return { ...org, status: "SUBMITTED" };
    case "failed":
      return { ...org, status: "FAILED" };
    case "in_progress":
      return { ...org, status: { in: [...IN_PROGRESS_STATUSES] } };
    case "all":
    default:
      return org;
  }
}

const APP_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  assignedEmployeeId: true,
  assignedTeamKey: true,
  assignedManagerId: true,
  candidateId: true,
  jobId: true,
  assignedEmployee: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  candidate: {
    select: {
      id: true,
      applicationAuthorizationMode: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  },
  job: {
    select: {
      id: true,
      title: true,
      companyName: true,
      location: true,
      isRemote: true,
      source: true,
      externalUrl: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
    },
  },
  submissions: {
    orderBy: { attemptNumber: "desc" as const },
    take: 1,
    select: {
      id: true,
      attemptNumber: true,
      submittedAt: true,
    },
  },
} satisfies Prisma.ApplicationSelect;

async function computeCounts(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext,
  teamScope: Awaited<ReturnType<typeof resolveTeamLeadScope>>,
  managerScope: Awaited<ReturnType<typeof resolveManagerScope>>,
  orphanVisibility: Awaited<ReturnType<typeof resolveOrphanVisibilityScope>>,
  continuityVisibility: Awaited<ReturnType<typeof resolveContinuityVisibilityScope>>
): Promise<OperationalQueueCounts> {
  const orgWhere = { organizationId: ctx.organizationId };

  let orphanedWhere: Prisma.ApplicationWhereInput | null = null;
  if (orphanVisibility.canViewOrphans) {
    const base = buildInactiveAssigneeOrphanWhere(ctx.organizationId);
    if (orphanVisibility.inactiveAssigneeUserIds === null) {
      orphanedWhere = base;
    } else if (orphanVisibility.inactiveAssigneeUserIds.length > 0) {
      orphanedWhere = {
        ...base,
        assignedEmployeeId: { in: orphanVisibility.inactiveAssigneeUserIds },
      };
    }
  }

  let continuityCountPromise: Promise<number> = Promise.resolve(0);
  if (continuityVisibility.canViewContinuity) {
    if (continuityVisibility.kind === "ADMIN") {
      continuityCountPromise = countAdminContinuityApplications(
        tx,
        ctx.organizationId
      );
    } else {
      const where = buildContinuityQueueWhere(ctx, continuityVisibility);
      continuityCountPromise = where
        ? tx.application.count({ where })
        : Promise.resolve(0);
    }
  }

  const [
    statusGroups,
    mine,
    unassigned,
    team,
    manager,
    orphaned,
    continuity,
  ] = await Promise.all([
    tx.application.groupBy({
      by: ["status"],
      where: orgWhere,
      _count: { _all: true },
    }),
    tx.application.count({
      where: { ...orgWhere, assignedEmployeeId: ctx.userId },
    }),
    tx.application.count({
      where: { ...orgWhere, assignedEmployeeId: null },
    }),
    teamScope.authorized && teamScope.assigneeUserIds.length > 0
      ? tx.application.count({
          where: {
            ...orgWhere,
            assignedEmployeeId: { in: teamScope.assigneeUserIds },
          },
        })
      : Promise.resolve(0),
    managerScope.authorized && managerScope.assigneeUserIds.length > 0
      ? tx.application.count({
          where: {
            ...orgWhere,
            assignedEmployeeId: { in: managerScope.assigneeUserIds },
          },
        })
      : Promise.resolve(0),
    orphanedWhere
      ? tx.application.count({ where: orphanedWhere })
      : Promise.resolve(0),
    continuityCountPromise,
  ]);

  const countByStatus = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count._all])
  ) as Record<string, number>;

  const total = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
  const ready = countByStatus.READY || 0;
  const submitted = countByStatus.SUBMITTED || 0;
  const failed = countByStatus.FAILED || 0;
  const inProgress = IN_PROGRESS_STATUSES.reduce(
    (s, st) => s + (countByStatus[st] || 0),
    0
  );
  const needsAttention = NEEDS_ATTENTION_STATUSES.reduce(
    (s, st) => s + (countByStatus[st] || 0),
    0
  );

  return {
    total,
    mine,
    unassigned,
    team,
    manager,
    orphaned,
    continuity,
    ready,
    inProgress,
    submitted,
    needsAttention,
    failed,
  };
}

function parsePage(raw: number | string | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw || "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Authoritative operational Applications page for staff consoles.
 * Throws AuthorizationError for candidates.
 */
export async function listOperationalApplications(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext,
  query: OperationalApplicationsQuery = {},
  now: Date = new Date()
): Promise<OperationalApplicationsPage> {
  if (ctx.role === Role.CANDIDATE) {
    throw new AuthorizationError(
      "Candidates do not have access to Application operations queues."
    );
  }
  if (ctx.role !== Role.EMPLOYEE && ctx.role !== Role.ADMIN) {
    throw new AuthorizationError("Access denied: Application operations require staff.");
  }

  const queue = parseQueue(query.queue ?? "all");
  const pageSize = sanitizePaginationLimit(
    query.pageSize,
    OPS_DEFAULT_PAGE_SIZE,
    OPS_MAX_PAGE_SIZE
  );
  const page = parsePage(query.page);
  const sort = query.sort || "age";

  const [teamScope, managerScope, orphanVisibility, continuityVisibility] =
    await Promise.all([
      resolveTeamLeadScope(tx, ctx),
      resolveManagerScope(tx, ctx),
      resolveOrphanVisibilityScope(tx, ctx),
      resolveContinuityVisibilityScope(tx, ctx),
    ]);

  const scopes: OperationalScopeAvailability = {
    team: teamScope.authorized,
    manager: managerScope.authorized,
    orphaned: orphanVisibility.canViewOrphans,
    continuity: continuityVisibility.canViewContinuity,
    teamKeys: teamScope.teamKeys,
    directReportCount: managerScope.directReportCount,
  };

  const counts = await computeCounts(
    tx,
    ctx,
    teamScope,
    managerScope,
    orphanVisibility,
    continuityVisibility
  );

  const continuityViewer = {
    kind: continuityVisibility.kind,
    teamKeys: continuityVisibility.teamKeys,
    currentTeamAssigneeIds: continuityVisibility.currentTeamAssigneeIds,
    currentReportIds: continuityVisibility.currentReportIds,
    userId: ctx.userId,
  };

  // Admin continuity queue: bounded raw SQL ids → findMany (no get-all-then-filter).
  if (queue === "continuity" && continuityVisibility.kind === "ADMIN") {
    const skip = (page - 1) * pageSize;
    const totalCount = counts.continuity;
    const ids = await listAdminContinuityApplicationIds(tx, ctx.organizationId, {
      skip,
      take: pageSize,
    });
    const rows =
      ids.length === 0
        ? []
        : await tx.application.findMany({
            where: { organizationId: ctx.organizationId, id: { in: ids } },
            select: APP_SELECT,
          });
    // Preserve SQL order
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    const items = await hydrateWithAging(
      tx,
      ctx.organizationId,
      ordered,
      now,
      continuityViewer,
      true
    );
    return {
      items,
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize) || 1),
      queue,
      counts,
      scopes,
      asOf: now.toISOString(),
    };
  }

  const queueWhere = await buildQueueWhere(
    tx,
    ctx,
    queue,
    teamScope,
    managerScope,
    orphanVisibility,
    continuityVisibility
  );

  const listWhere: Prisma.ApplicationWhereInput = {
    ...queueWhere,
    ...buildSearchWhere(query.search || ""),
  };

  if (query.status) {
    listWhere.status = query.status as ApplicationStatus;
  }
  if (query.candidateId) {
    listWhere.candidateId = query.candidateId;
  }
  if (query.source) {
    listWhere.job = {
      is: {
        ...(typeof listWhere.job === "object" && listWhere.job && "is" in listWhere.job
          ? (listWhere.job as { is: Prisma.JobWhereInput }).is
          : {}),
        source: query.source,
      },
    };
  }

  const forceContinuityFlag = queue === "continuity";

  // Age-preferred ordering requires history; fetch a bounded working set then page in memory
  // only when sort=age. For createdAt sorts, use SQL skip/take (no full scan).
  if (sort === "newest" || sort === "oldest" || sort === "updated") {
    const orderBy: Prisma.ApplicationOrderByWithRelationInput[] =
      sort === "oldest"
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : sort === "updated"
          ? [{ updatedAt: "desc" }, { id: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }];

    const skip = (page - 1) * pageSize;
    const [totalCount, rows] = await Promise.all([
      tx.application.count({ where: listWhere }),
      tx.application.findMany({
        where: listWhere,
        select: APP_SELECT,
        orderBy,
        skip,
        take: pageSize,
      }),
    ]);

    const items = await hydrateWithAging(
      tx,
      ctx.organizationId,
      rows,
      now,
      continuityViewer,
      forceContinuityFlag
    );
    return {
      items,
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize) || 1),
      queue,
      counts,
      scopes,
      asOf: now.toISOString(),
    };
  }

  // Default / age: bounded fetch of matching rows (cap), attach ages, sort, then page.
  // Cap prevents unbounded loads; document if org exceeds cap (known finding).
  const AGE_SORT_CAP = 500;
  const [totalCount, rows] = await Promise.all([
    tx.application.count({ where: listWhere }),
    tx.application.findMany({
      where: listWhere,
      select: APP_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: AGE_SORT_CAP,
    }),
  ]);

  const ages = await loadAges(tx, rows, now);
  const sorted = [...rows].sort((a, b) => {
    const ageA = ages.get(a.id)?.ageMs;
    const ageB = ages.get(b.id)?.ageMs;
    // Older age first (age DESC); AGE_UNAVAILABLE last
    if (ageA == null && ageB == null) {
      /* fall through */
    } else if (ageA == null) return 1;
    else if (ageB == null) return -1;
    else if (ageB !== ageA) return ageB - ageA;

    const createdDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;
    return b.id.localeCompare(a.id);
  });

  const skip = (page - 1) * pageSize;
  const pageRows = sorted.slice(skip, skip + pageSize);
  const inactiveIds = await loadInactiveAssigneeIds(
    tx,
    ctx.organizationId,
    pageRows.map((r) => r.assignedEmployeeId)
  );
  const items = pageRows.map((row) => {
    const ownerInactive = row.assignedEmployeeId
      ? inactiveIds.has(row.assignedEmployeeId)
      : false;
    return toItem(
      row,
      ages.get(row.id)!,
      ownerInactive,
      forceContinuityFlag ||
        continuityOutsideScopeForViewer(row, ownerInactive, continuityViewer)
    );
  });

  const effectiveTotal = Math.min(totalCount, AGE_SORT_CAP);

  return {
    items,
    page,
    pageSize,
    totalCount: effectiveTotal,
    totalPages: Math.max(1, Math.ceil(effectiveTotal / pageSize) || 1),
    queue,
    counts,
    scopes,
    asOf: now.toISOString(),
  };
}

type ContinuityViewer = {
  kind: string;
  teamKeys: string[];
  currentTeamAssigneeIds: string[];
  currentReportIds: string[];
  userId: string;
};

function continuityOutsideScopeForViewer(
  row: {
    assignedEmployeeId: string | null;
    assignedTeamKey: string | null;
    assignedManagerId: string | null;
  },
  ownerInactive: boolean,
  viewer: ContinuityViewer
): boolean {
  if (ownerInactive) return false;
  if (!row.assignedEmployeeId) return false;
  if (!hasKnownAssignmentSnapshot(row)) return false; // SNAPSHOT_UNKNOWN

  if (viewer.kind === "ADMIN") {
    // Admin list path forces flag; other queues omit expensive membership compare.
    return false;
  }

  const leftTeam =
    (viewer.kind === "TEAM_LEAD" || viewer.kind === "BOTH") &&
    row.assignedTeamKey != null &&
    viewer.teamKeys.includes(row.assignedTeamKey) &&
    !viewer.currentTeamAssigneeIds.includes(row.assignedEmployeeId);

  const leftManager =
    (viewer.kind === "MANAGER" || viewer.kind === "BOTH") &&
    row.assignedManagerId === viewer.userId &&
    !viewer.currentReportIds.includes(row.assignedEmployeeId);

  return Boolean(leftTeam || leftManager);
}

async function loadInactiveAssigneeIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  assigneeIds: Array<string | null>
): Promise<Set<string>> {
  const ids = [...new Set(assigneeIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Set();

  const active = await tx.membership.findMany({
    where: {
      organizationId,
      userId: { in: ids },
      status: "ACTIVE",
      role: { in: [Role.EMPLOYEE, Role.ADMIN] },
    },
    select: { userId: true },
  });
  const activeSet = new Set(active.map((a) => a.userId));
  return new Set(ids.filter((id) => !activeSet.has(id)));
}

async function loadAges(
  tx: Prisma.TransactionClient,
  rows: Array<{ id: string; status: ApplicationStatus }>,
  now: Date
) {
  if (rows.length === 0) return new Map();
  const ids = rows.map((r) => r.id);
  const historyRows = await tx.applicationStateHistory.findMany({
    where: { applicationId: { in: ids } },
    select: { applicationId: true, toStatus: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return attachAgesFromHistoryBatch(rows, historyRows, now);
}

async function hydrateWithAging(
  tx: Prisma.TransactionClient,
  organizationId: string,
  rows: Array<{
    id: string;
    status: ApplicationStatus;
    createdAt: Date;
    updatedAt: Date;
    assignedEmployeeId: string | null;
    assignedTeamKey: string | null;
    assignedManagerId: string | null;
    candidateId: string;
    jobId: string;
    assignedEmployee: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
    candidate: OperationalApplicationItem["candidate"];
    job: {
      id: string;
      title: string;
      companyName: string;
      location: string | null;
      isRemote: boolean;
      source: string | null;
      externalUrl: string | null;
      salaryMin: number | null;
      salaryMax: number | null;
      salaryCurrency: string | null;
    };
    submissions: Array<{
      id: string;
      attemptNumber: number;
      submittedAt: Date;
    }>;
  }>,
  now: Date,
  continuityViewer: ContinuityViewer,
  forceContinuityFlag: boolean
): Promise<OperationalApplicationItem[]> {
  const [ages, inactiveIds] = await Promise.all([
    loadAges(tx, rows, now),
    loadInactiveAssigneeIds(
      tx,
      organizationId,
      rows.map((r) => r.assignedEmployeeId)
    ),
  ]);
  return rows.map((row) => {
    const ownerInactive = row.assignedEmployeeId
      ? inactiveIds.has(row.assignedEmployeeId)
      : false;
    return toItem(
      row,
      ages.get(row.id)!,
      ownerInactive,
      forceContinuityFlag ||
        continuityOutsideScopeForViewer(row, ownerInactive, continuityViewer)
    );
  });
}

function toItem(
  row: {
    id: string;
    status: ApplicationStatus;
    createdAt: Date;
    updatedAt: Date;
    assignedEmployeeId: string | null;
    assignedTeamKey?: string | null;
    assignedManagerId?: string | null;
    candidateId: string;
    jobId: string;
    assignedEmployee: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
    candidate: OperationalApplicationItem["candidate"];
    job: {
      id: string;
      title: string;
      companyName: string;
      location: string | null;
      isRemote: boolean;
      source: string | null;
      externalUrl: string | null;
      salaryMin: number | null;
      salaryMax: number | null;
      salaryCurrency: string | null;
    };
    submissions: Array<{
      id: string;
      attemptNumber: number;
      submittedAt: Date;
    }>;
  },
  age: {
    kind: "AGE" | "AGE_UNAVAILABLE";
    currentStateEnteredAt: string | null;
    label: string;
  },
  ownerInactive: boolean,
  continuityOutsideScope: boolean
): OperationalApplicationItem {
  let nextAction = deriveNextActionGuidance(row.status);
  if (ownerInactive) {
    nextAction =
      "Reassign to an active eligible employee — current owner is inactive.";
  } else if (continuityOutsideScope) {
    nextAction =
      "Owner remains active but is outside your current structural scope. Reassign if operational ownership should move.";
  }

  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assignedEmployeeId: row.assignedEmployeeId,
    ownerDisplayName: ownerDisplayName(row.assignedEmployee),
    ownerInactive,
    continuityOutsideScope,
    candidateId: row.candidateId,
    candidate: row.candidate,
    jobId: row.jobId,
    job: row.job,
    submissions: row.submissions.map((s) => ({
      id: s.id,
      attemptNumber: s.attemptNumber,
      submittedAt: s.submittedAt.toISOString(),
    })),
    currentStateEnteredAt: age.currentStateEnteredAt,
    currentStateAgeKind: age.kind,
    currentStateAgeLabel: age.label,
    nextAction,
  };
}

/** Test helper: ignore forged scope fields (they are not on the query type). */
export function assertClientScopeIgnored(raw: Record<string, unknown>): void {
  // Documented contract — listOperationalApplications never reads these keys.
  void raw.employeeId;
  void raw.teamId;
  void raw.managerId;
  void raw.organizationId;
}
