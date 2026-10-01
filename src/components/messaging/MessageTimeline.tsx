"use client";

import { useMemo } from "react";
import { formatDateSeparator, formatMessageClock, type MessagingMessageItem } from "./types";

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function MessageTimeline({
  messages,
  currentUserId,
}: {
  messages: MessagingMessageItem[];
  currentUserId: string;
}) {
  const rows = useMemo(() => {
    const out: Array<
      | { kind: "date"; key: string; label: string }
      | { kind: "message"; key: string; message: MessagingMessageItem; mine: boolean }
    > = [];

    let lastDate: Date | null = null;
    for (const message of messages) {
      const created = new Date(message.createdAt);
      if (!lastDate || !sameDay(lastDate, created)) {
        out.push({
          kind: "date",
          key: `d-${created.toISOString()}`,
          label: formatDateSeparator(created),
        });
        lastDate = created;
      }
      out.push({
        kind: "message",
        key: message.id,
        message,
        mine: message.senderId === currentUserId,
      });
    }
    return out;
  }, [messages, currentUserId]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-16 text-center">
        <div>
          <p className="text-sm font-semibold text-[#0F1720]">No messages yet</p>
          <p className="mt-1 text-xs text-[#64748B]">Start the thread with a clear operational update.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 py-4 sm:px-5">
      {rows.map((row) => {
        if (row.kind === "date") {
          return (
            <div key={row.key} className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-[#EDF1EF]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">
                {row.label}
              </span>
              <div className="h-px flex-1 bg-[#EDF1EF]" />
            </div>
          );
        }

        const { message, mine } = row;
        return (
          <div key={row.key} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[min(100%,28rem)] ${mine ? "items-end" : "items-start"} flex flex-col`}>
              <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] text-[#94A3B8]">
                <span className="font-semibold text-[#475569]">
                  {mine ? "You" : message.senderName}
                </span>
                <span aria-hidden>·</span>
                <time dateTime={message.createdAt}>{formatMessageClock(message.createdAt)}</time>
                {mine && message.readAt && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Read</span>
                  </>
                )}
                {!mine && message.senderRole === "CANDIDATE" && (
                  <span className="rounded border border-[#E5EAE7] bg-white px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#64748B]">
                    Candidate
                  </span>
                )}
              </div>
              <div
                className={`rounded-[14px] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                  mine
                    ? "rounded-br-md bg-[#12A150] text-white"
                    : "rounded-bl-md border border-[#E5EAE7] bg-white text-[#0F1720]"
                }`}
              >
                {message.body}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
