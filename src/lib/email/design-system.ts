/**
 * Shared OOS transactional email design system.
 * Presentation primitives only — no delivery, auth, or token logic.
 */

export { EMAIL_THEME, statusToneStyles } from "./theme";
export type { EmailStatusTone } from "./theme";
export { escapeHtml, escapeAttr, renderPreheader, renderEmailDocument } from "./render";
export type { EmailDocumentParts } from "./render";
export * from "./components";
