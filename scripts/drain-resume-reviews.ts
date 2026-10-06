import "dotenv/config";
import { drainResumeReviewWorker } from "../src/lib/resume-intelligence/worker";

async function main() {
  const result = await drainResumeReviewWorker(5);
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "failed");
  process.exit(1);
});
