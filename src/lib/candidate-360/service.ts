/**
 * Phase 7E.1 — Candidate 360 Composition Service
 * Read-Only composition layer implementing Phase 7D / 7D.1 Product Contract.
 */

import { withRlsContext } from "@/lib/db/rls";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { Role, CandidateJobMatchStatus, CandidateJobMatchCategory } from "@/generated/prisma";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import { getCandidateCareerIntelligence } from "@/lib/career/service";
import type {
  Candidate360DTO,
  Candidate360OverviewDTO,
  ResumeIntelligenceSummaryDTO,
  ApplicationIntelligenceSummaryDTO,
  JobMatchingSummaryDTO,
  StaffOperationalContextDTO,
} from "./types";

/**
 * Generates a complete, bounded, read-only Candidate 360 DTO.
 *
 * @param candidateId - UUID of the candidate
 * @param ctx - Authenticated caller context
 */
export async function getCandidate360(
  candidateId: string,
  ctx: AuthenticatedContext
): Promise<Candidate360DTO> {
  if (!ctx || !ctx.userId || !ctx.organizationId) {
    throw new AuthorizationError("Authentication context is required");
  }

  // 1. Delegate Career Intelligence derivation to authoritative Phase 7C service
  const careerIntelligence = await getCandidateCareerIntelligence(candidateId, ctx);

  // 2. Compose remaining domain summaries within database context
  return withRlsContext(ctx.userId, async (tx) => {
    const candidate = await tx.candidate.findFirst({
      where: {
        id: candidateId,
        organizationId: ctx.organizationId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
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
      },
    });

    if (!candidate) {
      throw new NotFoundError("Candidate profile not found");
    }

    // Role enforcement
    if (ctx.role === Role.CANDIDATE && candidate.userId !== ctx.userId) {
      throw new AuthorizationError("Candidates may only access their own Candidate 360 profile");
    }

    const isStaff = ctx.role === Role.EMPLOYEE || ctx.role === Role.ADMIN;

    // 3. Parallel bounded reads of supporting subsystem summaries
    const [
      defaultResumeDoc,
      latestResumeReview,
      recentApplications,
      recentMatches,
      staffMetrics,
    ] = await Promise.all([
      // Phase 4: Default Resume Document
      tx.candidateDocument.findFirst({
        where: {
          candidateId: candidate.id,
          documentType: "RESUME",
          isDefault: true,
        },
        select: {
          id: true,
          title: true,
        },
      }),

      // Phase 4: Latest Resume Review (Summary only)
      tx.resumeReview.findFirst({
        where: {
          candidateId: candidate.id,
          organizationId: ctx.organizationId,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          overallLabel: true,
          atsReadability: true,
          completedAt: true,
        },
      }),

      // Phase 2: Recent Applications and Readiness Results (Bounded to 10)
      tx.application.findMany({
        where: {
          candidateId: candidate.id,
          organizationId: ctx.organizationId,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          createdAt: true,
          job: {
            select: {
              title: true,
              companyName: true,
            },
          },
          readinessResults: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              readinessState: true,
              blockers: true,
              warnings: true,
            },
          },
        },
      }),

      // Phase 5: Job Matches (Bounded to 10)
      tx.candidateJobMatch.findMany({
        where: {
          candidateId: candidate.id,
          organizationId: ctx.organizationId,
          status: { in: [CandidateJobMatchStatus.SUCCEEDED, CandidateJobMatchStatus.QUEUED, CandidateJobMatchStatus.RUNNING, CandidateJobMatchStatus.STALE] },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          job: {
            select: {
              title: true,
              companyName: true,
              location: true,
              isRemote: true,
            },
          },
        },
      }),

      // Operational Staff Context (Counts only, zero sensitive internals)
      isStaff
        ? Promise.all([
            tx.internalNote.count({
              where: { candidateId: candidate.id, organizationId: ctx.organizationId },
            }),
            tx.task.count({
              where: {
                candidateId: candidate.id,
                organizationId: ctx.organizationId,
                status: { notIn: ["COMPLETED", "CANCELED"] },
              },
            }),
            tx.candidateFactAttestation.count({
              where: { candidateId: candidate.id, organizationId: ctx.organizationId },
            }),
          ])
        : Promise.resolve([0, 0, 0]),
    ]);

    // 4. Construct Overview DTO
    const candidateName =
      candidate.user.firstName || candidate.user.lastName
        ? `${candidate.user.firstName || ""} ${candidate.user.lastName || ""}`.trim()
        : null;

    const locationParts = [candidate.city, candidate.state, candidate.country].filter(Boolean);
    const locationStr = locationParts.length > 0 ? locationParts.join(", ") : null;

    const assignedSpecialist = candidate.assignedEmployee
      ? {
          id: candidate.assignedEmployee.id,
          name:
            [candidate.assignedEmployee.firstName, candidate.assignedEmployee.lastName]
              .filter(Boolean)
              .join(" ") || candidate.assignedEmployee.email,
          email: candidate.assignedEmployee.email,
        }
      : null;

    const overview: Candidate360OverviewDTO = {
      id: candidate.id,
      fullName: candidateName,
      email: candidate.user.email,
      phone: candidate.phone,
      headline: candidate.headline,
      location: locationStr,
      workAuthorization: candidate.workAuthorization,
      requiresSponsorship: candidate.requiresSponsorship,
      verificationStatus: candidate.verificationStatus,
      assignedSpecialist,
      totalYearsExperience: candidate.totalYearsExperience
        ? Number(candidate.totalYearsExperience)
        : null,
      applicationAuthMode: candidate.applicationAuthorizationMode,
    };

    // 5. Construct Phase 4 Resume Summary DTO
    let resumeStatus: ResumeIntelligenceSummaryDTO["status"] = "NOT_STARTED";
    let atsLabel: string | null = null;
    let atsSummary: string | null = null;
    let findingsCount = 0;

    if (latestResumeReview) {
      if (latestResumeReview.status === "READY") resumeStatus = "READY";
      else if (latestResumeReview.status === "ANALYZING") resumeStatus = "ANALYZING";
      else if (latestResumeReview.status === "FAILED") resumeStatus = "FAILED";
      else if (latestResumeReview.status === "STALE") resumeStatus = "STALE";
      else resumeStatus = "QUEUED";

      if (
        latestResumeReview.atsReadability &&
        typeof latestResumeReview.atsReadability === "object"
      ) {
        const ats = latestResumeReview.atsReadability as Record<string, unknown>;
        atsLabel = typeof ats.label === "string" ? ats.label : null;
        atsSummary = typeof ats.summary === "string" ? ats.summary : null;
        if (Array.isArray(ats.findings)) {
          findingsCount = ats.findings.length;
        }
      }
    }

    const resumeSummary: ResumeIntelligenceSummaryDTO = {
      hasResume: Boolean(defaultResumeDoc),
      status: resumeStatus,
      overallLabel: latestResumeReview?.overallLabel || null,
      atsLabel,
      atsSummary,
      findingsCount,
      documentTitle: defaultResumeDoc?.title || null,
      reviewedAt: latestResumeReview?.completedAt?.toISOString() || null,
    };

    // 6. Construct Phase 2 Application Intelligence Summary DTO
    let readyCount = 0;
    let blockedCount = 0;
    let warningCount = 0;

    const appItems = recentApplications.map((app) => {
      const latestReadiness = app.readinessResults[0];
      const readinessState = latestReadiness?.readinessState || null;
      const blockersCount = Array.isArray(latestReadiness?.blockers)
        ? latestReadiness.blockers.length
        : 0;
      const warningsCount = Array.isArray(latestReadiness?.warnings)
        ? latestReadiness.warnings.length
        : 0;

      if (readinessState === "READY_FOR_MANAGED" || readinessState === "READY_FOR_CANDIDATE_APPROVAL") {
        readyCount++;
      } else if (readinessState === "BLOCKED" || blockersCount > 0) {
        blockedCount++;
      } else if (warningsCount > 0) {
        warningCount++;
      }

      return {
        id: app.id,
        jobTitle: app.job.title,
        companyName: app.job.companyName,
        status: app.status,
        readinessState,
        blockersCount,
        warningsCount,
        createdAt: app.createdAt.toISOString(),
      };
    });

    const applicationSummary: ApplicationIntelligenceSummaryDTO = {
      totalApplications: recentApplications.length,
      readyCount,
      blockedCount,
      warningCount,
      recentApplications: appItems,
    };

    // 7. Construct Phase 5 Job Matching Summary DTO
    let strongMatchCount = 0;
    let goodMatchCount = 0;
    let savedOpportunitiesCount = 0;
    let requestedOpportunitiesCount = 0;

    const matchItems = recentMatches.map((m) => {
      const categoryStr = m.category ? String(m.category) : "INSUFFICIENT_INFORMATION";
      const isSaved = Boolean(m.savedAt);
      const isRequested = Boolean(m.applicationRequestedAt);

      if (m.category === CandidateJobMatchCategory.STRONG_MATCH) strongMatchCount++;
      else if (m.category === CandidateJobMatchCategory.GOOD_MATCH) goodMatchCount++;

      if (isSaved) savedOpportunitiesCount++;
      if (isRequested) requestedOpportunitiesCount++;

      return {
        jobId: m.jobId,
        jobTitle: m.job.title,
        companyName: m.job.companyName,
        location: m.job.location,
        isRemote: m.job.isRemote,
        matchCategory: categoryStr,
        isSaved,
        isRequested,
      };
    });

    const matchingSummary: JobMatchingSummaryDTO = {
      totalRelevantMatches: recentMatches.length,
      strongMatchCount,
      goodMatchCount,
      savedOpportunitiesCount,
      requestedOpportunitiesCount,
      topMatches: matchItems,
    };

    // 8. Staff Operational Context (Excluded from candidate payloads)
    let staffContext: StaffOperationalContextDTO | undefined;
    if (isStaff) {
      staffContext = {
        internalNotesCount: staffMetrics[0] ?? 0,
        activeTasksCount: staffMetrics[1] ?? 0,
        attestationsCount: staffMetrics[2] ?? 0,
      };
    }

    // 9. Assemble Safe Composition DTO
    return {
      candidate: overview,
      career: careerIntelligence,
      resume: resumeSummary,
      applications: applicationSummary,
      matching: matchingSummary,
      outcomes: careerIntelligence.outcomesSummary,
      staffContext,
      freshness: {
        careerVersion: careerIntelligence.freshness.sourceDataVersion,
        computedAt: new Date().toISOString(),
      },
    };
  });
}
