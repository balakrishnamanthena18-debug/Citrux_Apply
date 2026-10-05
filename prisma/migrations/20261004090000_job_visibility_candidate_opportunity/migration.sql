-- Job visibility (GLOBAL catalog vs CANDIDATE_PRIVATE leads)
-- + CandidateJobOpportunity operational join
-- + tighten jobs SELECT RLS (remove open-job cross-scope hole)

CREATE TYPE "JobVisibility" AS ENUM ('GLOBAL', 'CANDIDATE_PRIVATE');
CREATE TYPE "CandidateJobOpportunityStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

ALTER TABLE "public"."jobs"
  ADD COLUMN "visibility" "JobVisibility" NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN "ownerCandidateId" UUID;

ALTER TABLE "public"."jobs"
  ADD CONSTRAINT "jobs_ownerCandidateId_fkey"
  FOREIGN KEY ("ownerCandidateId") REFERENCES "public"."candidates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "jobs_organizationId_visibility_status_idx"
  ON "public"."jobs"("organizationId", "visibility", "status");
CREATE INDEX "jobs_ownerCandidateId_status_idx"
  ON "public"."jobs"("ownerCandidateId", "status");

-- Private jobs must name an owner candidate; catalog jobs must not.
ALTER TABLE "public"."jobs"
  ADD CONSTRAINT "jobs_visibility_owner_chk" CHECK (
    ("visibility" = 'GLOBAL' AND "ownerCandidateId" IS NULL)
    OR ("visibility" = 'CANDIDATE_PRIVATE' AND "ownerCandidateId" IS NOT NULL)
  );

CREATE TABLE "public"."candidate_job_opportunities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "discoveredById" UUID NOT NULL,
  "status" "CandidateJobOpportunityStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_job_opportunities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_job_opportunities_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "candidate_job_opportunities_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "candidate_job_opportunities_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "candidate_job_opportunities_discoveredById_fkey"
    FOREIGN KEY ("discoveredById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "candidate_job_opportunities_candidateId_jobId_key"
  ON "public"."candidate_job_opportunities"("candidateId", "jobId");
CREATE INDEX "candidate_job_opportunities_organizationId_status_idx"
  ON "public"."candidate_job_opportunities"("organizationId", "status");
CREATE INDEX "candidate_job_opportunities_candidateId_status_idx"
  ON "public"."candidate_job_opportunities"("candidateId", "status");
CREATE INDEX "candidate_job_opportunities_jobId_idx"
  ON "public"."candidate_job_opportunities"("jobId");

ALTER TABLE "public"."applications"
  ADD COLUMN "candidateJobOpportunityId" UUID;

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_candidateJobOpportunityId_fkey"
  FOREIGN KEY ("candidateJobOpportunityId") REFERENCES "public"."candidate_job_opportunities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "applications_candidateJobOpportunityId_idx"
  ON "public"."applications"("candidateJobOpportunityId");

-- Backfill opportunities for every existing application (legacy → operational link)
INSERT INTO "public"."candidate_job_opportunities" (
  "organizationId", "candidateId", "jobId", "discoveredById", "status", "createdAt", "updatedAt"
)
SELECT DISTINCT ON (a."candidateId", a."jobId")
  a."organizationId",
  a."candidateId",
  a."jobId",
  COALESCE(a."assignedEmployeeId", j."createdById"),
  'ACTIVE',
  a."createdAt",
  CURRENT_TIMESTAMP
FROM "public"."applications" a
JOIN "public"."jobs" j ON j.id = a."jobId"
ORDER BY a."candidateId", a."jobId", a."createdAt" ASC
ON CONFLICT ("candidateId", "jobId") DO NOTHING;

UPDATE "public"."applications" a
SET "candidateJobOpportunityId" = o.id
FROM "public"."candidate_job_opportunities" o
WHERE a."candidateId" = o."candidateId"
  AND a."jobId" = o."jobId"
  AND a."candidateJobOpportunityId" IS NULL;

-- RLS for opportunities
ALTER TABLE "public"."candidate_job_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidate_job_opportunities" FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_job(lookup_job_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = lookup_job_id
      AND (
        -- Staff: org privileged + visibility scope
        (
          public.is_org_privileged_member(j."organizationId", lookup_user_id)
          AND (
            j.visibility = 'GLOBAL'
            OR (
              j.visibility = 'CANDIDATE_PRIVATE'
              AND (
                EXISTS (
                  SELECT 1 FROM public.memberships m
                  WHERE m."userId" = lookup_user_id
                    AND m."organizationId" = j."organizationId"
                    AND m.status = 'ACTIVE'
                    AND m.role = 'ADMIN'
                )
                OR j."createdById" = lookup_user_id
                OR EXISTS (
                  SELECT 1 FROM public.candidates c
                  WHERE c.id = j."ownerCandidateId"
                    AND (
                      c."assignedEmployeeId" = lookup_user_id
                      OR c."userId" = lookup_user_id
                    )
                )
                OR EXISTS (
                  SELECT 1 FROM public.applications a
                  WHERE a."jobId" = j.id
                    AND a."assignedEmployeeId" = lookup_user_id
                )
                OR EXISTS (
                  SELECT 1 FROM public.candidate_job_opportunities o
                  WHERE o."jobId" = j.id
                    AND o."discoveredById" = lookup_user_id
                )
              )
            )
          )
        )
        OR
        -- Candidate user: own org global OPEN jobs or their private leads
        EXISTS (
          SELECT 1 FROM public.candidates c
          WHERE c."userId" = lookup_user_id
            AND c."organizationId" = j."organizationId"
            AND (
              (j.visibility = 'GLOBAL' AND j.status = 'OPEN')
              OR (j.visibility = 'CANDIDATE_PRIVATE' AND j."ownerCandidateId" = c.id)
            )
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_job(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_job(uuid, uuid) TO oos_app_runtime, authenticated;

DROP POLICY IF EXISTS jobs_select ON "public"."jobs";
CREATE POLICY jobs_select ON "public"."jobs"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL
    AND public.can_access_job(id, public.current_user_id())
  );

-- Insert: staff may create GLOBAL or private (owner must be set for private)
DROP POLICY IF EXISTS jobs_insert ON "public"."jobs";
CREATE POLICY jobs_insert ON "public"."jobs"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL
    AND public.is_org_privileged_member("organizationId", public.current_user_id())
    AND (
      (visibility = 'GLOBAL' AND "ownerCandidateId" IS NULL)
      OR (
        visibility = 'CANDIDATE_PRIVATE'
        AND "ownerCandidateId" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.candidates c
          WHERE c.id = "ownerCandidateId"
            AND c."organizationId" = "organizationId"
        )
      )
    )
  );

DROP POLICY IF EXISTS jobs_update ON "public"."jobs";
CREATE POLICY jobs_update ON "public"."jobs"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL
    AND public.is_org_privileged_member("organizationId", public.current_user_id())
    AND public.can_access_job(id, public.current_user_id())
  );

CREATE POLICY candidate_job_opportunities_select ON "public"."candidate_job_opportunities"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.is_org_privileged_member("organizationId", public.current_user_id())
      OR EXISTS (
        SELECT 1 FROM public.candidates c
        WHERE c.id = "candidateId" AND c."userId" = public.current_user_id()
      )
    )
  );

CREATE POLICY candidate_job_opportunities_insert ON "public"."candidate_job_opportunities"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL
    AND public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY candidate_job_opportunities_update ON "public"."candidate_job_opportunities"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL
    AND public.is_org_privileged_member("organizationId", public.current_user_id())
  );

GRANT SELECT, INSERT, UPDATE ON "public"."candidate_job_opportunities" TO oos_app_runtime;
GRANT SELECT ON "public"."candidate_job_opportunities" TO authenticated;
