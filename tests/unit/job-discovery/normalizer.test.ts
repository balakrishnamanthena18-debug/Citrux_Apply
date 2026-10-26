import { describe, it, expect } from "vitest";
import {
  normalizeCompanyName,
  normalizeJobTitle,
  detectWorkArrangement,
  inferIndustry,
  inferSeniority,
  parseLocation,
  extractSkills,
} from "@/lib/job-discovery/normalizer";

describe("Job Discovery Normalizer", () => {
  describe("Company Name Normalization", () => {
    it("strips corporate suffixes (Inc, LLC, Corp, Ltd, Pvt)", () => {
      expect(normalizeCompanyName("Acme Technologies Inc.")).toBe("Acme Technologies");
      expect(normalizeCompanyName("Global Health LLC")).toBe("Global Health");
      expect(normalizeCompanyName("Pinnacle Financial Corp")).toBe("Pinnacle Financial");
      expect(normalizeCompanyName("Apex Dynamics Ltd.")).toBe("Apex Dynamics");
    });

    it("parses domain / ATS subdomain paths to friendly company names", () => {
      expect(normalizeCompanyName("textron.taleo.net/tabbu")).toBe("Textron");
      expect(normalizeCompanyName("starbucks.taleo.net/1000222ef")).toBe("Starbucks");
    });

    it("preserves already clean names", () => {
      expect(normalizeCompanyName("Stripe")).toBe("Stripe");
      expect(normalizeCompanyName("Tesla")).toBe("Tesla");
    });
  });

  describe("Job Title Normalization", () => {
    it("cleans tags, hashtags, and social clutter from titles", () => {
      expect(normalizeJobTitle("engineer II - Front-End iOS #tobeapartner")).toBe(
        "engineer II - Front-End iOS"
      );
      expect(normalizeJobTitle("Registered Nurse (RN) - Observation 🏥")).toBe(
        "Registered Nurse (RN) - Observation"
      );
    });

    it("cleans excessive whitespace and trailing requisition identifiers", () => {
      expect(normalizeJobTitle("  Senior DevOps Engineer   (req-12345)  ")).toBe(
        "Senior DevOps Engineer"
      );
    });
  });

  describe("Work Arrangement Detection", () => {
    it("identifies REMOTE roles", () => {
      expect(detectWorkArrangement("Anywhere", "100% remote position", "Senior React Developer")).toBe(
        "REMOTE"
      );
      expect(detectWorkArrangement("US", "Work from home full time", "Customer Specialist")).toBe(
        "REMOTE"
      );
    });

    it("identifies HYBRID roles", () => {
      expect(detectWorkArrangement("New York, NY", "Hybrid schedule 2 days in office", "Financial Analyst")).toBe(
        "HYBRID"
      );
    });

    it("identifies ONSITE roles", () => {
      expect(detectWorkArrangement("Detroit, MI", "On-site hospital clinical shift", "Staff Nurse")).toBe(
        "ONSITE"
      );
    });

    it("defaults to UNSPECIFIED when no clear signal exists", () => {
      expect(detectWorkArrangement("Chicago, IL", "Standard professional responsibilities", "Accountant")).toBe(
        "UNSPECIFIED"
      );
    });
  });

  describe("Industry Classification", () => {
    it("classifies healthcare positions correctly", () => {
      expect(inferIndustry("Registered Nurse Clinical Coordinator", "Patient care at hospital")).toBe(
        "healthcare"
      );
      expect(inferIndustry("Medical Lab Scientist - Hematology", "Clinical diagnostic lab testing")).toBe(
        "healthcare"
      );
    });

    it("classifies finance and banking positions correctly", () => {
      expect(inferIndustry("Senior Financial Analyst", "Budget forecasting, treasury, and accounting")).toBe(
        "finance_banking"
      );
      expect(inferIndustry("Commercial Credit Underwriter", "Banking loan portfolio reviews")).toBe(
        "finance_banking"
      );
    });

    it("classifies technology and software positions correctly", () => {
      expect(inferIndustry("Senior Frontend Engineer", "Building web applications with React and TypeScript")).toBe(
        "technology"
      );
    });

    it("classifies cybersecurity and data/ai positions correctly", () => {
      expect(inferIndustry("SOC Analyst", "Threat hunting, vulnerability monitoring, SIEM analysis")).toBe(
        "cybersecurity"
      );
      expect(inferIndustry("Machine Learning Engineer", "Developing deep learning models and data pipelines")).toBe(
        "data_ai"
      );
    });

    it("classifies public sector, hospitality, and manufacturing", () => {
      expect(inferIndustry("Civil Service Director", "Municipal city governance")).toBe(
        "public_sector"
      );
      expect(inferIndustry("PM Line Cook", "Hotel kitchen and culinary dining operations")).toBe(
        "hospitality"
      );
      expect(inferIndustry("Process Operator - 12 Hour Shift", "Plant manufacturing and fabrication machinery")).toBe(
        "manufacturing_engineering"
      );
    });
  });

  describe("Seniority Level Inference", () => {
    it("identifies executive, director, lead, senior, entry, and intern", () => {
      expect(inferSeniority("Chief Technology Officer")).toBe("EXECUTIVE");
      expect(inferSeniority("Director of Patient Care")).toBe("DIRECTOR");
      expect(inferSeniority("Lead Software Architect")).toBe("LEAD");
      expect(inferSeniority("Senior Systems Administrator")).toBe("SENIOR");
      expect(inferSeniority("Junior Data Analyst")).toBe("ENTRY");
      expect(inferSeniority("Operations Research Intern")).toBe("INTERN");
    });

    it("returns null when seniority is unstated", () => {
      expect(inferSeniority("Customer Support Representative")).toBeNull();
    });
  });

  describe("Location Parsing", () => {
    it("parses hyphenated ATS location strings", () => {
      const loc = parseLocation("US-TN-Nashville");
      expect(loc.country).toBe("US");
      expect(loc.state).toBe("TN");
      expect(loc.city).toBe("Nashville");
    });

    it("parses comma-separated location strings", () => {
      const loc = parseLocation("Pittsford, New York, United States");
      expect(loc.city).toBe("Pittsford");
      expect(loc.state).toBe("New York");
      expect(loc.country).toBe("United States");
    });
  });

  describe("Skills Extraction", () => {
    it("extracts recognized skills from text", () => {
      const skills = extractSkills("Looking for a developer with React, TypeScript, Docker, and PostgreSQL experience.");
      expect(skills).toContain("React");
      expect(skills).toContain("TypeScript");
      expect(skills).toContain("Docker");
      expect(skills).toContain("PostgreSQL");
    });
  });
});
