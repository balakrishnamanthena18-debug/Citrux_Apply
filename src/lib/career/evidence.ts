/**
 * Phase 7C — Deterministic Career Evidence Aggregation & Authority Resolution
 * Implements Phase 7B.1 Decision Locks D1, D2, D3, D4, D6, D7.
 */

import { normalizeSkillName, mapCertificationToSkills } from "./normalization";
import type {
  FactAuthorityLevel,
  EvidenceSourceType,
  CareerEvidenceSourceItem,
  EvidencedSkillDTO,
  CareerRecency,
  CareerStrengthTier,
} from "./types";

export interface RawCandidateSkill {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RawCandidateExperience {
  id: string;
  companyName: string;
  jobTitle: string;
  isCurrent: boolean;
  startDate: Date;
  endDate: Date | null;
  technologies: string[];
  achievements: string[];
}

export interface RawCandidateProject {
  id: string;
  title: string;
  role: string | null;
  url: string | null;
  technologies: string[];
  highlights: string[];
  startDate: Date | null;
  endDate: Date | null;
}

export interface RawCandidateCertification {
  id: string;
  name: string;
  issuingAuthority: string;
  credentialId: string | null;
  issueDate: Date | null;
  expirationDate: Date | null;
  doesNotExpire: boolean;
}

export interface RawDocumentExtractSummary {
  id: string;
  candidateDocumentId: string;
  extractedText: string;
  parsedAt: Date;
}

export interface RawFactAttestation {
  id: string;
  entityType: string;
  entityId: string;
  field: string;
  provenance: string;
  attestedAt: Date;
  note: string | null;
}

const RECENCY_THRESHOLD_MONTHS = 36;

/**
 * Deterministically checks recency of a date against a reference timestamp.
 */
export function isWithinRecencyThreshold(
  date: Date | null | undefined,
  refDate: Date = new Date()
): boolean {
  if (!date) return false;
  const targetTime = new Date(date).getTime();
  if (isNaN(targetTime)) return false;

  const thresholdDate = new Date(refDate);
  thresholdDate.setMonth(thresholdDate.getMonth() - RECENCY_THRESHOLD_MONTHS);
  return targetTime >= thresholdDate.getTime();
}

/**
 * Calculates recency for an experience entry.
 */
function calculateExperienceRecency(
  exp: RawCandidateExperience,
  refDate: Date
): CareerRecency {
  if (exp.isCurrent) return "RECENT";
  if (exp.endDate && isWithinRecencyThreshold(exp.endDate, refDate)) {
    return "RECENT";
  }
  if (isWithinRecencyThreshold(exp.startDate, refDate)) {
    return "RECENT";
  }
  return "NOT_RECENT";
}

/**
 * Calculates recency for a project entry.
 */
function calculateProjectRecency(
  proj: RawCandidateProject,
  refDate: Date
): CareerRecency {
  if (proj.endDate && isWithinRecencyThreshold(proj.endDate, refDate)) {
    return "RECENT";
  }
  if (proj.startDate && isWithinRecencyThreshold(proj.startDate, refDate)) {
    return "RECENT";
  }
  if (!proj.startDate && !proj.endDate) {
    return "UNKNOWN";
  }
  return "NOT_RECENT";
}

/**
 * Determines overall recency for an aggregated skill based on its supporting sources.
 */
function resolveSkillRecency(sources: CareerEvidenceSourceItem[]): CareerRecency {
  let hasRecent = false;
  let hasTimeSensitive = false;

  for (const src of sources) {
    if (src.sourceType === "EXPERIENCE" || src.sourceType === "PROJECT") {
      if (src.recency === "RECENT") {
        hasRecent = true;
      }
      if (src.recency !== "UNKNOWN") {
        hasTimeSensitive = true;
      }
    }
  }

  if (hasRecent) return "RECENT";
  if (hasTimeSensitive) return "NOT_RECENT";
  return "UNKNOWN";
}

/**
 * Assigns strength tier based on evidence depth and recency (Decision Lock D8).
 */
export function calculateStrengthTier(
  evidenceDepth: number,
  recency: CareerRecency
): CareerStrengthTier {
  if (evidenceDepth >= 3 && recency === "RECENT") {
    return "CORE";
  }
  if (evidenceDepth >= 2) {
    return "STRONG";
  }
  return "EMERGING";
}

/**
 * Builds the complete deterministic evidence graph and skill collection for a candidate.
 */
export function deriveCareerEvidenceGraph(input: {
  skills: RawCandidateSkill[];
  experiences: RawCandidateExperience[];
  projects: RawCandidateProject[];
  certifications: RawCandidateCertification[];
  extracts: RawDocumentExtractSummary[];
  attestations: RawFactAttestation[];
  referenceDate?: Date;
}): {
  skills: EvidencedSkillDTO[];
  allEvidence: CareerEvidenceSourceItem[];
} {
  const refDate = input.referenceDate || new Date();
  const skillMap = new Map<
    string,
    {
      displayName: string;
      sources: Map<string, CareerEvidenceSourceItem>;
      isVerified: boolean;
    }
  >();

  const getOrCreateSkillEntry = (rawName: string) => {
    const normalized = normalizeSkillName(rawName);
    if (!normalized) return null;

    let entry = skillMap.get(normalized);
    if (!entry) {
      entry = {
        displayName: rawName.trim(),
        sources: new Map<string, CareerEvidenceSourceItem>(),
        isVerified: false,
      };
      skillMap.set(normalized, entry);
    }
    return { normalized, entry };
  };

  // 1. Ingest CandidateSkill (Self-Declared canonical facts)
  for (const s of input.skills) {
    const res = getOrCreateSkillEntry(s.name);
    if (!res) continue;

    const sourceKey = `CANDIDATE_SKILL:${s.id}`;
    if (!res.entry.sources.has(sourceKey)) {
      res.entry.sources.set(sourceKey, {
        sourceType: "CANDIDATE_SKILL",
        sourceId: s.id,
        sourceField: "name",
        displayContext: `Declared Profile Skill: ${s.name}`,
        recordedAt: s.createdAt.toISOString(),
        isVerified: false,
        recency: "UNKNOWN", // Profile skill update date does NOT prove active usage (D7)
      });
    }
  }

  // 2. Ingest CandidateExperience technologies
  for (const exp of input.experiences) {
    const expRecency = calculateExperienceRecency(exp, refDate);
    const uniqueTechsInExp = new Set<string>();

    for (const tech of exp.technologies || []) {
      const norm = normalizeSkillName(tech);
      if (!norm) continue;

      // Deduplicate mentions inside the SAME experience entity (D1, D2)
      if (uniqueTechsInExp.has(norm)) continue;
      uniqueTechsInExp.add(norm);

      const res = getOrCreateSkillEntry(tech);
      if (!res) continue;

      const sourceKey = `EXPERIENCE:${exp.id}`;
      if (!res.entry.sources.has(sourceKey)) {
        res.entry.sources.set(sourceKey, {
          sourceType: "EXPERIENCE",
          sourceId: exp.id,
          sourceField: "technologies",
          displayContext: `Used at ${exp.companyName} (${exp.jobTitle})`,
          recordedAt: exp.startDate.toISOString(),
          isVerified: false,
          recency: expRecency,
        });
      }
    }
  }

  // 3. Ingest CandidateProject technologies
  for (const proj of input.projects) {
    const projRecency = calculateProjectRecency(proj, refDate);
    const uniqueTechsInProj = new Set<string>();

    for (const tech of proj.technologies || []) {
      const norm = normalizeSkillName(tech);
      if (!norm) continue;

      // Deduplicate mentions inside the SAME project entity (D1, D2)
      if (uniqueTechsInProj.has(norm)) continue;
      uniqueTechsInProj.add(norm);

      const res = getOrCreateSkillEntry(tech);
      if (!res) continue;

      const sourceKey = `PROJECT:${proj.id}`;
      if (!res.entry.sources.has(sourceKey)) {
        res.entry.sources.set(sourceKey, {
          sourceType: "PROJECT",
          sourceId: proj.id,
          sourceField: "technologies",
          displayContext: `Demonstrated in project: ${proj.title}`,
          recordedAt: (proj.startDate || proj.endDate || new Date()).toISOString(),
          isVerified: false,
          recency: projRecency,
        });
      }
    }
  }

  // 4. Ingest CandidateCertification mappings (D4)
  for (const cert of input.certifications) {
    const mappedSkills = mapCertificationToSkills(cert.name);
    for (const skillName of mappedSkills) {
      const res = getOrCreateSkillEntry(skillName);
      if (!res) continue;

      const sourceKey = `CERTIFICATION:${cert.id}`;
      if (!res.entry.sources.has(sourceKey)) {
        res.entry.sources.set(sourceKey, {
          sourceType: "CERTIFICATION",
          sourceId: cert.id,
          sourceField: "name",
          displayContext: `Certified: ${cert.name} (${cert.issuingAuthority})`,
          recordedAt: (cert.issueDate || new Date()).toISOString(),
          isVerified: false,
          recency: "UNKNOWN", // Certification updatedAt does NOT prove active usage (D7)
        });
      }
    }
  }

  // 5. Ingest Advisory Resume Extracts (D3)
  for (const extract of input.extracts) {
    if (!extract.extractedText) continue;
    const lowerText = extract.extractedText.toLowerCase();

    // Check against candidate-declared skills or existing known tokens
    for (const [normSkill, entry] of skillMap.entries()) {
      // Conservative boundary check for skill mention in extracted text
      const tokenRegex = new RegExp(`\\b${normSkill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (tokenRegex.test(lowerText)) {
        const sourceKey = `DOCUMENT_EXTRACT:${extract.id}`;
        if (!entry.sources.has(sourceKey)) {
          entry.sources.set(sourceKey, {
            sourceType: "DOCUMENT_EXTRACT",
            sourceId: extract.id,
            sourceField: "extractedText",
            displayContext: "Mentioned in uploaded resume (Advisory extract)",
            recordedAt: extract.parsedAt.toISOString(),
            isVerified: false, // Resume extracts NEVER grant verified status (D3)
            recency: "UNKNOWN", // Resume upload recency != active skill usage (D7)
          });
        }
      }
    }
  }

  // 6. Ingest Fact Attestations (D6 - Staff Verification)
  for (const att of input.attestations) {
    if (att.provenance !== "VERIFIED") continue;

    // Match attestation to skill entry
    for (const [normSkill, entry] of skillMap.entries()) {
      if (
        (att.entityType === "CandidateSkill" && att.entityId && entry.sources.has(`CANDIDATE_SKILL:${att.entityId}`)) ||
        att.field.toLowerCase() === normSkill ||
        att.field === "*"
      ) {
        entry.isVerified = true;
        const sourceKey = `ATTESTATION:${att.id}`;
        if (!entry.sources.has(sourceKey)) {
          entry.sources.set(sourceKey, {
            sourceType: "ATTESTATION",
            sourceId: att.id,
            sourceField: att.field,
            displayContext: "Verified by staff attestation",
            recordedAt: att.attestedAt.toISOString(),
            isVerified: true,
            recency: "UNKNOWN",
          });
        }
      }
    }
  }

  // 7. Compose EvidencedSkillDTOs
  const skills: EvidencedSkillDTO[] = [];
  const allEvidence: CareerEvidenceSourceItem[] = [];

  for (const [norm, entry] of skillMap.entries()) {
    const sourcesList = Array.from(entry.sources.values());
    allEvidence.push(...sourcesList);

    const depth = sourcesList.length;
    const skillRecency = resolveSkillRecency(sourcesList);

    // Authority resolution hierarchy: VERIFIED > EVIDENCED > SELF_DECLARED (D6)
    let authorityLevel: FactAuthorityLevel = "SELF_DECLARED";
    if (entry.isVerified || sourcesList.some((s) => s.isVerified)) {
      authorityLevel = "VERIFIED";
    } else if (depth >= 2) {
      authorityLevel = "EVIDENCED";
    }

    const tier = calculateStrengthTier(depth, skillRecency);

    skills.push({
      name: entry.displayName,
      normalizedName: norm,
      authorityLevel,
      evidenceDepth: depth,
      sources: sourcesList,
      recency: skillRecency,
      strengthTier: tier,
    });
  }

  // Sort skills deterministically: VERIFIED first, then EVIDENCED, then by depth descending, then alphabetically
  skills.sort((a, b) => {
    const authOrder: Record<FactAuthorityLevel, number> = {
      VERIFIED: 3,
      EVIDENCED: 2,
      SELF_DECLARED: 1,
    };
    if (authOrder[b.authorityLevel] !== authOrder[a.authorityLevel]) {
      return authOrder[b.authorityLevel] - authOrder[a.authorityLevel];
    }
    if (b.evidenceDepth !== a.evidenceDepth) {
      return b.evidenceDepth - a.evidenceDepth;
    }
    return a.name.localeCompare(b.name);
  });

  return { skills, allEvidence };
}
