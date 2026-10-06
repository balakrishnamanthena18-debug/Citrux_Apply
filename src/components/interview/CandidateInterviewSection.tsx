"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  InterviewRoundType,
  InterviewSentiment,
} from "@/generated/prisma";
import {
  ROUND_STATUS_PRESENTATION,
  ROUND_TYPE_LABELS,
  FORMAT_LABELS,
  OUTCOME_PRESENTATION,
  SENTIMENT_PRESENTATION,
  formatInterviewDateTime,
} from "@/lib/interview/presenter";
import { recordDebriefAction } from "@/lib/interview/actions";
import type { InterviewerInfo, InterviewQuestionItem, PreparationBriefPayload } from "@/lib/interview/types";

export interface CandidateRoundViewModel {
  id: string;
  roundNumber: number;
  roundType: InterviewRoundType;
  roundTitle: string;
  status: keyof typeof ROUND_STATUS_PRESENTATION;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  timezone: string | null;
  format: keyof typeof FORMAT_LABELS;
  meetingUrl: string | null;
  location: string | null;
  interviewers: InterviewerInfo[];
  candidatePreparationNotes: string | null;
  preparationBrief: PreparationBriefPayload | null;
  occurredAt: string | null;
  outcome: keyof typeof OUTCOME_PRESENTATION | null;
  outcomeNotes: string | null;
  debrief: {
    candidateSentiment: InterviewSentiment | null;
    questionsAsked: InterviewQuestionItem[];
    candidateFeedbackNotes: string | null;
  } | null;
}

export interface CandidateInterviewViewModel {
  id: string;
  applicationId: string;
  status: string;
  rounds: CandidateRoundViewModel[];
}

interface Props {
  applicationId: string;
  jobTitle: string;
  companyName: string;
  interview: CandidateInterviewViewModel | null;
}

export function CandidateInterviewSection({
  applicationId,
  jobTitle,
  companyName,
  interview,
}: Props) {
  const router = useRouter();
  const [selectedRoundForDebrief, setSelectedRoundForDebrief] = useState<CandidateRoundViewModel | null>(null);
  const [sentiment, setSentiment] = useState<InterviewSentiment>("POSITIVE");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [questions, setQuestions] = useState<{ text: string; category: string; difficulty: string }[]>([]);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionCategory, setNewQuestionCategory] = useState<string>("TECHNICAL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rounds = interview?.rounds || [];
  const activeRounds = rounds.filter((r) => r.status !== "ROUND_CANCELLED");

  function handleAddQuestion() {
    if (!newQuestionText.trim()) return;
    setQuestions([
      ...questions,
      {
        text: newQuestionText.trim(),
        category: newQuestionCategory,
        difficulty: "MEDIUM",
      },
    ]);
    setNewQuestionText("");
  }

  function handleRemoveQuestion(index: number) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  async function handleDebriefSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoundForDebrief) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formattedQuestions: InterviewQuestionItem[] = questions.map((q) => ({
        questionText: q.text,
        category: q.category as any,
        perceivedDifficulty: q.difficulty as any,
      }));

      await recordDebriefAction(
        {
          roundId: selectedRoundForDebrief.id,
          candidateSentiment: sentiment,
          candidateFeedbackNotes: feedbackNotes.trim() || null,
          questionsAsked: formattedQuestions.length > 0 ? formattedQuestions : undefined,
        },
        applicationId
      );

      setSelectedRoundForDebrief(null);
      setFeedbackNotes("");
      setQuestions([]);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to record feedback");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (rounds.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800">
              Interview Schedule & Preparation
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-medium">Stage 4 · Interview</span>
        </div>
        <div className="text-center py-6 px-4 bg-slate-50/50 rounded-lg border border-slate-100">
          <p className="text-sm font-medium text-slate-700">No interview rounds scheduled yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            When the employer requests or confirms an interview session for {jobTitle} at {companyName}, your schedule, preparation brief, and meeting coordinates will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
            Interview Schedule & Preparation
          </h3>
        </div>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
          {activeRounds.length} {activeRounds.length === 1 ? "Round" : "Rounds"} Scheduled
        </span>
      </div>

      {/* Round Timeline Cards */}
      <div className="space-y-4">
        {rounds.map((round) => {
          const statusPres = ROUND_STATUS_PRESENTATION[round.status] || ROUND_STATUS_PRESENTATION.ROUND_REQUESTED;
          const formatPres = FORMAT_LABELS[round.format] || FORMAT_LABELS.VIRTUAL;
          const { dateStr, timeStr, timezoneStr } = formatInterviewDateTime(
            round.scheduledStartTime,
            round.scheduledEndTime,
            round.timezone
          );
          const brief = round.preparationBrief;
          const canProvideDebrief = ["ROUND_COMPLETED", "DEBRIEF_PENDING", "ROUND_SCHEDULED", "ROUND_RESCHEDULED", "DEBRIEF_COMPLETED"].includes(round.status);

          return (
            <div
              key={round.id}
              className="border border-slate-200 rounded-xl p-5 bg-slate-50/40 hover:bg-slate-50/80 transition-colors space-y-4"
            >
              {/* Header: Title, Type, Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-white">
                      Round {round.roundNumber}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">{round.roundTitle}</h4>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {ROUND_TYPE_LABELS[round.roundType] || round.roundType}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusPres.badgeClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusPres.dotColor}`} />
                    {statusPres.label}
                  </span>
                </div>
              </div>

              {/* Timing & Coordinates Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-white p-3 rounded-lg border border-slate-200/70">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    Date & Time
                  </span>
                  <p className="font-semibold text-slate-900 mt-1">{dateStr}</p>
                  {timeStr && (
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      {timeStr} <span className="font-medium text-slate-500">({timezoneStr})</span>
                    </p>
                  )}
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200/70">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    Format & Link
                  </span>
                  <p className="font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                    <span>{formatPres.icon}</span>
                    <span>{formatPres.label}</span>
                  </p>
                  {round.meetingUrl ? (
                    <a
                      href={round.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-semibold underline text-[11px] mt-1 inline-block"
                    >
                      Join Meeting ↗
                    </a>
                  ) : round.location ? (
                    <p className="text-slate-600 text-[11px] mt-0.5">{round.location}</p>
                  ) : (
                    <p className="text-slate-400 text-[11px] mt-0.5">Link details will be provided</p>
                  )}
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200/70">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    Interviewers
                  </span>
                  {round.interviewers && round.interviewers.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {round.interviewers.map((intv, idx) => (
                        <li key={idx} className="text-slate-800 font-medium text-[11px]">
                          {intv.fullName}
                          {intv.roleOrTitle && (
                            <span className="text-slate-500 font-normal"> — {intv.roleOrTitle}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-400 text-[11px] mt-1">Interviewer panel to be announced</p>
                  )}
                </div>
              </div>

              {/* Deterministic Preparation Brief */}
              {brief && (brief.keyCompetenciesToEmphasize || brief.formatGuidelines || brief.highlightedProjects) && (
                <div className="bg-blue-50/60 border border-blue-200/80 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                      <span>🎯</span>
                      <span>Deterministic Preparation Brief</span>
                    </span>
                    <span className="text-[10px] text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded font-medium">
                      Based on Verified Candidate Profile & Job Alignment
                    </span>
                  </div>

                  {brief.formatGuidelines && brief.formatGuidelines.length > 0 && (
                    <div>
                      <h5 className="text-[11px] font-bold text-blue-950 uppercase tracking-wide">Format Guidelines</h5>
                      <ul className="list-disc list-inside text-xs text-blue-900 mt-1 space-y-0.5">
                        {brief.formatGuidelines.map((g, idx) => (
                          <li key={idx}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {brief.keyCompetenciesToEmphasize && brief.keyCompetenciesToEmphasize.length > 0 && (
                    <div>
                      <h5 className="text-[11px] font-bold text-blue-950 uppercase tracking-wide">Key Competencies to Highlight</h5>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {brief.keyCompetenciesToEmphasize.map((comp, idx) => (
                          <span
                            key={idx}
                            className="bg-white text-blue-900 border border-blue-200 text-xs px-2.5 py-0.5 rounded-md font-medium"
                          >
                            {comp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {brief.highlightedProjects && brief.highlightedProjects.length > 0 && (
                    <div>
                      <h5 className="text-[11px] font-bold text-blue-950 uppercase tracking-wide">Recommended Projects to Reference</h5>
                      <ul className="list-disc list-inside text-xs text-blue-900 mt-1 space-y-0.5">
                        {brief.highlightedProjects.map((p, idx) => (
                          <li key={idx}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Candidate Preparation Notes if provided */}
              {round.candidatePreparationNotes && (
                <div className="bg-amber-50 border border-amber-200/80 rounded-lg p-3 text-xs text-amber-950">
                  <span className="font-bold block text-amber-900 text-[11px] uppercase tracking-wide mb-1">
                    Specialist Notes for You
                  </span>
                  <p>{round.candidatePreparationNotes}</p>
                </div>
              )}

              {/* Candidate Feedback Recorded State */}
              {round.debrief?.candidateSentiment && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">✓</span>
                    <span className="font-semibold text-emerald-900">Your Feedback Recorded:</span>
                    <span className="font-medium text-emerald-800">
                      {SENTIMENT_PRESENTATION[round.debrief.candidateSentiment]?.emoji}{" "}
                      {SENTIMENT_PRESENTATION[round.debrief.candidateSentiment]?.label}
                    </span>
                  </div>
                  {round.debrief.candidateFeedbackNotes && (
                    <span className="text-slate-500 text-[11px] italic truncate max-w-xs">
                      &ldquo;{round.debrief.candidateFeedbackNotes}&rdquo;
                    </span>
                  )}
                </div>
              )}

              {/* Candidate Debrief CTA */}
              {canProvideDebrief && !round.debrief?.candidateSentiment && (
                <div className="flex items-center justify-between border-t border-slate-200/60 pt-3">
                  <p className="text-xs text-slate-500">
                    Did this interview take place? Let your specialist know how it went.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRoundForDebrief(round);
                      setSentiment(round.debrief?.candidateSentiment || "POSITIVE");
                      setFeedbackNotes(round.debrief?.candidateFeedbackNotes || "");
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
                  >
                    Share Interview Feedback
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Candidate Feedback Modal Dialog */}
      {selectedRoundForDebrief && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Share Your Interview Feedback
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Round {selectedRoundForDebrief.roundNumber}: {selectedRoundForDebrief.roundTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoundForDebrief(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleDebriefSubmit} className="space-y-4 text-xs">
              {/* Sentiment Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  How was your overall experience in this session?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(["VERY_POSITIVE", "POSITIVE", "NEUTRAL", "CONCERNED", "DIFFICULT"] as InterviewSentiment[]).map((sent) => {
                    const pres = SENTIMENT_PRESENTATION[sent];
                    const selected = sentiment === sent;
                    return (
                      <button
                        key={sent}
                        type="button"
                        onClick={() => setSentiment(sent)}
                        className={`p-2 rounded-lg border text-left flex items-center gap-1.5 transition-all ${
                          selected
                            ? "border-blue-600 bg-blue-50/80 font-bold text-blue-900 shadow-2xs"
                            : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span className="text-base">{pres.emoji}</span>
                        <span className="text-xs">{pres.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Questions Encountered */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="block font-semibold text-slate-700">
                  Questions Asked (Optional)
                </label>
                <p className="text-[11px] text-slate-500">
                  Record key technical or behavioral questions to help refine your preparation brief for future rounds.
                </p>

                {questions.length > 0 && (
                  <ul className="space-y-1.5">
                    {questions.map((q, idx) => (
                      <li key={idx} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs">
                        <span className="text-slate-800 font-medium truncate max-w-[280px]">
                          [{q.category}] {q.text}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(idx)}
                          className="text-rose-600 hover:text-rose-800 text-[11px] font-bold"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    placeholder="e.g., Explain event loop vs worker threads..."
                    className="flex-1 rounded-lg border border-slate-300 p-2 text-xs"
                  />
                  <select
                    value={newQuestionCategory}
                    onChange={(e) => setNewQuestionCategory(e.target.value)}
                    className="rounded-lg border border-slate-300 p-2 text-xs bg-white text-slate-800"
                  >
                    <option value="TECHNICAL">Technical</option>
                    <option value="BEHAVIORAL">Behavioral</option>
                    <option value="SYSTEM_DESIGN">System Design</option>
                    <option value="LOGISTICS">Logistics</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="bg-slate-800 hover:bg-slate-900 text-white font-semibold px-3 py-2 rounded-lg text-xs"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Feedback notes */}
              <div className="space-y-1 border-t border-slate-100 pt-3">
                <label className="block font-semibold text-slate-700">
                  Your Notes & Reflections
                </label>
                <textarea
                  rows={3}
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  placeholder="Share details on discussion topics, interviewer impressions, or any follow-up topics mentioned..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedRoundForDebrief(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Save Feedback"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
