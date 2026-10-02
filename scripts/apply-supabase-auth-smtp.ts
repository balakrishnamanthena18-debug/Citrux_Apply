/**
 * Mumbai project Auth SMTP + branded template applicator.
 *
 * Requires (live apply only):
 *   SUPABASE_ACCESS_TOKEN  (Management API personal access token — Owner/Admin)
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM
 *
 * Never logs SMTP_PASS or the access token.
 * Never targets Seoul. Never mutates Auth/application logic.
 *
 * Usage:
 *   npm run email:apply-supabase-auth-smtp:dry-run
 *   npm run email:apply-supabase-auth-smtp
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { buildSupabaseAuthMailerConfigPayload } from "../src/lib/email/supabase-auth/templates";

loadDotenv({ path: resolve(process.cwd(), ".env") });

/** Production Mumbai Supabase project (citrux-apply-mrgx). Do not target Seoul. */
const MUMBAI_PROJECT_REF = "vgrvijugljzlpohsbmjg";
const SEOUL_PROJECT_REF = "auzikqapcgtgqwotnldq";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function isDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

function isTemplatesOnly(): boolean {
  return process.argv.includes("--templates-only");
}

function buildSmtpPayload() {
  const host = requireEnv("SMTP_HOST");
  const portRaw = process.env.SMTP_PORT?.trim() || "587";
  // Prefer STARTTLS 587 for Supabase Auth custom SMTP (Gmail-compatible).
  const port = Number(portRaw === "465" ? "587" : portRaw);
  const user = requireEnv("SMTP_USER");
  const pass = requireEnv("SMTP_PASS");
  // Prefer explicit SMTP_ADMIN_EMAIL; otherwise EMAIL_FROM; Gmail requires From to be the
  // authenticated mailbox or an authorized Send-as alias.
  const emailFrom = (process.env.SMTP_ADMIN_EMAIL || process.env.EMAIL_FROM || "").trim();
  if (!emailFrom) {
    throw new Error("Missing EMAIL_FROM (or SMTP_ADMIN_EMAIL) for smtp_admin_email / From address");
  }

  if (!host.includes("gmail.com") && host !== "smtp.gmail.com") {
    console.warn(`[warn] SMTP_HOST is ${host}; expected smtp.gmail.com for Gmail delivery.`);
  }

  return {
    external_email_enabled: true,
    mailer_secure_email_change_enabled: true,
    smtp_host: host,
    smtp_port: String(port),
    smtp_user: user,
    smtp_pass: pass,
    smtp_admin_email: emailFrom,
    smtp_sender_name: "OOS",
  };
}

async function main() {
  const dryRun = isDryRun();
  const templatesOnly = isTemplatesOnly();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const projectRef = (process.env.SUPABASE_PROJECT_REF || MUMBAI_PROJECT_REF).trim();

  if (projectRef === SEOUL_PROJECT_REF) {
    throw new Error("Refusing to modify Seoul project. Target must be Mumbai (vgrvijugljzlpohsbmjg).");
  }
  if (projectRef !== MUMBAI_PROJECT_REF) {
    throw new Error(
      `Refusing unknown project ref "${projectRef}". Expected Mumbai ${MUMBAI_PROJECT_REF}.`
    );
  }

  const mailer = buildSupabaseAuthMailerConfigPayload();
  const smtp = templatesOnly ? null : buildSmtpPayload();
  const payload = templatesOnly ? { ...mailer } : { ...smtp!, ...mailer };

  console.log("TARGET PROJECT:");
  console.log(`Mumbai / ${projectRef}`);
  console.log("");
  console.log("SOURCE/OLD PROJECT:");
  console.log(`Seoul / ${SEOUL_PROJECT_REF} (refused — not modified)`);
  console.log("");
  console.log("ACTION:");
  console.log(
    templatesOnly
      ? "Update Supabase Auth email templates only (OTP recovery)"
      : "Configure Supabase Auth Custom SMTP + templates"
  );
  console.log("");
  console.log("NO MUTATION PERFORMED:");
  console.log(dryRun ? "true" : "false");
  console.log("");
  if (smtp) {
    console.log("PLAN DETAILS:");
    console.log(`  smtp_host: ${smtp.smtp_host}`);
    console.log(`  smtp_port: ${smtp.smtp_port}`);
    console.log(`  smtp_user: ${smtp.smtp_user}`);
    console.log(`  smtp_admin_email: ${smtp.smtp_admin_email}`);
    console.log(`  smtp_sender_name: ${smtp.smtp_sender_name}`);
    console.log(`  smtp_pass: ${smtp.smtp_pass ? "[REDACTED]" : "[MISSING]"}`);
  }
  console.log(`  mailer_template_fields: ${Object.keys(mailer).length}`);
  console.log(`  recovery_subject: ${mailer.mailer_subjects_recovery}`);
  console.log(
    `  recovery_has_token: ${String(mailer.mailer_templates_recovery_content).includes("{{ .Token }}")}`
  );
  console.log(
    `  recovery_has_confirmation_url: ${String(mailer.mailer_templates_recovery_content).includes("{{ .ConfirmationURL }}")}`
  );

  if (dryRun) {
    console.log("");
    console.log("Dry run complete. No Management API call made. No Supabase project mutated.");
    return;
  }

  if (!token) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN is required to apply Auth SMTP/templates via Management API. Create a token at https://supabase.com/dashboard/account/tokens (Owner/Admin)."
    );
  }

  const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    const safeBody = body.slice(0, 800).replace(/"smtp_pass"\s*:\s*"[^"]*"/g, '"smtp_pass":"[REDACTED]"');
    throw new Error(`Management API PATCH failed (${response.status}): ${safeBody}`);
  }

  const result = (await response.json()) as Record<string, unknown>;
  console.log("");
  console.log("APPLY RESULT: SUCCESS");
  if (!templatesOnly) {
    console.log(`  smtp_host: ${result.smtp_host ?? smtp?.smtp_host}`);
    console.log(`  smtp_port: ${result.smtp_port ?? smtp?.smtp_port}`);
    console.log(`  smtp_admin_email: ${result.smtp_admin_email ?? smtp?.smtp_admin_email}`);
    console.log(`  smtp_sender_name: ${result.smtp_sender_name ?? smtp?.smtp_sender_name}`);
  }
  console.log(`  recovery_subject: ${result.mailer_subjects_recovery ?? mailer.mailer_subjects_recovery}`);
}

main().catch((err: Error) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
