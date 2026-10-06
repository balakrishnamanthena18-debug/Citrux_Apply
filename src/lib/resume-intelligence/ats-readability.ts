export type AtsSeverity = "info" | "warning" | "issue";

export type AtsFinding = {
  code: string;
  severity: AtsSeverity;
  message: string;
};

export type AtsReadabilityResult = {
  label: "good" | "needs_attention" | "unreadable";
  summary: string;
  findings: AtsFinding[];
  signals: {
    hasReadableText: boolean;
    charCount: number;
    pageCount: number | null;
    headingCount: number;
    hasContactSignal: boolean;
    hasExperienceSection: boolean;
    hasEducationSection: boolean;
    hasSkillsSection: boolean;
    suspiciousLinkCount: number;
  };
};

const SECTION_PATTERNS: Array<{ key: keyof AtsReadabilityResult["signals"]; re: RegExp }> = [
  {
    key: "hasExperienceSection",
    re: /\b(experience|work history|employment|professional experience)\b/i,
  },
  {
    key: "hasEducationSection",
    re: /\b(education|academic|university|college|degree)\b/i,
  },
  {
    key: "hasSkillsSection",
    re: /\b(skills|technologies|technical skills|competencies)\b/i,
  },
];

const HEADING_LINE =
  /^(experience|education|skills|projects|summary|profile|certifications|work experience|professional summary)\b/im;

/**
 * Deterministic ATS readability checks over extracted text.
 * Does not claim universal ATS compatibility.
 */
export function analyzeAtsReadability(input: {
  parseStatus: "SUCCESS" | "EMPTY" | "FAILED" | "UNSUPPORTED";
  text: string;
  pageCount: number | null;
  charCount: number;
  errorCode?: string | null;
}): AtsReadabilityResult {
  const findings: AtsFinding[] = [];
  const text = input.text || "";
  const hasReadableText =
    input.parseStatus === "SUCCESS" && text.replace(/\s+/g, "").length >= 40;

  const signals: AtsReadabilityResult["signals"] = {
    hasReadableText,
    charCount: input.charCount,
    pageCount: input.pageCount,
    headingCount: 0,
    hasContactSignal: false,
    hasExperienceSection: false,
    hasEducationSection: false,
    hasSkillsSection: false,
    suspiciousLinkCount: 0,
  };

  if (input.parseStatus === "UNSUPPORTED") {
    findings.push({
      code: "UNSUPPORTED_FORMAT",
      severity: "issue",
      message:
        "This file type may be difficult for automated resume systems to read. Prefer PDF or DOCX.",
    });
    return {
      label: "unreadable",
      summary:
        "We couldn't read this resume automatically. Some formatting or file types may make this resume harder for automated systems to read.",
      findings,
      signals,
    };
  }

  if (input.parseStatus === "FAILED") {
    findings.push({
      code: "EXTRACT_FAILED",
      severity: "issue",
      message: "We couldn't read this resume automatically.",
    });
    return {
      label: "unreadable",
      summary: "We couldn't read this resume automatically.",
      findings,
      signals,
    };
  }

  if (!hasReadableText) {
    findings.push({
      code: "NO_READABLE_TEXT",
      severity: "issue",
      message:
        "Little or no readable text was found. Image-only or heavily designed resumes can be hard for automated systems to read.",
    });
    return {
      label: "unreadable",
      summary:
        "Some formatting may make this resume harder for automated systems to read.",
      findings,
      signals,
    };
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  signals.headingCount = lines.filter((l) => HEADING_LINE.test(l) || (l === l.toUpperCase() && l.length < 40 && /[A-Z]/.test(l))).length;

  signals.hasContactSignal =
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ||
    /(\+?\d[\d\s().-]{7,}\d)/.test(text) ||
    /\blinkedin\.com\b/i.test(text);

  for (const section of SECTION_PATTERNS) {
    if (section.re.test(text)) {
      signals[section.key] = true as never;
    }
  }

  const urls = text.match(/https?:\/\/[^\s)]+/gi) || [];
  signals.suspiciousLinkCount = urls.filter((u) => u.length > 180 || /\s/.test(u)).length;

  if (!signals.hasContactSignal) {
    findings.push({
      code: "CONTACT_UNCLEAR",
      severity: "warning",
      message: "Contact details were not clearly detected in readable text.",
    });
  }
  if (!signals.hasExperienceSection) {
    findings.push({
      code: "EXPERIENCE_SECTION_UNCLEAR",
      severity: "warning",
      message: "A clear experience section heading was not detected.",
    });
  }
  if (!signals.hasEducationSection) {
    findings.push({
      code: "EDUCATION_SECTION_UNCLEAR",
      severity: "info",
      message: "An education section heading was not clearly detected.",
    });
  }
  if (!signals.hasSkillsSection) {
    findings.push({
      code: "SKILLS_SECTION_UNCLEAR",
      severity: "info",
      message: "A skills section heading was not clearly detected.",
    });
  }
  if (signals.headingCount === 0) {
    findings.push({
      code: "FEW_HEADINGS",
      severity: "warning",
      message: "Standard section headings were hard to detect.",
    });
  }
  if (input.pageCount != null && input.pageCount > 4) {
    findings.push({
      code: "LONG_DOCUMENT",
      severity: "info",
      message: "This resume appears longer than typical for many screening systems.",
    });
  }
  if (signals.suspiciousLinkCount > 0) {
    findings.push({
      code: "SUSPICIOUS_LINKS",
      severity: "warning",
      message: "Some links look unusually long or malformed.",
    });
  }
  if (input.errorCode === "TEXT_TRUNCATED") {
    findings.push({
      code: "TEXT_TRUNCATED",
      severity: "info",
      message: "Only the beginning of a very long document was reviewed.",
    });
  }

  const issueCount = findings.filter((f) => f.severity === "issue").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;

  if (issueCount > 0) {
    return {
      label: "unreadable",
      summary:
        "Some formatting may make this resume harder for automated systems to read.",
      findings,
      signals,
    };
  }

  if (warningCount >= 2) {
    return {
      label: "needs_attention",
      summary:
        "Some formatting may make this resume harder for automated systems to read.",
      findings,
      signals,
    };
  }

  return {
    label: "good",
    summary:
      "Your resume appears easy for common automated systems to read.",
    findings,
    signals,
  };
}
