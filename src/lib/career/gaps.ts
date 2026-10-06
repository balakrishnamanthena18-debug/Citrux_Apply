/**
 * Phase 7C — Deterministic Career Gaps (Data Gaps vs Evidence Gaps)
 * Strictly implements Phase 7B.1 Decision Lock D9.
 *
 * STRICT GUARDRAIL: Never state "You don't know X" or infer incompetence.
 * Always formulate objective, evidence-backed observations.
 */

import type { EvidencedSkillDTO, CareerGapItem } from "./types";

export interface CandidateProfileStructureInput {
  hasExperiences: boolean;
  hasProjects: boolean;
  hasEducation: boolean;
  hasCertifications: boolean;
  hasPortfolioOrRepo: boolean;
  targetRoles: string[];
}

/**
 * Derives deterministic career gaps from candidate profile structure and skill evidence.
 */
export function deriveCareerGaps(input: {
  profile: CandidateProfileStructureInput;
  skills: EvidencedSkillDTO[];
}): CareerGapItem[] {
  const gaps: CareerGapItem[] = [];

  // 1. DATA GAPS (Missing profile structure / documentation)
  if (!input.profile.hasProjects) {
    gaps.push({
      type: "DATA_GAP",
      category: "PROJECTS",
      title: "No Project Portfolio Entries",
      description: "No independent project portfolio items are currently recorded in the active profile.",
      recommendation: "Add projects demonstrating technologies and real-world outcomes to strengthen evidence.",
    });
  }

  if (!input.profile.hasExperiences) {
    gaps.push({
      type: "DATA_GAP",
      category: "EXPERIENCE",
      title: "No Work Experience Entries",
      description: "No formal employment history is currently recorded in the active profile.",
      recommendation: "Record past or current roles to establish work history and professional technology evidence.",
    });
  }

  if (!input.profile.hasEducation) {
    gaps.push({
      type: "DATA_GAP",
      category: "EDUCATION",
      title: "No Education History",
      description: "No educational degrees or academic milestones are currently recorded in the active profile.",
      recommendation: "Add completed degrees or coursework to provide complete academic background.",
    });
  }

  if (!input.profile.hasPortfolioOrRepo) {
    gaps.push({
      type: "DATA_GAP",
      category: "LINKS",
      title: "No External Portfolio / Code Repositories",
      description: "No GitHub, portfolio, or code repository URLs are linked in the profile.",
      recommendation: "Add links to public repositories or a portfolio website to showcase code artifacts.",
    });
  }

  if (!input.profile.targetRoles || input.profile.targetRoles.length === 0) {
    gaps.push({
      type: "DATA_GAP",
      category: "DIRECTION",
      title: "No Target Roles Declared",
      description: "Target career roles have not been specified in career preferences.",
      recommendation: "Specify 1–3 target roles to enable tailored job matching and alignment checks.",
    });
  }

  // 2. EVIDENCE GAPS (Uncorroborated skills / missing multi-source backing)
  for (const skill of input.skills) {
    // A skill that is only self-declared with depth = 1 (no project or experience backing)
    const hasExpOrProj = skill.sources.some(
      (s) => s.sourceType === "EXPERIENCE" || s.sourceType === "PROJECT"
    );

    if (skill.evidenceDepth === 1 && !hasExpOrProj && !skill.sources.some((s) => s.isVerified)) {
      gaps.push({
        type: "EVIDENCE_GAP",
        category: "SKILL_CORROBORATION",
        title: `Uncorroborated Skill: ${skill.name}`,
        description: `No supporting experience or project evidence was found for ${skill.name} in the active profile.`,
        skillName: skill.name,
        recommendation: `Add work experience or a project detailing how ${skill.name} was applied in practice.`,
      });
    } else if (skill.recency === "NOT_RECENT" && skill.evidenceDepth >= 2) {
      gaps.push({
        type: "EVIDENCE_GAP",
        category: "RECENCY",
        title: `Historical Skill: ${skill.name}`,
        description: `No recent evidence of ${skill.name} was found in experience or project history within the last 36 months.`,
        skillName: skill.name,
        recommendation: `If ${skill.name} is currently in active use, add a recent project or update current role details.`,
      });
    }
  }

  // Sort: DATA_GAPs first, then EVIDENCE_GAPs, then by title alphabetically
  gaps.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "DATA_GAP" ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });

  return gaps;
}
