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
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
      );
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const submittedWhere = {
        organizationId: ctx.organizationId,
        status: ApplicationStatus.SUBMITTED,
      } as const;

      // Phase 10: Parallelize independent first-paint queries (was sequential waterfall).
      // Lean submitted select replaces separate distinct-candidate + full include scans.
      const [candRecords, todayCount, weekCount, monthCount, submittedLean] = await Promise.all([
        tx.candidate.findMany({
          where: {
            organizationId: ctx.organizationId,
            status: { not: "ARCHIVED" },
          },
          select: {
            id: true,
            status: true,
            applicationAuthorizationMode: true,
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
          orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }],
          take: 500,
        }),
        tx.application.count({
          where: { ...submittedWhere, createdAt: { gte: startOfToday } },
        }),
        tx.application.count({
          where: { ...submittedWhere, createdAt: { gte: startOfWeek } },
        }),
        tx.application.count({
          where: { ...submittedWhere, createdAt: { gte: startOfMonth } },
        }),
        tx.application.findMany({
          where: submittedWhere,
          select: {
            candidateId: true,
            job: { select: { source: true } },
          },
          // Bound histogram scan; desk metrics remain operationally useful within window
          take: 2000,
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const candidatesList: CandidateOption[] = candRecords.map((c) => ({
        id: c.id,
        fullName:
          `${c.user.firstName || ""} ${c.user.lastName || ""}`.trim() || c.user.email,
        email: c.user.email,
        status: c.status,
        applicationAuthorizationMode: c.applicationAuthorizationMode,
      }));

      const candidateIds = new Set<string>();
      const sourceCounts: Record<string, number> = {};
      for (const app of submittedLean) {
        candidateIds.add(app.candidateId);
        const src = app.job.source || "Other";
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      }

      const operationalMetrics: OperationalMetrics = {
        todayCount,
        weekCount,
        monthCount,
        activeCandidatesWorked: candidateIds.size,
        sourceCounts,
      };

      let candSummary: CandidateLogSummary | null = null;
      if (selectedCandidateId) {
        const targetCand = candRecords.find((c) => c.id === selectedCandidateId);
        if (targetCand) {
          const candidateScope = {
            candidateId: targetCand.id,
            organizationId: ctx.organizationId,
          } as const;

          // Candidate-specific queries are independent of each other — parallelize.
          const [cToday, cWeek, cTotal, cRecent] = await Promise.all([
            tx.application.count({
              where: {
                ...candidateScope,
                status: ApplicationStatus.SUBMITTED,
                createdAt: { gte: startOfToday },
              },
            }),
            tx.application.count({
              where: {
                ...candidateScope,
                status: ApplicationStatus.SUBMITTED,
                createdAt: { gte: startOfWeek },
              },
            }),
            tx.application.count({
              where: {
                ...candidateScope,
                status: ApplicationStatus.SUBMITTED,
              },
            }),
            tx.application.findMany({
              where: candidateScope,
              select: {
                id: true,
                status: true,
                createdAt: true,
                job: {
                  select: {
                    title: true,
                    companyName: true,
                    source: true,
                    location: true,
                    isRemote: true,
                    salaryMin: true,
                    salaryMax: true,
                  },
                },
                submissions: {
                  orderBy: { attemptNumber: "desc" },
                  take: 1,
                  select: { submittedAt: true },
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
