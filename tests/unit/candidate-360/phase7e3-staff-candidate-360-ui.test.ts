import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffCandidate360View } from "@/components/candidate/StaffCandidate360View";
import type { Candidate360DTO } from "@/lib/candidate-360/types";

describe("PHASE 7E.3: Staff Candidate 360 UI Component Tests", () => {
  const mockStaffCandidate360Data: Candidate360DTO = {
    candidate: {
      id: "cand-999",
      fullName: "Jordan Lee",
      email: "jordan.lee@example.com",
      phone: "+1-555-0199",
      headline: "Staff Cloud Systems Engineer",
      location: "San Francisco, CA, US",
      workAuthorization: "CITIZEN",
      requiresSponsorship: false,
      verificationStatus: "VERIFIED",
      assignedSpecialist: {
        id: "emp-42",
        name: "Devon Specialist",
        email: "devon@citrux.com",
      },
      totalYearsExperience: 10,
      applicationAuthMode: "MANAGED",
    },
    career: {
      candidate: {
        id: "cand-999",
        fullName: "Jordan Lee",
        email: "jordan.lee@example.com",
        headline: "Staff Cloud Systems Engineer",
        city: "San Francisco",
        state: "CA",
        country: "US",
        workAuthorization: "CITIZEN",
        verificationStatus: "VERIFIED",
      },
      careerSnapshot: {
        totalYearsExperience: 10,
        headline: "Staff Cloud Systems Engineer",
        topStrengths: ["Kubernetes Platform", "Distributed Systems"],
        verifiedSkillsCount: 3,
        evidencedSkillsCount: 5,
        selfDeclaredSkillsCount: 2,
        totalEvidencedEntities: 12,
      },
      skills: [
        {
          name: "Kubernetes Platform",
          normalizedName: "kubernetes platform",
          authorityLevel: "VERIFIED",
          evidenceDepth: 4,
          sources: [
            {
              sourceType: "EXPERIENCE",
              sourceId: "exp-1",
              sourceField: "technologies",
              displayContext: "Staff Systems Engineer at ScaleCorp",
              recordedAt: "2026-01-01T00:00:00.000Z",
              recency: "RECENT",
              isVerified: true,
            },
            {
              sourceType: "CERTIFICATION",
              sourceId: "cert-1",
              sourceField: "name",
              displayContext: "Certified Kubernetes Administrator (CKA)",
              recordedAt: "2025-01-01T00:00:00.000Z",
              recency: "RECENT",
              isVerified: true,
            },
          ],
          recency: "RECENT",
          strengthTier: "CORE",
        },
        {
          name: "Distributed Systems",
          normalizedName: "distributed systems",
          authorityLevel: "EVIDENCED",
          evidenceDepth: 2,
          sources: [
            {
              sourceType: "EXPERIENCE",
              sourceId: "exp-1",
              sourceField: "technologies",
              displayContext: "Staff Systems Engineer at ScaleCorp",
              recordedAt: "2026-01-01T00:00:00.000Z",
              recency: "RECENT",
              isVerified: false,
            },
            {
              sourceType: "PROJECT",
              sourceId: "proj-1",
              sourceField: "technologies",
              displayContext: "High-Throughput Raft Cluster",
              recordedAt: "2025-06-01T00:00:00.000Z",
              recency: "RECENT",
              isVerified: false,
            },
          ],
          recency: "RECENT",
          strengthTier: "STRONG",
        },
        {
          name: "Terraform",
          normalizedName: "terraform",
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
      projects: [
        {
          id: "proj-1",
          title: "High-Throughput Raft Cluster",
          role: "Lead Architect",
          url: "https://github.com/jordanlee/raft-cluster",
          technologies: ["Go", "Kubernetes", "gRPC"],
          highlights: ["Sub-millisecond consensus", "Zero-downtime failover"],
          startDate: "2024-01-01",
          endDate: "2025-01-01",
        },
      ],
      education: [],
      certifications: [],
      evidence: [],
      strengths: [
        {
          skillName: "Kubernetes Platform",
          normalizedName: "kubernetes platform",
          tier: "CORE",
          evidenceDepth: 4,
          rationale: "Corroborated across 4 independent entities with verified certification",
          recency: "RECENT",
        },
      ],
      timeline: [
        {
          id: "exp-1",
          type: "EXPERIENCE",
          sourceId: "exp-1",
          title: "Staff Systems Engineer",
          subtitle: "ScaleCorp Inc",
          startDate: "2021-01-01",
          endDate: null,
          displayDate: "2021 – Present",
          isCurrent: true,
          technologies: ["Kubernetes", "Go", "Distributed Systems"],
          details: ["Managed core multi-tenant platform cluster"],
        },
        {
          id: "proj-1",
          type: "PROJECT",
          sourceId: "proj-1",
          title: "High-Throughput Raft Cluster",
          subtitle: "Portfolio Project",
          startDate: "2024-01-01",
          endDate: "2025-01-01",
          displayDate: "2024 – 2025",
          isCurrent: false,
          technologies: ["Go", "Kubernetes", "gRPC"],
          details: ["Sub-millisecond consensus"],
        },
      ],
      gaps: [
        {
          type: "DATA_GAP",
          category: "PROFILE",
          title: "Missing LinkedIn Profile Link",
          description: "No verified LinkedIn profile URL provided.",
          recommendation: "Request candidate to link verified professional profile.",
        },
        {
          type: "EVIDENCE_GAP",
          category: "UNCORROBORATED_SKILL",
          title: "Terraform",
          description: "Declared in profile but lacks supporting project or employment records.",
          recommendation: "Request candidate to link an infrastructure project demonstrating Terraform.",
        },
      ],
      careerDirection: {
        targetRoles: ["Principal Architect", "Staff Infrastructure Engineer"],
        targetLocations: ["San Francisco, CA", "Remote"],
        remotePreference: "REMOTE_ONLY",
        desiredSalaryMin: 220000,
        desiredSalaryMax: 260000,
        salaryCurrency: "USD",
      },
      outcomesSummary: {
        totalOutcomes: 3,
        interviewRequestsCount: 2,
        offersCount: 1,
        employerDeclinesCount: 0,
        recentOutcomes: [
          {
            outcomeType: "OFFER_RECEIVED",
            recordedAt: "2026-03-01T10:00:00.000Z",
            candidateVisible: true,
          },
        ],
      },
      freshness: {
        status: "FRESH",
        sourceDataVersion: "hash-999",
        computedAt: "2026-10-06T12:00:00.000Z",
      },
    },
    resume: {
      hasResume: true,
      status: "READY",
      overallLabel: "Optimal ATS Readability",
      atsLabel: "ATS Optimized",
      atsSummary: "Clear structural hierarchy, standard headings, parseable contact metadata.",
      findingsCount: 0,
      documentTitle: "jordan-lee-cv-2026.pdf",
      reviewedAt: "2026-02-15T12:00:00.000Z",
    },
    applications: {
      totalApplications: 6,
      readyCount: 4,
      blockedCount: 1,
      warningCount: 1,
      recentApplications: [
        {
          id: "app-101",
          jobTitle: "Principal Infrastructure Architect",
          companyName: "HyperCloud Systems",
          status: "READY",
          readinessState: "READY",
          blockersCount: 0,
          warningsCount: 0,
          createdAt: "2026-03-01T12:00:00.000Z",
        },
        {
          id: "app-102",
          jobTitle: "Staff Cloud Engineer",
          companyName: "NexusTech",
          status: "REVIEW",
          readinessState: "BLOCKED",
          blockersCount: 1,
          warningsCount: 1,
          createdAt: "2026-02-28T12:00:00.000Z",
        },
      ],
    },
    matching: {
      totalRelevantMatches: 15,
      strongMatchCount: 6,
      goodMatchCount: 7,
      savedOpportunitiesCount: 2,
      requestedOpportunitiesCount: 2,
      topMatches: [
        {
          jobId: "job-501",
          jobTitle: "Principal Infrastructure Architect",
          companyName: "HyperCloud Systems",
          location: "San Francisco, CA",
          isRemote: true,
          matchCategory: "STRONG_MATCH",
          isSaved: true,
          isRequested: true,
        },
      ],
    },
    outcomes: {
      totalOutcomes: 3,
      interviewRequestsCount: 2,
      offersCount: 1,
      employerDeclinesCount: 0,
      recentOutcomes: [
        {
          outcomeType: "OFFER_RECEIVED",
          recordedAt: "2026-03-01T10:00:00.000Z",
          candidateVisible: true,
        },
      ],
    },
    staffContext: {
      internalNotesCount: 4,
      activeTasksCount: 2,
      attestationsCount: 1,
    },
    freshness: {
      careerVersion: "v1.0",
      computedAt: "2026-10-06T12:00:00.000Z",
    },
  };

  it("renders the Staff Candidate 360 Header with operational ownership and status", () => {
    const html = renderToStaticMarkup(
      React.createElement(StaffCandidate360View, { data: mockStaffCandidate360Data })
    );

    expect(html).toContain("Jordan Lee");
    expect(html).toContain("Staff Cloud Systems Engineer");
    expect(html).toContain("San Francisco, CA, US");
    expect(html).toContain("10 Years Exp");
    expect(html).toContain("CITIZEN");
    expect(html).toContain("Devon Specialist");
    expect(html).toContain("Managed Mode");
    expect(html).toContain("Staff Operational 360");
  });

  it("renders the operational status bar with bounded metrics and confidential staff context", () => {
    const html = renderToStaticMarkup(
      React.createElement(StaffCandidate360View, { data: mockStaffCandidate360Data })
    );

    expect(html).toContain("6");
    expect(html).toContain("4 Ready • 1 Blocked");
    expect(html).toContain("15");
    expect(html).toContain("6 Strong • 2 Saved");
    expect(html).toContain("ATS Optimized");
    expect(html).toContain("4 Notes");
    expect(html).toContain("2 Tasks • Confidential");
  });

  it("renders career evidence with staff-safe provenance and exact authority labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(StaffCandidate360View, { data: mockStaffCandidate360Data })
    );

    expect(html).toContain("Kubernetes Platform");
    expect(html).toContain("Core Competency");
    expect(html).toContain("Verified Credential");
    expect(html).toContain("Distributed Systems");
    expect(html).toContain("Strong Capability");
    expect(html).toContain("Supported by multiple records");

    // Prohibit synthetic AI claims
    expect(html).not.toContain("% confidence");
    expect(html).not.toContain("Top 5%");
    expect(html).not.toContain("AI confidence");
  });

  it("renders navigation tabs allowing staff to switch between operational domains", () => {
    const html = renderToStaticMarkup(
      React.createElement(StaffCandidate360View, { data: mockStaffCandidate360Data })
    );

    expect(html).toContain("Career Evidence (3)");
    expect(html).toContain("Applications (6)");
    expect(html).toContain("Job Matches (15)");
    expect(html).toContain("Timeline (2)");
    expect(html).toContain("Strengths &amp; Gaps (2)");
    expect(html).toContain("Outcomes (3)");
    expect(html).toContain("Operations &amp; Governance");
  });

  it("renders action slots for operational assignment, verification, and governance", () => {
    const mockSlots = {
      assignmentControl: React.createElement("div", { id: "test-assignment" }, "Assignment Control"),
      verificationControl: React.createElement("div", { id: "test-verification" }, "Verification Control"),
      notesWidget: React.createElement("div", { id: "test-notes" }, "Confidential Staff Notes Widget"),
    };

    const html = renderToStaticMarkup(
      React.createElement(StaffCandidate360View, {
        data: mockStaffCandidate360Data,
        actionSlots: mockSlots,
      })
    );

    // Notes widget rendered at bottom
    expect(html).toContain("test-notes");
    expect(html).toContain("Confidential Staff Notes Widget");
  });

  it("renders clean empty states when operational records are absent", () => {
    const emptyStaffData: Candidate360DTO = {
      candidate: {
        id: "cand-empty",
        fullName: null,
        email: "empty@citrux.com",
        phone: null,
        headline: null,
        location: null,
        workAuthorization: "CITIZEN",
        requiresSponsorship: false,
        verificationStatus: "UNVERIFIED",
        assignedSpecialist: null,
        totalYearsExperience: null,
        applicationAuthMode: "MANUAL",
      },
      career: {
        candidate: {
          id: "cand-empty",
          fullName: null,
          email: "empty@citrux.com",
          headline: null,
          city: null,
          state: null,
          country: "US",
          workAuthorization: "CITIZEN",
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
      staffContext: {
        internalNotesCount: 0,
        activeTasksCount: 0,
        attestationsCount: 0,
      },
      freshness: {
        careerVersion: "v1.0",
        computedAt: "2026-10-06T12:00:00.000Z",
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(StaffCandidate360View, { data: emptyStaffData })
    );

    expect(html).toContain("No career evidence recorded in this strength tier yet.");
    expect(html).toContain("Unassigned");
    expect(html).toContain("No Resume");
    expect(html).toContain("0 Notes");
    expect(html).not.toContain("No data.");
  });
});
