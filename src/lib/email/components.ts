import { EMAIL_THEME, CAREER_BUTTON_EMAIL_THEME, statusToneStyles, type EmailStatusTone } from "./theme";
import { escapeAttr, escapeHtml } from "./render";

export type EmailBrand = "careerbutton" | "oos";

export function BrandHeader(opts?: { brand?: EmailBrand }): string {
  const isCandidate = opts?.brand === "careerbutton";
  if (isCandidate) {
    return `<tr>
  <td style="padding:28px 32px 20px;border-bottom:1px solid ${CAREER_BUTTON_EMAIL_THEME.borderSoft};background-color:${CAREER_BUTTON_EMAIL_THEME.surface};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="vertical-align:middle;padding-right:12px;">
          <div style="width:36px;height:36px;border-radius:10px;background-color:${CAREER_BUTTON_EMAIL_THEME.forestGreen};color:${CAREER_BUTTON_EMAIL_THEME.lime};font-family:${CAREER_BUTTON_EMAIL_THEME.font};font-size:12px;font-weight:700;letter-spacing:0.04em;text-align:center;line-height:36px;">
            CB
          </div>
        </td>
        <td style="vertical-align:middle;">
          <div style="font-family:${CAREER_BUTTON_EMAIL_THEME.font};font-size:15px;font-weight:700;color:${CAREER_BUTTON_EMAIL_THEME.forestGreen};line-height:1.2;">
            Career Button
          </div>
          <div style="font-family:${CAREER_BUTTON_EMAIL_THEME.font};font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:${CAREER_BUTTON_EMAIL_THEME.textMuted};margin-top:2px;">
            Candidate Portal
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }

  return `<tr>
  <td style="padding:28px 32px 20px;border-bottom:1px solid ${EMAIL_THEME.borderSoft};background-color:${EMAIL_THEME.surface};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="vertical-align:middle;padding-right:12px;">
          <div style="width:36px;height:36px;border-radius:10px;background-color:${EMAIL_THEME.deepGreen};color:${EMAIL_THEME.lime};font-family:${EMAIL_THEME.font};font-size:11px;font-weight:700;letter-spacing:0.08em;text-align:center;line-height:36px;">
            OOS
          </div>
        </td>
        <td style="vertical-align:middle;">
          <div style="font-family:${EMAIL_THEME.font};font-size:15px;font-weight:600;color:${EMAIL_THEME.deepGreen};line-height:1.2;">
            Operations OS
          </div>
          <div style="font-family:${EMAIL_THEME.font};font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_THEME.textSecondary};margin-top:2px;">
            Enterprise operations platform
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

export function Eyebrow(text: string): string {
  return `<div style="font-family:${EMAIL_THEME.font};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${EMAIL_THEME.actionGreen};margin:0 0 10px;">
    ${escapeHtml(text)}
  </div>`;
}

export function EmailTitle(text: string): string {
  return `<h1 style="margin:0 0 12px;font-family:${EMAIL_THEME.font};font-size:28px;line-height:1.25;font-weight:700;color:${EMAIL_THEME.text};">
    ${escapeHtml(text)}
  </h1>`;
}

export function EmailBody(htmlOrText: string, alreadyHtml = false): string {
  const content = alreadyHtml ? htmlOrText : escapeHtml(htmlOrText);
  return `<p style="margin:0 0 16px;font-family:${EMAIL_THEME.font};font-size:15px;line-height:1.6;color:${EMAIL_THEME.textSecondary};">
    ${content}
  </p>`;
}

export function Divider(): string {
  return `<tr>
  <td style="padding:0 32px;">
    <div style="height:1px;background-color:${EMAIL_THEME.borderSoft};line-height:1px;font-size:1px;">&nbsp;</div>
  </td>
</tr>`;
}

export function ContentRow(innerHtml: string, padding = "28px 32px"): string {
  return `<tr>
  <td style="padding:${padding};background-color:${EMAIL_THEME.surface};">
    ${innerHtml}
  </td>
</tr>`;
}

export function PrimaryButton(
  label: string,
  href: string,
  opts?: { brand?: EmailBrand }
): string {
  const isCandidate = opts?.brand === "careerbutton";
  const btnColor = isCandidate ? CAREER_BUTTON_EMAIL_THEME.forestGreen : EMAIL_THEME.deepGreen;
  const safeHref = escapeAttr(href);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
  <tr>
    <td align="left" bgcolor="${btnColor}" style="border-radius:10px;background-color:${btnColor};">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="16%" stroke="f" fillcolor="${btnColor}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">
          ${safeLabel}
        </center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${safeHref}" style="display:inline-block;min-height:48px;line-height:48px;padding:0 22px;font-family:${EMAIL_THEME.font};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;background-color:${btnColor};mso-hide:all;">
        ${safeLabel}
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

export function SecondaryButton(label: string, href: string): string {
  return `<a href="${escapeAttr(href)}" style="display:inline-block;font-family:${EMAIL_THEME.font};font-size:14px;font-weight:600;color:${EMAIL_THEME.deepGreen};text-decoration:underline;">
    ${escapeHtml(label)}
  </a>`;
}

export type MetadataItem = { label: string; value: string };

export function MetadataRow(items: MetadataItem[]): string {
  const rows = items
    .map(
      (item) => `<tr>
      <td style="padding:0 0 12px 0;vertical-align:top;">
        <div style="font-family:${EMAIL_THEME.font};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${EMAIL_THEME.textMuted};margin-bottom:4px;">
          ${escapeHtml(item.label)}
        </div>
        <div style="font-family:${EMAIL_THEME.font};font-size:15px;font-weight:600;color:${EMAIL_THEME.text};line-height:1.4;">
          ${escapeHtml(item.value)}
        </div>
      </td>
    </tr>`
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">
  ${rows}
</table>`;
}

export function InformationCard(opts: {
  title?: string;
  bodyHtml: string;
}): string {
  const title = opts.title
    ? `<div style="font-family:${EMAIL_THEME.font};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${EMAIL_THEME.textMuted};margin:0 0 12px;">
        ${escapeHtml(opts.title)}
      </div>`
    : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
  <tr>
    <td style="padding:18px 18px;border:1px solid ${EMAIL_THEME.border};border-radius:12px;background-color:${EMAIL_THEME.surfaceMuted};">
      ${title}
      ${opts.bodyHtml}
    </td>
  </tr>
</table>`;
}

export function IdentityCard(opts: {
  name: string;
  meta?: string;
  detail?: string;
}): string {
  return InformationCard({
    title: "Identity",
    bodyHtml: `
      <div style="font-family:${EMAIL_THEME.font};font-size:17px;font-weight:700;color:${EMAIL_THEME.text};margin:0 0 4px;">
        ${escapeHtml(opts.name)}
      </div>
      ${
        opts.meta
          ? `<div style="font-family:${EMAIL_THEME.font};font-size:14px;color:${EMAIL_THEME.textSecondary};margin:0 0 2px;">
              ${escapeHtml(opts.meta)}
            </div>`
          : ""
      }
      ${
        opts.detail
          ? `<div style="font-family:${EMAIL_THEME.font};font-size:13px;color:${EMAIL_THEME.textMuted};">
              ${escapeHtml(opts.detail)}
            </div>`
          : ""
      }
    `,
  });
}

export function StatusBadge(label: string, tone: EmailStatusTone = "neutral"): string {
  const styles = statusToneStyles(tone);
  return `<span style="display:inline-block;padding:5px 10px;border-radius:999px;border:1px solid ${styles.border};background-color:${styles.bg};font-family:${EMAIL_THEME.font};font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${styles.text};">
    ${escapeHtml(label)}
  </span>`;
}

export function ApplicationSummary(opts: {
  jobTitle: string;
  company: string;
  location?: string | null;
  statusLabel: string;
  statusTone?: EmailStatusTone;
  submittedLabel?: string;
}): string {
  return InformationCard({
    title: "Application",
    bodyHtml: `
      <div style="font-family:${EMAIL_THEME.font};font-size:18px;font-weight:700;color:${EMAIL_THEME.text};margin:0 0 6px;">
        ${escapeHtml(opts.jobTitle)}
      </div>
      <div style="font-family:${EMAIL_THEME.font};font-size:14px;color:${EMAIL_THEME.textSecondary};margin:0 0 14px;">
        ${escapeHtml(opts.company)}${opts.location ? ` · ${escapeHtml(opts.location)}` : ""}
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:0 12px 0 0;vertical-align:top;">
            <div style="font-family:${EMAIL_THEME.font};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${EMAIL_THEME.textMuted};margin-bottom:6px;">Status</div>
            ${StatusBadge(opts.statusLabel, opts.statusTone ?? "success")}
          </td>
          ${
            opts.submittedLabel
              ? `<td style="padding:0;vertical-align:top;">
                  <div style="font-family:${EMAIL_THEME.font};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${EMAIL_THEME.textMuted};margin-bottom:6px;">Submitted</div>
                  <div style="font-family:${EMAIL_THEME.font};font-size:14px;font-weight:600;color:${EMAIL_THEME.text};">${escapeHtml(opts.submittedLabel)}</div>
                </td>`
              : ""
          }
        </tr>
      </table>
    `,
  });
}

export function CandidateSummary(opts: {
  name: string;
  email?: string | null;
  meta?: string | null;
}): string {
  return InformationCard({
    title: "Candidate",
    bodyHtml: `
      <div style="font-family:${EMAIL_THEME.font};font-size:16px;font-weight:700;color:${EMAIL_THEME.text};margin:0 0 4px;">
        ${escapeHtml(opts.name)}
      </div>
      ${
        opts.email
          ? `<div style="font-family:${EMAIL_THEME.font};font-size:13px;color:${EMAIL_THEME.textSecondary};">${escapeHtml(opts.email)}</div>`
          : ""
      }
      ${
        opts.meta
          ? `<div style="font-family:${EMAIL_THEME.font};font-size:13px;color:${EMAIL_THEME.textMuted};margin-top:4px;">${escapeHtml(opts.meta)}</div>`
          : ""
      }
    `,
  });
}

export function TaskSummary(opts: {
  title: string;
  items: MetadataItem[];
}): string {
  return InformationCard({
    title: "Task",
    bodyHtml: `
      <div style="font-family:${EMAIL_THEME.font};font-size:17px;font-weight:700;color:${EMAIL_THEME.text};margin:0 0 12px;">
        ${escapeHtml(opts.title)}
      </div>
      ${MetadataRow(opts.items)}
    `,
  });
}

function NoticeBlock(
  title: string,
  body: string,
  tone: EmailStatusTone
): string {
  const styles = statusToneStyles(tone);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;">
  <tr>
    <td style="padding:14px 16px;border:1px solid ${styles.border};border-left:3px solid ${styles.text};border-radius:10px;background-color:${styles.bg};">
      <div style="font-family:${EMAIL_THEME.font};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${styles.text};margin:0 0 6px;">
        ${escapeHtml(title)}
      </div>
      <div style="font-family:${EMAIL_THEME.font};font-size:13px;line-height:1.55;color:${EMAIL_THEME.text};">
        ${escapeHtml(body)}
      </div>
    </td>
  </tr>
</table>`;
}

export function SecurityNotice(body: string): string {
  return NoticeBlock("Security", body, "warning");
}

export function WarningNotice(body: string): string {
  return NoticeBlock("Action required", body, "warning");
}

export function SuccessNotice(body: string): string {
  return NoticeBlock("Confirmed", body, "success");
}

export function InfoNotice(body: string): string {
  return NoticeBlock("Note", body, "info");
}

export function SupportBlock(opts?: {
  email?: string;
  note?: string;
  brand?: EmailBrand;
}): string {
  const isCandidate = opts?.brand === "careerbutton";
  const defaultNote = isCandidate
    ? "If you need candidate assistance, connect with our support desk on WhatsApp."
    : "If you need help, reply to this email or contact your Operations OS administrator.";
  const note = opts?.note ?? defaultNote;
  const linkColor = isCandidate ? CAREER_BUTTON_EMAIL_THEME.forestGreen : EMAIL_THEME.deepGreen;

  let contact = "";
  if (isCandidate) {
    contact = `<div style="margin-top:8px;font-family:${CAREER_BUTTON_EMAIL_THEME.font};font-size:13px;line-height:1.5;color:${CAREER_BUTTON_EMAIL_THEME.textSecondary};">
      <div>
        <strong>WhatsApp Support:</strong> <a href="https://wa.me/919110543176" style="color:${linkColor};font-weight:600;text-decoration:underline;">+91 91105 43176</a>
      </div>
      <div style="margin-top:4px;font-size:11px;color:${CAREER_BUTTON_EMAIL_THEME.textMuted};">
        Domain email (support@careerbutton.in) is temporarily undergoing activation — please message via WhatsApp for assistance.
      </div>
    </div>`;
  } else if (opts?.email) {
    contact = `<div style="margin-top:6px;font-family:${EMAIL_THEME.font};font-size:13px;color:${EMAIL_THEME.textSecondary};">
        <a href="mailto:${escapeAttr(opts.email)}" style="color:${linkColor};text-decoration:underline;">${escapeHtml(opts.email)}</a>
      </div>`;
  }

  return `<div style="margin:8px 0 0;">
    <div style="font-family:${EMAIL_THEME.font};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${EMAIL_THEME.textMuted};margin-bottom:6px;">
      Support
    </div>
    <div style="font-family:${EMAIL_THEME.font};font-size:13px;line-height:1.55;color:${EMAIL_THEME.textSecondary};">
      ${escapeHtml(note)}
    </div>
    ${contact}
  </div>`;
}

export function Footer(opts?: {
  brand?: EmailBrand;
  organizationName?: string | null;
}): string {
  const year = new Date().getFullYear();
  const isCandidate = opts?.brand === "careerbutton";

  if (isCandidate) {
    const org = opts?.organizationName
      ? `<div style="margin-top:6px;">In association with ${escapeHtml(opts.organizationName)}</div>`
      : "";

    return `<tr>
  <td style="padding:22px 32px 28px;border-top:1px solid ${CAREER_BUTTON_EMAIL_THEME.borderSoft};background-color:${CAREER_BUTTON_EMAIL_THEME.surfaceFooter};">
    <div style="font-family:${CAREER_BUTTON_EMAIL_THEME.font};font-size:12px;line-height:1.55;color:${CAREER_BUTTON_EMAIL_THEME.textMuted};">
      <div style="font-weight:600;color:${CAREER_BUTTON_EMAIL_THEME.textSecondary};margin-bottom:4px;">Career Button</div>
      <div>Candidate Portal · Secure transactional notice</div>
      ${org}
      <div style="margin-top:10px;">© ${year} Career Button. All rights reserved.</div>
    </div>
  </td>
</tr>`;
  }

  const org = opts?.organizationName
    ? `<div style="margin-top:6px;">Prepared for ${escapeHtml(opts.organizationName)}</div>`
    : "";

  return `<tr>
  <td style="padding:22px 32px 28px;border-top:1px solid ${EMAIL_THEME.borderSoft};background-color:${EMAIL_THEME.surfaceFooter};">
    <div style="font-family:${EMAIL_THEME.font};font-size:12px;line-height:1.55;color:${EMAIL_THEME.textMuted};">
      <div style="font-weight:600;color:${EMAIL_THEME.textSecondary};margin-bottom:4px;">Operations OS</div>
      <div>Enterprise operations infrastructure · Secure transactional notice</div>
      ${org}
      <div style="margin-top:10px;">© ${year} Operations OS. All rights reserved.</div>
    </div>
  </td>
</tr>`;
}

/** Fallback plain URL for clients that strip buttons. */
export function FallbackLink(
  label: string,
  href: string,
  opts?: { brand?: EmailBrand }
): string {
  const linkColor =
    opts?.brand === "careerbutton"
      ? CAREER_BUTTON_EMAIL_THEME.forestGreen
      : EMAIL_THEME.deepGreen;

  return `<p style="margin:0 0 16px;font-family:${EMAIL_THEME.font};font-size:12px;line-height:1.5;color:${EMAIL_THEME.textMuted};word-break:break-all;">
    ${escapeHtml(label)}<br />
    <a href="${escapeAttr(href)}" style="color:${linkColor};text-decoration:underline;">${escapeHtml(href)}</a>
  </p>`;
}
