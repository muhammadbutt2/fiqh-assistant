import { processQueuedJobs } from "../src/server/ingest";
import { getDeps } from "../src/server/runtime";

async function main() {
  const deps = getDeps();
  await processQueuedJobs(deps.store);
  const jobs = await deps.store.listJobs();
  console.log(JSON.stringify({ processed: jobs.length, failed: jobs.filter((job) => job.status === "failed").length }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "WORKER_FAILED");
  process.exit(1);
});
