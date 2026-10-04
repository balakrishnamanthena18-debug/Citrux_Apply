import { redirect } from "next/navigation";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { createJobAction } from "@/lib/application/actions";
import { EmployeeJobsWorkbench } from "@/components/job/EmployeeJobsWorkbench";

interface Props {
  searchParams?: Promise<{
    returnTo?: string;
    candidateId?: string;
  }>;
}

export default async function EmployeeJobsPage({ searchParams }: Props) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const resolved = searchParams ? await searchParams : {};
  const returnToDesk = resolved.returnTo === "application-log" || resolved.returnTo === "/employee/application-log";
  const returnCandidateId = resolved.candidateId || "";

  const jobs = await withRlsContext(ctx.userId, async (tx) => {
    return tx.job.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { applications: true } },
      },
      take: 200,
    });
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
    });

    if (shouldReturnToDesk && result.success && result.data?.jobId) {
      const params = new URLSearchParams();
      params.set("jobId", result.data.jobId);
      if (deskCandidateId) params.set("candidateId", deskCandidateId);
      redirect(`/employee/application-log?${params.toString()}`);
    }
  }

  return (
    <EmployeeJobsWorkbench
      jobs={jobs.map((j) => ({
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
        _count: j._count,
      }))}
      onCreateJob={handleCreateJob}
      returnToDesk={returnToDesk}
      returnCandidateId={returnCandidateId}
    />
  );
}
