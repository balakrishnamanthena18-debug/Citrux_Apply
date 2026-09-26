import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { ApplicationStatus } from "@/generated/prisma";
import {
  ApplicationLogWorkbench,
  type CandidateOption,
  type OperationalMetrics,
  type CandidateLogSummary,
} from "@/components/application/ApplicationLogWorkbench";

interface Props {
  searchParams?: Promise<{
    candidateId?: string;
  }>;
}

export default async function EmployeeApplicationLogPage({ searchParams }: Props) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const resolvedParams = searchParams ? await searchParams : {};
  const selectedCandidateId = resolvedParams.candidateId || "";

  const { candidates, metrics, initialCandidateSummary } = await withRlsContext(
    ctx.userId,
    async (tx) => {
      // 1. Fetch available candidates in organization
      const candRecords = await tx.candidate.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: { not: "ARCHIVED" },
        },
        include: { user: true },
        orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
      });

      const candidatesList: CandidateOption[] = candRecords.map((c) => ({
        id: c.id,
        fullName:
          `${c.user.firstName || ""} ${c.user.lastName || ""}`.trim() || c.user.email,
        email: c.user.email,
        status: c.status,
        applicationAuthorizationMode: c.applicationAuthorizationMode,
      }));

      // 2. Authoritative Operational Derived Metrics
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
      );
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [todayCount, weekCount, monthCount, activeCandidates, submittedApps] =
        await Promise.all([
          tx.application.count({
            where: {
              organizationId: ctx.organizationId,
              status: ApplicationStatus.SUBMITTED,
              createdAt: { gte: startOfToday },
            },
          }),
          tx.application.count({
            where: {
              organizationId: ctx.organizationId,
              status: ApplicationStatus.SUBMITTED,
              createdAt: { gte: startOfWeek },
            },
          }),
          tx.application.count({
            where: {
              organizationId: ctx.organizationId,
              status: ApplicationStatus.SUBMITTED,
              createdAt: { gte: startOfMonth },
            },
          }),
          tx.application.findMany({
            where: {
              organizationId: ctx.organizationId,
              status: ApplicationStatus.SUBMITTED,
            },
            distinct: ["candidateId"],
            select: { candidateId: true },
          }),
          tx.application.findMany({
            where: {
              organizationId: ctx.organizationId,
              status: ApplicationStatus.SUBMITTED,
            },
            include: { job: { select: { source: true } } },
          }),
        ]);

      const sourceCounts: Record<string, number> = {};
      for (const app of submittedApps) {
        const src = app.job.source || "Other";
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      }

      const operationalMetrics: OperationalMetrics = {
        todayCount,
        weekCount,
        monthCount,
        activeCandidatesWorked: activeCandidates.length,
        sourceCounts,
      };

      // 3. Initial Candidate Summary if candidateId provided
      let candSummary: CandidateLogSummary | null = null;
      if (selectedCandidateId) {
        const targetCand = candRecords.find((c) => c.id === selectedCandidateId);
        if (targetCand) {
          const [cToday, cWeek, cTotal, cRecent] = await Promise.all([
            tx.application.count({
              where: {
                candidateId: targetCand.id,
                organizationId: ctx.organizationId,
                status: ApplicationStatus.SUBMITTED,
                createdAt: { gte: startOfToday },
              },
            }),
            tx.application.count({
              where: {
                candidateId: targetCand.id,
                organizationId: ctx.organizationId,
                status: ApplicationStatus.SUBMITTED,
                createdAt: { gte: startOfWeek },
              },
            }),
            tx.application.count({
              where: {
                candidateId: targetCand.id,
                organizationId: ctx.organizationId,
                status: ApplicationStatus.SUBMITTED,
              },
            }),
            tx.application.findMany({
              where: {
                candidateId: targetCand.id,
                organizationId: ctx.organizationId,
              },
              include: {
                job: true,
                submissions: {
                  orderBy: { attemptNumber: "desc" },
                  take: 1,
                },
              },
              orderBy: { createdAt: "desc" },
              take: 10,
            }),
          ]);

          candSummary = {
            candidate: {
              id: targetCand.id,
              fullName:
                `${targetCand.user.firstName || ""} ${targetCand.user.lastName || ""}`.trim() ||
                targetCand.user.email,
              email: targetCand.user.email,
              status: targetCand.status,
              applicationAuthorizationMode: targetCand.applicationAuthorizationMode,
            },
            metrics: {
              today: cToday,
              thisWeek: cWeek,
              totalSubmitted: cTotal,
            },
            recentApplications: cRecent.map((app) => ({
              id: app.id,
              title: app.job.title,
              companyName: app.job.companyName,
              source: app.job.source || "Other",
              location: app.job.location || (app.job.isRemote ? "Remote" : "On-site"),
              isRemote: app.job.isRemote,
              salaryMin: app.job.salaryMin,
              salaryMax: app.job.salaryMax,
              status: app.status,
              appliedAt:
                app.submissions[0]?.submittedAt?.toISOString() ||
                app.createdAt.toISOString(),
            })),
          };
        }
      }

      return {
        candidates: candidatesList,
        metrics: operationalMetrics,
        initialCandidateSummary: candSummary,
      };
    }
  );

  return (
    <ApplicationLogWorkbench
      candidates={candidates}
      metrics={metrics}
      initialSelectedCandidateId={selectedCandidateId}
      initialCandidateSummary={initialCandidateSummary}
    />
  );
}
