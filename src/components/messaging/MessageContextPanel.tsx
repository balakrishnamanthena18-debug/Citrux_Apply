"use client";

import Link from "next/link";
import { InternalNotesWidget } from "@/components/InternalNotesWidget";
import { MessageAvatar } from "./MessageAvatar";
import type { MessagingActiveThread, MessageRoleView } from "./types";

const STATUS_PILL: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-800 border-emerald-200",
  ONBOARDING: "bg-sky-50 text-sky-800 border-sky-200",
  SUBMITTED: "bg-sky-50 text-sky-800 border-sky-200",
  READY: "bg-emerald-50 text-emerald-800 border-emerald-200",
  AWAITING_APPROVAL: "bg-amber-50 text-amber-900 border-amber-200",
  SUBMISSION_ISSUE: "bg-rose-50 text-rose-800 border-rose-200",
  ESCALATED: "bg-rose-50 text-rose-800 border-rose-200",
  BLOCKED: "bg-amber-50 text-amber-900 border-amber-200",
};

function pill(status: string) {
  return STATUS_PILL[status] || "bg-[#F7F9F8] text-[#64748B] border-[#E5EAE7]";
}

export function MessageContextPanel({
  thread,
  roleView,
  candidateProfileHref,
  applicationHrefPrefix,
  taskHrefPrefix,
}: {
  thread: MessagingActiveThread;
  roleView: MessageRoleView;
  candidateProfileHref?: string;
  applicationHrefPrefix?: string;
  taskHrefPrefix?: string;
}) {
  const isStaff = roleView === "STAFF";

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-[#E5EAE7] bg-[#FCFDFC]">
      <div className="border-b border-[#EDF1EF] px-4 py-4">
        <div className="flex items-start gap-3">
          <MessageAvatar name={thread.candidateName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-[#0F1720]">{thread.candidateName}</h2>
            {thread.candidateEmail && (
              <p className="mt-0.5 truncate font-mono text-[11px] text-[#64748B]">
                {thread.candidateEmail}
              </p>
            )}
            {thread.candidateStatus && (
              <span
                className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pill(
                  thread.candidateStatus
                )}`}
              >
                {thread.candidateStatus.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {candidateProfileHref && (
            <Link
              href={candidateProfileHref}
              prefetch={false}
              className="inline-flex items-center rounded-[10px] border border-[#E5EAE7] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0F1720] transition hover:border-[#12A150]/40 hover:text-[#0B3B2C]"
            >
              View profile
            </Link>
          )}
          {thread.applicationId && applicationHrefPrefix && (
            <Link
              href={`${applicationHrefPrefix}/${thread.applicationId}`}
              prefetch={false}
              className="inline-flex items-center rounded-[10px] bg-[#12A150] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#0E8541]"
            >
              Open application
            </Link>
          )}
        </div>
      </div>

      <section className="border-b border-[#EDF1EF] px-4 py-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
          Identity
        </h3>
        <dl className="mt-3 space-y-2.5 text-[12px]">
          <div className="flex justify-between gap-3">
            <dt className="text-[#64748B]">Full name</dt>
            <dd className="text-right font-medium text-[#0F1720]">{thread.candidateName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#64748B]">Email</dt>
            <dd className="truncate text-right font-mono text-[11px] text-[#0F1720]">
              {thread.candidateEmail || "—"}
            </dd>
          </div>
          {isStaff && (
            <>
              <div className="flex justify-between gap-3">
                <dt className="text-[#64748B]">Phone</dt>
                <dd className="text-right font-medium text-[#0F1720]">
                  {thread.candidatePhone || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#64748B]">Location</dt>
                <dd className="text-right font-medium text-[#0F1720]">
                  {[thread.candidateCity, thread.candidateCountry].filter(Boolean).join(", ") ||
                    "—"}
                </dd>
              </div>
            </>
          )}
          {thread.jobTitle && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#64748B]">Linked role</dt>
              <dd className="text-right font-medium text-[#0F1720]">
                {thread.jobTitle}
                {thread.companyName ? ` · ${thread.companyName}` : ""}
              </dd>
            </div>
          )}
          {thread.applicationStatus && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#64748B]">Application</dt>
              <dd>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pill(
                    thread.applicationStatus
                  )}`}
                >
                  {thread.applicationStatus.replace(/_/g, " ")}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </section>

      {thread.recentApplications.length > 0 && (
        <section className="border-b border-[#EDF1EF] px-4 py-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
            Recent applications
          </h3>
          <ul className="mt-3 space-y-2">
            {thread.recentApplications.map((app) => (
              <li key={app.id}>
                {applicationHrefPrefix ? (
                  <Link
                    href={`${applicationHrefPrefix}/${app.id}`}
                    prefetch={false}
                    className="block rounded-[12px] border border-[#E5EAE7] bg-white px-3 py-2.5 transition hover:border-[#12A150]/35"
                  >
                    <div className="truncate text-[12px] font-semibold text-[#0F1720]">
                      {app.jobTitle}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-[#64748B]">
                      {app.companyName}
                    </div>
                    <span
                      className={`mt-1.5 inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${pill(
                        app.status
                      )}`}
                    >
                      {app.status.replace(/_/g, " ")}
                    </span>
                  </Link>
                ) : (
                  <div className="rounded-[12px] border border-[#E5EAE7] bg-white px-3 py-2.5">
                    <div className="truncate text-[12px] font-semibold text-[#0F1720]">
                      {app.jobTitle}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#64748B]">{app.companyName}</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isStaff && thread.recentTasks.length > 0 && (
        <section className="border-b border-[#EDF1EF] px-4 py-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
            Related tasks
          </h3>
          <ul className="mt-3 space-y-2">
            {thread.recentTasks.map((task) => (
              <li key={task.id}>
                {taskHrefPrefix ? (
                  <Link
                    href={`${taskHrefPrefix}/${task.id}`}
                    prefetch={false}
                    className="block rounded-[12px] border border-[#E5EAE7] bg-white px-3 py-2.5 transition hover:border-[#12A150]/35"
                  >
                    <div className="truncate text-[12px] font-semibold text-[#0F1720]">
                      {task.title}
                    </div>
                    <div className="mt-1 flex gap-1.5">
                      <span
                        className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${pill(
                          task.status
                        )}`}
                      >
                        {task.status.replace(/_/g, " ")}
                      </span>
                      <span className="inline-flex rounded-full border border-[#E5EAE7] bg-[#F7F9F8] px-1.5 py-0.5 text-[9px] font-semibold text-[#64748B]">
                        {task.priority}
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div className="rounded-[12px] border border-[#E5EAE7] bg-white px-3 py-2.5">
                    <div className="truncate text-[12px] font-semibold text-[#0F1720]">
                      {task.title}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isStaff && (
        <section className="px-3 py-3">
          <InternalNotesWidget
            candidateId={thread.candidateId}
            applicationId={thread.applicationId || undefined}
          />
        </section>
      )}
    </aside>
  );
}
