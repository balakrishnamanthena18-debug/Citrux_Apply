"use client";

import { useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";

export function RealtimeRefresher({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isPendingRef = useRef(isPending);

  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  useEffect(() => {
    const triggerRefresh = () => {
      if (document.visibilityState === "visible" && !isPendingRef.current) {
        startTransition(() => {
          router.refresh();
        });
      }
    };

    // 1. Refresh when window gains focus or tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    };

    const handleFocus = () => {
      triggerRefresh();
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    // 2. Periodic background refresh while tab is active
    const interval = setInterval(() => {
      triggerRefresh();
    }, intervalMs);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [router, intervalMs]);

  return null;
}
