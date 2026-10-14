"use client";

import React from "react";
import Link from "next/link";
import {
  formatApplicationCardDate,
  formatApplicationCardTime,
} from "@/lib/utils/format-application-date";

export interface CandidateUpcomingEventItem {
  id: string;
  interviewId: string;
  applicationId: string;
  companyName: string;
  jobTitle: string;
  roundTitle: string;
  roundType: string;
  status: string;
  scheduledStartTime?: string | Date | null;
  scheduledEndTime?: string | Date | null;
  meetingUrl?: string | null;
  location?: string | null;
  format?: string | null;
  candidatePreparationNotes?: string | null;
}

interface Props {
  events: CandidateUpcomingEventItem[];
}

export function CandidateUpcomingEvents({ events }: Props) {
  const hasEvents = events.length > 0;

  return (
    <section
      aria-label="Upcoming Events & Interview Schedule"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Upcoming Events & Interviews
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              hasEvents
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            {events.length} Scheduled
          </span>
        </div>
        <Link
          href="/candidate/interviews"
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition inline-flex items-center gap-1"
        >
          <span>Interview OS</span>
          <span>→</span>
        </Link>
      </div>

      <div className="p-5">
        {!hasEvents ? (
          <div className="text-center py-6 px-4 space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 border border-slate-200 mx-auto flex items-center justify-center text-lg">
              📅
            </div>
            <h3 className="text-xs sm:text-sm font-semibold text-slate-900">
              No upcoming interviews or deadlines scheduled
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Your operations team is actively managing your submitted applications. When employer interview requests or confirmed rounds are scheduled, deterministic preparation briefs will appear here.
            </p>
            <div className="pt-2">
              <Link
                href="/candidate/applications"
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
              >
                Track Active Applications →
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((evt) => {
              const dateStr = evt.scheduledStartTime
                ? formatApplicationCardDate(evt.scheduledStartTime)
                : "Schedule TBD";
              const timeStr = evt.scheduledStartTime
                ? formatApplicationCardTime(evt.scheduledStartTime)
                : "";

              return (
                <div
                  key={evt.id}
                  className="rounded-xl border border-slate-200/90 p-4 hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {evt.roundType.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {evt.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">
                      {evt.roundTitle} · {evt.companyName}
                    </h4>

                    <p className="text-xs text-slate-500">
                      Role: {evt.jobTitle}
                    </p>

                    <div className="flex items-center gap-3 text-xs text-slate-600 pt-1 flex-wrap">
                      <span className="font-semibold text-slate-800">
                        🗓️ {dateStr} {timeStr ? `at ${timeStr}` : ""}
                      </span>
                      {evt.format && (
                        <span>
                          • Format: {evt.format.replace(/_/g, " ")}
                        </span>
                      )}
                      {evt.meetingUrl && (
                        <a
                          href={evt.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium"
                        >
                          🔗 Join Video Link
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Link
                      href={`/candidate/interviews`}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition inline-flex items-center gap-1.5"
                    >
                      <span>Preparation Brief</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
