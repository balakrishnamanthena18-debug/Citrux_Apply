"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ConversationList } from "./ConversationList";
import { MessagingPendingProvider, useMessagingPending } from "./MessagingPendingContext";
import { NewMessageDialog, type NewMessageCandidateOption } from "./NewMessageDialog";
import type { MessagingConversationListItem, MessageRoleView } from "./types";

function MessageWorkspaceFrame({
  conversations,
  roleView,
  basePath,
  candidateOptions,
  showNewMessage,
  children,
}: {
  conversations: MessagingConversationListItem[];
  roleView: MessageRoleView;
  basePath: string;
  candidateOptions: NewMessageCandidateOption[];
  showNewMessage: boolean;
  children: ReactNode;
}) {
  const [newOpen, setNewOpen] = useState(false);
  const { activeId } = useMessagingPending();
  const showListOnMobile = !activeId;

  return (
    <div className="-mx-4 -mb-4 flex h-[calc(100dvh-8.5rem)] min-h-[560px] flex-col overflow-hidden border-y border-[#E5EAE7] bg-white sm:-mx-6 sm:h-[calc(100dvh-9rem)] lg:-mx-8 lg:h-[calc(100dvh-9.5rem)]">
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(260px,28%)_minmax(0,1fr)]">
        <div className={`min-h-0 ${showListOnMobile ? "block" : "hidden lg:block"}`}>
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            basePath={basePath}
            title="Messages"
            subtitle={
              roleView === "CANDIDATE"
                ? "Conversations with your operations team"
                : "Team communication & candidate conversations"
            }
            showNewMessage={showNewMessage}
            onNewMessage={() => setNewOpen(true)}
          />
        </div>

        <div className={`min-h-0 ${showListOnMobile ? "hidden lg:flex" : "flex"}`}>
          {children}
        </div>
      </div>

      {showNewMessage && (
        <NewMessageDialog
          open={newOpen}
          onClose={() => setNewOpen(false)}
          candidates={candidateOptions}
          basePath={basePath}
        />
      )}
    </div>
  );
}

/**
 * Persistent Messages workspace shell.
 * Conversation list lives here (via layout); `children` is the empty state,
 * conversation pane, or localized switch skeleton.
 */
export function MessageWorkspace({
  conversations,
  roleView,
  basePath,
  candidateOptions = [],
  showNewMessage = false,
  children,
}: {
  conversations: MessagingConversationListItem[];
  roleView: MessageRoleView;
  basePath: string;
  candidateOptions?: NewMessageCandidateOption[];
  showNewMessage?: boolean;
  children: ReactNode;
}) {
  return (
    <MessagingPendingProvider>
      <MessageWorkspaceFrame
        conversations={conversations}
        roleView={roleView}
        basePath={basePath}
        candidateOptions={candidateOptions}
        showNewMessage={showNewMessage}
      >
        {children}
      </MessageWorkspaceFrame>
    </MessagingPendingProvider>
  );
}
