"use client";

import { useMemo, useState } from "react";
import { ConversationListItem } from "./ConversationListItem";
import type { MessagingConversationListItem } from "./types";

type FilterKey = "ALL" | "UNREAD" | "APPLICATION";

export function ConversationList({
  conversations,
  activeId,
  basePath,
  title = "Messages",
  subtitle = "Team communication & candidate conversations",
  onNewMessage,
  showNewMessage = false,
}: {
  conversations: MessagingConversationListItem[];
  activeId?: string | null;
  basePath: string;
  title?: string;
  subtitle?: string;
  onNewMessage?: () => void;
  showNewMessage?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "UNREAD" && !c.unread) return false;
      if (filter === "APPLICATION" && !c.applicationId) return false;
      if (!q) return true;
      return (
        c.candidateName.toLowerCase().includes(q) ||
        (c.candidateEmail || "").toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        (c.jobTitle || "").toLowerCase().includes(q) ||
        (c.lastMessageBody || "").toLowerCase().includes(q)
      );
    });
  }, [conversations, filter, query]);

  const tabs: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: "ALL", label: "All", count: conversations.length },
    {
      key: "UNREAD",
      label: "Unread",
      count: conversations.filter((c) => c.unread).length,
    },
    {
      key: "APPLICATION",
      label: "Applications",
      count: conversations.filter((c) => c.applicationId).length,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-[#E5EAE7] bg-white">
      <div className="border-b border-[#EDF1EF] px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-[-0.02em] text-[#0F1720]">{title}</h1>
            <p className="mt-0.5 text-[11px] text-[#64748B]">{subtitle}</p>
          </div>
          {showNewMessage && onNewMessage && (
            <button
              type="button"
              onClick={onNewMessage}
              className="inline-flex shrink-0 items-center rounded-[10px] bg-[#12A150] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#0E8541] active:scale-[0.98]"
            >
              + New
            </button>
          )}
        </div>

        <div className="mt-3">
          <label className="sr-only" htmlFor="message-search">
            Search conversations
          </label>
          <input
            id="message-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-[10px] border border-[#DDE5E0] bg-[#F7F9F8] px-3 py-2 text-xs text-[#0F1720] placeholder:text-[#94A3B8] focus:border-[#12A150] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#12A150]"
          />
        </div>

        <div className="mt-3 flex gap-1" role="tablist" aria-label="Conversation filters">
          {tabs.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.key)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "bg-[#0B3B2C] text-white"
                    : "bg-[#F7F9F8] text-[#64748B] hover:bg-[#EDF1EF] hover:text-[#0F1720]"
                }`}
              >
                {tab.label}
                <span className={`tabular-nums ${active ? "text-[#C6F432]" : "text-[#94A3B8]"}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-xs font-semibold text-[#0F1720]">No conversations</p>
            <p className="mt-1 text-[11px] text-[#64748B]">
              {query || filter !== "ALL"
                ? "Try adjusting search or filters."
                : "New threads will appear here."}
            </p>
          </div>
        ) : (
          filtered.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              href={`${basePath}/${conversation.id}`}
              selected={conversation.id === activeId}
            />
          ))
        )}
      </div>
    </div>
  );
}
