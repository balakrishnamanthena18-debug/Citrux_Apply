import { z } from "zod";

export const CandidateProfileSchema = z.object({
  phone: z.string().trim().max(50).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  country: z.string().trim().min(2).max(100).default("US"),
  postalCode: z.string().trim().max(20).optional().nullable(),
  timezone: z.string().trim().max(50).optional().nullable(),
  linkedinUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  githubUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  portfolioUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  headline: z.string().trim().max(255).optional().nullable(),
  professionalSummary: z.string().trim().max(5000).optional().nullable(),
  totalYearsExperience: z.number().min(0).max(60).optional().nullable(),
  workAuthorization: z.enum([
    "CITIZEN",
    "PERMANENT_RESIDENT",
    "WORK_VISA",
    "STUDENT_VISA",
    "REQUIRES_SPONSORSHIP",
    "OTHER",
  ]).default("CITIZEN"),
  requiresSponsorship: z.boolean().default(false),
  visaDetails: z.string().trim().max(255).optional().nullable(),
  targetRoles: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  targetLocations: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  remotePreference: z.enum(["REMOTE_ONLY", "HYBRID", "ONSITE", "FLEXIBLE"]).default("FLEXIBLE"),
  desiredSalaryMin: z.number().int().min(0).max(10000000).optional().nullable(),
  desiredSalaryMax: z.number().int().min(0).max(10000000).optional().nullable(),
  salaryCurrency: z.string().trim().min(3).max(10).default("USD"),
  applicationAuthorizationMode: z.enum(["MANAGED", "REVIEW_REQUIRED"]).default("MANAGED"),
});

export const CandidateExperienceSchema = z.object({
  id: z.string().uuid().optional(),
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  jobTitle: z.string().trim().min(1, "Job title is required").max(200),
  location: z.string().trim().max(100).optional().nullable(),
  isCurrent: z.boolean().default(false),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  achievements: z.array(z.string().trim().max(500)).max(20).default([]),
  technologies: z.array(z.string().trim().max(100)).max(50).default([]),
  orderIndex: z.number().int().min(0).default(0),
});

export const CandidateEducationSchema = z.object({
  id: z.string().uuid().optional(),
  institution: z.string().trim().min(1, "Institution name is required").max(255),
  degree: z.string().trim().min(1, "Degree is required").max(200),
  fieldOfStudy: z.string().trim().max(200).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  graduationYear: z.number().int().min(1950).max(2050).optional().nullable(),
  gpa: z.string().trim().max(20).optional().nullable(),
  honors: z.string().trim().max(255).optional().nullable(),
  orderIndex: z.number().int().min(0).default(0),
});

export const CandidateSkillSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Skill name is required").max(100),
});

export const CandidateProjectSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Project title is required").max(200),
  role: z.string().trim().max(100).optional().nullable(),
  url: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  description: z.string().trim().max(5000).optional().nullable(),
  highlights: z.array(z.string().trim().max(500)).max(20).default([]),
  technologies: z.array(z.string().trim().max(100)).max(50).default([]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  orderIndex: z.number().int().min(0).default(0),
});

export const CandidateCertificationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Certification name is required").max(200),
  issuingAuthority: z.string().trim().min(1, "Issuing authority is required").max(200),
  credentialId: z.string().trim().max(200).optional().nullable(),
  credentialUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  doesNotExpire: z.boolean().default(false),
});

export const CandidateAssignmentSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID"),
  employeeId: z.string().uuid("Invalid employee ID").nullable(),
});

export const CandidateVerificationSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID"),
  verificationStatus: z.enum(["UNVERIFIED", "PENDING_REVIEW", "VERIFIED", "REJECTED"]),
  verificationNotes: z.string().trim().max(2000).optional().nullable(),
});

export const CandidateStatusTransitionSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID"),
  targetStatus: z.enum(["ONBOARDING", "ACTIVE", "INACTIVE", "ARCHIVED"]),
});

export const CandidateDocumentUploadSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID"),
  documentType: z.enum(["RESUME", "COVER_LETTER", "TRANSCRIPT", "CERTIFICATE", "OTHER"]),
  title: z.string().trim().min(1, "Document title is required").max(255),
  storagePath: z.string().trim().min(1).max(1024),
  fileSizeBytes: z.number().int().positive().max(50 * 1024 * 1024), // 50MB max
  mimeType: z.string().trim().min(1).max(100),
  isDefault: z.boolean().default(false),
});

export const UpdateCandidateAuthorizationModeSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID").optional(),
  authorizationMode: z.enum(["MANAGED", "REVIEW_REQUIRED"]),
});

export type CandidateProfileInput = z.input<typeof CandidateProfileSchema>;
export type CandidateExperienceInput = z.input<typeof CandidateExperienceSchema>;
export type CandidateEducationInput = z.input<typeof CandidateEducationSchema>;
export type CandidateSkillInput = z.input<typeof CandidateSkillSchema>;
export type CandidateProjectInput = z.input<typeof CandidateProjectSchema>;
export type CandidateCertificationInput = z.input<typeof CandidateCertificationSchema>;
export type CandidateAssignmentInput = z.input<typeof CandidateAssignmentSchema>;
export type CandidateVerificationInput = z.input<typeof CandidateVerificationSchema>;
export type CandidateStatusTransitionInput = z.input<typeof CandidateStatusTransitionSchema>;
export type CandidateDocumentUploadInput = z.input<typeof CandidateDocumentUploadSchema>;
export type UpdateCandidateAuthorizationModeInput = z.input<typeof UpdateCandidateAuthorizationModeSchema>;
