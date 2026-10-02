import { describe, expect, it } from "vitest";
import {
  buildStaffActivationEmailHtml,
  buildStaffActivationEmailText,
  buildStaffWelcomeEmailSubject,
  buildStaffResentEmailSubject,
} from "@/lib/email/templates/staffWelcomeActivation";

describe("staffWelcomeActivation email template", () => {
  const activationUrl =
    "http://localhost:3000/auth/activate?token=abc123def456securetoken";

  it("preserves activation URL and employee identity fields in HTML", () => {
    const html = buildStaffActivationEmailHtml({
      firstName: "Alice",
      employeeId: "CIT-EMP-0002",
      role: "EMPLOYEE",
      department: "Operations",
      activationUrl,
      variant: "welcome",
    });

    expect(html).toContain(`href="${activationUrl}"`);
    expect(html).toContain("CIT-EMP-0002");
    expect(html).toContain("Employee");
    expect(html).toContain("Operations");
    expect(html).toContain("Activate employee account");
    expect(html).toContain("expires in 48 hours");
    expect(html).toContain("Operations OS");
    expect(html.match(new RegExp(activationUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBeGreaterThanOrEqual(2);
  });

  it("escapes HTML in dynamic fields", () => {
    const html = buildStaffActivationEmailHtml({
      firstName: `<script>alert(1)</script>`,
      employeeId: `CIT-EMP-0002" onclick="x`,
      role: "EMPLOYEE",
      department: "Ops & Delivery",
      activationUrl,
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Ops &amp; Delivery");
  });

  it("builds plaintext with activation URL", () => {
    const text = buildStaffActivationEmailText({
      firstName: "Alice",
      employeeId: "CIT-EMP-0002",
      role: "EMPLOYEE",
      department: "Operations",
      activationUrl,
    });

    expect(text).toContain(activationUrl);
    expect(text).toContain("CIT-EMP-0002");
    expect(text).toContain("48 hours");
  });

  it("uses Operations OS subjects", () => {
    expect(buildStaffWelcomeEmailSubject()).toContain("Welcome to Operations OS");
    expect(buildStaffWelcomeEmailSubject()).toMatch(/^OOS —/);
    expect(buildStaffResentEmailSubject()).toMatch(/^OOS —/);
    expect(buildStaffResentEmailSubject().toLowerCase()).toContain("resent");
  });
});
