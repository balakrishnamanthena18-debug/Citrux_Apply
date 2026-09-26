"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import type { Role } from "@/generated/prisma";

interface AppShellProps {
  role: Role;
  email: string;
  fullName?: string | null;
  children: React.ReactNode;
}

export function AppShell({ role, email, fullName, children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close drawer on Escape key and prevent background scroll when open
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
    <div className="min-h-screen bg-[#F8FAFC] antialiased text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Desktop Fixed Persistent Sidebar (>= 1024px / lg:) */}
      <div className="hidden lg:block">
        <AppSidebar
          role={role}
          email={email}
          fullName={fullName}
          isMobile={false}
        />
      </div>

      {/* Mobile & Tablet Slide-over Drawer (< 1024px / lg:hidden) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation drawer"
        >
          {/* Controlled Backdrop (25-30% opacity, minimal/no blur) */}
          <div
            className="fixed inset-0 bg-slate-900/30 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="relative flex flex-col w-[min(320px,86vw)] max-w-[320px] bg-white z-50 shadow-xl border-r border-slate-200/80 h-full">
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

      {/* Main Application Container (Offset on Desktop >= 1024px by 256px / lg:pl-64) */}
      <div className="lg:pl-64 flex flex-col min-h-screen w-full">
        <AppHeader
          role={role}
          email={email}
          fullName={fullName}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
