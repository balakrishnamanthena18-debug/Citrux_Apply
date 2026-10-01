"use client";

import { TransitionLink } from "@/components/ui/TransitionLink";
import { MessageAvatar } from "./MessageAvatar";
import { useMessagingPending } from "./MessagingPendingContext";
import { formatMessageTime, type MessagingConversationListItem } from "./types";

export function ConversationListItem({
  conversation,
  href,
  selected,
}: {
  conversation: MessagingConversationListItem;
  href: string;
  selected: boolean;
}) {
  const { selectPending } = useMessagingPending();

  return (
    <TransitionLink
      href={href}
      prefetch={false}
      isActive={selected}
      onNavigate={() => selectPending(conversation)}
      className={`group relative flex gap-3 border-b border-[#EDF1EF] px-3.5 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#12A150] ${
        selected
          ? "bg-[#12A150]/[0.08]"
          : conversation.unread
          ? "bg-[#F7F9F8] hover:bg-[#EDF1EF]"
          : "bg-white hover:bg-[#F7F9F8]"
      }`}
    >
      {selected && (
        <span className="absolute inset-y-0 left-0 w-[3px] bg-[#12A150]" aria-hidden />
      )}
      <MessageAvatar name={conversation.candidateName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              className={`truncate text-[13px] ${
                conversation.unread || selected
                  ? "font-semibold text-[#0F1720]"
                  : "font-medium text-[#0F1720]"
              }`}
            >
              {conversation.candidateName}
            </div>
            {conversation.candidateEmail && (
              <div className="truncate font-mono text-[10px] text-[#94A3B8]">
                {conversation.candidateEmail}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] tabular-nums text-[#94A3B8]">
              {formatMessageTime(conversation.lastMessageAt || conversation.updatedAt)}
            </div>
            {conversation.unread && (
              <span className="mt-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#12A150] px-1 text-[9px] font-bold text-white">
                1
              </span>
            )}
          </div>
        </div>
        <div className="mt-1 truncate text-[11px] font-medium text-[#334155]">
          {conversation.subject}
        </div>
        {conversation.lastMessageBody && (
          <div className="mt-0.5 truncate text-[11px] text-[#64748B]">
            <span className="font-medium text-[#475569]">
              {conversation.lastMessageSenderRole === "CANDIDATE" ? "Candidate: " : "Staff: "}
            </span>
            {conversation.lastMessageBody}
          </div>
        )}
        {conversation.jobTitle && (
          <div className="mt-1.5">
            <span className="inline-flex max-w-full truncate rounded-md border border-[#E5EAE7] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#64748B]">
              {conversation.jobTitle}
              {conversation.companyName ? ` · ${conversation.companyName}` : ""}
            </span>
          </div>
        )}
      </div>
    </TransitionLink>
  );
}
