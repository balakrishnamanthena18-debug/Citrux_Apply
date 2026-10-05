import { redirect } from "next/navigation";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { createJobAction, shareJobToCatalogAction } from "@/lib/application/actions";
import { catalogJobsWhere, privateLeadsWhere } from "@/lib/job/visibility";
import { EmployeeJobsWorkbench } from "@/components/job/EmployeeJobsWorkbench";

interface Props {
  searchParams?: Promise<{
    returnTo?: string;
    candidateId?: string;
    tab?: string;
  }>;
}

export default async function EmployeeJobsPage({ searchParams }: Props) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const resolved = searchParams ? await searchParams : {};
  const returnToDesk =
    resolved.returnTo === "application-log" || resolved.returnTo === "/employee/application-log";
  const returnCandidateId = resolved.candidateId || "";
  const initialTab = resolved.tab === "leads" ? "leads" : "catalog";

  const { catalogJobs, leadJobs } = await withRlsContext(ctx.userId, async (tx) => {
    const [catalog, leads] = await Promise.all([
      tx.job.findMany({
        where: catalogJobsWhere(ctx.organizationId),
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { applications: true } } },
        take: 200,
      }),
      tx.job.findMany({
        where: privateLeadsWhere(ctx.organizationId, ctx),
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { applications: true } },
          ownerCandidate: {
            select: {
              id: true,
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
        },
        take: 200,
      }),
    ]);
    return { catalogJobs: catalog, leadJobs: leads };
  });

  async function handleCreateJob(formData: FormData) {
    "use server";
    const shouldReturnToDesk =
      formData.get("returnTo") === "application-log" ||
      formData.get("returnTo") === "/employee/application-log";
    const deskCandidateId = String(formData.get("returnCandidateId") || "");

    const result = await createJobAction({
      title: formData.get("title") as string,
      companyName: formData.get("companyName") as string,
      jobDescription: formData.get("jobDescription") as string,
      location: (formData.get("location") as string) || null,
      isRemote: formData.get("isRemote") === "on",
      employmentType: (formData.get("employmentType") as any) || "FULL_TIME",
      salaryMin: formData.get("salaryMin") ? Number(formData.get("salaryMin")) : null,
      salaryMax: formData.get("salaryMax") ? Number(formData.get("salaryMax")) : null,
      salaryCurrency: (formData.get("salaryCurrency") as string) || "USD",
      source: (formData.get("source") as string) || "LinkedIn",
      externalUrl: (formData.get("externalUrl") as string) || null,
      visibility: "GLOBAL",
    });

    if (shouldReturnToDesk && result.success && result.data?.jobId) {
      const params = new URLSearchParams();
      params.set("jobId", result.data.jobId);
      if (deskCandidateId) params.set("candidateId", deskCandidateId);
      redirect(`/employee/application-log?${params.toString()}`);
    }
  }

  async function handleShareToCatalog(jobId: string) {
    "use server";
    const result = await shareJobToCatalogAction({ jobId });
    if (!result.success) {
      return { success: false as const, error: result.error || "Failed to share job" };
    }
    return { success: true as const };
  }

  return (
    <EmployeeJobsWorkbench
      catalogJobs={catalogJobs.map((j) => ({
        id: j.id,
        title: j.title,
        companyName: j.companyName,
        jobDescription: j.jobDescription,
        location: j.location,
        isRemote: j.isRemote,
        employmentType: j.employmentType,
        salaryMin: j.salaryMin,
        salaryMax: j.salaryMax,
        salaryCurrency: j.salaryCurrency,
        source: j.source,
        externalUrl: j.externalUrl,
        createdAt: j.createdAt,
        visibility: "GLOBAL" as const,
        _count: j._count,
      }))}
      leadJobs={leadJobs.map((j) => ({
        id: j.id,
        title: j.title,
        companyName: j.companyName,
        jobDescription: j.jobDescription,
        location: j.location,
        isRemote: j.isRemote,
        employmentType: j.employmentType,
        salaryMin: j.salaryMin,
        salaryMax: j.salaryMax,
        salaryCurrency: j.salaryCurrency,
        source: j.source,
        externalUrl: j.externalUrl,
        createdAt: j.createdAt,
        visibility: "CANDIDATE_PRIVATE" as const,
        ownerCandidateName:
          [j.ownerCandidate?.user.firstName, j.ownerCandidate?.user.lastName]
            .filter(Boolean)
            .join(" ") || j.ownerCandidate?.user.email || "Candidate",
        _count: j._count,
      }))}
      onCreateJob={handleCreateJob}
      onShareToCatalog={handleShareToCatalog}
      canShareToCatalog={ctx.role === "ADMIN"}
      returnToDesk={returnToDesk}
      returnCandidateId={returnCandidateId}
      initialTab={initialTab}
    />
  );
}
