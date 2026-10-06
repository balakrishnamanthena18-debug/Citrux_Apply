import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Candidate360View } from "@/components/candidate/Candidate360View";
import type { Candidate360DTO } from "@/lib/candidate-360/types";

describe("PHASE 7E.2: Candidate 360 UI Component Tests", () => {
  const mockFullData: Candidate360DTO = {
    candidate: {
      id: "cand-123",
      fullName: "Alex Rivera",
      email: "alex@example.com",
      phone: "+1-555-0100",
      headline: "Senior Cloud Infrastructure Architect",
      location: "Austin, TX, US",
      workAuthorization: "CITIZEN",
      requiresSponsorship: false,
      verificationStatus: "VERIFIED",
      assignedSpecialist: {
        id: "emp-1",
        name: "Sarah Specialist",
        email: "sarah@citrux.com",
      },
      totalYearsExperience: 8,
      applicationAuthMode: "MANAGED",
    },
    career: {
      candidate: {
        id: "cand-123",
        fullName: "Alex Rivera",
        email: "alex@example.com",
        headline: "Senior Cloud Infrastructure Architect",
        city: "Austin",
        state: "TX",
        country: "US",
        workAuthorization: "CITIZEN",
        verificationStatus: "VERIFIED",
      },
      careerSnapshot: {
        totalYearsExperience: 8,
        headline: "Senior Cloud Infrastructure Architect",
        topStrengths: ["AWS Cloud Architecture", "Kubernetes"],
        verifiedSkillsCount: 2,
        evidencedSkillsCount: 3,
        selfDeclaredSkillsCount: 1,
        totalEvidencedEntities: 8,
      },
      skills: [
        {
          name: "AWS Cloud Architecture",
          normalizedName: "aws cloud architecture",
          authorityLevel: "VERIFIED",
          evidenceDepth: 3,
          sources: [
            {
              sourceType: "EXPERIENCE",
              sourceId: "exp-1",
              sourceField: "technologies",
              displayContext: "Principal Cloud Engineer at CloudCorp",
              recordedAt: "2026-01-01T00:00:00.000Z",
              recency: "RECENT",
              isVerified: true,
            },
            {
              sourceType: "PROJECT",
              sourceId: "proj-1",
              sourceField: "technologies",
              displayContext: "Enterprise Multi-Region Infrastructure",
              recordedAt: "2026-01-01T00:00:00.000Z",
              recency: "RECENT",
              isVerified: false,
            },
            {
              sourceType: "CERTIFICATION",
              sourceId: "cert-1",
              sourceField: "name",
              displayContext: "AWS Solutions Architect Professional",
              recordedAt: "2024-01-01T00:00:00.000Z",
              recency: "NOT_RECENT",
              isVerified: true,
            },
          ],
          recency: "RECENT",
          strengthTier: "CORE",
        },
        {
          name: "Kubernetes",
          normalizedName: "kubernetes",
          authorityLevel: "EVIDENCED",
          evidenceDepth: 2,
          sources: [
            {
              sourceType: "EXPERIENCE",
              sourceId: "exp-1",
              sourceField: "technologies",
              displayContext: "Principal Cloud Engineer at CloudCorp",
              recordedAt: "2026-01-01T00:00:00.000Z",
              recency: "RECENT",
              isVerified: false,
            },
            {
              sourceType: "PROJECT",
              sourceId: "proj-1",
              sourceField: "technologies",
              displayContext: "Enterprise Multi-Region Infrastructure",
              recordedAt: "2026-01-01T00:00:00.000Z",
              recency: "RECENT",
              isVerified: false,
            },
          ],
          recency: "RECENT",
          strengthTier: "STRONG",
        },
        {
          name: "GraphQL",
          normalizedName: "graphql",
          authorityLevel: "SELF_DECLARED",
          evidenceDepth: 1,
          sources: [
            {
              sourceType: "DOCUMENT_EXTRACT",
              sourceId: "doc-1",
              sourceField: "rawExtract",
              displayContext: "Extracted from Resume",
              recordedAt: "2025-01-01T00:00:00.000Z",
              recency: "NOT_RECENT",
              isVerified: false,
            },
          ],
          recency: "NOT_RECENT",
          strengthTier: "EMERGING",
        },
        {
          name: "Docker",
          normalizedName: "docker",
          authorityLevel: "SELF_DECLARED",
          evidenceDepth: 1,
          sources: [
            {
              sourceType: "CANDIDATE_SKILL",
              sourceId: "skill-1",
              sourceField: "name",
              displayContext: "Declared on profile",
              recordedAt: "2025-01-01T00:00:00.000Z",
              recency: "NOT_RECENT",
              isVerified: false,
            },
          ],
          recency: "NOT_RECENT",
          strengthTier: "EMERGING",
        },
      ],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
      evidence: [],
      strengths: [
        {
          skillName: "AWS Cloud Architecture",
          normalizedName: "aws cloud architecture",
          tier: "CORE",
          evidenceDepth: 3,
          rationale: "Core competency backed by 3 independent sources",
          recency: "RECENT",
        },
      ],
      timeline: [
        {
          id: "exp-1",
          type: "EXPERIENCE",
          sourceId: "exp-1",
          title: "Principal Cloud Engineer",
          subtitle: "CloudCorp Inc",
          startDate: "2022-01-01",
          endDate: null,
          displayDate: "Jan 2022 – Present",
          isCurrent: true,
          technologies: ["AWS", "Terraform", "Kubernetes"],
          details: ["Architected multi-region platform"],
        },
        {
          id: "proj-1",
          type: "PROJECT",
          sourceId: "proj-1",
          title: "Enterprise Multi-Region Infrastructure",
          subtitle: "Production Project",
          startDate: "2023-01-01",
          endDate: "2023-12-31",
          displayDate: "2023",
          isCurrent: false,
          technologies: ["AWS", "Kubernetes"],
          details: ["Zero-downtime deployment engine"],
        },
      ],
      gaps: [
        {
          type: "DATA_GAP",
          category: "LINKS",
          title: "Missing Portfolio / GitHub Link",
          description: "No public portfolio, repository, or website is linked.",
          recommendation: "Add your GitHub or personal portfolio URL to provide direct verification.",
        },
        {
          type: "EVIDENCE_GAP",
          category: "UNCORROBORATED_SKILL",
          title: "GraphQL",
          description: "Declared in profile but no supporting experience or project evidence was found.",
          recommendation: "Add a project or detail where you utilized GraphQL to elevate it to evidenced standing.",
        },
      ],
      careerDirection: {
        targetRoles: ["Cloud Architect", "Staff Platform Engineer"],
        targetLocations: ["Austin, TX", "Remote"],
        remotePreference: "REMOTE_ONLY",
        desiredSalaryMin: 180000,
        desiredSalaryMax: 220000,
        salaryCurrency: "USD",
      },
      outcomesSummary: {
        totalOutcomes: 2,
        interviewRequestsCount: 1,
        offersCount: 0,
        employerDeclinesCount: 0,
        recentOutcomes: [],
      },
      freshness: {
        status: "FRESH",
        sourceDataVersion: "hash-123",
        computedAt: "2026-10-06T12:00:00.000Z",
      },
    },
    resume: {
      hasResume: true,
      status: "READY",
      overallLabel: "Optimized",
      atsLabel: "ATS Optimized",
      atsSummary: "Clear formatting, parseable structure, strong keyword density.",
      findingsCount: 0,
      documentTitle: "alex-rivera-resume.pdf",
      reviewedAt: "2026-03-01T12:00:00.000Z",
    },
    applications: {
      totalApplications: 5,
      readyCount: 3,
      blockedCount: 1,
      warningCount: 1,
      recentApplications: [],
    },
    matching: {
      totalRelevantMatches: 12,
      strongMatchCount: 4,
      goodMatchCount: 5,
      savedOpportunitiesCount: 3,
      requestedOpportunitiesCount: 1,
      topMatches: [],
    },
    outcomes: {
      totalOutcomes: 2,
      interviewRequestsCount: 1,
      offersCount: 0,
      employerDeclinesCount: 0,
      recentOutcomes: [],
    },
    freshness: {
      careerVersion: "v1.0",
      computedAt: "2026-10-06T12:00:00.000Z",
    },
  };

  it("renders the Career Overview hero with verified badge, headline, and metrics", () => {
    const html = renderToStaticMarkup(React.createElement(Candidate360View, { data: mockFullData }));

    expect(html).toContain("Alex Rivera");
    expect(html).toContain("Senior Cloud Infrastructure Architect");
    expect(html).toContain("Austin, TX, US");
    expect(html).toContain("8 Years Experience");
    expect(html).toContain("CITIZEN");
    expect(html).toContain("Verified Candidate");
  });

  it("renders authoritative strength tiers without synthetic scores or percentages", () => {
    const html = renderToStaticMarkup(React.createElement(Candidate360View, { data: mockFullData }));

    // Tier Badges
    expect(html).toContain("Core Competency");
    expect(html).toContain("Strong Capability");
    expect(html).toContain("Emerging Skill");

    // Prohibited synthetic AI claims
    expect(html).not.toContain("% confidence");
    expect(html).not.toContain("Top 5%");
    expect(html).not.toContain("AI confidence");
  });

  it("renders candidate-safe authority badges with exact frozen terminology", () => {
    const html = renderToStaticMarkup(React.createElement(Candidate360View, { data: mockFullData }));

    // Exact required labels
    expect(html).toContain("Verified Credential");
    expect(html).toContain("Supported by multiple records");
    expect(html).toContain("Added to profile");

    // Must not expose raw enum keys in the UI
    expect(html).not.toContain(">EVIDENCED<");
    expect(html).not.toContain(">SELF_DECLARED<");
    expect(html).not.toContain(">SYSTEM_DERIVED<");
  });

  it("renders chronological timeline without inferred promotions", () => {
    const html = renderToStaticMarkup(React.createElement(Candidate360View, { data: mockFullData }));

    expect(html).toContain("Principal Cloud Engineer");
    expect(html).toContain("CloudCorp Inc");
    expect(html).toContain("Jan 2022 – Present");
    expect(html).toContain("Enterprise Multi-Region Infrastructure");

    // Prohibited inferences
    expect(html).not.toContain("Promoted to");
    expect(html).not.toContain("Rapid advancement");
  });

  it("separates Missing Profile Information from Uncorroborated Skills constructively", () => {
    const html = renderToStaticMarkup(React.createElement(Candidate360View, { data: mockFullData }));

    expect(html).toContain("Actionable Areas to Strengthen");
    expect(html).toContain("Missing Profile Information");
    expect(html).toContain("Uncorroborated Skill");
    expect(html).toContain("Missing Portfolio / GitHub Link");
    expect(html).toContain("GraphQL");

    // Constructive text check
    expect(html).toContain("No public portfolio, repository, or website is linked");
    expect(html).not.toContain("You don&#x27;t know this");
    expect(html).not.toContain("Skill missing.");
  });

  it("renders Career Direction distinct from past career history", () => {
    const html = renderToStaticMarkup(React.createElement(Candidate360View, { data: mockFullData }));

    expect(html).toContain("Career Direction &amp; Target Goals");
    expect(html).toContain("Cloud Architect, Staff Platform Engineer");
    expect(html).toContain("Austin, TX, Remote");
    expect(html).toContain("REMOTE ONLY");
    expect(html).toContain("$180,000 – $220,000 USD");
  });

  it("renders concise subsystem operational snapshots with navigation links", () => {
    const html = renderToStaticMarkup(React.createElement(Candidate360View, { data: mockFullData }));

    expect(html).toContain("Resume Readiness");
    expect(html).toContain("ATS Optimized");
    expect(html).toContain("12 Relevant Matches");
    expect(html).toContain("5 Active Applications");
    expect(html).toContain("1 Interviews • 0 Offers");

    // Navigation links
    expect(html).toContain("/candidate/profile?section=documents");
    expect(html).toContain("/candidate/jobs");
    expect(html).toContain("/candidate/applications");
  });

  it("renders calm, meaningful empty states when data is minimal", () => {
    const emptyData: Candidate360DTO = {
      candidate: {
        id: "cand-empty",
        fullName: "Taylor Smith",
        email: "taylor@example.com",
        phone: null,
        headline: null,
        location: null,
        workAuthorization: "NEED_SPONSORSHIP",
        requiresSponsorship: true,
        verificationStatus: "UNVERIFIED",
        assignedSpecialist: null,
        totalYearsExperience: null,
        applicationAuthMode: "MANUAL",
      },
      career: {
        candidate: {
          id: "cand-empty",
          fullName: "Taylor Smith",
          email: "taylor@example.com",
          headline: null,
          city: null,
          state: null,
          country: "US",
          workAuthorization: "NEED_SPONSORSHIP",
          verificationStatus: "UNVERIFIED",
        },
        careerSnapshot: {
          totalYearsExperience: 0,
          headline: null,
          topStrengths: [],
          verifiedSkillsCount: 0,
          evidencedSkillsCount: 0,
          selfDeclaredSkillsCount: 0,
          totalEvidencedEntities: 0,
        },
        skills: [],
        experience: [],
        projects: [],
        education: [],
        certifications: [],
        evidence: [],
        strengths: [],
        timeline: [],
        gaps: [],
        careerDirection: {
          targetRoles: [],
          targetLocations: [],
          remotePreference: "NO_PREFERENCE",
          desiredSalaryMin: null,
          desiredSalaryMax: null,
          salaryCurrency: "USD",
        },
        outcomesSummary: {
          totalOutcomes: 0,
          interviewRequestsCount: 0,
          offersCount: 0,
          employerDeclinesCount: 0,
          recentOutcomes: [],
        },
        freshness: {
          status: "UNKNOWN",
          sourceDataVersion: "empty",
          computedAt: "2026-10-06T12:00:00.000Z",
        },
      },
      resume: {
        hasResume: false,
        status: "NOT_STARTED",
        overallLabel: null,
        atsLabel: null,
        atsSummary: null,
        findingsCount: 0,
        documentTitle: null,
        reviewedAt: null,
      },
      applications: {
        totalApplications: 0,
        readyCount: 0,
        blockedCount: 0,
        warningCount: 0,
        recentApplications: [],
      },
      matching: {
        totalRelevantMatches: 0,
        strongMatchCount: 0,
        goodMatchCount: 0,
        savedOpportunitiesCount: 0,
        requestedOpportunitiesCount: 0,
        topMatches: [],
      },
      outcomes: {
        totalOutcomes: 0,
        interviewRequestsCount: 0,
        offersCount: 0,
        employerDeclinesCount: 0,
        recentOutcomes: [],
      },
      freshness: {
        careerVersion: "v1.0",
        computedAt: "2026-10-06T12:00:00.000Z",
      },
    };

    const html = renderToStaticMarkup(React.createElement(Candidate360View, { data: emptyData }));

    // Safe empty states
    expect(html).toContain("We don&#x27;t have enough career evidence to highlight this yet.");
    expect(html).toContain("Your career milestones will appear here once added to your profile.");
    expect(html).toContain("Your career profile is robustly corroborated across projects, experience, and credentials.");
    expect(html).toContain("No Resume Uploaded");
    expect(html).toContain("No Outcomes Yet");

    // Does not say generic 'No data.'
    expect(html).not.toContain("No data.");
  });
});
