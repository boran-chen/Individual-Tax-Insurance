import { getDb } from "../db";
import {
  claimNextJob,
  finishJob,
  recoverRunningJobs,
  updateJobProgress,
} from "./job-service";
import { processBatch } from "./batch-service";
import { processReturnSubmission } from "./return-service";

const globalForWorker = globalThis as unknown as {
  __cbrWorkerStarted?: boolean;
  __cbrWorkerRunning?: boolean;
};

export async function runOneJob(): Promise<boolean> {
  if (globalForWorker.__cbrWorkerRunning) return false;
  globalForWorker.__cbrWorkerRunning = true;

  const db = getDb();
  try {
    const job = claimNextJob(db);
    if (!job) return false;

    try {
      if (job.type === "PROCESS_BATCH") {
        await processBatch(db, job.object_id, (progress) => {
          updateJobProgress(db, job.id, progress);
        });
      } else if (job.type === "COMPARE_RETURN") {
        await processReturnSubmission(db, job.object_id, (progress) => {
          updateJobProgress(db, job.id, progress);
        });
      }
      finishJob(db, job.id, "SUCCEEDED");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finishJob(db, job.id, "FAILED", message);
      console.error(`[job-worker] job ${job.id} failed:`, message);
    }

    return true;
  } finally {
    globalForWorker.__cbrWorkerRunning = false;
  }
}

export function startJobWorker(): void {
  if (globalForWorker.__cbrWorkerStarted) return;
  globalForWorker.__cbrWorkerStarted = true;

  const recovered = recoverRunningJobs(getDb());
  if (recovered > 0) {
    console.log(`[job-worker] recovered ${recovered} stale running job(s)`);
  }

  const tick = async () => {
    try {
      let processed = await runOneJob();
      while (processed) {
        processed = await runOneJob();
      }
    } catch (error) {
      console.error("[job-worker] tick error:", error);
    }
    setTimeout(tick, 1000);
  };

  setTimeout(tick, 500);
  console.log("[job-worker] started");
}
