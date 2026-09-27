import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { candidateApproveApplicationAction, candidateRequestRevisionAction } from "@/lib/qa/actions";
import { withdrawApplicationAction } from "@/lib/application/actions";
import { createConversationAction } from "@/lib/communication/actions";
import { ApplicationStatus } from "@/generated/prisma";
import { ApplicationProgressTracker } from "@/components/ApplicationProgressTracker";
import {
  formatSalary,
  getCandidateStatusPresentation,
  getCandidateActionRequirement,
} from "@/lib/utils/status-presenter";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CandidateApplicationDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin/applications");
  if (ctx.role === "EMPLOYEE") redirect(`/employee/applications/${id}`);

  const data = await withRlsContext(ctx.userId, async (tx) => {
    const candidate = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
    });
    if (!candidate) return null;

    const app = await tx.application.findFirst({
      where: { id, candidateId: candidate.id },
      include: {
        job: true,
        materials: { where: { isCurrent: true }, include: { candidateDocument: true } },
        submissions: { orderBy: { attemptNumber: "desc" } },
        stateHistory: { orderBy: { createdAt: "desc" }, include: { changedBy: true } },
      },
    });

    const existingConv = await tx.conversation.findFirst({
      where: { candidateId: candidate.id, applicationId: id, organizationId: ctx.organizationId },
      orderBy: { updatedAt: "desc" },
    });

    return { application: app, candidate, existingConv };
  });

  if (!data || !data.application) {
    notFound();
  }

  const { application, candidate, existingConv } = data;
  const currentMaterial = application.materials[0];
  const presentation = getCandidateStatusPresentation(application.status);
  const actionReq = getCandidateActionRequirement(application.status);
  const salaryText = formatSalary(
    application.job.salaryMin,
    application.job.salaryMax,
    application.job.salaryCurrency
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Top Breadcrumb & Status Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <Link href="/candidate/applications" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
            ← Back to My Applications
          </Link>
          <div className="flex flex-wrap items-baseline gap-2 mt-1">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{application.job.title}</h1>
            <span className="text-sm font-semibold text-slate-600">at {application.job.companyName}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500">
            <span>{application.job.location || (application.job.isRemote ? "Remote" : "Location unspecified")}</span>
            <span>•</span>
            <span className="font-medium text-slate-700">{salaryText}</span>
            <span>•</span>
            <span>Type: {application.job.employmentType.replace(/_/g, " ")}</span>
            {application.job.source && (
              <>
                <span>•</span>
                <span className="text-slate-600 font-medium">Source: {application.job.source}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${presentation.badgeClass}`}>
            {presentation.label}
          </span>
        </div>
      </div>

      {/* 5-Stage Progression Tracker */}
      <ApplicationProgressTracker status={application.status} />

      {/* Candidate Action Callout Banner */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${actionReq.isActionRequired ? "bg-amber-500 animate-ping" : "bg-slate-400"}`} />
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Candidate Action Status</span>
            <p className="text-sm font-bold text-slate-900">{actionReq.actionText}</p>
          </div>
        </div>
        <div className="text-xs text-slate-500 sm:text-right">
          <span className="block font-medium text-slate-700">
            Service Mode: {candidate.applicationAuthorizationMode === "MANAGED" ? "Managed Authorization" : "Per-Application Sign-off"}
          </span>
          <span className="block text-[11px]">
            Last updated: {new Date(application.updatedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </div>

      {/* Candidate Approval Action Banner */}
      {application.status === ApplicationStatus.AWAITING_APPROVAL && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-amber-900">
                Action Required: Your Approval Needed
              </h2>
              <p className="text-xs text-amber-800 mt-1">
                Please review the customized application materials below. Authorizing this application will move it to Ready for our operations team to manually submit on the employer portal for {application.job.companyName}.
              </p>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-900 shrink-0">
              Awaiting Decision
            </span>
          </div>

          <div className="flex flex-wrap gap-4 pt-3 border-t border-amber-200/80">
            <form
              action={async () => {
                "use server";
                await candidateApproveApplicationAction({
                  applicationId: application.id,
                });
              }}
            >
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"
              >
                <span>✓</span>
                <span>Approve Application</span>
              </button>
            </form>

            <form
              action={async (formData: FormData) => {
                "use server";
                const notes = (formData.get("revisionNotes") as string) || "Please make adjustments to application materials.";
                await candidateRequestRevisionAction({
                  applicationId: application.id,
                  revisionNotes: notes,
                });
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                name="revisionNotes"
                placeholder="Describe requested adjustments (min 5 chars)..."
                required
                minLength={5}
                className="text-xs rounded-md border border-amber-300 px-3 py-2 w-72 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="submit"
                className="bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold px-4 py-2 rounded-md shadow-sm transition"
              >
                Request Changes
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Grid Layout: Job Specifications & Materials */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Job Info & Application Specialist Communication */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
              Job Specifications
            </h3>
            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-slate-500 font-medium">Company</span>
                <p className="font-semibold text-slate-900 mt-0.5">{application.job.companyName}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Location</span>
                <p className="text-slate-800 font-medium mt-0.5">
                  {application.job.location || (application.job.isRemote ? "Remote" : "Location unspecified")}
                  {application.job.isRemote && !application.job.location && " (Remote)"}
                </p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Employment Type</span>
                <p className="text-slate-800 font-medium mt-0.5">{application.job.employmentType.replace(/_/g, " ")}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Disclosed Compensation</span>
                <p className="text-slate-800 font-semibold mt-0.5">{salaryText}</p>
              </div>
              {application.job.source && (
                <div>
                  <span className="text-slate-500 font-medium">Source</span>
                  <p className="text-slate-800 font-medium mt-0.5">{application.job.source}</p>
                </div>
              )}
              {application.job.externalUrl && (
                <div>
                  <span className="text-slate-500 font-medium">Original Posting</span>
                  <p className="mt-0.5">
                    <a
                      href={application.job.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <span>Open External Job Link</span>
                      <span>↗</span>
                    </a>
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500 font-medium">Job Description</span>
              <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto p-2.5 bg-slate-50 rounded border border-slate-100">
                {application.job.jobDescription || "Job description unavailable"}
              </p>
            </div>
          </div>

          {/* Application Specialist Communication */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Application Communication
            </h3>
            <p className="text-xs text-slate-500">
              Have questions regarding this role or tailored materials? Message your assigned specialist directly.
            </p>
            {existingConv ? (
              <Link
                href={`/candidate/messages/${existingConv.id}`}
                className="w-full inline-flex justify-center items-center rounded-md bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                Open Application Messages →
              </Link>
            ) : (
              <form
                action={async () => {
                  "use server";
                  const res = await createConversationAction({
                    candidateId: candidate.id,
                    applicationId: application.id,
                    subject: `Inquiry regarding ${application.job.title} at ${application.job.companyName}`,
                    initialMessage: `Hello, I have a question regarding my application for ${application.job.title} at ${application.job.companyName}.`,
                  });
                  if (res.success && res.data?.conversationId) {
                    redirect(`/candidate/messages/${res.data.conversationId}`);
                  }
                }}
              >
                <button
                  type="submit"
                  className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Message Specialist About Application
                </button>
              </form>
            )}
          </div>

          {/* Withdrawal Action (Only for Active, Unsubmitted Applications) */}
          {application.status !== ApplicationStatus.SUBMITTED &&
            application.status !== ApplicationStatus.WITHDRAWN &&
            application.status !== ApplicationStatus.REJECTED &&
            application.status !== ApplicationStatus.FAILED && (
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm text-center">
                <form
                  action={async () => {
                    "use server";
                    await withdrawApplicationAction(application.id, "Candidate requested withdrawal");
                  }}
                >
                  <button
                    type="submit"
                    className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                  >
                    Withdraw this Application
                  </button>
                </form>
              </div>
            )}
        </div>

        {/* Right Column: Application Materials, Submission Records & Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
              Prepared Application Materials
            </h3>

            {currentMaterial ? (
              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-slate-500 font-medium">Selected Resume Document</span>
                  <p className="font-semibold text-slate-900 mt-0.5 text-sm">
                    {currentMaterial.candidateDocument?.title || "Authoritative Profile Resume"} (v{currentMaterial.documentVersion || 1})
                  </p>
                </div>

                {currentMaterial.coverLetterText && (
                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-slate-500 font-medium">Tailored Cover Letter</span>
                    <div className="mt-1.5 p-4 bg-slate-50 rounded-md border border-slate-200 text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                      {currentMaterial.coverLetterText}
                    </div>
                  </div>
                )}

                {currentMaterial.screeningAnswers && (
                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-slate-500 font-medium">Screening Question Responses</span>
                    <div className="mt-1.5 p-4 bg-slate-50 rounded-md border border-slate-200 text-slate-800">
                      <pre className="font-mono text-xs overflow-auto">
                        {JSON.stringify(currentMaterial.screeningAnswers, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-4 text-center">
                Application materials are being tailored by your operations specialist.
              </p>
            )}
          </div>

          {/* Authoritative Submission Confirmation */}
          {application.submissions.length > 0 && (
            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Submission Confirmation
                </h3>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  ✓ Verified Submission
                </span>
              </div>

              <div className="space-y-3">
                {application.submissions.map((sub) => (
                  <div key={sub.id} className="p-4 bg-slate-50 rounded-md border border-slate-200 text-xs space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-semibold text-slate-900">
                      <span className="text-emerald-800 font-bold flex items-center gap-1.5">
                        <span>✓</span>
                        <span>Submitted by our team</span>
                        {application.submissions.length > 1 && (
                          <span className="text-slate-500 font-normal">(Attempt #{sub.attemptNumber})</span>
                        )}
                      </span>
                      <span className="text-slate-500 font-normal">
                        {new Date(sub.submittedAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {sub.externalReference && (
                      <div className="text-slate-700 pt-1">
                        <span className="font-medium text-slate-600">Employer Confirmation Reference: </span>
                        <span className="font-mono font-semibold text-slate-900">{sub.externalReference}</span>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-500 pt-1">
                      Our operations team has completed and submitted your tailored application materials directly to {application.job.companyName}.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Authoritative State & Activity Timeline */}
          {application.stateHistory.length > 0 && (
            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
                Authoritative Application Timeline
              </h3>
              <div className="flow-root">
                <ul className="-mb-8">
                  {application.stateHistory.map((event, idx) => (
                    <li key={event.id}>
                      <div className="relative pb-8">
                        {idx !== application.stateHistory.length - 1 && (
                          <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200" aria-hidden="true" />
                        )}
                        <div className="relative flex space-x-3">
                          <div>
                            <span className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center ring-4 ring-white text-slate-600 text-xs font-bold border border-slate-300">
                              {application.stateHistory.length - idx}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0 pt-1.5 flex justify-between space-x-4 text-xs">
                            <div>
                              <p className="font-medium text-slate-900">
                                {getCandidateStatusPresentation(event.toStatus).label}
                                {event.fromStatus && (
                                  <span className="text-slate-500"> (advanced from {getCandidateStatusPresentation(event.fromStatus).label})</span>
                                )}
                              </p>
                              {event.reason && (
                                <p className="text-slate-500 mt-0.5">{event.reason}</p>
                              )}
                            </div>
                            <div className="text-right text-slate-400 whitespace-nowrap">
                              <time dateTime={event.createdAt.toISOString()}>
                                {new Date(event.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                              </time>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
