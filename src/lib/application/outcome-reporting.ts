/**
 * Phase 6F — Outcome Reporting & Operational Intelligence engine.
 *
 * Implements server-authoritative, role-scoped outcome analytics
 * respecting Phase 5 structural authority, assignment continuity,
 * and Phase 6B product contract constraints.
 */

import {
  Role,
  type ApplicationOutcomeType,
  type Prisma,
} from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError } from "@/lib/errors";
import { resolveAssignmentAuthority } from "./assignment-authority";
import {
  resolveManagerScope,
  resolveTeamLeadScope,
} from "./operations-scope";
import {
  staffOutcomeLabel,
  candidateOutcomeLabel,
  staffProvenanceLabel,
} from "./outcome-labels";
import type {
  OutcomeAttributionItemDTO,
  OutcomeConversionRatesDTO,
  OutcomeDetailDTO,
  OutcomeMetricsSummaryDTO,
  OutcomeRecentItemDTO,
  OutcomeReportingFilters,
  OutcomeReportingResponseDTO,
  OutcomeTimingDTO,
} from "./outcome-reporting-types";

type Tx = Prisma.TransactionClient;

const TERMINAL_STATUSES = new Set(["ACCEPTED", "REJECTED", "WITHDRAWN", "FAILED"]);

function resolveDateFilterRange(filters: OutcomeReportingFilters): {
  from?: Date;
  to?: Date;
} {
  const now = new Date();
  if (filters.dateRange === "7d") {
    return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
  }
  if (filters.dateRange === "30d") {
    return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
  }
  if (filters.dateRange === "90d") {
    return { from: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
  }
  if (filters.dateRange === "ytd") {
    return { from: new Date(now.getFullYear(), 0, 1) };
  }
  if (filters.dateRange === "custom" && (filters.startDate || filters.endDate)) {
    return {
      from: filters.startDate ? new Date(filters.startDate) : undefined,
      to: filters.endDate ? new Date(filters.endDate) : undefined,
    };
  }
  return {};
}

/**
 * Builds the structural where-clause for Applications matching actor role scope.
 */
export async function buildReportingApplicationWhere(
  tx: Tx,
  ctx: AuthenticatedContext,
  filters: OutcomeReportingFilters
): Promise<Prisma.ApplicationWhereInput> {
  if (ctx.role === Role.CANDIDATE) {
    throw new AuthorizationError("Candidates cannot access operational reporting.");
  }

  const baseOrg: Prisma.ApplicationWhereInput = {
    organizationId: ctx.organizationId,
  };

  const andConditions: Prisma.ApplicationWhereInput[] = [baseOrg];

  // Specific dimensional filters requested by client (validated against scope below)
  if (filters.companyName && filters.companyName.trim()) {
    andConditions.push({
      job: { companyName: { equals: filters.companyName.trim(), mode: "insensitive" } },
    });
  }

  // Role Scoping
  if (ctx.role === Role.ADMIN) {
    if (filters.employeeId) {
      andConditions.push({ assignedEmployeeId: filters.employeeId });
    }
    if (filters.teamKey) {
      andConditions.push({ assignedTeamKey: filters.teamKey });
    }
    return { AND: andConditions };
  }

  // Employee, Team Lead, or Manager
  const [teamScope, managerScope, authProfile] = await Promise.all([
    resolveTeamLeadScope(tx, ctx),
    resolveManagerScope(tx, ctx),
    resolveAssignmentAuthority(tx, ctx),
  ]);

  const isTeamLead = authProfile.actorKinds.includes("TEAM_LEAD") && teamScope.authorized;
  const isManager = authProfile.actorKinds.includes("MANAGER") || managerScope.authorized;

  const scopeOrs: Prisma.ApplicationWhereInput[] = [];

  // 1. Direct assigned ownership
  scopeOrs.push({ assignedEmployeeId: ctx.userId });

  // 2. Team Lead Scope (team assignees + historical assignedTeamKey snapshot)
  if (isTeamLead) {
    if (teamScope.assigneeUserIds.length > 0) {
      scopeOrs.push({ assignedEmployeeId: { in: teamScope.assigneeUserIds } });
    }
    if (teamScope.teamKeys.length > 0) {
      scopeOrs.push({ assignedTeamKey: { in: teamScope.teamKeys } });
    }
  }

  // 3. Manager Scope (direct report assignees + historical assignedManagerId snapshot)
  if (isManager) {
    if (managerScope.assigneeUserIds.length > 0) {
      scopeOrs.push({ assignedEmployeeId: { in: managerScope.assigneeUserIds } });
    }
    scopeOrs.push({ assignedManagerId: ctx.userId });
  }

  andConditions.push({ OR: scopeOrs });

  // Apply employee filter if within authorized scope
  if (filters.employeeId) {
    const allowed =
      filters.employeeId === ctx.userId ||
      (isTeamLead && teamScope.assigneeUserIds.includes(filters.employeeId)) ||
      (isManager && managerScope.assigneeUserIds.includes(filters.employeeId));

    if (allowed) {
      andConditions.push({ assignedEmployeeId: filters.employeeId });
    } else {
      // Forbidden filter &rarr; empty match
      andConditions.push({ id: { in: [] } });
    }
  }

  // Apply team filter if within authorized scope
  if (filters.teamKey) {
    const allowed = isTeamLead && teamScope.teamKeys.includes(filters.teamKey);
    if (allowed) {
      andConditions.push({ assignedTeamKey: filters.teamKey });
    } else {
      andConditions.push({ id: { in: [] } });
    }
  }

  return { AND: andConditions };
}

/**
 * Calculates outcome metrics, conversion rates, timing, and attribution breakdown.
 */
export async function getOutcomeReportingData(
  tx: Tx,
  ctx: AuthenticatedContext,
  filters: OutcomeReportingFilters = {}
): Promise<OutcomeReportingResponseDTO> {
  const appWhere = await buildReportingApplicationWhere(tx, ctx, filters);
  const dateRange = resolveDateFilterRange(filters);

  // Load all applications matching structural scope
  const apps = await tx.application.findMany({
    where: appWhere,
    select: {
      id: true,
      status: true,
      assignedEmployeeId: true,
      assignedTeamKey: true,
      assignedManagerId: true,
      job: {
        select: {
          id: true,
          title: true,
          companyName: true,
        },
      },
      candidate: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
      assignedEmployee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      assignedManager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      submissions: {
        select: {
          id: true,
          attemptNumber: true,
          submittedAt: true,
        },
        orderBy: { submittedAt: "asc" },
      },
      outcomeEvents: {
        select: {
          id: true,
          outcomeType: true,
          provenance: true,
          correctionState: true,
          recordedAt: true,
          occurredAt: true,
          notes: true,
          candidateVisible: true,
          evidenceStoragePath: true,
          evidenceText: true,
          evidenceShareable: true,
          actor: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: [{ occurredAt: "asc" }, { recordedAt: "asc" }],
      },
    },
    take: 2000,
  });

  // Calculate distinct metrics
  let submittedAppsCount = 0;
  let activeAppsCount = 0;
  let closedAppsCount = 0;
  let awaitingOutcomeCount = 0;

  const recruiterContactAppIds = new Set<string>();
  const interviewRequestedAppIds = new Set<string>();
  const interviewScheduledAppIds = new Set<string>();
  const anyInterviewAppIds = new Set<string>();
  const offerReceivedAppIds = new Set<string>();
  const employerRejectionAppIds = new Set<string>();

  let candidateReportedEventsCount = 0;
  let staffVerifiedEventsCount = 0;

  // Timing accumulators
  const daysToFirstOutcome: number[] = [];
  const daysToRecruiterContact: number[] = [];
  const daysToInterviewRequest: number[] = [];
  const daysToInterviewScheduled: number[] = [];
  const daysToOffer: number[] = [];
  const daysToEmployerRejection: number[] = [];
  let hasRecordedTimingFallback = false;

  // Breakdown accumulators
  const employeeStats = new Map<string, { label: string; submitted: Set<string>; interviews: Set<string>; offers: Set<string>; rejections: Set<string>; awaiting: Set<string> }>();
  const teamStats = new Map<string, { label: string; submitted: Set<string>; interviews: Set<string>; offers: Set<string>; rejections: Set<string>; awaiting: Set<string> }>();
  const managerStats = new Map<string, { label: string; submitted: Set<string>; interviews: Set<string>; offers: Set<string>; rejections: Set<string>; awaiting: Set<string> }>();
  const employerStats = new Map<string, { label: string; submitted: Set<string>; interviews: Set<string>; offers: Set<string>; rejections: Set<string>; awaiting: Set<string> }>();

  const recentList: OutcomeRecentItemDTO[] = [];

  for (const app of apps) {
    const isTerminal = TERMINAL_STATUSES.has(app.status);
    if (isTerminal) {
      closedAppsCount++;
    } else {
      activeAppsCount++;
    }

    const hasSubmissions = app.submissions.length > 0;
    const earliestSubmission = hasSubmissions ? app.submissions[0] : null;

    if (hasSubmissions) {
      submittedAppsCount++;
    }

    // Attribution keys
    const empKey = app.assignedEmployeeId || "unassigned";
    const empName = app.assignedEmployee
      ? `${app.assignedEmployee.firstName || ""} ${app.assignedEmployee.lastName || ""}`.trim() || app.assignedEmployee.email
      : "Unassigned";

    const teamKey = app.assignedTeamKey || "no_team";
    const teamName = app.assignedTeamKey || "Unassigned Team";

    const mgrKey = app.assignedManagerId || "no_manager";
    const mgrName = app.assignedManager
      ? `${app.assignedManager.firstName || ""} ${app.assignedManager.lastName || ""}`.trim() || app.assignedManager.email
      : "No Manager Assigned";

    const employerKey = (app.job.companyName || "Unknown Employer").trim();

    if (!employeeStats.has(empKey)) {
      employeeStats.set(empKey, { label: empName, submitted: new Set(), interviews: new Set(), offers: new Set(), rejections: new Set(), awaiting: new Set() });
    }
    if (!teamStats.has(teamKey)) {
      teamStats.set(teamKey, { label: teamName, submitted: new Set(), interviews: new Set(), offers: new Set(), rejections: new Set(), awaiting: new Set() });
    }
    if (!managerStats.has(mgrKey)) {
      managerStats.set(mgrKey, { label: mgrName, submitted: new Set(), interviews: new Set(), offers: new Set(), rejections: new Set(), awaiting: new Set() });
    }
    if (!employerStats.has(employerKey)) {
      employerStats.set(employerKey, { label: employerKey, submitted: new Set(), interviews: new Set(), offers: new Set(), rejections: new Set(), awaiting: new Set() });
    }

    if (hasSubmissions) {
      employeeStats.get(empKey)!.submitted.add(app.id);
      teamStats.get(teamKey)!.submitted.add(app.id);
      managerStats.get(mgrKey)!.submitted.add(app.id);
      employerStats.get(employerKey)!.submitted.add(app.id);
    }

    // Filter active outcomes
    const activeOutcomes = app.outcomeEvents.filter(
      (o) => o.correctionState === "ACTIVE"
    );

    if (hasSubmissions && activeOutcomes.length === 0) {
      awaitingOutcomeCount++;
      employeeStats.get(empKey)!.awaiting.add(app.id);
      teamStats.get(teamKey)!.awaiting.add(app.id);
      managerStats.get(mgrKey)!.awaiting.add(app.id);
      employerStats.get(employerKey)!.awaiting.add(app.id);
    }

    let firstActiveOutcomeDate: Date | null = null;
    let firstRecruiterDate: Date | null = null;
    let firstInterviewReqDate: Date | null = null;
    let firstInterviewSchedDate: Date | null = null;
    let firstOfferDate: Date | null = null;
    let firstRejectionDate: Date | null = null;

    for (const evt of app.outcomeEvents) {
      // Date range filtering for recent events list
      const effectiveDate = evt.occurredAt || evt.recordedAt;
      let inDateRange = true;
      if (dateRange.from && effectiveDate < dateRange.from) inDateRange = false;
      if (dateRange.to && effectiveDate > dateRange.to) inDateRange = false;

      // Outcome type filtering for recent list
      let matchesType = true;
      if (filters.outcomeType && filters.outcomeType !== "ALL") {
        if (filters.outcomeType === "CANDIDATE_REPORTED_ONLY") {
          matchesType = evt.provenance === "CANDIDATE_REPORTED";
        } else {
          matchesType = evt.outcomeType === filters.outcomeType;
        }
      }

      if (inDateRange && matchesType) {
        recentList.push({
          id: evt.id,
          applicationId: app.id,
          outcomeType: evt.outcomeType,
          outcomeLabel: staffOutcomeLabel(evt.outcomeType),
          provenance: evt.provenance,
          provenanceLabel: staffProvenanceLabel(evt.provenance),
          recordedAt: evt.recordedAt.toISOString(),
          occurredAt: evt.occurredAt?.toISOString() ?? null,
          isRecordedFallback: evt.occurredAt == null,
          candidateName: `${app.candidate.user.firstName || ""} ${app.candidate.user.lastName || ""}`.trim() || app.candidate.user.email,
          candidateEmail: app.candidate.user.email,
          companyName: app.job.companyName,
          jobTitle: app.job.title,
          ownerName: empName,
          ownerEmployeeId: app.assignedEmployeeId,
          teamKey: app.assignedTeamKey,
          hasEvidence: Boolean((evt.evidenceText && evt.evidenceText.trim()) || evt.evidenceStoragePath),
          applicationStatus: app.status,
        });
      }

      if (evt.correctionState === "ACTIVE") {
        if (evt.provenance === "CANDIDATE_REPORTED") {
          candidateReportedEventsCount++;
        }
        if (evt.provenance === "STAFF_VERIFIED") {
          staffVerifiedEventsCount++;
        }

        const evtDate = evt.occurredAt || evt.recordedAt;
        if (evt.occurredAt == null) hasRecordedTimingFallback = true;

        if (!firstActiveOutcomeDate || evtDate < firstActiveOutcomeDate) {
          firstActiveOutcomeDate = evtDate;
        }

        if (evt.outcomeType === "RECRUITER_CONTACT") {
          recruiterContactAppIds.add(app.id);
          if (!firstRecruiterDate || evtDate < firstRecruiterDate) {
            firstRecruiterDate = evtDate;
          }
        } else if (evt.outcomeType === "INTERVIEW_REQUESTED") {
          interviewRequestedAppIds.add(app.id);
          anyInterviewAppIds.add(app.id);
          employeeStats.get(empKey)!.interviews.add(app.id);
          teamStats.get(teamKey)!.interviews.add(app.id);
          managerStats.get(mgrKey)!.interviews.add(app.id);
          employerStats.get(employerKey)!.interviews.add(app.id);
          if (!firstInterviewReqDate || evtDate < firstInterviewReqDate) {
            firstInterviewReqDate = evtDate;
          }
        } else if (evt.outcomeType === "INTERVIEW_SCHEDULED") {
          interviewScheduledAppIds.add(app.id);
          anyInterviewAppIds.add(app.id);
          employeeStats.get(empKey)!.interviews.add(app.id);
          teamStats.get(teamKey)!.interviews.add(app.id);
          managerStats.get(mgrKey)!.interviews.add(app.id);
          employerStats.get(employerKey)!.interviews.add(app.id);
          if (!firstInterviewSchedDate || evtDate < firstInterviewSchedDate) {
            firstInterviewSchedDate = evtDate;
          }
        } else if (evt.outcomeType === "OFFER_RECEIVED") {
          offerReceivedAppIds.add(app.id);
          employeeStats.get(empKey)!.offers.add(app.id);
          teamStats.get(teamKey)!.offers.add(app.id);
          managerStats.get(mgrKey)!.offers.add(app.id);
          employerStats.get(employerKey)!.offers.add(app.id);
          if (!firstOfferDate || evtDate < firstOfferDate) {
            firstOfferDate = evtDate;
          }
        } else if (
          evt.outcomeType === "EMPLOYER_REJECTION" &&
          evt.provenance !== "CANDIDATE_REPORTED"
        ) {
          employerRejectionAppIds.add(app.id);
          employeeStats.get(empKey)!.rejections.add(app.id);
          teamStats.get(teamKey)!.rejections.add(app.id);
          managerStats.get(mgrKey)!.rejections.add(app.id);
          employerStats.get(employerKey)!.rejections.add(app.id);
          if (!firstRejectionDate || evtDate < firstRejectionDate) {
            firstRejectionDate = evtDate;
          }
        }
      }
    }

    // Accumulate timing differences if submission exists
    if (earliestSubmission) {
      const subMs = earliestSubmission.submittedAt.getTime();

      const diffDays = (d: Date | null) => {
        if (!d) return null;
        const diff = (d.getTime() - subMs) / (1000 * 60 * 60 * 24);
        return diff >= 0 ? diff : 0;
      };

      const dFirst = diffDays(firstActiveOutcomeDate);
      if (dFirst !== null) daysToFirstOutcome.push(dFirst);

      const dRecruiter = diffDays(firstRecruiterDate);
      if (dRecruiter !== null) daysToRecruiterContact.push(dRecruiter);

      const dIntReq = diffDays(firstInterviewReqDate);
      if (dIntReq !== null) daysToInterviewRequest.push(dIntReq);

      const dIntSched = diffDays(firstInterviewSchedDate);
      if (dIntSched !== null) daysToInterviewScheduled.push(dIntSched);

      const dOffer = diffDays(firstOfferDate);
      if (dOffer !== null) daysToOffer.push(dOffer);

      const dReject = diffDays(firstRejectionDate);
      if (dReject !== null) daysToEmployerRejection.push(dReject);
    }
  }

  const avg = (arr: number[]): number | null => {
    if (arr.length === 0) return null;
    const sum = arr.reduce((a, b) => a + b, 0);
    return Math.round((sum / arr.length) * 10) / 10;
  };

  const metrics: OutcomeMetricsSummaryDTO = {
    submittedApplicationsCount: submittedAppsCount,
    activeApplicationsCount: activeAppsCount,
    closedApplicationsCount: closedAppsCount,
    awaitingOutcomeCount,
    recruiterContactsCount: recruiterContactAppIds.size,
    interviewRequestsCount: interviewRequestedAppIds.size,
    interviewsScheduledCount: interviewScheduledAppIds.size,
    offersReceivedCount: offerReceivedAppIds.size,
    employerRejectionsCount: employerRejectionAppIds.size,
    candidateReportedCount: candidateReportedEventsCount,
    staffVerifiedCount: staffVerifiedEventsCount,
  };

  const calcRate = (numerator: number, denominator: number): number => {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 1000) / 10;
  };

  const conversion: OutcomeConversionRatesDTO = {
    recruiterContactRate: calcRate(recruiterContactAppIds.size, submittedAppsCount),
    interviewRequestRate: calcRate(interviewRequestedAppIds.size, submittedAppsCount),
    interviewScheduledRate: calcRate(interviewScheduledAppIds.size, submittedAppsCount),
    interviewConversionRate: calcRate(anyInterviewAppIds.size, submittedAppsCount),
    offerRate: calcRate(offerReceivedAppIds.size, submittedAppsCount),
    employerRejectionRate: calcRate(employerRejectionAppIds.size, submittedAppsCount),
  };

  const timing: OutcomeTimingDTO = {
    avgDaysToFirstOutcome: avg(daysToFirstOutcome),
    avgDaysToRecruiterContact: avg(daysToRecruiterContact),
    avgDaysToInterviewRequest: avg(daysToInterviewRequest),
    avgDaysToInterviewScheduled: avg(daysToInterviewScheduled),
    avgDaysToOffer: avg(daysToOffer),
    avgDaysToEmployerRejection: avg(daysToEmployerRejection),
    hasRecordedTimingFallback,
  };

  // Sort recent outcomes desc
  recentList.sort((a, b) => {
    const timeA = new Date(a.occurredAt || a.recordedAt).getTime();
    const timeB = new Date(b.occurredAt || b.recordedAt).getTime();
    return timeB - timeA;
  });

  const limitRecent = Math.min(Math.max(filters.limitRecent || 25, 1), 50);
  const boundedRecent = recentList.slice(0, limitRecent);

  // Build Breakdown items
  const mapBreakdown = (
    map: Map<string, { label: string; submitted: Set<string>; interviews: Set<string>; offers: Set<string>; rejections: Set<string>; awaiting: Set<string> }>
  ): OutcomeAttributionItemDTO[] => {
    return Array.from(map.entries())
      .map(([key, data]) => ({
        dimensionKey: key,
        dimensionLabel: data.label,
        submittedCount: data.submitted.size,
        interviewsCount: data.interviews.size,
        offersCount: data.offers.size,
        rejectionsCount: data.rejections.size,
        awaitingCount: data.awaiting.size,
        conversionRate: calcRate(data.offers.size, data.submitted.size),
      }))
      .sort((a, b) => b.submittedCount - a.submittedCount);
  };

  // Load available filters
  const members = await tx.membership.findMany({
    where: { organizationId: ctx.organizationId, status: "ACTIVE" },
    select: {
      userId: true,
      team: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  const availableEmployees = members.map((m) => ({
    id: m.userId,
    name: `${m.user.firstName || ""} ${m.user.lastName || ""}`.trim() || m.user.email,
  }));

  const teamKeySet = new Set<string>();
  for (const m of members) {
    if (m.team) teamKeySet.add(m.team);
  }
  for (const a of apps) {
    if (a.assignedTeamKey) teamKeySet.add(a.assignedTeamKey);
  }

  const availableTeams = Array.from(teamKeySet).map((k) => ({
    key: k,
    name: k,
  }));

  const employerKeySet = new Set<string>();
  for (const a of apps) {
    if (a.job.companyName) employerKeySet.add(a.job.companyName.trim());
  }

  return {
    roleScope: ctx.role,
    metrics,
    conversion,
    timing,
    recentOutcomes: boundedRecent,
    employeeBreakdown: mapBreakdown(employeeStats),
    teamBreakdown: mapBreakdown(teamStats),
    managerBreakdown: mapBreakdown(managerStats),
    employerBreakdown: mapBreakdown(employerStats),
    availableFilters: {
      employees: availableEmployees,
      teams: availableTeams,
      employers: Array.from(employerKeySet).sort(),
    },
  };
}

/**
 * Loads safe outcome detail for authorized staff modal/view.
 */
export async function getOutcomeDetail(
  tx: Tx,
  ctx: AuthenticatedContext,
  outcomeId: string
): Promise<OutcomeDetailDTO> {
  if (ctx.role === Role.CANDIDATE) {
    throw new AuthorizationError("Candidates cannot access staff outcome details.");
  }

  const event = await tx.applicationOutcomeEvent.findFirst({
    where: { id: outcomeId, organizationId: ctx.organizationId },
    include: {
      actor: { select: { firstName: true, lastName: true, email: true } },
      application: {
        include: {
          job: { select: { title: true, companyName: true } },
          candidate: { select: { user: { select: { firstName: true, lastName: true, email: true } } } },
          assignedEmployee: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!event) {
    throw new AuthorizationError("Outcome not found or unauthorized.");
  }

  const authProfile = await resolveAssignmentAuthority(tx, ctx);
  const allowed = await (await import("./assignment-authority")).applicationInStructuralScope(
    tx,
    ctx,
    event.application,
    authProfile
  );

  if (!allowed && ctx.role !== Role.ADMIN) {
    throw new AuthorizationError("You are not authorized to view this outcome detail.");
  }

  const app = event.application;
  const ownerName = app.assignedEmployee
    ? `${app.assignedEmployee.firstName || ""} ${app.assignedEmployee.lastName || ""}`.trim() || app.assignedEmployee.email
    : "Unassigned";

  const actorName = `${event.actor.firstName || ""} ${event.actor.lastName || ""}`.trim() || event.actor.email;
  const candidateName = `${app.candidate.user.firstName || ""} ${app.candidate.user.lastName || ""}`.trim() || app.candidate.user.email;

  return {
    id: event.id,
    applicationId: app.id,
    outcomeType: event.outcomeType,
    outcomeLabel: staffOutcomeLabel(event.outcomeType),
    provenance: event.provenance,
    provenanceLabel: staffProvenanceLabel(event.provenance),
    recordedAt: event.recordedAt.toISOString(),
    occurredAt: event.occurredAt?.toISOString() ?? null,
    isRecordedFallback: event.occurredAt == null,
    notes: event.notes,
    hasEvidence: Boolean((event.evidenceText && event.evidenceText.trim()) || event.evidenceStoragePath),
    evidenceShareable: event.evidenceShareable,
    correctionState: event.correctionState,
    candidateName,
    candidateEmail: app.candidate.user.email,
    companyName: app.job.companyName,
    jobTitle: app.job.title,
    applicationStatus: app.status,
    ownerName,
    actorName,
  };
}
