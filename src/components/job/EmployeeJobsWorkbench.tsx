"use client";

import React, { useState, useMemo, useTransition } from "react";
import { InstantSearch } from "@/components/workbench/InstantSearch";
import { TablePagination } from "@/components/workbench/TablePagination";
import { PendingButton } from "@/components/ui/PendingButton";
import { formatSalary } from "@/lib/utils/status-presenter";

export interface JobListItem {
  id: string;
  title: string;
  companyName: string;
  jobDescription: string;
  location?: string | null;
  isRemote: boolean;
  employmentType: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  source?: string | null;
  externalUrl?: string | null;
  createdAt: string | Date;
  _count: { applications: number };
}

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

interface Props {
  jobs: JobListItem[];
  onCreateJob: (formData: FormData) => Promise<void>;
  returnToDesk?: boolean;
  returnCandidateId?: string;
}

export function EmployeeJobsWorkbench({
  jobs,
  onCreateJob,
  returnToDesk = false,
  returnCandidateId = "",
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const pageSize = 15;

  const filtered = useMemo(() => {
    let result = jobs;

    if (sourceFilter !== "ALL") {
      result = result.filter((j) => j.source === sourceFilter);
    }

    if (remoteOnly) {
      result = result.filter((j) => j.isRemote);
    }

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter((j) => {
        const title = j.title.toLowerCase();
        const company = j.companyName.toLowerCase();
        const loc = (j.location || "").toLowerCase();
        const src = (j.source || "").toLowerCase();
        return title.includes(q) || company.includes(q) || loc.includes(q) || src.includes(q);
      });
    }

    return result;
  }, [jobs, sourceFilter, remoteOnly, searchTerm]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="bg-white p-5 rounded-[16px] border border-[#E5EAE7] shadow-2xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#0F1720]">Job Catalog & Sourcing</h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Record opportunities found externally on LinkedIn, Indeed, or career pages for candidate application matching.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#EDF1EF] text-[#0F1720] border border-[#E5EAE7]">
              {jobs.length} Active Catalog {jobs.length === 1 ? "Job" : "Jobs"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Job Creation Form */}
        <div className="lg:col-span-1 bg-white p-5 rounded-[16px] border border-[#E5EAE7] shadow-2xs space-y-4">
          <div className="border-b border-[#EDF1EF] pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#0F1720]">
              Record External Job
            </h2>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              Enter details discovered from external job listings.
            </p>
          </div>

          <form
            action={(formData) => {
              startTransition(async () => {
                await onCreateJob(formData);
              });
            }}
            className="space-y-3 text-xs"
          >
            {returnToDesk && (
              <>
                <input type="hidden" name="returnTo" value="application-log" />
                {returnCandidateId ? (
                  <input type="hidden" name="returnCandidateId" value={returnCandidateId} />
                ) : null}
                <div className="rounded-md border border-[#DDE5E0] bg-[#F7F9F8] px-3 py-2 text-[11px] text-[#334155]">
                  Recording for Application Desk — you will return with this job selected.
                </div>
              </>
            )}
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Company Name *</label>
              <input
                name="companyName"
                required
                className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder="e.g. Linear, Stripe, Figma"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">Position / Job Title *</label>
              <input
                name="title"
                required
                className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder="e.g. Senior Systems & Operations Engineer"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">Job Sourcing Origin *</label>
              <select
                name="source"
                defaultValue="LinkedIn"
                className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                {JOB_SOURCES.map((src) => (
                  <option key={src.value} value={src.value}>
                    {src.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">External Job Posting URL</label>
              <input
                type="url"
                name="externalUrl"
                className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder="https://www.linkedin.com/jobs/view/..."
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Location</label>
                <input
                  name="location"
                  className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                  placeholder="San Francisco, CA"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Employment Type</label>
                <select
                  name="employmentType"
                  defaultValue="FULL_TIME"
                  className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
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
                className="rounded border-[#DDE5E0] text-[#0F1720] focus:ring-slate-500"
              />
              <label htmlFor="isRemote" className="font-medium text-[#334155] text-xs cursor-pointer">
                Remote eligible position
              </label>
            </div>

            <div className="border-t border-[#EDF1EF] pt-2">
              <label className="block font-semibold text-[#334155] mb-1">Disclosed Salary Range (Optional)</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="number"
                    name="salaryMin"
                    className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                    placeholder="Min (e.g. 150000)"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    name="salaryMax"
                    className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                    placeholder="Max (e.g. 180000)"
                  />
                </div>
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-1">Leave empty if salary is not disclosed in the external posting.</p>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1">Job Description *</label>
              <textarea
                name="jobDescription"
                rows={6}
                required
                className="w-full rounded-md border border-[#DDE5E0] p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder="Paste full external job description and role requirements..."
              />
            </div>

            <PendingButton
              type="submit"
              isPending={isPending}
              pendingText="Adding to Catalog..."
              className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-md text-xs font-semibold shadow-[0_10px_40px_rgba(15,23,32,0.03)] transition"
            >
              Add Job to Catalog
            </PendingButton>
          </form>
        </div>

        {/* Right: Existing Jobs Catalog with Instant Workbench */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-[16px] border border-[#E5EAE7] shadow-2xs overflow-hidden">
            {/* Filter controls */}
            <div className="p-4 border-b border-[#E5EAE7] bg-[#F7F9F8]/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="w-full sm:w-64">
                <InstantSearch
                  value={searchTerm}
                  onChange={(term) => {
                    setSearchTerm(term);
                    setPage(1);
                  }}
                  placeholder="Search title, company, location..."
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sourceFilter}
                  onChange={(e) => {
                    setSourceFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-md border border-[#DDE5E0] px-2.5 py-1 text-xs bg-white text-[#334155] focus:outline-none"
                >
                  <option value="ALL">All Sources</option>
                  {JOB_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setRemoteOnly(!remoteOnly);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                    remoteOnly
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-[#334155] border-[#DDE5E0] hover:bg-[#F7F9F8]"
                  }`}
                >
                  {remoteOnly ? "✓ Remote Only" : "Remote Only"}
                </button>
              </div>
            </div>

            <table className="min-w-full divide-y divide-[#E5EAE7] text-left text-xs">
              <thead className="bg-[#F7F9F8] font-semibold uppercase tracking-wider text-[#64748B] text-[11px]">
                <tr>
                  <th className="px-4 py-3">Title & Company</th>
                  <th className="px-4 py-3">Location & Comp</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Applications</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAE7]">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#94A3B8] italic">
                      No jobs matched the current filters.
                    </td>
                  </tr>
                ) : (
                  paginated.map((job) => (
                    <tr key={job.id} className="hover:bg-[#F7F9F8]/80 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-[#0F1720]">{job.title}</div>
                        <div className="text-[#64748B] font-medium">{job.companyName}</div>
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
                        <div className="text-[#0F1720] font-medium">
                          {job.location || (job.isRemote ? "Remote" : "Location unspecified")}
                          {job.isRemote && !job.location && " (Remote)"}
                        </div>
                        <div className="text-[11px] text-[#64748B] mt-0.5">
                          {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency || undefined)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EDF1EF] text-[#334155] border border-[#E5EAE7]">
                          {job.source || "External"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0F1720]">
                        {job._count.applications} {job._count.applications === 1 ? "app" : "apps"}
                      </td>
                      <td className="px-4 py-3 text-[#64748B] text-[11px]">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <TablePagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
