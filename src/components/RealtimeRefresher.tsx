"use client";

import { useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";

export function RealtimeRefresher({ intervalMs = 60000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isPendingRef = useRef(isPending);
  const lastHiddenTimeRef = useRef<number>(0);

  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  useEffect(() => {
    const triggerRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible" && !isPendingRef.current) {
        startTransition(() => {
          router.refresh();
        });
      }
    };

    // 1. Refresh when window gains focus ONLY if it has been away for > 30s
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastHiddenTimeRef.current;
        if (elapsed > 30000) {
          triggerRefresh();
        }
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);

    // 2. Periodic background refresh while tab is actively focused (default: 60s)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    }, intervalMs);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [router, intervalMs]);

  return null;
}
