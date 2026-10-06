import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { extractResumeTextFromBuffer } from "@/lib/resume-intelligence/extract";
import { analyzeAtsReadability } from "@/lib/resume-intelligence/ats-readability";
import { analyzeResumeRepresentation } from "@/lib/resume-intelligence/representation";
import { presentResumeReview } from "@/lib/resume-intelligence/presentation";
import {
  buildResumeReviewIdempotencyKey,
  humanResumeStatusMessage,
  RESUME_ANALYSIS_VERSION,
  sha256Hex,
} from "@/lib/resume-intelligence/constants";
import { validateMaterialDocumentBinding } from "@/lib/application-intelligence/materials-contract";

const ROOT = join(__dirname, "../../..");

describe("Phase 4 — ATS & Resume Intelligence", () => {
  describe("Material binding (4A)", () => {
    it("requires RESUME type and matching server-side version", () => {
      expect(
        validateMaterialDocumentBinding({
          candidateDocumentId: "doc-1",
          documentVersion: 1,
          documentVersionNumber: 1,
          documentType: "RESUME",
        }).ok
      ).toBe(true);

      expect(
        validateMaterialDocumentBinding({
          candidateDocumentId: "doc-1",
          documentVersion: 2,
          documentVersionNumber: 1,
          documentType: "RESUME",
        }).ok
      ).toBe(false);

      expect(
        validateMaterialDocumentBinding({
          candidateDocumentId: "doc-1",
          documentVersion: 1,
          documentVersionNumber: 1,
          documentType: "COVER_LETTER",
        }).ok
      ).toBe(false);
    });

    it("hardens updateApplicationMaterialAction to ignore browser version", () => {
      const src = readFileSync(
        join(ROOT, "src/lib/application/actions.ts"),
        "utf8"
      );
      expect(src).toContain('doc.documentType !== "RESUME"');
      expect(src).toContain("boundDocumentVersion = doc.versionNumber");
      expect(src).not.toMatch(
        /documentVersion:\s*parsed\.data\.documentVersion\s*\|\|\s*1/
      );
    });
  });

  describe("Extraction (4C)", () => {
    it("returns EMPTY for empty buffer", async () => {
      const result = await extractResumeTextFromBuffer({
        buffer: Buffer.alloc(0),
        mimeType: "application/pdf",
      });
      expect(result.parseStatus).toBe("EMPTY");
      expect(result.text).toBe("");
    });

    it("returns FAILED for oversized documents", async () => {
      const result = await extractResumeTextFromBuffer({
        buffer: Buffer.alloc(11 * 1024 * 1024),
        mimeType: "application/pdf",
      });
      expect(result.parseStatus).toBe("FAILED");
      expect(result.errorCode).toBe("DOCUMENT_TOO_LARGE");
    });

    it("extracts text from a minimal DOCX zip-like unsupported/corrupt gracefully", async () => {
      const result = await extractResumeTextFromBuffer({
        buffer: Buffer.from("not-a-real-docx"),
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      expect(["FAILED", "UNSUPPORTED", "EMPTY"]).toContain(result.parseStatus);
      expect(result.text).toBe("");
    });

    it("is content-hash aware for idempotency keys", () => {
      const a = sha256Hex("hello");
      const b = sha256Hex("hello");
      const c = sha256Hex("world");
      expect(a).toBe(b);
      expect(a).not.toBe(c);
    });
  });

  describe("ATS readability (4D)", () => {
    it("marks readable structured resumes as good", () => {
      const text = `
Jane Doe
jane@example.com
+1 555 0100

EXPERIENCE
Senior Engineer at Acme

EDUCATION
B.S. Computer Science

SKILLS
TypeScript React PostgreSQL
      `.trim();
      const result = analyzeAtsReadability({
        parseStatus: "SUCCESS",
        text,
        pageCount: 1,
        charCount: text.length,
      });
      expect(result.label).toBe("good");
      expect(result.summary).toMatch(/easy for common automated systems/i);
      expect(result.signals.hasContactSignal).toBe(true);
      expect(result.signals.hasExperienceSection).toBe(true);
    });

    it("flags empty / unreadable resumes without inventing content", () => {
      const result = analyzeAtsReadability({
        parseStatus: "EMPTY",
        text: "",
        pageCount: 1,
        charCount: 0,
      });
      expect(result.label).toBe("unreadable");
      expect(result.summary).toMatch(/harder for automated systems/i);
    });
  });

  describe("Representation analysis (4E)", () => {
    it("reports missing profile skills without fabricating metrics", () => {
      const result = analyzeResumeRepresentation({
        resumeText: "Jane Doe\nSenior Engineer\nReact",
        parseOk: true,
        candidate: {
          skills: [
            { id: "s1", name: "React" },
            { id: "s2", name: "PostgreSQL" },
          ],
          experiences: [
            {
              id: "e1",
              companyName: "Acme",
              jobTitle: "Senior Engineer",
              technologies: ["React"],
              description: null,
            },
          ],
          projects: [],
          educations: [],
          certifications: [],
        },
        requirements: [{ id: "r1", text: "PostgreSQL" }],
      });

      expect(result.recommendations.some((r) => /PostgreSQL/i.test(r.message))).toBe(
        true
      );
      expect(result.strengths.some((s) => /React/i.test(s.message))).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/40%/);
      expect(JSON.stringify(result)).not.toMatch(/improved performance/i);
    });

    it("does not invent unsupported requirement recommendations", () => {
      const result = analyzeResumeRepresentation({
        resumeText: "Jane Doe engineer",
        parseOk: true,
        candidate: {
          skills: [{ id: "s1", name: "React" }],
          experiences: [],
          projects: [],
          educations: [],
          certifications: [],
        },
        requirements: [{ id: "r1", text: "Kubernetes operators" }],
      });
      expect(
        result.recommendations.some((r) => /Kubernetes/i.test(r.message))
      ).toBe(false);
    });
  });

  describe("Presentation / privacy (4F)", () => {
    it("never surfaces extracted text or internal jargon", () => {
      const presented = presentResumeReview({
        review: {
          status: "READY",
          freshness: "CURRENT",
          overallLabel: "good_foundation",
          overallSummary: "Your resume represents most of your relevant experience.",
          atsReadability: {
            label: "good",
            summary: "Your resume appears easy for common automated systems to read.",
            findings: [],
          },
          strengths: [{ label: "React", message: "Your React experience is clearly represented." }],
          recommendations: [
            {
              code: "x",
              category: "MISSING_FROM_RESUME",
              title: "PostgreSQL",
              message: "Your profile includes PostgreSQL, but it is not clearly highlighted.",
            },
          ],
          completedAt: new Date("2026-10-05T00:00:00Z"),
          candidateDocument: { title: "Alex Resume" },
        },
      });

      const blob = JSON.stringify(presented);
      expect(presented.status).toBe("READY");
      expect(blob).not.toContain("extractedText");
      expect(blob).not.toContain("scoring.v1");
      expect(blob).not.toContain("JobRequirementSet");
      expect(blob).not.toContain(RESUME_ANALYSIS_VERSION);
      expect(humanResumeStatusMessage("ANALYZING")).toMatch(/reviewing your resume/i);
    });

    it("wires Resume Review UI without Phase 2 contract edits", () => {
      const panel = readFileSync(
        join(ROOT, "src/components/resume-intelligence/ResumeReviewPanel.tsx"),
        "utf8"
      );
      const scoring = readFileSync(
        join(ROOT, "src/lib/application-intelligence/scoring-contract.ts"),
        "utf8"
      );
      expect(panel).toContain("Resume Review");
      expect(panel).toContain("How well this resume represents your experience");
      expect(scoring).not.toContain("ResumeReview");
      expect(scoring).not.toContain("CandidateDocumentExtract");
    });
  });

  describe("Async / idempotency (4G)", () => {
    it("builds stable idempotency keys", () => {
      const a = buildResumeReviewIdempotencyKey({
        organizationId: "org",
        candidateId: "cand",
        applicationId: "app",
        candidateDocumentId: "doc",
        sourceDataVersion: "abc",
      });
      const b = buildResumeReviewIdempotencyKey({
        organizationId: "org",
        candidateId: "cand",
        applicationId: "app",
        candidateDocumentId: "doc",
        sourceDataVersion: "abc",
      });
      expect(a).toBe(b);
      expect(a.length).toBeLessThanOrEqual(191);
    });
  });
});
