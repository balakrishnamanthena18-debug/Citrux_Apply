/**
 * Synthetic JD fixtures for Gate 5 — no real candidate data.
 */

export const JD_FIXTURES = {
  requiredSkills: `
Software Engineer
Must have TypeScript experience.
Required skills: React and Node.js.
`.trim(),

  preferredSkills: `
Backend Engineer
Preferred: experience with AWS.
Python experience would be a plus.
`.trim(),

  requiredExperience: `
Senior Developer
Must have 5 years of Python experience.
`.trim(),

  preferredExperience: `
Platform Engineer
Preferred experience with Kubernetes in production.
`.trim(),

  education: `
Data Analyst
Bachelor's degree in Computer Science required.
`.trim(),

  certification: `
Cloud Engineer
AWS Solutions Architect certification preferred.
`.trim(),

  location: `
Office-based role in Austin, TX. Relocation not provided.
`.trim(),

  workAuthorization: `
Must be authorized to work in the United States.
`.trim(),

  compensation: `
Compensation range is unclear; competitive salary DOE.
`.trim(),

  employmentType: `
This is a FULL_TIME permanent position.
`.trim(),

  ambiguous: `
Looking for someone strong with cloud technologies and relevant certifications.
Years of experience flexible depending on background.
`.trim(),

  duplicates: `
Must have Python.
Python programming experience required.
Python development skills required.
React.js and ReactJS preferred.
`.trim(),

  unsupportedClaims: `
We invent a requirement that is not actually listed elsewhere.
`.trim(),

  empty: ``,

  large: ("Required skills: TypeScript.\n" + "Detail paragraph. ".repeat(4000)).trim(),

  unicode: `
Ingeniero de software — se requiere experiencia con TypeScript.
Must have Café knowledge and naïve Unicode handling — 日本語テスト.
`.trim(),

  candidatePrivate: `
Private opportunity for nominated candidate.
Must have TypeScript. Preferred: GraphQL.
`.trim(),

  global: `
Public Global Role
Must have TypeScript.
Preferred: AWS.
Location: Remote - US.
`.trim(),

  mixedClassifications: `
Job Description
Must have 5 years of Python experience.
Preferred: experience with AWS.
Python experience would be a plus.
Bachelor's degree preferred.
Work authorization requirements are unclear.
`.trim(),
} as const;

export type JdFixtureKey = keyof typeof JD_FIXTURES;
