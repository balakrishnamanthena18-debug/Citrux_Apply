import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import {
  ROUND_STATUS_PRESENTATION,
  ROUND_TYPE_LABELS,
  FORMAT_LABELS,
  OUTCOME_PRESENTATION,
  formatInterviewDateTime,
} from "@/lib/interview/presenter";

export default async function EmployeeInterviewsWorkbenchPage() {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const data = await withRlsContext(ctx.userId, async (tx) => {
    if (!tx.interview) return [];

    const interviews = await tx.interview.findMany({
      where: {
        organizationId: ctx.organizationId,
      },
      include: {
        application: {
          include: {
            job: true,
            candidate: {
              include: {
                user: true,
              },
            },
            assignedEmployee: true,
          },
        },
        rounds: {
          where: { voidedAt: null },
          orderBy: { roundNumber: "asc" },
          include: {
            debrief: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return interviews;
  });

  const totalInterviews = data.length;
  const totalRounds = data.reduce((sum, i) => sum + i.rounds.length, 0);
  const scheduledRounds = data.reduce(
    (sum, i) => sum + i.rounds.filter((r) => r.status === "ROUND_SCHEDULED").length,
    0
  );
  const debriefPendingRounds = data.reduce(
    (sum, i) =>
      sum + i.rounds.filter((r) => ["ROUND_COMPLETED", "DEBRIEF_PENDING"].includes(r.status)).length,
    0
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      <PageHero
        eyebrow="Operations & Governance"
        title="Interview Operating System Workbench"
        description="Manage end-to-end interview lifecycles, schedule rounds, track interviewer panels, record debriefs, and govern stage outcomes."
      />

      {/* Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Interviews</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalInterviews}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Rounds</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">{totalRounds}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Upcoming Scheduled</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{scheduledRounds}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Debrief Pending</span>
          <p className="text-2xl font-bold text-amber-600 mt-1">{debriefPendingRounds}</p>
        </div>
      </div>

      {/* Interviews Table / Cards */}
      {data.length === 0 ? (
        <div className="bg-white p-10 rounded-xl border border-slate-200 text-center space-y-3">
          <span className="text-3xl">💼</span>
          <h3 className="text-sm font-bold text-slate-900">No Interview Containers Initialized</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Interview rounds can be requested and staged directly from any active application detail workbench.
          </p>
          <Link
            href="/employee/applications"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-2xs"
          >
            View Applications Workbench →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Active Interview Pipelines ({data.length})
          </h3>

          <div className="space-y-4">
            {data.map((intv) => {
              const candName =
                [intv.application.candidate.user.firstName, intv.application.candidate.user.lastName]
                  .filter(Boolean)
                  .join(" ") || intv.application.candidate.user.email;
              const jobTitle = intv.application.job.title;
              const company = intv.application.job.companyName;

              return (
                <div
                  key={intv.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4 hover:border-slate-300 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{candName}</h4>
                        <span className="text-xs text-slate-400 font-normal">•</span>
                        <span className="text-xs font-semibold text-slate-700">{jobTitle} at {company}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Assigned Specialist:{" "}
                        <strong className="text-slate-700">
                          {intv.application.assignedEmployee
                            ? `${intv.application.assignedEmployee.firstName || ""} ${intv.application.assignedEmployee.lastName || ""}`.trim() || intv.application.assignedEmployee.email
                            : "Unassigned"}
                        </strong>
                      </p>
                    </div>

                    <Link
                      href={`/employee/applications/${intv.applicationId}`}
                      className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      Open Application Workbench →
                    </Link>
                  </div>

                  {/* Rounds in this Interview */}
                  {intv.rounds.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No rounds created yet for this interview container.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {intv.rounds.map((round) => {
                        const statusPres =
                          ROUND_STATUS_PRESENTATION[round.status as keyof typeof ROUND_STATUS_PRESENTATION] ||
                          ROUND_STATUS_PRESENTATION.ROUND_REQUESTED;
                        const formatPres = FORMAT_LABELS[round.format as keyof typeof FORMAT_LABELS] || FORMAT_LABELS.VIRTUAL;
                        const { dateStr, timeStr } = formatInterviewDateTime(
                          round.scheduledStartTime,
                          round.scheduledEndTime,
                          round.timezone
                        );

                        return (
                          <div
                            key={round.id}
                            className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">
                                R{round.roundNumber}: {round.roundTitle}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusPres.badgeClass}`}
                              >
                                <span className={`w-1 h-1 rounded-full ${statusPres.dotColor}`} />
                                {statusPres.label}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-600 space-y-0.5">
                              <p className="flex items-center gap-1">
                                <span>📅</span>
                                <span>{dateStr} {timeStr ? `(${timeStr})` : ""}</span>
                              </p>
                              <p className="flex items-center gap-1">
                                <span>{formatPres.icon}</span>
                                <span>{formatPres.label}</span>
                              </p>
                            </div>

                            {round.outcome && (
                              <div className="pt-1 border-t border-slate-200/60">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                                    OUTCOME_PRESENTATION[round.outcome as keyof typeof OUTCOME_PRESENTATION]?.badgeClass ||
                                    "bg-emerald-50 text-emerald-800"
                                  }`}
                                >
                                  {OUTCOME_PRESENTATION[round.outcome as keyof typeof OUTCOME_PRESENTATION]?.label || round.outcome}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
