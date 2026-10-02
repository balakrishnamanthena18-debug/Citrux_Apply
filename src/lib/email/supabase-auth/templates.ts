/**
 * Branded Supabase Auth email template catalog for OOS.
 * These are Go templates for Supabase Auth — not Nodemailer app templates.
 * Preserve {{ .ConfirmationURL }}, {{ .Token }}, and other official variables.
 */

import {
  authOtpBlock,
  authPrimaryButton,
  authSecurityNotice,
  buildSupabaseAuthEmailHtml,
} from "./shell";
import { EMAIL_THEME } from "@/lib/email/theme";

const FONT = EMAIL_THEME.font;
const CONFIRMATION_URL = "{{ .ConfirmationURL }}";
const TOKEN = "{{ .Token }}";
const NEW_EMAIL = "{{ .NewEmail }}";
const OLD_EMAIL = "{{ .OldEmail }}";
const EMAIL = "{{ .Email }}";
const PROVIDER = "{{ .Provider }}";
const FACTOR_TYPE = "{{ .FactorType }}";
const OLD_PHONE = "{{ .OldPhone }}";
const PHONE = "{{ .Phone }}";

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${EMAIL_THEME.textSecondary};">${text}</p>`;
}

function fallbackUrl(): string {
  return `<p style="margin:12px 0 16px;font-family:${FONT};font-size:12px;line-height:1.5;color:${EMAIL_THEME.textMuted};word-break:break-all;">If the button does not work, copy and paste this link into your browser:<br /><a href="${CONFIRMATION_URL}" style="color:${EMAIL_THEME.deepGreen};text-decoration:underline;">${CONFIRMATION_URL}</a></p>`;
}

export const SUPABASE_AUTH_EMAIL_SUBJECTS = {
  recovery: "Your OOS password reset code",
  confirmation: "Confirm your OOS email address",
  magic_link: "Your OOS verification code",
  invite: "You're invited to OOS",
  email_change: "Confirm your new OOS email address",
  reauthentication: "Your OOS verification code",
  password_changed_notification: "OOS — Your password was changed",
  email_changed_notification: "OOS — Your email address was changed",
  phone_changed_notification: "OOS — Your phone number was changed",
  identity_linked_notification: "OOS — A sign-in method was linked",
  identity_unlinked_notification: "OOS — A sign-in method was removed",
  mfa_factor_enrolled_notification: "OOS — A verification method was added",
  mfa_factor_unenrolled_notification: "OOS — A verification method was removed",
} as const;

export function buildRecoveryEmailHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "Your OOS password reset code",
    eyebrow: "Security",
    headline: "Reset your password",
    bodyHtml: [
      p("We received a request to reset the password for your Operations OS account."),
      p("Enter this verification code on the OOS password reset page to continue."),
      authOtpBlock(TOKEN),
      p("This code is temporary and can only be used once."),
      authSecurityNotice(
        "If you did not request this, you can safely ignore this email. Do not share this code with anyone."
      ),
    ].join(""),
  });
}

export function buildConfirmationEmailHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "Confirm your OOS email address",
    eyebrow: "Security",
    headline: "Confirm your email address",
    bodyHtml: [
      p("Confirm this email address to finish setting up your Operations OS account."),
      authPrimaryButton("Confirm email address →", CONFIRMATION_URL),
      fallbackUrl(),
      authSecurityNotice(
        "If you did not create an Operations OS account, you can safely ignore this email."
      ),
    ].join(""),
  });
}

export function buildMagicLinkEmailHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "Your OOS verification code",
    eyebrow: "Security",
    headline: "Your verification code",
    bodyHtml: [
      p("Use the verification code below to continue signing in to Operations OS. This code is valid for a limited time."),
      authOtpBlock(TOKEN),
      p("You can also use the secure link below if your client supports it."),
      authPrimaryButton("Open secure link →", CONFIRMATION_URL),
      fallbackUrl(),
      authSecurityNotice(
        "If you did not request this code, you can safely ignore this email."
      ),
    ].join(""),
  });
}

export function buildInviteEmailHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "You're invited to OOS",
    eyebrow: "Invitation",
    headline: "You're invited to Operations OS",
    bodyHtml: [
      p("You have been invited to create your Operations OS account. Accept the invitation below to continue."),
      authPrimaryButton("Accept invitation →", CONFIRMATION_URL),
      fallbackUrl(),
      authSecurityNotice(
        "If you were not expecting this invitation, contact your administrator before accepting."
      ),
    ].join(""),
  });
}

export function buildEmailChangeEmailHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "Confirm your new OOS email address",
    eyebrow: "Security",
    headline: "Confirm your new email address",
    bodyHtml: [
      p(`Follow the secure link below to confirm <strong style="color:${EMAIL_THEME.text};">${NEW_EMAIL}</strong> as your new Operations OS email address.`),
      authPrimaryButton("Confirm new email address →", CONFIRMATION_URL),
      fallbackUrl(),
      authSecurityNotice(
        "If you did not request this change, you can safely ignore this email and keep using your current address."
      ),
    ].join(""),
  });
}

export function buildReauthenticationEmailHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "Your OOS verification code",
    eyebrow: "Security",
    headline: "Your verification code",
    bodyHtml: [
      p("Use this code to verify a sensitive change on your Operations OS account. It expires shortly."),
      authOtpBlock(TOKEN),
      authSecurityNotice(
        "If you did not request this verification code, contact your administrator immediately."
      ),
    ].join(""),
  });
}

export function buildPasswordChangedNotificationHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "Your password was changed",
    eyebrow: "Security alert",
    headline: "Your password was changed",
    bodyHtml: [
      p("The password for your Operations OS account was recently changed."),
      authSecurityNotice(
        "If you did not make this change, reset your password immediately and contact your administrator."
      ),
    ].join(""),
  });
}

export function buildEmailChangedNotificationHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "Your email address was changed",
    eyebrow: "Security alert",
    headline: "Your email address was changed",
    bodyHtml: [
      p(`The email address for your Operations OS account was changed from <strong style="color:${EMAIL_THEME.text};">${OLD_EMAIL}</strong> to <strong style="color:${EMAIL_THEME.text};">${EMAIL}</strong>.`),
      authSecurityNotice(
        "If you did not make this change, contact your administrator immediately."
      ),
    ].join(""),
  });
}

export function buildPhoneChangedNotificationHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "Your phone number was changed",
    eyebrow: "Security alert",
    headline: "Your phone number was changed",
    bodyHtml: [
      p(`The phone number for your Operations OS account was changed from <strong style="color:${EMAIL_THEME.text};">${OLD_PHONE}</strong> to <strong style="color:${EMAIL_THEME.text};">${PHONE}</strong>.`),
      authSecurityNotice(
        "If you did not make this change, contact your administrator immediately."
      ),
    ].join(""),
  });
}

export function buildIdentityLinkedNotificationHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "A sign-in method was linked",
    eyebrow: "Security alert",
    headline: "A sign-in method was linked",
    bodyHtml: [
      p(`Your <strong style="color:${EMAIL_THEME.text};">${PROVIDER}</strong> account was linked as a sign-in method for <strong style="color:${EMAIL_THEME.text};">${EMAIL}</strong>.`),
      authSecurityNotice(
        "If you did not make this change, contact your administrator immediately."
      ),
    ].join(""),
  });
}

export function buildIdentityUnlinkedNotificationHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "A sign-in method was removed",
    eyebrow: "Security alert",
    headline: "A sign-in method was removed",
    bodyHtml: [
      p(`Your <strong style="color:${EMAIL_THEME.text};">${PROVIDER}</strong> account was removed as a sign-in method for <strong style="color:${EMAIL_THEME.text};">${EMAIL}</strong>.`),
      authSecurityNotice(
        "If you did not make this change, contact your administrator immediately."
      ),
    ].join(""),
  });
}

export function buildMfaEnrolledNotificationHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "A verification method was added",
    eyebrow: "Security alert",
    headline: "A verification method was added",
    bodyHtml: [
      p(`Sign-in verification method <strong style="color:${EMAIL_THEME.text};">${FACTOR_TYPE}</strong> was added to your Operations OS account.`),
      authSecurityNotice(
        "If you did not make this change, contact your administrator immediately."
      ),
    ].join(""),
  });
}

export function buildMfaUnenrolledNotificationHtml(): string {
  return buildSupabaseAuthEmailHtml({
    title: "A verification method was removed",
    eyebrow: "Security alert",
    headline: "A verification method was removed",
    bodyHtml: [
      p(`Sign-in verification method <strong style="color:${EMAIL_THEME.text};">${FACTOR_TYPE}</strong> was removed from your Operations OS account.`),
      authSecurityNotice(
        "If you did not make this change, contact your administrator immediately."
      ),
    ].join(""),
  });
}

/** Management API payload for Auth mailer subjects + HTML bodies + security notifications. */
export function buildSupabaseAuthMailerConfigPayload(): Record<string, string | boolean> {
  return {
    mailer_subjects_recovery: SUPABASE_AUTH_EMAIL_SUBJECTS.recovery,
    mailer_templates_recovery_content: buildRecoveryEmailHtml(),
    mailer_subjects_confirmation: SUPABASE_AUTH_EMAIL_SUBJECTS.confirmation,
    mailer_templates_confirmation_content: buildConfirmationEmailHtml(),
    mailer_subjects_magic_link: SUPABASE_AUTH_EMAIL_SUBJECTS.magic_link,
    mailer_templates_magic_link_content: buildMagicLinkEmailHtml(),
    mailer_subjects_invite: SUPABASE_AUTH_EMAIL_SUBJECTS.invite,
    mailer_templates_invite_content: buildInviteEmailHtml(),
    mailer_subjects_email_change: SUPABASE_AUTH_EMAIL_SUBJECTS.email_change,
    mailer_templates_email_change_content: buildEmailChangeEmailHtml(),
    mailer_subjects_reauthentication: SUPABASE_AUTH_EMAIL_SUBJECTS.reauthentication,
    mailer_templates_reauthentication_content: buildReauthenticationEmailHtml(),

    mailer_notifications_password_changed_enabled: true,
    mailer_subjects_password_changed_notification:
      SUPABASE_AUTH_EMAIL_SUBJECTS.password_changed_notification,
    mailer_templates_password_changed_notification_content:
      buildPasswordChangedNotificationHtml(),

    mailer_notifications_email_changed_enabled: true,
    mailer_subjects_email_changed_notification:
      SUPABASE_AUTH_EMAIL_SUBJECTS.email_changed_notification,
    mailer_templates_email_changed_notification_content:
      buildEmailChangedNotificationHtml(),

    mailer_notifications_phone_changed_enabled: true,
    mailer_subjects_phone_changed_notification:
      SUPABASE_AUTH_EMAIL_SUBJECTS.phone_changed_notification,
    mailer_templates_phone_changed_notification_content:
      buildPhoneChangedNotificationHtml(),

    mailer_notifications_identity_linked_enabled: true,
    mailer_subjects_identity_linked_notification:
      SUPABASE_AUTH_EMAIL_SUBJECTS.identity_linked_notification,
    mailer_templates_identity_linked_notification_content:
      buildIdentityLinkedNotificationHtml(),

    mailer_notifications_identity_unlinked_enabled: true,
    mailer_subjects_identity_unlinked_notification:
      SUPABASE_AUTH_EMAIL_SUBJECTS.identity_unlinked_notification,
    mailer_templates_identity_unlinked_notification_content:
      buildIdentityUnlinkedNotificationHtml(),

    mailer_notifications_mfa_factor_enrolled_enabled: true,
    mailer_subjects_mfa_factor_enrolled_notification:
      SUPABASE_AUTH_EMAIL_SUBJECTS.mfa_factor_enrolled_notification,
    mailer_templates_mfa_factor_enrolled_notification_content:
      buildMfaEnrolledNotificationHtml(),

    mailer_notifications_mfa_factor_unenrolled_enabled: true,
    mailer_subjects_mfa_factor_unenrolled_notification:
      SUPABASE_AUTH_EMAIL_SUBJECTS.mfa_factor_unenrolled_notification,
    mailer_templates_mfa_factor_unenrolled_notification_content:
      buildMfaUnenrolledNotificationHtml(),
  };
}

export const REQUIRED_TEMPLATE_VARIABLES = {
  recovery: ["{{ .Token }}"],
  confirmation: ["{{ .ConfirmationURL }}"],
  magic_link: ["{{ .ConfirmationURL }}", "{{ .Token }}"],
  invite: ["{{ .ConfirmationURL }}"],
  email_change: ["{{ .ConfirmationURL }}", "{{ .NewEmail }}"],
  reauthentication: ["{{ .Token }}"],
  password_changed_notification: [],
  email_changed_notification: ["{{ .OldEmail }}", "{{ .Email }}"],
  phone_changed_notification: ["{{ .OldPhone }}", "{{ .Phone }}"],
  identity_linked_notification: ["{{ .Provider }}", "{{ .Email }}"],
  identity_unlinked_notification: ["{{ .Provider }}", "{{ .Email }}"],
  mfa_factor_enrolled_notification: ["{{ .FactorType }}"],
  mfa_factor_unenrolled_notification: ["{{ .FactorType }}"],
} as const;
