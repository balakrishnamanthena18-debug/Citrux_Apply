"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import type { MessagingConversationListItem } from "./types";

type MessagingPendingContextValue = {
  pending: MessagingConversationListItem | null;
  pendingId: string | null;
  activeId: string | null;
  selectPending: (conversation: MessagingConversationListItem) => void;
  clearPending: () => void;
};

const MessagingPendingContext = createContext<MessagingPendingContextValue | null>(null);

export function MessagingPendingProvider({
  children,
}: {
  children: ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  const routeId = segment && segment !== "loading" ? segment : null;
  const [pending, setPending] = useState<MessagingConversationListItem | null>(null);

  // Route caught up to the optimistic selection — drop pending during render.
  if (pending && routeId === pending.id) {
    setPending(null);
  }

  const selectPending = useCallback((conversation: MessagingConversationListItem) => {
    setPending(conversation);
  }, []);

  const clearPending = useCallback(() => setPending(null), []);

  const effectivePending = pending && routeId !== pending.id ? pending : null;

  const value = useMemo<MessagingPendingContextValue>(
    () => ({
      pending: effectivePending,
      pendingId: effectivePending?.id ?? null,
      activeId: effectivePending?.id ?? routeId,
      selectPending,
      clearPending,
    }),
    [effectivePending, routeId, selectPending, clearPending]
  );

  return (
    <MessagingPendingContext.Provider value={value}>{children}</MessagingPendingContext.Provider>
  );
}

export function useMessagingPending() {
  const ctx = useContext(MessagingPendingContext);
  if (!ctx) {
    return {
      pending: null,
      pendingId: null,
      activeId: null as string | null,
      selectPending: (_conversation: MessagingConversationListItem) => {},
      clearPending: () => {},
    };
  }
  return ctx;
}
