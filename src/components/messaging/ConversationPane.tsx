"use client";

import { useEffect, useRef, useState } from "react";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { MessageAvatar } from "./MessageAvatar";
import { MessageComposer } from "./MessageComposer";
import { MessageContextPanel } from "./MessageContextPanel";
import { MessageTimeline } from "./MessageTimeline";
import { useMessagingPending } from "./MessagingPendingContext";
import type { MessagingActiveThread, MessageRoleView } from "./types";

export function ConversationPane({
  thread,
  currentUserId,
  roleView,
  backHref,
  candidateProfileHref,
  applicationHrefPrefix,
  taskHrefPrefix,
  allowInternalNotes,
}: {
  thread: MessagingActiveThread;
  currentUserId: string;
  roleView: MessageRoleView;
  backHref: string;
  candidateProfileHref?: string;
  applicationHrefPrefix?: string;
  taskHrefPrefix?: string;
  allowInternalNotes: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const { clearPending } = useMessagingPending();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread.id, thread.messages.length]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#F7F9F8]">
        <header className="flex items-center justify-between gap-3 border-b border-[#E5EAE7] bg-white px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <TransitionLink
              href={backHref}
              prefetch={false}
              onNavigate={clearPending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#E5EAE7] text-[#64748B] transition hover:bg-[#F7F9F8] hover:text-[#0F1720] lg:hidden"
              aria-label="Back to conversations"
            >
              ←
            </TransitionLink>
            <MessageAvatar name={thread.candidateName} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[#0F1720]">
                {thread.candidateName}
              </div>
              <div className="truncate text-[11px] text-[#64748B]">{thread.subject}</div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {candidateProfileHref && (
              <TransitionLink
                href={candidateProfileHref}
                prefetch={false}
                className="hidden rounded-[10px] border border-[#E5EAE7] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0F1720] transition hover:border-[#12A150]/40 sm:inline-flex"
              >
                View profile
              </TransitionLink>
            )}
            {thread.applicationId && applicationHrefPrefix && (
              <TransitionLink
                href={`${applicationHrefPrefix}/${thread.applicationId}`}
                prefetch={false}
                className="hidden rounded-[10px] bg-[#12A150] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#0E8541] sm:inline-flex"
              >
                Application
              </TransitionLink>
            )}
            <button
              type="button"
              onClick={() => setContextOpen(true)}
              className="inline-flex rounded-[10px] border border-[#E5EAE7] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0F1720] transition hover:bg-[#F7F9F8] xl:hidden"
              aria-label="Open conversation context"
            >
              Context
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <MessageTimeline messages={thread.messages} currentUserId={currentUserId} />
        </div>

        <MessageComposer
          conversationId={thread.id}
          candidateId={thread.candidateId}
          applicationId={thread.applicationId}
          allowInternalNotes={allowInternalNotes}
          placeholder={
            roleView === "CANDIDATE"
              ? "Reply to your operations specialist…"
              : "Reply to the candidate…"
          }
        />
      </div>

      <div className="hidden w-[min(320px,26%)] shrink-0 xl:block">
        <MessageContextPanel
          thread={thread}
          roleView={roleView}
          candidateProfileHref={candidateProfileHref}
          applicationHrefPrefix={applicationHrefPrefix}
          taskHrefPrefix={taskHrefPrefix}
        />
      </div>

      {contextOpen && (
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-[#0B3B2C]/35"
            aria-label="Close context panel"
            onClick={() => setContextOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-hidden rounded-t-[20px] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#EDF1EF] px-4 py-3">
              <span className="text-sm font-semibold text-[#0F1720]">Conversation context</span>
              <button
                type="button"
                onClick={() => setContextOpen(false)}
                className="rounded-[8px] px-2 py-1 text-xs font-semibold text-[#64748B] hover:bg-[#F7F9F8]"
              >
                Close
              </button>
            </div>
            <div className="max-h-[calc(82vh-52px)] overflow-y-auto">
              <MessageContextPanel
                thread={thread}
                roleView={roleView}
                candidateProfileHref={candidateProfileHref}
                applicationHrefPrefix={applicationHrefPrefix}
                taskHrefPrefix={taskHrefPrefix}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
