"use client";

import { useEffect, useRef } from "react";
import { realtimeSubscriptionManager } from "@/lib/realtime";
import type { SubscriptionScope, ConnectionStatus } from "@/lib/realtime";

interface RealtimeProviderProps {
  scope: SubscriptionScope;
  onStatusChange?: (status: ConnectionStatus) => void;
  children?: React.ReactNode;
}

/**
 * Mounts a single scoped Supabase realtime subscription for the dashboard shell.
 * Dispatches into RealtimeEventBus for UI subscribers (e.g. NotificationsBell).
 */
export function RealtimeProvider({ scope, onStatusChange, children }: RealtimeProviderProps) {
  const scopeKey = `${scope.role}:${scope.organizationId}:${scope.userId}:${scope.candidateId || ""}:${scope.teamId || ""}`;
  const onStatusRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const unsubscribeChannel = realtimeSubscriptionManager.subscribe(scope);
    const unsubscribeStatus = realtimeSubscriptionManager.onStatusChange((status) => {
      onStatusRef.current?.(status);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeChannel();
    };
    // scopeKey captures identity; subscribe uses latest scope from closure on key change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  return children ? <>{children}</> : null;
}
