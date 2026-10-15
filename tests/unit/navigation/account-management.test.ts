import { describe, it, expect } from "vitest";
import { getInitials, getRoleBadgeConfig } from "@/components/navigation/AccountIdentity";
import { getProfileRoute } from "@/components/navigation/AccountProfileLink";
import { getSettingsDestinations } from "@/components/navigation/AccountSettingsNavigation";
import { Role } from "@/generated/prisma";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../../..");

describe("Account Management Architecture — Core Unit Verification", () => {
  describe("AccountIdentity helpers", () => {
    it("extracts clean two-letter uppercase initials from multi-word names", () => {
      expect(getInitials("Admin User", "admin@citrux.in")).toBe("AU");
      expect(getInitials("Balakrishna Manthena", "bala@citrux.in")).toBe("BM");
      expect(getInitials("Alice Wonder Land", "alice@citrux.in")).toBe("AL");
    });

    it("falls back to first character of single name or email", () => {
      expect(getInitials("Admin", "admin@citrux.in")).toBe("A");
      expect(getInitials(null, "operations@citrux.in")).toBe("O");
      expect(getInitials("", "")).toBe("U");
    });

    it("assigns authoritative role badge configurations according to RBAC", () => {
      const adminBadge = getRoleBadgeConfig(Role.ADMIN);
      expect(adminBadge.label).toBe("SYSTEM ADMIN");
      expect(adminBadge.bg).toContain("purple");

      const employeeBadge = getRoleBadgeConfig(Role.EMPLOYEE, false, false);
      expect(employeeBadge.label).toBe("EMPLOYEE");
      expect(employeeBadge.bg).toContain("blue");

      const teamLeadBadge = getRoleBadgeConfig(Role.EMPLOYEE, true, false);
      expect(teamLeadBadge.label).toBe("TEAM LEAD");
      expect(teamLeadBadge.bg).toContain("amber");

      const managerBadge = getRoleBadgeConfig(Role.EMPLOYEE, false, true);
      expect(managerBadge.label).toBe("MANAGER");
      expect(managerBadge.bg).toContain("indigo");

      const candidateBadge = getRoleBadgeConfig(Role.CANDIDATE);
      expect(candidateBadge.label).toBe("CANDIDATE");
      expect(candidateBadge.bg).toContain("emerald");
    });
  });

  describe("AccountProfileLink resolution", () => {
    it("resolves Admin profile to canonical staff roster membership when available", () => {
      expect(getProfileRoute(Role.ADMIN, "mem-123")).toEqual({
        href: "/admin/members/mem-123",
        label: "My Staff Profile",
      });
      expect(getProfileRoute(Role.ADMIN, undefined)).toEqual({
        href: "/admin/members",
        label: "My Staff Profile",
      });
    });

    it("resolves Candidate profile to /candidate/profile", () => {
      expect(getProfileRoute(Role.CANDIDATE)).toEqual({
        href: "/candidate/profile",
        label: "My Career Profile",
      });
    });

    it("resolves Employee profile to /employee command center", () => {
      expect(getProfileRoute(Role.EMPLOYEE)).toEqual({
        href: "/employee",
        label: "My Command Center",
      });
    });
  });

  describe("AccountSettingsNavigation resolution", () => {
    it("preserves canonical Settings → Organization → Designations path for Admin", () => {
      const adminSettings = getSettingsDestinations(Role.ADMIN);
      expect(adminSettings.map((s) => s.href)).toContain("/admin/settings");
      expect(adminSettings.map((s) => s.href)).toContain("/admin/settings/designations");
      expect(adminSettings.map((s) => s.href)).toContain("/admin/settings/task-rules");
    });

    it("provides Candidate preferences and privacy routes without exposing admin config", () => {
      const candSettings = getSettingsDestinations(Role.CANDIDATE);
      expect(candSettings.map((s) => s.href)).toContain("/candidate/profile?section=preferences");
      expect(candSettings.map((s) => s.href)).toContain("/candidate/privacy");
      expect(candSettings.map((s) => s.href)).not.toContain("/admin/settings");
    });

    it("restricts Employee settings to operational queues", () => {
      const empSettings = getSettingsDestinations(Role.EMPLOYEE);
      expect(empSettings.map((s) => s.href)).toContain("/employee/tasks");
      expect(empSettings.map((s) => s.href)).toContain("/employee/application-log");
      expect(empSettings.map((s) => s.href)).not.toContain("/admin/settings");
    });
  });

  describe("Component file integrity and accessibility compliance", () => {
    it("AppHeader integrates AccountMenu component and passes authenticated props", () => {
      const header = readFileSync(
        join(ROOT, "src/components/navigation/AppHeader.tsx"),
        "utf8"
      );
      expect(header).toContain("<AccountMenu");
      expect(header).toContain("role={role}");
      expect(header).toContain("email={email}");
      expect(header).toContain("organizationName={organizationName}");
    });

    it("AppSidebar integrates ResponsiveAccountPanel and explicit sign-out actions", () => {
      const sidebar = readFileSync(
        join(ROOT, "src/components/navigation/AppSidebar.tsx"),
        "utf8"
      );
      expect(sidebar).toContain("<ResponsiveAccountPanel");
      expect(sidebar).toContain("signOutAction");
      expect(sidebar).toContain("<span>Sign out</span>");
    });

    it("SignOutAction is wired directly to server action signOutAction", () => {
      const action = readFileSync(
        join(ROOT, "src/components/navigation/SignOutAction.tsx"),
        "utf8"
      );
      expect(action).toContain('action={signOutAction}');
      expect(action).toContain('aria-label="Sign out"');
      expect(action).toContain("Signing out...");
    });

    it("AccountMenu supports keyboard navigation (Escape), ARIA menu semantics, and outside-click dismissal", () => {
      const menu = readFileSync(
        join(ROOT, "src/components/navigation/AccountMenu.tsx"),
        "utf8"
      );
      expect(menu).toContain('role="menu"');
      expect(menu).toContain('aria-haspopup="menu"');
      expect(menu).toContain('aria-expanded={isOpen}');
      expect(menu).toContain('event.key === "Escape"');
      expect(menu).toContain("handleClickOutside");
      expect(menu).toContain("v2.2.0-RELEASE");
    });
  });
});
