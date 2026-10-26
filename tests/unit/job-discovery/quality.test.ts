import { describe, it, expect } from "vitest";
import { assessJobQuality } from "@/lib/job-discovery/quality";

describe("Job Discovery Quality Assessor", () => {
  it("rates complete and fresh listings as SOURCE_CONFIRMED with high score", () => {
    const assessment = assessJobQuality({
      title: "Senior Cloud Infrastructure Engineer",
      companyName: "GitLab",
      externalUrl: "https://boards.greenhouse.io/gitlab/jobs/123456",
      jobDescription:
        "We are looking for a Senior Cloud Engineer to manage Kubernetes clusters, AWS infrastructure, and Terraform automation pipelines.",
      postedAt: new Date(Date.now() - 2 * 86400000), // 2 days ago
    });

    expect(assessment.qualityScore).toBe(100);
    expect(assessment.verificationStatus).toBe("SOURCE_CONFIRMED");
    expect(assessment.availabilityStatus).toBe("OPEN");
    expect(assessment.flags).toHaveLength(0);
  });

  it("detects in-text closure phrases and sets status to CLOSED", () => {
    const assessment = assessJobQuality({
      title: "Full Stack Developer",
      companyName: "Acme",
      externalUrl: "https://acme.taleo.net/job=123",
      jobDescription:
        "Thank you for your interest. This position has been filled and applications are no longer being accepted.",
    });

    expect(assessment.verificationStatus).toBe("CLOSED");
    expect(assessment.availabilityStatus).toBe("CLOSED");
    expect(assessment.flags).toContain("CLOSURE_PHRASE_DETECTED");
  });

  it("detects past closing dates and sets status to CLOSED", () => {
    const assessment = assessJobQuality({
      title: "Research Assistant",
      companyName: "University Health",
      externalUrl: "https://jobs.lever.co/univ/123",
      jobDescription: "Academic research position supporting oncology trials.",
      closingDate: new Date(Date.now() - 5 * 86400000), // 5 days ago
    });

    expect(assessment.verificationStatus).toBe("CLOSED");
    expect(assessment.availabilityStatus).toBe("CLOSED");
    expect(assessment.flags).toContain("PAST_CLOSING_DATE");
  });

  it("flags listings older than 90 days as STALE", () => {
    const assessment = assessJobQuality({
      title: "Operations Specialist",
      companyName: "Global Corp",
      externalUrl: "https://global.taleo.net/job=999",
      jobDescription: "Standard operations management and team communication responsibilities.",
      postedAt: new Date(Date.now() - 120 * 86400000), // 120 days ago
    });

    expect(assessment.verificationStatus).toBe("STALE");
    expect(assessment.flags).toContain("POSTING_OLDER_THAN_90_DAYS");
  });

  it("marks incomplete listings with missing URLs as NEEDS_VERIFICATION with penalized score", () => {
    const assessment = assessJobQuality({
      title: "Dev",
      companyName: "A",
      externalUrl: "invalid-url-without-protocol",
      jobDescription: "Short",
    });

    expect(assessment.qualityScore).toBeLessThan(60);
    expect(assessment.verificationStatus).toBe("NEEDS_VERIFICATION");
    expect(assessment.flags).toContain("INVALID_OR_MISSING_APPLICATION_URL");
  });
});
