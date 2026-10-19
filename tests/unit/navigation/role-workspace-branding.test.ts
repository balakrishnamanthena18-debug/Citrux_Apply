import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { Role } from "@/generated/prisma";
import { getRoleBadgeConfig, getInitials } from "@/components/navigation/AccountIdentity";
import { getMobileTabItems } from "@/components/navigation/mobileNavItems";

const ROOT = join(__dirname, "../../..");

describe("Role-Aware Workspace Branding & Separation (Phase 3B)", () => {
  describe("1. Role Badge Configuration & Established Palette", () => {
    it("renders Career Button pale sage and forest green for CANDIDATE role", () => {
      const candidateBadge = getRoleBadgeConfig(Role.CANDIDATE);
      expect(candidateBadge.label).toBe("CANDIDATE");
      expect(candidateBadge.bg).toBe("bg-[#EBF2ED]");
      expect(candidateBadge.text).toBe("text-[#082F26]");
      expect(candidateBadge.border).toBe("border-[#C2D6CA]");
    });

    it("preserves internal styling for EMPLOYEE and ADMIN roles", () => {
      const adminBadge = getRoleBadgeConfig(Role.ADMIN);
      expect(adminBadge.label).toBe("SYSTEM ADMIN");
      expect(adminBadge.bg).toBe("bg-purple-50");
      expect(adminBadge.text).toBe("text-purple-700");

      const employeeBadge = getRoleBadgeConfig(Role.EMPLOYEE);
      expect(employeeBadge.label).toBe("EMPLOYEE");
      expect(employeeBadge.bg).toBe("bg-blue-50");
      expect(employeeBadge.text).toBe("text-blue-700");

      const managerBadge = getRoleBadgeConfig(Role.EMPLOYEE, false, true);
      expect(managerBadge.label).toBe("MANAGER");
      expect(managerBadge.bg).toBe("bg-indigo-50");

      const leadBadge = getRoleBadgeConfig(Role.EMPLOYEE, true, false);
      expect(leadBadge.label).toBe("TEAM LEAD");
      expect(leadBadge.bg).toBe("bg-amber-50");
    });
  });

  describe("2. Authoritative Brand Separation & User-Data Immunity", () => {
    it("ensures candidate display name or organization input cannot override application brand", () => {
      // User with deceptive admin/citrux display name
      const adversarialCandidate = {
        fullName: "System Administrator",
        email: "candidate@gmail.com",
        organizationName: "Citrux Internal Operations",
      };

      const initials = getInitials(adversarialCandidate.fullName, adversarialCandidate.email);
      expect(initials).toBe("SA");

      // Role check remains authoritative: role = CANDIDATE
      const badge = getRoleBadgeConfig(Role.CANDIDATE);
      expect(badge.label).toBe("CANDIDATE");
      expect(badge.text).toBe("text-[#082F26]");
      expect(badge.bg).toBe("bg-[#EBF2ED]");
      // The badge label cannot be spoofed to SYSTEM ADMIN because getRoleBadgeConfig strictly checks Role enum
      expect(badge.label).not.toBe("SYSTEM ADMIN");
    });
  });

  describe("3. AppSidebar Component Brand Contracts", () => {
    const sidebarContent = readFileSync(
      join(ROOT, "src/components/navigation/AppSidebar.tsx"),
      "utf8"
    );

    it("branches branding strictly on role === 'CANDIDATE'", () => {
      expect(sidebarContent).toContain('role === "CANDIDATE" ? (');
      expect(sidebarContent).toContain('data-testid="sidebar-brand-candidate"');
      expect(sidebarContent).toContain('data-testid="sidebar-brand-internal"');
    });

    it("renders official Career Button logo emblem and title for candidates", () => {
      expect(sidebarContent).toContain("CareerButtonEmblem");
      expect(sidebarContent).toContain("Career Button");
      expect(sidebarContent).toContain("Candidate Portal");
      expect(sidebarContent).toContain("bg-[#082F26]");
      expect(sidebarContent).toContain("text-[#D8F971]");
    });

    it("preserves OOS and Operations OS branding for internal staff and administrators", () => {
      expect(sidebarContent).toContain("Operations OS");
      expect(sidebarContent).toContain("OOS");
      expect(sidebarContent).toContain("bg-[#0B3B2C]");
      expect(sidebarContent).toContain("text-[#C6F432]");
    });

    it("applies Career Button styling to candidate navigation items", () => {
      expect(sidebarContent).toContain('bg-[#EBF2ED] text-[#082F26] font-semibold');
      expect(sidebarContent).toContain('border-l-2 border-[#082F26]');
      expect(sidebarContent).toContain('hover:text-[#082F26] hover:bg-[#EBF2ED]/50');
    });
  });

  describe("4. AppHeader Breadcrumb Root & Navigation", () => {
    const headerContent = readFileSync(
      join(ROOT, "src/components/navigation/AppHeader.tsx"),
      "utf8"
    );

    it("displays 'Career Button' root breadcrumb for candidates and 'OOS' for internal roles", () => {
      expect(headerContent).toContain('data-testid="header-breadcrumb-root"');
      expect(headerContent).toContain('role === "CANDIDATE" ? "Career Button" : "OOS"');
    });
  });

  describe("5. Support and Communications Channel Routing in AccountModals", () => {
    const modalsContent = readFileSync(
      join(ROOT, "src/components/navigation/AccountModals.tsx"),
      "utf8"
    );

    it("routes candidate support to support@careerbutton.in and notifications@careerbutton.in", () => {
      expect(modalsContent).toContain('support@careerbutton.in');
      expect(modalsContent).toContain('notifications@careerbutton.in');
      expect(modalsContent).toContain('role === "CANDIDATE"');
    });

    it("preserves internal support@citrux.in and notifications@citrux.in for staff and administrators", () => {
      expect(modalsContent).toContain('support@citrux.in');
      expect(modalsContent).toContain('notifications@citrux.in');
    });

    it("displays CB monogram for candidates and OOS for internal staff in security dialog", () => {
      expect(modalsContent).toContain('isCandidate ? "CB" : "OOS"');
      expect(modalsContent).toContain('Career Button Client Portal');
      expect(modalsContent).toContain('Operations Operating System');
    });
  });

  describe("6. Mobile Navigation & Tabs", () => {
    const mobileBottomNavContent = readFileSync(
      join(ROOT, "src/components/navigation/MobileBottomNav.tsx"),
      "utf8"
    );

    it("renders Career Button pale sage active tab highlight for candidates", () => {
      expect(mobileBottomNavContent).toContain('role === "CANDIDATE"');
      expect(mobileBottomNavContent).toContain('bg-[#EBF2ED]');
      expect(mobileBottomNavContent).toContain('text-[#082F26]');
    });

    it("derives role-specific tab items with correct route destinations", () => {
      const candidateTabs = getMobileTabItems(Role.CANDIDATE);
      expect(candidateTabs.map((t) => t.href)).toEqual([
        "/candidate",
        "/candidate/applications",
        "/candidate/messages",
        "/candidate/profile",
        "#more",
      ]);

      const employeeTabs = getMobileTabItems(Role.EMPLOYEE);
      expect(employeeTabs.map((t) => t.href)).toEqual([
        "/employee",
        "/employee/applications",
        "/employee/tasks",
        "/employee/messages",
        "#more",
      ]);

      const adminTabs = getMobileTabItems(Role.ADMIN);
      expect(adminTabs.map((t) => t.href)).toEqual([
        "/admin",
        "/employee/applications",
        "/employee/tasks",
        "/employee/messages",
        "#more",
      ]);
    });
  });
});
