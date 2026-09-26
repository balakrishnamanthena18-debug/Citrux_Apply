import { describe, it, expect } from "vitest";
import {
  LoginSchema,
  CandidateSignUpSchema,
  InviteEmployeeSchema,
  UpdateMemberRoleSchema,
  DeactivateMemberSchema,
  PasswordResetRequestSchema,
  PasswordResetConfirmSchema,
} from "@/lib/validation/auth.schemas";

describe("Auth Validation Schemas (src/lib/validation/auth.schemas.ts)", () => {
  describe("LoginSchema", () => {
    it("validates correct login credentials", () => {
      const result = LoginSchema.safeParse({
        email: "user@example.com",
        password: "securePassword123!",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email formats", () => {
      const result = LoginSchema.safeParse({
        email: "not-an-email",
        password: "securePassword123!",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty password", () => {
      const result = LoginSchema.safeParse({
        email: "user@example.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CandidateSignUpSchema", () => {
    it("validates candidate registration with matching passwords", () => {
      const result = CandidateSignUpSchema.safeParse({
        email: "candidate@example.com",
        password: "Password1234!",
        confirmPassword: "Password1234!",
        fullName: "Jane Doe",
      });
      expect(result.success).toBe(true);
    });

    it("rejects password shorter than 8 characters", () => {
      const result = CandidateSignUpSchema.safeParse({
        email: "candidate@example.com",
        password: "short",
        confirmPassword: "short",
        fullName: "Jane Doe",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-matching password confirmation", () => {
      const result = CandidateSignUpSchema.safeParse({
        email: "candidate@example.com",
        password: "Password1234!",
        confirmPassword: "DifferentPassword123!",
        fullName: "Jane Doe",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("InviteEmployeeSchema", () => {
    it("accepts EMPLOYEE role invitation", () => {
      const result = InviteEmployeeSchema.safeParse({
        email: "employee@example.com",
        fullName: "John Staff",
        role: "EMPLOYEE",
      });
      expect(result.success).toBe(true);
    });

    it("accepts ADMIN role invitation", () => {
      const result = InviteEmployeeSchema.safeParse({
        email: "admin@example.com",
        fullName: "Super Admin",
        role: "ADMIN",
      });
      expect(result.success).toBe(true);
    });

    it("rejects CANDIDATE role in employee invitation", () => {
      const result = InviteEmployeeSchema.safeParse({
        email: "cand@example.com",
        fullName: "Candidate Role",
        role: "CANDIDATE",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdateMemberRoleSchema", () => {
    it("validates valid membership id and role update", () => {
      const result = UpdateMemberRoleSchema.safeParse({
        membershipId: "123e4567-e89b-12d3-a456-426614174000",
        role: "ADMIN",
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-UUID membershipId", () => {
      const result = UpdateMemberRoleSchema.safeParse({
        membershipId: "invalid-id",
        role: "ADMIN",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("DeactivateMemberSchema", () => {
    it("validates valid deactivation payload", () => {
      const result = DeactivateMemberSchema.safeParse({
        membershipId: "123e4567-e89b-12d3-a456-426614174000",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("PasswordResetRequestSchema & Confirm", () => {
    it("validates valid password reset request", () => {
      const result = PasswordResetRequestSchema.safeParse({
        email: "reset@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("validates password reset confirmation with matching passwords", () => {
      const result = PasswordResetConfirmSchema.safeParse({
        password: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      });
      expect(result.success).toBe(true);
    });

    it("rejects mismatched passwords in confirmation", () => {
      const result = PasswordResetConfirmSchema.safeParse({
        password: "NewPassword123!",
        confirmPassword: "MismatchPassword123!",
      });
      expect(result.success).toBe(false);
    });
  });
});
