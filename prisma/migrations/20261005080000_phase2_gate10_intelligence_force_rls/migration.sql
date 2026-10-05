-- Phase 2 Gate 10 — Intelligence security hardening
-- Align Phase 2 intelligence tables with the existing FORCE RLS contract
-- used by applications/candidates/QA/submissions/communication tables.
-- Also grant oos_app_runtime the minimum privileges required under NOBYPASSRLS.

ALTER TABLE "public"."job_description_snapshots" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."job_requirement_sets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."application_intelligence_runs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."application_alignment_results" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."application_readiness_results" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidate_fact_attestations" FORCE ROW LEVEL SECURITY;

-- Runtime role is NOSUPERUSER NOBYPASSRLS — explicit grants required.
GRANT SELECT, INSERT ON "public"."job_description_snapshots" TO oos_app_runtime;
GRANT SELECT, INSERT, UPDATE ON "public"."job_requirement_sets" TO oos_app_runtime;
GRANT SELECT, INSERT, UPDATE ON "public"."application_intelligence_runs" TO oos_app_runtime;
GRANT SELECT, INSERT, UPDATE ON "public"."application_alignment_results" TO oos_app_runtime;
GRANT SELECT, INSERT, UPDATE ON "public"."application_readiness_results" TO oos_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."candidate_fact_attestations" TO oos_app_runtime;
