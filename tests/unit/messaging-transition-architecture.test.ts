import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ConversationPaneSkeleton } from "@/components/messaging/ConversationPaneSkeleton";
import { ConversationPaneError } from "@/components/messaging/ConversationPaneError";
import { MessagingPendingProvider } from "@/components/messaging/MessagingPendingContext";

describe("Messages Transition Architecture — OOS Invariants", () => {
  describe("ConversationPaneSkeleton opacity and geometry", () => {
    it("renders with completely opaque backgrounds and no translucent bleed", () => {
      const html = renderToString(
        React.createElement(
          MessagingPendingProvider,
          null,
          React.createElement(ConversationPaneSkeleton)
        )
      );

      // Must be opaque
      expect(html).toContain("bg-[#F7F9F8]");
      expect(html).toContain("bg-white");
      expect(html).toContain("bg-[#FCFDFC]");

      // Must NOT contain translucent overlays or blurs
      expect(html).not.toContain("bg-white/40");
      expect(html).not.toContain("bg-white/50");
      expect(html).not.toContain("bg-white/60");
      expect(html).not.toContain("backdrop-blur");
    });

    it("has accessible loading attributes", () => {
      const html = renderToString(
        React.createElement(
          MessagingPendingProvider,
          null,
          React.createElement(ConversationPaneSkeleton)
        )
      );

      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-label="Loading conversation"');
    });
  });

  describe("ConversationPaneError state", () => {
    it("renders an opaque, accessible error state with retry action", () => {
      let retried = false;
      const html = renderToString(
        React.createElement(ConversationPaneError, {
          onRetry: () => {
            retried = true;
          },
        })
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain("Unable to load this conversation");
      expect(html).toContain("Try again");
      expect(html).toContain("bg-[#F7F9F8]");
      expect(html).not.toContain("backdrop-blur");
    });
  });
});
