import { describe, expect, it } from "vitest";
import {
  buildCandidateActivationEmailHtml,
  buildCandidateActivationEmailText,
  buildCandidateWelcomeEmailSubject,
  buildCandidateResentEmailSubject,
} from "@/lib/email/templates/candidateWelcomeActivation";

describe("Candidate Welcome & Activation Email Template (Career Button Phase 3C)", () => {
  const activationUrl =
    "https://portal.careerbutton.in/auth/activate?token=a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890";

  describe("1. HTML Template Branding & Identity", () => {
    it("renders official Career Button branding and colors for welcome invitation", () => {
      const html = buildCandidateActivationEmailHtml({
        firstName: "Jordan",
        lastName: "Candidate",
        email: "jordan@example.com",
        activationUrl,
        organizationName: "Citrux Technologies",
        assignedSpecialistName: "Sarah Connor",
        variant: "welcome",
      });

      // 1. Brand Header: Career Button & CB monogram
      expect(html).toContain("Career Button");
      expect(html).toContain("Candidate Portal");
      expect(html).toContain("CB");

      // 2. Headings & Welcome Copy
      expect(html).toContain("Welcome to Career Button");
      expect(html).toContain("Candidate Invitation");
      expect(html).toContain("Jordan");
      expect(html).toContain("jordan@example.com");
      expect(html).toContain("Citrux Technologies");
      expect(html).toContain("Sarah Connor");

      // 3. CTA & Activation URL
      expect(html).toContain("Activate candidate account →");
      expect(html).toContain(`href="${activationUrl}"`);
      expect(html).toContain("expires in 48 hours");

      // 4. Security Notice
      expect(html).toContain("Security");
      expect(html).toContain("unique to you and expires in 48 hours");

      // 5. Support Block & Footer
      expect(html).toContain("https://wa.me/919110543176");
      expect(html).toContain("+91 91105 43176");
      expect(html).toContain("WhatsApp Support");
      expect(html).toContain("support@careerbutton.in");
      expect(html).toContain("temporarily undergoing activation");
      expect(html).toContain("Career Button");
      expect(html).toContain("All rights reserved");

      // 6. Strict Exclusion of obsolete OOS references in candidate-facing output
      expect(html).not.toContain("Operations OS");
      expect(html).not.toContain("Operations Operating System");
      expect(html).not.toMatch(/\bOOS\b/);
      expect(html).not.toContain("Citrux Operations OS");
    });

    it("renders official Career Button branding for resent invitation", () => {
      const html = buildCandidateActivationEmailHtml({
        firstName: "Jordan",
        email: "jordan@example.com",
        activationUrl,
        variant: "resent",
      });

      expect(html).toContain("Career Button");
      expect(html).toContain("Activate your Candidate Account");
      expect(html).toContain("Candidate Activation");
      expect(html).toContain("has resent your secure activation link");
      expect(html).toContain(`href="${activationUrl}"`);
      expect(html).not.toContain("Operations OS");
    });

    it("escapes malicious dynamic input to prevent HTML injection", () => {
      const html = buildCandidateActivationEmailHtml({
        firstName: `<script>alert("xss")</script>`,
        lastName: `Candidate" onfocus="alert(1)`,
        email: `jordan@example.com`,
        organizationName: `Bad <img src=x onerror=alert(2)> Org`,
        assignedSpecialistName: `<b>Specialist</b>`,
        activationUrl,
      });

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;img");
      expect(html).not.toContain("<b>Specialist</b>");
      expect(html).toContain("&lt;b&gt;Specialist&lt;/b&gt;");
    });
  });

  describe("2. Plaintext Template Branding & Identity", () => {
    it("renders clean plaintext with Career Button signature and no obsolete OOS references", () => {
      const text = buildCandidateActivationEmailText({
        firstName: "Jordan",
        email: "jordan@example.com",
        activationUrl,
        organizationName: "Citrux Technologies",
        assignedSpecialistName: "Sarah Connor",
        variant: "welcome",
      });

      expect(text).toContain("Welcome to Career Button");
      expect(text).toContain("Career Button candidate portal");
      expect(text).toContain(activationUrl);
      expect(text).toContain("48 hours");
      expect(text).toContain("Career Button");
      expect(text).toContain("Candidate Portal");
      expect(text).toContain("https://wa.me/919110543176");
      expect(text).toContain("support@careerbutton.in");
      expect(text).toContain("temporarily undergoing activation");

      // Obsolete branding must not appear
      expect(text).not.toContain("Citrux Operations OS");
      expect(text).not.toContain("Candidate Experience Network");
      expect(text).not.toContain("Operations OS");
      expect(text).not.toMatch(/\bOOS\b/);
    });

    it("renders resent variant plaintext cleanly", () => {
      const text = buildCandidateActivationEmailText({
        firstName: "Jordan",
        email: "jordan@example.com",
        activationUrl,
        variant: "resent",
      });

      expect(text).toContain("Activate your Career Button candidate account");
      expect(text).toContain("has been resent");
      expect(text).toContain(activationUrl);
      expect(text).toContain("Career Button");
      expect(text).not.toContain("Operations OS");
    });
  });

  describe("3. Email Subject Consistency", () => {
    it("uses Career Button branding in welcome and resent subject lines", () => {
      const welcomeSubject = buildCandidateWelcomeEmailSubject();
      expect(welcomeSubject).toBe(
        "Career Button — Welcome to the Candidate Portal — Activate your account"
      );
      expect(welcomeSubject).toMatch(/^Career Button —/);
      expect(welcomeSubject).not.toMatch(/^OOS —/);

      const resentSubject = buildCandidateResentEmailSubject();
      expect(resentSubject).toBe(
        "Career Button — Activate your candidate portal account (resent)"
      );
      expect(resentSubject).toMatch(/^Career Button —/);
      expect(resentSubject).not.toMatch(/^OOS —/);
    });
  });
});
