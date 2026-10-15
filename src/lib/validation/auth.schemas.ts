import { z } from "zod";

export const GENERIC_AUTH_VALIDATION_ERROR =
  "Invalid input provided. Please verify your details and try again.";
export const GENERIC_LOGIN_VALIDATION_ERROR =
  "Invalid input provided. Please check your credentials and try again.";
export const GENERIC_SIGNUP_VALIDATION_ERROR =
  "Invalid input provided. Please review your registration details and try again.";

export function getGenericValidationError(context: "login" | "signup" | "auth" = "auth"): string {
  switch (context) {
    case "login":
      return GENERIC_LOGIN_VALIDATION_ERROR;
    case "signup":
      return GENERIC_SIGNUP_VALIDATION_ERROR;
    default:
      return GENERIC_AUTH_VALIDATION_ERROR;
  }
}

/**
 * Strict email validation:
 * - Normalizes via trim and lowercase (standard email normalization)
 * - Validates length (3 to 254 characters)
 * - Rejects any HTML tags, angle brackets, script fragments, or whitespace
 * - NEVER silently mutates the email address
 */
export const emailField = z
  .string({ required_error: "Email is required" })
  .trim()
  .toLowerCase()
  .min(3, "Email must be at least 3 characters")
  .max(254, "Email must not exceed 254 characters")
  .email("Please provide a valid email address")
  .refine((val) => !/[<>"'`\\;\s]/.test(val), {
    message: "Email contains invalid characters",
  });

/**
 * Password validation:
 * - Validates type (string) and length (8 to 128 characters)
 * - Rejects null bytes (\0)
 * - CRITICAL SECURITY INVARIANT: NEVER transforms, strips, or mutates the password string.
 *   The exact string entered by the user is passed directly to Supabase Auth.
 */
export const passwordField = z
  .string({ required_error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .refine((val) => !val.includes("\0"), {
    message: "Password cannot contain null bytes",
  });

/**
 * Username validation:
 * - Validates length (3 to 50 characters)
 * - Restricts characters strictly to alphanumeric, underscores, hyphens, and periods
 * - Rejects invalid characters without silent stripping
 */
export const usernameField = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(50, "Username must not exceed 50 characters")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Username may only contain alphanumeric characters, underscores, hyphens, and periods"
  );

// Unicode letters (\p{L}), marks (\p{M}), apostrophes (' ’), hyphens (-), periods (.), spaces
const SAFE_INTERNATIONAL_NAME_REGEX = /^[\p{L}\p{M}'’\-\.\s]+$/u;

export const displayNameField = z
  .string()
  .trim()
  .min(2, "Display name must be at least 2 characters")
  .max(100, "Display name must not exceed 100 characters")
  .regex(SAFE_INTERNATIONAL_NAME_REGEX, "Display name contains invalid characters")
  .refine((val) => !/[<>]/.test(val), {
    message: "HTML tags are not permitted",
  });

export const firstNameField = z
  .string({ required_error: "First name is required" })
  .trim()
  .min(1, "First name is required")
  .max(100, "First name must not exceed 100 characters")
  .regex(SAFE_INTERNATIONAL_NAME_REGEX, "First name contains invalid characters")
  .refine((val) => !/[<>]/.test(val), {
    message: "HTML tags are not permitted",
  });

export const lastNameField = z
  .string({ required_error: "Last name is required" })
  .trim()
  .min(1, "Last name is required")
  .max(100, "Last name must not exceed 100 characters")
  .regex(SAFE_INTERNATIONAL_NAME_REGEX, "Last name contains invalid characters")
  .refine((val) => !/[<>]/.test(val), {
    message: "HTML tags are not permitted",
  });

/** Stronger policy for password reset / staff activation (not login). */
const strongPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character")
  .refine((val) => !val.includes("\0"), {
    message: "Password cannot contain null bytes",
  });

export const LoginSchema = z.object({
  email: emailField,
  password: passwordField,
  username: usernameField.optional(),
});

export const CandidateRegisterSchema = z.object({
  email: emailField,
  password: passwordField,
  username: usernameField.optional(),
  displayName: displayNameField.optional(),
  firstName: firstNameField,
  lastName: lastNameField,
});

export const CandidateSignUpSchema = z.object({
  email: emailField,
  password: passwordField,
  confirmPassword: passwordField.optional(),
  username: usernameField.optional(),
  displayName: displayNameField.optional(),
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(200, "Full name must not exceed 200 characters")
    .regex(SAFE_INTERNATIONAL_NAME_REGEX, "Full name contains invalid characters")
    .refine((val) => !/[<>]/.test(val), {
      message: "HTML tags are not permitted",
    })
    .optional(),
  firstName: firstNameField.optional(),
  lastName: lastNameField.optional(),
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

export const ResendVerificationEmailSchema = z.object({
  email: emailField,
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
export type ResendVerificationEmailInput = z.infer<typeof ResendVerificationEmailSchema>;

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