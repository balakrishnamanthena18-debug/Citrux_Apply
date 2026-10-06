/**
 * Phase 7C — Deterministic Chronological Career Timeline
 * Strictly implements Phase 7B.1 Contract Section 10 & Timeline Rules.
 *
 * NO inferred promotions. NO fabricated seniority progressions.
 * Preserves exact structured dates and source provenance.
 */

import type { TimelineEventItem, TimelineEventType } from "./types";
import type {
  RawCandidateExperience,
  RawCandidateProject,
  RawCandidateCertification,
} from "./evidence";

export interface RawCandidateEducation {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  startDate: Date | null;
  endDate: Date | null;
  graduationYear: number | null;
}

function formatDateString(date: Date | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0]!;
}

function formatDisplayDateRange(
  start: Date | null | undefined,
  end: Date | null | undefined,
  isCurrent?: boolean,
  gradYear?: number | null
): string {
  const startStr = start ? new Date(start).getFullYear().toString() : null;
  const endStr = isCurrent
    ? "Present"
    : end
    ? new Date(end).getFullYear().toString()
    : gradYear
    ? gradYear.toString()
    : null;

  if (startStr && endStr) {
    return startStr === endStr ? startStr : `${startStr} – ${endStr}`;
  }
  if (endStr) return endStr;
  if (startStr) return `${startStr} – Present`;
  return "Date Unspecified";
}

/**
 * Derives a unified chronological career timeline from authoritative entities.
 */
export function deriveCareerTimeline(input: {
  experiences: RawCandidateExperience[];
  projects: RawCandidateProject[];
  education: RawCandidateEducation[];
  certifications: RawCandidateCertification[];
}): TimelineEventItem[] {
  const events: TimelineEventItem[] = [];

  // 1. Experiences
  for (const exp of input.experiences) {
    events.push({
      id: `timeline:exp:${exp.id}`,
      type: "EXPERIENCE",
      title: exp.jobTitle,
      subtitle: exp.companyName,
      startDate: formatDateString(exp.startDate),
      endDate: formatDateString(exp.endDate),
      isCurrent: exp.isCurrent,
      displayDate: formatDisplayDateRange(exp.startDate, exp.endDate, exp.isCurrent),
      details: exp.achievements || [],
      technologies: exp.technologies || [],
      sourceId: exp.id,
    });
  }

  // 2. Projects
  for (const proj of input.projects) {
    events.push({
      id: `timeline:proj:${proj.id}`,
      type: "PROJECT",
      title: proj.title,
      subtitle: proj.role || "Portfolio Project",
      startDate: formatDateString(proj.startDate),
      endDate: formatDateString(proj.endDate),
      displayDate: formatDisplayDateRange(proj.startDate, proj.endDate),
      details: proj.highlights || [],
      technologies: proj.technologies || [],
      sourceId: proj.id,
    });
  }

  // 3. Education
  for (const edu of input.education) {
    const subtitle = edu.fieldOfStudy ? `${edu.degree} in ${edu.fieldOfStudy}` : edu.degree;
    events.push({
      id: `timeline:edu:${edu.id}`,
      type: "EDUCATION",
      title: edu.institution,
      subtitle,
      startDate: formatDateString(edu.startDate),
      endDate: formatDateString(edu.endDate),
      displayDate: formatDisplayDateRange(edu.startDate, edu.endDate, false, edu.graduationYear),
      details: [],
      technologies: [],
      sourceId: edu.id,
    });
  }

  // 4. Certifications
  for (const cert of input.certifications) {
    events.push({
      id: `timeline:cert:${cert.id}`,
      type: "CERTIFICATION",
      title: cert.name,
      subtitle: cert.issuingAuthority,
      startDate: formatDateString(cert.issueDate),
      endDate: formatDateString(cert.expirationDate),
      displayDate: cert.issueDate
        ? new Date(cert.issueDate).getFullYear().toString()
        : "Issued",
      details: cert.doesNotExpire ? ["Credential does not expire"] : [],
      technologies: [],
      sourceId: cert.id,
    });
  }

  // Sort events descending: newest date first.
  events.sort((a, b) => {
    // Current positions first
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;

    // Compare by end date or start date
    const dateA = a.endDate || a.startDate || "1970-01-01";
    const dateB = b.endDate || b.startDate || "1970-01-01";
    if (dateB !== dateA) {
      return dateB.localeCompare(dateA);
    }
    return a.title.localeCompare(b.title);
  });

  return events;
}
