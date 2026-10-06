import { requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withAuthenticatedData } from "@/lib/db/authenticated-data";
import { listOperationalApplications } from "@/lib/application/operations-read";
import {
  EmployeeApplicationsWorkbench,
  type CandidateOption,
  type JobOption,
} from "@/components/application/EmployeeApplicationsWorkbench";

interface Props {
  searchParams?: Promise<{
    search?: string;
    status?: string;
    candidateId?: string;
    source?: string;
    queue?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
    /** Ignored for auth — forged client scope must not alter results. */
    employeeId?: string;
    teamId?: string;
    managerId?: string;
    organizationId?: string;
  }>;
}

export default async function EmployeeApplicationsPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const { ctx, data } = await withAuthenticatedData(async (tx, auth) => {
    requireEmployeeOrAdmin(auth);

    // Intentionally ignore client-supplied employeeId/teamId/managerId/organizationId.
    const page = await listOperationalApplications(tx, auth, {
      queue: resolvedParams.queue,
      search: resolvedParams.search,
      status: resolvedParams.status,
      candidateId: resolvedParams.candidateId,
      source: resolvedParams.source,
      sort: resolvedParams.sort,
      page: resolvedParams.page,
      pageSize: resolvedParams.pageSize,
    });

    const [cands, openJobs, uniqueSources] = await Promise.all([
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
        where: {
          organizationId: auth.organizationId,
          status: "OPEN",
          visibility: "GLOBAL",
        },
        select: { id: true, title: true, companyName: true, source: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      tx.job.findMany({
        where: {
          organizationId: auth.organizationId,
          visibility: "GLOBAL",
          source: { not: null },
        },
        select: { source: true },
        distinct: ["source"],
        take: 50,
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
      page,
      candidates: candidateOptions,
      jobs: jobOptions,
      sources: uniqueSources.map((s) => s.source).filter(Boolean) as string[],
    };
  });

  return (
    <EmployeeApplicationsWorkbench
      currentUserId={ctx.userId}
      applications={data.page.items}
      candidates={data.candidates}
      jobs={data.jobs}
      sources={data.sources}
      serverQueueCounts={data.page.counts}
      scopes={data.page.scopes}
      page={data.page.page}
      pageSize={data.page.pageSize}
      totalCount={data.page.totalCount}
      totalPages={data.page.totalPages}
      asOf={data.page.asOf}
      initialQueue={data.page.queue}
      initialStatus={resolvedParams.status || ""}
      initialCandidateId={resolvedParams.candidateId || ""}
      initialSource={resolvedParams.source || ""}
      initialSort={resolvedParams.sort || "age"}
      initialSearch={resolvedParams.search || ""}
    />
  );
}
