import { z } from "zod";

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters");

/** Stronger policy for password reset / staff activation (not login). */
const strongPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: passwordField,
});

export const CandidateRegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: passwordField,
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
});

export const CandidateSignUpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: passwordField,
  confirmPassword: passwordField.optional(),
  fullName: z.string().trim().min(1).max(200).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
}).refine((data) => {
  if (data.confirmPassword !== undefined) {
    return data.password === data.confirmPassword;
  }
  return true;
}, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const EmployeeInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  firstName: z.string().trim().min(1, "First name is required").max(100).optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(100).optional(),
  fullName: z.string().trim().min(1).max(200).optional(),
  role: z.enum(["EMPLOYEE", "ADMIN"]),
  organizationId: z.string().uuid("Invalid organization ID").optional(),
});

export const InviteEmployeeSchema = EmployeeInviteSchema;

export const UpdateMemberRoleSchema = z.object({
  membershipId: z.string().uuid("Invalid membership ID"),
  role: z.enum(["CANDIDATE", "EMPLOYEE", "ADMIN"]),
});

export const DeactivateMemberSchema = z.object({
  membershipId: z.string().uuid("Invalid membership ID"),
  reason: z.string().max(500).optional(),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
});

export const PasswordResetRequestSchema = ForgotPasswordSchema;

/** Supabase Auth recovery email OTP length observed in production ({{ .Token }}). */
export const RECOVERY_OTP_LENGTH = 8;

/**
 * Normalize recovery OTP input for the verify form.
 * Strips non-digits (so paste with whitespace works).
 * Returns null when the digit run would exceed RECOVERY_OTP_LENGTH —
 * callers must not silently truncate longer values.
 */
export function normalizeRecoveryOtpInput(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length > RECOVERY_OTP_LENGTH) return null;
  return digits;
}

export const VerifyRecoveryOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  token: z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{${RECOVERY_OTP_LENGTH}}$`),
      "Enter the verification code from your email"
    ),
});

export const ResetPasswordSchema = z.object({
  password: strongPasswordField,
  confirmPassword: strongPasswordField,
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const PasswordResetConfirmSchema = ResetPasswordSchema;

export const ActivateStaffAccountSchema = z.object({
  token: z.string().trim().min(1, "Activation token is required"),
  password: strongPasswordField,
  confirmPassword: strongPasswordField,
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type CandidateRegisterInput = z.infer<typeof CandidateRegisterSchema>;
export type CandidateSignUpInput = z.infer<typeof CandidateSignUpSchema>;
export type EmployeeInviteInput = z.infer<typeof EmployeeInviteSchema>;
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;
export type DeactivateMemberInput = z.infer<typeof DeactivateMemberSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type VerifyRecoveryOtpInput = z.infer<typeof VerifyRecoveryOtpSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type ActivateStaffAccountInput = z.infer<typeof ActivateStaffAccountSchema>;

export function evaluatePasswordStrength(password: string): {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
  isValid: boolean;
} {
  const minLength = password.length >= 8;
  const uppercase = /[A-Z]/.test(password);
  const lowercase = /[a-z]/.test(password);
  const number = /[0-9]/.test(password);
  const special = /[^A-Za-z0-9]/.test(password);
  return {
    minLength,
    uppercase,
    lowercase,
    number,
    special,
    isValid: minLength && uppercase && lowercase && number && special,
  };
}

export function maskEmailAddress(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf("@");
  if (at <= 0) return "***";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}