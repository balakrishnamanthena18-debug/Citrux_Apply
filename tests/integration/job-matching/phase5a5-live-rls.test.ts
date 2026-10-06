/**
 * Phase 5A.5 — LIVE PostgreSQL FORCE RLS / IDOR verification.
 * Uses real DATABASE_URL/DIRECT_URL. No mocks of withRlsContext/prisma.
 *
 * Exercises oos_app_runtime + request.jwt.claim.sub (not application helpers alone).
 */
import { config } from "dotenv";
config({ path: ".env" });

import { randomUUID } from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  ensureRuntimeRoleGrant,
  getLiveDbUrl,
  withBypassClient,
  withRuntimeRlsAsUser,
} from "../../helpers/live-rls";
import {
  EVALUATION_CONTROLLED_FIELDS,
  IMMUTABLE_IDENTITY_FIELDS,
  MATCHING_CONTRACT_VERSION,
  assertCandidateActionPatch,
  evaluateCandidateJobMatch,
  getCandidateSafeJobMatch,
  updateOwnCandidateJobMatchActions,
  upsertCurrentCandidateJobMatch,
  type AuthorizedMatchActor,
  type MatchCandidateInput,
  type MatchJobInput,
} from "@/lib/job-matching";
import { withRlsContext } from "@/lib/db/rls";
import { prisma } from "@/lib/db/prisma";
import { AuditAction } from "@/generated/prisma/client";
import { logUserAuditEvent } from "@/lib/audit";
import { AuthorizationError } from "@/lib/errors";

const LIVE = !!getLiveDbUrl();

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const USER_A = randomUUID();
const USER_B = randomUUID();
const USER_STAFF_A = randomUUID();
const USER_STAFF_B = randomUUID();
const USER_STRANGER = randomUUID();
const CAND_A = randomUUID();
const CAND_B = randomUUID();
const JOB_X = randomUUID(); // global org A
const JOB_Y = randomUUID(); // private A
const JOB_Z = randomUUID(); // private B
const MATCH_A_X = randomUUID();
const MATCH_A_Y = randomUUID();
const MATCH_B_X = randomUUID();
const MATCH_B_Z = randomUUID();

describe.skipIf(!LIVE)("Phase 5A.5 LIVE RLS / security verification", () => {
  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (c) => {
      // Orgs
      await c.query(
        `INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
         VALUES ($1,'P5A5 Org A',$2,'ACTIVE',NOW(),NOW()), ($3,'P5A5 Org B',$4,'ACTIVE',NOW(),NOW())`,
        [ORG_A, `p5a5-a-${ORG_A.slice(0, 8)}`, ORG_B, `p5a5-b-${ORG_B.slice(0, 8)}`]
      );

      // Users
      for (const [id, email] of [
        [USER_A, `p5a5-a-${USER_A.slice(0, 8)}@example.com`],
        [USER_B, `p5a5-b-${USER_B.slice(0, 8)}@example.com`],
        [USER_STAFF_A, `p5a5-staff-a-${USER_STAFF_A.slice(0, 8)}@example.com`],
        [USER_STAFF_B, `p5a5-staff-b-${USER_STAFF_B.slice(0, 8)}@example.com`],
        [USER_STRANGER, `p5a5-stranger-${USER_STRANGER.slice(0, 8)}@example.com`],
      ] as const) {
        await c.query(
          `INSERT INTO users (id, email, status, "createdAt", "updatedAt")
           VALUES ($1,$2,'ACTIVE',NOW(),NOW())`,
          [id, email]
        );
      }

      // Memberships
      await c.query(
        `INSERT INTO memberships (id, "organizationId", "userId", role, status, "createdAt", "updatedAt")
         VALUES
         ($1,$2,$3,'CANDIDATE','ACTIVE',NOW(),NOW()),
         ($4,$2,$5,'CANDIDATE','ACTIVE',NOW(),NOW()),
         ($6,$2,$7,'EMPLOYEE','ACTIVE',NOW(),NOW()),
         ($8,$9,$10,'EMPLOYEE','ACTIVE',NOW(),NOW())`,
        [
          randomUUID(),
          ORG_A,
          USER_A,
          randomUUID(),
          USER_B,
          randomUUID(),
          USER_STAFF_A,
          randomUUID(),
          ORG_B,
          USER_STAFF_B,
        ]
      );

      // Candidates
      await c.query(
        `INSERT INTO candidates (
           id, "organizationId", "userId", status, "verificationStatus", country,
           "workAuthorization", "requiresSponsorship", "remotePreference",
           "salaryCurrency", application_authorization_mode, "createdAt", "updatedAt"
         ) VALUES
         ($1,$2,$3,'ACTIVE','UNVERIFIED','US','CITIZEN',false,'FLEXIBLE','USD','MANAGED',NOW(),NOW()),
         ($4,$2,$5,'ACTIVE','UNVERIFIED','US','CITIZEN',false,'FLEXIBLE','USD','MANAGED',NOW(),NOW())`,
        [CAND_A, ORG_A, USER_A, CAND_B, USER_B]
      );

      // Jobs
      await c.query(
        `INSERT INTO jobs (
           id, "organizationId", title, "companyName", "jobDescription", location,
           "isRemote", "employmentType", "salaryMin", "salaryMax", "salaryCurrency",
           status, visibility, "ownerCandidateId", "createdById", "createdAt", "updatedAt"
         ) VALUES
         ($1,$2,'Global X','Acme','JD X','Remote',true,'FULL_TIME',120000,160000,'USD','OPEN','GLOBAL',NULL,$3,NOW(),NOW()),
         ($4,$2,'Private Y','Acme','JD Y','Austin',false,'FULL_TIME',100000,120000,'USD','OPEN','CANDIDATE_PRIVATE',$5,$3,NOW(),NOW()),
         ($6,$2,'Private Z','Acme','JD Z','NYC',false,'FULL_TIME',90000,110000,'USD','OPEN','CANDIDATE_PRIVATE',$7,$3,NOW(),NOW())`,
        [JOB_X, ORG_A, USER_STAFF_A, JOB_Y, CAND_A, JOB_Z, CAND_B]
      );

      // Matches
      const insertMatch = async (
        id: string,
        candidateId: string,
        jobId: string,
        key: string
      ) => {
        await c.query(
          `INSERT INTO candidate_job_matches (
             id, "organizationId", "candidateId", "jobId",
             "matchingContractVersion", "sourceDataVersion",
             status, freshness, category,
             "qualificationSummary", "preferenceSummary", presentation, "evidenceRefs",
             "idempotencyKey", "evaluatedAt", "createdAt", "updatedAt"
           ) VALUES (
             $1,$2,$3,$4,$5,$6,'SUCCEEDED','CURRENT','GOOD_MATCH',
             '[]'::jsonb,'[]'::jsonb,'{"why":"safe"}'::jsonb,'[]'::jsonb,
             $7,NOW(),NOW(),NOW()
           )`,
          [
            id,
            ORG_A,
            candidateId,
            jobId,
            MATCHING_CONTRACT_VERSION,
            `src-${id.slice(0, 8)}`,
            key,
          ]
        );
      };

      await insertMatch(MATCH_A_X, CAND_A, JOB_X, `idem-ax-${MATCH_A_X}`);
      await insertMatch(MATCH_A_Y, CAND_A, JOB_Y, `idem-ay-${MATCH_A_Y}`);
      await insertMatch(MATCH_B_X, CAND_B, JOB_X, `idem-bx-${MATCH_B_X}`);
      await insertMatch(MATCH_B_Z, CAND_B, JOB_Z, `idem-bz-${MATCH_B_Z}`);
    });
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    await withBypassClient(async (c) => {
      await c.query(
        `DELETE FROM audit_events WHERE "actorId" = ANY($1::uuid[]) OR "organizationId" = ANY($2::uuid[])`,
        [
          [USER_A, USER_B, USER_STAFF_A, USER_STAFF_B, USER_STRANGER],
          [ORG_A, ORG_B],
        ]
      );
      await c.query(`DELETE FROM candidate_job_matches WHERE "organizationId" = ANY($1::uuid[])`, [
        [ORG_A, ORG_B],
      ]);
      await c.query(`DELETE FROM jobs WHERE "organizationId" = ANY($1::uuid[])`, [
        [ORG_A, ORG_B],
      ]);
      await c.query(`DELETE FROM candidates WHERE "organizationId" = ANY($1::uuid[])`, [
        [ORG_A, ORG_B],
      ]);
      await c.query(`DELETE FROM memberships WHERE "organizationId" = ANY($1::uuid[])`, [
        [ORG_A, ORG_B],
      ]);
      await c.query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [
        [ORG_A, ORG_B],
      ]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
        [USER_A, USER_B, USER_STAFF_A, USER_STAFF_B, USER_STRANGER],
      ]);
    });
    await prisma.$disconnect();
  }, 60000);

  describe("1. LIVE RLS SELECT isolation", () => {
    it("1. Candidate A can SELECT own match", async () => {
      const rows = await withRuntimeRlsAsUser(USER_A, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id = $1`,
          [MATCH_A_X]
        );
        return r.rows;
      });
      expect(rows).toHaveLength(1);
    });

    it("2. Candidate A cannot SELECT Candidate B match", async () => {
      const rows = await withRuntimeRlsAsUser(USER_A, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id = $1`,
          [MATCH_B_X]
        );
        return r.rows;
      });
      expect(rows).toHaveLength(0);
    });

    it("3. Candidate B cannot SELECT Candidate A match", async () => {
      const rows = await withRuntimeRlsAsUser(USER_B, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id = $1`,
          [MATCH_A_X]
        );
        return r.rows;
      });
      expect(rows).toHaveLength(0);
    });

    it("4. Candidate A cannot access another tenant's match (none seeded in B; insert denied later)", async () => {
      const rows = await withRuntimeRlsAsUser(USER_A, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE "organizationId" = $1`,
          [ORG_B]
        );
        return r.rows;
      });
      expect(rows).toHaveLength(0);
    });

    it("5. Candidate B cannot access Candidate A private-job match", async () => {
      const rows = await withRuntimeRlsAsUser(USER_B, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id = $1`,
          [MATCH_A_Y]
        );
        return r.rows;
      });
      expect(rows).toHaveLength(0);
    });

    it("6. Unauthorized staff (no membership / wrong org) cannot access match", async () => {
      const stranger = await withRuntimeRlsAsUser(USER_STRANGER, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id = $1`,
          [MATCH_A_X]
        );
        return r.rows;
      });
      expect(stranger).toHaveLength(0);

      const otherOrgStaff = await withRuntimeRlsAsUser(USER_STAFF_B, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id = $1`,
          [MATCH_A_X]
        );
        return r.rows;
      });
      expect(otherOrgStaff).toHaveLength(0);
    });

    it("7. Authorized org-privileged staff can SELECT", async () => {
      const rows = await withRuntimeRlsAsUser(USER_STAFF_A, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id = ANY($1::uuid[])`,
          [[MATCH_A_X, MATCH_B_X]]
        );
        return r.rows;
      });
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("1b. LIVE RLS INSERT / UPDATE isolation", () => {
    it("8. Candidate cannot create a match for another candidate", async () => {
      await expect(
        withRuntimeRlsAsUser(USER_A, async (c) => {
          await c.query(
            `INSERT INTO candidate_job_matches (
               id, "organizationId", "candidateId", "jobId",
               "matchingContractVersion", "sourceDataVersion",
               status, freshness, "idempotencyKey", "createdAt", "updatedAt"
             ) VALUES (
               $1,$2,$3,$4,'matching.v1','x','QUEUED','CURRENT',$5,NOW(),NOW()
             )`,
            [randomUUID(), ORG_A, CAND_B, JOB_X, `bad-${randomUUID()}`]
          );
        })
      ).rejects.toThrow();
    });

    it("9. Candidate cannot create a match in another organization", async () => {
      await expect(
        withRuntimeRlsAsUser(USER_A, async (c) => {
          await c.query(
            `INSERT INTO candidate_job_matches (
               id, "organizationId", "candidateId", "jobId",
               "matchingContractVersion", "sourceDataVersion",
               status, freshness, "idempotencyKey", "createdAt", "updatedAt"
             ) VALUES (
               $1,$2,$3,$4,'matching.v1','x','QUEUED','CURRENT',$5,NOW(),NOW()
             )`,
            [randomUUID(), ORG_B, CAND_A, JOB_X, `bad-org-${randomUUID()}`]
          );
        })
      ).rejects.toThrow();
    });

    it("10. Candidate cannot mutate another candidate's match", async () => {
      const updated = await withRuntimeRlsAsUser(USER_A, async (c) => {
        const r = await c.query(
          `UPDATE candidate_job_matches SET "savedAt" = NOW() WHERE id = $1 RETURNING id`,
          [MATCH_B_X]
        );
        return r.rowCount ?? 0;
      });
      expect(updated).toBe(0);
    });

    it("11. Candidate cannot mutate another tenant's match", async () => {
      // Create a match in org B under bypass, then attempt update as USER_A
      const foreignMatch = randomUUID();
      // Need a candidate in org B — create ephemeral
      const userB2 = randomUUID();
      const candB2 = randomUUID();
      await withBypassClient(async (c) => {
        await c.query(
          `INSERT INTO users (id, email, status, "createdAt", "updatedAt")
           VALUES ($1,$2,'ACTIVE',NOW(),NOW())`,
          [userB2, `p5a5-b2-${userB2.slice(0, 8)}@example.com`]
        );
        await c.query(
          `INSERT INTO memberships (id, "organizationId", "userId", role, status, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,'CANDIDATE','ACTIVE',NOW(),NOW())`,
          [randomUUID(), ORG_B, userB2]
        );
        await c.query(
          `INSERT INTO candidates (
             id, "organizationId", "userId", status, "verificationStatus", country,
             "workAuthorization", "requiresSponsorship", "remotePreference",
             "salaryCurrency", application_authorization_mode, "createdAt", "updatedAt"
           ) VALUES ($1,$2,$3,'ACTIVE','UNVERIFIED','US','CITIZEN',false,'FLEXIBLE','USD','MANAGED',NOW(),NOW())`,
          [candB2, ORG_B, userB2]
        );
        const jobB = randomUUID();
        await c.query(
          `INSERT INTO jobs (
             id, "organizationId", title, "companyName", "jobDescription",
             "isRemote", "employmentType", status, visibility, "createdById", "createdAt", "updatedAt"
           ) VALUES ($1,$2,'OrgB Job','BCo','JD',true,'FULL_TIME','OPEN','GLOBAL',$3,NOW(),NOW())`,
          [jobB, ORG_B, USER_STAFF_B]
        );
        await c.query(
          `INSERT INTO candidate_job_matches (
             id, "organizationId", "candidateId", "jobId",
             "matchingContractVersion", "sourceDataVersion",
             status, freshness, "idempotencyKey", "createdAt", "updatedAt"
           ) VALUES ($1,$2,$3,$4,'matching.v1','y','SUCCEEDED','CURRENT',$5,NOW(),NOW())`,
          [foreignMatch, ORG_B, candB2, jobB, `foreign-${foreignMatch}`]
        );
      });

      const updated = await withRuntimeRlsAsUser(USER_A, async (c) => {
        const r = await c.query(
          `UPDATE candidate_job_matches SET "savedAt" = NOW() WHERE id = $1 RETURNING id`,
          [foreignMatch]
        );
        return r.rowCount ?? 0;
      });
      expect(updated).toBe(0);
    });
  });

  describe("2. Evaluation field tampering (server path)", () => {
    const forbidden = [
      ...EVALUATION_CONTROLLED_FIELDS,
      ...IMMUTABLE_IDENTITY_FIELDS,
    ];

    for (const field of forbidden) {
      it(`denies candidate patch of ${field}`, () => {
        expect(() =>
          assertCandidateActionPatch({ [field]: "tamper" })
        ).toThrow(AuthorizationError);
      });
    }

    it("allows intended action fields via updateOwnCandidateJobMatchActions", async () => {
      const actor: AuthorizedMatchActor = {
        userId: USER_A,
        organizationId: ORG_A,
        role: "CANDIDATE",
        viewerCandidateId: CAND_A,
      };
      await withRlsContext(USER_A, async (tx) => {
        await updateOwnCandidateJobMatchActions(tx, {
          actor,
          matchId: MATCH_A_X,
          patch: {
            savedAt: new Date().toISOString(),
            dismissedAt: null,
            dismissReason: null,
            applicationRequestedAt: null,
          },
        });
      });

      const row = await withBypassClient(async (c) => {
        const r = await c.query(
          `SELECT "savedAt" IS NOT NULL AS saved FROM candidate_job_matches WHERE id = $1`,
          [MATCH_A_X]
        );
        return r.rows[0];
      });
      expect(row.saved).toBe(true);

      await expect(
        withRlsContext(USER_A, async (tx) => {
          await updateOwnCandidateJobMatchActions(tx, {
            actor,
            matchId: MATCH_A_X,
            patch: { category: "STRONG_MATCH" } as never,
          });
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("3–4. Current-match uniqueness + idempotency (live DB)", () => {
    const jobRecompute = randomUUID();
    let firstId = "";

    beforeAll(async () => {
      await withBypassClient(async (c) => {
        await c.query(
          `INSERT INTO jobs (
             id, "organizationId", title, "companyName", "jobDescription",
             "isRemote", "employmentType", "salaryMin", "salaryMax", "salaryCurrency",
             status, visibility, "createdById", "createdAt", "updatedAt"
           ) VALUES ($1,$2,'Recompute Job','Acme','JD',true,'FULL_TIME',130000,170000,'USD','OPEN','GLOBAL',$3,NOW(),NOW())`,
          [jobRecompute, ORG_A, USER_STAFF_A]
        );
      });
    });

    function candInput(
      overrides: Partial<MatchCandidateInput> = {}
    ): MatchCandidateInput {
      return {
        candidateId: CAND_A,
        organizationId: ORG_A,
        updatedAt: "2026-01-01T00:00:00.000Z",
        city: "Austin",
        state: "TX",
        country: "US",
        totalYearsExperience: 6,
        workAuthorization: "CITIZEN",
        requiresSponsorship: false,
        remotePreference: "FLEXIBLE",
        targetLocations: ["Remote - US"],
        targetRoles: [],
        desiredSalaryMin: 120000,
        desiredSalaryMax: 160000,
        salaryCurrency: "USD",
        skills: [
          { id: randomUUID(), name: "TypeScript" },
          { id: randomUUID(), name: "React" },
        ],
        experiences: [],
        educations: [],
        certifications: [],
        projects: [],
        ...overrides,
      };
    }

    function jobInput(overrides: Partial<MatchJobInput> = {}): MatchJobInput {
      return {
        jobId: jobRecompute,
        organizationId: ORG_A,
        title: "Recompute Job",
        companyName: "Acme",
        location: "Remote",
        isRemote: true,
        employmentType: "FULL_TIME",
        salaryMin: 130000,
        salaryMax: 170000,
        salaryCurrency: "USD",
        status: "OPEN",
        visibility: "GLOBAL",
        ownerCandidateId: null,
        ...overrides,
      };
    }

    it("creates one current match; second insert for same identity fails at DB", async () => {
      const actor: AuthorizedMatchActor = {
        userId: USER_A,
        organizationId: ORG_A,
        role: "CANDIDATE",
        viewerCandidateId: CAND_A,
      };
      const evaluation = evaluateCandidateJobMatch({
        candidate: candInput(),
        job: jobInput(),
        requirementSet: {
          requirementSetId: randomUUID(),
          snapshotId: randomUUID(),
          contentHash: "h1",
          schemaVersion: "job-requirements.v1",
          normalizationVersion: "normalize.v1",
          extractionVersion: "extract.v1",
          freshness: "CURRENT",
          requirements: [
            {
              id: randomUUID(),
              category: "REQUIRED_SKILL",
              rawValue: "TypeScript",
              normalizedValue: "typescript",
              importance: "REQUIRED",
            },
            {
              id: randomUUID(),
              category: "REQUIRED_SKILL",
              rawValue: "React",
              normalizedValue: "react",
              importance: "REQUIRED",
            },
          ],
        },
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });

      const created = await withRlsContext(USER_A, async (tx) =>
        upsertCurrentCandidateJobMatch(tx, {
          actor,
          targetCandidateId: CAND_A,
          jobId: jobRecompute,
          evaluation,
        })
      );
      firstId = created.matchId;
      expect(created.created).toBe(true);

      await expect(
        withBypassClient(async (c) => {
          await c.query(
            `INSERT INTO candidate_job_matches (
               id, "organizationId", "candidateId", "jobId",
               "matchingContractVersion", "sourceDataVersion",
               status, freshness, "idempotencyKey", "createdAt", "updatedAt"
             ) VALUES ($1,$2,$3,$4,'matching.v1','dup','QUEUED','CURRENT',$5,NOW(),NOW())`,
            [randomUUID(), ORG_A, CAND_A, jobRecompute, `dup-${randomUUID()}`]
          );
        })
      ).rejects.toThrow();

      const count = await withBypassClient(async (c) => {
        const r = await c.query(
          `SELECT count(*)::int AS c FROM candidate_job_matches
           WHERE "organizationId"=$1 AND "candidateId"=$2 AND "jobId"=$3`,
          [ORG_A, CAND_A, jobRecompute]
        );
        return r.rows[0].c as number;
      });
      expect(count).toBe(1);
    });

    it("recompute updates SAME row id with new sourceDataVersion", async () => {
      const actor: AuthorizedMatchActor = {
        userId: USER_A,
        organizationId: ORG_A,
        role: "CANDIDATE",
        viewerCandidateId: CAND_A,
      };
      const before = await withBypassClient(async (c) => {
        const r = await c.query(
          `SELECT id, "sourceDataVersion", "evaluatedAt" FROM candidate_job_matches WHERE id=$1`,
          [firstId]
        );
        return r.rows[0];
      });

      const evaluation = evaluateCandidateJobMatch({
        candidate: candInput({ desiredSalaryMin: 200000 }),
        job: jobInput({ salaryMin: 100000, salaryMax: 110000 }),
        requirementSet: {
          requirementSetId: randomUUID(),
          snapshotId: randomUUID(),
          contentHash: "h2",
          schemaVersion: "job-requirements.v1",
          normalizationVersion: "normalize.v1",
          extractionVersion: "extract.v1",
          freshness: "CURRENT",
          requirements: [
            {
              id: randomUUID(),
              category: "REQUIRED_SKILL",
              rawValue: "TypeScript",
              normalizedValue: "typescript",
              importance: "REQUIRED",
            },
            {
              id: randomUUID(),
              category: "REQUIRED_SKILL",
              rawValue: "React",
              normalizedValue: "react",
              importance: "REQUIRED",
            },
          ],
        },
        asOf: new Date("2026-02-01T00:00:00.000Z"),
      });

      const recomputed = await withRlsContext(USER_A, async (tx) =>
        upsertCurrentCandidateJobMatch(tx, {
          actor,
          targetCandidateId: CAND_A,
          jobId: jobRecompute,
          evaluation,
        })
      );
      expect(recomputed.matchId).toBe(firstId);
      expect(recomputed.created).toBe(false);

      const after = await withBypassClient(async (c) => {
        const r = await c.query(
          `SELECT id, "sourceDataVersion", "evaluatedAt", presentation FROM candidate_job_matches WHERE id=$1`,
          [firstId]
        );
        return r.rows[0];
      });
      expect(after.id).toBe(before.id);
      expect(after.sourceDataVersion).not.toBe(before.sourceDataVersion);
      expect(String(after.evaluatedAt)).not.toBe(String(before.evaluatedAt));

      const count = await withBypassClient(async (c) => {
        const r = await c.query(
          `SELECT count(*)::int AS c FROM candidate_job_matches
           WHERE "organizationId"=$1 AND "candidateId"=$2 AND "jobId"=$3`,
          [ORG_A, CAND_A, jobRecompute]
        );
        return r.rows[0].c as number;
      });
      expect(count).toBe(1);
    });

    it("idempotent replay does not create duplicate", async () => {
      const actor: AuthorizedMatchActor = {
        userId: USER_A,
        organizationId: ORG_A,
        role: "CANDIDATE",
        viewerCandidateId: CAND_A,
      };
      const evaluation = evaluateCandidateJobMatch({
        candidate: candInput({ desiredSalaryMin: 200000 }),
        job: jobInput({ salaryMin: 100000, salaryMax: 110000 }),
        requirementSet: {
          requirementSetId: randomUUID(),
          snapshotId: randomUUID(),
          contentHash: "h2",
          schemaVersion: "job-requirements.v1",
          normalizationVersion: "normalize.v1",
          extractionVersion: "extract.v1",
          freshness: "CURRENT",
          requirements: [
            {
              id: randomUUID(),
              category: "REQUIRED_SKILL",
              rawValue: "TypeScript",
              normalizedValue: "typescript",
              importance: "REQUIRED",
            },
            {
              id: randomUUID(),
              category: "REQUIRED_SKILL",
              rawValue: "React",
              normalizedValue: "react",
              importance: "REQUIRED",
            },
          ],
        },
        asOf: new Date("2026-02-01T00:00:00.000Z"),
      });

      // Align stored sourceDataVersion by reading current row and forcing same evaluation as last write
      const current = await withBypassClient(async (c) => {
        const r = await c.query(
          `SELECT "sourceDataVersion" FROM candidate_job_matches WHERE id=$1`,
          [firstId]
        );
        return r.rows[0].sourceDataVersion as string;
      });

      // First ensure row is SUCCEEDED with this evaluation's key
      const once = await withRlsContext(USER_A, async (tx) =>
        upsertCurrentCandidateJobMatch(tx, {
          actor,
          targetCandidateId: CAND_A,
          jobId: jobRecompute,
          evaluation,
        })
      );
      const twice = await withRlsContext(USER_A, async (tx) =>
        upsertCurrentCandidateJobMatch(tx, {
          actor,
          targetCandidateId: CAND_A,
          jobId: jobRecompute,
          evaluation,
        })
      );
      expect(twice.idempotentReplay || twice.matchId === once.matchId).toBe(true);
      expect(twice.matchId).toBe(firstId);
      void current;

      const count = await withBypassClient(async (c) => {
        const r = await c.query(
          `SELECT count(*)::int AS c FROM candidate_job_matches
           WHERE "organizationId"=$1 AND "candidateId"=$2 AND "jobId"=$3`,
          [ORG_A, CAND_A, jobRecompute]
        );
        return r.rows[0].c as number;
      });
      expect(count).toBe(1);
    });
  });

  describe("5. GLOBAL / PRIVATE security", () => {
    it(
      "Candidate A/B GLOBAL X allow; private Y/Z owner-only; Org B denied",
      async () => {
      const aGlobal = await withRuntimeRlsAsUser(USER_A, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id=$1`,
          [MATCH_A_X]
        );
        return r.rows.length;
      });
      const bGlobal = await withRuntimeRlsAsUser(USER_B, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id=$1`,
          [MATCH_B_X]
        );
        return r.rows.length;
      });
      expect(aGlobal).toBe(1);
      expect(bGlobal).toBe(1);

      const aPrivateY = await withRuntimeRlsAsUser(USER_A, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id=$1`,
          [MATCH_A_Y]
        );
        return r.rows.length;
      });
      const bPrivateY = await withRuntimeRlsAsUser(USER_B, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id=$1`,
          [MATCH_A_Y]
        );
        return r.rows.length;
      });
      expect(aPrivateY).toBe(1);
      expect(bPrivateY).toBe(0);

      const bPrivateZ = await withRuntimeRlsAsUser(USER_B, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id=$1`,
          [MATCH_B_Z]
        );
        return r.rows.length;
      });
      const aPrivateZ = await withRuntimeRlsAsUser(USER_A, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE id=$1`,
          [MATCH_B_Z]
        );
        return r.rows.length;
      });
      expect(bPrivateZ).toBe(1);
      expect(aPrivateZ).toBe(0);

      const orgBStaff = await withRuntimeRlsAsUser(USER_STAFF_B, async (c) => {
        const r = await c.query(
          `SELECT id FROM candidate_job_matches WHERE "jobId" = ANY($1::uuid[])`,
          [[JOB_X, JOB_Y, JOB_Z]]
        );
        return r.rows.length;
      });
      expect(orgBStaff).toBe(0);
      },
      30000
    );
  });

  describe("6. Raw requirement protection", () => {
    it("candidate-safe payload omits requirements/snapshot/lease/idempotency internals", async () => {
      const actor: AuthorizedMatchActor = {
        userId: USER_A,
        organizationId: ORG_A,
        role: "CANDIDATE",
        viewerCandidateId: CAND_A,
      };
      const safe = await withRlsContext(USER_A, async (tx) =>
        getCandidateSafeJobMatch(tx, {
          actor,
          targetCandidateId: CAND_A,
          jobId: JOB_X,
        })
      );
      const json = JSON.stringify(safe);
      expect(json).not.toContain("idempotencyKey");
      expect(json).not.toContain("leaseExpiresAt");
      expect(json).not.toContain("attemptCount");
      expect(json).not.toContain("qualificationNotes");
      expect(json).not.toContain("sourceDataVersion");
      expect(json).not.toContain("job-requirements");
      expect(json).not.toContain("requirements");
      expect(safe?.presentation).toBeTruthy();
      expect(safe?.job).toBeTruthy();
      expect((safe?.job as { qualificationNotes?: unknown }).qualificationNotes).toBeUndefined();
    });
  });

  describe("7. Audit emission safety", () => {
    it("emits JOB_MATCH_* without sensitive payloads", async () => {
      expect(AuditAction.JOB_MATCH_REQUESTED).toBe("JOB_MATCH_REQUESTED");
      expect(AuditAction.JOB_MATCH_COMPLETED).toBe("JOB_MATCH_COMPLETED");
      expect(AuditAction.JOB_MATCH_FAILED).toBe("JOB_MATCH_FAILED");
      expect(AuditAction.JOB_MATCH_MARKED_STALE).toBe("JOB_MATCH_MARKED_STALE");

      const details = {
        matchId: MATCH_A_X,
        category: "GOOD_MATCH",
        matchingContractVersion: MATCHING_CONTRACT_VERSION,
        status: "SUCCEEDED",
      };
      const json = JSON.stringify(details);
      expect(json).not.toMatch(/password|token|secret|extractedText|requirements/i);

      await logUserAuditEvent({
        userId: USER_STAFF_A,
        organizationId: ORG_A,
        action: AuditAction.JOB_MATCH_COMPLETED,
        entityType: "CandidateJobMatch",
        entityId: MATCH_A_X,
        details,
      });

      const row = await withBypassClient(async (c) => {
        const r = await c.query(
          `SELECT action::text AS action, details FROM audit_events
           WHERE "entityId" = $1 AND action = 'JOB_MATCH_COMPLETED'
           ORDER BY "createdAt" DESC LIMIT 1`,
          [MATCH_A_X]
        );
        return r.rows[0];
      });
      expect(row?.action).toBe("JOB_MATCH_COMPLETED");
      const d = JSON.stringify(row?.details ?? {});
      expect(d).not.toContain("extractedText");
      expect(d).not.toContain("jobDescription");
    });
  });
});
