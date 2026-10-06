import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getCandidate360 } from "@/lib/candidate-360/service";
import { Candidate360View } from "@/components/candidate/Candidate360View";
import { StaffCandidate360View } from "@/components/candidate/StaffCandidate360View";
import type { Candidate360DTO } from "@/lib/candidate-360/types";
import * as careerService from "@/lib/career/service";
import * as rlsModule from "@/lib/db/rls";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError, NotFoundError } from "@/lib/errors";

describe("PHASE 7E.4: Candidate 360 Full System Forensic & Security Verification", () => {
  const candidateCtx: AuthenticatedContext = {
    userId: "user-cand-1",
    email: "alex@example.com",
    role: Role.CANDIDATE,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
    organizationId: "org-1",
  };

  const otherCandidateCtx: AuthenticatedContext = {
    userId: "user-cand-2",
    email: "other@example.com",
    role: Role.CANDIDATE,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
    organizationId: "org-1",
  };

  const employeeCtx: AuthenticatedContext = {
    userId: "user-emp-1",
    email: "specialist@citrux.com",
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
    organizationId: "org-1",
  };

  const adminCtx: AuthenticatedContext = {
    userId: "user-adm-1",
    email: "admin@citrux.com",
    role: Role.ADMIN,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
    organizationId: "org-1",
  };

  const otherOrgEmployeeCtx: AuthenticatedContext = {
    userId: "user-emp-2",
    email: "other_org_staff@citrux.com",
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
    organizationId: "org-2",
  };

  const mockCareerIntelligence = {
    candidate: {
      id: "cand-1",
      fullName: "Alex Rivera",
      email: "alex@example.com",
      headline: "Senior Cloud Engineer",
      city: "Austin",
      state: "TX",
      country: "US",
      workAuthorization: "CITIZEN",
      verificationStatus: "VERIFIED",
    },
    careerSnapshot: {
      totalYearsExperience: 8,
      headline: "Senior Cloud Engineer",
      topStrengths: ["AWS", "Kubernetes"],
      verifiedSkillsCount: 2,
      evidencedSkillsCount: 4,
      selfDeclaredSkillsCount: 1,
      totalEvidencedEntities: 7,
    },
    skills: [
      {
        name: "AWS",
        normalizedName: "aws",
        authorityLevel: "VERIFIED" as const,
        evidenceDepth: 3,
        sources: [
          {
            sourceType: "EXPERIENCE" as const,
            sourceId: "exp-1",
            sourceField: "technologies",
            displayContext: "Principal Cloud Engineer at CloudCorp",
            recordedAt: "2026-01-01T00:00:00.000Z",
            recency: "RECENT" as const,
            isVerified: true,
          },
        ],
        recency: "RECENT" as const,
        strengthTier: "CORE" as const,
      },
      {
        name: "Kubernetes",
        normalizedName: "kubernetes",
        authorityLevel: "EVIDENCED" as const,
        evidenceDepth: 2,
        sources: [
          {
            sourceType: "EXPERIENCE" as const,
            sourceId: "exp-1",
            sourceField: "technologies",
            displayContext: "Principal Cloud Engineer at CloudCorp",
            recordedAt: "2026-01-01T00:00:00.000Z",
            recency: "RECENT" as const,
            isVerified: false,
          },
          {
            sourceType: "PROJECT" as const,
            sourceId: "proj-1",
            sourceField: "technologies",
            displayContext: "Multi-Region Cluster Project",
            recordedAt: "2025-06-01T00:00:00.000Z",
            recency: "RECENT" as const,
            isVerified: false,
          },
        ],
        recency: "RECENT" as const,
        strengthTier: "STRONG" as const,
      },
    ],
    experience: [],
    projects: [
      {
        id: "proj-1",
        title: "Multi-Region Cluster Project",
        role: "Lead Architect",
        url: "https://github.com/alex/cluster",
        technologies: ["Kubernetes", "Go"],
        highlights: ["Zero-downtime failover"],
        startDate: "2024-01-01",
        endDate: "2025-01-01",
      },
    ],
    education: [],
    certifications: [],
    evidence: [],
    strengths: [
      {
        skillName: "AWS",
        normalizedName: "aws",
        tier: "CORE" as const,
        evidenceDepth: 3,
        rationale: "Core competency corroborated across 3 independent entities",
        recency: "RECENT" as const,
      },
    ],
    gaps: [
      {
        type: "DATA_GAP" as const,
        category: "LINKS",
        title: "Missing Portfolio / GitHub Link",
        description: "No public portfolio is linked.",
        recommendation: "Add your GitHub link.",
      },
      {
        type: "EVIDENCE_GAP" as const,
        category: "UNCORROBORATED_SKILL",
        title: "Terraform",
        description: "Declared on profile without supporting experience.",
        recommendation: "Add a project demonstrating Terraform.",
      },
    ],
    timeline: [
      {
        id: "exp-1",
        type: "EXPERIENCE" as const,
        sourceId: "exp-1",
        title: "Principal Cloud Engineer",
        subtitle: "CloudCorp Inc",
        startDate: "2022-01-01",
        endDate: null,
        displayDate: "2022 – Present",
        isCurrent: true,
        technologies: ["AWS", "Kubernetes"],
        details: ["Architected cloud systems"],
      },
    ],
    careerDirection: {
      targetRoles: ["Cloud Architect"],
      targetLocations: ["Austin, TX"],
      remotePreference: "REMOTE_ONLY",
      desiredSalaryMin: 170000,
      desiredSalaryMax: 200000,
      salaryCurrency: "USD",
    },
    outcomesSummary: {
      totalOutcomes: 1,
      interviewRequestsCount: 1,
      offersCount: 0,
      employerDeclinesCount: 0,
      recentOutcomes: [
        {
          outcomeType: "INTERVIEW_REQUESTED",
          recordedAt: "2026-03-01T10:00:00.000Z",
          candidateVisible: true,
        },
      ],
    },
    freshness: {
      status: "FRESH" as const,
      sourceDataVersion: "hash-cand-1",
      computedAt: "2026-10-06T12:00:00.000Z",
    },
  };

  const mockCandidateDb = {
    id: "cand-1",
    userId: "user-cand-1",
    organizationId: "org-1",
    phone: "+1-555-0100",
    requiresSponsorship: false,
    verificationNotes: "Verified by specialist.",
    applicationAuthorizationMode: "MANAGED",
    totalYearsExperience: 8,
    status: "ACTIVE",
    user: {
      id: "user-cand-1",
      email: "alex@example.com",
      firstName: "Alex",
      lastName: "Rivera",
    },
    assignedEmployee: {
      id: "emp-1",
      firstName: "Sarah",
      lastName: "Specialist",
      email: "sarah@citrux.com",
    },
  };

  let mockTx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(careerService, "getCandidateCareerIntelligence").mockResolvedValue(
      mockCareerIntelligence as any
    );

    mockTx = {
      candidate: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          if (where.id === mockCandidateDb.id && where.organizationId === mockCandidateDb.organizationId) {
            return Promise.resolve(mockCandidateDb);
          }
          return Promise.resolve(null);
        }),
      },
      candidateDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: "doc-1",
          title: "alex-resume.pdf",
        }),
      },
      resumeReview: {
        findFirst: vi.fn().mockResolvedValue({
          id: "review-1",
          status: "READY",
          overallLabel: "ATS Optimal",
          atsReadability: {
            label: "ATS Optimized",
            summary: "High keyword density and parseable format.",
            findings: [],
          },
          completedAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
      },
      application: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "app-1",
            status: "READY",
            createdAt: new Date("2026-02-01T00:00:00.000Z"),
            job: {
              title: "Principal Cloud Architect",
              companyName: "CloudTech",
            },
            readinessResults: [
              {
                readinessState: "READY_FOR_MANAGED",
                blockers: [],
                warnings: [],
              },
            ],
          },
        ]),
      },
      candidateJobMatch: {
        findMany: vi.fn().mockResolvedValue([
          {
            jobId: "job-1",
            category: "STRONG_MATCH",
            isSaved: true,
            isRequested: false,
            job: {
              title: "Principal Cloud Architect",
              companyName: "CloudTech",
              location: "Austin, TX",
              isRemote: true,
            },
          },
        ]),
      },
      internalNote: {
        count: vi.fn().mockResolvedValue(3),
      },
      task: {
        count: vi.fn().mockResolvedValue(2),
      },
      candidateFactAttestation: {
        count: vi.fn().mockResolvedValue(4),
      },
    };

    vi.spyOn(rlsModule, "withRlsContext").mockImplementation(async (_userId, cb) => {
      return cb(mockTx as any);
    });
  });

  /* ========================================================================= */
  /* 1. SECURITY & ACCESS CONTROL VERIFICATION                                 */
  /* ========================================================================= */
  describe("1. Security & Access Control Verification", () => {
    it("allows candidate to access own Candidate 360", async () => {
      const dto = await getCandidate360("cand-1", candidateCtx);
      expect(dto).toBeDefined();
      expect(dto.candidate.id).toBe("cand-1");
      expect(dto.candidate.email).toBe("alex@example.com");
      // Candidate should NOT receive staffContext
      expect(dto.staffContext).toBeUndefined();
    });

    it("strictly denies candidate from accessing another candidate profile", async () => {
      await expect(getCandidate360("cand-1", otherCandidateCtx)).rejects.toThrow(
        AuthorizationError
      );
    });

    it("strictly denies cross-tenant employee access (tenant isolation)", async () => {
      mockTx.candidate.findFirst.mockResolvedValue(null);
      await expect(getCandidate360("cand-1", otherOrgEmployeeCtx)).rejects.toThrow(
        NotFoundError
      );
    });

    it("allows authorized organization staff (Employee & Admin) and includes staffContext", async () => {
      const empDto = await getCandidate360("cand-1", employeeCtx);
      expect(empDto.staffContext).toBeDefined();
      expect(empDto.staffContext?.internalNotesCount).toBe(3);
      expect(empDto.staffContext?.activeTasksCount).toBe(2);

      const admDto = await getCandidate360("cand-1", adminCtx);
      expect(admDto.staffContext).toBeDefined();
      expect(admDto.staffContext?.internalNotesCount).toBe(3);
    });
  });

  /* ========================================================================= */
  /* 2. DATA REDACTION AUDIT                                                   */
  /* ========================================================================= */
  describe("2. Data Redaction Audit", () => {
    it("never includes raw resume extracted text in candidate or staff DTOs", async () => {
      const candidateDto = await getCandidate360("cand-1", candidateCtx);
      const staffDto = await getCandidate360("cand-1", employeeCtx);

      const serializedCand = JSON.stringify(candidateDto);
      const serializedStaff = JSON.stringify(staffDto);

      expect(serializedCand).not.toContain("rawExtract");
      expect(serializedCand).not.toContain("parsedText");
      expect(serializedStaff).not.toContain("rawExtract");
      expect(serializedStaff).not.toContain("parsedText");
    });

    it("never leaks confidential internal notes to candidate DTO or UI", async () => {
      const candidateDto = await getCandidate360("cand-1", candidateCtx);
      expect(candidateDto.staffContext).toBeUndefined();

      const html = renderToStaticMarkup(
        React.createElement(Candidate360View, { data: candidateDto })
      );
      expect(html).not.toContain("Internal Notes");
      expect(html).not.toContain("Confidential");
    });
  });

  /* ========================================================================= */
  /* 3. READ-ONLY GUARANTEE AUDIT                                              */
  /* ========================================================================= */
  describe("3. Read-Only Guarantee Audit", () => {
    it("executes zero mutations (create, update, delete) during Candidate 360 generation", async () => {
      await getCandidate360("cand-1", employeeCtx);

      expect(mockTx.candidate).not.toHaveProperty("create");
      expect(mockTx.candidate).not.toHaveProperty("update");
      expect(mockTx.candidate).not.toHaveProperty("delete");
    });
  });

  /* ========================================================================= */
  /* 4. CAREER EVIDENCE & TERMINOLOGY AUDIT                                    */
  /* ========================================================================= */
  describe("4. Career Evidence & Frozen Terminology Audit", () => {
    it("renders exact candidate-safe authority badges and strength tiers", async () => {
      const candidateDto = await getCandidate360("cand-1", candidateCtx);
      const html = renderToStaticMarkup(
        React.createElement(Candidate360View, { data: candidateDto })
      );

      // Must contain exact required labels
      expect(html).toContain("Core Competency");
      expect(html).toContain("Strong Capability");
      expect(html).toContain("Verified Credential");
      expect(html).toContain("Supported by multiple records");

      // Must prohibit synthetic scores and AI confidences
      expect(html).not.toContain("% confidence");
      expect(html).not.toContain("Top 5%");
      expect(html).not.toContain("AI confidence");
    });

    it("renders staff operational evidence view with multi-source provenance drawers", async () => {
      const staffDto = await getCandidate360("cand-1", employeeCtx);
      const html = renderToStaticMarkup(
        React.createElement(StaffCandidate360View, { data: staffDto })
      );

      expect(html).toContain("Kubernetes");
      expect(html).toContain("AWS");
      expect(html).toContain("Staff Operational 360");
      expect(html).toContain("Sarah Specialist");
    });
  });

  /* ========================================================================= */
  /* 5. GAPS & TIMELINE INTEGRITY AUDIT                                        */
  /* ========================================================================= */
  describe("5. Gaps & Timeline Integrity Audit", () => {
    it("separates Missing Profile Information (DATA_GAP) from Uncorroborated Skills (EVIDENCE_GAP) constructively", async () => {
      const candidateDto = await getCandidate360("cand-1", candidateCtx);
      const html = renderToStaticMarkup(
        React.createElement(Candidate360View, { data: candidateDto })
      );

      expect(html).toContain("Missing Profile Information");
      expect(html).toContain("Uncorroborated Skill");
      expect(html).toContain("Missing Portfolio / GitHub Link");
      expect(html).toContain("Terraform");

      // Prohibit shaming language
      expect(html).not.toContain("You don't know");
      expect(html).not.toContain("Skill missing.");
    });

    it("renders timeline preserving exact dates with zero inferred promotions", async () => {
      const candidateDto = await getCandidate360("cand-1", candidateCtx);
      const html = renderToStaticMarkup(
        React.createElement(Candidate360View, { data: candidateDto })
      );

      expect(html).toContain("Principal Cloud Engineer");
      expect(html).toContain("CloudCorp Inc");
      expect(html).toContain("2022 – Present");

      expect(html).not.toContain("Promoted to");
      expect(html).not.toContain("Career progression accelerated");
    });
  });
});
