-- Phase 2 Gate 1 — Candidate fact attestation side-table + schema lock
-- Sparse field-level provenance (Design Lock Option B).
-- AI_INFERRED must never be stored as canonical attestation truth.

CREATE TABLE "public"."candidate_fact_attestations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "entityType" VARCHAR(64) NOT NULL,
  "entityId" UUID NOT NULL,
  "field" VARCHAR(128) NOT NULL,
  "provenance" "FactProvenance" NOT NULL,
  "attestedById" UUID,
  "attestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_fact_attestations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_fact_attestations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "candidate_fact_attestations_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "candidate_fact_attestations_attestedById_fkey"
    FOREIGN KEY ("attestedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "candidate_fact_attestations_provenance_not_ai_inferred"
    CHECK ("provenance" <> 'AI_INFERRED'::"FactProvenance")
);

CREATE UNIQUE INDEX "candidate_fact_attestations_candidateId_entityType_entityId_field_key"
  ON "public"."candidate_fact_attestations"("candidateId", "entityType", "entityId", "field");
CREATE INDEX "candidate_fact_attestations_organizationId_candidateId_idx"
  ON "public"."candidate_fact_attestations"("organizationId", "candidateId");
CREATE INDEX "candidate_fact_attestations_candidateId_entityType_entityId_idx"
  ON "public"."candidate_fact_attestations"("candidateId", "entityType", "entityId");

ALTER TABLE "public"."candidate_fact_attestations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY candidate_fact_attestations_select ON "public"."candidate_fact_attestations"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_org_privileged_member("organizationId", public.current_user_id())
    )
  );

-- Staff may write attestations; candidates may not self-verify as VERIFIED via this table
CREATE POLICY candidate_fact_attestations_insert ON "public"."candidate_fact_attestations"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id()) AND
    "provenance" <> 'AI_INFERRED'::"FactProvenance"
  );

CREATE POLICY candidate_fact_attestations_update ON "public"."candidate_fact_attestations"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  )
  WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id()) AND
    "provenance" <> 'AI_INFERRED'::"FactProvenance"
  );

CREATE POLICY candidate_fact_attestations_delete ON "public"."candidate_fact_attestations"
  FOR DELETE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );
