import { describe, it, expect } from "vitest";
import {
  CreateEmployeeSchema,
  SetEmployeeStatusSchema,
  UpdateEmployeeRoleSchema,
  ReassignWorkSchema,
  ListAuditLogsSchema,
  CreatePrivacyRequestSchema,
  VerifyPrivacyRequestSchema,
  CompletePrivacyRequestSchema,
  RejectPrivacyRequestSchema,
  ListPrivacyRequestsSchema,
} from "@/lib/validation/admin-privacy.schemas";

describe("Phase 8 Admin & Privacy Validation Schemas", () => {
  describe("CreateEmployeeSchema", () => {
    it("should accept valid employee provisioning payload", () => {
      const result = CreateEmployeeSchema.safeParse({
        email: "staff@example.com",
        firstName: "Alice",
        lastName: "Smith",
        role: "EMPLOYEE",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid email or empty names", () => {
      const res1 = CreateEmployeeSchema.safeParse({
        email: "not-an-email",
        firstName: "Alice",
        lastName: "Smith",
        role: "EMPLOYEE",
      });
      expect(res1.success).toBe(false);

      const res2 = CreateEmployeeSchema.safeParse({
        email: "staff@example.com",
        firstName: "",
        lastName: "Smith",
        role: "EMPLOYEE",
      });
      expect(res2.success).toBe(false);
    });

    it("should reject invalid roles outside EMPLOYEE and ADMIN", () => {
      const result = CreateEmployeeSchema.safeParse({
        email: "staff@example.com",
        firstName: "Alice",
        lastName: "Smith",
        role: "CANDIDATE",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("SetEmployeeStatusSchema", () => {
    it("should accept valid status toggle payload", () => {
      const result = SetEmployeeStatusSchema.safeParse({
        employeeUserId: "550e8400-e29b-41d4-a716-446655440000",
        status: "ACTIVE",
      });
      expect(result.success).toBe(true);
    });

    it("should reject non-uuid employeeUserId", () => {
      const result = SetEmployeeStatusSchema.safeParse({
        employeeUserId: "invalid-uuid",
        status: "INACTIVE",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdateEmployeeRoleSchema", () => {
    it("should accept valid role update payload", () => {
      const result = UpdateEmployeeRoleSchema.safeParse({
        employeeUserId: "550e8400-e29b-41d4-a716-446655440000",
        role: "ADMIN",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("ReassignWorkSchema", () => {
    it("should accept valid work reassignment with at least one target array", () => {
      const result = ReassignWorkSchema.safeParse({
        targetEmployeeId: "550e8400-e29b-41d4-a716-446655440000",
        applicationIds: ["550e8400-e29b-41d4-a716-446655440001"],
      });
      expect(result.success).toBe(true);
    });

    it("should reject reassignment if no applications, tasks, or candidates are provided", () => {
      const result = ReassignWorkSchema.safeParse({
        targetEmployeeId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ListAuditLogsSchema", () => {
    it("should parse valid pagination and filter params", () => {
      const result = ListAuditLogsSchema.safeParse({
        page: 2,
        limit: 50,
        action: "EMPLOYEE_CREATED",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(50);
      }
    });

    it("should clamp limit to max 100", () => {
      const result = ListAuditLogsSchema.safeParse({
        limit: 150,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Privacy Schemas", () => {
    it("should validate CreatePrivacyRequestSchema", () => {
      const valid = CreatePrivacyRequestSchema.safeParse({
        requestType: "DATA_EXPORT",
        scopeDetails: "Requesting full profile export",
      });
      expect(valid.success).toBe(true);

      const invalid = CreatePrivacyRequestSchema.safeParse({
        requestType: "INVALID_TYPE",
      });
      expect(invalid.success).toBe(false);
    });

    it("should validate VerifyPrivacyRequestSchema with minimum note length", () => {
      const valid = VerifyPrivacyRequestSchema.safeParse({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        verificationNotes: "Identity verified via government ID match",
      });
      expect(valid.success).toBe(true);

      const shortNotes = VerifyPrivacyRequestSchema.safeParse({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        verificationNotes: "ok",
      });
      expect(shortNotes.success).toBe(false);
    });

    it("should validate CompletePrivacyRequestSchema and RejectPrivacyRequestSchema", () => {
      const completeRes = CompletePrivacyRequestSchema.safeParse({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        resolutionNotes: "Export bundle compiled and delivered securely.",
      });
      expect(completeRes.success).toBe(true);

      const rejectRes = RejectPrivacyRequestSchema.safeParse({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        rejectionReason: "Identity verification failed after multiple attempts.",
      });
      expect(rejectRes.success).toBe(true);
    });
  });
});
