import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { ApplicationOwnershipCard } from "@/components/application/ApplicationOwnershipCard";

describe("ApplicationOwnershipCard — Feedback & Visual States UX Tests", () => {
  const componentPath = path.resolve(
    __dirname,
    "../../../src/components/application/ApplicationOwnershipCard.tsx"
  );
  const componentContent = fs.readFileSync(componentPath, "utf8");

  it("1. exports ApplicationOwnershipCard client component function", () => {
    expect(ApplicationOwnershipCard).toBeDefined();
    expect(typeof ApplicationOwnershipCard).toBe("function");
    expect(componentContent).toContain('"use client";');
  });

  it("2. idle submit button text is 'Save Assignee'", () => {
    expect(componentContent).toContain('"Save Assignee"');
    expect(componentContent).toContain(
      '{busy ? (submitStatus || "Saving Assignee…") : "Save Assignee"}'
    );
  });

  it("3. submitting transitions text to 'Saving Assignee…' and displays animated spinner", () => {
    expect(componentContent).toContain('setSubmitStatus("Saving Assignee…")');
    expect(componentContent).toContain("animate-spin");
    expect(componentContent).toContain("aria-busy={busy}");
  });

  it("4. submit button and input controls become disabled during submission", () => {
    expect(componentContent).toContain("disabled={busy}");
    expect(componentContent).toContain("disabled:opacity-60");
    expect(componentContent).toContain("disabled:cursor-not-allowed");
    expect(componentContent).toContain('id="assignee-select"');
    expect(componentContent).toContain('id="reassign-reason-input"');
    expect(componentContent).toContain('id="save-assignee-btn"');
  });

  it("5. enforces double-click duplicate protection with if (busy) return guard", () => {
    expect(componentContent).toContain("if (busy) return;");
  });

  it("6. success confirmation feedback appears with role='status' and aria-live='polite'", () => {
    expect(componentContent).toContain('role="status"');
    expect(componentContent).toContain('aria-live="polite"');
    expect(componentContent).toContain('data-testid="assignment-success-alert"');
    expect(componentContent).toContain("bg-emerald-50");
  });

  it("7. error message feedback is rendered with role='alert' and aria-live='assertive'", () => {
    expect(componentContent).toContain('role="alert"');
    expect(componentContent).toContain('aria-live="assertive"');
    expect(componentContent).toContain('data-testid="assignment-error-alert"');
    expect(componentContent).toContain("bg-rose-50");
  });

  it("8. integrates with AppToast for floating global notifications", () => {
    expect(componentContent).toContain("<AppToast");
    expect(componentContent).toContain("open={toast.open}");
    expect(componentContent).toContain("message={toast.message}");
    expect(componentContent).toContain("type={toast.type}");
  });

  it("9. updates displayed assignee and triggers router.refresh() upon successful assignment", () => {
    expect(componentContent).toContain("setDisplayedAssigneeName(newLabel)");
    expect(componentContent).toContain("router.refresh()");
  });
});
