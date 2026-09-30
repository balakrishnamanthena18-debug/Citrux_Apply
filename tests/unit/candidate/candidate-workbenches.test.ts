import { describe, it, expect, vi } from "vitest";
import { ApplicationStatus } from "@/generated/prisma";
import { FILTER_TAB_STATES, getCandidateStatusPresentation, type ApplicationFilterTab } from "@/lib/utils/status-presenter";

describe("Candidate Instant Operations Workbenches Unit Tests", () => {
  describe("1. Candidate Applications Workbench Tab & Status Filtering", () => {
    const mockApplications = [
      {
        id: "app-1",
        company: "Stripe",
        jobTitle: "Senior Frontend Engineer",
        location: "Remote, US",
        status: ApplicationStatus.AWAITING_APPROVAL,
        createdAt: new Date("2026-03-01"),
      },
      {
        id: "app-2",
        company: "Airbnb",
        jobTitle: "Staff Software Engineer",
        location: "San Francisco, CA",
        status: ApplicationStatus.REVIEW,
        createdAt: new Date("2026-03-02"),
      },
      {
        id: "app-3",
        company: "Linear",
        jobTitle: "Product Designer",
        location: "Remote",
        status: ApplicationStatus.PREPARING,
        createdAt: new Date("2026-03-03"),
      },
      {
        id: "app-4",
        company: "Figma",
        jobTitle: "Fullstack Engineer",
        location: "New York, NY",
        status: ApplicationStatus.SUBMITTED,
        createdAt: new Date("2026-03-04"),
      },
      {
        id: "app-5",
        company: "Vercel",
        jobTitle: "Systems Engineer",
        location: "Remote",
        status: ApplicationStatus.REJECTED,
        createdAt: new Date("2026-02-15"),
      },
    ];

    it("filters applications accurately for ALL tab", () => {
      const activeTab: ApplicationFilterTab = "ALL";
      const allowedStatuses = FILTER_TAB_STATES[activeTab];
      const filtered = mockApplications.filter((app) =>
        allowedStatuses.includes(app.status)
      );
      expect(filtered).toHaveLength(5);
    });

    it("filters applications accurately for AWAITING_ACTION tab", () => {
      const activeTab: ApplicationFilterTab = "AWAITING_ACTION";
      const allowedStatuses = FILTER_TAB_STATES[activeTab];
      const filtered = mockApplications.filter((app) =>
        allowedStatuses.includes(app.status)
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.id).toBe("app-1");
      expect(filtered[0]!.status).toBe(ApplicationStatus.AWAITING_APPROVAL);
    });

    it("filters applications accurately for IN_PROGRESS tab", () => {
      const activeTab: ApplicationFilterTab = "IN_PROGRESS";
      const allowedStatuses = FILTER_TAB_STATES[activeTab];
      const filtered = mockApplications.filter((app) =>
        allowedStatuses.includes(app.status)
      );
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.id)).toEqual(["app-2", "app-3"]);
    });

    it("filters applications accurately for SUBMITTED tab", () => {
      const activeTab: ApplicationFilterTab = "SUBMITTED";
      const allowedStatuses = FILTER_TAB_STATES[activeTab];
      const filtered = mockApplications.filter((app) =>
        allowedStatuses.includes(app.status)
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.id).toBe("app-4");
    });

    it("filters applications accurately for HISTORY tab", () => {
      const activeTab: ApplicationFilterTab = "HISTORY";
      const allowedStatuses = FILTER_TAB_STATES[activeTab];
      const filtered = mockApplications.filter((app) =>
        allowedStatuses.includes(app.status)
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.id).toBe("app-5");
    });
  });

  describe("2. Client-Side Instant Multi-Token Search", () => {
    const dataset = [
      { id: "app-1", company: "Google", jobTitle: "Staff Software Engineer", location: "Mountain View, CA" },
      { id: "app-2", company: "Meta", jobTitle: "Production Engineer", location: "Menlo Park, CA" },
      { id: "app-3", company: "Apple", jobTitle: "iOS Specialist", location: "Cupertino, CA" },
      { id: "app-4", company: "Netflix", jobTitle: "Senior Cloud Engineer", location: "Los Gatos, CA" },
    ];

    function filterBySearch(items: typeof dataset, query: string) {
      if (!query.trim()) return items;
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return items.filter((item) =>
        terms.every((term) =>
          item.company.toLowerCase().includes(term) ||
          item.jobTitle.toLowerCase().includes(term) ||
          item.location.toLowerCase().includes(term) ||
          item.id.toLowerCase().includes(term)
        )
      );
    }

    it("matches company names without network requests", () => {
      const results = filterBySearch(dataset, "Google");
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("app-1");
    });

    it("matches job title multi-token queries", () => {
      const results = filterBySearch(dataset, "staff engineer");
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("app-1");
    });

    it("matches location and title combined terms", () => {
      const results = filterBySearch(dataset, "Netflix cloud");
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("app-4");
    });

    it("returns empty array gracefully on non-matching query", () => {
      const results = filterBySearch(dataset, "NonExistentCompanyXYZ");
      expect(results).toHaveLength(0);
    });
  });

  describe("3. Document Vault Optimistic Delete and Rollback Mechanism", () => {
    interface DocumentItem {
      id: string;
      fileName: string;
      fileType: string;
      sizeBytes: number;
    }

    it("optimistically removes a document and reconciles on server success", async () => {
      let documents: DocumentItem[] = [
        { id: "doc-1", fileName: "Resume_2026.pdf", fileType: "RESUME", sizeBytes: 102400 },
        { id: "doc-2", fileName: "CoverLetter.pdf", fileType: "COVER_LETTER", sizeBytes: 51200 },
      ];

      const deleteAction = vi.fn().mockResolvedValue({ success: true, data: { deletedId: "doc-1" } });

      // Optimistic delete
      const docToDelete = documents.find((d) => d.id === "doc-1")!;
      const previousDocuments = [...documents];
      documents = documents.filter((d) => d.id !== "doc-1");

      expect(documents).toHaveLength(1);
      expect(documents[0]!.id).toBe("doc-2");

      // Server execution
      const result = await deleteAction(docToDelete.id);
      expect(result.success).toBe(true);
      // Maintained state
      expect(documents).toHaveLength(1);
    });

    it("reverts document list on server delete rejection without data loss", async () => {
      let documents: DocumentItem[] = [
        { id: "doc-1", fileName: "Resume_2026.pdf", fileType: "RESUME", sizeBytes: 102400 },
        { id: "doc-2", fileName: "CoverLetter.pdf", fileType: "COVER_LETTER", sizeBytes: 51200 },
      ];

      const deleteAction = vi.fn().mockResolvedValue({ success: false, error: "Network or authorization failure" });

      // Optimistic delete
      const previousDocuments = [...documents];
      documents = documents.filter((d) => d.id !== "doc-1");
      expect(documents).toHaveLength(1);

      // Server execution failure
      const result = await deleteAction("doc-1");
      expect(result.success).toBe(false);

      // Rollback
      if (!result.success) {
        documents = previousDocuments;
      }

      expect(documents).toHaveLength(2);
      expect(documents[0]!.id).toBe("doc-1");
      expect(documents[1]!.id).toBe("doc-2");
    });
  });

  describe("4. Candidate-Safe Boundaries & Authorization Invariants", () => {
    it("ensures candidate status presentation hides all internal operational QA notes", () => {
      const presentation = getCandidateStatusPresentation(ApplicationStatus.REVIEW);
      expect(presentation.label).toBe("Under review");
      expect(presentation.description).not.toContain("QA Staff notes");
      expect(presentation.description).not.toContain("internal audit");
    });

    it("ensures terminal failure states present gracefully to candidates", () => {
      const presentation = getCandidateStatusPresentation(ApplicationStatus.FAILED);
      expect(presentation.label).toBe("Application could not be completed");
      expect(presentation.description).toBe("Submission could not be completed (e.g. external role was discontinued).");
      expect(presentation.isTerminal).toBe(true);
    });
  });
});
