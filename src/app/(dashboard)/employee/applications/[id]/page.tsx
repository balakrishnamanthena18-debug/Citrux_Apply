import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  updateApplicationMaterialAction,
  transitionApplicationStatusAction,
} from "@/lib/application/actions";
import {
  recordSubmissionIssueAction,
  startCorrectionReviewAction,
  approveSubmissionCorrectionAction,
  stageApplicationResubmissionAction,
} from "@/lib/submission/actions";
import { submitApplicationForQaAction, completeQaReviewAction } from "@/lib/qa/actions";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";
import { SubmissionForm } from "./SubmissionForm";
import { EvidenceDownloadButton } from "./SubmissionEvidenceControls";
import { InternalNotesWidget } from "@/components/InternalNotesWidget";
import type { ApplicationStatus } from "@/generated/prisma";
import { formatSalary, getCandidateStatusPresentation } from "@/lib/utils/status-presenter";
import { RecordHeader } from "@/components/ui/RecordHeader";
import { ApplicationWorkspaceHeader } from "@/components/application/ApplicationWorkspaceHeader";
import { ApplicationNextActionHero } from "@/components/application/ApplicationNextActionHero";
import { ApplicationOwnershipCard } from "@/components/application/ApplicationOwnershipCard";
import { resolveDualTrackWorkflowStatus } from "@/lib/application/workflow-status";
import { evaluateApplicationPrerequisites } from "@/lib/application/prerequisites";
import { TelemetryGauge } from "@/components/ui/TelemetryGauge";
import { loadStaffApplicationIntelligence } from "@/lib/application-intelligence/load-application-intelligence";
import type { ApplicationIntelligenceViewModel } from "@/lib/application-intelligence/presentation";
import { ApplicationIntelligencePanel } from "@/components/application-intelligence/ApplicationIntelligencePanel";
import { ResumeReviewPanel } from "@/components/resume-intelligence/ResumeReviewPanel";
import { deriveNextActionGuidance } from "@/lib/application/operations-guidance";
import { resolveCurrentStateEnteredAt } from "@/lib/application/operations-aging";
import { resolveWaitingAttribution } from "@/lib/application/operations-waiting";
import {
  listEligibleAssignees,
  resolveAssignmentAuthority,
} from "@/lib/application/assignment-authority";
import { isAssigneeInactiveInOrganization } from "@/lib/application/orphan-scope";
import { hasKnownAssignmentSnapshot } from "@/lib/application/assignment-snapshot";
import { resolveContinuityVisibilityScope } from "@/lib/application/continuity-scope";
import { listOutcomesForStaff } from "@/lib/application/outcome-service";
import type { OutcomePresentation } from "@/lib/application/outcome-service";
import { StaffOutcomesPanel } from "@/components/application/StaffOutcomesPanel";
import {
  StaffInterviewPanel,
  type StaffInterviewViewModel,
} from "@/components/interview/StaffInterviewPanel";
import { ApplicationWorkbenchTabs } from "@/components/application/ApplicationWorkbenchTabs";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EmployeeApplicationWorkbenchPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const {
    application,
    assigneeOptions,
    allowUnassigned,
    ownerInactive,
    continuityOutsideScope,
    candidateDocs,
    intelligence,
    intelligenceLoadFailed,
    outcomes,
    interviewData,
  } =
    await withRlsContext(ctx.userId, async (tx) => {
    const app = await tx.application.findUnique({
      where: { id, organizationId: ctx.organizationId },
      include: {
        candidate: {
          include: {
            user: true,
            experiences: { orderBy: { orderIndex: "asc" } },
            educations: { orderBy: { orderIndex: "asc" } },
            skills: true,
          },
        },
        job: true,
        assignedEmployee: true,
        materials: { where: { isCurrent: true }, include: { candidateDocument: true } },
        submissions: {
          orderBy: { attemptNumber: "desc" },
          include: { submittedBy: true },
        },
        stateHistory: { orderBy: { createdAt: "desc" }, include: { changedBy: true } },
        qaReviews: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { checklistItems: true },
        },
      },
    });
    if (!app) {
      return {
        application: null,
        assigneeOptions: [] as Awaited<ReturnType<typeof listEligibleAssignees>>["options"],
        allowUnassigned: false,
        ownerInactive: false,
        continuityOutsideScope: false,
        candidateDocs: [],
        intelligence: null as ApplicationIntelligenceViewModel | null,
        intelligenceLoadFailed: false,
        outcomes: [] as OutcomePresentation[],
        interviewData: null as StaffInterviewViewModel | null,
      };
    }

    // Phase 5M — assignee dropdown reflects structural mutation scope (not org-wide dump).
    const eligible = await listEligibleAssignees(tx, ctx);
    const inactive = app.assignedEmployeeId
      ? await isAssigneeInactiveInOrganization(
          tx,
          ctx.organizationId,
          app.assignedEmployeeId
        )
      : false;

    // Phase 5R — continuity indicator (snapshot known + ACTIVE owner outside viewer scope).
    let continuityOutsideScope = false;
    if (
      !inactive &&
      app.assignedEmployeeId &&
      hasKnownAssignmentSnapshot(app)
    ) {
      const continuityVis = await resolveContinuityVisibilityScope(tx, ctx);
      const profile = await resolveAssignmentAuthority(tx, ctx);
      if (continuityVis.canViewContinuity) {
        const stillInCurrent = profile.eligibleTargetUserIds.includes(
          app.assignedEmployeeId
        );
        if (!stillInCurrent) {
          if (
            (continuityVis.kind === "TEAM_LEAD" || continuityVis.kind === "BOTH") &&
            app.assignedTeamKey &&
            continuityVis.teamKeys.includes(app.assignedTeamKey)
          ) {
            continuityOutsideScope = true;
          }
          if (
            (continuityVis.kind === "MANAGER" || continuityVis.kind === "BOTH") &&
            app.assignedManagerId === ctx.userId
          ) {
            continuityOutsideScope = true;
          }
          if (continuityVis.kind === "ADMIN") {
            continuityOutsideScope = true;
          }
        }
      }
    }

    const docs = await tx.candidateDocument.findMany({
      where: { candidateId: app.candidateId },
      orderBy: { createdAt: "desc" },
    });

    let intel: ApplicationIntelligenceViewModel | null = null;
    let intelFailed = false;
    try {
      const loaded = await loadStaffApplicationIntelligence({
        db: tx,
        applicationId: app.id,
        organizationId: ctx.organizationId,
      });
      intel = loaded.ok ? loaded.view : null;
    } catch {
      intelFailed = true;
    }

    const outcomeRows = await listOutcomesForStaff(tx, ctx, app.id, {
      includeInactive: true,
    });

    let interviewData: StaffInterviewViewModel | null = null;
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
        candidateId: dbInterview.candidateId,
        jobId: dbInterview.jobId,
        status: dbInterview.status,
        rounds: dbInterview.rounds.map((r) => ({
          id: r.id,
          roundNumber: r.roundNumber,
          roundType: r.roundType,
          roundTitle: r.roundTitle,
          status: r.status,
          scheduledStartTime: r.scheduledStartTime ? r.scheduledStartTime.toISOString() : null,
          scheduledEndTime: r.scheduledEndTime ? r.scheduledEndTime.toISOString() : null,
          timezone: r.timezone,
          format: r.format,
          meetingUrl: r.meetingUrl,
          location: r.location,
          interviewers: (r.interviewers as any) || [],
          internalStaffNotes: r.internalStaffNotes,
          candidatePreparationNotes: r.candidatePreparationNotes,
          preparationBrief: (r.preparationBrief as any) || null,
          occurredAt: r.occurredAt ? r.occurredAt.toISOString() : null,
          outcome: r.outcome,
          outcomeNotes: r.outcomeNotes,
          rescheduledBy: r.rescheduledBy,
          rescheduleReason: r.rescheduleReason,
          cancelledBy: r.cancelledBy,
          cancelReason: r.cancelReason,
          voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
          debrief: r.debrief
            ? {
                candidateSentiment: r.debrief.candidateSentiment,
                questionsAsked: (r.debrief.questionsAsked as any) || [],
                candidateFeedbackNotes: r.debrief.candidateFeedbackNotes,
                staffAssessmentNotes: r.debrief.staffAssessmentNotes,
                followUpItems: r.debrief.followUpItems,
              }
            : null,
        })),
      };
    }

    return {
      application: app,
      assigneeOptions: eligible.options,
      allowUnassigned: eligible.allowUnassigned,
      ownerInactive: inactive,
      continuityOutsideScope,
      candidateDocs: docs,
      intelligence: intel,
      intelligenceLoadFailed: intelFailed,
      outcomes: outcomeRows,
      interviewData,
    };
  });

  if (!application) {
    notFound();
  }

  const currentMaterial = application.materials[0];

  const waitingAttribution = resolveWaitingAttribution(
    application.status,
    new Date(),
    {
      statusHistoryEnteredAt: resolveCurrentStateEnteredAt(
        application.status,
        application.stateHistory
      ),
      approvalRequestedAt: application.approvalRequestedAt,
    }
  );

  const candidateName =
    [application.candidate.user.firstName, application.candidate.user.lastName].filter(Boolean).join(" ") ||
    application.candidate.user.email;

  const latestQaReview = application.qaReviews?.[0] ?? null;
  const hasPassedQa =
    latestQaReview?.decision === "PASS" &&
    latestQaReview.checklistItems.length === 9 &&
    latestQaReview.checklistItems.every((item) => item.isVerified);

  const workflow = resolveDualTrackWorkflowStatus({
    status: application.status,
    approvalStatus: application.approvalStatus,
    submissionCount: application.submissions.length,
    hasMaterials: Boolean(currentMaterial?.candidateDocumentId),
    authorizationMode: application.candidate.applicationAuthorizationMode,
    isAssigned: Boolean(application.assignedEmployeeId),
  });

  const prerequisites = evaluateApplicationPrerequisites({
    status: application.status,
    approvalStatus: application.approvalStatus,
    candidateStatus: application.candidate.status,
    candidateAuthMode: application.candidate.applicationAuthorizationMode,
    hasResumeDocument: Boolean(currentMaterial?.candidateDocumentId),
    resumeDocumentTitle: currentMaterial?.candidateDocument
      ? `${currentMaterial.candidateDocument.title} (v${currentMaterial.candidateDocument.versionNumber})`
      : null,
    hasCoverLetter: Boolean(currentMaterial?.coverLetterText),
    hasPassedQaReview: hasPassedQa,
    isJobActive: application.job.status === "OPEN",
    externalJobUrl: application.job.externalUrl,
  });

  const salaryText = formatSalary(
    application.job.salaryMin,
    application.job.salaryMax,
    application.job.salaryCurrency
  );

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
        return "bg-amber-50 text-amber-900 border-amber-300 font-semibold";
      case "READY":
        return "bg-sky-50 text-sky-900 border-sky-300 font-bold";
      case "SUBMITTED":
        return "bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold";
      case "SUBMISSION_ISSUE":
      case "REVIEW_REQUIRED":
        return "bg-rose-50 text-rose-800 border-rose-300 font-bold";
      case "CORRECTION_APPROVED":
      case "RESUBMISSION":
        return "bg-purple-50 text-purple-800 border-purple-200 font-semibold";
      case "REJECTED":
        return "bg-red-50 text-red-800 border-red-200";
      case "WITHDRAWN":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "FAILED":
        return "bg-rose-50 text-rose-900 border-rose-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const formerOwnerName = application.assignedEmployee
    ? [application.assignedEmployee.firstName, application.assignedEmployee.lastName].filter(Boolean).join(" ") || application.assignedEmployee.email
    : null;
  const assigneeName = !application.assignedEmployeeId
    ? "Unassigned"
    : ownerInactive
      ? "Inactive"
      : formerOwnerName || "Unassigned";

  const defaultTab =
    application.status === "READY" || application.status === "RESUBMISSION"
      ? "submission"
      : application.status === "PREPARING" || application.status === "REVIEW"
        ? "prep_review"
        : (interviewData?.rounds?.length || 0) > 0
          ? "activity"
          : "overview";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Concise Enterprise Application Header */}
      <ApplicationWorkspaceHeader
        applicationId={application.id}
        candidateId={application.candidateId}
        candidateName={candidateName}
        jobTitle={application.job.title}
        companyName={application.job.companyName}
        createdAt={new Date(application.createdAt).toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        ownerDisplayName={assigneeName}
        ownerInactive={ownerInactive}
        continuityOutsideScope={continuityOutsideScope}
        isRemote={application.job.isRemote}
        location={application.job.location}
        salaryText={salaryText}
        employmentType={application.job.employmentType}
        externalJobUrl={application.job.externalUrl}
        status={application.status}
        workflow={workflow}
        prerequisites={prerequisites}
      />

      {/* 2. Dominant Next-Action Hero & 4-Stage Lifecycle Progress */}
      <ApplicationNextActionHero
        applicationId={application.id}
        status={application.status}
        workflow={workflow}
        prerequisites={prerequisites}
        /* Telemetry: Waiting For */
        waitingForLabel={waitingAttribution.waitingForLabel}
        waitingAgeLabel={
          waitingAttribution.waitingAgeKind === "AGE"
            ? waitingAttribution.waitingAgeLabel
            : "AGE_UNAVAILABLE"
        }
        /* Telemetry: Waiting Since */
        waitingSinceFormatted={
          waitingAttribution.waitingAgeKind === "AGE" && waitingAttribution.waitingSince
            ? new Date(waitingAttribution.waitingSince).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })
            : null
        }
        ownerDisplayName={assigneeName}
        ownerInactive={ownerInactive}
        candidateName={candidateName}
        candidateAuthMode={application.candidate.applicationAuthorizationMode}
        externalJobUrl={application.job.externalUrl}
      />

      {/* Tabbed Operational Workbench Layout */}
      <ApplicationWorkbenchTabs
        initialTab={defaultTab}
        roundsCount={interviewData?.rounds?.length || 0}
        submissionsCount={application.submissions.length}
        status={application.status}
        overviewSlot={
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Main Column: Job Information & Candidate Context (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Job Details Card */}
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
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 hover:underline"
                      >
                        <span>Employer Listing</span>
                        <span>↗</span>
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/60 text-xs">
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide">Location</span>
                      <span className="font-semibold text-slate-800">
                        {application.job.isRemote ? "🌐 Remote" : application.job.location || "On-site"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide">Type</span>
                      <span className="font-semibold text-slate-800">{application.job.employmentType.replace(/_/g, " ")}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide">Compensation</span>
                      <span className={salaryText === "Salary not disclosed" ? "text-slate-500 font-normal" : "font-bold text-emerald-700"}>
                        {salaryText}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 block uppercase font-bold text-[10px] tracking-wide mb-1.5">
                      Job Description & Scope
                    </span>
                    <div className="whitespace-pre-wrap p-4 bg-slate-50/90 rounded-xl border border-slate-200 text-xs leading-relaxed text-slate-700 max-h-80 overflow-y-auto">
                      {application.job.jobDescription}
                    </div>
                  </div>
                </div>
              </div>

              {/* Candidate Profile Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Candidate Profile & Qualifications
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Verified candidate context and preferences</p>
                  </div>
                  <Link
                    href={`/employee/candidates/${application.candidateId}`}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    View Full 360 Profile →
                  </Link>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <div className="font-bold text-slate-900 text-base">{candidateName}</div>
                    <div className="text-slate-500">{application.candidate.user.email}</div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/60 text-xs">
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide">Candidate Status</span>
                      <span className="font-semibold text-slate-800">{application.candidate.status}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide">Auth Mode</span>
                      <span className="font-semibold text-indigo-700">{application.candidate.applicationAuthorizationMode}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide">Work Auth</span>
                      <span className="font-semibold text-slate-800">{application.candidate.workAuthorization.replace(/_/g, " ")}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide">Remote Pref</span>
                      <span className="font-semibold text-slate-800">{application.candidate.remotePreference.replace(/_/g, " ")}</span>
                    </div>
                  </div>

                  {application.candidate.headline && (
                    <div className="pt-2">
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide">Headline</span>
                      <p className="text-slate-800 font-medium text-xs mt-0.5">{application.candidate.headline}</p>
                    </div>
                  )}

                  {application.candidate.targetRoles.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide">Target Roles</span>
                      <p className="text-slate-700 text-xs mt-0.5">{application.candidate.targetRoles.join(", ")}</p>
                    </div>
                  )}

                  {application.candidate.skills.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide mb-1.5">Technical & Professional Skills</span>
                      <div className="flex flex-wrap gap-1.5">
                        {application.candidate.skills.map((s) => (
                          <span key={s.id} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200/60">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {application.candidate.experiences.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-slate-400 block uppercase font-bold text-[10px] tracking-wide mb-1.5">Recent Experience</span>
                      <div className="space-y-1.5">
                        {application.candidate.experiences.slice(0, 3).map((exp) => (
                          <div key={exp.id} className="text-xs text-slate-700 flex items-baseline justify-between">
                            <span>
                              <strong className="font-semibold text-slate-900">{exp.jobTitle}</strong> at {exp.companyName}
                            </span>
                            {exp.startDate && (
                              <span className="text-[11px] text-slate-400">
                                {new Date(exp.startDate).getFullYear()} - {exp.isCurrent ? "Present" : exp.endDate ? new Date(exp.endDate).getFullYear() : ""}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar Column: Assignment & Notes (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Operational Assignment Control */}
              <ApplicationOwnershipCard
                applicationId={application.id}
                currentAssigneeId={application.assignedEmployeeId}
                assigneeName={assigneeName}
                ownerInactive={ownerInactive}
                formerOwnerName={formerOwnerName}
                continuityOutsideScope={continuityOutsideScope}
                assigneeOptions={assigneeOptions}
                allowUnassigned={allowUnassigned}
              />

              {/* Internal Staff Notes (Candidate Blind) */}
              <InternalNotesWidget
                candidateId={application.candidateId}
                applicationId={application.id}
              />
            </div>
          </div>
        }
        prepReviewSlot={
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Preparation & Intelligence (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Application Materials Preparation */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Application Materials Preparation
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Attach the candidate resume version and tailored cover letter</p>
                </div>

                <form
                  action={async (formData: FormData) => {
                    "use server";
                    await updateApplicationMaterialAction({
                      applicationId: application.id,
                      candidateDocumentId: (formData.get("documentId") as string) || null,
                      coverLetterText: (formData.get("coverLetter") as string) || null,
                    });
                  }}
                  className="space-y-4 text-xs"
                >
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1.5">Candidate Resume Version</label>
                    <select
                      name="documentId"
                      defaultValue={currentMaterial?.candidateDocumentId || ""}
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="">Select Resume Version...</option>
                      {candidateDocs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} (v{d.versionNumber}) — {d.documentType}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-800 mb-1.5">Tailored Cover Letter</label>
                    <textarea
                      name="coverLetter"
                      defaultValue={currentMaterial?.coverLetterText || ""}
                      rows={8}
                      className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 font-sans leading-relaxed"
                      placeholder="Write or paste tailored cover letter text..."
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-slate-900 text-white font-semibold py-2.5 rounded-xl text-xs hover:bg-slate-800 transition shadow-xs"
                  >
                    Save Tailored Materials
                  </button>
                </form>
              </div>

              <ApplicationIntelligencePanel
                view={intelligence}
                audience="staff"
                loadFailed={intelligenceLoadFailed}
              />

              <ResumeReviewPanel applicationId={application.id} canRequest />
            </div>

            {/* Right Column: QA Verification & Approval Gate (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Operational Review & Approval Gate
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Enforce authoritative QA verification and candidate sign-off</p>
                </div>

                {application.status === "DISCOVERED" && (
                  <form
                    action={async () => {
                      "use server";
                      await transitionApplicationStatusAction({
                        applicationId: application.id,
                        targetStatus: "QUALIFIED",
                      });
                    }}
                  >
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-xs">
                      ✓ Qualify Application
                    </button>
                  </form>
                )}

                {application.status === "QUALIFIED" && (
                  <form
                    action={async () => {
                      "use server";
                      await transitionApplicationStatusAction({
                        applicationId: application.id,
                        targetStatus: "PREPARING",
                      });
                    }}
                  >
                    <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-xs">
                      Begin Material Preparation
                    </button>
                  </form>
                )}

                {application.status === "PREPARING" && (
                  <form
                    action={async () => {
                      "use server";
                      await submitApplicationForQaAction(application.id);
                    }}
                  >
                    <button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-xs">
                      Submit for QA Review
                    </button>
                  </form>
                )}

                {application.status === "REVIEW" && (
                  <div className="space-y-4">
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                      Authoritative QA PASS with all 9 criteria verified is required before candidate approval or READY.
                    </p>
                    <form
                      action={async (formData: FormData) => {
                        "use server";
                        const isPass = formData.get("decision") === "PASS";
                        const notes = formData.get("notes") as string;
                        await completeQaReviewAction({
                          applicationId: application.id,
                          decision: isPass ? "PASS" : "FAIL",
                          notes: notes || null,
                          checklistItems: QA_CRITERION_KEYS.map((k) => ({
                            criterionKey: k,
                            isVerified: formData.get(`check_${k}`) === "on",
                          })),
                        });
                      }}
                      className="space-y-3"
                    >
                      <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/70">
                        <p className="text-xs font-bold text-slate-800">9-Criterion QA Checklist:</p>
                        <div className="space-y-1.5">
                          {QA_CRITERION_KEYS.map((key) => (
                            <label key={key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                              <input type="checkbox" name={`check_${key}`} defaultChecked className="rounded border-slate-300 text-slate-900" />
                              <span>{key.replace(/_/g, " ")}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <input
                          type="text"
                          name="notes"
                          placeholder="Reviewer notes (mandatory if Fail)..."
                          className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          name="decision"
                          value="PASS"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-xs"
                        >
                          ✓ Pass QA Review
                        </button>
                        <button
                          type="submit"
                          name="decision"
                          value="FAIL"
                          className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-xs"
                        >
                          ✕ Fail QA Review
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {application.status === "AWAITING_APPROVAL" && (
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-sm">
                      <span>⏳</span>
                      <span>Awaiting Candidate Authorization</span>
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Application materials passed QA review and are staged awaiting candidate sign-off in their candidate portal before submission unlocks.
                    </p>
                  </div>
                )}

                {!["DISCOVERED", "QUALIFIED", "PREPARING", "REVIEW", "AWAITING_APPROVAL"].includes(application.status) && (
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-950 space-y-1">
                    <div className="font-bold text-sm flex items-center gap-1.5">
                      <span>✓</span>
                      <span>Review & Approval Phase Completed</span>
                    </div>
                    <p className="text-xs text-emerald-800">
                      Application progressed past QA & approval gate and is currently in <strong className="font-semibold text-emerald-950">{application.status.replace(/_/g, " ")}</strong>.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        }
        submissionSlot={
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Submission Operations & Incident Desk
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Authoritatively record employer site submissions and manage correction workflows</p>
              </div>

              {application.status === "READY" && (
                <div className="space-y-4">
                  <div className="p-4 bg-sky-50 rounded-xl border border-sky-200 text-xs text-sky-950 space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-sm">
                      <span className="w-2 h-2 rounded-full bg-sky-600" />
                      Record External Submission
                    </p>
                    <p className="text-xs text-sky-800 leading-relaxed">
                      After submitting directly on the external employer site, enter the confirmation reference and optional evidence below to record authoritative submission.
                    </p>
                  </div>
                  <SubmissionForm applicationId={application.id} isResubmission={false} />
                </div>
              )}

              {application.status === "SUBMITTED" && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 bg-emerald-50 text-emerald-950 rounded-xl border border-emerald-200 font-medium space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-sm text-emerald-900">
                      <span>✓</span>
                      <span>Application Authoritatively Submitted</span>
                    </div>
                    <p className="text-xs text-emerald-800">
                      External employer submission record is active, verified, and immutable.
                    </p>
                  </div>

                  <form
                    action={async (formData: FormData) => {
                      "use server";
                      await recordSubmissionIssueAction({
                        applicationId: application.id,
                        issueDescription: formData.get("issueDescription") as string,
                      });
                    }}
                    className="space-y-3 border-t border-slate-100 pt-4"
                  >
                    <label className="block font-semibold text-slate-800">Flag Submission Defect / External Incident</label>
                    <textarea
                      name="issueDescription"
                      required
                      minLength={5}
                      rows={3}
                      className="w-full rounded-xl border border-slate-300 p-3 text-xs"
                      placeholder="Describe defect, rejection notice, or external listing incident..."
                    />
                    <button type="submit" className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 text-white font-semibold rounded-xl text-xs hover:bg-rose-700 transition shadow-xs">
                      Report Submission Issue
                    </button>
                  </form>
                </div>
              )}

              {application.status === "SUBMISSION_ISSUE" && (
                <form
                  action={async () => {
                    "use server";
                    await startCorrectionReviewAction(application.id);
                  }}
                >
                  <button type="submit" className="w-full bg-amber-600 text-white font-bold py-2.5 rounded-xl text-xs hover:bg-amber-700 transition shadow-xs">
                    Start Incident Review
                  </button>
                </form>
              )}

              {application.status === "REVIEW_REQUIRED" && (
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    await approveSubmissionCorrectionAction({
                      applicationId: application.id,
                      correctionNotes: formData.get("correctionNotes") as string,
                    });
                  }}
                  className="space-y-3 text-xs"
                >
                  <label className="block font-semibold text-slate-800">Correction Approval Notes (Mandatory) *</label>
                  <textarea
                    name="correctionNotes"
                    required
                    minLength={5}
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 p-3 text-xs"
                    placeholder="Describe resolution strategy and corrections made..."
                  />
                  <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-xl text-xs hover:bg-indigo-700 transition shadow-xs">
                    Approve Correction Plan
                  </button>
                </form>
              )}

              {application.status === "CORRECTION_APPROVED" && (
                <form
                  action={async () => {
                    "use server";
                    await stageApplicationResubmissionAction({
                      applicationId: application.id,
                    });
                  }}
                >
                  <button type="submit" className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl text-xs hover:bg-blue-700 transition shadow-xs">
                    Stage Resubmission
                  </button>
                </form>
              )}

              {application.status === "RESUBMISSION" && (
                <div className="space-y-4">
                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900">
                    <p className="font-semibold text-sm">Resubmission Staged</p>
                    <p className="text-xs text-purple-800 mt-0.5 leading-relaxed">
                      Perform the manual resubmission on the external portal and record the updated attempt details below.
                    </p>
                  </div>
                  <SubmissionForm applicationId={application.id} isResubmission={true} />
                </div>
              )}

              {!["READY", "SUBMITTED", "SUBMISSION_ISSUE", "REVIEW_REQUIRED", "CORRECTION_APPROVED", "RESUBMISSION"].includes(application.status) && (
                <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200/80">
                  <p className="text-xs font-medium">
                    External submission actions will unlock when application reaches <strong className="text-slate-800">READY</strong> status.
                  </p>
                </div>
              )}
            </div>

            {/* Authoritative Submission History & Evidence */}
            {application.submissions.length > 0 && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Authoritative Submission History
                  </h3>
                  <span className="text-xs font-semibold text-slate-500">
                    {application.submissions.length} {application.submissions.length === 1 ? "attempt" : "attempts"}
                  </span>
                </div>
                <div className="space-y-4">
                  {application.submissions.map((sub) => (
                    <div key={sub.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                      <div className="flex justify-between items-center font-bold text-slate-900 border-b border-slate-200/70 pb-2">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Attempt #{sub.attemptNumber}
                        </span>
                        <span className="text-slate-500 text-xs font-normal">
                          {new Date(sub.submittedAt).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {sub.submittedBy && (
                        <div className="text-slate-600 text-xs">
                          Submitted By:{" "}
                          <span className="text-slate-900 font-semibold">
                            {[sub.submittedBy.firstName, sub.submittedBy.lastName].filter(Boolean).join(" ") || sub.submittedBy.email}
                          </span>
                        </div>
                      )}
                      {sub.externalReference && (
                        <div className="text-slate-700">
                          <span className="font-semibold text-slate-600">Confirmation Reference:</span>{" "}
                          <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border border-slate-200">{sub.externalReference}</span>
                        </div>
                      )}
                      {sub.externalUrl && (
                        <div>
                          <a href={sub.externalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1">
                            <span>Open Submitted URL</span>
                            <span>↗</span>
                          </a>
                        </div>
                      )}
                      {sub.confirmationEvidence && (
                        <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                          {sub.confirmationEvidence}
                        </div>
                      )}
                      {sub.storagePath && (
                        <div className="pt-1">
                          <EvidenceDownloadButton submissionId={sub.id} />
                        </div>
                      )}
                      {sub.submissionNotes && (
                        <div className="text-xs text-slate-500 italic">
                          Notes: {sub.submissionNotes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        }
        activitySlot={
          <div className="space-y-6">
            <StaffInterviewPanel
              applicationId={application.id}
              jobTitle={application.job.title}
              companyName={application.job.companyName}
              candidateSkills={application.candidate.skills.map((s) => s.name)}
              candidateExperiences={application.candidate.experiences.map((e) => ({
                company: e.companyName,
                title: e.jobTitle,
                highlights: e.achievements || [],
              }))}
              interview={interviewData}
            />

            <StaffOutcomesPanel
              applicationId={application.id}
              outcomes={outcomes}
              canRecord={application.submissions.length > 0}
            />

            {/* Operational Quality & Audit Telemetry Strip */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Operational Quality & Audit Telemetry
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Authoritative Database Record</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TelemetryGauge
                  displayValue={currentMaterial ? "Materials Staged" : "Materials Pending"}
                  title="Candidate Materials Status"
                  subtitle="Authoritative link to candidate resume document and tailored cover letter."
                  category="Materials Status"
                  color={currentMaterial ? "emerald" : "amber"}
                  metrics={[
                    { label: "Document Staged", value: currentMaterial?.candidateDocument ? `${currentMaterial.candidateDocument.title} (v${currentMaterial.candidateDocument.versionNumber})` : "None" },
                    { label: "Cover Letter", value: currentMaterial?.coverLetterText ? "Tailored" : "Not Provided" },
                  ]}
                />

                <TelemetryGauge
                  displayValue={application.candidate.applicationAuthorizationMode}
                  title="Candidate Governance & Policy"
                  subtitle="Authorization mode governing whether manual sign-off is mandatory before submission."
                  category="Candidate Policy"
                  color={application.candidate.applicationAuthorizationMode === "MANAGED" ? "indigo" : "amber"}
                  metrics={[
                    { label: "Authorization Mode", value: application.candidate.applicationAuthorizationMode },
                    { label: "Candidate Status", value: application.candidate.status },
                  ]}
                />

                <TelemetryGauge
                  displayValue={`${application.submissions.length} ${application.submissions.length === 1 ? "Attempt" : "Attempts"}`}
                  title="Submission Audit Trail"
                  subtitle="Immutable operational record of external job portal submissions."
                  category="Submission Record"
                  color={application.submissions.length > 0 ? "blue" : "slate" as any}
                  metrics={[
                    { label: "Attempts Recorded", value: `${application.submissions.length}` },
                    { label: "Assigned Specialist", value: assigneeName },
                  ]}
                />
              </div>
            </div>

            {/* Authoritative State Transition History Timeline */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Application State Lifecycle Timeline
                </h3>
                <span className="text-xs font-semibold text-slate-500">
                  {application.stateHistory.length} {application.stateHistory.length === 1 ? "transition" : "transitions"}
                </span>
              </div>
              <div className="space-y-3">
                {application.stateHistory.map((h) => (
                  <div key={h.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 text-xs">
                    <div className="flex justify-between items-center font-bold text-slate-900">
                      <span className="font-mono text-xs">{h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}</span>
                      <span className="text-slate-400 font-normal text-xs">{new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {h.reason && <div className="text-slate-600 mt-1.5 leading-relaxed">{h.reason}</div>}
                    <div className="text-slate-400 text-[11px] mt-1">
                      By: {[h.changedBy?.firstName, h.changedBy?.lastName].filter(Boolean).join(" ") || h.changedBy?.email || "System"} on {new Date(h.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
