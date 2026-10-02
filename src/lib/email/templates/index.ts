/**
 * OOS SMTP email template inventory (presentation layer).
 *
 * Existing OOS-controlled transactional emails:
 * 1. STAFF_WELCOME_ACTIVATION — admin create/resend employee invitation
 * 2. new_conversation — communication createConversationAction
 * 3. new_message — communication sendMessageAction
 * 4. APPLICATION_SUBMITTED — submission recordApplicationSubmissionAction
 *
 * Not OOS HTML SMTP (left unchanged):
 * - Password reset / email verification → Supabase Auth templates
 *
 * No other sendTransactionalNotification call sites exist in this repo.
 */

export * from "./staffWelcomeActivation";
export * from "./messaging";
export * from "./applicationSubmitted";
