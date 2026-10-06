import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { StaffOutcomesPanel } from "@/components/application/StaffOutcomesPanel";

describe("StaffOutcomesPanel — Phase 6D.2 UX Feedback & Lifecycle Tests", () => {
  const componentPath = path.resolve(
    __dirname,
    "../../../src/components/application/StaffOutcomesPanel.tsx"
  );
  const componentContent = fs.readFileSync(componentPath, "utf8");

  it("1. exports StaffOutcomesPanel component function", () => {
    expect(StaffOutcomesPanel).toBeDefined();
    expect(typeof StaffOutcomesPanel).toBe("function");
  });

  it("2. idle submit button text is 'Record outcome'", () => {
    expect(componentContent).toContain('"Record outcome"');
    expect(componentContent).toContain(
      '{busy ? (submitStatus || "Recording outcome…") : "Record outcome"}'
    );
  });

  it("3. submitting transitions text to 'Recording outcome…' and displays animated spinner", () => {
    expect(componentContent).toContain('setSubmitStatus("Recording outcome…")');
    expect(componentContent).toContain('animate-spin');
    expect(componentContent).toContain('aria-busy={busy}');
  });

  it("4. submit button becomes disabled and guarded during submission", () => {
    expect(componentContent).toContain("disabled={busy}");
    expect(componentContent).toContain("disabled:opacity-60");
    expect(componentContent).toContain("disabled:cursor-not-allowed");
  });

  it("5. success confirmation feedback appears with role='status' and aria-live='polite'", () => {
    expect(componentContent).toContain('setSuccessMessage(`${recordedLabel} recorded successfully.`)');
    expect(componentContent).toContain('role="status"');
    expect(componentContent).toContain('aria-live="polite"');
    expect(componentContent).toContain('bg-emerald-50');
  });

  it("6. error message feedback is rendered with role='alert'", () => {
    expect(componentContent).toContain('role="alert"');
    expect(componentContent).toContain('aria-live="assertive"');
    expect(componentContent).toContain('bg-rose-50');
    expect(componentContent).toContain('"Evidence upload failed. The outcome was not recorded."');
  });

  it("7. enforces double-click duplicate protection with if (busy) return guard", () => {
    expect(componentContent).toContain("if (busy) return;");
  });

  it("8. supports evidence flow transition: Uploading evidence… -> Recording outcome… -> success", () => {
    expect(componentContent).toContain('setSubmitStatus("Uploading evidence…")');
    expect(componentContent).toContain('generateOutcomeEvidenceUploadUrlAction');
    expect(componentContent).toContain('setSubmitStatus("Recording outcome…")');
    expect(componentContent).toContain('createStaffOutcomeAction');
  });
});
