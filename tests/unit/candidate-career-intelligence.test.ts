import { describe, it, expect } from "vitest";
import {
  CandidateProfileSchema,
  CandidateExperienceSchema,
  CandidateEducationSchema,
  CandidateSkillSchema,
  CandidateCertificationSchema,
} from "@/lib/validation/candidate.schemas";
import { formatSalary } from "@/lib/utils/status-presenter";

describe("Phase 2: Candidate Career Intelligence & Control Unit Tests", () => {
  describe("1. Candidate Profile & Work Authorization Schemas", () => {
    it("validates valid candidate profile input including preferences and authorization mode", () => {
      const validProfile = {
        phone: "+1 415-555-0199",
        city: "San Francisco",
        state: "CA",
        country: "US",
        postalCode: "94105",
        timezone: "America/Los_Angeles",
        linkedinUrl: "https://linkedin.com/in/alex",
        githubUrl: "https://github.com/alex",
        portfolioUrl: "https://alex.dev",
        headline: "Staff Software Engineer | Platform Architecture",
        professionalSummary: "10+ years designing high-throughput distributed systems.",
        totalYearsExperience: 10,
        workAuthorization: "CITIZEN" as const,
        requiresSponsorship: false,
        visaDetails: null,
        targetRoles: ["Staff Engineer", "Principal Architect"],
        targetLocations: ["Remote", "San Francisco, CA"],
        remotePreference: "REMOTE_ONLY" as const,
        desiredSalaryMin: 220000,
        desiredSalaryMax: 275000,
        salaryCurrency: "USD",
        applicationAuthorizationMode: "MANAGED" as const,
      };

      const result = CandidateProfileSchema.safeParse(validProfile);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.headline).toBe(validProfile.headline);
        expect(result.data.workAuthorization).toBe("CITIZEN");
        expect(result.data.applicationAuthorizationMode).toBe("MANAGED");
      }
    });

    it("rejects invalid URLs in profile links", () => {
      const invalidProfile = {
        linkedinUrl: "not-a-url",
        githubUrl: "also-not-a-url",
      };

      const result = CandidateProfileSchema.safeParse(invalidProfile);
      expect(result.success).toBe(false);
    });

    it("enforces work authorization enum values strictly", () => {
      const validStatuses = [
        "CITIZEN",
        "PERMANENT_RESIDENT",
        "WORK_VISA",
        "STUDENT_VISA",
        "REQUIRES_SPONSORSHIP",
        "OTHER",
      ];

      validStatuses.forEach((status) => {
        const res = CandidateProfileSchema.safeParse({ workAuthorization: status });
        expect(res.success).toBe(true);
      });

      const invalidRes = CandidateProfileSchema.safeParse({
        workAuthorization: "INVALID_STATUS",
      });
      expect(invalidRes.success).toBe(false);
    });
  });

  describe("2. Experience & Progressive Disclosure Schema", () => {
    it("validates valid experience entries with achievements and technologies", () => {
      const validExp = {
        companyName: "Stripe",
        jobTitle: "Staff Software Engineer",
        location: "San Francisco, CA",
        isCurrent: true,
        startDate: "2021-03-01",
        description: "Led billing ledger consistency architecture.",
        achievements: [
          "Scaled ledger processing 5x with zero consistency errors",
          "Mentored 6 senior engineers across 2 teams",
        ],
        technologies: ["Go", "PostgreSQL", "Kafka", "Temporal"],
      };

      const result = CandidateExperienceSchema.safeParse(validExp);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe("Stripe");
        expect(result.data.technologies).toHaveLength(4);
        expect(result.data.achievements).toHaveLength(2);
      }
    });

    it("rejects experience entries with invalid start date format", () => {
      const invalidExp = {
        companyName: "Stripe",
        jobTitle: "Staff Software Engineer",
        startDate: "March 2021", // Not YYYY-MM-DD
      };

      const result = CandidateExperienceSchema.safeParse(invalidExp);
      expect(result.success).toBe(false);
    });
  });

  describe("3. Education Schema", () => {
    it("validates university degree records and graduation years", () => {
      const validEdu = {
        institution: "Carnegie Mellon University",
        degree: "Master of Science in Computer Science",
        fieldOfStudy: "Computer Systems & Networking",
        graduationYear: 2019,
        gpa: "3.95 / 4.0",
        honors: "Department Fellowship",
      };

      const result = CandidateEducationSchema.safeParse(validEdu);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.institution).toBe("Carnegie Mellon University");
        expect(result.data.graduationYear).toBe(2019);
      }
    });
  });

  describe("4. Skills & Certification Expiry Rules", () => {
    it("validates skills with clean non-empty string names", () => {
      expect(CandidateSkillSchema.safeParse({ name: "TypeScript" }).success).toBe(true);
      expect(CandidateSkillSchema.safeParse({ name: "" }).success).toBe(false);
      expect(CandidateSkillSchema.safeParse({ name: "  " }).success).toBe(false);
    });

    it("validates certifications with expiration dates or doesNotExpire flags", () => {
      const certWithExpiry = {
        name: "AWS Certified Solutions Architect",
        issuingAuthority: "Amazon Web Services",
        credentialId: "AWS-12345",
        issueDate: "2023-01-15",
        expirationDate: "2026-01-15",
        doesNotExpire: false,
      };

      expect(CandidateCertificationSchema.safeParse(certWithExpiry).success).toBe(true);

      const certNoExpiry = {
        name: "Certified Kubernetes Administrator",
        issuingAuthority: "Linux Foundation",
        doesNotExpire: true,
      };

      expect(CandidateCertificationSchema.safeParse(certNoExpiry).success).toBe(true);
    });
  });

  describe("5. Compensation Disclosures & Boundaries", () => {
    it("formats salary range disclosures accurately", () => {
      expect(formatSalary(180000, 240000, "USD")).toBe("$180,000 – $240,000 / year");
      expect(formatSalary(200000, 200000, "USD")).toBe("$200,000 / year");
      expect(formatSalary(150000, null, "USD")).toBe("From $150,000 / year");
      expect(formatSalary(null, 300000, "USD")).toBe("Up to $300,000 / year");
      expect(formatSalary(null, null, "USD")).toBe("Salary not disclosed");
    });
  });
});
