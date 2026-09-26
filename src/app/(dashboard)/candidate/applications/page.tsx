import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationStatus } from "@/generated/prisma";
import {
  ApplicationFilterTab,
  FILTER_TAB_STATES,
  getCandidateStatusPresentation,
  formatSalary,
  getCandidateActionRequirement,
} from "@/lib/utils/status-presenter";

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function CandidateApplicationsPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const currentTab: ApplicationFilterTab =
    tab === "AWAITING_ACTION" || tab === "IN_PROGRESS" || tab === "SUBMITTED" || tab === "HISTORY"
      ? tab
      : "ALL";

  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin/applications");
  if (ctx.role === "EMPLOYEE") redirect("/employee/applications");

  const data = await withRlsContext(ctx.userId, async (tx) => {
    const candidate = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
    });
    if (!candidate) {
      return {
        applications: [],
        counts: { ALL: 0, AWAITING_ACTION: 0, IN_PROGRESS: 0, SUBMITTED: 0, HISTORY: 0 },
        candidate: null,
      };
    }

    const allApps = await tx.application.findMany({
      where: { candidateId: candidate.id },
      include: {
        job: true,
        submissions: { orderBy: { attemptNumber: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    });

    const counts = {
      ALL: allApps.length,
      AWAITING_ACTION: allApps.filter((a) => a.status === ApplicationStatus.AWAITING_APPROVAL).length,
      IN_PROGRESS: allApps.filter((a) => FILTER_TAB_STATES.IN_PROGRESS.includes(a.status)).length,
      SUBMITTED: allApps.filter((a) => a.status === ApplicationStatus.SUBMITTED).length,
      HISTORY: allApps.filter((a) => FILTER_TAB_STATES.HISTORY.includes(a.status)).length,
    };

    const targetStatuses = FILTER_TAB_STATES[currentTab];
    const filteredApps = allApps.filter((a) => targetStatuses.includes(a.status));

    return {
      applications: filteredApps,
      counts,
      candidate,
    };
  });

  const { applications, counts, candidate } = data;

  const tabs: { key: ApplicationFilterTab; label: string; count: number }[] = [
    { key: "ALL", label: "All Applications", count: counts.ALL },
    { key: "AWAITING_ACTION", label: "Action Required", count: counts.AWAITING_ACTION },
    { key: "IN_PROGRESS", label: "In Progress", count: counts.IN_PROGRESS },
    { key: "SUBMITTED", label: "Submitted", count: counts.SUBMITTED },
    { key: "HISTORY", label: "Closed / History", count: counts.HISTORY },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Applications</h1>
          <p className="mt-1 text-sm text-slate-500">
            Authoritative visibility and transparent status for every job opportunity managed on your behalf.
          </p>
        </div>
      </div>

      {/* Top-Level Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/candidate/applications"
          className={`p-3.5 rounded-lg border shadow-2xs transition ${
            currentTab === "ALL"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${currentTab === "ALL" ? "text-slate-300" : "text-slate-500"}`}>
            Total Applications
          </div>
          <div className={`text-xl font-bold mt-1 ${currentTab === "ALL" ? "text-white" : "text-slate-900"}`}>
            {counts.ALL}
          </div>
        </Link>

        <Link
          href="/candidate/applications?tab=SUBMITTED"
          className={`p-3.5 rounded-lg border shadow-2xs transition ${
            currentTab === "SUBMITTED"
              ? "bg-emerald-700 text-white border-emerald-700"
              : "bg-white border-slate-200 hover:border-emerald-300"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${currentTab === "SUBMITTED" ? "text-emerald-100" : "text-emerald-700"}`}>
            Submitted
          </div>
          <div className={`text-xl font-bold mt-1 ${currentTab === "SUBMITTED" ? "text-white" : "text-emerald-950"}`}>
            {counts.SUBMITTED}
          </div>
        </Link>

        <Link
          href="/candidate/applications?tab=IN_PROGRESS"
          className={`p-3.5 rounded-lg border shadow-2xs transition ${
            currentTab === "IN_PROGRESS"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white border-slate-200 hover:border-blue-300"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${currentTab === "IN_PROGRESS" ? "text-blue-100" : "text-blue-700"}`}>
            In Progress
          </div>
          <div className={`text-xl font-bold mt-1 ${currentTab === "IN_PROGRESS" ? "text-white" : "text-blue-950"}`}>
            {counts.IN_PROGRESS}
          </div>
        </Link>

        <Link
          href="/candidate/applications?tab=AWAITING_ACTION"
          className={`p-3.5 rounded-lg border shadow-2xs transition ${
            currentTab === "AWAITING_ACTION"
              ? "bg-amber-600 text-white border-amber-600"
              : "bg-white border-slate-200 hover:border-amber-300"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${currentTab === "AWAITING_ACTION" ? "text-amber-100" : "text-amber-700"}`}>
            Awaiting My Action
          </div>
          <div className={`text-xl font-bold mt-1 ${currentTab === "AWAITING_ACTION" ? "text-white" : "text-amber-950"}`}>
            {counts.AWAITING_ACTION}
          </div>
        </Link>
      </div>

      {/* Service Authorization Mode Banner */}
      <div className={`p-4 rounded-lg border text-xs flex items-center justify-between gap-4 ${
        candidate?.applicationAuthorizationMode === "MANAGED"
          ? "bg-indigo-50/70 border-indigo-200 text-indigo-900"
          : "bg-slate-50 border-slate-200 text-slate-800"
      }`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${
            candidate?.applicationAuthorizationMode === "MANAGED"
              ? "bg-indigo-600 text-white"
              : "bg-slate-700 text-white"
          }`}>
            {candidate?.applicationAuthorizationMode === "MANAGED" ? "Managed Mode Active" : "Review Required Mode"}
          </span>
          <span className="font-medium">
            {candidate?.applicationAuthorizationMode === "MANAGED"
              ? "Your team is authorized to apply to suitable jobs matching your approved preferences directly after passing quality assurance."
              : "Your team will pause every prepared application for your explicit review and approval before submitting."}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabs.map((t) => {
          const isActive = currentTab === t.key;
          return (
            <Link
              key={t.key}
              href={t.key === "ALL" ? "/candidate/applications" : `/candidate/applications?tab=${t.key}`}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                isActive
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isActive ? "bg-slate-700 text-slate-100" : "bg-slate-100 text-slate-700"
                }`}
              >
                {t.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Applications List */}
      {applications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center bg-white">
          <p className="text-sm text-slate-600 font-medium">No applications found in this category.</p>
          <p className="text-xs text-slate-400 mt-1">
            {currentTab === "AWAITING_ACTION"
              ? "You have no applications requiring authorization at this time."
              : "Our team will match and qualify relevant job opportunities for your profile."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => {
            const presentation = getCandidateStatusPresentation(app.status);
            const actionReq = getCandidateActionRequirement(app.status);
            const salaryString = formatSalary(app.job.salaryMin, app.job.salaryMax, app.job.salaryCurrency);
            const latestSub = app.submissions[0];

            return (
              <div
                key={app.id}
                className="bg-white rounded-lg border border-slate-200 p-5 shadow-2xs hover:border-slate-300 transition space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 tracking-tight">
                      {app.job.title}
                    </h2>
                    <div className="text-xs text-slate-600 font-medium mt-0.5 flex items-center gap-2">
                      <span>{app.job.companyName}</span>
                      {app.job.source && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400">Found on {app.job.source}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${presentation.badgeClass}`}>
                      {presentation.label}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-slate-600">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Location</span>
                    <span className="font-medium text-slate-800">
                      {app.job.isRemote ? "🌐 Remote" : app.job.location || "On-site"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Employment</span>
                    <span className="font-medium text-slate-800">
                      {app.job.employmentType.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Compensation</span>
                    <span className={salaryString === "Salary not disclosed" ? "text-slate-400 font-normal" : "font-semibold text-emerald-700"}>
                      {salaryString}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Submission Status</span>
                    {app.status === ApplicationStatus.SUBMITTED && latestSub ? (
                      <span className="font-semibold text-emerald-800">
                        Applied {new Date(latestSub.submittedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    ) : (
                      <span className="text-slate-500 font-medium">{presentation.label}</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Action Required</span>
                    <span className={actionReq.isActionRequired ? "font-bold text-amber-800" : "text-slate-500"}>
                      {actionReq.actionText}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div className="text-[11px] text-slate-400">
                    Last updated {new Date(app.updatedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                  </div>

                  <Link
                    href={`/candidate/applications/${app.id}`}
                    className={`px-4 py-1.5 rounded-md text-xs font-semibold transition ${
                      app.status === ApplicationStatus.AWAITING_APPROVAL
                        ? "bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
                        : "bg-slate-900 hover:bg-slate-800 text-white shadow-2xs"
                    }`}
                  >
                    {app.status === ApplicationStatus.AWAITING_APPROVAL ? "Review & Authorize →" : "View Application →"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
