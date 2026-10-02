/**
 * Application submitted email — presentation only.
 * Candidate-facing; does not expose internal notes or evidence paths.
 */

import {
  ApplicationSummary,
  BrandHeader,
  ContentRow,
  EmailBody,
  EmailTitle,
  Eyebrow,
  FallbackLink,
  Footer,
  PrimaryButton,
  SuccessNotice,
} from "@/lib/email/components";
import { renderEmailDocument } from "@/lib/email/render";

export type ApplicationSubmittedEmailParams = {
  firstName?: string | null;
  jobTitle: string;
  companyName: string;
  location?: string | null;
  isRemote?: boolean | null;
  confirmationReference?: string | null;
  applicationUrl: string;
  submittedAt?: Date | string | null;
};

function formatSubmittedLabel(value?: Date | string | null): string {
  if (!value) return new Date().toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function locationLabel(params: ApplicationSubmittedEmailParams): string | null {
  if (params.isRemote) {
    return params.location ? `${params.location} · Remote` : "Remote";
  }
  return params.location || null;
}

export function buildApplicationSubmittedEmailHtml(
  params: ApplicationSubmittedEmailParams
): string {
  const firstName = params.firstName?.trim() || "there";
  const submittedLabel = formatSubmittedLabel(params.submittedAt);
  const reference = params.confirmationReference?.trim() || "Recorded";

  const bodyRowsHtml = [
    BrandHeader(),
    ContentRow(`
      ${Eyebrow("Application update")}
      ${EmailTitle("Your application was submitted")}
      ${EmailBody(
        `Hello ${firstName}, an operational team member has submitted your application for ${params.jobTitle} at ${params.companyName} on your behalf.`
      )}
      ${ApplicationSummary({
        jobTitle: params.jobTitle,
        company: params.companyName,
        location: locationLabel(params),
        statusLabel: "Submitted",
        statusTone: "success",
        submittedLabel,
      })}
      ${SuccessNotice(`Confirmation reference: ${reference}`)}
      ${EmailBody(
        "You can review submission details and next steps in your Operations OS portal."
      )}
      ${PrimaryButton("View application →", params.applicationUrl)}
      ${FallbackLink("If the button does not work, open this link:", params.applicationUrl)}
    `),
    Footer(),
  ].join("\n");

  return renderEmailDocument({
    title: "Application submitted — Operations OS",
    preheader: `Your application to ${params.companyName} has been submitted.`,
    bodyRowsHtml,
  });
}

export function buildApplicationSubmittedEmailText(
  params: ApplicationSubmittedEmailParams
): string {
  const firstName = params.firstName?.trim() || "Candidate";
  const reference = params.confirmationReference?.trim() || "Recorded";
  return [
    "OOS — Application submitted",
    "",
    `Hello ${firstName},`,
    "",
    `An operational team member has submitted your application for ${params.jobTitle} at ${params.companyName} on your behalf.`,
    "",
    `Confirmation reference: ${reference}`,
    "",
    "View application:",
    params.applicationUrl,
    "",
    "Best regards,",
    "Operations Team",
    "Operations OS",
  ].join("\n");
}

export function buildApplicationSubmittedEmailSubject(
  jobTitle: string,
  companyName: string
): string {
  return `OOS — Application submitted: ${jobTitle} at ${companyName}`;
}
