"use client";

import { useEffect, useRef } from "react";
import { realtimeBus } from "@/lib/realtime/event-bus";

interface RealtimeRefresherProps {
  intervalMs?: number;
  enablePeriodicRefresh?: boolean;
}

export function RealtimeRefresher({
  intervalMs = 300000, // 5 minutes default fallback
  enablePeriodicRefresh = false,
}: RealtimeRefresherProps) {
  const lastHiddenTimeRef = useRef<number>(0);

  useEffect(() => {
    // 1. Re-sync on tab visibility recovery if user was away for a significant duration (> 60s)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastHiddenTimeRef.current;
        if (elapsed > 60000) {
          // Notify targeted listeners that tab visibility recovered
          realtimeBus.dispatch({
            id: `vis-sync-${Date.now()}`,
            entityType: "Notification",
            entityId: "global-sync",
            eventType: "NOTIFICATION_ALL_READ",
            version: Date.now(),
            occurredAt: new Date().toISOString(),
            organizationId: "global",
          });
        }
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);

    // 2. Optional periodic background fallback (disabled by default in favor of targeted realtime)
    let interval: NodeJS.Timeout | null = null;
    if (enablePeriodicRefresh) {
      interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          // Targeted pulse instead of full router.refresh()
          realtimeBus.dispatch({
            id: `pulse-${Date.now()}`,
            entityType: "Notification",
            entityId: "pulse-sync",
            eventType: "NOTIFICATION_ALL_READ",
            version: Date.now(),
            occurredAt: new Date().toISOString(),
            organizationId: "global",
          });
        }
      }, intervalMs);
    }

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      if (interval) clearInterval(interval);
    };
  }, [intervalMs, enablePeriodicRefresh]);

  return null;
}

