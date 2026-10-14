/**
 * Candidate welcome / activation email template.
 * Uses the shared OOS email design system and components.
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

export type CandidateActivationEmailParams = {
  firstName: string;
  lastName?: string | null;
  email: string;
  activationUrl: string;
  organizationName?: string | null;
  assignedSpecialistName?: string | null;
  variant?: "welcome" | "resent";
};

/**
 * Premium enterprise HTML for candidate account activation.
 * Table-based, inline CSS, email-client compatible.
 */
export function buildCandidateActivationEmailHtml(
  params: CandidateActivationEmailParams
): string {
  const variant = params.variant || "welcome";
  const firstName = params.firstName || "there";
  const isResent = variant === "resent";

  const eyebrow = isResent ? "Candidate Activation" : "Candidate Invitation";
  const headline = isResent
    ? "Activate your candidate portal account"
    : "Welcome to the Candidate Portal";
  const intro = isResent
    ? `Hello ${firstName}, your administrator has resent your secure activation link to access the candidate portal.`
    : `Hello ${firstName}, you have been invited to activate your account on the candidate portal.`;

  const metaItems = [
    { label: "Account Email", value: params.email },
    params.organizationName
      ? { label: "Organization", value: params.organizationName }
      : null,
    params.assignedSpecialistName
      ? { label: "Assigned Specialist", value: params.assignedSpecialistName }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const identityCard =
    metaItems.length > 0
      ? InformationCard({
          title: "Candidate portal access",
          bodyHtml: `
            ${MetadataRow(metaItems)}
            <div style="font-family:Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:12px;color:#66756E;line-height:1.5;margin-top:6px;">
              Your portal allows you to track application progress, manage interview schedules, review offers, and collaborate with your specialist.
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
      ${PrimaryButton("Activate candidate account →", params.activationUrl)}
      ${EmailBody("Secure activation · Link expires in 48 hours")}
      ${SecurityNotice(
        "This activation link is unique to you and expires in 48 hours. It can be used only once to set your password. If you did not expect this invitation, please ignore this email or contact support."
      )}
      ${EmailBody(
        "Once activated, you can sign in anytime to monitor your pipeline status and submit required documentation."
      )}
      ${FallbackLink(
        "If the button above does not work, copy and paste this link into your browser:",
        params.activationUrl
      )}
    `),
    Footer(),
  ].join("\n");

  return renderEmailDocument({
    title: isResent
      ? "Activate your candidate portal account"
      : "Welcome to the Candidate Portal",
    preheader: isResent
      ? "Your candidate activation link is ready. Secure activation expires in 48 hours."
      : "You have been invited to activate your candidate account. Activate within 48 hours.",
    bodyRowsHtml,
  });
}

export function buildCandidateActivationEmailText(
  params: CandidateActivationEmailParams
): string {
  const variant = params.variant || "welcome";
  const firstName = params.firstName || "there";
  const lines = [
    variant === "resent"
      ? "Activate your candidate portal account"
      : "Welcome to the Candidate Portal",
    "",
    `Hello ${firstName},`,
    "",
    variant === "resent"
      ? "Your candidate activation link has been resent by your administrator."
      : "You have been invited to activate your account on the candidate portal.",
    "",
    `Account Email: ${params.email}`,
  ];

  if (params.organizationName) {
    lines.push(`Organization: ${params.organizationName}`);
  }
  if (params.assignedSpecialistName) {
    lines.push(`Assigned Specialist: ${params.assignedSpecialistName}`);
  }

  lines.push(
    "",
    "Activate your account:",
    params.activationUrl,
    "",
    "This single-use link expires in 48 hours.",
    "",
    "If you did not expect this invitation, please ignore this email.",
    "",
    "Citrux Operations OS",
    "Candidate Experience Network"
  );

  return lines.join("\n");
}

export function buildCandidateWelcomeEmailSubject(): string {
  return "OOS — Welcome to the Candidate Portal — Activate your account";
}

export function buildCandidateResentEmailSubject(): string {
  return "OOS — Activate your candidate portal account (resent)";
}
