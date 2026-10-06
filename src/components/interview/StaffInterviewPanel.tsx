"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  InterviewRoundType,
  InterviewRoundStatus,
  InterviewFormat,
  InterviewRoundOutcome,
  InterviewSentiment,
} from "@/generated/prisma";
import {
  ROUND_STATUS_PRESENTATION,
  ROUND_TYPE_LABELS,
  FORMAT_LABELS,
  OUTCOME_PRESENTATION,
  SENTIMENT_PRESENTATION,
  formatInterviewDateTime,
  buildDeterministicPreparationBrief,
} from "@/lib/interview/presenter";
import {
  createInterviewAction,
  createRoundAction,
  scheduleRoundAction,
  rescheduleRoundAction,
  cancelRoundAction,
  completeRoundAction,
  recordDebriefAction,
  concludeRoundAction,
  voidRoundAction,
} from "@/lib/interview/actions";
import type {
  InterviewerInfo,
  InterviewQuestionItem,
  PreparationBriefPayload,
} from "@/lib/interview/types";

export interface StaffRoundViewModel {
  id: string;
  roundNumber: number;
  roundType: InterviewRoundType;
  roundTitle: string;
  status: InterviewRoundStatus;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  timezone: string | null;
  format: InterviewFormat;
  meetingUrl: string | null;
  location: string | null;
  interviewers: InterviewerInfo[];
  internalStaffNotes: string | null;
  candidatePreparationNotes: string | null;
  preparationBrief: PreparationBriefPayload | null;
  occurredAt: string | null;
  outcome: InterviewRoundOutcome | null;
  outcomeNotes: string | null;
  rescheduledBy: string | null;
  rescheduleReason: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  voidedAt: string | null;
  debrief: {
    candidateSentiment: InterviewSentiment | null;
    questionsAsked: InterviewQuestionItem[];
    candidateFeedbackNotes: string | null;
    staffAssessmentNotes: string | null;
    followUpItems: string | null;
  } | null;
}

export interface StaffInterviewViewModel {
  id: string;
  applicationId: string;
  candidateId: string;
  jobId: string;
  status: string;
  rounds: StaffRoundViewModel[];
}

interface Props {
  applicationId: string;
  jobTitle: string;
  companyName: string;
  candidateSkills?: string[];
  candidateExperiences?: { company: string; title: string; highlights?: string[] }[];
  interview: StaffInterviewViewModel | null;
}

export function StaffInterviewPanel({
  applicationId,
  jobTitle,
  companyName,
  candidateSkills = [],
  candidateExperiences = [],
  interview,
}: Props) {
  const router = useRouter();

  // Modal & Form States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeModal, setActiveModal] = useState<{
    type: "SCHEDULE" | "RESCHEDULE" | "CANCEL" | "COMPLETE" | "DEBRIEF" | "CONCLUDE" | "VOID";
    round: StaffRoundViewModel;
  } | null>(null);

  // New Round Form
  const [newRoundType, setNewRoundType] = useState<InterviewRoundType>("RECRUITER_SCREEN");
  const [newRoundTitle, setNewRoundTitle] = useState("Recruiter Screening Call");
  const [newFormat, setNewFormat] = useState<InterviewFormat>("VIRTUAL");
  const [newMeetingUrl, setNewMeetingUrl] = useState("");
  const [newTimezone, setNewTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newStaffNotes, setNewStaffNotes] = useState("");
  const [newCandidatePrepNotes, setNewCandidatePrepNotes] = useState("");
  const [newInterviewers, setNewInterviewers] = useState<InterviewerInfo[]>([]);
  const [intvName, setIntvName] = useState("");
  const [intvRole, setIntvRole] = useState("");

  // Action Form States
  const [scheduleStartTime, setScheduleStartTime] = useState("");
  const [scheduleEndTime, setScheduleEndTime] = useState("");
  const [scheduleTz, setScheduleTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [scheduleFormat, setScheduleFormat] = useState<InterviewFormat>("VIRTUAL");
  const [scheduleUrl, setScheduleUrl] = useState("");
  const [rescheduleWho, setRescheduleWho] = useState<"CANDIDATE" | "EMPLOYER" | "MUTUAL">("EMPLOYER");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [cancelWho, setCancelWho] = useState<"CANDIDATE" | "EMPLOYER">("EMPLOYER");
  const [cancelReason, setCancelReason] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [sentiment, setSentiment] = useState<InterviewSentiment>("POSITIVE");
  const [candidateNotes, setCandidateNotes] = useState("");
  const [staffAssessment, setStaffAssessment] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [concludeOutcome, setConcludeOutcome] = useState<InterviewRoundOutcome>("ADVANCED_TO_NEXT_ROUND");
  const [concludeNotes, setConcludeNotes] = useState("");
  const [voidReason, setVoidReason] = useState("");

  // Questions for debrief
  const [debriefQuestions, setDebriefQuestions] = useState<InterviewQuestionItem[]>([]);
  const [qText, setQText] = useState("");
  const [qCategory, setQCategory] = useState<string>("TECHNICAL");

  // Busy & Error Handling
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rounds = interview?.rounds || [];
  const activeRounds = rounds.filter((r) => !r.voidedAt);

  function resetCreateForm() {
    setNewRoundType("RECRUITER_SCREEN");
    setNewRoundTitle("Recruiter Screening Call");
    setNewFormat("VIRTUAL");
    setNewMeetingUrl("");
    setNewStartTime("");
    setNewEndTime("");
    setNewStaffNotes("");
    setNewCandidatePrepNotes("");
    setNewInterviewers([]);
    setIntvName("");
    setIntvRole("");
    setErrorMessage(null);
  }

  function handleAddInterviewer() {
    if (!intvName.trim()) return;
    setNewInterviewers([...newInterviewers, { fullName: intvName.trim(), roleOrTitle: intvRole.trim() || undefined }]);
    setIntvName("");
    setIntvRole("");
  }

  function handleAddDebriefQuestion() {
    if (!qText.trim()) return;
    setDebriefQuestions([...debriefQuestions, { questionText: qText.trim(), category: qCategory as any }]);
    setQText("");
  }

  async function handleCreateInterviewOrRound(e: React.FormEvent) {
    e.preventDefault();
    setIsBusy(true);
    setErrorMessage(null);

    try {
      let targetInterviewId = interview?.id;
      if (!targetInterviewId) {
        const createRes = await createInterviewAction({ applicationId });
        targetInterviewId = createRes.interview.id;
      }

      const deterministicBrief = buildDeterministicPreparationBrief({
        targetRole: jobTitle,
        companyName,
        roundType: newRoundType,
        skills: candidateSkills,
        keyExperiences: candidateExperiences,
      });

      await createRoundAction(
        {
          interviewId: targetInterviewId,
          roundType: newRoundType,
          roundTitle: newRoundTitle.trim(),
          format: newFormat,
          scheduledStartTime: newStartTime ? new Date(newStartTime).toISOString() : null,
          scheduledEndTime: newEndTime ? new Date(newEndTime).toISOString() : null,
          timezone: newTimezone,
          meetingUrl: newMeetingUrl.trim() || null,
          interviewers: newInterviewers.length > 0 ? newInterviewers : undefined,
          preparationBrief: deterministicBrief,
          internalStaffNotes: newStaffNotes.trim() || null,
          candidatePreparationNotes: newCandidatePrepNotes.trim() || null,
        },
        applicationId
      );

      setShowCreateModal(false);
      resetCreateForm();
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create round");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleScheduleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeModal?.round) return;
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await scheduleRoundAction(
        {
          roundId: activeModal.round.id,
          scheduledStartTime: new Date(scheduleStartTime).toISOString(),
          scheduledEndTime: scheduleEndTime ? new Date(scheduleEndTime).toISOString() : null,
          timezone: scheduleTz,
          format: scheduleFormat,
          meetingUrl: scheduleUrl.trim() || null,
        },
        applicationId
      );
      setActiveModal(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to schedule round");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRescheduleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeModal?.round) return;
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await rescheduleRoundAction(
        {
          roundId: activeModal.round.id,
          newScheduledStartTime: new Date(scheduleStartTime).toISOString(),
          newScheduledEndTime: scheduleEndTime ? new Date(scheduleEndTime).toISOString() : null,
          newTimezone: scheduleTz,
          rescheduledBy: rescheduleWho,
          rescheduleReason: rescheduleReason.trim() || null,
          meetingUrl: scheduleUrl.trim() || null,
        },
        applicationId
      );
      setActiveModal(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to reschedule round");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCancelSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeModal?.round) return;
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await cancelRoundAction(
        {
          roundId: activeModal.round.id,
          cancelledBy: cancelWho,
          cancelReason: cancelReason.trim(),
        },
        applicationId
      );
      setActiveModal(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to cancel round");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCompleteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeModal?.round) return;
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await completeRoundAction(
        {
          roundId: activeModal.round.id,
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
        },
        applicationId
      );
      setActiveModal(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to mark round complete");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDebriefSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeModal?.round) return;
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await recordDebriefAction(
        {
          roundId: activeModal.round.id,
          candidateSentiment: sentiment,
          questionsAsked: debriefQuestions.length > 0 ? debriefQuestions : undefined,
          candidateFeedbackNotes: candidateNotes.trim() || null,
          staffAssessmentNotes: staffAssessment.trim() || null,
          followUpItems: followUp.trim() || null,
        },
        applicationId
      );
      setActiveModal(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to record debrief");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConcludeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeModal?.round) return;
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await concludeRoundAction(
        {
          roundId: activeModal.round.id,
          outcome: concludeOutcome,
          outcomeNotes: concludeNotes.trim() || null,
        },
        applicationId
      );
      setActiveModal(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to conclude round");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleVoidSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeModal?.round) return;
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await voidRoundAction(
        {
          roundId: activeModal.round.id,
          voidReason: voidReason.trim(),
        },
        applicationId
      );
      setActiveModal(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to void round");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Interview Operating System
          </h3>
        </div>
        <button
          type="button"
          onClick={() => {
            resetCreateForm();
            setShowCreateModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
        >
          <span>+</span>
          <span>Request / Create Round</span>
        </button>
      </div>

      {/* Zero Rounds State */}
      {activeRounds.length === 0 ? (
        <div className="text-center py-6 px-4 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2">
          <p className="font-semibold text-slate-800">No active interview rounds recorded</p>
          <p className="text-slate-500 max-w-sm mx-auto">
            Stage and govern employer interview rounds, candidate preparation briefs, and operational debriefs.
          </p>
          <button
            type="button"
            onClick={() => {
              resetCreateForm();
              setShowCreateModal(true);
            }}
            className="text-blue-600 hover:text-blue-800 font-semibold underline mt-1"
          >
            Create Round 1 (Recruiter Screen) →
          </button>
        </div>
      ) : (
        /* Rounds List */
        <div className="space-y-4">
          {activeRounds.map((round) => {
            const statusPres = ROUND_STATUS_PRESENTATION[round.status] || ROUND_STATUS_PRESENTATION.ROUND_REQUESTED;
            const formatPres = FORMAT_LABELS[round.format] || FORMAT_LABELS.VIRTUAL;
            const { dateStr, timeStr, timezoneStr } = formatInterviewDateTime(
              round.scheduledStartTime,
              round.scheduledEndTime,
              round.timezone
            );

            return (
              <div
                key={round.id}
                className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3"
              >
                {/* Round Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/70 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-white">
                      R{round.roundNumber}
                    </span>
                    <h4 className="text-xs font-bold text-slate-900">{round.roundTitle}</h4>
                    <span className="text-[11px] text-slate-500">
                      ({ROUND_TYPE_LABELS[round.roundType] || round.roundType})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusPres.badgeClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusPres.dotColor}`} />
                      {statusPres.label}
                    </span>
                  </div>
                </div>

                {/* Coordinates & Meta */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Timing</span>
                    <p className="font-semibold text-slate-900 mt-0.5">{dateStr}</p>
                    {timeStr && (
                      <p className="text-slate-600 text-[11px]">
                        {timeStr} <span className="text-slate-400">({timezoneStr})</span>
                      </p>
                    )}
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Format & Channel</span>
                    <p className="font-semibold text-slate-900 mt-0.5 flex items-center gap-1">
                      <span>{formatPres.icon}</span>
                      <span>{formatPres.label}</span>
                    </p>
                    {round.meetingUrl && (
                      <a
                        href={round.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline font-semibold text-[11px] truncate block"
                      >
                        {round.meetingUrl}
                      </a>
                    )}
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Interviewers</span>
                    {round.interviewers && round.interviewers.length > 0 ? (
                      <ul className="text-[11px] space-y-0.5 mt-0.5">
                        {round.interviewers.map((i, idx) => (
                          <li key={idx} className="text-slate-800 font-medium">
                            {i.fullName} {i.roleOrTitle && <span className="text-slate-500">({i.roleOrTitle})</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-400 text-[11px] mt-0.5">None listed</p>
                    )}
                  </div>
                </div>

                {/* Internal Staff Notes (Only visible to Staff) */}
                {round.internalStaffNotes && (
                  <div className="bg-purple-50/70 border border-purple-200/80 rounded-lg p-2.5 text-xs text-purple-950">
                    <span className="font-bold block text-purple-900 text-[10px] uppercase tracking-wide">
                      🔒 Staff-Only Internal Assessment / Notes
                    </span>
                    <p className="mt-0.5 text-[11px]">{round.internalStaffNotes}</p>
                  </div>
                )}

                {/* Debrief & Outcome Badges if present */}
                {round.outcome && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-950">Outcome Recorded:</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${OUTCOME_PRESENTATION[round.outcome]?.badgeClass || "bg-emerald-100 text-emerald-900"}`}>
                        {OUTCOME_PRESENTATION[round.outcome]?.label || round.outcome}
                      </span>
                    </div>
                    {round.outcomeNotes && (
                      <span className="text-slate-600 text-[11px] truncate max-w-xs">{round.outcomeNotes}</span>
                    )}
                  </div>
                )}

                {/* Operational Action Buttons Toolbar */}
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-2.5">
                  {/* Schedule Action */}
                  {["ROUND_REQUESTED"].includes(round.status) && (
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleStartTime(round.scheduledStartTime || "");
                        setScheduleEndTime(round.scheduledEndTime || "");
                        setScheduleTz(round.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
                        setScheduleFormat(round.format || "VIRTUAL");
                        setScheduleUrl(round.meetingUrl || "");
                        setActiveModal({ type: "SCHEDULE", round });
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Schedule Round
                    </button>
                  )}

                  {/* Reschedule Action */}
                  {["ROUND_SCHEDULED"].includes(round.status) && (
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleStartTime(round.scheduledStartTime || "");
                        setScheduleEndTime(round.scheduledEndTime || "");
                        setScheduleTz(round.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
                        setScheduleUrl(round.meetingUrl || "");
                        setRescheduleReason("");
                        setActiveModal({ type: "RESCHEDULE", round });
                      }}
                      className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Reschedule
                    </button>
                  )}

                  {/* Complete Action */}
                  {["ROUND_SCHEDULED"].includes(round.status) && (
                    <button
                      type="button"
                      onClick={() => {
                        setOccurredAt(new Date().toISOString().slice(0, 16));
                        setActiveModal({ type: "COMPLETE", round });
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Mark Completed
                    </button>
                  )}

                  {/* Cancel Action */}
                  {["ROUND_REQUESTED", "ROUND_SCHEDULED"].includes(round.status) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelReason("");
                        setActiveModal({ type: "CANCEL", round });
                      }}
                      className="border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  )}

                  {/* Debrief Action */}
                  {["ROUND_COMPLETED", "DEBRIEF_PENDING", "DEBRIEF_COMPLETED"].includes(round.status) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSentiment(round.debrief?.candidateSentiment || "POSITIVE");
                        setCandidateNotes(round.debrief?.candidateFeedbackNotes || "");
                        setStaffAssessment(round.debrief?.staffAssessmentNotes || "");
                        setFollowUp(round.debrief?.followUpItems || "");
                        setDebriefQuestions(round.debrief?.questionsAsked || []);
                        setActiveModal({ type: "DEBRIEF", round });
                      }}
                      className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      {round.debrief ? "Update Debrief" : "Record Debrief"}
                    </button>
                  )}

                  {/* Conclude Action */}
                  {["DEBRIEF_COMPLETED", "DEBRIEF_PENDING", "ROUND_COMPLETED"].includes(round.status) && (
                    <button
                      type="button"
                      onClick={() => {
                        setConcludeOutcome(round.outcome || "ADVANCED_TO_NEXT_ROUND");
                        setConcludeNotes(round.outcomeNotes || "");
                        setActiveModal({ type: "CONCLUDE", round });
                      }}
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Conclude Round Outcome
                    </button>
                  )}

                  {/* Void Action */}
                  <button
                    type="button"
                    onClick={() => {
                      setVoidReason("");
                      setActiveModal({ type: "VOID", round });
                    }}
                    className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-transparent text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors ml-auto"
                  >
                    Void Record
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE ROUND MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Request / Create Interview Round
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleCreateInterviewOrRound} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Round Type</label>
                  <select
                    value={newRoundType}
                    onChange={(e) => {
                      const type = e.target.value as InterviewRoundType;
                      setNewRoundType(type);
                      setNewRoundTitle(ROUND_TYPE_LABELS[type] || "Interview Round");
                    }}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white text-slate-800"
                  >
                    {Object.entries(ROUND_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Round Title</label>
                  <input
                    type="text"
                    required
                    value={newRoundTitle}
                    onChange={(e) => setNewRoundTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Format</label>
                  <select
                    value={newFormat}
                    onChange={(e) => setNewFormat(e.target.value as InterviewFormat)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white text-slate-800"
                  >
                    <option value="VIRTUAL">Virtual Video Call</option>
                    <option value="PHONE">Phone Call</option>
                    <option value="IN_PERSON">In-Person Onsite</option>
                    <option value="ASSESSMENT_TAKE_HOME">Take-Home Assessment</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Timezone</label>
                  <input
                    type="text"
                    required
                    value={newTimezone}
                    onChange={(e) => setNewTimezone(e.target.value)}
                    placeholder="e.g., America/New_York or UTC"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Meeting URL / Link (Optional)</label>
                <input
                  type="url"
                  value={newMeetingUrl}
                  onChange={(e) => setNewMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/... or https://zoom.us/..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              {/* Interviewers */}
              <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
                <label className="block font-semibold text-slate-700">Interviewers / Panel</label>
                {newInterviewers.length > 0 && (
                  <ul className="space-y-1">
                    {newInterviewers.map((i, idx) => (
                      <li key={idx} className="flex justify-between items-center bg-slate-50 p-1.5 rounded border text-xs">
                        <span>{i.fullName} ({i.roleOrTitle || "Interviewer"})</span>
                        <button
                          type="button"
                          onClick={() => setNewInterviewers(newInterviewers.filter((_, idx2) => idx2 !== idx))}
                          className="text-rose-600 font-bold"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={intvName}
                    onChange={(e) => setIntvName(e.target.value)}
                    placeholder="Full Name"
                    className="flex-1 rounded-lg border border-slate-300 p-2 text-xs"
                  />
                  <input
                    type="text"
                    value={intvRole}
                    onChange={(e) => setIntvRole(e.target.value)}
                    placeholder="Role / Title"
                    className="flex-1 rounded-lg border border-slate-300 p-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddInterviewer}
                    className="bg-slate-800 text-white font-semibold px-3 py-1.5 rounded-lg text-xs"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2 border-t border-slate-100 pt-2.5">
                <div>
                  <label className="block font-semibold text-purple-900">
                    🔒 Internal Staff Notes (Staff Only)
                  </label>
                  <textarea
                    rows={2}
                    value={newStaffNotes}
                    onChange={(e) => setNewStaffNotes(e.target.value)}
                    placeholder="Confidential briefing, salary requirements, interviewer background..."
                    className="w-full rounded-lg border border-purple-200 p-2 text-xs bg-purple-50/40"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700">
                    Candidate Preparation Notes (Visible to Candidate)
                  </label>
                  <textarea
                    rows={2}
                    value={newCandidatePrepNotes}
                    onChange={(e) => setNewCandidatePrepNotes(e.target.value)}
                    placeholder="Instructions for the candidate on what topics to review..."
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border rounded-lg text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {isBusy ? "Saving..." : "Create Round"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCHEDULE MODAL */}
      {activeModal?.type === "SCHEDULE" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Schedule Round {activeModal.round.roundNumber}: {activeModal.round.roundTitle}
            </h3>
            {errorMessage && <div className="p-2.5 bg-rose-50 text-rose-800 text-xs rounded-lg">{errorMessage}</div>}
            <form onSubmit={handleScheduleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Start Date & Time (UTC/Local ISO)</label>
                <input
                  type="datetime-local"
                  required
                  value={scheduleStartTime}
                  onChange={(e) => setScheduleStartTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">End Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduleEndTime}
                  onChange={(e) => setScheduleEndTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">IANA Timezone</label>
                <input
                  type="text"
                  required
                  value={scheduleTz}
                  onChange={(e) => setScheduleTz(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Meeting URL</label>
                <input
                  type="url"
                  value={scheduleUrl}
                  onChange={(e) => setScheduleUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={isBusy} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold">
                  Confirm Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {activeModal?.type === "RESCHEDULE" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Reschedule Round {activeModal.round.roundNumber}: {activeModal.round.roundTitle}
            </h3>
            {errorMessage && <div className="p-2.5 bg-rose-50 text-rose-800 text-xs rounded-lg">{errorMessage}</div>}
            <form onSubmit={handleRescheduleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Start Time</label>
                <input
                  type="datetime-local"
                  required
                  value={scheduleStartTime}
                  onChange={(e) => setScheduleStartTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Initiated By</label>
                <select
                  value={rescheduleWho}
                  onChange={(e) => setRescheduleWho(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                >
                  <option value="EMPLOYER">Employer / Company Requested</option>
                  <option value="CANDIDATE">Candidate Requested</option>
                  <option value="MUTUAL">Mutual Agreement</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reschedule Reason</label>
                <textarea
                  rows={2}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Reason for schedule adjustment..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={isBusy} className="px-4 py-2 bg-sky-600 text-white rounded-lg font-semibold">
                  Confirm Reschedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {activeModal?.type === "CANCEL" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Cancel Round {activeModal.round.roundNumber}: {activeModal.round.roundTitle}
            </h3>
            {errorMessage && <div className="p-2.5 bg-rose-50 text-rose-800 text-xs rounded-lg">{errorMessage}</div>}
            <form onSubmit={handleCancelSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cancellation Attribution</label>
                <select
                  value={cancelWho}
                  onChange={(e) => setCancelWho(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                >
                  <option value="EMPLOYER">Employer Cancelled / Position Frozen</option>
                  <option value="CANDIDATE">Candidate Cancelled / Withdrew</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cancellation Reason (Mandatory)</label>
                <textarea
                  rows={2}
                  required
                  minLength={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Provide explicit operational context for cancellation..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border rounded-lg">
                  Back
                </button>
                <button type="submit" disabled={isBusy} className="px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold">
                  Confirm Cancellation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETE MODAL */}
      {activeModal?.type === "COMPLETE" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Mark Round {activeModal.round.roundNumber} as Completed
            </h3>
            {errorMessage && <div className="p-2.5 bg-rose-50 text-rose-800 text-xs rounded-lg">{errorMessage}</div>}
            <form onSubmit={handleCompleteSubmit} className="space-y-3 text-xs">
              <p className="text-slate-600">
                Confirming completion transitions this round into <strong>DEBRIEF_PENDING</strong> so debrief evaluations and outcome decisions can be recorded.
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Occurred At Timestamp</label>
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={isBusy} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold">
                  Confirm Completion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STAFF DEBRIEF MODAL */}
      {activeModal?.type === "DEBRIEF" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-slate-900">
              Record Debrief: Round {activeModal.round.roundNumber} ({activeModal.round.roundTitle})
            </h3>
            {errorMessage && <div className="p-2.5 bg-rose-50 text-rose-800 text-xs rounded-lg">{errorMessage}</div>}
            <form onSubmit={handleDebriefSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Candidate Sentiment</label>
                <select
                  value={sentiment}
                  onChange={(e) => setSentiment(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                >
                  {Object.entries(SENTIMENT_PRESENTATION).map(([k, v]) => (
                    <option key={k} value={k}>{v.emoji} {v.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-purple-900">
                  🔒 Staff Assessment Notes (Staff Only)
                </label>
                <textarea
                  rows={2}
                  value={staffAssessment}
                  onChange={(e) => setStaffAssessment(e.target.value)}
                  placeholder="Evaluation of technical performance, compensation alignment, flags..."
                  className="w-full rounded-lg border border-purple-200 p-2 text-xs bg-purple-50/40"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">
                  Candidate Feedback Summary
                </label>
                <textarea
                  rows={2}
                  value={candidateNotes}
                  onChange={(e) => setCandidateNotes(e.target.value)}
                  placeholder="Candidate's perspective on the session..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              {/* Questions Asked */}
              <div className="space-y-1.5 border-t pt-2.5">
                <label className="block font-semibold text-slate-700">Questions Captured</label>
                {debriefQuestions.length > 0 && (
                  <ul className="space-y-1">
                    {debriefQuestions.map((q, idx) => (
                      <li key={idx} className="flex justify-between items-center bg-slate-50 p-1.5 rounded border text-xs">
                        <span>[{q.category}] {q.questionText}</span>
                        <button
                          type="button"
                          onClick={() => setDebriefQuestions(debriefQuestions.filter((_, i) => i !== idx))}
                          className="text-rose-600 font-bold"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="Enter question text..."
                    className="flex-1 rounded-lg border border-slate-300 p-2 text-xs"
                  />
                  <select
                    value={qCategory}
                    onChange={(e) => setQCategory(e.target.value)}
                    className="rounded-lg border border-slate-300 p-2 text-xs bg-white"
                  >
                    <option value="TECHNICAL">Technical</option>
                    <option value="BEHAVIORAL">Behavioral</option>
                    <option value="SYSTEM_DESIGN">System Design</option>
                    <option value="LOGISTICS">Logistics</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddDebriefQuestion}
                    className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={isBusy} className="px-4 py-2 bg-teal-600 text-white rounded-lg font-semibold">
                  Save Debrief
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONCLUDE MODAL */}
      {activeModal?.type === "CONCLUDE" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Conclude Round {activeModal.round.roundNumber}: {activeModal.round.roundTitle}
            </h3>
            {errorMessage && <div className="p-2.5 bg-rose-50 text-rose-800 text-xs rounded-lg">{errorMessage}</div>}
            <form onSubmit={handleConcludeSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Operational Round Outcome</label>
                <select
                  value={concludeOutcome}
                  onChange={(e) => setConcludeOutcome(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white font-semibold"
                >
                  <option value="ADVANCED_TO_NEXT_ROUND">Advanced to Next Round</option>
                  <option value="OFFER_RECEIVED">Offer Received</option>
                  <option value="AWAITING_EMPLOYER_DECISION">Decision Pending</option>
                  <option value="REJECTED_AFTER_ROUND">Not Moving Forward (Rejected)</option>
                  <option value="CANDIDATE_WITHDREW">Candidate Withdrew</option>
                  <option value="POSITION_CANCELLED">Position Frozen / Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Outcome Rationale / Notes</label>
                <textarea
                  rows={2}
                  value={concludeNotes}
                  onChange={(e) => setConcludeNotes(e.target.value)}
                  placeholder="Rationale or next operational actions..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={isBusy} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold">
                  Record Conclusion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID MODAL */}
      {activeModal?.type === "VOID" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-rose-900">
              Void Round {activeModal.round.roundNumber}: {activeModal.round.roundTitle}
            </h3>
            <p className="text-xs text-slate-600">
              This will permanently mark this round record as void (O2 Historical Integrity). It will be removed from active views while preserving audit history.
            </p>
            {errorMessage && <div className="p-2.5 bg-rose-50 text-rose-800 text-xs rounded-lg">{errorMessage}</div>}
            <form onSubmit={handleVoidSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Void Reason (Mandatory)</label>
                <textarea
                  rows={2}
                  required
                  minLength={3}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Explain why this round was created in error..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={isBusy} className="px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold">
                  Confirm Void
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
