import { EMAIL_THEME } from "./theme";

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(value: string | null | undefined): string {
  return escapeHtml(value);
}

/** Hidden preheader for inbox preview text. */
export function renderPreheader(text: string): string {
  const safe = escapeHtml(text);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${EMAIL_THEME.canvas};">
    ${safe}
    ${"&nbsp;&zwnj;".repeat(30)}
  </div>`;
}

export type EmailDocumentParts = {
  title: string;
  preheader?: string;
  bodyRowsHtml: string;
};

/**
 * Full HTML document shell with OOS canvas + centered card container.
 * bodyRowsHtml should be <tr>...</tr> fragments for the inner card table.
 */
export function renderEmailDocument(parts: EmailDocumentParts): string {
  const title = escapeHtml(parts.title);
  const preheader = parts.preheader ? renderPreheader(parts.preheader) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_THEME.canvas};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${EMAIL_THEME.canvas};margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${EMAIL_THEME.maxWidth}px;width:100%;background-color:${EMAIL_THEME.surface};border:1px solid ${EMAIL_THEME.border};border-radius:18px;overflow:hidden;">
          ${parts.bodyRowsHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
