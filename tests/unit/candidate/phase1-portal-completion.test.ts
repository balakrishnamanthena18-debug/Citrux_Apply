import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getMobileTabItems } from "@/components/navigation/mobileNavItems";
import {
  CAREER_SECTION_KEYS,
  isCareerSectionKey,
} from "@/lib/candidate/career-sections";
import {
  buildCandidateRealtimeScope,
  getCandidateRealtimeChannelName,
  isCrossCandidateRealtimeLeak,
  resolveCandidateRealtimeChannelKey,
} from "@/lib/realtime/candidate-identity";
import { getChannelName } from "@/lib/realtime/channels";

const ROOT = join(__dirname, "../../..");

describe("Phase 1 — Candidate Portal Completion", () => {
  describe("Projects UI integration", () => {
    it("wires Projects into Career Profile workspace (not a top-level route)", () => {
      const nav = readFileSync(
        join(ROOT, "src/components/candidate/CandidateCareerNav.tsx"),
        "utf8"
      );
      const workspace = readFileSync(
        join(ROOT, "src/components/candidate/CandidateCareerWorkspace.tsx"),
        "utf8"
      );
      const editor = readFileSync(
        join(ROOT, "src/components/candidate/ProjectEditor.tsx"),
        "utf8"
      );

      expect(isCareerSectionKey("projects")).toBe(true);
      expect(CAREER_SECTION_KEYS).toContain("projects");
      expect(nav).toContain('key: "projects"');
      expect(workspace).toContain("ProjectEditor");
      expect(workspace).toContain('activeSection === "projects"');
      expect(editor).toContain("upsertCandidateProjectAction");
      expect(editor).toContain("No projects added yet.");
      expect(existsSync(join(ROOT, "src/app/(dashboard)/candidate/projects"))).toBe(false);
    });
  });

  describe("Notifications architecture", () => {
    it("keeps NotificationsBell as the single live candidate notification UX", () => {
      const header = readFileSync(
        join(ROOT, "src/components/navigation/AppHeader.tsx"),
        "utf8"
      );
      const bell = readFileSync(
        join(ROOT, "src/components/NotificationsBell.tsx"),
        "utf8"
      );
      const tombstone = readFileSync(
        join(ROOT, "src/components/candidate/CandidateNotificationCenter.tsx"),
        "utf8"
      );

      expect(header).toContain("NotificationsBell");
      expect(header).not.toContain("CandidateNotificationCenter");
      expect(bell).toContain("markNotificationReadAction");
      expect(bell).toContain("/api/notifications");
      expect(bell).toContain("Escape");
      expect(bell).toContain("No notifications yet");
      expect(tombstone).toContain("@deprecated");
      expect(tombstone).not.toContain("export function CandidateNotificationCenter");
    });
  });

  describe("Realtime candidate identity", () => {
    it("keys candidate channels by Auth/User.id and isolates cross-candidate events", () => {
      const userA = "user-candidate-a";
      const userB = "user-candidate-b";

      expect(resolveCandidateRealtimeChannelKey(userA)).toBe(userA);
      expect(getCandidateRealtimeChannelName(userA)).toBe(`candidate:${userA}`);
      expect(getCandidateRealtimeChannelName(userB)).toBe(`candidate:${userB}`);
      expect(getCandidateRealtimeChannelName(userA)).not.toBe(
        getCandidateRealtimeChannelName(userB)
      );

      const scopeA = buildCandidateRealtimeScope({
        organizationId: "org-1",
        userId: userA,
      });
      expect(scopeA.candidateId).toBe(userA);
      expect(getChannelName(scopeA)).toBe(`candidate:${userA}`);

      expect(
        isCrossCandidateRealtimeLeak({
          subscriberUserId: userA,
          eventCandidateId: userB,
        })
      ).toBe(true);
      expect(
        isCrossCandidateRealtimeLeak({
          subscriberUserId: userA,
          eventCandidateId: userA,
        })
      ).toBe(false);
    });
  });

  describe("Candidate navigation", () => {
    it("keeps compact mobile tabs and Career/Account secondary destinations", () => {
      const tabs = getMobileTabItems("CANDIDATE" as any);
      expect(tabs.map((t) => t.id)).toEqual([
        "home",
        "apps",
        "messages",
        "profile",
        "more",
      ]);
      expect(tabs).toHaveLength(5);

      const sidebar = readFileSync(
        join(ROOT, "src/components/navigation/AppSidebar.tsx"),
        "utf8"
      );
      expect(sidebar).toContain('title: "PRIMARY"');
      expect(sidebar).toContain('title: "CAREER"');
      expect(sidebar).toContain('title: "ACCOUNT"');
      expect(sidebar).toContain("/candidate/profile?section=documents");
      expect(sidebar).toContain("/candidate/profile?section=preferences");
      expect(sidebar).toContain("/candidate/privacy");
      expect(sidebar).not.toContain("/candidate/projects");
    });
  });
});
