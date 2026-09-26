-- AlterTable: Remove mutable issueDescription and correctionNotes columns to enforce strict append-only point-in-time submission invariant
ALTER TABLE "public"."application_submissions" DROP COLUMN IF EXISTS "issueDescription";
ALTER TABLE "public"."application_submissions" DROP COLUMN IF EXISTS "correctionNotes";
