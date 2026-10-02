/**
 * OOS transactional email visual theme.
 * Presentation only — no delivery or auth logic.
 */

export const EMAIL_THEME = {
  deepGreen: "#0B3B2C",
  actionGreen: "#12A150",
  lime: "#C6F432",
  canvas: "#F5F7F6",
  surface: "#FFFFFF",
  surfaceMuted: "#F7F9F8",
  surfaceFooter: "#FCFDFC",
  text: "#10201A",
  textSecondary: "#66756E",
  textMuted: "#94A3B8",
  border: "#DDE5E1",
  borderSoft: "#EDF1EF",
  successBg: "#ECFDF3",
  successText: "#166534",
  successBorder: "#BBF7D0",
  warningBg: "#FFFBEB",
  warningText: "#92400E",
  warningBorder: "#FDE68A",
  errorBg: "#FEF2F2",
  errorText: "#991B1B",
  errorBorder: "#FECACA",
  infoBg: "#EFF6FF",
  infoText: "#1E3A8A",
  infoBorder: "#BFDBFE",
  font: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  maxWidth: 640,
} as const;

export type EmailStatusTone = "success" | "warning" | "error" | "info" | "neutral";

export function statusToneStyles(tone: EmailStatusTone): {
  bg: string;
  text: string;
  border: string;
} {
  switch (tone) {
    case "success":
      return {
        bg: EMAIL_THEME.successBg,
        text: EMAIL_THEME.successText,
        border: EMAIL_THEME.successBorder,
      };
    case "warning":
      return {
        bg: EMAIL_THEME.warningBg,
        text: EMAIL_THEME.warningText,
        border: EMAIL_THEME.warningBorder,
      };
    case "error":
      return {
        bg: EMAIL_THEME.errorBg,
        text: EMAIL_THEME.errorText,
        border: EMAIL_THEME.errorBorder,
      };
    case "info":
      return {
        bg: EMAIL_THEME.infoBg,
        text: EMAIL_THEME.infoText,
        border: EMAIL_THEME.infoBorder,
      };
    default:
      return {
        bg: EMAIL_THEME.surfaceMuted,
        text: EMAIL_THEME.textSecondary,
        border: EMAIL_THEME.border,
      };
  }
}
