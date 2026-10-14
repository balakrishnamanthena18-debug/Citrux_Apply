"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import type { MessagingConversationListItem } from "./types";

type MessagingPendingContextValue = {
  pending: MessagingConversationListItem | null;
  pendingId: string | null;
  activeId: string | null;
  isTransitioning: boolean;
  transitionError: string | null;
  selectPending: (conversation: MessagingConversationListItem) => void;
  clearPending: () => void;
  startConversationTransition: (action: () => void) => void;
  retryLastSelection: () => void;
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
  const [lastAction, setLastAction] = useState<(() => void) | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Route caught up to the optimistic selection — drop pending & error during render.
  if (pending && routeId === pending.id) {
    setPending(null);
    if (transitionError) {
      setTransitionError(null);
    }
  }

  const selectPending = useCallback((conversation: MessagingConversationListItem) => {
    setPending(conversation);
    setTransitionError(null);
  }, []);

  const clearPending = useCallback(() => {
    setPending(null);
    setTransitionError(null);
  }, []);

  const startConversationTransition = useCallback(
    (action: () => void) => {
      setLastAction(() => action);
      setTransitionError(null);
      startTransition(() => {
        try {
          action();
        } catch {
          setTransitionError("Unable to load this conversation.");
        }
      });
    },
    [startTransition]
  );

  const retryLastSelection = useCallback(() => {
    if (lastAction) {
      setTransitionError(null);
      startTransition(() => {
        try {
          lastAction();
        } catch {
          setTransitionError("Unable to load this conversation.");
        }
      });
    }
  }, [lastAction, startTransition]);

  const effectivePending = pending && routeId !== pending.id ? pending : null;

  const value = useMemo<MessagingPendingContextValue>(
    () => ({
      pending: effectivePending,
      pendingId: effectivePending?.id ?? null,
      activeId: effectivePending?.id ?? routeId,
      isTransitioning: isPending || Boolean(effectivePending),
      transitionError,
      selectPending,
      clearPending,
      startConversationTransition,
      retryLastSelection,
    }),
    [
      effectivePending,
      routeId,
      isPending,
      transitionError,
      selectPending,
      clearPending,
      startConversationTransition,
      retryLastSelection,
    ]
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
      isTransitioning: false,
      transitionError: null,
      selectPending: (_conversation: MessagingConversationListItem) => {},
      clearPending: () => {},
      startConversationTransition: (action: () => void) => action(),
      retryLastSelection: () => {},
    };
  }
  return ctx;
}
