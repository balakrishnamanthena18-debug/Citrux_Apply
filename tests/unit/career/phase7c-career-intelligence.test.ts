import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeSkillName,
  areSkillsEquivalent,
  mapCertificationToSkills,
} from "@/lib/career/normalization";
import {
  deriveCareerEvidenceGraph,
  isWithinRecencyThreshold,
  calculateStrengthTier,
} from "@/lib/career/evidence";
import { deriveCareerStrengths } from "@/lib/career/strengths";
import { deriveCareerGaps } from "@/lib/career/gaps";
import { deriveCareerTimeline } from "@/lib/career/timeline";
import { getCandidateCareerIntelligence } from "@/lib/career/service";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import * as rlsModule from "@/lib/db/rls";

describe("PHASE 7C: Deterministic Career Evidence Service Tests", () => {
  const referenceDate = new Date("2026-10-06T12:00:00Z");

  // ==========================================
  // 1. NORMALIZATION & PRESERVATION (D5)
  // ==========================================
  describe("1. Conservative Deterministic Normalization (D5)", () => {
    it("lowercases, trims, and collapses internal whitespace", () => {
      expect(normalizeSkillName("   TypeScript  ")).toBe("typescript");
      expect(normalizeSkillName("Node    JS")).toBe("node js");
      expect(normalizeSkillName('"PostgreSQL"')).toBe("postgresql");
      expect(normalizeSkillName("React.js,")).toBe("react.js");
    });

    it("does NOT perform fuzzy matching or arbitrary collapsing (preserves distinct terms)", () => {
      expect(areSkillsEquivalent("React", "React.js")).toBe(false);
      expect(areSkillsEquivalent("Node", "NodeJS")).toBe(false);
      expect(areSkillsEquivalent("Python", "Python 3")).toBe(false);
      expect(areSkillsEquivalent("PostgreSQL", "Postgres")).toBe(false);
    });

    it("recognizes exact case-insensitive whitespace-invariant matches", () => {
      expect(areSkillsEquivalent("  TypeScript ", "typescript")).toBe(true);
      expect(areSkillsEquivalent("Docker", "docker")).toBe(true);
    });
  });

  // ==========================================
  // 2. CERTIFICATION MAPPING (D4)
  // ==========================================
  describe("2. Certification Evidence Mapping (D4)", () => {
    it("deterministically maps recognized certifications to specific skills", () => {
      const skills = mapCertificationToSkills("AWS Certified Solutions Architect - Associate");
      expect(skills).toContain("aws");
      expect(skills).toContain("cloud architecture");
    });

    it("does not infer unrelated skills from certifications", () => {
      const skills = mapCertificationToSkills("AWS Certified Solutions Architect - Associate");
      expect(skills).not.toContain("python");
      expect(skills).not.toContain("kubernetes");
      expect(skills).not.toContain("terraform");
    });

    it("returns empty for unmapped credentials (retained as certification only)", () => {
      const skills = mapCertificationToSkills("Random Local State Certificate");
      expect(skills).toEqual([]);
    });
  });

  // ==========================================
  // 3. EVIDENCE INDEPENDENCE & DEDUPLICATION (D1, D2)
  // ==========================================
  describe("3. Evidence Independence & Deduplication (D1, D2)", () => {
    it("deduplicates repeated mentions inside the same experience entity", () => {
      const result = deriveCareerEvidenceGraph({
        skills: [],
        experiences: [
          {
            id: "exp-1",
            companyName: "Acme",
            jobTitle: "Software Engineer",
            isCurrent: true,
            startDate: new Date("2024-01-01"),
            endDate: null,
            technologies: ["React", "react", "REACT"],
            achievements: [],
          },
        ],
        projects: [],
        certifications: [],
        extracts: [],
        attestations: [],
        referenceDate,
      });

      const reactSkill = result.skills.find((s) => s.normalizedName === "react");
      expect(reactSkill).toBeDefined();
      expect(reactSkill?.evidenceDepth).toBe(1); // 1 entity, not 3
      expect(reactSkill?.authorityLevel).toBe("SELF_DECLARED"); // Only 1 source
    });

    it("requires >= 2 distinct independent entities for EVIDENCED status", () => {
      // 1 Skill + 1 Experience = 2 independent entities -> EVIDENCED
      const result = deriveCareerEvidenceGraph({
        skills: [
          {
            id: "skill-1",
            name: "TypeScript",
            createdAt: new Date("2025-01-01"),
            updatedAt: new Date("2025-01-01"),
          },
        ],
        experiences: [
          {
            id: "exp-1",
            companyName: "Stripe",
            jobTitle: "Backend Engineer",
            isCurrent: true,
            startDate: new Date("2024-01-01"),
            endDate: null,
            technologies: ["TypeScript"],
            achievements: [],
          },
        ],
        projects: [],
        certifications: [],
        extracts: [],
        attestations: [],
        referenceDate,
      });

      const tsSkill = result.skills.find((s) => s.normalizedName === "typescript");
      expect(tsSkill).toBeDefined();
      expect(tsSkill?.evidenceDepth).toBe(2);
      expect(tsSkill?.authorityLevel).toBe("EVIDENCED");
    });

    it("treats multiple mentions in 1 resume extract as 1 advisory entity", () => {
      const result = deriveCareerEvidenceGraph({
        skills: [
          {
            id: "skill-1",
            name: "Docker",
            createdAt: new Date("2025-01-01"),
            updatedAt: new Date("2025-01-01"),
          },
        ],
        experiences: [],
        projects: [],
        certifications: [],
        extracts: [
          {
            id: "extract-1",
            candidateDocumentId: "doc-1",
            extractedText: "Docker Docker Docker docker container orchestration docker",
            parsedAt: new Date("2026-01-01"),
          },
        ],
        attestations: [],
        referenceDate,
      });

      const dockerSkill = result.skills.find((s) => s.normalizedName === "docker");
      expect(dockerSkill).toBeDefined();
      expect(dockerSkill?.evidenceDepth).toBe(2); // 1 Skill + 1 Resume extract = 2
      expect(dockerSkill?.authorityLevel).toBe("EVIDENCED");
    });
  });

  // ==========================================
  // 4. AUTHORITY RESOLUTION & PRECEDENCE (D3, D6)
  // ==========================================
  describe("4. Authority Resolution & Precedence (D3, D6)", () => {
    it("VERIFIED takes precedence over EVIDENCED and SELF_DECLARED when staff attestation exists", () => {
      const result = deriveCareerEvidenceGraph({
        skills: [
          {
            id: "skill-1",
            name: "Go",
            createdAt: new Date("2025-01-01"),
            updatedAt: new Date("2025-01-01"),
          },
        ],
        experiences: [
          {
            id: "exp-1",
            companyName: "Google",
            jobTitle: "Software Engineer",
            isCurrent: true,
            startDate: new Date("2024-01-01"),
            endDate: null,
            technologies: ["Go"],
            achievements: [],
          },
        ],
        projects: [],
        certifications: [],
        extracts: [],
        attestations: [
          {
            id: "att-1",
            entityType: "CandidateSkill",
            entityId: "skill-1",
            field: "name",
            provenance: "VERIFIED",
            attestedAt: new Date("2026-02-01"),
            note: "Verified via technical interview assessment",
          },
        ],
        referenceDate,
      });

      const goSkill = result.skills.find((s) => s.normalizedName === "go");
      expect(goSkill?.authorityLevel).toBe("VERIFIED");
    });

    it("Resume extract alone cannot establish VERIFIED status (D3)", () => {
      const result = deriveCareerEvidenceGraph({
        skills: [],
        experiences: [],
        projects: [],
        certifications: [],
        extracts: [
          {
            id: "extract-1",
            candidateDocumentId: "doc-1",
            extractedText: "Expert in Kubernetes and Cloud infrastructure",
            parsedAt: new Date("2026-01-01"),
          },
        ],
        attestations: [],
        referenceDate,
      });

      const k8sSkill = result.skills.find((s) => s.normalizedName === "kubernetes");
      // Since it was only in resume extract without candidate skill, no candidate truth was mutated
      expect(k8sSkill).toBeUndefined();
    });
  });

  // ==========================================
  // 5. RECENCY & STRENGTH CLASSIFICATION (D7, D8)
  // ==========================================
  describe("5. Recency & Strength Classification (D7, D8)", () => {
    it("correctly identifies RECENT vs NOT_RECENT within 36-month threshold", () => {
      expect(isWithinRecencyThreshold(new Date("2025-01-01"), referenceDate)).toBe(true);
      expect(isWithinRecencyThreshold(new Date("2020-01-01"), referenceDate)).toBe(false);
      expect(isWithinRecencyThreshold(null, referenceDate)).toBe(false);
    });

    it("classifies CORE only when depth >= 3 AND recency is RECENT", () => {
      expect(calculateStrengthTier(3, "RECENT")).toBe("CORE");
      expect(calculateStrengthTier(4, "RECENT")).toBe("CORE");
      expect(calculateStrengthTier(3, "NOT_RECENT")).toBe("STRONG"); // Fails recency -> STRONG
      expect(calculateStrengthTier(3, "UNKNOWN")).toBe("STRONG"); // Unknown recency -> STRONG
    });

    it("classifies STRONG when depth >= 2", () => {
      expect(calculateStrengthTier(2, "RECENT")).toBe("STRONG");
      expect(calculateStrengthTier(2, "NOT_RECENT")).toBe("STRONG");
      expect(calculateStrengthTier(2, "UNKNOWN")).toBe("STRONG");
    });

    it("classifies EMERGING when depth === 1", () => {
      expect(calculateStrengthTier(1, "RECENT")).toBe("EMERGING");
      expect(calculateStrengthTier(1, "UNKNOWN")).toBe("EMERGING");
    });

    it("derives descriptive rationale without arbitrary scores or star ratings", () => {
      const skills = [
        {
          name: "TypeScript",
          normalizedName: "typescript",
          authorityLevel: "EVIDENCED" as const,
          evidenceDepth: 3,
          sources: [
            {
              sourceType: "CANDIDATE_SKILL" as const,
              sourceId: "1",
              sourceField: "name",
              displayContext: "Declared Skill",
              recordedAt: "2025-01-01",
              isVerified: false,
              recency: "UNKNOWN" as const,
            },
            {
              sourceType: "EXPERIENCE" as const,
              sourceId: "2",
              sourceField: "technologies",
              displayContext: "Used at Acme",
              recordedAt: "2025-01-01",
              isVerified: false,
              recency: "RECENT" as const,
            },
            {
              sourceType: "PROJECT" as const,
              sourceId: "3",
              sourceField: "technologies",
              displayContext: "Project Apollo",
              recordedAt: "2025-01-01",
              isVerified: false,
              recency: "RECENT" as const,
            },
          ],
          recency: "RECENT" as const,
          strengthTier: "CORE" as const,
        },
      ];

      const strengths = deriveCareerStrengths(skills);
      expect(strengths).toHaveLength(1);
      expect(strengths[0]?.tier).toBe("CORE");
      expect(strengths[0]?.rationale).toContain("Core competency corroborated across 3 independent entities");
      expect(strengths[0]?.rationale).not.toContain("/100");
      expect(strengths[0]?.rationale).not.toContain("★");
    });
  });

  // ==========================================
  // 6. CAREER GAPS & GUARDRAILS (D9)
  // ==========================================
  describe("6. Career Gaps & Copywriting Guardrails (D9)", () => {
    it("identifies DATA_GAP when structural sections are empty", () => {
      const gaps = deriveCareerGaps({
        profile: {
          hasExperiences: false,
          hasProjects: false,
          hasEducation: true,
          hasCertifications: false,
          hasPortfolioOrRepo: false,
          targetRoles: [],
        },
        skills: [],
      });

      const expGap = gaps.find((g) => g.category === "EXPERIENCE");
      const projGap = gaps.find((g) => g.category === "PROJECTS");
      const roleGap = gaps.find((g) => g.category === "DIRECTION");

      expect(expGap?.type).toBe("DATA_GAP");
      expect(projGap?.type).toBe("DATA_GAP");
      expect(roleGap?.type).toBe("DATA_GAP");
    });

    it("identifies EVIDENCE_GAP for self-declared skills lacking experience/projects", () => {
      const skills = [
        {
          name: "Rust",
          normalizedName: "rust",
          authorityLevel: "SELF_DECLARED" as const,
          evidenceDepth: 1,
          sources: [
            {
              sourceType: "CANDIDATE_SKILL" as const,
              sourceId: "skill-1",
              sourceField: "name",
              displayContext: "Declared Skill",
              recordedAt: "2025-01-01",
              isVerified: false,
              recency: "UNKNOWN" as const,
            },
          ],
          recency: "UNKNOWN" as const,
          strengthTier: "EMERGING" as const,
        },
      ];

      const gaps = deriveCareerGaps({
        profile: {
          hasExperiences: true,
          hasProjects: true,
          hasEducation: true,
          hasCertifications: true,
          hasPortfolioOrRepo: true,
          targetRoles: ["Systems Engineer"],
        },
        skills,
      });

      const rustGap = gaps.find((g) => g.skillName === "Rust");
      expect(rustGap?.type).toBe("EVIDENCE_GAP");
      expect(rustGap?.description).toBe(
        "No supporting experience or project evidence was found for Rust in the active profile."
      );
    });

    it("strictly adheres to copywriting guardrails (never claims incompetence)", () => {
      const gaps = deriveCareerGaps({
        profile: {
          hasExperiences: false,
          hasProjects: false,
          hasEducation: false,
          hasCertifications: false,
          hasPortfolioOrRepo: false,
          targetRoles: [],
        },
        skills: [
          {
            name: "Docker",
            normalizedName: "docker",
            authorityLevel: "SELF_DECLARED" as const,
            evidenceDepth: 1,
            sources: [
              {
                sourceType: "CANDIDATE_SKILL" as const,
                sourceId: "1",
                sourceField: "name",
                displayContext: "Skill",
                recordedAt: "2025-01-01",
                isVerified: false,
                recency: "UNKNOWN" as const,
              },
            ],
            recency: "UNKNOWN" as const,
            strengthTier: "EMERGING" as const,
          },
        ],
      });

      for (const gap of gaps) {
        expect(gap.description).not.toMatch(/you don't know/i);
        expect(gap.description).not.toMatch(/incompetent/i);
        expect(gap.description).not.toMatch(/lacks skills/i);
      }
    });
  });

  // ==========================================
  // 7. CHRONOLOGICAL TIMELINE (D10, Contract §10)
  // ==========================================
  describe("7. Chronological Career Timeline", () => {
    it("unifies events chronologically without inferring promotions or title seniority", () => {
      const timeline = deriveCareerTimeline({
        experiences: [
          {
            id: "exp-1",
            companyName: "Acme Corp",
            jobTitle: "Senior Engineer",
            isCurrent: true,
            startDate: new Date("2024-01-01"),
            endDate: null,
            technologies: ["Node.js"],
            achievements: ["Built core service"],
          },
          {
            id: "exp-2",
            companyName: "Startup Inc",
            jobTitle: "Engineer",
            isCurrent: false,
            startDate: new Date("2022-01-01"),
            endDate: new Date("2023-12-31"),
            technologies: ["JavaScript"],
            achievements: [],
          },
        ],
        projects: [
          {
            id: "proj-1",
            title: "Open Source Tool",
            role: "Creator",
            url: "https://github.com/test",
            technologies: ["TypeScript"],
            highlights: ["1000 stars"],
            startDate: new Date("2023-06-01"),
            endDate: new Date("2023-11-01"),
          },
        ],
        education: [
          {
            id: "edu-1",
            institution: "University of Tech",
            degree: "BS",
            fieldOfStudy: "Computer Science",
            startDate: new Date("2018-09-01"),
            endDate: new Date("2022-05-01"),
            graduationYear: 2022,
          },
        ],
        certifications: [
          {
            id: "cert-1",
            name: "AWS Certified Developer",
            issuingAuthority: "Amazon Web Services",
            credentialId: "12345",
            issueDate: new Date("2023-01-01"),
            expirationDate: new Date("2026-01-01"),
            doesNotExpire: false,
          },
        ],
      });

      expect(timeline.length).toBe(5);
      // Current experience should be at the top
      expect(timeline[0]?.type).toBe("EXPERIENCE");
      expect(timeline[0]?.title).toBe("Senior Engineer");
      expect(timeline[0]?.isCurrent).toBe(true);

      // Verify every event retains source ID
      for (const event of timeline) {
        expect(event.sourceId).toBeDefined();
        expect(event.displayDate).toBeDefined();
      }
    });
  });

  // ==========================================
  // 8. SERVICE LAYER INTEGRATION & AUTHORIZATION
  // ==========================================
  describe("8. Service Layer Authorization & Tenant Isolation", () => {
    it("denies access when context is missing", async () => {
      await expect(
        getCandidateCareerIntelligence("cand-1", null as unknown as AuthenticatedContext)
      ).rejects.toThrow(AuthorizationError);
    });

    it("enforces tenant isolation and role permissions through getCandidateCareerIntelligence", async () => {
      const mockCandidate = {
        id: "cand-123",
        organizationId: "org-1",
        userId: "user-candidate-1",
        headline: "Staff Engineer",
        city: "San Francisco",
        state: "CA",
        country: "US",
        workAuthorization: "CITIZEN",
        verificationStatus: "VERIFIED",
        targetRoles: ["Staff Engineer"],
        targetLocations: ["Remote"],
        remotePreference: "REMOTE_ONLY",
        desiredSalaryMin: 200000,
        desiredSalaryMax: 250000,
        salaryCurrency: "USD",
        totalYearsExperience: 10,
        updatedAt: new Date("2026-01-01"),
        user: {
          id: "user-candidate-1",
          email: "candidate@example.com",
          firstName: "Jane",
          lastName: "Doe",
        },
      };

      const mockTx = {
        candidate: {
          findFirst: vi.fn().mockImplementation(({ where }) => {
            if (where.id === mockCandidate.id && where.organizationId === mockCandidate.organizationId) {
              return Promise.resolve(mockCandidate);
            }
            return Promise.resolve(null);
          }),
        },
        candidateExperience: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "exp-1",
              companyName: "Acme",
              jobTitle: "Principal Engineer",
              isCurrent: true,
              startDate: new Date("2024-01-01"),
              endDate: null,
              technologies: ["TypeScript", "Node.js"],
              achievements: ["Built platform"],
              updatedAt: new Date("2026-01-01"),
            },
          ]),
        },
        candidateEducation: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "edu-1",
              institution: "MIT",
              degree: "B.S.",
              fieldOfStudy: "CS",
              startDate: new Date("2016-09-01"),
              endDate: new Date("2020-05-01"),
              graduationYear: 2020,
              updatedAt: new Date("2026-01-01"),
            },
          ]),
        },
        candidateSkill: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "sk-1",
              name: "TypeScript",
              createdAt: new Date("2024-01-01"),
              updatedAt: new Date("2026-01-01"),
            },
          ]),
        },
        candidateProject: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "proj-1",
              title: "Cloud Engine",
              role: "Architect",
              url: "https://github.com/test/cloud",
              technologies: ["TypeScript"],
              highlights: ["Scalable"],
              startDate: new Date("2025-01-01"),
              endDate: new Date("2025-06-01"),
              updatedAt: new Date("2026-01-01"),
            },
          ]),
        },
        candidateCertification: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        candidateFactAttestation: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "att-1",
              entityType: "CandidateSkill",
              entityId: "sk-1",
              field: "name",
              provenance: "VERIFIED",
              attestedAt: new Date("2026-01-15"),
              note: "Internal staff note that must NOT leak",
              updatedAt: new Date("2026-01-01"),
            },
          ]),
        },
        candidateDocumentExtract: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "ext-1",
              candidateDocumentId: "doc-1",
              extractedText: "Raw sensitive resume text that must never leak in return DTO",
              parsedAt: new Date("2026-01-01"),
              updatedAt: new Date("2026-01-01"),
            },
          ]),
        },
        applicationOutcomeEvent: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "out-1",
              outcomeType: "INTERVIEW_REQUESTED",
              recordedAt: new Date("2026-02-01"),
              candidateVisible: true,
            },
            {
              id: "out-2",
              outcomeType: "OFFER_RECEIVED",
              recordedAt: new Date("2026-02-15"),
              candidateVisible: true,
            },
          ]),
        },
      };

      vi.spyOn(rlsModule, "withRlsContext").mockImplementation(
        async (_userId, fn) => fn(mockTx as any)
      );

      // 1. Success for Candidate viewing own profile
      const candidateCtx: AuthenticatedContext = {
        userId: "user-candidate-1",
        email: "candidate@example.com",
        organizationId: "org-1",
        role: Role.CANDIDATE,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      const result = await getCandidateCareerIntelligence("cand-123", candidateCtx);
      expect(result).toBeDefined();
      expect(result.candidate.id).toBe("cand-123");
      expect(result.candidate.fullName).toBe("Jane Doe");
      expect(result.skills.find((s) => s.normalizedName === "typescript")?.authorityLevel).toBe("VERIFIED");

      // Verify outcomes context is present in outcomesSummary but NOT treated as a skill
      expect(result.outcomesSummary.interviewRequestsCount).toBe(1);
      expect(result.outcomesSummary.offersCount).toBe(1);
      expect(result.skills.some((s) => s.normalizedName === "interview_requested")).toBe(false);

      // Verify raw extracted resume text is NOT exposed in the DTO
      const stringifiedDTO = JSON.stringify(result);
      expect(stringifiedDTO).not.toContain("Raw sensitive resume text");
      expect(stringifiedDTO).not.toContain("Internal staff note that must NOT leak");

      // 2. Failure when candidate tries to view another candidate
      const otherCandidateCtx: AuthenticatedContext = {
        userId: "user-candidate-2",
        email: "other@example.com",
        organizationId: "org-1",
        role: Role.CANDIDATE,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      await expect(
        getCandidateCareerIntelligence("cand-123", otherCandidateCtx)
      ).rejects.toThrow(AuthorizationError);

      // 3. Failure on cross-tenant lookup (different org)
      const foreignOrgCtx: AuthenticatedContext = {
        userId: "user-admin-2",
        email: "admin@foreign.com",
        organizationId: "org-foreign",
        role: Role.ADMIN,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      await expect(
        getCandidateCareerIntelligence("cand-123", foreignOrgCtx)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
