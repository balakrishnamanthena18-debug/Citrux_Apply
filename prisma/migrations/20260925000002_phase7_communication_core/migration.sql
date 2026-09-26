-- CreateEnum: NotificationType
DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'NEW_MESSAGE',
    'APPLICATION_STATUS_CHANGED',
    'CANDIDATE_APPROVAL_REQUESTED',
    'CANDIDATE_REVISION_REQUESTED',
    'APPLICATION_SUBMITTED',
    'SUBMISSION_ISSUE_REPORTED',
    'CORRECTION_REVIEW_STARTED',
    'TASK_ASSIGNED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: EmailDeliveryStatus
DO $$ BEGIN
  CREATE TYPE "EmailDeliveryStatus" AS ENUM (
    'QUEUED',
    'SENT',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterEnum: Add Phase 7 Audit Actions
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONVERSATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MESSAGE_SENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERNAL_NOTE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'NOTIFICATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'NOTIFICATION_READ';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMAIL_NOTIFICATION_DISPATCHED';

-- CreateTable: conversations
CREATE TABLE IF NOT EXISTS "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "application_id" UUID,
    "subject" VARCHAR(200) NOT NULL,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "conversations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "conversations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: messages
CREATE TABLE IF NOT EXISTS "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_role" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: internal_notes
CREATE TABLE IF NOT EXISTS "internal_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID,
    "application_id" UUID,
    "task_id" UUID,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "internal_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "internal_notes_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "internal_notes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "internal_notes_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "internal_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: notifications
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "related_entity_type" VARCHAR(50),
    "related_entity_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: email_delivery_logs
CREATE TABLE IF NOT EXISTS "email_delivery_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "recipient_email" VARCHAR(255) NOT NULL,
    "template_id" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "provider_message_id" VARCHAR(255),
    "failure_reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_delivery_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_delivery_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "idx_conversations_org_candidate" ON "conversations"("organization_id", "candidate_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_org_application" ON "conversations"("organization_id", "application_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_org_last_message" ON "conversations"("organization_id", "last_message_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_messages_conversation_created" ON "messages"("conversation_id", "created_at" ASC);
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_unread" ON "messages"("conversation_id", "read_at");

CREATE INDEX IF NOT EXISTS "idx_internal_notes_candidate" ON "internal_notes"("organization_id", "candidate_id");
CREATE INDEX IF NOT EXISTS "idx_internal_notes_application" ON "internal_notes"("organization_id", "application_id");
CREATE INDEX IF NOT EXISTS "idx_internal_notes_task" ON "internal_notes"("organization_id", "task_id");
CREATE INDEX IF NOT EXISTS "idx_internal_notes_created" ON "internal_notes"("organization_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_notifications_recipient_unread" ON "notifications"("organization_id", "recipient_id", "read_at");
CREATE INDEX IF NOT EXISTS "idx_notifications_recipient_created" ON "notifications"("organization_id", "recipient_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_email_delivery_org_status" ON "email_delivery_logs"("organization_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_email_delivery_recipient" ON "email_delivery_logs"("recipient_email", "created_at" DESC);

-- Enable RLS and Force RLS on all Phase 7 tables
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;

ALTER TABLE "internal_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "internal_notes" FORCE ROW LEVEL SECURITY;

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

ALTER TABLE "email_delivery_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_delivery_logs" FORCE ROW LEVEL SECURITY;

-- Grants for app runtime
GRANT SELECT, INSERT, UPDATE, DELETE ON "conversations" TO oos_app_runtime, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "messages" TO oos_app_runtime, authenticated;
GRANT SELECT, INSERT ON "internal_notes" TO oos_app_runtime, authenticated;
GRANT SELECT, INSERT, UPDATE ON "notifications" TO oos_app_runtime, authenticated;
GRANT SELECT, INSERT, UPDATE ON "email_delivery_logs" TO oos_app_runtime, authenticated;

-- Conversations Policies
DO $$ BEGIN
  CREATE POLICY "conversations_select" ON "conversations"
    FOR SELECT
    USING (
      public.is_org_privileged_member(organization_id, public.current_user_id())
      OR EXISTS (
        SELECT 1 FROM candidates c
        WHERE c.id = conversations.candidate_id
        AND c."userId" = public.current_user_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "conversations_insert" ON "conversations"
    FOR INSERT
    WITH CHECK (
      public.is_org_privileged_member(organization_id, public.current_user_id())
      OR EXISTS (
        SELECT 1 FROM candidates c
        WHERE c.id = conversations.candidate_id
        AND c."userId" = public.current_user_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "conversations_update" ON "conversations"
    FOR UPDATE
    USING (
      public.is_org_privileged_member(organization_id, public.current_user_id())
      OR EXISTS (
        SELECT 1 FROM candidates c
        WHERE c.id = conversations.candidate_id
        AND c."userId" = public.current_user_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Messages Policies
DO $$ BEGIN
  CREATE POLICY "messages_select" ON "messages"
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM conversations conv
        WHERE conv.id = messages.conversation_id
        AND (
          public.is_org_privileged_member(conv.organization_id, public.current_user_id())
          OR EXISTS (
            SELECT 1 FROM candidates c
            WHERE c.id = conv.candidate_id
            AND c."userId" = public.current_user_id()
          )
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "messages_insert" ON "messages"
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM conversations conv
        WHERE conv.id = messages.conversation_id
        AND (
          public.is_org_privileged_member(conv.organization_id, public.current_user_id())
          OR EXISTS (
            SELECT 1 FROM candidates c
            WHERE c.id = conv.candidate_id
            AND c."userId" = public.current_user_id()
          )
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "messages_update" ON "messages"
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM conversations conv
        WHERE conv.id = messages.conversation_id
        AND (
          public.is_org_privileged_member(conv.organization_id, public.current_user_id())
          OR EXISTS (
            SELECT 1 FROM candidates c
            WHERE c.id = conv.candidate_id
            AND c."userId" = public.current_user_id()
          )
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Internal Notes Policies (Staff Only — 100% blocked for candidates)
DO $$ BEGIN
  CREATE POLICY "internal_notes_staff_select" ON "internal_notes"
    FOR SELECT
    USING (
      public.is_org_privileged_member(organization_id, public.current_user_id())
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "internal_notes_staff_insert" ON "internal_notes"
    FOR INSERT
    WITH CHECK (
      public.is_org_privileged_member(organization_id, public.current_user_id())
      AND author_id = public.current_user_id()
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Notifications Policies
DO $$ BEGIN
  CREATE POLICY "notifications_select" ON "notifications"
    FOR SELECT
    USING (
      recipient_id = public.current_user_id()
      OR public.is_org_privileged_member(organization_id, public.current_user_id())
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "notifications_insert" ON "notifications"
    FOR INSERT
    WITH CHECK (
      public.is_org_privileged_member(organization_id, public.current_user_id())
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "notifications_update" ON "notifications"
    FOR UPDATE
    USING (
      recipient_id = public.current_user_id()
      OR public.is_org_privileged_member(organization_id, public.current_user_id())
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Email Delivery Logs Policies (Staff-Only)
DO $$ BEGIN
  CREATE POLICY "email_delivery_logs_staff_select" ON "email_delivery_logs"
    FOR SELECT
    USING (
      public.is_org_privileged_member(organization_id, public.current_user_id())
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "email_delivery_logs_staff_insert" ON "email_delivery_logs"
    FOR INSERT
    WITH CHECK (
      public.is_org_privileged_member(organization_id, public.current_user_id())
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "email_delivery_logs_staff_update" ON "email_delivery_logs"
    FOR UPDATE
    USING (
      public.is_org_privileged_member(organization_id, public.current_user_id())
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
