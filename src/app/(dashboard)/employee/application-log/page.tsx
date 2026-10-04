import { requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withAuthenticatedData } from "@/lib/db/authenticated-data";
import { ApplicationStatus, JobStatus } from "@/generated/prisma";
import {
  ApplicationLogWorkbench,
  type CandidateOption,
  type JobOption,
  type OperationalMetrics,
  type CandidateLogSummary,
} from "@/components/application/ApplicationLogWorkbench";

interface Props {
  searchParams?: Promise<{
    candidateId?: string;
    jobId?: string;
  }>;
}

const DESK_SELECTOR_LIMIT = 40;

function mapCandidate(c: {
  id: string;
  status: string;
  applicationAuthorizationMode: string;
  user: { firstName: string | null; lastName: string | null; email: string };
}): CandidateOption {
  return {
    id: c.id,
    fullName: `${c.user.firstName || ""} ${c.user.lastName || ""}`.trim() || c.user.email,
    email: c.user.email,
    status: c.status,
    applicationAuthorizationMode: c.applicationAuthorizationMode,
  };
}

function mapJob(j: {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  isRemote: boolean;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  source: string | null;
  externalUrl: string | null;
  jobDescription?: string | null;
}): JobOption {
  return {
    id: j.id,
    title: j.title,
    companyName: j.companyName,
    location: j.location,
    isRemote: j.isRemote,
    employmentType: j.employmentType,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    salaryCurrency: j.salaryCurrency || "USD",
    source: j.source,
    externalUrl: j.externalUrl,
    jobDescription: j.jobDescription ?? null,
  };
}

const jobListSelect = {
  id: true,
  title: true,
  companyName: true,
  location: true,
  isRemote: true,
  employmentType: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  source: true,
  externalUrl: true,
} as const;

export default async function EmployeeApplicationLogPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const selectedCandidateId = resolvedParams.candidateId || "";
  const selectedJobId = resolvedParams.jobId || "";

  const { data } = await withAuthenticatedData(async (tx, auth) => {
    requireEmployeeOrAdmin(auth);

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
      organizationId: auth.organizationId,
      status: ApplicationStatus.SUBMITTED,
    } as const;

    const [
      candRecords,
      openJobs,
      openJobsCount,
      todayCount,
      weekCount,
      monthCount,
      activeCandidateCountRows,
    ] = await Promise.all([
      tx.candidate.findMany({
        where: {
          organizationId: auth.organizationId,
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
        take: DESK_SELECTOR_LIMIT,
      }),
      tx.job.findMany({
        where: {
          organizationId: auth.organizationId,
          status: JobStatus.OPEN,
        },
        select: jobListSelect,
        orderBy: { createdAt: "desc" },
        take: DESK_SELECTOR_LIMIT,
      }),
      tx.job.count({
        where: {
          organizationId: auth.organizationId,
          status: JobStatus.OPEN,
        },
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
      tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "candidateId")::bigint AS count
        FROM applications
        WHERE "organizationId" = ${auth.organizationId}::uuid
          AND status = 'SUBMITTED'
      `,
    ]);

    let candidatesList = candRecords.map(mapCandidate);
    let jobsList = openJobs.map((j) => mapJob(j));

    // Ensure URL-selected entities are present even if outside the initial page.
    if (
      selectedCandidateId &&
      !candidatesList.some((c) => c.id === selectedCandidateId)
    ) {
      const extra = await tx.candidate.findFirst({
        where: {
          id: selectedCandidateId,
          organizationId: auth.organizationId,
          status: { not: "ARCHIVED" },
        },
        select: {
          id: true,
          status: true,
          applicationAuthorizationMode: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      });
      if (extra) candidatesList = [mapCandidate(extra), ...candidatesList];
    }

    let selectedJobDetail: JobOption | null = null;
    if (selectedJobId) {
      const job = await tx.job.findFirst({
        where: {
          id: selectedJobId,
          organizationId: auth.organizationId,
          status: JobStatus.OPEN,
        },
        select: { ...jobListSelect, jobDescription: true },
      });
      if (job) {
        selectedJobDetail = mapJob(job);
        if (!jobsList.some((j) => j.id === job.id)) {
          jobsList = [selectedJobDetail, ...jobsList];
        } else {
          jobsList = jobsList.map((j) => (j.id === job.id ? selectedJobDetail! : j));
        }
      }
    }

    const operationalMetrics: OperationalMetrics = {
      todayCount,
      weekCount,
      monthCount,
      activeCandidatesWorked: Number(activeCandidateCountRows[0]?.count ?? 0),
      openJobsCount,
      sourceCounts: {},
    };

    let candSummary: CandidateLogSummary | null = null;
    if (selectedCandidateId) {
      const targetCand =
        candidatesList.find((c) => c.id === selectedCandidateId) ||
        (await tx.candidate
          .findFirst({
            where: {
              id: selectedCandidateId,
              organizationId: auth.organizationId,
            },
            select: {
              id: true,
              status: true,
              applicationAuthorizationMode: true,
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          })
          .then((c) => (c ? mapCandidate(c) : null)));

      if (targetCand) {
        const candidateScope = {
          candidateId: targetCand.id,
          organizationId: auth.organizationId,
        } as const;

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
            fullName: targetCand.fullName,
            email: targetCand.email,
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
      jobs: jobsList,
      metrics: operationalMetrics,
      initialCandidateSummary: candSummary,
    };
  });

  return (
    <ApplicationLogWorkbench
      candidates={data.candidates}
      jobs={data.jobs}
      metrics={data.metrics}
      initialSelectedCandidateId={selectedCandidateId}
      initialSelectedJobId={selectedJobId}
      initialCandidateSummary={data.initialCandidateSummary}
    />
  );
}
