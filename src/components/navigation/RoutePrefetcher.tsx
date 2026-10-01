"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/generated/prisma";

/**
 * Prefetches a small set of likely next destinations — sequentially, after idle.
 * Avoids concurrent RSC/RLS transaction storms against the session-mode pooler.
 */
const ROUTES_BY_ROLE: Record<Role, string[]> = {
  CANDIDATE: ["/candidate/applications", "/candidate/profile"],
  EMPLOYEE: ["/employee/applications", "/employee/tasks", "/employee/candidates"],
  ADMIN: ["/admin/dashboard", "/admin/applications", "/admin/members"],
};

const PREFETCH_GAP_MS = 400;

export function RoutePrefetcher({ role }: { role: Role }) {
  const router = useRouter();

  useEffect(() => {
    const routes = ROUTES_BY_ROLE[role] || ROUTES_BY_ROLE.EMPLOYEE;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let gapId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const runSequential = async () => {
      for (const path of routes) {
        if (cancelled) return;
        try {
          router.prefetch(path);
        } catch {
          // Prefetch is best-effort
        }
        await new Promise<void>((resolve) => {
          gapId = setTimeout(resolve, PREFETCH_GAP_MS);
        });
      }
    };

    const start = () => {
      void runSequential();
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(start, { timeout: 4000 });
    } else {
      timeoutId = setTimeout(start, 1200);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
      if (gapId) clearTimeout(gapId);
    };
  }, [role, router]);

  return null;
}
