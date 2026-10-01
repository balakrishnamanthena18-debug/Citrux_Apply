"use client";

import { useMessagingPending } from "./MessagingPendingContext";
import { MessageAvatar } from "./MessageAvatar";

function Bubble({ align, wide }: { align: "start" | "end"; wide?: boolean }) {
  return (
    <div className={`flex ${align === "end" ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-[14px] ${
          align === "end" ? "rounded-br-md bg-[#12A150]/25" : "rounded-bl-md border border-[#E5EAE7] bg-white"
        } ${wide ? "h-14 w-[min(100%,18rem)]" : "h-10 w-[min(100%,12rem)]"}`}
      />
    </div>
  );
}

/**
 * Localized conversation-switch fallback.
 * Used by messages/loading.tsx so the list + workspace frame stay mounted.
 */
export function ConversationPaneSkeleton() {
  const { pending } = useMessagingPending();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1" aria-busy="true" aria-label="Loading conversation">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#F7F9F8]">
        <header className="flex items-center justify-between gap-3 border-b border-[#E5EAE7] bg-white px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#E5EAE7] text-[#94A3B8] lg:hidden">
              ←
            </span>
            {pending ? (
              <MessageAvatar name={pending.candidateName} size="sm" />
            ) : (
              <div className="h-8 w-8 animate-pulse rounded-full bg-[#EDF1EF]" />
            )}
            <div className="min-w-0">
              {pending ? (
                <>
                  <div className="truncate text-[13px] font-semibold text-[#0F1720]">
                    {pending.candidateName}
                  </div>
                  <div className="truncate text-[11px] text-[#64748B]">{pending.subject}</div>
                </>
              ) : (
                <>
                  <div className="h-3.5 w-36 animate-pulse rounded bg-[#EDF1EF]" />
                  <div className="mt-1.5 h-2.5 w-48 animate-pulse rounded bg-[#F1F5F3]" />
                </>
              )}
            </div>
          </div>
          <div className="hidden items-center gap-1.5 sm:flex">
            <div className="h-7 w-20 animate-pulse rounded-[10px] bg-[#EDF1EF]" />
            <div className="h-7 w-24 animate-pulse rounded-[10px] bg-[#EDF1EF]" />
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-[#EDF1EF]" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-[#EDF1EF]" />
            <div className="h-px flex-1 bg-[#EDF1EF]" />
          </div>
          <Bubble align="start" wide />
          <Bubble align="end" />
          <Bubble align="start" />
          <Bubble align="end" wide />
        </div>

        <div className="border-t border-[#EDF1EF] bg-white px-3 py-3">
          <div className="h-[4.5rem] animate-pulse rounded-[12px] border border-[#DDE5E0] bg-[#FCFDFC]" />
          <div className="mt-2 flex justify-end">
            <div className="h-7 w-16 animate-pulse rounded-[10px] bg-[#EDF1EF]" />
          </div>
        </div>
      </div>

      <aside className="hidden w-[min(320px,26%)] shrink-0 border-l border-[#E5EAE7] bg-[#FCFDFC] xl:block">
        <div className="border-b border-[#EDF1EF] px-4 py-4">
          <div className="flex items-start gap-3">
            {pending ? (
              <MessageAvatar name={pending.candidateName} size="lg" />
            ) : (
              <div className="h-12 w-12 animate-pulse rounded-full bg-[#EDF1EF]" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              {pending ? (
                <>
                  <div className="truncate text-sm font-semibold text-[#0F1720]">
                    {pending.candidateName}
                  </div>
                  <div className="truncate font-mono text-[11px] text-[#64748B]">
                    {pending.candidateEmail || "—"}
                  </div>
                </>
              ) : (
                <>
                  <div className="h-3.5 w-32 animate-pulse rounded bg-[#EDF1EF]" />
                  <div className="h-2.5 w-40 animate-pulse rounded bg-[#F1F5F3]" />
                </>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="h-7 w-24 animate-pulse rounded-[10px] bg-[#EDF1EF]" />
            <div className="h-7 w-28 animate-pulse rounded-[10px] bg-[#EDF1EF]" />
          </div>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div className="h-2.5 w-20 animate-pulse rounded bg-[#EDF1EF]" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-3">
              <div className="h-3 w-16 animate-pulse rounded bg-[#F1F5F3]" />
              <div className="h-3 w-28 animate-pulse rounded bg-[#EDF1EF]" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
