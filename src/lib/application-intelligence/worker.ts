import { logger } from "@/lib/logger";
import {
  claimQueuedIntelligenceRuns,
  reclaimExpiredLeases,
  requeueRetryPendingRuns,
  INTELLIGENCE_WORKER_BATCH_SIZE,
} from "./run-claim";
import { executeIntelligenceRunPipeline, type PipelineExecuteOptions } from "./pipeline";
import { assertNotSsrAiExecution } from "./async-contract";

export type WorkerDrainResult = {
  requeued: number;
  reclaimedLeases: number;
  claimed: number;
  succeeded: number;
  failed: number;
  retryPending: number;
  durationMs: number;
};

/**
 * Drain QUEUED intelligence runs (cron/worker entry).
 * Must never run during SSR/RSC render.
 */
export async function drainIntelligenceWorker(
  options: PipelineExecuteOptions & {
    batchSize?: number;
    isRenderingServerComponent?: boolean;
  } = {}
): Promise<WorkerDrainResult> {
  assertNotSsrAiExecution(options.isRenderingServerComponent === true);

  const started = Date.now();
  const batchSize = options.batchSize ?? INTELLIGENCE_WORKER_BATCH_SIZE;

  // Reclaim first so expired leases can requeue + claim in the same drain.
  const reclaimedLeases = await reclaimExpiredLeases();
  const requeued = await requeueRetryPendingRuns(batchSize);
  const claimed = await claimQueuedIntelligenceRuns(batchSize);

  let succeeded = 0;
  let failed = 0;
  let retryPending = 0;

  for (const run of claimed) {
    const result = await executeIntelligenceRunPipeline(run.id, {
      provider: options.provider,
      actorUserId: options.actorUserId,
      ip: options.ip,
      knownEntityIds: options.knownEntityIds,
    });
    if (result.status === "SUCCEEDED") succeeded += 1;
    else if (result.status === "RETRY_PENDING") retryPending += 1;
    else failed += 1;
  }

  const durationMs = Date.now() - started;
  logger.info("Intelligence worker drain completed", {
    event: "INTELLIGENCE_WORKER_DRAIN",
    requeued,
    reclaimedLeases,
    claimed: claimed.length,
    succeeded,
    failed,
    retryPending,
    durationMs,
  });

  return {
    requeued,
    reclaimedLeases,
    claimed: claimed.length,
    succeeded,
    failed,
    retryPending,
    durationMs,
  };
}
