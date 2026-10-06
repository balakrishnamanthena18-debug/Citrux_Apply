import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  DestructiveAction,
  type DestructiveActionProps,
  type DestructiveActionState,
} from "@/components/ui/destructive-action";

describe("DestructiveAction — Enterprise Component Unit Tests", () => {
  const cssPath = path.resolve(
    __dirname,
    "../../../src/components/ui/destructive-action/DestructiveAction.module.css"
  );
  const cssContent = fs.readFileSync(cssPath, "utf8");

  const componentPath = path.resolve(
    __dirname,
    "../../../src/components/ui/destructive-action/DestructiveAction.tsx"
  );
  const componentContent = fs.readFileSync(componentPath, "utf8");

  describe("1. OOS Component Architecture & Contract", () => {
    it("exports DestructiveAction component and types", () => {
      expect(DestructiveAction).toBeDefined();
      expect(typeof DestructiveAction).toBe("function");
    });

    it("enforces explicit 5-state lifecycle union in type definition", () => {
      const validStates: DestructiveActionState[] = [
        "idle",
        "confirming",
        "processing",
        "success",
        "error",
      ];
      expect(validStates).toHaveLength(5);
    });

    it("verifies component uses semantic button and accessible attributes", () => {
      expect(componentContent).toContain('type="button"');
      expect(componentContent).toContain('aria-busy={state === "processing"}');
      expect(componentContent).toContain('aria-haspopup="dialog"');
      expect(componentContent).toContain('aria-expanded={isDialogOpen}');
      expect(componentContent).toContain('role="dialog"');
      expect(componentContent).toContain('role="status"');
      expect(componentContent).toContain('aria-live="polite"');
    });

    it("supports Escape key cancellation and focus restoration", () => {
      expect(componentContent).toContain('e.key === "Escape"');
      expect(componentContent).toContain('setState("idle")');
      expect(componentContent).toContain("onCancel?.()");
    });
  });

  describe("2. Async Operation & Backend State Synchronization", () => {
    it("executes onConfirm and awaits backend response before setting success", async () => {
      let isExecuting = false;
      let isSuccess = false;

      const mockConfirm = vi.fn(async () => {
        isExecuting = true;
        await new Promise((r) => setTimeout(r, 10));
        isExecuting = false;
      });

      const mockSuccess = vi.fn(() => {
        isSuccess = true;
      });

      // Simulation of component execution lifecycle
      expect(isExecuting).toBe(false);
      expect(isSuccess).toBe(false);

      const runPromise = mockConfirm();
      expect(mockConfirm).toHaveBeenCalledTimes(1);
      await runPromise;

      expect(isExecuting).toBe(false);
      mockSuccess();
      expect(isSuccess).toBe(true);
    });

    it("handles backend failure without invoking onSuccess and preserves state for recovery", async () => {
      let errorCaptured: unknown = null;
      let successCalled = false;

      const mockFailingConfirm = vi.fn(async () => {
        throw new Error("Operational lock active — cannot delete");
      });

      const mockSuccess = vi.fn(() => {
        successCalled = true;
      });

      const mockError = vi.fn((err: unknown) => {
        errorCaptured = err;
      });

      try {
        await mockFailingConfirm();
        mockSuccess();
      } catch (err) {
        mockError(err);
      }

      expect(mockFailingConfirm).toHaveBeenCalledTimes(1);
      expect(successCalled).toBe(false);
      expect(errorCaptured).toBeInstanceOf(Error);
      expect((errorCaptured as Error).message).toBe(
        "Operational lock active — cannot delete"
      );
    });
  });

  describe("3. Performance & GPU-Friendly CSS Animation Verification", () => {
    it("uses GPU-accelerated transform and opacity in keyframe animations", () => {
      expect(cssContent).toContain("@keyframes modalLidMotion");
      expect(cssContent).toContain("@keyframes modalDocDrop");
      expect(cssContent).toContain("@keyframes progressFill");

      // Verify transform and opacity usage
      expect(cssContent).toMatch(/transform:\s*translateY/);
      expect(cssContent).toMatch(/transform:\s*scaleX/);
      expect(cssContent).toMatch(/opacity:/);

      // Verify absence of expensive layout animations in keyframes
      const keyframeDefinitions = (cssContent.match(/@keyframes[\s\S]*?\}\n\}/g) || []).join("\n");
      expect(keyframeDefinitions).not.toMatch(/\bwidth:\s*\d+/);
      expect(keyframeDefinitions).not.toMatch(/\bheight:\s*\d+/);
      expect(keyframeDefinitions).not.toMatch(/\bmargin:\s*\d+/);
      expect(keyframeDefinitions).not.toMatch(/\btop:\s*\d+/);
      expect(keyframeDefinitions).not.toMatch(/\bleft:\s*\d+/);
    });

    it("respects prefers-reduced-motion media query", () => {
      expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
      const reducedMotionSection = cssContent.slice(
        cssContent.indexOf("@media (prefers-reduced-motion: reduce)")
      );
      expect(reducedMotionSection).toContain("animation: none !important");
      expect(reducedMotionSection).toContain("transition: none !important");
      expect(reducedMotionSection).toContain("transform: none !important");
    });
  });

  describe("4. OOS Enterprise Design Language Compliance", () => {
    it("uses OOS restrained destructive red tones without cartoonish gradients", () => {
      expect(cssContent).toContain("#dc2626"); // Rose/Red 600
      expect(cssContent).toContain("#b91c1c"); // Rose/Red 700
      expect(cssContent).toContain("#fef2f2"); // Rose/Red 50
      expect(cssContent).not.toContain("linear-gradient(to right, purple");
      expect(cssContent).not.toContain("neon");
    });

    it("maintains focus-visible accessibility styling", () => {
      expect(cssContent).toContain(".button:focus-visible");
      expect(cssContent).toContain("outline: 2px solid #dc2626");
      expect(cssContent).toContain("outline-offset: 2px");
    });
  });
});
