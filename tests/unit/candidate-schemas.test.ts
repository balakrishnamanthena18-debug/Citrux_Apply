import { describe, it, expect } from "vitest";
import {
  CandidateProfileSchema,
  CandidateExperienceSchema,
  CandidateEducationSchema,
  CandidateSkillSchema,
  CandidateProjectSchema,
  CandidateCertificationSchema,
  CandidateAssignmentSchema,
  CandidateVerificationSchema,
  CandidateStatusTransitionSchema,
  CandidateDocumentUploadSchema,
} from "@/lib/validation/candidate.schemas";

describe("Candidate Core Validation Schemas (tests/unit/candidate-schemas.test.ts)", () => {
  describe("CandidateProfileSchema", () => {
    it("validates a complete valid career profile payload", () => {
      const result = CandidateProfileSchema.safeParse({
        phone: "+1 (555) 123-4567",
        city: "San Francisco",
        state: "CA",
        country: "US",
        headline: "Staff Software Engineer",
        professionalSummary: "Over 8 years of experience building scalable backend architectures.",
        totalYearsExperience: 8.5,
        workAuthorization: "CITIZEN",
        requiresSponsorship: false,
        targetRoles: ["Staff Engineer", "Principal Architect"],
        targetLocations: ["San Francisco, CA", "Remote"],
        remotePreference: "FLEXIBLE",
        desiredSalaryMin: 180000,
        desiredSalaryMax: 240000,
        salaryCurrency: "USD",
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty optional fields gracefully", () => {
      const result = CandidateProfileSchema.safeParse({
        country: "US",
        workAuthorization: "CITIZEN",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("CandidateExperienceSchema", () => {
    it("validates valid experience entry with start and end dates", () => {
      const result = CandidateExperienceSchema.safeParse({
        companyName: "Acme Corp",
        jobTitle: "Software Engineer",
        location: "New York, NY",
        isCurrent: false,
        startDate: "2020-01-01",
        endDate: "2023-05-31",
        description: "Built high-throughput data pipelines.",
        achievements: ["Reduced latency by 40%"],
        technologies: ["TypeScript", "Node.js", "PostgreSQL"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid date formats", () => {
      const result = CandidateExperienceSchema.safeParse({
        companyName: "Acme Corp",
        jobTitle: "Software Engineer",
        startDate: "01/01/2020", // Not YYYY-MM-DD
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CandidateEducationSchema", () => {
    it("validates valid education entry", () => {
      const result = CandidateEducationSchema.safeParse({
        institution: "Stanford University",
        degree: "Master of Science",
        fieldOfStudy: "Computer Science",
        graduationYear: 2021,
        gpa: "3.9",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("CandidateSkillSchema", () => {
    it("validates candidate-provided skill name (minimal locked model)", () => {
      const result = CandidateSkillSchema.safeParse({
        name: "TypeScript",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty skill name", () => {
      const result = CandidateSkillSchema.safeParse({
        name: "   ",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CandidateAssignmentSchema", () => {
    it("validates valid candidate and employee IDs", () => {
      const result = CandidateAssignmentSchema.safeParse({
        candidateId: "123e4567-e89b-12d3-a456-426614174000",
        employeeId: "123e4567-e89b-12d3-a456-426614174001",
      });
      expect(result.success).toBe(true);
    });

    it("accepts unassignment (null employeeId)", () => {
      const result = CandidateAssignmentSchema.safeParse({
        candidateId: "123e4567-e89b-12d3-a456-426614174000",
        employeeId: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("CandidateVerificationSchema", () => {
    it("validates valid verification status and notes", () => {
      const result = CandidateVerificationSchema.safeParse({
        candidateId: "123e4567-e89b-12d3-a456-426614174000",
        verificationStatus: "VERIFIED",
        verificationNotes: "Identity and academic degree verified against university transcript.",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("CandidateStatusTransitionSchema", () => {
    it("validates allowed lifecycle state transition targets", () => {
      const result = CandidateStatusTransitionSchema.safeParse({
        candidateId: "123e4567-e89b-12d3-a456-426614174000",
        targetStatus: "ACTIVE",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("CandidateDocumentUploadSchema", () => {
    it("validates valid document metadata payload", () => {
      const result = CandidateDocumentUploadSchema.safeParse({
        candidateId: "123e4567-e89b-12d3-a456-426614174000",
        documentType: "RESUME",
        title: "Jane_Doe_Resume_2026.pdf",
        storagePath: "tenants/org-1/candidates/cand-1/documents/doc-1-resume.pdf",
        fileSizeBytes: 1024 * 500,
        mimeType: "application/pdf",
        isDefault: true,
      });
      expect(result.success).toBe(true);
    });
  });
});
