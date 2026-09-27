import Link from "next/link";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { ApplicationStatus } from "@/generated/prisma";
import { getCandidateStatusPresentation } from "@/lib/utils/status-presenter";
import { redirect } from "next/navigation";

export default async function CandidatePortalPage() {
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin");
  if (ctx.role === "EMPLOYEE") redirect("/employee");

  const data = await withRlsContext(ctx.userId, async (tx) => {
    const candidate = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
      include: {
        experiences: { take: 1 },
        skills: true,
        documents: { orderBy: { createdAt: "desc" }, take: 3 },
        assignedEmployee: true,
      },
    });

    if (!candidate) {
      return {
        candidate: null,
        awaitingApprovalApps: [],
        activeApplicationsCount: 0,
        submittedApplicationsCount: 0,
        recentApplications: [],
      };
    }

    const awaitingApprovalApps = await tx.application.findMany({
      where: {
        candidateId: candidate.id,
        status: ApplicationStatus.AWAITING_APPROVAL,
      },
      include: { job: true },
      orderBy: { updatedAt: "desc" },
    });

    const activeApplicationsCount = await tx.application.count({
      where: {
        candidateId: candidate.id,
        status: {
          in: [
            ApplicationStatus.DISCOVERED,
            ApplicationStatus.QUALIFIED,
            ApplicationStatus.PREPARING,
            ApplicationStatus.REVIEW,
            ApplicationStatus.AWAITING_APPROVAL,
            ApplicationStatus.READY,
            ApplicationStatus.SUBMISSION_ISSUE,
            ApplicationStatus.REVIEW_REQUIRED,
            ApplicationStatus.CORRECTION_APPROVED,
            ApplicationStatus.RESUBMISSION,
          ],
        },
      },
    });

    const submittedApplicationsCount = await tx.application.count({
      where: {
        candidateId: candidate.id,
        status: ApplicationStatus.SUBMITTED,
      },
    });

    const recentApplications = await tx.application.findMany({
      where: { candidateId: candidate.id },
      include: { job: true },
      orderBy: { updatedAt: "desc" },
      take: 4,
    });

    return {
      candidate,
      awaitingApprovalApps,
      activeApplicationsCount,
      submittedApplicationsCount,
      recentApplications,
    };
  });

  const { candidate, awaitingApprovalApps, activeApplicationsCount, submittedApplicationsCount, recentApplications } =
    data;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Candidate Action Center</h1>
        <p className="mt-1 text-sm text-slate-500">
          Real-time oversight of your career profile, active application preparation, and authorization requests.
        </p>
      </div>

      {/* Priority Action Banner for Applications Awaiting Approval */}
      {awaitingApprovalApps.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-700 font-bold text-base">⚠️</span>
              <div>
                <h2 className="text-sm font-bold text-amber-900 uppercase tracking-wide">
                  Action Required: {awaitingApprovalApps.length} Application{awaitingApprovalApps.length > 1 ? "s" : ""} Awaiting Your Authorization
                </h2>
                <p className="text-xs text-amber-800 mt-0.5">
                  Our operations team has prepared application materials for your review. Please inspect and approve them so we can submit.
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-200 text-amber-900 shrink-0">
              Decision Needed
            </span>
          </div>

          <div className="divide-y divide-amber-200/80 pt-1">
            {awaitingApprovalApps.map((app) => (
              <div key={app.id} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{app.job.title}</div>
                  <div className="text-xs text-slate-600">{app.job.companyName} • {app.job.location || "Remote"}</div>
                </div>
                <Link
                  href={`/candidate/applications/${app.id}`}
                  className="px-3.5 py-1.5 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold shadow-sm transition"
                >
                  Review & Authorize →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operational Overview KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {/* Active Pipeline */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Applications In Progress</div>
          <div className="text-3xl font-bold text-slate-900">{activeApplicationsCount}</div>
          <p className="text-xs text-slate-500">
            {awaitingApprovalApps.length > 0
              ? `${awaitingApprovalApps.length} awaiting your approval`
              : "Active in preparation and review pipeline"}
          </p>
          <div className="pt-2 border-t border-slate-100">
            <Link href="/candidate/applications" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              View All Applications →
            </Link>
          </div>
        </div>

        {/* Submitted Applications */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Submitted Applications</div>
          <div className="text-3xl font-bold text-slate-900">{submittedApplicationsCount}</div>
          <p className="text-xs text-slate-500">
            Submitted with confirmed employer confirmation evidence.
          </p>
          <div className="pt-2 border-t border-slate-100">
            <Link href="/candidate/applications" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              Inspect Submission History →
            </Link>
          </div>
        </div>

        {/* Assigned Operations Specialist */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned Specialist</div>
          <div className="text-base font-bold text-slate-900 mt-1">
            {candidate?.assignedEmployee
              ? [candidate.assignedEmployee.firstName, candidate.assignedEmployee.lastName].filter(Boolean).join(" ") || candidate.assignedEmployee.email
              : "Operations Team"}
          </div>
          <p className="text-xs text-slate-500">
            Oversees candidate qualification, material authoring, and QA review.
          </p>
          <div className="pt-2 border-t border-slate-100">
            <Link href="/candidate/messages" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              Open Messages →
            </Link>
          </div>
        </div>
      </div>

      {/* Verification & Candidate Feedback */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Verification Status & Correction Requests
          </h2>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              candidate?.verificationStatus === "VERIFIED"
                ? "bg-emerald-100 text-emerald-800"
                : candidate?.verificationStatus === "PENDING_REVIEW"
                ? "bg-amber-100 text-amber-800"
                : candidate?.verificationStatus === "REJECTED"
                ? "bg-rose-100 text-rose-800"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {candidate?.verificationStatus ?? "UNVERIFIED"}
          </span>
        </div>

        {candidate?.verificationNotes ? (
          <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <span className="font-bold">Candidate-Visible Note: </span>
            {candidate.verificationNotes}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            {candidate?.verificationStatus === "VERIFIED"
              ? "Your profile facts have been verified by company operations."
              : "Your canonical career profile is active and in good standing."}
          </p>
        )}
      </div>

      {/* Recent Applications Pipeline */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Recent Applications Activity</h2>
            <p className="text-xs text-slate-500">Current progress of your active and submitted applications</p>
          </div>
          <Link href="/candidate/applications" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
            View All ({activeApplicationsCount + submittedApplicationsCount}) →
          </Link>
        </div>

        {recentApplications.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No applications staged yet. Our specialists are discovering matching job opportunities.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentApplications.map((app) => {
              const presentation = getCandidateStatusPresentation(app.status);
              return (
                <div key={app.id} className="p-4 hover:bg-slate-50/75 transition flex items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900 truncate">{app.job.title}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-600 font-medium">{app.job.companyName}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{presentation.description}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${presentation.badgeClass}`}>
                      {presentation.label}
                    </span>
                    <Link
                      href={`/candidate/applications/${app.id}`}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-md border ${
                        app.status === ApplicationStatus.AWAITING_APPROVAL
                          ? "bg-amber-600 text-white border-amber-600 hover:bg-amber-700"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {app.status === ApplicationStatus.AWAITING_APPROVAL ? "Review & Authorize" : "View"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Career Profile & Documents Quick Access */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Canonical Career Profile</h2>
          <p className="text-xs text-slate-500">
            Your authoritative work experiences, education history, technical skills, and career preferences.
          </p>
          <div className="pt-2">
            <Link
              href="/candidate/profile"
              className="inline-flex items-center rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Open Profile Editor →
            </Link>
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Uploaded Documents</h2>
          <p className="text-xs text-slate-500">
            {candidate?.documents && candidate.documents.length > 0
              ? `${candidate.documents.length} document(s) uploaded for application tailoring.`
              : "No custom resume uploaded yet. Manage your files in your profile."}
          </p>
          <div className="pt-2">
            <Link
              href="/candidate/profile"
              className="inline-flex items-center rounded-md border border-slate-300 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Manage Documents →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
