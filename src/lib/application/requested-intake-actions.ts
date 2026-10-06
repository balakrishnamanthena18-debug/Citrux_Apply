"use server";

/**
 * Phase 5G — staff actions for Requested Application Intake Queue.
 */

import {
  getAuthenticatedContext,
  requireEmployeeOrAdmin,
} from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { AuthorizationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { startApplicationFromDeskAction } from "@/lib/application/actions";
import { listRequestedApplicationIntake } from "@/lib/application/requested-intake";
import type {
  RequestedApplicationIntakePage,
  RequestedApplicationIntakeQuery,
} from "@/lib/application/requested-intake-types";
import { z } from "zod";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

const StartFromIntakeSchema = z.object({
  candidateId: z.string().uuid(),
  jobId: z.string().uuid(),
});

/**
 * Staff-only: list pending requested applications (no active Application).
 */
export async function getRequestedApplicationIntakeAction(
  query: RequestedApplicationIntakeQuery = {}
): Promise<ActionResult<RequestedApplicationIntakePage>> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const page = await withRlsContext(ctx.userId, async (tx) => {
      return listRequestedApplicationIntake(tx, ctx.organizationId, query);
    });

    return { success: true, data: page };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }
    logger.error("Requested application intake read failed", {
      event: "REQUESTED_APPLICATION_INTAKE_READ",
      success: false,
    });
    return {
      success: false,
      error: "Unable to load requested applications.",
      code: "FAILED",
    };
  }
}

/**
 * Staff-only: start Application from a queue row via existing desk action.
 * Does not create a parallel create path.
 */
export async function startApplicationFromRequestedIntakeAction(input: {
  candidateId: string;
  jobId: string;
}): Promise<
  ActionResult<{ applicationId: string; jobId: string; isExistingJob: boolean }>
> {
  const parsed = StartFromIntakeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid request.", code: "VALIDATION" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);
  } catch {
    return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
  }

  // Reuse authoritative desk create (OPEN check, opportunity ensure, duplicate guard).
  const result = await startApplicationFromDeskAction({
    candidateId: parsed.data.candidateId,
    jobId: parsed.data.jobId,
  });
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error || "Failed to initialize application",
      code: "FAILED",
    };
  }
  return { success: true, data: result.data };
}
