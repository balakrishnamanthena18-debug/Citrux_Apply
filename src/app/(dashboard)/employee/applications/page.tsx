import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import Link from "next/link";
import { createApplicationAction } from "@/lib/application/actions";
import { ApplicationStatus } from "@/generated/prisma";
import { formatSalary } from "@/lib/utils/status-presenter";

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

  const {
    applications,
    candidates,
    jobs,
    sources,
    totalCount,
    readyCount,
    inProgressCount,
    awaitingApprovalCount,
    submittedCount,
    issueCount,
    myWorkCount,
  } = await withRlsContext(ctx.userId, async (tx) => {
    // 1. Authoritative Operational Derived Metrics
    const [
      totalC,
      readyC,
      inProgC,
      awaitingApprovalC,
      submittedC,
      issueC,
      myWorkC,
    ] = await Promise.all([
      tx.application.count({ where: { organizationId: ctx.organizationId } }),
      tx.application.count({
        where: { organizationId: ctx.organizationId, status: ApplicationStatus.READY },
      }),
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          status: {
            in: [
              ApplicationStatus.DISCOVERED,
              ApplicationStatus.QUALIFIED,
              ApplicationStatus.PREPARING,
              ApplicationStatus.REVIEW,
            ],
          },
        },
      }),
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          status: ApplicationStatus.AWAITING_APPROVAL,
        },
      }),
      tx.application.count({
        where: { organizationId: ctx.organizationId, status: ApplicationStatus.SUBMITTED },
      }),
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          status: {
            in: [
              ApplicationStatus.SUBMISSION_ISSUE,
              ApplicationStatus.REVIEW_REQUIRED,
              ApplicationStatus.CORRECTION_APPROVED,
              ApplicationStatus.RESUBMISSION,
              ApplicationStatus.FAILED,
            ],
          },
        },
      }),
      tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          assignedEmployeeId: ctx.userId,
        },
      }),
    ]);

    // 2. Query filter formulation based on queue and explicit filters
    const whereClause: any = {
      organizationId: ctx.organizationId,
    };

    // Queue partitioning
    if (queueParam === "mine") {
      whereClause.assignedEmployeeId = ctx.userId;
    } else if (queueParam === "ready") {
      whereClause.status = ApplicationStatus.READY;
    } else if (queueParam === "in_progress") {
      whereClause.status = {
        in: [
          ApplicationStatus.DISCOVERED,
          ApplicationStatus.QUALIFIED,
          ApplicationStatus.PREPARING,
          ApplicationStatus.REVIEW,
        ],
      };
    } else if (queueParam === "submitted") {
      whereClause.status = ApplicationStatus.SUBMITTED;
    } else if (queueParam === "needs_attention") {
      whereClause.status = {
        in: [
          ApplicationStatus.AWAITING_APPROVAL,
          ApplicationStatus.SUBMISSION_ISSUE,
          ApplicationStatus.REVIEW_REQUIRED,
          ApplicationStatus.CORRECTION_APPROVED,
          ApplicationStatus.RESUBMISSION,
          ApplicationStatus.FAILED,
        ],
      };
    }

    // Specific status override
    if (statusParam && Object.values(ApplicationStatus).includes(statusParam as ApplicationStatus)) {
      whereClause.status = statusParam as ApplicationStatus;
    }

    // Candidate filter
    if (candidateParam) {
      whereClause.candidateId = candidateParam;
    }

    // Source filter
    if (sourceParam) {
      whereClause.job = { ...whereClause.job, source: sourceParam };
    }

    // Search query
    if (searchParam.trim()) {
      const q = searchParam.trim();
      whereClause.OR = [
        { candidate: { user: { firstName: { contains: q, mode: "insensitive" } } } },
        { candidate: { user: { lastName: { contains: q, mode: "insensitive" } } } },
        { candidate: { user: { email: { contains: q, mode: "insensitive" } } } },
        { job: { title: { contains: q, mode: "insensitive" } } },
        { job: { companyName: { contains: q, mode: "insensitive" } } },
        { job: { source: { contains: q, mode: "insensitive" } } },
      ];
    }

    // Sorting
    let orderBy: any = { createdAt: "desc" };
    if (sortParam === "oldest") {
      orderBy = { createdAt: "asc" };
    } else if (sortParam === "updated") {
      orderBy = { updatedAt: "desc" };
    } else if (sortParam === "company") {
      orderBy = { job: { companyName: "asc" } };
    } else if (sortParam === "candidate") {
      orderBy = { candidate: { user: { lastName: "asc" } } };
    }

    const apps = await tx.application.findMany({
      where: whereClause,
      include: {
        candidate: { include: { user: true } },
        job: true,
        assignedEmployee: true,
        submissions: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
          include: { submittedBy: true },
        },
        stateHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { changedBy: true },
        },
      },
      orderBy,
    });

    const cands = await tx.candidate.findMany({
      where: { organizationId: ctx.organizationId, status: { not: "ARCHIVED" } },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    const openJobs = await tx.job.findMany({
      where: { organizationId: ctx.organizationId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });

    const uniqueSources = await tx.job.findMany({
      where: { organizationId: ctx.organizationId, source: { not: null } },
      select: { source: true },
      distinct: ["source"],
    });

    return {
      applications: apps,
      candidates: cands,
      jobs: openJobs,
      sources: uniqueSources.map((s) => s.source).filter(Boolean) as string[],
      totalCount: totalC,
      readyCount: readyC,
      inProgressCount: inProgC,
      awaitingApprovalCount: awaitingApprovalC,
      submittedCount: submittedC,
      issueCount: issueC,
      myWorkCount: myWorkC,
    };
  });

  const getStatusBadge = (status: ApplicationStatus) => {
    switch (status) {
      case "DISCOVERED":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "QUALIFIED":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "PREPARING":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "REVIEW":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "AWAITING_APPROVAL":
        return "bg-amber-100 text-amber-800 border-amber-300 font-semibold";
      case "READY":
        return "bg-sky-100 text-sky-900 border-sky-300 font-bold";
      case "SUBMITTED":
        return "bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold";
      case "SUBMISSION_ISSUE":
      case "REVIEW_REQUIRED":
        return "bg-rose-100 text-rose-800 border-rose-300 font-bold";
      case "CORRECTION_APPROVED":
      case "RESUBMISSION":
        return "bg-purple-100 text-purple-800 border-purple-200 font-semibold";
      case "REJECTED":
        return "bg-red-100 text-red-800 border-red-200";
      case "WITHDRAWN":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "FAILED":
        return "bg-rose-100 text-rose-900 border-rose-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const queues = [
    { key: "all", label: "All Applications", count: totalCount },
    { key: "mine", label: "My Work", count: myWorkCount },
    { key: "ready", label: "Ready to Apply", count: readyCount, highlight: true },
    { key: "in_progress", label: "Applying / In Progress", count: inProgressCount },
    { key: "submitted", label: "Submitted", count: submittedCount },
    { key: "needs_attention", label: "Needs Attention", count: awaitingApprovalCount + issueCount },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Console Header */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Application Operations Console
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Authoritative system of record for external candidate job search, preparation, QA verification, and manual employer submissions.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{totalCount}</span> total managed records
          </div>
        </div>
      </div>

      {/* Top-level Authoritative Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Link
          href="/employee/applications?queue=all"
          className={`p-3.5 rounded-lg border shadow-2xs transition ${
            queueParam === "all"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${queueParam === "all" ? "text-slate-300" : "text-slate-500"}`}>
            Total Applications
          </div>
          <div className={`text-xl font-bold mt-1 ${queueParam === "all" ? "text-white" : "text-slate-900"}`}>
            {totalCount}
          </div>
        </Link>

        <Link
          href="/employee/applications?queue=ready"
          className={`p-3.5 rounded-lg border shadow-2xs transition ${
            queueParam === "ready"
              ? "bg-sky-600 text-white border-sky-600"
              : "bg-white border-slate-200 hover:border-sky-300"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${queueParam === "ready" ? "text-sky-100" : "text-sky-700"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${queueParam === "ready" ? "bg-white" : "bg-sky-500 animate-pulse"}`} />
            Ready to Apply
          </div>
          <div className={`text-xl font-bold mt-1 ${queueParam === "ready" ? "text-white" : "text-sky-950"}`}>
            {readyCount}
          </div>
        </Link>

        <Link
          href="/employee/applications?queue=in_progress"
          className={`p-3.5 rounded-lg border shadow-2xs transition ${
            queueParam === "in_progress"
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white border-slate-200 hover:border-indigo-300"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${queueParam === "in_progress" ? "text-indigo-100" : "text-indigo-700"}`}>
            In Progress
          </div>
          <div className={`text-xl font-bold mt-1 ${queueParam === "in_progress" ? "text-white" : "text-indigo-950"}`}>
            {inProgressCount}
          </div>
        </Link>

        <Link
          href="/employee/applications?queue=submitted"
          className={`p-3.5 rounded-lg border shadow-2xs transition ${
            queueParam === "submitted"
              ? "bg-emerald-700 text-white border-emerald-700"
              : "bg-white border-slate-200 hover:border-emerald-300"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${queueParam === "submitted" ? "text-emerald-100" : "text-emerald-700"}`}>
            Submitted
          </div>
          <div className={`text-xl font-bold mt-1 ${queueParam === "submitted" ? "text-white" : "text-emerald-950"}`}>
            {submittedCount}
          </div>
        </Link>

        <Link
          href="/employee/applications?status=AWAITING_APPROVAL"
          className={`p-3.5 rounded-lg border shadow-2xs transition ${
            statusParam === "AWAITING_APPROVAL"
              ? "bg-amber-600 text-white border-amber-600"
              : "bg-white border-slate-200 hover:border-amber-300"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${statusParam === "AWAITING_APPROVAL" ? "text-amber-100" : "text-amber-700"}`}>
            Awaiting Candidate
          </div>
          <div className={`text-xl font-bold mt-1 ${statusParam === "AWAITING_APPROVAL" ? "text-white" : "text-amber-950"}`}>
            {awaitingApprovalCount}
          </div>
        </Link>

        <Link
          href="/employee/applications?queue=needs_attention"
          className={`p-3.5 rounded-lg border shadow-2xs transition ${
            queueParam === "needs_attention"
              ? "bg-rose-700 text-white border-rose-700"
              : "bg-white border-slate-200 hover:border-rose-300"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${queueParam === "needs_attention" ? "text-rose-100" : "text-rose-700"}`}>
            Submission Issues
          </div>
          <div className={`text-xl font-bold mt-1 ${queueParam === "needs_attention" ? "text-white" : "text-rose-950"}`}>
            {issueCount}
          </div>
        </Link>
      </div>

      {/* Operational Queue Selector Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {queues.map((q) => {
          const isActive = queueParam === q.key;
          return (
            <Link
              key={q.key}
              href={`/employee/applications?queue=${q.key}`}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                isActive
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>{q.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isActive ? "bg-slate-700 text-slate-100" : "bg-slate-100 text-slate-700"
                }`}
              >
                {q.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Create Managed Application Panel */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Create Managed Application Record
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Establishes the internal OOS application record for an external job match. External submission happens only after preparation, QA verification, candidate authorization, and reaching READY status.
            </p>
          </div>
        </div>

        <form
          action={async (formData: FormData) => {
            "use server";
            await createApplicationAction({
              candidateId: formData.get("candidateId") as string,
              jobId: formData.get("jobId") as string,
            });
          }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1"
        >
          <div>
            <label className="block font-medium text-slate-700 mb-1">Select Candidate *</label>
            <select
              name="candidateId"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">Choose Candidate...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || c.user.email} ({c.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Select Discovered Job *</label>
            <select
              name="jobId"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">Choose Sourced Job...</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} @ {j.companyName} {j.source ? `[${j.source}]` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full bg-slate-900 text-white py-2 rounded-md text-xs font-semibold hover:bg-slate-800 transition"
            >
              + Create Managed Application
            </button>
          </div>
        </form>
      </div>

      {/* Advanced Filter, Search & Sort Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <form method="GET" className="flex flex-wrap items-center gap-2 flex-1">
          <input type="hidden" name="queue" value={queueParam} />

          <input
            type="text"
            name="search"
            defaultValue={searchParam}
            placeholder="Search candidate, company, role, source..."
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs min-w-[220px] flex-1 sm:flex-none focus:outline-none focus:ring-1 focus:ring-slate-500"
          />

          <select
            name="status"
            defaultValue={statusParam}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="">All Statuses</option>
            <option value="DISCOVERED">Discovered</option>
            <option value="QUALIFIED">Qualified</option>
            <option value="PREPARING">Preparing</option>
            <option value="REVIEW">Review (QA)</option>
            <option value="AWAITING_APPROVAL">Awaiting Approval</option>
            <option value="READY">Ready to Apply</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="SUBMISSION_ISSUE">Submission Issue</option>
            <option value="REVIEW_REQUIRED">Review Required</option>
            <option value="CORRECTION_APPROVED">Correction Approved</option>
            <option value="RESUBMISSION">Resubmission</option>
            <option value="REJECTED">Rejected</option>
            <option value="WITHDRAWN">Withdrawn</option>
            <option value="FAILED">Failed</option>
          </select>

          <select
            name="candidateId"
            defaultValue={candidateParam}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500 max-w-[180px]"
          >
            <option value="">All Candidates</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || c.user.email}
              </option>
            ))}
          </select>

          {sources.length > 0 && (
            <select
              name="source"
              defaultValue={sourceParam}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">All Sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          <select
            name="sort"
            defaultValue={sortParam}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="updated">Sort: Last Updated</option>
            <option value="company">Sort: Company A–Z</option>
            <option value="candidate">Sort: Candidate A–Z</option>
          </select>

          <button
            type="submit"
            className="px-3.5 py-1.5 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800 transition"
          >
            Filter
          </button>

          {(searchParam || statusParam || candidateParam || sourceParam || sortParam !== "newest" || queueParam !== "all") && (
            <Link
              href="/employee/applications"
              className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-medium"
            >
              Reset
            </Link>
          )}
        </form>

        <div className="text-[11px] text-slate-500 shrink-0">
          Showing <span className="font-semibold text-slate-900">{applications.length}</span> records
        </div>
      </div>

      {/* Authoritative Applications Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        {applications.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <p className="font-semibold text-slate-700">No applications match the specified criteria.</p>
            <p className="mt-1 text-slate-400">Adjust the filters above or create a new application record.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Company & Role</th>
                  <th className="px-4 py-3">Location & Comp</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Last Activity</th>
                  <th className="px-4 py-3">Submission Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((app) => {
                  const candidateName =
                    [app.candidate.user.firstName, app.candidate.user.lastName].filter(Boolean).join(" ") ||
                    app.candidate.user.email;

                  const latestHistory = app.stateHistory[0];
                  const latestSub = app.submissions[0];
                  const salaryText = formatSalary(app.job.salaryMin, app.job.salaryMax, app.job.salaryCurrency);

                  return (
                    <tr key={app.id} className="hover:bg-slate-50/75 transition">
                      {/* Candidate Column */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{candidateName}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                          {app.candidate.user.email}
                        </div>
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                              app.candidate.applicationAuthorizationMode === "MANAGED"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {app.candidate.applicationAuthorizationMode === "MANAGED" ? "MANAGED" : "REVIEW REQ"}
                          </span>
                        </div>
                      </td>

                      {/* Company & Role Column */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{app.job.title}</div>
                        <div className="text-[11px] text-slate-600 font-medium">
                          {app.job.companyName}
                        </div>
                        {app.job.externalUrl && (
                          <a
                            href={app.job.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                          >
                            <span>External Posting</span>
                            <span>↗</span>
                          </a>
                        )}
                      </td>

                      {/* Location & Compensation Column */}
                      <td className="px-4 py-3">
                        <div className="text-slate-800 font-medium">
                          {app.job.isRemote ? "🌐 Remote" : app.job.location || "On-site"}
                        </div>
                        <div
                          className={`text-[11px] mt-0.5 ${
                            salaryText === "Salary not disclosed" ? "text-slate-400" : "text-emerald-700 font-semibold"
                          }`}
                        >
                          {salaryText}
                        </div>
                      </td>

                      {/* Source Column */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {app.job.source ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                              {app.job.source}
                            </span>
                            {app.job.externalUrl && (
                              <a
                                href={app.job.externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-400 hover:text-slate-700 text-xs"
                                title="Open original job posting"
                              >
                                ↗
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Direct</span>
                        )}
                      </td>

                      {/* Application Status Column */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${getStatusBadge(app.status)}`}>
                          {app.status.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Assignee Column */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {app.assignedEmployee ? (
                          <span className={app.assignedEmployeeId === ctx.userId ? "font-bold text-slate-900" : ""}>
                            {[app.assignedEmployee.firstName, app.assignedEmployee.lastName].filter(Boolean).join(" ") || app.assignedEmployee.email}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Last Activity Column */}
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {latestHistory ? (
                          <div>
                            <span className="text-slate-800 font-medium">
                              {new Date(latestHistory.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                            </span>
                            <div className="text-[10px] text-slate-400">
                              {latestHistory.toStatus.replace(/_/g, " ")}
                            </div>
                          </div>
                        ) : (
                          <span>{new Date(app.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                        )}
                      </td>

                      {/* Submission Status Column */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {app.status === ApplicationStatus.SUBMITTED && latestSub ? (
                          <div>
                            <span className="font-semibold text-emerald-800">
                              Submitted · Attempt #{latestSub.attemptNumber}
                            </span>
                            <div className="text-[10px] text-slate-500">
                              {new Date(latestSub.submittedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                          </div>
                        ) : app.status === ApplicationStatus.READY ? (
                          <span className="inline-flex items-center gap-1 font-bold text-sky-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse" />
                            Ready to submit
                          </span>
                        ) : app.status === ApplicationStatus.SUBMISSION_ISSUE ? (
                          <span className="font-bold text-rose-700">Issue reported</span>
                        ) : app.status === ApplicationStatus.RESUBMISSION ? (
                          <span className="font-semibold text-purple-700">Resubmission staged</span>
                        ) : (
                          <span className="text-slate-400">Not submitted</span>
                        )}
                      </td>

                      {/* Action Column */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          href={`/employee/applications/${app.id}`}
                          className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                            app.status === ApplicationStatus.READY
                              ? "bg-sky-600 text-white hover:bg-sky-700 shadow-xs"
                              : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {app.status === ApplicationStatus.READY ? "Open Application →" : "Open Workbench →"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
