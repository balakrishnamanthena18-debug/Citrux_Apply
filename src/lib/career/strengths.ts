/**
 * Phase 7C — Deterministic Career Strengths
 * Strictly implements Phase 7B.1 Decision Lock D2 & D8.
 *
 * NO synthetic 0–100 scores. NO star ratings. NO percentiles.
 */

import type { EvidencedSkillDTO, CareerStrengthItem } from "./types";

/**
 * Derives deterministic career strengths from evaluated skills.
 */
export function deriveCareerStrengths(skills: EvidencedSkillDTO[]): CareerStrengthItem[] {
  const items: CareerStrengthItem[] = [];

  for (const skill of skills) {
    let rationale = "";
    const sourceTypes = Array.from(new Set(skill.sources.map((s) => s.sourceType)));
    const sourcesSummary = sourceTypes
      .map((t) => {
        switch (t) {
          case "EXPERIENCE":
            return "Work Experience";
          case "PROJECT":
            return "Portfolio Project";
          case "CERTIFICATION":
            return "Certification";
          case "DOCUMENT_EXTRACT":
            return "Resume Extract";
          case "ATTESTATION":
            return "Staff Attestation";
          case "CANDIDATE_SKILL":
            return "Profile Skill";
          default:
            return t;
        }
      })
      .join(", ");

    if (skill.strengthTier === "CORE") {
      rationale = `Core competency corroborated across ${skill.evidenceDepth} independent entities (${sourcesSummary}) with active recent application.`;
    } else if (skill.strengthTier === "STRONG") {
      rationale = `Strong capability corroborated across ${skill.evidenceDepth} independent entities (${sourcesSummary}).`;
    } else {
      rationale = `Emerging skill supported by 1 source (${sourcesSummary}).`;
    }

    items.push({
      skillName: skill.name,
      normalizedName: skill.normalizedName,
      tier: skill.strengthTier,
      evidenceDepth: skill.evidenceDepth,
      rationale,
      recency: skill.recency,
    });
  }

  // Sort: CORE first, then STRONG, then EMERGING; then by evidenceDepth descending; then alphabetically
  items.sort((a, b) => {
    const tierOrder = { CORE: 3, STRONG: 2, EMERGING: 1 };
    if (tierOrder[b.tier] !== tierOrder[a.tier]) {
      return tierOrder[b.tier] - tierOrder[a.tier];
    }
    if (b.evidenceDepth !== a.evidenceDepth) {
      return b.evidenceDepth - a.evidenceDepth;
    }
    return a.skillName.localeCompare(b.skillName);
  });

  return items;
}
