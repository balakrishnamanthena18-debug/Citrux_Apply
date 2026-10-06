export type RepresentationSupport =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "NOT_FOUND"
  | "UNVERIFIED";

export type RepresentationFinding = {
  code: string;
  support: RepresentationSupport;
  label: string;
  message: string;
  evidence: Array<{
    entityType: "CandidateSkill" | "CandidateExperience" | "CandidateProject" | "CandidateEducation" | "CandidateCertification" | "JobRequirement";
    entityId: string;
    field: string;
    display: string;
  }>;
};

export type RecommendationItem = {
  code: string;
  category:
    | "MISSING_FROM_RESUME"
    | "WEAKLY_REPRESENTED"
    | "STRONG_MATCH"
    | "STRUCTURE_ISSUE"
    | "READABILITY_ISSUE"
    | "OPTIONAL_IMPROVEMENT";
  title: string;
  message: string;
  evidence: RepresentationFinding["evidence"];
};

export type RepresentationAnalysisResult = {
  overallLabel: "strong" | "good_foundation" | "needs_work" | "unavailable";
  overallSummary: string;
  strengths: Array<{ label: string; message: string }>;
  findings: RepresentationFinding[];
  recommendations: RecommendationItem[];
};

export type CandidateTruthSnapshot = {
  skills: Array<{ id: string; name: string }>;
  experiences: Array<{
    id: string;
    companyName: string;
    jobTitle: string;
    technologies: string[];
    description: string | null;
  }>;
  projects: Array<{
    id: string;
    title: string;
    technologies: string[];
    description: string | null;
  }>;
  educations: Array<{ id: string; institution: string; degree: string }>;
  certifications: Array<{ id: string; name: string; issuingAuthority: string }>;
};

export type JobRequirementLite = {
  id: string;
  text: string;
  category?: string | null;
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]/g, " ").replace(/\s+/g, " ").trim();
}

function containsPhrase(haystack: string, needle: string): boolean {
  const n = normalizeToken(needle);
  if (n.length < 2) return false;
  const h = normalizeToken(haystack);
  if (n.length <= 3) {
    return new RegExp(`(?:^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(h);
  }
  return h.includes(n);
}

/**
 * Deterministic resume representation analysis.
 * Resume text is compared to candidate truth (and optional job requirements).
 * Never invents metrics, employment, or skills.
 */
export function analyzeResumeRepresentation(input: {
  resumeText: string;
  parseOk: boolean;
  candidate: CandidateTruthSnapshot;
  requirements?: JobRequirementLite[];
}): RepresentationAnalysisResult {
  if (!input.parseOk || !input.resumeText.trim()) {
    return {
      overallLabel: "unavailable",
      overallSummary:
        "We couldn't review how this resume represents your experience because readable text was not available.",
      strengths: [],
      findings: [],
      recommendations: [
        {
          code: "FIX_READABILITY_FIRST",
          category: "READABILITY_ISSUE",
          title: "Make the resume readable",
          message:
            "Upload a text-based PDF or DOCX so we can compare it with your career profile.",
          evidence: [],
        },
      ],
    };
  }

  const text = input.resumeText;
  const findings: RepresentationFinding[] = [];
  const strengths: Array<{ label: string; message: string }> = [];
  const recommendations: RecommendationItem[] = [];

  for (const skill of input.candidate.skills) {
    const supported = containsPhrase(text, skill.name);
    findings.push({
      code: `SKILL_${skill.id}`,
      support: supported ? "SUPPORTED" : "NOT_FOUND",
      label: skill.name,
      message: supported
        ? `Your ${skill.name} skill appears in this resume.`
        : `Your profile includes ${skill.name}, but it is not clearly highlighted in this resume.`,
      evidence: [
        {
          entityType: "CandidateSkill",
          entityId: skill.id,
          field: "name",
          display: skill.name,
        },
      ],
    });
    if (supported) {
      strengths.push({
        label: skill.name,
        message: `Your ${skill.name} experience is clearly represented.`,
      });
    } else {
      recommendations.push({
        code: `REC_SKILL_${skill.id}`,
        category: "MISSING_FROM_RESUME",
        title: `Make ${skill.name} easier to find`,
        message: `Your profile includes ${skill.name}, but it is not clearly highlighted in this resume.`,
        evidence: [
          {
            entityType: "CandidateSkill",
            entityId: skill.id,
            field: "name",
            display: skill.name,
          },
        ],
      });
    }
  }

  for (const exp of input.candidate.experiences) {
    const titleHit = containsPhrase(text, exp.jobTitle);
    const companyHit = containsPhrase(text, exp.companyName);
    const support: RepresentationSupport =
      titleHit && companyHit
        ? "SUPPORTED"
        : titleHit || companyHit
          ? "PARTIALLY_SUPPORTED"
          : "NOT_FOUND";
    findings.push({
      code: `EXP_${exp.id}`,
      support,
      label: `${exp.jobTitle} · ${exp.companyName}`,
      message:
        support === "SUPPORTED"
          ? `Your role at ${exp.companyName} appears in this resume.`
          : support === "PARTIALLY_SUPPORTED"
            ? `Your ${exp.jobTitle} experience is only partly visible in this resume.`
            : `Your experience as ${exp.jobTitle} at ${exp.companyName} is not clearly represented in this resume.`,
      evidence: [
        {
          entityType: "CandidateExperience",
          entityId: exp.id,
          field: "jobTitle",
          display: `${exp.jobTitle} at ${exp.companyName}`,
        },
      ],
    });
    if (support === "SUPPORTED") {
      strengths.push({
        label: exp.jobTitle,
        message: `Your ${exp.jobTitle} experience at ${exp.companyName} is visible.`,
      });
    } else {
      recommendations.push({
        code: `REC_EXP_${exp.id}`,
        category: support === "PARTIALLY_SUPPORTED" ? "WEAKLY_REPRESENTED" : "MISSING_FROM_RESUME",
        title: `Clarify ${exp.jobTitle}`,
        message:
          support === "PARTIALLY_SUPPORTED"
            ? `Your profile includes ${exp.jobTitle} at ${exp.companyName}, but the resume representation is incomplete.`
            : `Your profile includes experience as ${exp.jobTitle} at ${exp.companyName}, but it is not clearly highlighted in this resume.`,
        evidence: [
          {
            entityType: "CandidateExperience",
            entityId: exp.id,
            field: "jobTitle",
            display: `${exp.jobTitle} at ${exp.companyName}`,
          },
        ],
      });
    }

    for (const tech of exp.technologies.slice(0, 8)) {
      if (containsPhrase(text, tech)) continue;
      recommendations.push({
        code: `REC_EXP_TECH_${exp.id}_${normalizeToken(tech).slice(0, 24)}`,
        category: "WEAKLY_REPRESENTED",
        title: `Consider highlighting ${tech}`,
        message: `Your experience record lists ${tech}, but it is not clearly highlighted in this resume.`,
        evidence: [
          {
            entityType: "CandidateExperience",
            entityId: exp.id,
            field: "technologies",
            display: tech,
          },
        ],
      });
    }
  }

  for (const project of input.candidate.projects) {
    const hit = containsPhrase(text, project.title);
    findings.push({
      code: `PROJECT_${project.id}`,
      support: hit ? "SUPPORTED" : "NOT_FOUND",
      label: project.title,
      message: hit
        ? `Your project “${project.title}” appears in this resume.`
        : `Your profile includes the project “${project.title}”, but it is not clearly highlighted in this resume.`,
      evidence: [
        {
          entityType: "CandidateProject",
          entityId: project.id,
          field: "title",
          display: project.title,
        },
      ],
    });
    if (hit) {
      strengths.push({
        label: project.title,
        message: `Your project “${project.title}” is visible.`,
      });
    } else {
      recommendations.push({
        code: `REC_PROJECT_${project.id}`,
        category: "MISSING_FROM_RESUME",
        title: `Mention ${project.title}`,
        message: `Your profile includes project experience for “${project.title}” that is not clearly represented in this resume.`,
        evidence: [
          {
            entityType: "CandidateProject",
            entityId: project.id,
            field: "title",
            display: project.title,
          },
        ],
      });
    }
  }

  // Job-specific: only requirements the candidate can support from truth.
  for (const req of input.requirements ?? []) {
    const reqText = req.text?.trim();
    if (!reqText || reqText.length < 3) continue;

    type TruthHit = {
      entityType: "CandidateSkill" | "CandidateExperience" | "CandidateProject";
      entityId: string;
      field: string;
      display: string;
    };
    const truthHits: TruthHit[] = [];

    for (const skill of input.candidate.skills) {
      if (containsPhrase(reqText, skill.name) || containsPhrase(skill.name, reqText)) {
        truthHits.push({
          entityType: "CandidateSkill",
          entityId: skill.id,
          field: "name",
          display: skill.name,
        });
      }
    }
    for (const exp of input.candidate.experiences) {
      for (const tech of exp.technologies) {
        if (containsPhrase(reqText, tech) || containsPhrase(tech, reqText)) {
          truthHits.push({
            entityType: "CandidateExperience",
            entityId: exp.id,
            field: "technologies",
            display: tech,
          });
        }
      }
    }
    for (const project of input.candidate.projects) {
      for (const tech of project.technologies) {
        if (containsPhrase(reqText, tech) || containsPhrase(tech, reqText)) {
          truthHits.push({
            entityType: "CandidateProject",
            entityId: project.id,
            field: "technologies",
            display: tech,
          });
        }
      }
    }

    if (truthHits.length === 0) continue;

    const represented = truthHits.some((hit) => containsPhrase(text, hit.display));
    if (represented) {
      strengths.push({
        label: "Relevant requirement covered",
        message: `Relevant experience for “${reqText.slice(0, 80)}” appears represented.`,
      });
      continue;
    }

    recommendations.push({
      code: `REC_REQ_${req.id}`,
      category: "MISSING_FROM_RESUME",
      title: "Highlight relevant experience for this role",
      message: `Your profile includes experience relevant to “${reqText.slice(0, 120)}”, but it is not clearly highlighted in this resume.`,
      evidence: [
        {
          entityType: "JobRequirement",
          entityId: req.id,
          field: "text",
          display: reqText.slice(0, 120),
        },
        ...truthHits.slice(0, 3),
      ],
    });
  }

  // Deduplicate recommendations by title+message
  const seen = new Set<string>();
  const dedupedRecs = recommendations.filter((r) => {
    const key = `${r.category}:${r.title}:${r.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);

  const missing = findings.filter((f) => f.support === "NOT_FOUND").length;
  const partial = findings.filter((f) => f.support === "PARTIALLY_SUPPORTED").length;
  const supported = findings.filter((f) => f.support === "SUPPORTED").length;

  let overallLabel: RepresentationAnalysisResult["overallLabel"] = "good_foundation";
  let overallSummary =
    "Your resume represents most of your relevant experience, but there are a few areas that could be clearer.";

  if (findings.length === 0) {
    overallLabel = "needs_work";
    overallSummary =
      "Add experience, skills, or projects to your career profile so we can compare them with this resume.";
  } else if (supported > 0 && missing === 0 && partial === 0) {
    overallLabel = "strong";
    overallSummary =
      "Your resume clearly represents the experience recorded in your career profile.";
  } else if (missing + partial > supported) {
    overallLabel = "needs_work";
    overallSummary =
      "Several parts of your career profile are not clearly represented in this resume yet.";
  }

  return {
    overallLabel,
    overallSummary,
    strengths: strengths.slice(0, 8),
    findings,
    recommendations: dedupedRecs,
  };
}
