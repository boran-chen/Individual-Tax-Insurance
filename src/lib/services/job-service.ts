import { newId, nowIso, transaction, type Db } from "../db";

export type JobType = "PROCESS_BATCH" | "COMPARE_RETURN";
export type JobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type JobRecord = {
  id: string;
  type: JobType;
  object_id: string;
  status: JobStatus;
  progress: number;
  error_message: string | null;
  idempotency_key: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export function enqueueJob(
  db: Db,
  type: JobType,
  objectId: string,
  idempotencyKey = `${type}:${objectId}`,
): string {
  const existing = db
    .prepare("SELECT id FROM jobs WHERE idempotency_key = ?")
    .get(idempotencyKey) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = newId();
  db.prepare(
    `INSERT INTO jobs (id, type, object_id, status, progress, idempotency_key, created_at)
     VALUES (?, ?, ?, 'PENDING', 0, ?, ?)`,
  ).run(id, type, objectId, idempotencyKey, nowIso());
  return id;
}

export function recoverRunningJobs(db: Db): number {
  const result = db
    .prepare("UPDATE jobs SET status = 'PENDING', started_at = NULL, progress = 0 WHERE status = 'RUNNING'")
    .run();
  return Number(result.changes ?? 0);
}

export function getJob(db: Db, jobId: string): JobRecord | null {
  return (db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as JobRecord | undefined) ?? null;
}

export function claimNextJob(db: Db): JobRecord | null {
  return transaction(db, () => {
    const row = db
      .prepare(
        "SELECT * FROM jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1",
      )
      .get() as JobRecord | undefined;
    if (!row) return null;
    db.prepare("UPDATE jobs SET status = 'RUNNING', started_at = ? WHERE id = ?").run(
      nowIso(),
      row.id,
    );
    return { ...row, status: "RUNNING" as JobStatus, started_at: nowIso() };
  });
}

export function updateJobProgress(db: Db, jobId: string, progress: number): void {
  const clamped = Math.max(0, Math.min(99, Math.round(progress)));
  db.prepare("UPDATE jobs SET progress = ? WHERE id = ?").run(clamped, jobId);
}

export function finishJob(
  db: Db,
  jobId: string,
  status: "SUCCEEDED" | "FAILED",
  errorMessage?: string,
): void {
  db.prepare(
    "UPDATE jobs SET status = ?, progress = ?, error_message = ?, finished_at = ? WHERE id = ?",
  ).run(status, status === "SUCCEEDED" ? 100 : 0, errorMessage ?? null, nowIso(), jobId);
}
