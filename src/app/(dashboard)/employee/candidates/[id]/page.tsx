import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import {
  assignCandidateAction,
  verifyCandidateAction,
  updateCandidateStatusAction,
} from "@/lib/candidate/actions";
import { InternalNotesWidget } from "@/components/InternalNotesWidget";
import { EmployeeCandidateDocuments } from "@/components/EmployeeCandidateDocuments";
import { RecordHeader } from "@/components/ui/RecordHeader";

export default async function EmployeeCandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const { id: candidateId } = await params;

  const { candidate, staffMembers, privateOpportunities, catalogAvailable } = await withRlsContext(
    ctx.userId,
    async (tx) => {
      const cand = await tx.candidate.findFirst({
        where: { id: candidateId, organizationId: ctx.organizationId },
        include: {
          user: true,
          assignedEmployee: true,
          verifier: true,
          experiences: { orderBy: { orderIndex: "asc" } },
          educations: { orderBy: { orderIndex: "asc" } },
          skills: { orderBy: { createdAt: "asc" } },
          projects: { orderBy: { orderIndex: "asc" } },
          certifications: { orderBy: { createdAt: "asc" } },
          documents: { orderBy: { createdAt: "desc" } },
          applications: {
            orderBy: { createdAt: "desc" },
            include: {
              job: true,
              assignedEmployee: true,
            },
          },
          tasks: {
            orderBy: { createdAt: "desc" },
            include: {
              assignedEmployee: true,
            },
          },
        },
      });

      const staff = await tx.membership.findMany({
        where: {
          organizationId: ctx.organizationId,
          role: { in: ["EMPLOYEE", "ADMIN"] },
          status: "ACTIVE",
        },
        include: { user: true },
      });

      const privateOpps = cand
        ? await tx.candidateJobOpportunity.findMany({
            where: {
              organizationId: ctx.organizationId,
              candidateId: cand.id,
              status: "ACTIVE",
              job: { visibility: "CANDIDATE_PRIVATE" },
            },
            include: {
              job: {
                select: {
                  id: true,
                  title: true,
                  companyName: true,
                  source: true,
                  location: true,
                  isRemote: true,
                  visibility: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        : [];

      const linkedJobIds = cand
        ? (
            await tx.candidateJobOpportunity.findMany({
              where: { candidateId: cand.id, organizationId: ctx.organizationId },
              select: { jobId: true },
            })
          ).map((o) => o.jobId)
        : [];

      const catalogJobs = cand
        ? await tx.job.findMany({
            where: {
              organizationId: ctx.organizationId,
              visibility: "GLOBAL",
              status: "OPEN",
              ...(linkedJobIds.length > 0 ? { id: { notIn: linkedJobIds } } : {}),
            },
            select: {
              id: true,
              title: true,
              companyName: true,
              source: true,
              location: true,
              isRemote: true,
            },
            orderBy: { createdAt: "desc" },
            take: 8,
          })
        : [];

      return {
        candidate: cand,
        staffMembers: staff,
        privateOpportunities: privateOpps,
        catalogAvailable: catalogJobs,
      };
    }
  );

  if (!candidate) {
    notFound();
  }

  const candidateName =
    [candidate.user.firstName, candidate.user.lastName].filter(Boolean).join(" ") || candidate.user.email;

  const locationStr = [candidate.city, candidate.state, candidate.country].filter(Boolean).join(", ");

  const assignedStaffName = candidate.assignedEmployee
    ? [candidate.assignedEmployee.firstName, candidate.assignedEmployee.lastName].filter(Boolean).join(" ") || candidate.assignedEmployee.email
    : "Unassigned";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Candidate 360 Record Header */}
      <RecordHeader
        breadcrumbs={[
          { label: "Candidates Directory", href: "/employee/candidates" },
          { label: candidateName },
        ]}
        title={candidateName}
        subtitle={
          <>
            {candidate.headline && <span>{candidate.headline}</span>}
            {locationStr && (
              <>
                <span>•</span>
                <span>{locationStr}</span>
              </>
            )}
            <span>•</span>
            <span>{candidate.user.email}</span>
          </>
        }
        statusBadge={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                candidate.status === "ACTIVE"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : candidate.status === "ONBOARDING"
                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                  : candidate.status === "INACTIVE"
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "bg-slate-100 text-slate-800 border border-slate-200"
              }`}
            >
              {candidate.status}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                candidate.verificationStatus === "VERIFIED"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : candidate.verificationStatus === "PENDING_REVIEW"
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : candidate.verificationStatus === "REJECTED"
                  ? "bg-rose-50 text-rose-800 border border-rose-200"
                  : "bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              Verification: {candidate.verificationStatus.replace("_", " ")}
            </span>
          </div>
        }
        metaItems={[
          {
            label: "Specialist",
            value: assignedStaffName,
          },
          {
            label: "Auth Mode",
            value: (
              <span className={`font-semibold ${candidate.applicationAuthorizationMode === "MANAGED" ? "text-indigo-700" : "text-slate-700"}`}>
                {candidate.applicationAuthorizationMode}
              </span>
            ),
          },
          {
            label: "Work Auth",
            value: candidate.workAuthorization.replace(/_/g, " "),
          },
          {
            label: "Remote Pref",
            value: candidate.remotePreference.replace(/_/g, " "),
          },
          {
            label: "Applications",
            value: `${candidate.applications.length} Staged`,
          },
          {
            label: "Active Tasks",
            value: `${candidate.tasks.length} Assigned`,
          },
        ]}
      />

      {/* Staff Operational Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. Manual Assignment Control */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Operational Assignment</h3>
            <span className="text-[10px] text-slate-400">Ownership</span>
          </div>
          <p className="text-xs text-slate-500">
            Assign responsible specialist for candidate operations.
          </p>
          <form
            action={async (formData: FormData) => {
              "use server";
              const employeeId = (formData.get("employeeId") as string) || null;
              await assignCandidateAction({
                candidateId: candidate.id,
                employeeId,
              });
            }}
            className="space-y-3"
          >
            <select
              name="employeeId"
              defaultValue={candidate.assignedEmployeeId ?? ""}
              className="block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">Unassigned</option>
              {staffMembers.map((sm) => (
                <option key={sm.userId} value={sm.userId}>
                  {[sm.user.firstName, sm.user.lastName].filter(Boolean).join(" ") || sm.user.email} ({sm.role})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition"
            >
              Update Assignment
            </button>
          </form>
        </div>

        {/* 2. Verification Control */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Profile Verification</h3>
            <span className="text-[10px] text-slate-400">Source of Truth</span>
          </div>
          <form
            action={async (formData: FormData) => {
              "use server";
              await verifyCandidateAction({
                candidateId: candidate.id,
                verificationStatus: formData.get("verificationStatus") as any,
                verificationNotes: (formData.get("verificationNotes") as string) || null,
              });
            }}
            className="space-y-3"
          >
            <select
              name="verificationStatus"
              defaultValue={candidate.verificationStatus}
              className="block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="UNVERIFIED">UNVERIFIED</option>
              <option value="PENDING_REVIEW">PENDING_REVIEW</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
            <input
              name="verificationNotes"
              defaultValue={candidate.verificationNotes ?? ""}
              placeholder="Candidate-visible correction note..."
              className="block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition"
            >
              Record Verification
            </button>
          </form>
        </div>

        {/* 3. Lifecycle Status Control */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Lifecycle State Transition</h3>
            <span className="text-[10px] text-slate-400">Governance</span>
          </div>
          <p className="text-xs text-slate-500">
            Current: <strong className="text-slate-900">{candidate.status}</strong>
          </p>
          <form
            action={async (formData: FormData) => {
              "use server";
              await updateCandidateStatusAction({
                candidateId: candidate.id,
                targetStatus: formData.get("targetStatus") as any,
              });
            }}
            className="space-y-3"
          >
            <select
              name="targetStatus"
              defaultValue=""
              className="block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="" disabled>Select next transition...</option>
              {candidate.status === "ONBOARDING" && <option value="ACTIVE">ACTIVE</option>}
              {candidate.status === "ONBOARDING" && <option value="INACTIVE">INACTIVE</option>}
              {candidate.status === "ACTIVE" && <option value="INACTIVE">INACTIVE</option>}
              {candidate.status === "ACTIVE" && <option value="ARCHIVED">ARCHIVED</option>}
              {candidate.status === "INACTIVE" && <option value="ACTIVE">ACTIVE</option>}
              {candidate.status === "INACTIVE" && <option value="ARCHIVED">ARCHIVED</option>}
            </select>
            <button
              type="submit"
              disabled={candidate.status === "ARCHIVED"}
              className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition"
            >
              Apply Transition
            </button>
          </form>
        </div>
      </div>

      {/* Candidate Documents Section (Phase 2 Storage & Resumes) */}
      <EmployeeCandidateDocuments
        candidateId={candidate.id}
        candidateName={candidateName}
        documents={candidate.documents as any}
      />

      {/* Candidate Job Opportunities */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-5">
        <div className="flex justify-between items-start border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Candidate Job Opportunities</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Private leads for this candidate versus reusable organization catalog jobs.
            </p>
          </div>
          <Link
            href={`/employee/application-log?candidateId=${candidate.id}`}
            className="text-xs font-medium text-[#0B3B2C] hover:underline"
          >
            Open Application Desk →
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#0B3B2C]">
              Candidate-specific
            </div>
            {privateOpportunities.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 border border-dashed border-slate-200 rounded-md">
                No private job leads for this candidate yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {privateOpportunities.map((opp) => (
                  <div key={opp.id} className="px-3 py-2.5">
                    <div className="text-sm font-semibold text-slate-900">{opp.job.title}</div>
                    <div className="text-xs text-slate-600">{opp.job.companyName}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{opp.job.source || "External"}</span>
                      <span>•</span>
                      <span className="font-semibold text-[#0B3B2C]">Private opportunity</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Organization Catalog
            </div>
            {catalogAvailable.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 border border-dashed border-slate-200 rounded-md">
                No additional catalog jobs available to add.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {catalogAvailable.map((job) => (
                  <div key={job.id} className="px-3 py-2.5">
                    <div className="text-sm font-semibold text-slate-900">{job.title}</div>
                    <div className="text-xs text-slate-600">{job.companyName}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{job.source || "External"}</span>
                      <span>•</span>
                      <span className="font-semibold text-slate-700">Available to add</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Applications Section */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">Candidate Applications</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                {candidate.applications.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Applications prepared and managed on behalf of {candidateName}.
            </p>
          </div>
          <Link
            href="/employee/applications"
            className="text-xs text-slate-600 hover:text-slate-900 font-medium"
          >
            View all applications →
          </Link>
        </div>

        {candidate.applications.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-md">
            No applications staged for this candidate yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {candidate.applications.map((app) => (
              <div
                key={app.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 px-2 rounded transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{app.job.title}</span>
                    <span className="text-xs text-slate-500">at {app.job.companyName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span>Created {new Date(app.createdAt).toLocaleDateString()}</span>
                    {app.assignedEmployee && (
                      <>
                        <span>•</span>
                        <span>
                          Owner:{" "}
                          {[app.assignedEmployee.firstName, app.assignedEmployee.lastName]
                            .filter(Boolean)
                            .join(" ") || app.assignedEmployee.email}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      app.status === "SUBMITTED"
                        ? "bg-emerald-100 text-emerald-800"
                        : app.status === "READY"
                        ? "bg-blue-100 text-blue-800"
                        : app.status === "AWAITING_APPROVAL" || app.status === "REVIEW"
                        ? "bg-amber-100 text-amber-800"
                        : app.status === "SUBMISSION_ISSUE" || app.status === "FAILED" || app.status === "REJECTED"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {app.status.replace(/_/g, " ")}
                  </span>
                  <Link
                    href={`/employee/applications/${app.id}`}
                    className="px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition"
                  >
                    Open Workspace
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Operational Tasks Section */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">Operational Tasks</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                {candidate.tasks.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Operational checklist and preparation tasks linked to this candidate.
            </p>
          </div>
          <Link
            href="/employee/tasks"
            className="text-xs text-slate-600 hover:text-slate-900 font-medium"
          >
            View all tasks →
          </Link>
        </div>

        {candidate.tasks.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-md">
            No active operational tasks assigned for this candidate.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {candidate.tasks.map((task) => (
              <div
                key={task.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 px-2 rounded transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{task.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                      {task.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span>Priority: {task.priority}</span>
                    <span>•</span>
                    <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
                    {task.assignedEmployee && (
                      <>
                        <span>•</span>
                        <span>
                          Assignee:{" "}
                          {[task.assignedEmployee.firstName, task.assignedEmployee.lastName]
                            .filter(Boolean)
                            .join(" ") || task.assignedEmployee.email}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      task.status === "COMPLETED"
                        ? "bg-emerald-100 text-emerald-800"
                        : task.status === "IN_PROGRESS"
                        ? "bg-blue-100 text-blue-800"
                        : task.status === "BLOCKED" || task.status === "ESCALATED"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {task.status}
                  </span>
                  <Link
                    href={`/employee/tasks/${task.id}`}
                    className="px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition"
                  >
                    Open Task
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Canonical Career Profile Breakdown */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-base font-semibold text-slate-900">Canonical Career Profile Facts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Authoritative candidate-provided profile information used for application preparation.
          </p>
        </div>

        {/* Contact & Professional Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="font-semibold text-slate-500">Email:</span> <span className="text-slate-900">{candidate.user.email}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-500">Phone:</span> <span className="text-slate-900">{candidate.phone ?? "Not provided"}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-500">Location:</span>{" "}
            <span className="text-slate-900">
              {locationStr || "Not provided"}
            </span>
          </div>
          <div>
            <span className="font-semibold text-slate-500">Work Authorization:</span>{" "}
            <span className="text-slate-900">{candidate.workAuthorization} {candidate.requiresSponsorship ? "(Sponsorship Required)" : ""}</span>
          </div>
          {candidate.linkedinUrl && (
            <div>
              <span className="font-semibold text-slate-500">LinkedIn:</span>{" "}
              <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {candidate.linkedinUrl}
              </a>
            </div>
          )}
          {candidate.githubUrl && (
            <div>
              <span className="font-semibold text-slate-500">GitHub:</span>{" "}
              <a href={candidate.githubUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {candidate.githubUrl}
              </a>
            </div>
          )}
          {candidate.professionalSummary && (
            <div className="sm:col-span-2">
              <span className="font-semibold text-slate-500">Professional Summary:</span>
              <p className="mt-1 text-slate-700 whitespace-pre-line bg-slate-50 p-3 rounded">{candidate.professionalSummary}</p>
            </div>
          )}
        </div>

        {/* Skills */}
        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-2">Technical Skills</h3>
          <div className="flex flex-wrap gap-2">
            {candidate.skills.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No skills listed.</span>
            ) : (
              candidate.skills.map((s) => (
                <span key={s.id} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                  {s.name}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Experience */}
        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-3">Work Experience</h3>
          {candidate.experiences.length === 0 ? (
            <span className="text-xs text-slate-400 italic">No work experience entries recorded.</span>
          ) : (
            <div className="space-y-3">
              {candidate.experiences.map((exp) => (
                <div key={exp.id} className="p-3.5 rounded border border-slate-100 bg-slate-50 text-xs">
                  <div className="font-semibold text-slate-900">{exp.jobTitle} • {exp.companyName}</div>
                  <div className="text-slate-500 mt-0.5">
                    {new Date(exp.startDate).toISOString().slice(0, 7)} — {exp.isCurrent ? "Present" : exp.endDate ? new Date(exp.endDate).toISOString().slice(0, 7) : ""}
                    {exp.location && ` | ${exp.location}`}
                  </div>
                  {exp.description && <p className="mt-2 text-slate-700 whitespace-pre-line">{exp.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Education */}
        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-3">Education History</h3>
          {candidate.educations.length === 0 ? (
            <span className="text-xs text-slate-400 italic">No education entries recorded.</span>
          ) : (
            <div className="space-y-3">
              {candidate.educations.map((edu) => (
                <div key={edu.id} className="p-3.5 rounded border border-slate-100 bg-slate-50 text-xs">
                  <div className="font-semibold text-slate-900">{edu.degree} {edu.fieldOfStudy && `in ${edu.fieldOfStudy}`}</div>
                  <div className="text-slate-500 mt-0.5">{edu.institution} {edu.graduationYear && `| Class of ${edu.graduationYear}`}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Projects */}
        {candidate.projects.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-3">Projects</h3>
            <div className="space-y-3">
              {candidate.projects.map((proj) => (
                <div key={proj.id} className="p-3.5 rounded border border-slate-100 bg-slate-50 text-xs">
                  <div className="font-semibold text-slate-900 flex items-center justify-between">
                    <span>{proj.title} {proj.role && `(${proj.role})`}</span>
                    {proj.url && (
                      <a href={proj.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        Visit Project →
                      </a>
                    )}
                  </div>
                  {proj.description && <p className="mt-1.5 text-slate-700 whitespace-pre-line">{proj.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certifications */}
        {candidate.certifications.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide mb-3">Certifications</h3>
            <div className="space-y-3">
              {candidate.certifications.map((cert) => (
                <div key={cert.id} className="p-3.5 rounded border border-slate-100 bg-slate-50 text-xs">
                  <div className="font-semibold text-slate-900">{cert.name} • {cert.issuingAuthority}</div>
                  <div className="text-slate-500 mt-0.5">
                    {cert.issueDate && `Issued ${new Date(cert.issueDate).toLocaleDateString()}`}
                    {cert.doesNotExpire ? " • No Expiration" : cert.expirationDate ? ` • Expires ${new Date(cert.expirationDate).toLocaleDateString()}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Internal Staff Notes (Confidential - Staff Only) */}
      <InternalNotesWidget candidateId={candidate.id} />
    </div>
  );
}
