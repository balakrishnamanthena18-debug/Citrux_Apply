import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { createJobAction } from "@/lib/application/actions";
import { Job } from "@/generated/prisma";
import { formatSalary } from "@/lib/utils/status-presenter";

type JobWithApplicationCount = Job & {
  _count: { applications: number };
};

const JOB_SOURCES = [
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "Indeed", label: "Indeed" },
  { value: "Company Careers", label: "Company Career Page" },
  { value: "Greenhouse", label: "Greenhouse" },
  { value: "Lever", label: "Lever" },
  { value: "Workday", label: "Workday" },
  { value: "Ashby", label: "Ashby" },
  { value: "Other Job Board", label: "Other External Job Site" },
];

export default async function EmployeeJobsPage() {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const jobs = await withRlsContext(ctx.userId, async (tx) => {
    return tx.job.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { applications: true } },
      },
    });
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Job Catalog & Sourcing</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Record opportunities found externally on LinkedIn, Indeed, or career pages for candidate application matching.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
              {jobs.length} Active Catalog {jobs.length === 1 ? "Job" : "Jobs"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Job Creation Form */}
        <div className="lg:col-span-1 bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Record External Job
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Enter details discovered from external job listings.
            </p>
          </div>

          <form
            action={async (formData: FormData) => {
              "use server";
              await createJobAction({
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
            }}
            className="space-y-3 text-xs"
          >
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Company Name *</label>
              <input
                name="companyName"
                required
                className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder="e.g. Linear, Stripe, Figma"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Position / Job Title *</label>
              <input
                name="title"
                required
                className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder="e.g. Senior Systems & Operations Engineer"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Job Sourcing Origin *</label>
              <select
                name="source"
                defaultValue="LinkedIn"
                className="w-full rounded-md border border-slate-300 p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                {JOB_SOURCES.map((src) => (
                  <option key={src.value} value={src.value}>
                    {src.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">External Job Posting URL</label>
              <input
                type="url"
                name="externalUrl"
                className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder="https://www.linkedin.com/jobs/view/..."
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Location</label>
                <input
                  name="location"
                  className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                  placeholder="San Francisco, CA"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Employment Type</label>
                <select
                  name="employmentType"
                  defaultValue="FULL_TIME"
                  className="w-full rounded-md border border-slate-300 p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERNSHIP">Internship</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                name="isRemote"
                id="isRemote"
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              />
              <label htmlFor="isRemote" className="font-medium text-slate-700 text-xs cursor-pointer">
                Remote eligible position
              </label>
            </div>

            <div className="border-t border-slate-100 pt-2">
              <label className="block font-semibold text-slate-700 mb-1">Disclosed Salary Range (Optional)</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="number"
                    name="salaryMin"
                    className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                    placeholder="Min (e.g. 150000)"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    name="salaryMax"
                    className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                    placeholder="Max (e.g. 180000)"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Leave empty if salary is not disclosed in the external posting.</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Job Description *</label>
              <textarea
                name="jobDescription"
                rows={6}
                required
                className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder="Paste full external job description and role requirements..."
              />
            </div>

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-md text-xs font-semibold shadow-sm transition"
            >
              Add Job to Catalog
            </button>
          </form>
        </div>

        {/* Right: Existing Jobs Catalog */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Sourced Job Opportunities ({jobs.length})
              </h2>
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500 text-[11px]">
                <tr>
                  <th className="px-4 py-3">Title & Company</th>
                  <th className="px-4 py-3">Location & Comp</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Applications</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">
                      No jobs recorded yet. Sourced jobs will appear here.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job: JobWithApplicationCount) => (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{job.title}</div>
                        <div className="text-slate-500 font-medium">{job.companyName}</div>
                        {job.externalUrl && (
                          <a
                            href={job.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-[11px] inline-flex items-center gap-0.5 mt-0.5"
                          >
                            <span>External Posting</span>
                            <span>↗</span>
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-800 font-medium">
                          {job.location || (job.isRemote ? "Remote" : "Location unspecified")}
                          {job.isRemote && !job.location && " (Remote)"}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {job.source || "External"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {job._count.applications} {job._count.applications === 1 ? "app" : "apps"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px]">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
