"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/generated/prisma";

/**
 * Prefetches likely next authenticated destinations after idle.
 * Presentation-only warmup — authorization remains server-side on navigation.
 */
const ROUTES_BY_ROLE: Record<Role, string[]> = {
  CANDIDATE: [
    "/candidate",
    "/candidate/applications",
    "/candidate/profile",
    "/candidate/messages",
  ],
  EMPLOYEE: [
    "/employee",
    "/employee/applications",
    "/employee/tasks",
    "/employee/candidates",
    "/employee/jobs",
    "/employee/messages",
  ],
  ADMIN: [
    "/admin",
    "/admin/dashboard",
    "/admin/applications",
    "/admin/members",
    "/admin/tasks/escalations",
    "/employee/tasks",
    "/employee/applications",
  ],
};

export function RoutePrefetcher({ role }: { role: Role }) {
  const router = useRouter();

  useEffect(() => {
    const routes = ROUTES_BY_ROLE[role] || ROUTES_BY_ROLE.EMPLOYEE;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      for (const path of routes) {
        try {
          router.prefetch(path);
        } catch {
          // Prefetch is best-effort
        }
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(run, 600);
    }

    return () => {
      if (idleId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [role, router]);

  return null;
}
