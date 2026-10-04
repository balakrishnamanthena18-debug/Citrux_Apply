"use client";

import { usePathname } from "next/navigation";
import type { Role } from "@/generated/prisma";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { getMobileTabItems } from "./mobileNavItems";

/**
 * iOS-style mobile tab bar. Visible only below md (768px).
 * "More" opens the existing navigation drawer.
 */
export function MobileBottomNav({
  role,
  onOpenMore,
}: {
  role: Role;
  onOpenMore: () => void;
}) {
  const pathname = usePathname();
  const tabs = getMobileTabItems(role);

  return (
    <nav
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 border-t border-[#E5EAE7] bg-white/95 shadow-[0_-10px_32px_rgba(15,23,32,0.08)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/85 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0px)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex h-[64px] max-w-lg items-stretch justify-between px-1.5">
        {tabs.map((tab) => {
          const isMore = tab.id === "more";
          const active = !isMore && tab.match(pathname);

          if (isMore) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={onOpenMore}
                className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition active:scale-[0.97]"
                aria-label="Open more navigation"
              >
                <span className="flex h-8 w-12 items-center justify-center rounded-full">
                  {tab.icon(false)}
                </span>
                <span className="text-[10px] font-medium text-[#94A3B8]">{tab.label}</span>
              </button>
            );
          }

          return (
            <TransitionLink
              key={tab.id}
              href={tab.href}
              isActive={active}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition active:scale-[0.97]"
              aria-label={tab.label}
            >
              <span
                className={`flex h-8 w-12 items-center justify-center rounded-full transition ${
                  active ? "bg-[#12A150]/12" : ""
                }`}
              >
                {tab.icon(active)}
              </span>
              <span
                className={`text-[10px] ${
                  active ? "font-semibold text-[#0B3B2C]" : "font-medium text-[#94A3B8]"
                }`}
              >
                {tab.label}
              </span>
            </TransitionLink>
          );
        })}
      </div>
    </nav>
  );
}
