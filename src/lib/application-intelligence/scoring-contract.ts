import { INTELLIGENCE_SCORING_VERSION } from "./constants";

/**
 * Deterministic scoring contract (design only — no live scoring execution).
 * AI may assist semantic interpretation later; business score must remain
 * provider-independent and auditable.
 */

export const SCORING_DIMENSIONS = [
  "skills",
  "experience",
  "education",
  "location",
  "workAuthorization",
  "preferences",
] as const;

export type ScoringDimension = (typeof SCORING_DIMENSIONS)[number];

/** Weights sum to 100. */
export const SCORING_WEIGHTS: Record<ScoringDimension, number> = {
  skills: 30,
  experience: 25,
  education: 10,
  location: 10,
  workAuthorization: 15,
  preferences: 10,
};

/**
 * Within-dimension REQUIRED vs PREFERRED blend (Gate 6.14).
 * Preferred must not overpower required. Sums to 100.
 */
export const IMPORTANCE_WEIGHTS = {
  REQUIRED: 70,
  PREFERRED: 30,
} as const;

/** Deterministic fit-item numeric mapping before dimension aggregation. */
export const FIT_STATUS_SCORES = {
  MATCHED: 100,
  PARTIAL: 50,
  MISSING: 0,
} as const;

export type DimensionScore = {
  dimension: ScoringDimension;
  score: number | null;
  weight: number;
  status: "SCORED" | "UNKNOWN" | "NOT_APPLICABLE";
  evidenceIds: string[];
};

export type AlignmentScoreBreakdown = {
  scoringVersion: string;
  dimensions: DimensionScore[];
  overallScore: number | null;
  unknownDimensions: ScoringDimension[];
};

export function assertScoringWeightsValid(): void {
  const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    throw new Error(`Scoring weights must sum to 100, got ${sum}`);
  }
}

/**
 * Compute overall score from dimension scores.
 * UNKNOWN dimensions are excluded from the weighted average and listed.
 * If all dimensions are UNKNOWN → overallScore null (never fabricate 0/false).
 */
/**
 * Aggregate fit-item statuses into a single dimension score.
 * UNKNOWN items are excluded. If only UNKNOWN → status UNKNOWN.
 * REQUIRED/PREFERRED blend uses IMPORTANCE_WEIGHTS when both classes exist.
 */
export function scoreDimensionFromFitStatuses(
  items: Array<{
    importance: "REQUIRED" | "PREFERRED" | "UNKNOWN" | "NEEDS_REVIEW";
    status: "MATCHED" | "PARTIAL" | "MISSING" | "UNKNOWN";
  }>
): { score: number | null; status: "SCORED" | "UNKNOWN" | "NOT_APPLICABLE" } {
  if (items.length === 0) {
    return { score: null, status: "NOT_APPLICABLE" };
  }

  const scored = items.filter((i) => i.status !== "UNKNOWN");
  if (scored.length === 0) {
    return { score: null, status: "UNKNOWN" };
  }

  const numeric = (status: "MATCHED" | "PARTIAL" | "MISSING") =>
    FIT_STATUS_SCORES[status];

  const required = scored.filter((i) => i.importance === "REQUIRED");
  const preferred = scored.filter((i) => i.importance === "PREFERRED");
  // UNKNOWN/NEEDS_REVIEW importance treated as preferred-weight when scored
  const other = scored.filter(
    (i) => i.importance !== "REQUIRED" && i.importance !== "PREFERRED"
  );

  const avg = (
    list: Array<{ status: "MATCHED" | "PARTIAL" | "MISSING" | "UNKNOWN" }>
  ): number | null => {
    const usable = list.filter((i) => i.status !== "UNKNOWN") as Array<{
      status: "MATCHED" | "PARTIAL" | "MISSING";
    }>;
    if (usable.length === 0) return null;
    return (
      usable.reduce((a, i) => a + numeric(i.status), 0) / usable.length
    );
  };

  const reqAvg = avg(required);
  const prefAvg = avg([...preferred, ...other]);

  if (reqAvg != null && prefAvg != null) {
    return {
      score: Math.round(
        (IMPORTANCE_WEIGHTS.REQUIRED * reqAvg +
          IMPORTANCE_WEIGHTS.PREFERRED * prefAvg) /
          100
      ),
      status: "SCORED",
    };
  }
  if (reqAvg != null) {
    return { score: Math.round(reqAvg), status: "SCORED" };
  }
  if (prefAvg != null) {
    return { score: Math.round(prefAvg), status: "SCORED" };
  }
  return { score: null, status: "UNKNOWN" };
}

export function computeOverallScore(
  dimensions: Array<Pick<DimensionScore, "dimension" | "score" | "status">>
): AlignmentScoreBreakdown {
  assertScoringWeightsValid();

  const detailed: DimensionScore[] = SCORING_DIMENSIONS.map((dimension) => {
    const found = dimensions.find((d) => d.dimension === dimension);
    const weight = SCORING_WEIGHTS[dimension];
    if (!found || found.status === "UNKNOWN" || found.score == null) {
      return {
        dimension,
        score: null,
        weight,
        status: "UNKNOWN",
        evidenceIds: [],
      };
    }
    if (found.status === "NOT_APPLICABLE") {
      return {
        dimension,
        score: null,
        weight,
        status: "NOT_APPLICABLE",
        evidenceIds: [],
      };
    }
    const clamped = Math.max(0, Math.min(100, found.score));
    return {
      dimension,
      score: clamped,
      weight,
      status: "SCORED",
      evidenceIds: [],
    };
  });

  const scored = detailed.filter((d) => d.status === "SCORED" && d.score != null);
  const unknownDimensions = detailed
    .filter((d) => d.status === "UNKNOWN")
    .map((d) => d.dimension);

  if (scored.length === 0) {
    return {
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      dimensions: detailed,
      overallScore: null,
      unknownDimensions,
    };
  }

  const weightSum = scored.reduce((a, d) => a + d.weight, 0);
  const weighted = scored.reduce((a, d) => a + (d.score as number) * d.weight, 0);
  const overallScore = Math.round(weighted / weightSum);

  return {
    scoringVersion: INTELLIGENCE_SCORING_VERSION,
    dimensions: detailed,
    overallScore,
    unknownDimensions,
  };
}
