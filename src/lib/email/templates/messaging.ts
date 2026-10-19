/**
 * Candidate ↔ staff messaging email templates — presentation only.
 * Role-aware: renders Career Button branding for candidate recipients,
 * and preserves Operations OS branding for internal staff recipients.
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
  PrimaryButton,
  SupportBlock,
} from "@/lib/email/components";
import { escapeHtml, renderEmailDocument } from "@/lib/email/render";
import { EMAIL_THEME } from "@/lib/email/theme";

export type MessageEmailParams = {
  subject: string;
  messageBody: string;
  senderName?: string | null;
  conversationUrl: string;
  recipientIsCandidate?: boolean;
};

function truncatePreview(text: string, max = 480): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function messageQuoteCard(messageBody: string): string {
  const preview = escapeHtml(truncatePreview(messageBody));
  return InformationCard({
    title: "Message",
    bodyHtml: `<div style="font-family:${EMAIL_THEME.font};font-size:15px;line-height:1.65;color:${EMAIL_THEME.text};white-space:pre-wrap;">${preview}</div>`,
  });
}

export function buildNewConversationEmailHtml(params: MessageEmailParams): string {
  const isCandidate = Boolean(params.recipientIsCandidate);
  const brand = isCandidate ? "careerbutton" : "oos";
  const fromLabel = params.senderName?.trim() || (isCandidate ? "your Career Button team" : "a candidate");
  const title = "You have a new message";
  const intro = `A new conversation was started regarding “${params.subject}”.`;

  const bodyRowsHtml = [
    BrandHeader({ brand }),
    ContentRow(`
      ${Eyebrow("Message")}
      ${EmailTitle(title)}
      ${EmailBody(intro)}
      ${EmailBody(`From: ${fromLabel}`)}
      ${InformationCard({
        title: "Regarding",
        bodyHtml: `<div style="font-family:${EMAIL_THEME.font};font-size:16px;font-weight:700;color:${EMAIL_THEME.text};">${escapeHtml(params.subject)}</div>`,
      })}
      ${messageQuoteCard(params.messageBody)}
      ${PrimaryButton("Open conversation →", params.conversationUrl, { brand })}
      ${FallbackLink("If the button does not work, open this link:", params.conversationUrl, { brand })}
      ${SupportBlock({ brand })}
    `),
    Footer({ brand }),
  ].join("\n");

  return renderEmailDocument({
    title: isCandidate ? "New message — Career Button" : "New message — Operations OS",
    preheader: `New message regarding ${params.subject}`,
    bodyRowsHtml,
  });
}

export function buildNewConversationEmailText(params: MessageEmailParams): string {
  const isCandidate = Boolean(params.recipientIsCandidate);
  const fromLabel = params.senderName?.trim() || (isCandidate ? "your Career Button team" : "a candidate");
  return [
    isCandidate ? "Career Button — New message" : "OOS — New message",
    "",
    `From: ${fromLabel}`,
    `Regarding: ${params.subject}`,
    "",
    truncatePreview(params.messageBody),
    "",
    "Open conversation:",
    params.conversationUrl,
    "",
    isCandidate ? "Career Button" : "Operations OS",
  ].join("\n");
}

export function buildNewConversationEmailSubject(
  conversationSubject: string,
  recipientIsCandidate?: boolean
): string {
  const prefix = recipientIsCandidate ? "Career Button" : "OOS";
  return `${prefix} — New message: ${conversationSubject || "Conversation"}`;
}

export function buildNewMessageEmailHtml(params: MessageEmailParams): string {
  const isCandidate = Boolean(params.recipientIsCandidate);
  const brand = isCandidate ? "careerbutton" : "oos";
  const fromLabel = params.senderName?.trim() || (isCandidate ? "your Career Button team" : "a candidate");
  const title = "New reply in your conversation";
  const intro = `You received a new reply in “${params.subject}”.`;

  const bodyRowsHtml = [
    BrandHeader({ brand }),
    ContentRow(`
      ${Eyebrow("Message reply")}
      ${EmailTitle(title)}
      ${EmailBody(intro)}
      ${EmailBody(`From: ${fromLabel}`)}
      ${InformationCard({
        title: "Conversation",
        bodyHtml: `<div style="font-family:${EMAIL_THEME.font};font-size:16px;font-weight:700;color:${EMAIL_THEME.text};">${escapeHtml(params.subject)}</div>`,
      })}
      ${messageQuoteCard(params.messageBody)}
      ${PrimaryButton("Open conversation →", params.conversationUrl, { brand })}
      ${FallbackLink("If the button does not work, open this link:", params.conversationUrl, { brand })}
      ${SupportBlock({ brand })}
    `),
    Footer({ brand }),
  ].join("\n");

  return renderEmailDocument({
    title: isCandidate ? "New reply — Career Button" : "New reply — Operations OS",
    preheader: `New reply in ${params.subject}`,
    bodyRowsHtml,
  });
}

export function buildNewMessageEmailText(params: MessageEmailParams): string {
  const isCandidate = Boolean(params.recipientIsCandidate);
  const fromLabel = params.senderName?.trim() || (isCandidate ? "your Career Button team" : "a candidate");
  return [
    isCandidate ? "Career Button — Reply" : "OOS — Reply",
    "",
    `From: ${fromLabel}`,
    `Regarding: ${params.subject}`,
    "",
    truncatePreview(params.messageBody),
    "",
    "Open conversation:",
    params.conversationUrl,
    "",
    isCandidate ? "Career Button" : "Operations OS",
  ].join("\n");
}

export function buildNewMessageEmailSubject(
  conversationSubject: string,
  recipientIsCandidate?: boolean
): string {
  const prefix = recipientIsCandidate ? "Career Button" : "OOS";
  return `${prefix} — New reply: ${conversationSubject || "Conversation"}`;
}
