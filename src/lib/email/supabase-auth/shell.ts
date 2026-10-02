/**
 * Shared OOS shell for Supabase Auth Go email templates.
 * Variables like {{ .ConfirmationURL }} / {{ .Token }} must remain unescaped.
 * Presentation only — no auth/token generation.
 */

import { EMAIL_THEME } from "@/lib/email/theme";

const FONT = EMAIL_THEME.font;

export function authBrandHeader(): string {
  return `<tr>
  <td style="padding:28px 32px 20px;border-bottom:1px solid ${EMAIL_THEME.borderSoft};background-color:${EMAIL_THEME.surface};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="vertical-align:middle;padding-right:12px;">
          <div style="width:36px;height:36px;border-radius:10px;background-color:${EMAIL_THEME.deepGreen};color:${EMAIL_THEME.lime};font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-align:center;line-height:36px;">OOS</div>
        </td>
        <td style="vertical-align:middle;">
          <div style="font-family:${FONT};font-size:15px;font-weight:600;color:${EMAIL_THEME.deepGreen};line-height:1.2;">Operations OS</div>
          <div style="font-family:${FONT};font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_THEME.textSecondary};margin-top:2px;">Enterprise operations platform</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

export function authFooter(): string {
  const year = new Date().getFullYear();
  return `<tr>
  <td style="padding:22px 32px 28px;border-top:1px solid ${EMAIL_THEME.borderSoft};background-color:${EMAIL_THEME.surfaceFooter};">
    <div style="font-family:${FONT};font-size:12px;line-height:1.55;color:${EMAIL_THEME.textMuted};">
      <div style="font-weight:600;color:${EMAIL_THEME.textSecondary};margin-bottom:4px;">Operations OS</div>
      <div>Enterprise operations infrastructure · Secure authentication notice</div>
      <div style="margin-top:10px;">© ${year} Operations OS. All rights reserved.</div>
    </div>
  </td>
</tr>`;
}

/** CTA that preserves a raw Go-template href expression (must not be HTML-escaped). */
export function authPrimaryButton(label: string, hrefExpression: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px;">
  <tr>
    <td align="left" bgcolor="${EMAIL_THEME.deepGreen}" style="border-radius:10px;background-color:${EMAIL_THEME.deepGreen};">
      <a href="${hrefExpression}" style="display:inline-block;min-height:48px;line-height:48px;padding:0 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;background-color:${EMAIL_THEME.deepGreen};">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

export function authSecurityNotice(body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">
  <tr>
    <td style="padding:14px 16px;border:1px solid ${EMAIL_THEME.warningBorder};border-left:3px solid ${EMAIL_THEME.warningText};border-radius:10px;background-color:${EMAIL_THEME.warningBg};">
      <div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_THEME.warningText};margin:0 0 6px;">Security</div>
      <div style="font-family:${FONT};font-size:13px;line-height:1.55;color:${EMAIL_THEME.text};">${body}</div>
    </td>
  </tr>
</table>`;
}

export function authOtpBlock(tokenExpression: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 20px;">
  <tr>
    <td align="center" style="padding:20px 16px;border:1px solid ${EMAIL_THEME.border};border-radius:12px;background-color:${EMAIL_THEME.surfaceMuted};">
      <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${EMAIL_THEME.textMuted};margin:0 0 10px;">Verification code</div>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:0.28em;color:${EMAIL_THEME.deepGreen};line-height:1.2;">
        ${tokenExpression}
      </div>
    </td>
  </tr>
</table>`;
}

export type AuthEmailShellParts = {
  title: string;
  eyebrow: string;
  headline: string;
  bodyHtml: string;
};

export function buildSupabaseAuthEmailHtml(parts: AuthEmailShellParts): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${parts.title}</title>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_THEME.canvas};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${EMAIL_THEME.canvas};margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${EMAIL_THEME.maxWidth}px;width:100%;background-color:${EMAIL_THEME.surface};border:1px solid ${EMAIL_THEME.border};border-radius:18px;overflow:hidden;">
          ${authBrandHeader()}
          <tr>
            <td style="padding:28px 32px;background-color:${EMAIL_THEME.surface};">
              <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${EMAIL_THEME.actionGreen};margin:0 0 10px;">${parts.eyebrow}</div>
              <h1 style="margin:0 0 12px;font-family:${FONT};font-size:28px;line-height:1.25;font-weight:700;color:${EMAIL_THEME.text};">${parts.headline}</h1>
              ${parts.bodyHtml}
            </td>
          </tr>
          ${authFooter()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
