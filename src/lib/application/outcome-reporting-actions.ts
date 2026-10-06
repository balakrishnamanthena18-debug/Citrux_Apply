"use server";

import {
  getAuthenticatedContext,
  requireEmployeeOrAdmin,
} from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import {
  getOutcomeDetail,
  getOutcomeReportingData,
} from "./outcome-reporting";
import type {
  OutcomeDetailDTO,
  OutcomeReportingFilters,
  OutcomeReportingResponseDTO,
} from "./outcome-reporting-types";

export async function getOutcomeReportingAction(
  filters: OutcomeReportingFilters = {}
): Promise<{ success: true; data: OutcomeReportingResponseDTO } | { success: false; error: string }> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const data = await withRlsContext(ctx.userId, async (tx) =>
      getOutcomeReportingData(tx, ctx, filters)
    );

    return { success: true, data };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Unable to load outcome reporting.",
    };
  }
}

export async function getOutcomeDetailAction(
  outcomeId: string
): Promise<{ success: true; data: OutcomeDetailDTO } | { success: false; error: string }> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const data = await withRlsContext(ctx.userId, async (tx) =>
      getOutcomeDetail(tx, ctx, outcomeId)
    );

    return { success: true, data };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Unable to load outcome detail.",
    };
  }
}
