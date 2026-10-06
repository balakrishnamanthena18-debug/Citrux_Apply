import { createHash } from "crypto";
import { MATCHING_CONTRACT_VERSION } from "./constants";
import type { MatchCandidateInput, MatchJobInput, MatchRequirementSetInput } from "./types";

function stableJoin(parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((p) => (p == null ? "" : String(p))).join(":");
}

/**
 * Freshness fingerprint for the CURRENT evaluation version on a match row.
 * Changing this updates the same CandidateJobMatch identity — it does not
 * create a second feed row.
 *
 * Phase 5C.6: includes job title and career-section content that matching.v1
 * actually reads (not mere row IDs).
 */
export function buildMatchSourceDataVersion(input: {
  job: MatchJobInput;
  candidate: MatchCandidateInput;
  requirementSet: MatchRequirementSetInput;
  matchingContractVersion?: string;
}): string {
  const req = input.requirementSet;
  const reqPart = req
    ? [
        req.requirementSetId,
        req.snapshotId,
        req.contentHash,
        req.schemaVersion,
        req.normalizationVersion,
        req.extractionVersion,
        req.freshness,
        req.requirements
          .map((r) => `${r.id}:${r.category}:${r.normalizedValue}:${r.importance}`)
          .sort()
          .join(","),
      ].join("|")
    : "no-requirement-set";

  const truthPart = [
    input.candidate.updatedAt,
    input.candidate.workAuthorization,
    String(input.candidate.requiresSponsorship),
    String(input.candidate.totalYearsExperience ?? ""),
    input.candidate.skills
      .map((s) => stableJoin([s.id, s.name]))
      .sort()
      .join(","),
    input.candidate.experiences
      .map((e) =>
        stableJoin([
          e.id,
          e.jobTitle,
          e.companyName,
          e.isCurrent ? "1" : "0",
          e.startDate,
          e.endDate ?? "",
          [...e.technologies].map((t) => t.toLowerCase()).sort().join("+"),
        ])
      )
      .sort()
      .join(","),
    input.candidate.educations
      .map((e) =>
        stableJoin([e.id, e.degree ?? "", e.fieldOfStudy ?? "", e.institution])
      )
      .sort()
      .join(","),
    input.candidate.certifications
      .map((c) => stableJoin([c.id, c.name, c.issuingAuthority ?? ""]))
      .sort()
      .join(","),
    input.candidate.projects
      .map((p) =>
        stableJoin([
          p.id,
          [...p.technologies].map((t) => t.toLowerCase()).sort().join("+"),
        ])
      )
      .sort()
      .join(","),
  ].join("|");

  const prefPart = [
    input.candidate.remotePreference,
    String(input.candidate.desiredSalaryMin ?? ""),
    String(input.candidate.desiredSalaryMax ?? ""),
    input.candidate.salaryCurrency,
    [...input.candidate.targetLocations].sort().join(","),
    [...input.candidate.targetRoles].sort().join(","),
    input.candidate.city ?? "",
    input.candidate.state ?? "",
    input.candidate.country ?? "",
  ].join("|");

  const jobPart = [
    input.job.jobId,
    input.job.title,
    input.job.isRemote ? "1" : "0",
    input.job.location ?? "",
    input.job.employmentType,
    String(input.job.salaryMin ?? ""),
    String(input.job.salaryMax ?? ""),
    input.job.salaryCurrency ?? "",
    input.job.status,
    input.job.visibility,
  ].join("|");

  const material = [
    input.matchingContractVersion ?? MATCHING_CONTRACT_VERSION,
    jobPart,
    reqPart,
    truthPart,
    prefPart,
  ].join("||");

  return createHash("sha256").update(material).digest("hex");
}
