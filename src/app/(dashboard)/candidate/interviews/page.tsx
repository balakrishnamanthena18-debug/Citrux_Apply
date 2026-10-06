import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CandidateInterviewSection, type CandidateInterviewViewModel } from "@/components/interview/CandidateInterviewSection";
import { PageHero } from "@/components/ui/PageHero";

export default async function CandidateInterviewsPage() {
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN" || ctx.role === "EMPLOYEE") {
    redirect("/employee/interviews");
  }

  const interviewsData = await withRlsContext(ctx.userId, async (tx) => {
    const candidate = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
    });
    if (!candidate || !tx.interview) return [];

    const list = await tx.interview.findMany({
      where: {
        candidateId: candidate.id,
        organizationId: ctx.organizationId,
      },
      include: {
        application: {
          include: {
            job: true,
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

    return list.map((item) => {
      const vm: CandidateInterviewViewModel = {
        id: item.id,
        applicationId: item.applicationId,
        status: item.status,
        rounds: item.rounds.map((r) => ({
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

      return {
        interview: vm,
        jobTitle: item.application.job.title,
        companyName: item.application.job.companyName,
        applicationId: item.applicationId,
      };
    });
  });

  const totalInterviews = interviewsData.length;
  const totalRounds = interviewsData.reduce((acc, curr) => acc + curr.interview.rounds.length, 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6">
      <PageHero
        eyebrow="Interview Operating System"
        title="Your Interview Schedule & Preparation"
        description="Manage upcoming employer rounds, review deterministic preparation briefs, and share session reflections with your career specialist."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Interviews</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalInterviews}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Rounds Scheduled</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">{totalRounds}</p>
        </div>
      </div>

      {interviewsData.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center space-y-3">
          <span className="text-3xl">📅</span>
          <h3 className="text-sm font-bold text-slate-900">No Interviews Scheduled Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Once employer interview requests are staged or confirmed for your active applications, your full round itinerary and preparation briefs will appear here.
          </p>
          <Link
            href="/candidate/applications"
            className="inline-block bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-slate-800 transition"
          >
            View Active Applications →
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {interviewsData.map((data) => (
            <div key={data.interview.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {data.jobTitle} <span className="text-slate-500 font-normal">at {data.companyName}</span>
                  </h3>
                  <Link
                    href={`/candidate/applications/${data.applicationId}`}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline"
                  >
                    View Application Details →
                  </Link>
                </div>
              </div>

              <CandidateInterviewSection
                applicationId={data.applicationId}
                jobTitle={data.jobTitle}
                companyName={data.companyName}
                interview={data.interview}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
