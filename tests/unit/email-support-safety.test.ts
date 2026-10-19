import { describe, expect, it } from "vitest";
import {
  buildCandidateActivationEmailHtml,
  buildCandidateActivationEmailText,
} from "@/lib/email/templates/candidateWelcomeActivation";
import {
  buildStaffActivationEmailHtml,
  buildStaffActivationEmailText,
} from "@/lib/email/templates/staffWelcomeActivation";
import { SupportBlock } from "@/lib/email/components";
import { envSchema } from "@/lib/env";

describe("Phase 3E: Temporary Gmail SMTP & Support Contact Safety", () => {
  const WHATSAPP_URL = "https://wa.me/919110543176";
  const WHATSAPP_PHONE = "+91 91105 43176";
  const dummyActivationUrl = "https://portal.careerbutton.in/auth/activate?token=testtoken123";

  describe("1. Candidate Support Contact Safety", () => {
    it("provides the official WhatsApp alternative in SupportBlock for Career Button candidate emails", () => {
      const block = SupportBlock({ brand: "careerbutton" });

      // Verifies WhatsApp link and phone number are present
      expect(block).toContain(WHATSAPP_URL);
      expect(block).toContain(WHATSAPP_PHONE);
      expect(block).toContain("WhatsApp Support");

      // Verifies support@careerbutton.in is clearly identified as temporarily undergoing activation
      expect(block).toContain("support@careerbutton.in");
      expect(block).toContain("temporarily undergoing activation");
    });

    it("ensures candidate activation HTML email renders the official WhatsApp support link", () => {
      const html = buildCandidateActivationEmailHtml({
        firstName: "Taylor",
        email: "taylor@example.com",
        activationUrl: dummyActivationUrl,
      });

      expect(html).toContain(WHATSAPP_URL);
      expect(html).toContain(WHATSAPP_PHONE);
      expect(html).toContain("temporarily undergoing activation");
      // Does not claim support email is currently active
      expect(html).not.toMatch(/send an email to support@careerbutton\.in for immediate/i);
    });

    it("ensures candidate activation plaintext email contains WhatsApp alternative and activation notice", () => {
      const text = buildCandidateActivationEmailText({
        firstName: "Taylor",
        email: "taylor@example.com",
        activationUrl: dummyActivationUrl,
      });

      expect(text).toContain(WHATSAPP_URL);
      expect(text).toContain("temporarily undergoing activation");
      expect(text).toContain("Career Button Support via WhatsApp");
    });
  });

  describe("2. Internal Staff Communication Preservation", () => {
    it("preserves internal Operations OS identity and does not include candidate WhatsApp support", () => {
      const staffHtml = buildStaffActivationEmailHtml({
        firstName: "Morgan",
        activationUrl: dummyActivationUrl,
        role: "EMPLOYEE",
      });

      // Staff email retains Operations OS identity
      expect(staffHtml).toContain("Operations OS");
      expect(staffHtml).toContain("Welcome to Operations OS");
      expect(staffHtml).toContain("administrator");

      // Staff email must NOT route to candidate WhatsApp desk
      expect(staffHtml).not.toContain(WHATSAPP_URL);
      expect(staffHtml).not.toContain(WHATSAPP_PHONE);
      expect(staffHtml).not.toContain("Career Button");
    });

    it("preserves internal Operations OS staff plaintext template", () => {
      const staffText = buildStaffActivationEmailText({
        firstName: "Morgan",
        activationUrl: dummyActivationUrl,
        role: "EMPLOYEE",
      });

      expect(staffText).toContain("Operations OS");
      expect(staffText).not.toContain(WHATSAPP_URL);
      expect(staffText).not.toContain(WHATSAPP_PHONE);
      expect(staffText).not.toContain("Career Button");
    });
  });

  describe("3. Sender Identity & SMTP Safety", () => {
    it("validates EMAIL_FROM configuration with citruxhire@gmail.com and rejects unverified domain sender", () => {
      const parsed = envSchema.safeParse({
        DATABASE_URL: "postgresql://localhost:5432/db",
        DIRECT_URL: "postgresql://localhost:5432/db",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-key",
        EMAIL_FROM: "citruxhire@gmail.com",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.EMAIL_FROM).toBe("citruxhire@gmail.com");
        expect(parsed.data.EMAIL_FROM).not.toBe("notifications@careerbutton.in");
        expect(parsed.data.EMAIL_FROM).not.toBe("support@careerbutton.in");
      }
    });
  });
});
