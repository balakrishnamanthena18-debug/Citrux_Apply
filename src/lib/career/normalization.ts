/**
 * Phase 7C — Conservative Deterministic Skill Normalization
 * Strictly implements Phase 7B.1 Decision Lock D4 & D5.
 *
 * NO fuzzy matching. NO Levenshtein distance. NO embeddings.
 * NO semantic similarity. NO automatic technology-family collapsing.
 */

/**
 * Normalizes a raw skill/technology string using conservative deterministic rules:
 * 1. Trim leading and trailing whitespace.
 * 2. Convert to lowercase.
 * 3. Collapse multiple internal whitespace characters to a single space.
 * 4. Strip surrounding quotes and safe trailing/leading cosmetic punctuation.
 *
 * If two terms are not an exact normalized match, they remain distinct.
 */
export function normalizeSkillName(raw: string | null | undefined): string {
  if (!raw) return "";

  let cleaned = raw.trim().toLowerCase();

  // Strip wrapping quotes or brackets
  cleaned = cleaned.replace(/^["'`(\[]+|["'`)\]]+$/g, "");

  // Collapse internal whitespace sequences to a single space
  cleaned = cleaned.replace(/\s+/g, " ");

  // Strip trailing punctuation if clearly cosmetic (e.g. comma, period, semicolon)
  cleaned = cleaned.replace(/[,;.]+$/g, "").trim();

  return cleaned;
}

/**
 * Deterministically checks if two skill names are identical under the conservative normalization policy.
 */
export function areSkillsEquivalent(a: string, b: string): boolean {
  const normA = normalizeSkillName(a);
  const normB = normalizeSkillName(b);
  if (!normA || !normB) return false;
  return normA === normB;
}

/**
 * Static deterministic certification-to-skill mappings (Decision Lock D4).
 * Only explicitly mapped credentials map to skills.
 * If not recognized, returns empty array (credential remains certification-only).
 */
const STATIC_CERTIFICATION_SKILL_MAP: Record<string, readonly string[]> = {
  "aws certified solutions architect - associate": ["aws", "cloud architecture"],
  "aws certified solutions architect - professional": ["aws", "cloud architecture"],
  "aws certified developer - associate": ["aws"],
  "aws certified sysops administrator": ["aws", "sysops"],
  "certified kubernetes administrator": ["kubernetes"],
  "certified kubernetes application developer": ["kubernetes"],
  "certified kubernetes security specialist": ["kubernetes", "security"],
  "google cloud certified professional cloud architect": ["google cloud", "cloud architecture"],
  "google cloud certified professional data engineer": ["google cloud", "data engineering"],
  "microsoft certified: azure solutions architect expert": ["azure", "cloud architecture"],
  "microsoft certified: azure administrator associate": ["azure"],
  "terraform associate": ["terraform"],
  "hashicorp certified: terraform associate": ["terraform"],
  "pmp": ["project management"],
  "project management professional": ["project management"],
  "certified scrum master": ["scrum", "agile"],
  "csm": ["scrum", "agile"],
  "cissp": ["cybersecurity", "security"],
  "certified information systems security professional": ["cybersecurity", "security"],
};

/**
 * Deterministically extracts corresponding skills from a certification name.
 * Uses exact normalized key match against static lookup.
 */
export function mapCertificationToSkills(certName: string): string[] {
  const norm = normalizeSkillName(certName);
  if (!norm) return [];

  const direct = STATIC_CERTIFICATION_SKILL_MAP[norm];
  if (direct && direct.length > 0) {
    return [...direct];
  }

  return [];
}
