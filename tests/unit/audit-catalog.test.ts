import { describe, it, expect } from "vitest";
import {
  getActionMetadata,
  getActionsForCategory,
  getAllCategories,
  CATEGORY_LABELS,
  ACTION_CATALOG,
  type AuditCategory,
} from "@/lib/audit/catalog";
import { AuditAction } from "@/generated/prisma";

describe("Audit Catalog & Taxonomy (src/lib/audit/catalog.ts)", () => {
  it("defines all expected audit categories with labels", () => {
    const categories = getAllCategories();
    expect(categories.length).toBe(10);
    expect(categories.map((c) => c.key)).toContain("ALL");
    expect(categories.map((c) => c.key)).toContain("SECURITY_IDENTITY");
    expect(categories.map((c) => c.key)).toContain("JOB_APPLICATION");
    expect(categories.map((c) => c.key)).toContain("PRIVACY_COMPLIANCE");
    expect(categories.map((c) => c.key)).toContain("INTERVIEW_OFFER");
  });

  it("categorizes all 77 enum values of AuditAction", () => {
    const allActions = Object.values(AuditAction);
    expect(allActions.length).toBeGreaterThanOrEqual(70);

    for (const action of allActions) {
      const meta = getActionMetadata(action);
      expect(meta).toBeDefined();
      expect(meta.label).toBeTruthy();
      expect(meta.category).toBeTruthy();
      expect(meta.tone).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });

  it("maps security actions correctly to SECURITY_IDENTITY with rose/amber/emerald tones", () => {
    const alertMeta = getActionMetadata(AuditAction.SECURITY_ALERT);
    expect(alertMeta.category).toBe("SECURITY_IDENTITY");
    expect(alertMeta.tone).toBe("rose");
    expect(alertMeta.label).toBe("Security Alert");

    const accessDeniedMeta = getActionMetadata(AuditAction.ACCESS_DENIED);
    expect(accessDeniedMeta.category).toBe("SECURITY_IDENTITY");
    expect(accessDeniedMeta.tone).toBe("rose");
    expect(accessDeniedMeta.label).toBe("Access Denied");

    const loginMeta = getActionMetadata(AuditAction.USER_LOGIN);
    expect(loginMeta.category).toBe("SECURITY_IDENTITY");
    expect(loginMeta.tone).toBe("emerald");
    expect(loginMeta.label).toBe("User Login");
  });

  it("maps application and QA actions to JOB_APPLICATION", () => {
    const qaPassedMeta = getActionMetadata(AuditAction.APPLICATION_QA_PASSED);
    expect(qaPassedMeta.category).toBe("JOB_APPLICATION");
    expect(qaPassedMeta.tone).toBe("emerald");
    expect(qaPassedMeta.label).toBe("QA Passed");

    const qaFailedMeta = getActionMetadata(AuditAction.APPLICATION_QA_FAILED);
    expect(qaFailedMeta.category).toBe("JOB_APPLICATION");
    expect(qaFailedMeta.tone).toBe("rose");
    expect(qaFailedMeta.label).toBe("QA Failed");
  });

  it("maps privacy actions to PRIVACY_COMPLIANCE", () => {
    const exportMeta = getActionMetadata(AuditAction.CANDIDATE_DATA_EXPORTED);
    expect(exportMeta.category).toBe("PRIVACY_COMPLIANCE");
    expect(exportMeta.label).toBe("Candidate Data Exported");

    const deleteMeta = getActionMetadata(AuditAction.CANDIDATE_DATA_DELETED);
    expect(deleteMeta.category).toBe("PRIVACY_COMPLIANCE");
    expect(deleteMeta.tone).toBe("rose");
  });

  it("getActionsForCategory returns appropriate actions subset", () => {
    const secActions = getActionsForCategory("SECURITY_IDENTITY");
    expect(secActions).toContain(AuditAction.USER_LOGIN);
    expect(secActions).toContain(AuditAction.SECURITY_ALERT);
    expect(secActions).not.toContain(AuditAction.APPLICATION_SUBMITTED);

    const allActions = getActionsForCategory("ALL");
    expect(allActions.length).toBe(Object.values(AuditAction).length);
  });

  it("handles unknown or dynamic action strings with graceful fallback", () => {
    const unknownMeta = getActionMetadata("CUSTOM_UNKNOWN_HOOK_FIRED");
    expect(unknownMeta.category).toBe("ALL");
    expect(unknownMeta.label).toBe("Custom Unknown Hook Fired");
    expect(unknownMeta.tone).toBe("neutral");
  });
});
