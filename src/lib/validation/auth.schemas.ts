import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const CandidateRegisterSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
});

export const CandidateSignUpSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
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
  email: z.string().trim().email("Please provide a valid email address"),
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
  email: z.string().trim().email("Please provide a valid email address"),
});

export const PasswordResetRequestSchema = ForgotPasswordSchema;

export const ResetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const PasswordResetConfirmSchema = ResetPasswordSchema;

export const ActivateStaffAccountSchema = z.object({
  token: z.string().trim().min(1, "Activation token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
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
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type ActivateStaffAccountInput = z.infer<typeof ActivateStaffAccountSchema>;
