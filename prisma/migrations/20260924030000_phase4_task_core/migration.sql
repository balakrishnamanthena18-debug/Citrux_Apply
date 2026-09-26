-- Phase 4: Task & Preparation Core Migration
-- Operations Operating System (OOS) - PostgreSQL Contract

-- 1. Create Enums
CREATE TYPE "public"."TaskCategory" AS ENUM (
  'CANDIDATE',
  'JOB',
  'APPLICATION',
  'QA',
  'OPERATIONAL'
);

CREATE TYPE "public"."TaskType" AS ENUM (
  'COMPLETE_PROFILE',
  'UPLOAD_DOCUMENT',
  'VERIFY_INFORMATION',
  'APPROVE_APPLICATION',
  'PROVIDE_MISSING_INFO',
  'REVIEW_JOB',
  'QUALIFY_JOB',
  'PREPARE_RESUME',
  'PREPARE_COVER_LETTER',
  'PREPARE_SCREENING_ANSWERS',
  'COMPLETE_APPLICATION',
  'VERIFY_APPLICATION',
  'SUBMIT_APPLICATION',
  'RESUME_QA',
  'APPLICATION_QA',
  'SUBMISSION_QA',
  'CANDIDATE_ASSIGNMENT',
  'CANDIDATE_REASSIGNMENT',
  'ESCALATION_HANDLING',
  'SUBMISSION_CORRECTION'
);

CREATE TYPE "public"."TaskStatus" AS ENUM (
  'BACKLOG',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING',
  'READY_FOR_REVIEW',
  'QA',
  'COMPLETED',
  'BLOCKED',
  'CANCELED',
  'REASSIGNED',
  'ESCALATED'
);

CREATE TYPE "public"."TaskPriority" AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT'
);

-- Alter AuditAction enum to add Phase 4 audit actions
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TASK_CREATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TASK_UPDATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TASK_REASSIGNED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TASK_STATUS_CHANGED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TASK_CHECKLIST_UPDATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TASK_COMPLETED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TASK_CANCELED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TASK_ESCALATED';

-- 2. Create Tables

CREATE TABLE "public"."tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "category" "public"."TaskCategory" NOT NULL,
  "type" "public"."TaskType" NOT NULL,
  "status" "public"."TaskStatus" NOT NULL DEFAULT 'BACKLOG',
  "priority" "public"."TaskPriority" NOT NULL DEFAULT 'NORMAL',
  "dueDate" TIMESTAMPTZ(6),
  
  "assignedEmployeeId" UUID,
  "candidateId" UUID,
  "jobId" UUID,
  "applicationId" UUID,

  "waitingReason" VARCHAR(500),
  "blockedReason" VARCHAR(500),
  "escalationReason" VARCHAR(500),

  "completedAt" TIMESTAMPTZ(6),
  "completedById" UUID,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tasks_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tasks_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tasks_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tasks_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tasks_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "public"."task_checklist_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "taskId" UUID NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMPTZ(6),
  "completedById" UUID,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_checklist_items_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "public"."task_state_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "taskId" UUID NOT NULL,
  "fromStatus" "public"."TaskStatus" NOT NULL,
  "toStatus" "public"."TaskStatus" NOT NULL,
  "changedById" UUID NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_state_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_state_history_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_state_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 3. Create Indexes
CREATE INDEX "tasks_organizationId_status_idx" ON "public"."tasks"("organizationId", "status");
CREATE INDEX "tasks_assignedEmployeeId_status_idx" ON "public"."tasks"("assignedEmployeeId", "status");
CREATE INDEX "tasks_candidateId_status_idx" ON "public"."tasks"("candidateId", "status");
CREATE INDEX "tasks_applicationId_status_idx" ON "public"."tasks"("applicationId", "status");
CREATE INDEX "tasks_category_status_idx" ON "public"."tasks"("category", "status");
CREATE INDEX "tasks_dueDate_idx" ON "public"."tasks"("dueDate");

CREATE INDEX "task_checklist_items_taskId_orderIndex_idx" ON "public"."task_checklist_items"("taskId", "orderIndex");
CREATE INDEX "task_state_history_taskId_createdAt_idx" ON "public"."task_state_history"("taskId", "createdAt");

-- 4. Enable and Force Row Level Security
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tasks" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."task_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."task_checklist_items" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."task_state_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."task_state_history" FORCE ROW LEVEL SECURITY;

-- 5. Helper SECURITY DEFINER Functions
CREATE OR REPLACE FUNCTION public.is_task_org_privileged_member(lookup_task_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.memberships m ON t."organizationId" = m."organizationId"
    WHERE t.id = lookup_task_id
      AND m."userId" = lookup_user_id
      AND m.status = 'ACTIVE'
      AND m.role IN ('EMPLOYEE', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION public.is_task_org_privileged_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_task_org_privileged_member(uuid, uuid) TO oos_app_runtime, authenticated;

-- 6. RLS Policies (Staff-Only Operational Scope)

-- 6.1 Tasks Policies
CREATE POLICY tasks_select ON "public"."tasks"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY tasks_insert ON "public"."tasks"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY tasks_update ON "public"."tasks"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY tasks_delete ON "public"."tasks"
  FOR DELETE USING (
    false
  );

-- 6.2 Task Checklist Items Policies
CREATE POLICY task_checklist_items_select ON "public"."task_checklist_items"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND
    public.is_task_org_privileged_member("taskId", public.current_user_id())
  );

CREATE POLICY task_checklist_items_mutation ON "public"."task_checklist_items"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND
    public.is_task_org_privileged_member("taskId", public.current_user_id())
  );

-- 6.3 Task State History Policies
CREATE POLICY task_state_history_select ON "public"."task_state_history"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND
    public.is_task_org_privileged_member("taskId", public.current_user_id())
  );

CREATE POLICY task_state_history_mutation ON "public"."task_state_history"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND
    public.is_task_org_privileged_member("taskId", public.current_user_id())
  );

-- 7. Grant Privileges to Application Runtime Role (oos_app_runtime)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "public"."tasks",
  "public"."task_checklist_items",
  "public"."task_state_history"
TO oos_app_runtime;
