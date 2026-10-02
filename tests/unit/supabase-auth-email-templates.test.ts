import { describe, expect, it } from "vitest";
import {
  REQUIRED_TEMPLATE_VARIABLES,
  SUPABASE_AUTH_EMAIL_SUBJECTS,
  buildConfirmationEmailHtml,
  buildEmailChangeEmailHtml,
  buildInviteEmailHtml,
  buildMagicLinkEmailHtml,
  buildReauthenticationEmailHtml,
  buildRecoveryEmailHtml,
  buildSupabaseAuthMailerConfigPayload,
} from "@/lib/email/supabase-auth/templates";

describe("Supabase Auth OOS email templates", () => {
  it("uses OOS-branded recovery subject and preserves ConfirmationURL", () => {
    expect(SUPABASE_AUTH_EMAIL_SUBJECTS.recovery).toBe("Reset your OOS password");
    const html = buildRecoveryEmailHtml();
    expect(html).toContain("Operations OS");
    expect(html).toContain("{{ .ConfirmationURL }}");
    expect(html).toContain('href="{{ .ConfirmationURL }}"');
    expect(html).toContain("Reset your password");
    expect(html).toContain("safely ignore");
    expect(html).not.toContain("noreply@mail.app.supabase.io");
  });

  it("preserves required variables across auth templates", () => {
    const builders: Record<string, () => string> = {
      recovery: buildRecoveryEmailHtml,
      confirmation: buildConfirmationEmailHtml,
      magic_link: buildMagicLinkEmailHtml,
      invite: buildInviteEmailHtml,
      email_change: buildEmailChangeEmailHtml,
      reauthentication: buildReauthenticationEmailHtml,
    };

    for (const [key, builder] of Object.entries(builders)) {
      const html = builder();
      for (const variable of REQUIRED_TEMPLATE_VARIABLES[
        key as keyof typeof REQUIRED_TEMPLATE_VARIABLES
      ]) {
        expect(html, `${key} missing ${variable}`).toContain(variable);
      }
    }
  });

  it("OTP / magic-link templates expose Token as live text", () => {
    const html = buildMagicLinkEmailHtml();
    expect(html).toContain("{{ .Token }}");
    expect(html).toContain("Verification code");
    expect(buildReauthenticationEmailHtml()).toContain("{{ .Token }}");
  });

  it("Management API payload includes SMTP-independent mailer fields only for templates", () => {
    const payload = buildSupabaseAuthMailerConfigPayload();
    expect(payload.mailer_subjects_recovery).toBe("Reset your OOS password");
    expect(String(payload.mailer_templates_recovery_content)).toContain("{{ .ConfirmationURL }}");
    expect(payload.mailer_notifications_password_changed_enabled).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/SMTP_PASS|smtp_pass|service_role/i);
  });

  it("does not embed secrets or invent recovery tokens", () => {
    const html = buildRecoveryEmailHtml();
    expect(html).not.toMatch(/eyJ[a-zA-Z0-9_-]{10,}/);
    expect(html).not.toContain("SMTP_PASS");
    expect(html).not.toContain("DATABASE_URL");
  });
});
