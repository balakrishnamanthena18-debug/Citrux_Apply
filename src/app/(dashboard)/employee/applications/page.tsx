import { requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withAuthenticatedData } from "@/lib/db/authenticated-data";
import {
  EmployeeApplicationsWorkbench,
  type ApplicationItem,
  type CandidateOption,
  type JobOption,
} from "@/components/application/EmployeeApplicationsWorkbench";
import type { ApplicationStatus, Prisma } from "@/generated/prisma";

interface Props {
  searchParams?: Promise<{
    search?: string;
    status?: string;
    candidateId?: string;
    source?: string;
    queue?: string;
    sort?: string;
  }>;
}

const IN_PROGRESS: ApplicationStatus[] = [
  "DISCOVERED",
  "QUALIFIED",
  "PREPARING",
  "REVIEW",
];
const NEEDS_ATTENTION: ApplicationStatus[] = [
  "AWAITING_APPROVAL",
  "SUBMISSION_ISSUE",
  "REVIEW_REQUIRED",
  "CORRECTION_APPROVED",
  "RESUBMISSION",
  "FAILED",
];

export default async function EmployeeApplicationsPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const searchParam = resolvedParams.search || "";
  const statusParam = resolvedParams.status || "";
  const candidateParam = resolvedParams.candidateId || "";
  const sourceParam = resolvedParams.source || "";
  const queueParam = resolvedParams.queue || "all";
  const sortParam = resolvedParams.sort || "newest";

  const { ctx, data } = await withAuthenticatedData(async (tx, auth) => {
    requireEmployeeOrAdmin(auth);

    const orgWhere: Prisma.ApplicationWhereInput = {
      organizationId: auth.organizationId,
    };

    // Bounded slim list for InstantTabs (client queue switches stay 0ms).
    // Optional URL filters narrow the SQL projection without fat jobDescription.
    const listWhere: Prisma.ApplicationWhereInput = { ...orgWhere };
    if (statusParam) listWhere.status = statusParam as ApplicationStatus;
    if (candidateParam) listWhere.candidateId = candidateParam;
    if (sourceParam) listWhere.job = { source: sourceParam };
    if (searchParam.trim()) {
      const q = searchParam.trim();
      listWhere.OR = [
        { job: { title: { contains: q, mode: "insensitive" } } },
        { job: { companyName: { contains: q, mode: "insensitive" } } },
        { job: { location: { contains: q, mode: "insensitive" } } },
        { job: { source: { contains: q, mode: "insensitive" } } },
        { candidate: { user: { email: { contains: q, mode: "insensitive" } } } },
        { candidate: { user: { firstName: { contains: q, mode: "insensitive" } } } },
        { candidate: { user: { lastName: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const orderBy: Prisma.ApplicationOrderByWithRelationInput =
      sortParam === "oldest"
        ? { createdAt: "asc" }
        : sortParam === "updated"
          ? { updatedAt: "desc" }
          : sortParam === "company"
            ? { job: { companyName: "asc" } }
            : sortParam === "candidate"
              ? { candidate: { user: { lastName: "asc" } } }
              : { createdAt: "desc" };

    const [apps, statusGroups, mineCount, cands, openJobs, uniqueSources] =
      await Promise.all([
        tx.application.findMany({
          where: listWhere,
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            assignedEmployeeId: true,
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
              orderBy: { attemptNumber: "desc" },
              take: 1,
              select: {
                id: true,
                attemptNumber: true,
                submittedAt: true,
              },
            },
          },
          orderBy,
          take: 150,
        }),
        tx.application.groupBy({
          by: ["status"],
          where: orgWhere,
          _count: { _all: true },
        }),
        tx.application.count({
          where: { ...orgWhere, assignedEmployeeId: auth.userId },
        }),
        tx.candidate.findMany({
          where: { organizationId: auth.organizationId, status: { not: "ARCHIVED" } },
          select: {
            id: true,
            status: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        tx.job.findMany({
          where: { organizationId: auth.organizationId, status: "OPEN" },
          select: { id: true, title: true, companyName: true, source: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        tx.job.findMany({
          where: { organizationId: auth.organizationId, source: { not: null } },
          select: { source: true },
          distinct: ["source"],
          take: 50,
        }),
      ]);

    const countByStatus = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count._all])
    ) as Record<string, number>;

    const total = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
    const ready = countByStatus.READY || 0;
    const submitted = countByStatus.SUBMITTED || 0;
    const inProgress = IN_PROGRESS.reduce((s, st) => s + (countByStatus[st] || 0), 0);
    const needsAttention = NEEDS_ATTENTION.reduce(
      (s, st) => s + (countByStatus[st] || 0),
      0
    );

    const candidateOptions: CandidateOption[] = cands.map((c) => ({
      id: c.id,
      name: [c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || c.user.email,
      email: c.user.email,
      status: c.status,
    }));

    const jobOptions: JobOption[] = openJobs.map((j) => ({
      id: j.id,
      title: j.title,
      companyName: j.companyName,
      source: j.source,
    }));

    return {
      applications: apps as unknown as ApplicationItem[],
      candidates: candidateOptions,
      jobs: jobOptions,
      sources: uniqueSources.map((s) => s.source).filter(Boolean) as string[],
      queueCounts: {
        total,
        mine: mineCount,
        ready,
        inProgress,
        submitted,
        needsAttention,
      },
    };
  });

  return (
    <EmployeeApplicationsWorkbench
      currentUserId={ctx.userId}
      applications={data.applications}
      candidates={data.candidates}
      jobs={data.jobs}
      sources={data.sources}
      serverQueueCounts={data.queueCounts}
      initialQueue={queueParam}
      initialStatus={statusParam}
      initialCandidateId={candidateParam}
      initialSource={sourceParam}
      initialSort={sortParam}
      initialSearch={searchParam}
    />
  );
}
