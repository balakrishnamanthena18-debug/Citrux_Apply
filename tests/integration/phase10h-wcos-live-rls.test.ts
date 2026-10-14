/**
 * Phase 10H-E — WCOS Live PostgreSQL FORCE RLS & Multi-Tenant Isolation Tests
 * Adversarially verifies that PostgreSQL RLS and FORCE RLS strictly isolate WCOS tables
 * across organizations and prevent unauthorized cross-tenant read/write operations.
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
} from "../helpers/live-rls";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 10H-E — Live PostgreSQL FORCE RLS & Tenant Security", () => {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  const userAdminA = randomUUID();
  const userAdminB = randomUUID();
  const userWorkerA = randomUUID();
  const userWorkerB = randomUUID();
  const userStranger = randomUUID();

  const queueAId = randomUUID();
  const queueBId = randomUUID();
  const taskAId = randomUUID();
  const taskBId = randomUUID();
  const capDefAId = randomUUID();
  const capDefBId = randomUUID();

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (client) => {
      // 1. Grant table permissions to runtime role, ensuring DELETE remains revoked on immutable tables
      await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oos_app_runtime");
      await client.query("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO oos_app_runtime");
      await client.query(`
        REVOKE DELETE ON TABLE 
          "offers", "offer_versions", "negotiations", "negotiation_events", 
          "offer_decisions", "joining_records", "placement_records", "offer_evidence",
          "service_contract_versions", "commercial_events", "invoice_lines",
          "payments", "commercial_credits", "commercial_refunds", "commercial_adjustments", "revenue_attributions",
          "wcos_assignment_history", "wcos_dispatch_decisions", "wcos_blocking_records", "wcos_escalation_records", "wcos_availability_records"
        FROM oos_app_runtime;
      `);

      // 2. Create Organizations
      await client.query(
        `INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)`,
        [tenantAId, "Org WCOS A", `wcos-a-${Date.now()}`, tenantBId, "Org WCOS B", `wcos-b-${Date.now()}`]
      );

      // 3. Create Users
      await client.query(
        `INSERT INTO public.users (id, email) VALUES
         ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10)`,
        [
          userAdminA, `admin-wcos-a-${Date.now()}@a.com`,
          userAdminB, `admin-wcos-b-${Date.now()}@b.com`,
          userWorkerA, `worker-wcos-a-${Date.now()}@a.com`,
          userWorkerB, `worker-wcos-b-${Date.now()}@b.com`,
          userStranger, `stranger-wcos-${Date.now()}@x.com`,
        ]
      );

      // 4. Memberships
      await client.query(
        `INSERT INTO public.memberships (id, "organizationId", "userId", role, status) VALUES
         (gen_random_uuid(), $1, $2, 'ADMIN', 'ACTIVE'),
         (gen_random_uuid(), $3, $4, 'ADMIN', 'ACTIVE'),
         (gen_random_uuid(), $1, $5, 'EMPLOYEE', 'ACTIVE'),
         (gen_random_uuid(), $3, $6, 'EMPLOYEE', 'ACTIVE')`,
        [tenantAId, userAdminA, tenantBId, userAdminB, userWorkerA, userWorkerB]
      );

      // 5. Queues
      await client.query(
        `INSERT INTO public.wcos_queues (id, organization_id, name, slug, is_active) VALUES
         ($1, $2, 'Queue A', 'queue-a', true),
         ($3, $4, 'Queue B', 'queue-b', true)`,
        [queueAId, tenantAId, queueBId, tenantBId]
      );

      // 6. Capability Definitions
      await client.query(
        `INSERT INTO public.wcos_capability_definitions (id, organization_id, code, name) VALUES
         ($1, $2, 'CAP_RESUME_A', 'Resume Engineering A'),
         ($3, $4, 'CAP_RESUME_B', 'Resume Engineering B')`,
        [capDefAId, tenantAId, capDefBId, tenantBId]
      );

      // 7. Tasks
      await client.query(
        `INSERT INTO public.tasks (id, "organizationId", "createdById", title, category, type, status, priority, "dueDate") VALUES
         ($1, $2, $3, 'Task A', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', now() + interval '2 days'),
         ($4, $5, $6, 'Task B', 'APPLICATION', 'PREPARE_RESUME', 'BACKLOG', 'NORMAL', now() + interval '2 days')`,
        [taskAId, tenantAId, userAdminA, taskBId, tenantBId, userAdminB]
      );

      // 8. Work Items
      await client.query(
        `INSERT INTO public.wcos_work_items (
           task_id, organization_id, queue_id, work_type, required_capability_code,
           sla_target_at, sla_warning_at, dispatch_reason
         ) VALUES
         ($1, $2, $3, 'DEMAND_RESUME_TAILORING', 'CAP_RESUME_A', now() + interval '2 days', now() + interval '1 day', 'Initial'),
         ($4, $5, $6, 'DEMAND_RESUME_TAILORING', 'CAP_RESUME_B', now() + interval '2 days', now() + interval '1 day', 'Initial')`,
        [taskAId, tenantAId, queueAId, taskBId, tenantBId, queueBId]
      );

      // 9. Escalation & Blocking records
      await client.query(
        `INSERT INTO public.wcos_escalation_records (id, organization_id, task_id, level, trigger_reason, actor_id, idempotency_key) VALUES
         (gen_random_uuid(), $1, $2, 'LEVEL_1_WARNING', 'SLA warning', $3, $4),
         (gen_random_uuid(), $5, $6, 'LEVEL_1_WARNING', 'SLA warning', $7, $8)`,
        [tenantAId, taskAId, userAdminA, `esc-a-${Date.now()}`, tenantBId, taskBId, userAdminB, `esc-b-${Date.now()}`]
      );

      await client.query(
        `INSERT INTO public.wcos_blocking_records (id, organization_id, task_id, category, reason, actor_id, unblock_expected_at) VALUES
         (gen_random_uuid(), $1, $2, 'WAIT_CANDIDATE_INPUT', 'Waiting candidate', $3, now() + interval '1 day'),
         (gen_random_uuid(), $4, $5, 'WAIT_CANDIDATE_INPUT', 'Waiting candidate', $6, now() + interval '1 day')`,
        [tenantAId, taskAId, userAdminA, tenantBId, taskBId, userAdminB]
      );
    });
  });

  afterAll(async () => {
    await withBypassClient(async (client) => {
      await client.query(`DELETE FROM public.wcos_blocking_records WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.wcos_escalation_records WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.wcos_work_items WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.tasks WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.wcos_capability_definitions WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.wcos_queues WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.memberships WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.users WHERE id IN ($1, $2, $3, $4, $5)`, [
        userAdminA, userAdminB, userWorkerA, userWorkerB, userStranger
      ]);
      await client.query(`DELETE FROM public.organizations WHERE id IN ($1, $2)`, [tenantAId, tenantBId]);
    });
  });

  it("proves Admin A can query Org A WCOS work items but is physically blocked from Org B", async () => {
    await withRuntimeRlsAsUser(userAdminA, async (client) => {
      const res = await client.query(`SELECT task_id FROM public.wcos_work_items`);
      const taskIds = res.rows.map((r) => r.task_id);
      expect(taskIds).toContain(taskAId);
      expect(taskIds).not.toContain(taskBId);
    });
  });

  it("proves Admin A cannot insert a work item pointing to Org B tenant", async () => {
    await withRuntimeRlsAsUser(userAdminA, async (client) => {
      const dummyTaskId = randomUUID();
      // Should fail check constraint or RLS
      await expect(
        client.query(
          `INSERT INTO public.wcos_work_items (
             task_id, organization_id, queue_id, work_type, required_capability_code,
             sla_target_at, sla_warning_at, dispatch_reason
           ) VALUES
           ($1, $2, $3, 'DEMAND_RESUME_TAILORING', 'CAP_RESUME_B', now() + interval '2 days', now() + interval '1 day', 'Malicious')`,
          [dummyTaskId, tenantBId, queueBId]
        )
      ).rejects.toThrow();
    });
  });

  it("proves Stranger with no membership in Org A or B cannot read any WCOS tables", async () => {
    await withRuntimeRlsAsUser(userStranger, async (client) => {
      const wiRes = await client.query(`SELECT task_id FROM public.wcos_work_items`);
      expect(wiRes.rows.length).toBe(0);

      const qRes = await client.query(`SELECT id FROM public.wcos_queues`);
      expect(qRes.rows.length).toBe(0);

      const capRes = await client.query(`SELECT id FROM public.wcos_capability_definitions`);
      expect(capRes.rows.length).toBe(0);

      const escRes = await client.query(`SELECT id FROM public.wcos_escalation_records`);
      expect(escRes.rows.length).toBe(0);

      const blkRes = await client.query(`SELECT id FROM public.wcos_blocking_records`);
      expect(blkRes.rows.length).toBe(0);
    });
  });

  it("proves runtime role cannot DELETE from immutable WCOS tables", async () => {
    await withRuntimeRlsAsUser(userAdminA, async (client) => {
      await expect(
        client.query(`DELETE FROM public.wcos_escalation_records WHERE organization_id = $1`, [tenantAId])
      ).rejects.toThrow(/permission denied/i);
    });

    await withRuntimeRlsAsUser(userAdminA, async (client) => {
      await expect(
        client.query(`DELETE FROM public.wcos_blocking_records WHERE organization_id = $1`, [tenantAId])
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it("proves ON DELETE RESTRICT prevents deleting a Task with attached WCOS work item", async () => {
    await withBypassClient(async (client) => {
      await expect(
        client.query(`DELETE FROM public.tasks WHERE id = $1`, [taskAId])
      ).rejects.toThrow(/violates foreign key constraint/i);
    });
  });
});
