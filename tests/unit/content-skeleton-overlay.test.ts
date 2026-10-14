import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ContentSkeletonOverlay } from "@/components/ui/ContentSkeletonOverlay";

describe("ContentSkeletonOverlay Opaque Replacement Invariants", () => {
  it("renders real content normally when not loading", () => {
    const html = renderToString(
      React.createElement(
        ContentSkeletonOverlay,
        { isLoading: false },
        React.createElement("div", { id: "real-content" }, "Real candidate workspace")
      )
    );

    expect(html).toContain("Real candidate workspace");
    expect(html).not.toContain("animate-pulse");
    expect(html).not.toContain("Loading workspace…");
  });

  it("completely replaces stale content with opaque skeleton surface when loading", () => {
    const html = renderToString(
      React.createElement(
        ContentSkeletonOverlay,
        { isLoading: true, statusLabel: "Loading workspace…" },
        React.createElement("div", { id: "real-content" }, "Stale conversation content")
      )
    );

    // Stale content must NEVER be rendered in the DOM when loading
    expect(html).not.toContain("Stale conversation content");

    // Opaque loading surface is rendered
    expect(html).toContain("bg-[#F7F9F8]");
    expect(html).toContain("animate-pulse");
    expect(html).toContain("Loading workspace…");
    expect(html).not.toContain("bg-white/50");
    expect(html).not.toContain("opacity-50");
  });

  it("supports custom skeleton on opaque surface", () => {
    const customSkeleton = React.createElement("div", { id: "custom-skel" }, "Custom Opaque Skeleton");
    const html = renderToString(
      React.createElement(
        ContentSkeletonOverlay,
        {
          isLoading: true,
          skeleton: customSkeleton,
        },
        React.createElement("div", null, "Authoritative Data")
      )
    );

    expect(html).not.toContain("Authoritative Data");
    expect(html).toContain("Custom Opaque Skeleton");
    expect(html).toContain("bg-[#F7F9F8]");
  });
});
