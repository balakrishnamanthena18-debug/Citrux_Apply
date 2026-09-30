import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import {
  EmployeeApplicationsWorkbench,
  ApplicationItem,
  CandidateOption,
  JobOption,
} from "@/components/application/EmployeeApplicationsWorkbench";

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

export default async function EmployeeApplicationsPage({ searchParams }: Props) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const resolvedParams = searchParams ? await searchParams : {};
  const searchParam = resolvedParams.search || "";
  const statusParam = resolvedParams.status || "";
  const candidateParam = resolvedParams.candidateId || "";
  const sourceParam = resolvedParams.source || "";
  const queueParam = resolvedParams.queue || "all";
  const sortParam = resolvedParams.sort || "newest";

  const { applications, candidates, jobs, sources } = await withRlsContext(ctx.userId, async (tx) => {
    // Parallelize authoritative bounded applications and reference lookups
    const [apps, cands, openJobs, uniqueSources] = await Promise.all([
      // 1. Authoritative Bounded Workspace Applications
      tx.application.findMany({
        where: { organizationId: ctx.organizationId },
        include: {
          candidate: {
            select: {
              id: true,
              applicationAuthorizationMode: true,
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
          job: true,
          assignedEmployee: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          submissions: {
            orderBy: { attemptNumber: "desc" },
            take: 1,
            include: {
              submittedBy: { select: { firstName: true, lastName: true, email: true } },
            },
          },
          stateHistory: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              changedBy: { select: { firstName: true, lastName: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 250,
      }),

      // 2. Reference candidate options for creation
      tx.candidate.findMany({
        where: { organizationId: ctx.organizationId, status: { not: "ARCHIVED" } },
        select: {
          id: true,
          status: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),

      // 3. Reference open jobs for creation
      tx.job.findMany({
        where: { organizationId: ctx.organizationId, status: "OPEN" },
        select: { id: true, title: true, companyName: true, source: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),

      // 4. Distinct sources
      tx.job.findMany({
        where: { organizationId: ctx.organizationId, source: { not: null } },
        select: { source: true },
        distinct: ["source"],
      }),
    ]);

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
    };
  });

  return (
    <EmployeeApplicationsWorkbench
      currentUserId={ctx.userId}
      applications={applications}
      candidates={candidates}
      jobs={jobs}
      sources={sources}
      initialQueue={queueParam}
      initialStatus={statusParam}
      initialCandidateId={candidateParam}
      initialSource={sourceParam}
      initialSort={sortParam}
      initialSearch={searchParam}
    />
  );
}
