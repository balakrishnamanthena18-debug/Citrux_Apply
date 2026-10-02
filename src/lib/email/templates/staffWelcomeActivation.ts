/**
 * Staff welcome / activation email — presentation only.
 * Uses the shared OOS email design system.
 */

import {
  BrandHeader,
  ContentRow,
  EmailBody,
  EmailTitle,
  Eyebrow,
  FallbackLink,
  Footer,
  InformationCard,
  MetadataRow,
  PrimaryButton,
  SecurityNotice,
} from "@/lib/email/components";
import { renderEmailDocument } from "@/lib/email/render";

export type StaffActivationEmailParams = {
  firstName: string;
  employeeId?: string | null;
  role?: string | null;
  department?: string | null;
  activationUrl: string;
  variant?: "welcome" | "resent";
};

function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return "Employee";
  const normalized = role.trim().toUpperCase();
  if (normalized === "EMPLOYEE") return "Employee";
  if (normalized === "ADMIN") return "Administrator";
  if (normalized === "CANDIDATE") return "Candidate";
  return role;
}

/**
 * Premium enterprise HTML for staff account activation.
 * Table-based, inline CSS, email-client compatible.
 */
export function buildStaffActivationEmailHtml(params: StaffActivationEmailParams): string {
  const variant = params.variant || "welcome";
  const firstName = params.firstName || "there";
  const roleLabel = params.role ? formatRoleLabel(params.role) : null;
  const isResent = variant === "resent";

  const eyebrow = isResent ? "Activation invitation" : "Employee onboarding";
  const headline = isResent ? "Activate your employee account" : "Welcome to Operations OS";
  const intro = isResent
    ? `Hello ${firstName}, your administrator has resent your secure activation invitation.`
    : `Hello ${firstName}, your employee account has been created and is ready for secure activation.`;

  const metaItems = [
    params.employeeId ? { label: "Employee ID", value: params.employeeId } : null,
    roleLabel ? { label: "Role", value: roleLabel } : null,
    params.department || roleLabel || params.employeeId
      ? { label: "Department", value: params.department || "Operations" }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const identityCard =
    metaItems.length > 0
      ? InformationCard({
          title: "Employee profile",
          bodyHtml: `
            ${MetadataRow(metaItems)}
            <div style="font-family:Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:12px;color:#66756E;line-height:1.5;margin-top:4px;">
              Official account record for Operations OS access.
            </div>
          `,
        })
      : "";

  const bodyRowsHtml = [
    BrandHeader(),
    ContentRow(`
      ${Eyebrow(eyebrow)}
      ${EmailTitle(headline)}
      ${EmailBody(intro)}
      ${identityCard}
      ${PrimaryButton("Activate employee account →", params.activationUrl)}
      ${EmailBody("Secure activation · Link expires in 48 hours")}
      ${SecurityNotice(
        "This activation link is unique to you and expires in 48 hours. It can be used only once. If you did not expect this invitation, contact your administrator immediately."
      )}
      ${EmailBody(
        "Your account provides access to the Operations OS workspace for applications, tasks, candidates, and team communications."
      )}
      ${FallbackLink("If the button does not work, copy and paste this link into your browser:", params.activationUrl)}
    `),
    Footer(),
  ].join("\n");

  return renderEmailDocument({
    title: isResent ? "Activate your Operations OS account" : "Welcome to Operations OS",
    preheader: isResent
      ? "Your Operations OS activation link is ready. Secure activation expires in 48 hours."
      : "Your Operations OS employee account is ready. Activate within 48 hours.",
    bodyRowsHtml,
  });
}

export function buildStaffActivationEmailText(params: StaffActivationEmailParams): string {
  const variant = params.variant || "welcome";
  const firstName = params.firstName || "there";
  const lines = [
    variant === "resent" ? "Activate your Operations OS account" : "Welcome to Operations OS",
    "",
    `Hello ${firstName},`,
    "",
    variant === "resent"
      ? "Your activation invitation has been resent by your administrator."
      : "Your employee account has been created and is ready for secure activation.",
    "",
  ];

  if (params.employeeId) lines.push(`Employee ID: ${params.employeeId}`);
  if (params.role) lines.push(`Role: ${params.role}`);
  if (params.department) lines.push(`Department: ${params.department}`);
  if (params.employeeId || params.role || params.department) lines.push("");

  lines.push(
    "Activate your account:",
    params.activationUrl,
    "",
    "This single-use link expires in 48 hours.",
    "",
    "If you did not expect this invitation, contact your administrator.",
    "",
    "Operations OS",
    "Operations Operating System"
  );

  return lines.join("\n");
}

export function buildStaffWelcomeEmailSubject(): string {
  return "OOS — Welcome to Operations OS — Activate your employee account";
}

export function buildStaffResentEmailSubject(): string {
  return "OOS — Activate your employee account (resent)";
}
