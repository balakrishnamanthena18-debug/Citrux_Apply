import { describe, it, expect } from "vitest";
import { shouldPrefetchHref } from "@/lib/navigation/prefetch-policy";

describe("controlled navigation prefetch allowlist", () => {
  it("allows priority employee routes", () => {
    expect(shouldPrefetchHref("/employee/applications")).toBe(true);
    expect(shouldPrefetchHref("/employee/application-log")).toBe(true);
    expect(shouldPrefetchHref("/employee/jobs")).toBe(true);
    expect(shouldPrefetchHref("/employee/candidates")).toBe(true);
    expect(shouldPrefetchHref("/employee/tasks")).toBe(true);
    expect(shouldPrefetchHref("/employee/messages")).toBe(true);
  });

  it("allows priority candidate routes", () => {
    expect(shouldPrefetchHref("/candidate")).toBe(true);
    expect(shouldPrefetchHref("/candidate/applications")).toBe(true);
    expect(shouldPrefetchHref("/candidate/messages")).toBe(true);
  });

  it("does not prefetch deep dossiers or external URLs", () => {
    expect(shouldPrefetchHref("/employee/applications/abc")).toBe(false);
    expect(shouldPrefetchHref("https://example.com")).toBe(false);
    expect(shouldPrefetchHref("#section")).toBe(false);
    expect(shouldPrefetchHref("/admin/settings")).toBe(false);
  });
});
