import fs from "node:fs";
import path from "node:path";
import { newId, nowIso, transaction, type Db } from "../db";
import { getReturnTemplate } from "./config-service";
import { ExcelParseError, readReturnWorkbook } from "../excel/reader";
import { buildCompareKey, buildKeyMask, compareReturn } from "../rules/v1/compare";
import { parseAmount } from "../rules/v1/money";
import { decryptText, encryptText, sha256File } from "../utils/crypto";
import { conflict, notFound } from "../utils/http-error";
import { writeAudit } from "./audit-service";
import { enqueueJob } from "./job-service";
import {
  assertXlsxFileName,
  assertXlsxMagic,
  ensureStorageDirs,
  saveStreamToFile,
  storageRoot,
} from "./upload-service";
import { getBatchById, type BatchRow } from "./batch-service";
import type { AuthUser } from "../auth/session";
import type {
  ActualCompareRow,
  CompareDiffType,
  CompareResult,
  ExpectedCompareRow,
} from "../rules/types";
import { RULES_VERSION } from "../rules/v1/version";
import { canAccessOrg } from "../auth/guard";
import { buildLaborIncomeRowValues, LABOR_INCOME_COLUMNS } from "../rules/v1/datasets";
import { writeWorkbook, type CellValue, type SheetData } from "../excel/writer";
import { TASK_LABELS } from "../utils/labels";

export type ReturnTaskStatus =
  | "NOT_SUBMITTED"
  | "PENDING_COMPARE"
  | "COMPARING"
  | "PASSED"
  | "REJECTED"
  | "COMPARE_ERROR";

export type ReturnSubmissionStatus =
  | "PENDING"
  | "COMPARING"
  | "PASSED"
  | "FAILED"
  | "PARSE_ERROR";

export type ReturnTaskRow = {
  id: string;
  batch_id: string;
  org_id: string;
  status: ReturnTaskStatus;
  current_submission_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ReturnSubmissionRow = {
  id: string;
  task_id: string;
  batch_id: string;
  org_id: string;
  version: number;
  file_name: string;
  storage_path: string;
  sha256: string;
  uploaded_by: string;
  status: ReturnSubmissionStatus;
  engine_version: string;
  total_rows: number;
  matched_rows: number;
  diff_count: number;
  error_message: string | null;
  created_at: string;
  compared_at: string | null;
};

export type ReturnDiffRow = {
  id: string;
  submission_id: string;
  diff_type: CompareDiffType;
  diff_key: string;
  source_row_id: string | null;
  source_row_number: number | null;
  return_row_number: number | null;
  field_name: string | null;
  original_value: string | null;
  returned_value: string | null;
  message: string | null;
};

export type ReturnProgressRow = {
  org_id: string;
  org_name: string;
  short_name: string;
  task_id: string | null;
  task_status: ReturnTaskStatus;
  submission_id: string | null;
  submission_version: number | null;
  file_name: string | null;
  submission_status: ReturnSubmissionStatus | null;
  total_rows: number | null;
  matched_rows: number | null;
  diff_count: number | null;
  created_at: string | null;
  compared_at: string | null;
  error_message: string | null;
};

export type AggregationRow = {
  id: string;
  month: string;
  org_id: string;
  org_name: string;
  short_name: string;
  batch_id: string;
  batch_version: number;
  submission_id: string;
  status: "ACTIVE" | "EXCLUDED";
  record_count: number;
  income_cents: number;
  aggregated_at: string;
};

function getTask(db: Db, batchId: string, orgId: string): ReturnTaskRow | null {
  return (
    (db
      .prepare("SELECT * FROM return_tasks WHERE batch_id = ? AND org_id = ?")
      .get(batchId, orgId) as ReturnTaskRow | undefined) ?? null
  );
}

function ensureTask(db: Db, batchId: string, orgId: string): ReturnTaskRow {
  const existing = getTask(db, batchId, orgId);
  if (existing) return existing;
  const now = nowIso();
  const id = newId();
  db.prepare(
    `INSERT INTO return_tasks (id, batch_id, org_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'NOT_SUBMITTED', ?, ?)`,
  ).run(id, batchId, orgId, now, now);
  return {
    id,
    batch_id: batchId,
    org_id: orgId,
    status: "NOT_SUBMITTED",
    current_submission_id: null,
    created_at: now,
    updated_at: now,
  };
}

export async function createReturnSubmission(
  db: Db,
  user: AuthUser,
  input: {
    batchId: string;
    orgId: string;
    fileName: string;
    stream: ReadableStream<Uint8Array>;
  },
): Promise<{ submissionId: string; jobId: string }> {
  const batch = getBatchById(db, input.batchId);
  if (!batch) throw notFound("批次不存在");
  if (batch.status !== "PUBLISHED") throw conflict("批次未发布，不能回传");
  if (!canAccessOrg(user, input.orgId)) throw notFound("组织不存在或无权访问");

  const org = db
    .prepare("SELECT id FROM organizations WHERE id = ?")
    .get(input.orgId) as { id: string } | undefined;
  if (!org) throw notFound("组织不存在");

  const hasData = db
    .prepare(
      "SELECT 1 AS ok FROM source_rows WHERE batch_id = ? AND org_id = ? AND valid_status = 'VALID' LIMIT 1",
    )
    .get(input.batchId, input.orgId) as { ok: number } | undefined;
  if (!hasData) throw notFound("该组织在本批次没有可回传数据");

  const task = ensureTask(db, input.batchId, input.orgId);
  if (task.status === "PENDING_COMPARE" || task.status === "COMPARING") {
    throw conflict("上一次回传正在比对，请稍后再试");
  }

  assertXlsxFileName(input.fileName);
  ensureStorageDirs();

  const submissionId = newId();
  const targetPath = path.join(storageRoot(), "returns", `${submissionId}.xlsx`);
  const { size, sha256 } = await saveStreamToFile(input.stream, targetPath);
  await assertXlsxMagic(targetPath);

  const versionRow = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM return_submissions WHERE task_id = ?")
    .get(task.id) as { version: number };
  const version = Number(versionRow.version) + 1;

  transaction(db, () => {
    db.prepare(
      `INSERT INTO return_submissions
         (id, task_id, batch_id, org_id, version, file_name, storage_path, sha256, uploaded_by,
          status, engine_version, total_rows, matched_rows, diff_count, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 0, 0, 0, NULL, ?)`,
    ).run(
      submissionId,
      task.id,
      input.batchId,
      input.orgId,
      version,
      input.fileName,
      targetPath,
      sha256,
      user.id,
      RULES_VERSION,
      nowIso(),
    );

    db.prepare(
      "UPDATE return_tasks SET status = 'PENDING_COMPARE', current_submission_id = ?, updated_at = ? WHERE id = ?",
    ).run(submissionId, nowIso(), task.id);
  });

  const jobId = enqueueJob(db, "COMPARE_RETURN", submissionId);

  writeAudit(db, {
    userId: user.id,
    action: "UPLOAD_RETURN",
    objectType: "RETURN_SUBMISSION",
    objectId: submissionId,
    orgId: input.orgId,
    context: {
      batchId: input.batchId,
      month: batch.month,
      version,
      fileName: input.fileName,
      size,
      sha256,
    },
  });

  return { submissionId, jobId };
}

function expectedRows(
  db: Db,
  batchId: string,
  orgId: string,
): ExpectedCompareRow[] {
  const rows = db
    .prepare(
      `SELECT sr.name, sr.id_type, sr.id_number_enc, sr.taxable_income_cents, sr.row_number
         FROM dataset_rows dr
         JOIN source_rows sr ON sr.id = dr.source_row_id
        WHERE dr.batch_id = ? AND dr.org_id = ? AND dr.dataset_type = 'LABOR_INCOME'
        ORDER BY sr.row_number`,
    )
    .all(batchId, orgId) as Array<{
    name: string;
    id_type: string;
    id_number_enc: string;
    taxable_income_cents: number;
    row_number: number;
  }>;

  return rows.map((row) => {
    const idNumber = decryptText(row.id_number_enc);
    return {
      key: buildCompareKey(row.name, idNumber),
      keyMask: buildKeyMask(row.name, idNumber),
      name: row.name,
      idType: row.id_type,
      idNumber,
      incomeCents: Number(row.taxable_income_cents),
      rowNumber: Number(row.row_number),
    };
  });
}

export async function processReturnSubmission(
  db: Db,
  submissionId: string,
  onProgress?: (progress: number) => void,
): Promise<CompareResult> {
  const submission = db
    .prepare("SELECT * FROM return_submissions WHERE id = ?")
    .get(submissionId) as ReturnSubmissionRow | undefined;
  if (!submission) throw notFound("回传记录不存在");
  if (submission.status === "PASSED") {
    return {
      passed: true,
      totalSource: Number(submission.matched_rows),
      totalReturn: Number(submission.total_rows),
      matchedRows: Number(submission.matched_rows),
      diffs: [],
    };
  }

  const batch = getBatchById(db, submission.batch_id);
  if (!batch) throw notFound("批次不存在");

  db.prepare("UPDATE return_submissions SET status = 'COMPARING' WHERE id = ?").run(submissionId);
  onProgress?.(10);

  try {
    const template = getReturnTemplate(db);
    const parsed = await readReturnWorkbook(submission.storage_path, template);
    onProgress?.(45);

    const expected = expectedRows(db, batch.id, submission.org_id);
    const actual: ActualCompareRow[] = parsed.rows.map((row) => {
      const amount = parseAmount(row.incomeRaw);
      const incomeCents =
        amount.status === "VALID" || amount.status === "NEGATIVE" ? amount.cents : null;
      return {
        key: buildCompareKey(row.name, row.idNumber),
        keyMask: buildKeyMask(row.name, row.idNumber),
        name: row.name,
        idType: row.idType,
        idNumber: row.idNumber,
        incomeCents,
        rowNumber: row.rowNumber,
      };
    });

    const result = compareReturn(expected, actual, template.toleranceCents);
    onProgress?.(70);

    const now = nowIso();
    transaction(db, () => {
      db.prepare("DELETE FROM return_diffs WHERE submission_id = ?").run(submissionId);
      db.prepare("DELETE FROM return_rows WHERE submission_id = ?").run(submissionId);

      const insertRow = db.prepare(
        `INSERT INTO return_rows
           (id, submission_id, row_number, raw_json_enc, name, id_type, id_number_enc,
            id_fingerprint, id_mask, income_cents, income_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const row of parsed.rows) {
        const amount = parseAmount(row.incomeRaw);
        insertRow.run(
          newId(),
          submissionId,
          row.rowNumber,
          encryptText(JSON.stringify(row.raw)),
          row.name,
          row.idType,
          row.idNumber ? encryptText(row.idNumber) : "",
          "",
          "",
          amount.cents,
          amount.text,
        );
      }

      const insertDiff = db.prepare(
        `INSERT INTO return_diffs
           (id, submission_id, diff_type, diff_key, source_row_id, source_row_number, return_row_number,
            field_name, original_value, returned_value, message)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      );
      for (const diff of result.diffs) {
        insertDiff.run(
          newId(),
          submissionId,
          diff.type,
          diff.keyMask,
          diff.sourceRowNumber ?? null,
          diff.returnRowNumber ?? null,
          diff.field ?? null,
          diff.originalValue ?? null,
          diff.returnedValue ?? null,
          diff.message,
        );
      }

      db.prepare(
        `UPDATE return_submissions
            SET status = ?, total_rows = ?, matched_rows = ?, diff_count = ?,
                compared_at = ?, error_message = NULL
          WHERE id = ?`,
      ).run(
        result.passed ? "PASSED" : "FAILED",
        result.totalReturn,
        result.matchedRows,
        result.diffs.length,
        now,
        submissionId,
      );

      db.prepare(
        "UPDATE return_tasks SET status = ?, updated_at = ? WHERE id = ?",
      ).run(result.passed ? "PASSED" : "REJECTED", now, submission.task_id);

      const incomeTotal = expected.reduce((total, row) => total + row.incomeCents, 0);

      if (result.passed) {
        db.prepare(
          `INSERT INTO aggregations
             (id, month, org_id, batch_id, submission_id, status, record_count, income_cents, aggregated_at)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
           ON CONFLICT(month, org_id) DO UPDATE SET
             batch_id = excluded.batch_id,
             submission_id = excluded.submission_id,
             status = 'ACTIVE',
             record_count = excluded.record_count,
             income_cents = excluded.income_cents,
             aggregated_at = excluded.aggregated_at`,
        ).run(
          newId(),
          batch.month,
          submission.org_id,
          batch.id,
          submissionId,
          expected.length,
          incomeTotal,
          now,
        );
      } else {
        db.prepare(
          "UPDATE aggregations SET status = 'EXCLUDED' WHERE month = ? AND org_id = ?",
        ).run(batch.month, submission.org_id);
      }
    });

    writeAudit(db, {
      userId: submission.uploaded_by,
      action: "COMPARE_RETURN",
      objectType: "RETURN_SUBMISSION",
      objectId: submissionId,
      orgId: submission.org_id,
      result: result.passed ? "SUCCESS" : "FAILURE",
      context: {
        batchId: batch.id,
        month: batch.month,
        totalSource: result.totalSource,
        totalReturn: result.totalReturn,
        matchedRows: result.matchedRows,
        diffCount: result.diffs.length,
      },
    });

    onProgress?.(95);
    return result;
  } catch (error) {
    const now = nowIso();
    const isParse = error instanceof ExcelParseError;
    db.prepare(
      "UPDATE return_submissions SET status = ?, error_message = ?, compared_at = ? WHERE id = ?",
    ).run(
      isParse ? "PARSE_ERROR" : "FAILED",
      error instanceof Error ? error.message : String(error),
      now,
      submissionId,
    );
    db.prepare("UPDATE return_tasks SET status = 'COMPARE_ERROR', updated_at = ? WHERE id = ?").run(
      now,
      submission.task_id,
    );
    db.prepare("UPDATE aggregations SET status = 'EXCLUDED' WHERE month = ? AND org_id = ?").run(
      batch.month,
      submission.org_id,
    );
    writeAudit(db, {
      userId: submission.uploaded_by,
      action: "COMPARE_RETURN",
      objectType: "RETURN_SUBMISSION",
      objectId: submissionId,
      orgId: submission.org_id,
      result: "FAILURE",
      context: { batchId: batch.id, month: batch.month, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

export function getSubmissionForUser(
  db: Db,
  user: AuthUser,
  submissionId: string,
): ReturnSubmissionRow {
  const submission = db
    .prepare("SELECT * FROM return_submissions WHERE id = ?")
    .get(submissionId) as ReturnSubmissionRow | undefined;
  if (!submission) throw notFound("回传记录不存在");
  if (!canAccessOrg(user, submission.org_id)) throw notFound("回传记录不存在");
  return submission;
}

export function listSubmissionsForOrg(
  db: Db,
  batchId: string,
  orgId: string,
): ReturnSubmissionRow[] {
  const rows = db
    .prepare(
      "SELECT * FROM return_submissions WHERE batch_id = ? AND org_id = ? ORDER BY version DESC",
    )
    .all(batchId, orgId) as unknown as ReturnSubmissionRow[];
  return rows.map((row) => ({ ...row }));
}

export function getReturnProgress(
  db: Db,
  user: AuthUser,
  batchId: string,
): ReturnProgressRow[] {
  const params: string[] = [batchId];
  let orgFilter = "";
  if (user.role === "PROVINCE") {
    if (!user.orgIds.length) return [];
    orgFilter = ` AND t.org_id IN (${user.orgIds.map(() => "?").join(", ")})`;
    params.push(...user.orgIds);
  }

  const rows = db
    .prepare(
      `SELECT t.id AS task_id, t.batch_id, t.org_id, t.status AS task_status,
              o.name AS org_name, o.short_name,
              s.id AS submission_id, s.version AS submission_version, s.file_name,
              s.status AS submission_status, s.total_rows, s.matched_rows, s.diff_count,
              s.created_at, s.compared_at, s.error_message
         FROM return_tasks t
         JOIN organizations o ON o.id = t.org_id
         LEFT JOIN return_submissions s ON s.id = t.current_submission_id
        WHERE t.batch_id = ?${orgFilter}
        ORDER BY o.sort_order`,
    )
    .all(...params) as unknown as Array<{
    task_id: string;
    batch_id: string;
    org_id: string;
    task_status: ReturnTaskStatus;
    org_name: string;
    short_name: string;
    submission_id: string | null;
    submission_version: number | null;
    file_name: string | null;
    submission_status: ReturnSubmissionStatus | null;
    total_rows: number | null;
    matched_rows: number | null;
    diff_count: number | null;
    created_at: string | null;
    compared_at: string | null;
    error_message: string | null;
  }>;

  return rows.map((row) => ({
    org_id: row.org_id,
    org_name: row.org_name,
    short_name: row.short_name,
    task_id: row.task_id,
    task_status: row.task_status,
    submission_id: row.submission_id,
    submission_version: row.submission_version,
    file_name: row.file_name,
    submission_status: row.submission_status,
    total_rows: row.total_rows,
    matched_rows: row.matched_rows,
    diff_count: row.diff_count,
    created_at: row.created_at,
    compared_at: row.compared_at,
    error_message: row.error_message,
  }));
}

export function getDiffPage(
  db: Db,
  submissionId: string,
  page = 1,
  pageSize = 50,
  diffType?: string | null,
): { rows: ReturnDiffRow[]; total: number } {
  const conditions = ["submission_id = ?"];
  const params: Array<string | number> = [submissionId];
  if (diffType) {
    conditions.push("diff_type = ?");
    params.push(diffType);
  }
  const where = conditions.join(" AND ");
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM return_diffs WHERE ${where}`)
    .get(...params) as { total: number };

  const offset = Math.max(0, (page - 1) * pageSize);
  const rows = db
    .prepare(
      `SELECT * FROM return_diffs WHERE ${where} ORDER BY rowid LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as unknown as ReturnDiffRow[];

  return { rows, total: Number(totalRow.total) };
}

export function getDiffTypeStats(
  db: Db,
  submissionId: string,
): Array<{ type: string; count: number }> {
  return db
    .prepare(
      "SELECT diff_type AS type, COUNT(*) AS count FROM return_diffs WHERE submission_id = ? GROUP BY diff_type",
    )
    .all(submissionId) as unknown as Array<{ type: string; count: number }>;
}

export function getActiveBatchForMonth(db: Db, month: string): BatchRow | null {
  return (
    (db
      .prepare("SELECT * FROM batches WHERE month = ? AND status = 'PUBLISHED'")
      .get(month) as BatchRow | undefined) ?? null
  );
}

export function getAggregationForSubmission(
  db: Db,
  submissionId: string,
): { record_count: number; income_cents: number; aggregated_at: string; status: string } | null {
  return (
    (db
      .prepare(
        "SELECT record_count, income_cents, aggregated_at, status FROM aggregations WHERE submission_id = ?",
      )
      .get(submissionId) as
      | { record_count: number; income_cents: number; aggregated_at: string; status: string }
      | undefined) ?? null
  );
}

export function listAggregations(db: Db, month: string): AggregationRow[] {
  return db
    .prepare(
      `SELECT a.id, a.month, a.org_id, o.name AS org_name, o.short_name,
              a.batch_id, b.version AS batch_version, a.submission_id,
              a.status, a.record_count, a.income_cents, a.aggregated_at
         FROM aggregations a
         JOIN organizations o ON o.id = a.org_id
         JOIN batches b ON b.id = a.batch_id
        WHERE a.month = ?
        ORDER BY o.sort_order`,
    )
    .all(month) as unknown as AggregationRow[];
}

export function aggregationTotals(rows: AggregationRow[]): {
  orgCount: number;
  recordCount: number;
  incomeCents: number;
} {
  const active = rows.filter((row) => row.status === "ACTIVE");
  return {
    orgCount: active.length,
    recordCount: active.reduce((total, row) => total + Number(row.record_count), 0),
    incomeCents: active.reduce((total, row) => total + Number(row.income_cents), 0),
  };
}

export function buildAggregationSheets(db: Db, month: string): SheetData[] {
  const rows = listAggregations(db, month).filter((row) => row.status === "ACTIVE");

  const summaryHeaders = ["组织", "记录数", "收入合计", "批次版本", "归集时间"];
  const summaryRows: CellValue[][] = rows.map((row) => [
    row.org_name,
    Number(row.record_count),
    Number(row.income_cents) / 100,
    `V${row.batch_version}`,
    row.aggregated_at,
  ]);

  const detailHeaders = ["组织", ...LABOR_INCOME_COLUMNS];
  const detailRows: CellValue[][] = [];
  for (const row of rows) {
    const returnRows = db
      .prepare(
        `SELECT row_number, name, id_type, id_number_enc, income_cents
           FROM return_rows WHERE submission_id = ? ORDER BY row_number`,
      )
      .all(row.submission_id) as Array<{
      row_number: number;
      name: string;
      id_type: string;
      id_number_enc: string;
      income_cents: number | null;
    }>;
    for (const item of returnRows) {
      detailRows.push([
        row.org_name,
        ...buildLaborIncomeRowValues(
          item.name,
          item.id_type,
          decryptText(item.id_number_enc),
          item.income_cents,
        ),
      ]);
    }
  }

  const pendingHeaders = ["组织", "状态", "说明"];
  const pendingRows: CellValue[][] = [];
  const activeBatch = getActiveBatchForMonth(db, month);
  if (activeBatch) {
    const tasks = db
      .prepare(
        `SELECT t.org_id, o.name AS org_name, t.status, s.diff_count, s.error_message
           FROM return_tasks t
           JOIN organizations o ON o.id = t.org_id
           LEFT JOIN return_submissions s ON s.id = t.current_submission_id
          WHERE t.batch_id = ? ORDER BY o.sort_order`,
      )
      .all(activeBatch.id) as Array<{
      org_id: string;
      org_name: string;
      status: string;
      diff_count: number | null;
      error_message: string | null;
    }>;
    const activeOrgIds = new Set(rows.map((row) => row.org_id));
    for (const task of tasks) {
      if (activeOrgIds.has(task.org_id)) continue;
      pendingRows.push([
        task.org_name,
        TASK_LABELS[task.status] ?? task.status,
        task.error_message ?? (task.diff_count ? `差异 ${task.diff_count} 条` : "未回传或未通过"),
      ]);
    }
  }

  return [
    { name: "归集汇总", headers: summaryHeaders, rows: summaryRows },
    { name: "归集明细", headers: detailHeaders, rows: detailRows, textColumns: [3] },
    { name: "未归集说明", headers: pendingHeaders, rows: pendingRows },
  ];
}

export type AggregationExportResult = {
  path: string;
  fileName: string;
  sha256: string;
};

export async function exportAggregationFile(
  db: Db,
  month: string,
): Promise<AggregationExportResult> {
  const dir = path.join(storageRoot(), "exports");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `归集汇总_${month}.xlsx`);
  await writeWorkbook(filePath, buildAggregationSheets(db, month));
  const sha256 = await sha256File(filePath);
  return {
    path: filePath,
    fileName: `归集汇总_${month}.xlsx`,
    sha256,
  };
}
