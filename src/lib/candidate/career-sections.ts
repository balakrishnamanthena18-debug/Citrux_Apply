export type CareerSectionKey =
  | "overview"
  | "personal"
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "work_auth"
  | "preferences"
  | "documents"
  | "verification"
  | "history";

export const CAREER_SECTION_KEYS: CareerSectionKey[] = [
  "overview",
  "personal",
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "work_auth",
  "preferences",
  "documents",
  "verification",
  "history",
];

export function isCareerSectionKey(value: string | null | undefined): value is CareerSectionKey {
  return Boolean(value && (CAREER_SECTION_KEYS as string[]).includes(value));
}
