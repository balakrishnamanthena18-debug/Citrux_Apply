import { describe, it, expect, vi } from "vitest";
import {
  passwordField,
  strongPasswordField,
  evaluatePasswordStrength,
  LoginSchema,
  CandidateRegisterSchema,
  ResetPasswordSchema,
  ActivateStaffAccountSchema,
} from "@/lib/validation/auth.schemas";
import { isSensitiveKey, sanitizeObject } from "@/lib/utils/sanitization";
import { logger, sanitizeObject as loggerSanitizeObject } from "@/lib/logger";

describe("Password Security Hardening — Zero-Regression Verification", () => {
  describe("1. Password Integrity & Preservation (Zero Mutation Invariant)", () => {
    it("never alters, strips, or mutates complex passwords containing symbols, quotes, spaces, or markup", () => {
      const complexPassphrases = [
        "P@ssword 123! With Spaces",
        "P@ss<script>alert('xss')</script>123!",
        'P@ss"DoubleQuote"123!',
        "P@ss'SingleQuote'123!",
        "P@ss\\Backslash\\123!",
        "P@ss{Braces}[Brackets](Parens)123!",
        "P@ss&Ampersand|Pipe^Caret~Tilde123!",
        "P@ss;Semicolon:Colon,Comma.Dot123!",
        "Correct-Horse-Battery-Staple-2026!#$%",
      ];

      for (const pass of complexPassphrases) {
        const parsed = passwordField.safeParse(pass);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data).toBe(pass); // Exact identity match
        }
      }
    });

    it("rejects passwords containing null bytes to prevent database driver scan errors", () => {
      const nullBytePassword = "ValidPassword123!\0";
      const parsed = passwordField.safeParse(nullBytePassword);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toBe("Password cannot contain null bytes");
      }
    });

    it("enforces length bounds (8 to 128 characters) on standard passwordField", () => {
      expect(passwordField.safeParse("short7!").success).toBe(false);
      expect(passwordField.safeParse("12345678").success).toBe(true);
      expect(passwordField.safeParse("a".repeat(128)).success).toBe(true);
      expect(passwordField.safeParse("a".repeat(129)).success).toBe(false);
    });
  });

  describe("2. Strong Password Policy Enforcement (Staff Activation & Reset)", () => {
    it("enforces all complexity dimensions: uppercase, lowercase, number, special char, length bounds", () => {
      // Missing uppercase
      expect(strongPasswordField.safeParse("password123!").success).toBe(false);
      // Missing lowercase
      expect(strongPasswordField.safeParse("PASSWORD123!").success).toBe(false);
      // Missing number
      expect(strongPasswordField.safeParse("PasswordSpecial!").success).toBe(false);
      // Missing special character
      expect(strongPasswordField.safeParse("Password1234").success).toBe(false);
      // Shorter than 8 chars
      expect(strongPasswordField.safeParse("Pass1!").success).toBe(false);
      // Longer than 128 chars
      expect(strongPasswordField.safeParse("P1!" + "a".repeat(126)).success).toBe(false);

      // Valid strong password
      const valid = "ValidSecurePass123!";
      const parsed = strongPasswordField.safeParse(valid);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).toBe(valid);
      }
    });

    it("rejects null bytes in strongPasswordField", () => {
      expect(strongPasswordField.safeParse("ValidPass123!\0").success).toBe(false);
    });

    it("ResetPasswordSchema requires matching strong passwords", () => {
      const match = ResetPasswordSchema.safeParse({
        password: "ValidSecurePass123!",
        confirmPassword: "ValidSecurePass123!",
      });
      expect(match.success).toBe(true);

      const mismatch = ResetPasswordSchema.safeParse({
        password: "ValidSecurePass123!",
        confirmPassword: "DifferentPass123!",
      });
      expect(mismatch.success).toBe(false);
    });

    it("ActivateStaffAccountSchema requires valid token and matching strong passwords", () => {
      const valid = ActivateStaffAccountSchema.safeParse({
        token: "activation-token-sample-12345",
        password: "StaffSecurePassword123!",
        confirmPassword: "StaffSecurePassword123!",
      });
      expect(valid.success).toBe(true);

      const invalidPassword = ActivateStaffAccountSchema.safeParse({
        token: "activation-token-sample-12345",
        password: "weak",
        confirmPassword: "weak",
      });
      expect(invalidPassword.success).toBe(false);
    });
  });

  describe("3. evaluatePasswordStrength helper breakdown", () => {
    it("correctly identifies which criteria pass or fail", () => {
      const resultWeak = evaluatePasswordStrength("abc");
      expect(resultWeak.minLength).toBe(false);
      expect(resultWeak.lowercase).toBe(true);
      expect(resultWeak.uppercase).toBe(false);
      expect(resultWeak.number).toBe(false);
      expect(resultWeak.special).toBe(false);
      expect(resultWeak.isValid).toBe(false);

      const resultStrong = evaluatePasswordStrength("StrongPassword123!");
      expect(resultStrong.minLength).toBe(true);
      expect(resultStrong.lowercase).toBe(true);
      expect(resultStrong.uppercase).toBe(true);
      expect(resultStrong.number).toBe(true);
      expect(resultStrong.special).toBe(true);
      expect(resultStrong.isValid).toBe(true);
    });
  });

  describe("4. Credential Redaction & Log Sanitization (src/lib/utils/sanitization.ts)", () => {
    it("detects sensitive key variants via isSensitiveKey", () => {
      const sensitiveKeys = [
        "password",
        "newPassword",
        "confirmPassword",
        "userPassword",
        "currentPassword",
        "tempPassword",
        "encrypted_password",
        "raw_password",
        "passphrase",
        "token",
        "recoveryToken",
        "activationToken",
        "accessToken",
        "refreshToken",
        "otp",
        "recoveryOtp",
        "authOtp",
        "secret",
        "clientSecret",
        "secretKey",
        "credential",
        "credentials",
        "authorization",
        "cookie",
        "apiKey",
        "serviceRoleKey",
        "private_key",
        "privateKey",
        "database_url",
        "direct_url",
      ];

      for (const key of sensitiveKeys) {
        expect(isSensitiveKey(key)).toBe(true);
      }
    });

    it("preserves non-sensitive operational keys in isSensitiveKey", () => {
      const safeKeys = [
        "id",
        "userId",
        "email",
        "username",
        "firstName",
        "lastName",
        "role",
        "status",
        "action",
        "entityType",
        "timestamp",
        "ipAddress",
        "endpoint",
        "organizationId",
      ];

      for (const key of safeKeys) {
        expect(isSensitiveKey(key)).toBe(false);
      }
    });

    it("redacts compound password keys, OTPs, and tokens in flat and nested objects", () => {
      const payload = {
        username: "candidate_01",
        email: "candidate@example.com",
        password: "SuperSecretPassword123!",
        newPassword: "NewSecretPassword123!",
        confirmPassword: "NewSecretPassword123!",
        otp: "12345678",
        recoveryToken: "rec-tok-1234",
        credentials: "user-provided-credential-payload",
        nested: {
          clientSecret: "sk_live_secret",
          encrypted_password: "$2b$10$abcdefghijklmnopqrstuv",
          safeField: "safe value",
        },
        items: [
          { role: "CANDIDATE", tempPassword: "TempPass123!" },
          { token: "jwt-tok-string" },
        ],
      };

      const sanitized = sanitizeObject(payload) as Record<string, any>;

      expect(sanitized.username).toBe("candidate_01");
      expect(sanitized.email).toBe("candidate@example.com");
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.newPassword).toBe("[REDACTED]");
      expect(sanitized.confirmPassword).toBe("[REDACTED]");
      expect(sanitized.otp).toBe("[REDACTED]");
      expect(sanitized.recoveryToken).toBe("[REDACTED]");
      expect(sanitized.credentials).toBe("[REDACTED]");
      expect(sanitized.nested.clientSecret).toBe("[REDACTED]");
      expect(sanitized.nested.encrypted_password).toBe("[REDACTED]");
      expect(sanitized.nested.safeField).toBe("safe value");
      expect(sanitized.items[0].tempPassword).toBe("[REDACTED]");
      expect(sanitized.items[0].role).toBe("CANDIDATE");
      expect(sanitized.items[1].token).toBe("[REDACTED]");
    });
  });

  describe("5. Logger Redaction Hardening (src/lib/logger/index.ts)", () => {
    it("redacts compound password keys, OTPs, and credentials in logger sanitization", () => {
      const raw = {
        username: "admin_user",
        newPassword: "AdminNewPassword123!",
        otp: "87654321",
        credentials: "raw-credentials-value",
        private_key: "-----BEGIN RSA PRIVATE KEY-----...",
        safeStatus: "ACTIVE",
      };

      const sanitized = loggerSanitizeObject(raw) as Record<string, unknown>;

      expect(sanitized.username).toBe("admin_user");
      expect(sanitized.newPassword).toBe("[REDACTED]");
      expect(sanitized.otp).toBe("[REDACTED]");
      expect(sanitized.credentials).toBe("[REDACTED]");
      expect(sanitized.private_key).toBe("[REDACTED]");
      expect(sanitized.safeStatus).toBe("ACTIVE");
    });
  });
});
