import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  assignApplicationAction,
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
import { ApplicationStatus } from "@/generated/prisma";
import { formatSalary, getCandidateStatusPresentation } from "@/lib/utils/status-presenter";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EmployeeApplicationWorkbenchPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const { application, employees, candidateDocs } = await withRlsContext(ctx.userId, async (tx) => {
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
      },
    });
    if (!app) return { application: null, employees: [], candidateDocs: [] };

    const emps = await tx.membership.findMany({
      where: { organizationId: ctx.organizationId, role: { in: ["EMPLOYEE", "ADMIN"] }, status: "ACTIVE" },
      include: { user: true },
    });

    const docs = await tx.candidateDocument.findMany({
      where: { candidateId: app.candidateId },
      orderBy: { createdAt: "desc" },
    });

    return { application: app, employees: emps, candidateDocs: docs };
  });

  if (!application) {
    notFound();
  }

  const currentMaterial = application.materials[0];

  const candidateName =
    [application.candidate.user.firstName, application.candidate.user.lastName].filter(Boolean).join(" ") ||
    application.candidate.user.email;

  const salaryText = formatSalary(
    application.job.salaryMin,
    application.job.salaryMax,
    application.job.salaryCurrency
  );

  // Authoritative progression sequence
  const coreStages = [
    { key: "DISCOVERED", label: "Discovered" },
    { key: "QUALIFIED", label: "Qualified" },
    { key: "PREPARING", label: "Preparing" },
    { key: "REVIEW", label: "QA Review" },
    { key: "AWAITING_APPROVAL", label: "Candidate Sign-off" },
    { key: "READY", label: "Ready to Apply" },
    { key: "SUBMITTED", label: "Submitted" },
  ];

  const currentStageIndex = coreStages.findIndex((s) => s.key === application.status);

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
        return "bg-amber-100 text-amber-900 border-amber-300 font-semibold";
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

  const deriveNextActionGuidance = (status: ApplicationStatus) => {
    switch (status) {
      case "DISCOVERED":
        return "Review job qualifications and advance application to Qualified status.";
      case "QUALIFIED":
        return "Begin tailoring candidate resume and cover letter materials.";
      case "PREPARING":
        return "Complete tailoring and submit application package for internal QA review.";
      case "REVIEW":
        return "Execute the 9-criterion QA checklist and record Pass or Fail decision.";
      case "AWAITING_APPROVAL":
        return "Application package is staged for candidate approval. Awaiting candidate sign-off.";
      case "READY":
        return "Open the external job posting, complete the application on employer portal, then record submission details below.";
      case "SUBMITTED":
        return "Authoritative external submission recorded. Monitor application status or flag defects if encountered.";
      case "SUBMISSION_ISSUE":
        return "Submission issue reported. Start operational correction review.";
      case "REVIEW_REQUIRED":
        return "Formulate correction resolution and approve correction plan.";
      case "CORRECTION_APPROVED":
        return "Stage corrected application for resubmission.";
      case "RESUBMISSION":
        return "Perform manual external resubmission and record attempt details below.";
      case "REJECTED":
        return "Application was rejected by candidate during approval stage.";
      case "WITHDRAWN":
        return "Application was withdrawn.";
      case "FAILED":
        return "Application reached a terminal failure state.";
      default:
        return "Review current application status.";
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header & Breadcrumb */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/employee/applications" className="hover:text-slate-800 font-medium">
            ← Applications Console
          </Link>
          <span className="text-slate-300">/</span>
          <Link href={`/employee/candidates/${application.candidateId}`} className="hover:text-slate-800 font-medium">
            {candidateName}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-semibold">{application.job.title}</span>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-t border-slate-100 pt-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {application.job.title}
              </h1>
              <span className="text-xs text-slate-500 font-medium">at {application.job.companyName}</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusBadge(application.status)}`}>
                {application.status.replace(/_/g, " ")}
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <span>Candidate: <strong className="text-slate-800">{candidateName}</strong></span>
              <span>•</span>
              <span>
                Assignee:{" "}
                <strong className="text-slate-800">
                  {application.assignedEmployee
                    ? [application.assignedEmployee.firstName, application.assignedEmployee.lastName].filter(Boolean).join(" ") || application.assignedEmployee.email
                    : "Unassigned"}
                </strong>
              </span>
              <span>•</span>
              <span>
                Location: <strong className="text-slate-800">{application.job.isRemote ? "🌐 Remote" : application.job.location || "On-site"}</strong>
              </span>
              <span>•</span>
              <span>
                Salary: <strong className={salaryText === "Salary not disclosed" ? "text-slate-600" : "text-emerald-700 font-semibold"}>{salaryText}</strong>
              </span>
              <span>•</span>
              <span>Created {new Date(application.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {application.job.externalUrl && (
              <a
                href={application.job.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition inline-flex items-center gap-1 shadow-2xs"
              >
                <span>External Job Posting</span>
                <span>↗</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Authorization Policy Banner */}
      <div className={`p-3.5 rounded-lg border text-xs flex items-center justify-between gap-4 ${
        application.candidate.applicationAuthorizationMode === "MANAGED"
          ? "bg-indigo-50/70 border-indigo-200 text-indigo-900"
          : "bg-slate-50 border-slate-200 text-slate-800"
      }`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${
            application.candidate.applicationAuthorizationMode === "MANAGED"
              ? "bg-indigo-600 text-white"
              : "bg-slate-700 text-white"
          }`}>
            {application.candidate.applicationAuthorizationMode === "MANAGED" ? "Managed Authorization" : "Review Required Mode"}
          </span>
          <span className="font-medium">
            {application.candidate.applicationAuthorizationMode === "MANAGED"
              ? "Candidate authorized managed submissions within approved preferences. Passing QA directly advances this application to Ready."
              : "Candidate mandates per-application review. Passing QA will stage this application for candidate sign-off."}
          </span>
        </div>
      </div>

      {/* Candidate Live Perspective Projection */}
      <div className="bg-slate-900 text-white p-3.5 rounded-lg border border-slate-800 text-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Candidate View Projection
          </span>
          <span className="text-slate-300">
            Candidate sees status: <strong className="text-white">{getCandidateStatusPresentation(application.status).label}</strong>
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-300">
            Action required:{" "}
            <strong className={application.status === "AWAITING_APPROVAL" ? "text-amber-400 font-bold" : "text-slate-200"}>
              {application.status === "AWAITING_APPROVAL" ? "Approval Required from Candidate" : "None (Managed by Operations Team)"}
            </strong>
          </span>
        </div>
      </div>

      {/* Visual Operational Lifecycle Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between gap-1 overflow-x-auto py-1">
          {coreStages.map((stage, idx) => {
            const isCompleted = currentStageIndex > idx || application.status === "SUBMITTED";
            const isCurrent = application.status === stage.key;

            return (
              <div key={stage.key} className="flex items-center gap-1 shrink-0">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium ${
                    isCurrent
                      ? "bg-slate-900 text-white font-bold shadow-2xs"
                      : isCompleted
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-slate-50 text-slate-400 border border-slate-200"
                  }`}
                >
                  <span>{isCompleted && !isCurrent ? "✓" : idx + 1}</span>
                  <span>{stage.label}</span>
                </div>
                {idx < coreStages.length - 1 && (
                  <span className="text-slate-300 text-xs px-0.5">→</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Correction Workflow Pill */}
        {["SUBMISSION_ISSUE", "REVIEW_REQUIRED", "CORRECTION_APPROVED", "RESUBMISSION"].includes(application.status) && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs">
            <span className="font-semibold text-rose-800 uppercase text-[10px]">Correction Workflow:</span>
            <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-xs">
              {application.status.replace(/_/g, " ")}
            </span>
          </div>
        )}

        {/* Operational Guidance */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-900 uppercase text-[10px] tracking-wide">Next Operational Action:</span>
          <span className="font-medium text-slate-800">{deriveNextActionGuidance(application.status)}</span>
        </div>
      </div>

      {/* Prominent READY Operational Banner */}
      {application.status === "READY" && (
        <div className="bg-sky-50/90 border-2 border-sky-400 rounded-lg p-5 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600 animate-ping" />
                <h3 className="text-sm font-bold text-sky-950 uppercase tracking-wide">
                  READY TO APPLY — MANUAL EXTERNAL SUBMISSION
                </h3>
              </div>
              <p className="text-xs text-sky-900 mt-1 leading-relaxed">
                Open the external job posting and complete the application on behalf of the candidate. This action opens the external website. OOS does not submit the application itself. After completing the external submission, record the submission details below.
              </p>
            </div>
            {application.job.externalUrl && (
              <a
                href={application.job.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-5 py-2.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm inline-flex items-center gap-2 transition"
              >
                <span>OPEN EXTERNAL JOB</span>
                <span>↗</span>
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 border-t border-sky-200/80 text-[11px]">
            <div className="flex items-center gap-1.5 text-sky-950 font-medium">
              <span className="text-emerald-600 font-bold">✓</span> Candidate Authorization Active
            </div>
            <div className="flex items-center gap-1.5 text-sky-950 font-medium">
              <span className="text-emerald-600 font-bold">✓</span> Application Materials Prepared
            </div>
            <div className="flex items-center gap-1.5 text-sky-950 font-medium">
              <span className="text-emerald-600 font-bold">✓</span> QA Verification Passed
            </div>
            <div className="flex items-center gap-1.5 text-sky-950 font-medium">
              <span className="text-emerald-600 font-bold">✓</span> Service Consent Verified
            </div>
            <div className="flex items-center gap-1.5 text-sky-950 font-medium">
              <span className="text-emerald-600 font-bold">✓</span> Job Listing Active
            </div>
          </div>
        </div>
      )}

      {/* 3-Column Execution Workbench Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Candidate Context */}
        <div className="space-y-6">
          {/* Candidate Profile Card */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
              Candidate Context
            </h3>
            <div className="text-xs space-y-2">
              <div>
                <div className="font-semibold text-slate-900 text-sm">{candidateName}</div>
                <div className="text-slate-500">{application.candidate.user.email}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-[11px]">
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Status</span>
                  <span className="font-medium text-slate-800">{application.candidate.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Auth Mode</span>
                  <span className="font-medium text-indigo-700">{application.candidate.applicationAuthorizationMode}</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Work Auth</span>
                  <span className="font-medium text-slate-800">{application.candidate.workAuthorization.replace(/_/g, " ")}</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Remote Pref</span>
                  <span className="font-medium text-slate-800">{application.candidate.remotePreference.replace(/_/g, " ")}</span>
                </div>
              </div>

              {application.candidate.headline && (
                <div className="pt-1 border-t border-slate-100">
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Headline</span>
                  <p className="text-slate-700 font-medium text-[11px] mt-0.5">{application.candidate.headline}</p>
                </div>
              )}

              {application.candidate.targetRoles.length > 0 && (
                <div className="pt-1 border-t border-slate-100">
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Target Roles</span>
                  <p className="text-slate-700 text-[11px] mt-0.5">{application.candidate.targetRoles.join(", ")}</p>
                </div>
              )}

              {application.candidate.skills.length > 0 && (
                <div className="pt-1 border-t border-slate-100">
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Skills</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {application.candidate.skills.map((s) => (
                      <span key={s.id} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {application.candidate.experiences.length > 0 && (
                <div className="pt-1 border-t border-slate-100">
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Recent Experience</span>
                  <div className="space-y-1 mt-1">
                    {application.candidate.experiences.slice(0, 2).map((exp) => (
                      <div key={exp.id} className="text-[11px] text-slate-700">
                        <strong className="font-medium">{exp.jobTitle}</strong> at {exp.companyName}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Operational Assignment Control */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
              Assigned Specialist
            </h3>
            <form
              action={async (formData: FormData) => {
                "use server";
                await assignApplicationAction({
                  applicationId: application.id,
                  employeeId: (formData.get("employeeId") as string) || null,
                });
              }}
              className="space-y-2 text-xs"
            >
              <select
                name="employeeId"
                defaultValue={application.assignedEmployeeId || ""}
                className="w-full rounded-md border border-slate-300 p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                <option value="">Unassigned</option>
                {employees.map((e) => (
                  <option key={e.userId} value={e.userId}>
                    {[e.user.firstName, e.user.lastName].filter(Boolean).join(" ") || e.user.email} ({e.role})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-1.5 rounded-md text-xs transition"
              >
                Save Assignee
              </button>
            </form>
          </div>

          {/* Internal Staff Notes (Candidate Blind) */}
          <InternalNotesWidget
            candidateId={application.candidateId}
            applicationId={application.id}
          />
        </div>

        {/* CENTER COLUMN: Job Details & Preparation / QA Workflow */}
        <div className="space-y-6">
          {/* Job Details Card */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
            <div className="flex justify-between items-start border-b pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Job Information
              </h3>
              {application.job.source && (
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-semibold border border-slate-200">
                  Source: {application.job.source}
                </span>
              )}
            </div>

            <div className="text-xs space-y-2">
              <div>
                <div className="font-semibold text-slate-900 text-sm">{application.job.title}</div>
                <div className="text-slate-600 font-medium">{application.job.companyName}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Location</span>
                  <span className="font-medium text-slate-800">
                    {application.job.isRemote ? "🌐 Remote" : application.job.location || "On-site"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Employment Type</span>
                  <span className="font-medium text-slate-800">{application.job.employmentType.replace(/_/g, " ")}</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Compensation</span>
                  <span className={salaryText === "Salary not disclosed" ? "text-slate-400 font-normal" : "font-semibold text-emerald-700"}>
                    {salaryText}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-semibold text-[10px]">Source URL</span>
                  {application.job.externalUrl ? (
                    <a
                      href={application.job.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium inline-flex items-center gap-0.5"
                    >
                      <span>Open Link</span>
                      <span>↗</span>
                    </a>
                  ) : (
                    <span className="text-slate-400 italic">None</span>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 block uppercase font-semibold text-[10px] mb-1">Job Description</span>
                <div className="max-h-56 overflow-y-auto whitespace-pre-wrap p-3 bg-slate-50 rounded border border-slate-200 text-[11px] leading-relaxed text-slate-700">
                  {application.job.jobDescription}
                </div>
              </div>
            </div>
          </div>

          {/* Application Materials Preparation */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
              Application Materials Preparation
            </h3>

            <form
              action={async (formData: FormData) => {
                "use server";
                await updateApplicationMaterialAction({
                  applicationId: application.id,
                  candidateDocumentId: (formData.get("documentId") as string) || null,
                  coverLetterText: (formData.get("coverLetter") as string) || null,
                });
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">Candidate Resume Version</label>
                <select
                  name="documentId"
                  defaultValue={currentMaterial?.candidateDocumentId || ""}
                  className="w-full rounded-md border border-slate-300 p-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">Select Resume...</option>
                  {candidateDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} (v{d.versionNumber}) - {d.documentType}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Tailored Cover Letter</label>
                <textarea
                  name="coverLetter"
                  defaultValue={currentMaterial?.coverLetterText || ""}
                  rows={6}
                  className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500 font-sans"
                  placeholder="Tailored cover letter text..."
                />
              </div>

              <button
                type="submit"
                className="w-full bg-slate-900 text-white font-semibold py-2 rounded-md text-xs hover:bg-slate-800 transition"
              >
                Save Tailored Materials
              </button>
            </form>
          </div>

          {/* Review & Approval Gate / QA Controls */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
              Operational Review & Approval Gate
            </h3>

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
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-xs font-bold transition">
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
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-md text-xs font-bold transition">
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
                <button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-md text-xs font-bold transition">
                  Submit for QA Review
                </button>
              </form>
            )}

            {application.status === "REVIEW" && (
              <div className="space-y-4">
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
                        isVerified: isPass ? true : formData.get(`check_${k}`) === "on",
                      })),
                    });
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1.5 border rounded p-2.5 bg-slate-50">
                    <p className="text-[11px] font-bold text-slate-700">9-Criterion QA Verification:</p>
                    {QA_CRITERION_KEYS.map((key) => (
                      <label key={key} className="flex items-center gap-2 text-[11px] text-slate-600">
                        <input type="checkbox" name={`check_${key}`} defaultChecked className="rounded border-slate-300 text-slate-900" />
                        <span>{key.replace(/_/g, " ")}</span>
                      </label>
                    ))}
                  </div>

                  <div>
                    <input
                      type="text"
                      name="notes"
                      placeholder="Reviewer notes (mandatory if Fail)..."
                      className="w-full text-xs rounded border border-slate-300 p-2"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      name="decision"
                      value="PASS"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-md text-xs font-bold transition"
                    >
                      ✓ Pass QA Review
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="FAIL"
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2 rounded-md text-xs font-bold transition"
                    >
                      ✕ Fail QA Review
                    </button>
                  </div>
                </form>
              </div>
            )}

            {application.status === "AWAITING_APPROVAL" && (
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <span>⏳</span>
                  <span>Awaiting Candidate Authorization</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Application is staged awaiting candidate review and authorization in their candidate portal before submission.
                </p>
              </div>
            )}

            {!["DISCOVERED", "QUALIFIED", "PREPARING", "REVIEW", "AWAITING_APPROVAL"].includes(application.status) && (
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-xs text-slate-600">
                Review and preparation phase completed. Application is in <strong className="text-slate-900">{application.status.replace(/_/g, " ")}</strong>.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Operational Action & Submission Management */}
        <div className="space-y-6">
          {/* Submission Action Box */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
              Submission Operations
            </h3>

            {application.status === "READY" && (
              <div className="space-y-3">
                <div className="p-3.5 bg-sky-50 rounded-md border border-sky-200 text-xs text-sky-950 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-600 animate-pulse" />
                    Record External Submission
                  </p>
                  <p className="text-[11px] text-sky-800">
                    After actually submitting on the external employer site, enter the confirmation reference and optional evidence below to record authoritative submission.
                  </p>
                </div>
                <SubmissionForm applicationId={application.id} isResubmission={false} />
              </div>
            )}

            {application.status === "SUBMITTED" && (
              <div className="space-y-3 text-xs">
                <div className="p-3.5 bg-emerald-50 text-emerald-950 rounded-md border border-emerald-200 font-medium space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                    <span>✓</span>
                    <span>Application Authoritatively Submitted</span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    External employer submission record is active and immutable.
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
                  className="space-y-2 border-t pt-3"
                >
                  <label className="block font-medium text-slate-700">Flag Submission Defect / Issue</label>
                  <textarea
                    name="issueDescription"
                    required
                    minLength={5}
                    rows={2}
                    className="w-full rounded-md border border-slate-300 p-2 text-xs"
                    placeholder="Describe defect, rejection, or external listing issue..."
                  />
                  <button type="submit" className="w-full bg-rose-600 text-white font-semibold py-1.5 rounded-md text-xs hover:bg-rose-700 transition">
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
                <button type="submit" className="w-full bg-amber-600 text-white font-bold py-2 rounded-md text-xs hover:bg-amber-700 transition">
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
                className="space-y-2 text-xs"
              >
                <label className="block font-medium text-slate-700">Correction Approval Notes (Mandatory) *</label>
                <textarea
                  name="correctionNotes"
                  required
                  minLength={5}
                  rows={2}
                  className="w-full rounded-md border border-slate-300 p-2 text-xs"
                  placeholder="Describe resolution strategy and corrections made..."
                />
                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-2 rounded-md text-xs hover:bg-indigo-700 transition">
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
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-2 rounded-md text-xs hover:bg-blue-700 transition">
                  Stage Resubmission
                </button>
              </form>
            )}

            {application.status === "RESUBMISSION" && (
              <div className="space-y-3">
                <div className="p-3 bg-purple-50 rounded-md border border-purple-200 text-xs text-purple-900">
                  <p className="font-semibold">Resubmission Staged</p>
                  <p className="text-[11px] text-purple-800 mt-0.5">
                    Perform the manual resubmission on the external portal and record the updated attempt details below.
                  </p>
                </div>
                <SubmissionForm applicationId={application.id} isResubmission={true} />
              </div>
            )}

            {!["READY", "SUBMITTED", "SUBMISSION_ISSUE", "REVIEW_REQUIRED", "CORRECTION_APPROVED", "RESUBMISSION"].includes(application.status) && (
              <p className="text-xs text-slate-500 italic text-center py-2">
                External submission will be unlocked when application reaches READY status.
              </p>
            )}
          </div>

          {/* Immutable Submission History & Evidence */}
          {application.submissions.length > 0 && (
            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
                Authoritative Submission History ({application.submissions.length} {application.submissions.length === 1 ? "attempt" : "attempts"})
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto text-xs">
                {application.submissions.map((sub) => (
                  <div key={sub.id} className="p-3 bg-slate-50 rounded-md border border-slate-200 text-xs space-y-1.5">
                    <div className="flex justify-between items-center font-bold text-slate-900 border-b pb-1">
                      <span className="inline-flex px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        Attempt #{sub.attemptNumber}
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {new Date(sub.submittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {sub.submittedBy && (
                      <div className="text-slate-500 text-[11px]">
                        Submitted By:{" "}
                        <span className="text-slate-800 font-medium">
                          {[sub.submittedBy.firstName, sub.submittedBy.lastName].filter(Boolean).join(" ") || sub.submittedBy.email}
                        </span>
                      </div>
                    )}
                    {sub.externalReference && (
                      <div className="text-slate-700">
                        <span className="font-semibold text-slate-600">Reference:</span> <span className="font-mono text-xs">{sub.externalReference}</span>
                      </div>
                    )}
                    {sub.externalUrl && (
                      <div>
                        <a href={sub.externalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-[11px]">
                          View Submitted URL ↗
                        </a>
                      </div>
                    )}
                    {sub.confirmationEvidence && (
                      <div className="bg-white p-2.5 rounded border border-slate-200 text-[11px] text-slate-700 whitespace-pre-wrap font-mono">
                        {sub.confirmationEvidence}
                      </div>
                    )}
                    {sub.storagePath && (
                      <div className="pt-1">
                        <EvidenceDownloadButton submissionId={sub.id} />
                      </div>
                    )}
                    {sub.submissionNotes && (
                      <div className="text-[11px] text-slate-500 italic">
                        Notes: {sub.submissionNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Authoritative State Transition History Timeline */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
              Application State Timeline
            </h3>
            <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
              {application.stateHistory.map((h) => (
                <div key={h.id} className="p-2.5 bg-slate-50 rounded-md border text-[11px]">
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>{h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}</span>
                    <span className="text-slate-400 font-normal">{new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {h.reason && <div className="text-slate-600 mt-1">{h.reason}</div>}
                  <div className="text-slate-400 mt-0.5">
                    By: {[h.changedBy?.firstName, h.changedBy?.lastName].filter(Boolean).join(" ") || h.changedBy?.email || "System"} on {new Date(h.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
