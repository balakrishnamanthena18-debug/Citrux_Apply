"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { NavigationPendingProvider } from "./NavigationPendingContext";
import { SoftNavPendingShell } from "./SoftNavPendingShell";
import type { Role } from "@/generated/prisma";

interface AppShellProps {
  role: Role;
  email: string;
  fullName?: string | null;
  children: React.ReactNode;
}

export function AppShell({ role, email, fullName, children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <NavigationPendingProvider>
      <div className="min-h-screen bg-[#F7F9F8] antialiased text-[#0F1720] selection:bg-emerald-500/20 selection:text-[#0B3B2C]">
        {/* Desktop Fixed Persistent Sidebar (>= 1024px / lg:) */}
        <div className="hidden lg:block">
          <AppSidebar
            role={role}
            email={email}
            fullName={fullName}
            isMobile={false}
          />
        </div>

        {/* Mobile & Tablet Slide-over Drawer (< 1024px) */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 flex lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation drawer"
          >
            <button
              type="button"
              className="absolute inset-0 bg-[#0B3B2C]/30 transition-opacity duration-200"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
            />

            <div
              className="relative z-50 flex h-full w-[min(320px,86vw)] max-w-[320px] flex-col border-r border-[#E5EAE7] bg-white shadow-xl transition-transform duration-200 ease-out"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
              <AppSidebar
                role={role}
                email={email}
                fullName={fullName}
                isMobile={true}
                onClose={() => setMobileMenuOpen(false)}
              />
            </div>
          </div>
        )}

        <div className="flex min-h-screen w-full flex-col lg:pl-64">
          <AppHeader
            role={role}
            email={email}
            fullName={fullName}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
          />
          <main
            className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-6 lg:pb-8"
          >
            <SoftNavPendingShell>{children}</SoftNavPendingShell>
          </main>
        </div>

        <MobileBottomNav role={role} onOpenMore={() => setMobileMenuOpen(true)} />
      </div>
    </NavigationPendingProvider>
  );
}
