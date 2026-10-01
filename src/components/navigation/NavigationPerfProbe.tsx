"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PERF_MARK_NAV = "oos-nav-start";
const PERF_MEASURE_PREFIX = "oos-nav-";

/**
 * Lightweight navigation Time-to-Usable instrumentation.
 * Records Performance marks/measures without logging PII.
 * Emits a CustomEvent `oos:navigation-metric` for local debugging.
 */
export function NavigationPerfProbe() {
  const pathname = usePathname();

  useEffect(() => {
    const navStart = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;

    // Soft navigations: mark when pathname changes
    try {
      if (performance.getEntriesByName(PERF_MARK_NAV).length > 0) {
        performance.clearMarks(PERF_MARK_NAV);
      }
      performance.mark(PERF_MARK_NAV);
    } catch {
      // Performance API unavailable
    }

    let cancelled = false;
    const startedAt = performance.now();

    // Approximate Time-to-Usable: next animation frame after paint + short settle
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const usableAt = performance.now();
        const t2uMs = Math.round(usableAt - startedAt);

        try {
          const measureName = `${PERF_MEASURE_PREFIX}${pathname}`;
          performance.measure(measureName, PERF_MARK_NAV);
        } catch {
          // ignore measure failures
        }

        const detail = {
          pathname,
          timeToUsableMs: t2uMs,
          ttfbMs: navStart ? Math.round(navStart.responseStart) : null,
          softNavigation: true,
          measuredAt: new Date().toISOString(),
        };

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("oos:navigation-metric", { detail }));
          // Dev-only console signal — no PII
          if (process.env.NODE_ENV === "development") {
            console.debug("[oos-nav]", detail);
          }
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return null;
}
