import { describe, expect, it } from "vitest";
import {
  getPipelineListSubtitle,
  getPipelineListTitle,
  type PipelineStageKey,
} from "@/components/candidate/CandidatePipeline";

const STAGES: PipelineStageKey[] = [
  "ALL",
  "PREPARING",
  "UNDER_REVIEW",
  "AWAITING_APPROVAL",
  "READY",
  "SUBMITTED",
  "EMPLOYER_RESPONSE",
];

describe("Candidate Application Pipeline presentation", () => {
  it("maps every stage to a list title without raw enum keys", () => {
    for (const stage of STAGES) {
      const title = getPipelineListTitle(stage);
      expect(title.length).toBeGreaterThan(0);
      expect(title).not.toMatch(/_/);
    }
    expect(getPipelineListTitle("ALL")).toBe("Active & Recent Applications");
    expect(getPipelineListTitle("SUBMITTED")).toBe("Submitted Applications");
    expect(getPipelineListTitle("EMPLOYER_RESPONSE")).toBe("Closed / History");
  });

  it("provides stage-specific list subtitles", () => {
    expect(getPipelineListSubtitle("ALL")).toMatch(/operational list/i);
    expect(getPipelineListSubtitle("AWAITING_APPROVAL")).toMatch(/sign-off/i);
    expect(getPipelineListSubtitle("SUBMITTED")).toMatch(/receipts/i);
  });

  it("filters applications by stage matching statuses (mirrors list logic)", () => {
    const apps = [
      { id: "1", status: "PREPARING" },
      { id: "2", status: "REVIEW" },
      { id: "3", status: "AWAITING_APPROVAL" },
      { id: "4", status: "READY" },
      { id: "5", status: "SUBMITTED" },
      { id: "6", status: "RESUBMISSION" },
      { id: "7", status: "REJECTED" },
      { id: "8", status: "DISCOVERED" },
    ];

    const filter = (stage: PipelineStageKey) => {
      if (stage === "PREPARING") {
        return apps.filter((a) =>
          ["DISCOVERED", "QUALIFIED", "PREPARING"].includes(a.status)
        );
      }
      if (stage === "UNDER_REVIEW") {
        return apps.filter((a) =>
          ["REVIEW", "REVIEW_REQUIRED", "CORRECTION_APPROVED"].includes(a.status)
        );
      }
      if (stage === "AWAITING_APPROVAL") {
        return apps.filter((a) => a.status === "AWAITING_APPROVAL");
      }
      if (stage === "READY") {
        return apps.filter((a) => a.status === "READY");
      }
      if (stage === "SUBMITTED") {
        return apps.filter((a) =>
          ["SUBMITTED", "RESUBMISSION"].includes(a.status)
        );
      }
      if (stage === "EMPLOYER_RESPONSE") {
        return apps.filter((a) =>
          ["REJECTED", "WITHDRAWN", "FAILED"].includes(a.status)
        );
      }
      return apps;
    };

    expect(filter("ALL")).toHaveLength(8);
    expect(filter("PREPARING").map((a) => a.id)).toEqual(["1", "8"]);
    expect(filter("UNDER_REVIEW").map((a) => a.id)).toEqual(["2"]);
    expect(filter("AWAITING_APPROVAL").map((a) => a.id)).toEqual(["3"]);
    expect(filter("READY").map((a) => a.id)).toEqual(["4"]);
    expect(filter("SUBMITTED").map((a) => a.id)).toEqual(["5", "6"]);
    expect(filter("EMPLOYER_RESPONSE").map((a) => a.id)).toEqual(["7"]);
  });
});
