import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  candidateApproveApplicationAction,
  candidateRequestRevisionAction,
} from "@/lib/qa/actions";
import { withdrawApplicationAction } from "@/lib/application/actions";
import { createConversationAction } from "@/lib/communication/actions";
import { ApplicationStatus } from "@/generated/prisma";
import { ApplicationProgressTracker } from "@/components/ApplicationProgressTracker";
import {
  formatSalary,
  getCandidateStatusPresentation,
  getCandidateActionRequirement,
} from "@/lib/utils/status-presenter";
import { loadCandidateApplicationIntelligence } from "@/lib/application-intelligence/load-application-intelligence";
import type { ApplicationIntelligenceViewModel } from "@/lib/application-intelligence/presentation";
import { ApplicationIntelligencePanel } from "@/components/application-intelligence/ApplicationIntelligencePanel";
import { ResumeReviewPanel } from "@/components/resume-intelligence/ResumeReviewPanel";
import { listOutcomesForCandidate } from "@/lib/application/outcome-service";
import type { OutcomePresentation } from "@/lib/application/outcome-service";
import { CandidateOutcomesPanel } from "@/components/application/CandidateOutcomesPanel";
import {
  CandidateInterviewSection,
  type CandidateInterviewViewModel,
} from "@/components/interview/CandidateInterviewSection";
import {
  formatApplicationDateTime,
  formatApplicationCardDate,
} from "@/lib/utils/format-application-date";

import { CandidateApplicationHeader } from "@/components/candidate/CandidateApplicationHeader";
import { CandidateWorkbenchTabs } from "@/components/candidate/CandidateWorkbenchTabs";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CandidateApplicationDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/employee/applications");
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
        materials: {
          where: { isCurrent: true },
          include: { candidateDocument: true },
        },
        submissions: { orderBy: { attemptNumber: "desc" } },
        stateHistory: {
          orderBy: { createdAt: "desc" },
          include: { changedBy: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
    });

    const existingConv = await tx.conversation.findFirst({
      where: { candidateId: candidate.id, applicationId: id, organizationId: ctx.organizationId },
      orderBy: { updatedAt: "desc" },
    });

    let intelligence: ApplicationIntelligenceViewModel | null = null;
    let intelligenceLoadFailed = false;
    if (app) {
      try {
        const intel = await loadCandidateApplicationIntelligence({
          db: tx,
          applicationId: app.id,
          candidateId: candidate.id,
        });
        intelligence = intel.ok ? intel.view : null;
        if (!intel.ok) intelligenceLoadFailed = false; // same safe empty denial as detail
      } catch {
        intelligenceLoadFailed = true;
      }
    }

    let outcomes: OutcomePresentation[] = [];
    let interviewData: CandidateInterviewViewModel | null = null;
    if (app) {
      outcomes = await listOutcomesForCandidate(tx, ctx, app.id);

      const dbInterview = await tx.interview.findUnique({
        where: { applicationId: app.id },
        include: {
          rounds: {
            where: { voidedAt: null },
            orderBy: { roundNumber: "asc" },
            include: { debrief: true },
          },
        },
      });

      if (dbInterview) {
        interviewData = {
          id: dbInterview.id,
          applicationId: dbInterview.applicationId,
          status: dbInterview.status,
          rounds: dbInterview.rounds.map((r) => ({
            id: r.id,
            roundNumber: r.roundNumber,
            roundType: r.roundType,
            roundTitle: r.roundTitle,
            status: r.status as any,
            scheduledStartTime: r.scheduledStartTime ? r.scheduledStartTime.toISOString() : null,
            scheduledEndTime: r.scheduledEndTime ? r.scheduledEndTime.toISOString() : null,
            timezone: r.timezone,
            format: r.format as any,
            meetingUrl: r.meetingUrl,
            location: r.location,
            interviewers: (r.interviewers as any) || [],
            candidatePreparationNotes: r.candidatePreparationNotes,
            preparationBrief: (r.preparationBrief as any) || null,
            occurredAt: r.occurredAt ? r.occurredAt.toISOString() : null,
            outcome: r.outcome as any,
            outcomeNotes: r.outcomeNotes,
            debrief: r.debrief
              ? {
                  candidateSentiment: r.debrief.candidateSentiment,
                  questionsAsked: (r.debrief.questionsAsked as any) || [],
                  candidateFeedbackNotes: r.debrief.candidateFeedbackNotes,
                }
              : null,
          })),
        };
      }
    }

    return {
      application: app,
      candidate,
      existingConv,
      intelligence,
      intelligenceLoadFailed,
      outcomes,
      interviewData,
    };
  });

  if (!data || !data.application) {
    notFound();
  }

  const {
    application,
    candidate,
    existingConv,
    intelligence,
    intelligenceLoadFailed,
    outcomes,
    interviewData,
  } = data;
  const currentMaterial = application.materials[0];
  const salaryText = formatSalary(
    application.job.salaryMin,
    application.job.salaryMax,
    application.job.salaryCurrency
  );

  const lastEventDate =
    application.submissions[0]?.submittedAt ||
    application.stateHistory[0]?.createdAt ||
    application.updatedAt;

  const defaultTab =
    application.status === ApplicationStatus.AWAITING_APPROVAL
      ? "materials"
      : interviewData?.rounds && interviewData.rounds.length > 0
      ? "interviews"
      : "overview";

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* 1. Authoritative Application Header & Current State */}
      <CandidateApplicationHeader
        job={application.job}
        status={application.status}
        lastEventDate={lastEventDate}
      />

      {/* 2. Priority Candidate Action Banner if Awaiting Approval */}
      {application.status === ApplicationStatus.AWAITING_APPROVAL && (
        <div
          id="approval-section"
          className="bg-amber-50/70 border border-amber-300 rounded-xl p-5 sm:p-6 shadow-2xs space-y-4 scroll-mt-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-amber-800 font-bold text-sm">⚠️</span>
                <h2 className="text-sm font-bold text-amber-950 uppercase tracking-wide">
                  Decision Needed: Your Authorization is Required
                </h2>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed max-w-3xl">
                Our operations team has prepared customized application materials for {application.job.companyName}. Review the tailored documents below. Authorizing this application will advance it to Ready for our operations staff to submit.
              </p>
            </div>

            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-amber-200 text-amber-900 shrink-0">
              Awaiting Approval
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-3 border-t border-amber-200/80">
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
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 py-2.5 rounded-lg shadow-2xs transition inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>✓</span>
                <span>Approve Application</span>
              </button>
            </form>

            <form
              action={async (formData: FormData) => {
                "use server";
                const notes =
                  (formData.get("revisionNotes") as string) ||
                  "Please make adjustments to application materials.";
                await candidateRequestRevisionAction({
                  applicationId: application.id,
                  revisionNotes: notes,
                });
              }}
              className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
            >
              <input
                type="text"
                name="revisionNotes"
                placeholder="Describe requested adjustments (e.g. emphasize React performance)..."
                required
                minLength={5}
                className="text-xs rounded-lg border border-amber-300 px-3.5 py-2 flex-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-2xs transition shrink-0 cursor-pointer"
              >
                Request Changes
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. Spacious Tabbed Candidate Workbench */}
      <CandidateWorkbenchTabs
        initialTab={defaultTab}
        roundsCount={interviewData?.rounds?.length || 0}
        submissionsCount={application.submissions.length}
        hasActionRequired={application.status === ApplicationStatus.AWAITING_APPROVAL}
        status={application.status}
        roleOverviewSlot={
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Main Column: Job Details & Overview (8 cols) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Job Specifications Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
                <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Target Role & Opportunity
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Authoritative employment criteria and requirements</p>
                  </div>
                  {application.job.source && (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-[10px] font-semibold border border-slate-200">
                      Source: {application.job.source}
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">{application.job.title}</h4>
                      <div className="text-slate-600 font-medium text-sm">{application.job.companyName}</div>
                    </div>
                    {application.job.externalUrl && (
                      <a
                        href={application.job.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 transition"
                      >
                        <span>View Job Posting</span>
                        <span>↗</span>
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-slate-500 text-[11px] block font-medium">Location</span>
                      <span className="font-semibold text-slate-900 mt-0.5 block">
                        {application.job.location ||
                          (application.job.isRemote ? "Remote" : "Location unspecified")}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-slate-500 text-[11px] block font-medium">Employment Type</span>
                      <span className="font-semibold text-slate-900 mt-0.5 block">
                        {application.job.employmentType.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-slate-500 text-[11px] block font-medium">Compensation</span>
                      <span className="font-semibold text-slate-900 mt-0.5 block">
                        {salaryText}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-2">
                      Job Description & Overview
                    </span>
                    <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed p-4 bg-slate-50/70 rounded-xl border border-slate-100 font-sans max-h-96 overflow-y-auto">
                      {application.job.jobDescription || "Job description unavailable."}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar Column: Specialist Communication & Actions (4 cols) */}
            <div className="lg:col-span-4 space-y-6">
              {/* Specialist Communication Desk */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-indigo-600 font-bold">💬</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Dedicated Specialist Desk
                  </h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Have questions or specific instructions for this application? Message your operations desk directly.
                </p>
                {existingConv ? (
                  <Link
                    href={`/candidate/messages/${existingConv.id}`}
                    className="w-full inline-flex justify-center items-center rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-2xs"
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
                        subject: `Inquiry: ${application.job.title} at ${application.job.companyName}`,
                        initialMessage: `Hello, I have a question regarding my application for ${application.job.title} at ${application.job.companyName}.`,
                      });
                      if (res.success && res.data?.conversationId) {
                        redirect(`/candidate/messages/${res.data.conversationId}`);
                      }
                    }}
                  >
                    <button
                      type="submit"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
                    >
                      Message Desk About Role
                    </button>
                  </form>
                )}
              </div>

              {/* Safe Withdrawal Action */}
              {application.status !== ApplicationStatus.SUBMITTED &&
                application.status !== ApplicationStatus.WITHDRAWN &&
                application.status !== ApplicationStatus.REJECTED &&
                application.status !== ApplicationStatus.FAILED && (
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs text-center">
                    <form
                      action={async () => {
                        "use server";
                        await withdrawApplicationAction(
                          application.id,
                          "Candidate requested withdrawal"
                        );
                      }}
                    >
                      <button
                        type="submit"
                        className="text-xs text-rose-600 hover:text-rose-800 font-medium cursor-pointer"
                      >
                        Withdraw Application
                      </button>
                    </form>
                  </div>
                )}
            </div>
          </div>
        }
        materialsSlot={
          <div className="space-y-6">
            {/* Tailored Application Materials */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Tailored Application Materials
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Documents prepared specifically for this application</p>
                </div>
                {currentMaterial && (
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                    Version {currentMaterial.documentVersion || 1}
                  </span>
                )}
              </div>

              {currentMaterial ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium">
                      Selected Base Resume
                    </span>
                    <p className="font-semibold text-slate-900 mt-0.5 text-sm">
                      {currentMaterial.candidateDocument?.title ||
                        "Authoritative Profile Resume"}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        (v{currentMaterial.documentVersion || 1})
                      </span>
                    </p>
                  </div>

                  {currentMaterial.coverLetterText && (
                    <div className="border-t border-slate-100 pt-3">
                      <span className="text-slate-500 font-medium">
                        Tailored Cover Letter
                      </span>
                      <div className="mt-1.5 p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-slate-800 whitespace-pre-wrap leading-relaxed font-sans text-xs">
                        {currentMaterial.coverLetterText}
                      </div>
                    </div>
                  )}

                  {currentMaterial.screeningAnswers && (
                    <div className="border-t border-slate-100 pt-3">
                      <span className="text-slate-500 font-medium">
                        Screening Question Responses
                      </span>
                      <div className="mt-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-slate-800">
                        <pre className="font-mono text-xs overflow-auto">
                          {JSON.stringify(currentMaterial.screeningAnswers, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ) : application.status === ApplicationStatus.SUBMITTED || application.status === ApplicationStatus.READY ? (
                <div className="p-8 text-center text-slate-500 space-y-1">
                  <div className="text-2xl">📄</div>
                  <h4 className="text-xs font-semibold text-slate-800">
                    Default Profile Materials
                  </h4>
                  <p className="text-xs text-slate-500">
                    This application was submitted using your authoritative default candidate resume and profile.
                  </p>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 space-y-1">
                  <div className="text-2xl">📝</div>
                  <h4 className="text-xs font-semibold text-slate-800">
                    Materials Being Prepared
                  </h4>
                  <p className="text-xs text-slate-400">
                    Your dedicated specialist is actively assembling and reviewing tailored materials for this listing.
                  </p>
                </div>
              )}
            </div>

            <ResumeReviewPanel applicationId={application.id} canRequest />

            <ApplicationIntelligencePanel
              view={intelligence}
              audience="candidate"
              loadFailed={intelligenceLoadFailed}
            />
          </div>
        }
        interviewsSlot={
          <div className="space-y-6">
            <CandidateInterviewSection
              applicationId={application.id}
              jobTitle={application.job.title}
              companyName={application.job.companyName}
              interview={interviewData}
            />

            <CandidateOutcomesPanel
              applicationId={application.id}
              outcomes={outcomes}
              canReport={application.submissions.length > 0}
              submitted={
                application.status === ApplicationStatus.SUBMITTED ||
                application.status === ApplicationStatus.REJECTED ||
                application.submissions.length > 0
              }
            />
          </div>
        }
        timelineSlot={
          <div className="space-y-6">
            {/* Submission Confirmation Receipts */}
            {application.submissions.length > 0 && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Verified Submission Evidence
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Proof of verified application delivery</p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    ✓ Verified Submission
                  </span>
                </div>

                <div className="space-y-3">
                  {application.submissions.map((sub) => (
                    <div
                      key={sub.id}
                      className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-semibold text-slate-900">
                        <span className="text-emerald-800 font-bold flex items-center gap-1.5">
                          <span>✓</span>
                          <span>Official submission completed by operations team</span>
                          {application.submissions.length > 1 && (
                            <span className="text-slate-500 font-normal">
                              (Attempt #{sub.attemptNumber})
                            </span>
                          )}
                        </span>
                        <span className="text-slate-500 font-normal">
                          {formatApplicationDateTime(sub.submittedAt)}
                        </span>
                      </div>

                      {sub.externalReference && (
                        <div className="text-slate-700 pt-1">
                          <span className="font-medium text-slate-600">
                            Employer Reference:{" "}
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {sub.externalReference}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Authoritative State History Timeline */}
            {application.stateHistory.length > 0 && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Application History & Milestones
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Chronological record of status progression</p>
                </div>
                <div className="flow-root pt-2">
                  <ul className="-mb-6">
                    {application.stateHistory.map((event, idx) => (
                      <li key={event.id}>
                        <div className="relative pb-6">
                          {idx !== application.stateHistory.length - 1 && (
                            <span
                              className="absolute left-3.5 top-3.5 -ml-px h-full w-0.5 bg-slate-200"
                              aria-hidden="true"
                            />
                          )}
                          <div className="relative flex space-x-3 items-start">
                            <div>
                              <span className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold border border-slate-300">
                                {application.stateHistory.length - idx}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0 pt-1 flex justify-between space-x-4 text-xs">
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {getCandidateStatusPresentation(event.toStatus).label}
                                </p>
                                {event.reason && (
                                  <p className="text-slate-500 mt-0.5">{event.reason}</p>
                                )}
                              </div>
                              <div className="text-right text-slate-400 whitespace-nowrap text-[11px]">
                                {formatApplicationCardDate(event.createdAt)}
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
        }
      />
    </div>
  );
}
