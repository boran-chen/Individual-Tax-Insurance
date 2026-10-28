import { jsonParse, newId, nowIso, transaction, type Db } from "../db";
import {
  readSourceWorkbook,
  type WorkbookPreview,
} from "../excel/reader";
import { getFieldAliases } from "./config-service";
import { markDuplicateSuspects, normalizeSourceRecord } from "./normalizer";
import { checkConservation } from "../rules/v1/conservation";
import { datasetMembership } from "../rules/v1/datasets";
import { parseMonth } from "../rules/v1/month";
import { encryptText, fingerprint } from "../utils/crypto";
import { badRequest, conflict, notFound } from "../utils/http-error";
import { writeAudit } from "./audit-service";
import { enqueueJob } from "./job-service";
import {
  consumeStagingUpload,
  getStagingUpload,
  maxRows,
} from "./upload-service";
import type { AuthUser } from "../auth/session";
import type { FieldKey } from "../config/fields";
import type { BatchStats, NormalizedSourceRow } from "../rules/types";
import { RULES_VERSION } from "../rules/v1/version";

export type BatchStatus =
  | "QUEUED"
  | "PROCESSING"
  | "DRAFT"
  | "PUBLISHED"
  | "SUPERSEDED"
  | "VOIDED"
  | "FAILED";

export type BatchRow = {
  id: string;
  month: string;
  version: number;
  status: BatchStatus;
  original_file_name: string;
  storage_path: string;
  sha256: string;
  uploaded_by: string;
  rule_version: string;
  field_mapping_json: string;
  source_sheet: string | null;
  header_row: number | null;
  source_headers_json: string;
  stats_json: string;
  error_message: string | null;
  note: string | null;
  created_at: string;
  processed_at: string | null;
  published_at: string | null;
  voided_at: string | null;
  replaced_by: string | null;
};

export type BatchWithUploader = BatchRow & { uploader_name: string };

export type BatchOrgSummary = {
  org_id: string;
  org_name: string;
  short_name: string;
  record_count: number;
  income_cents: number;
  task_status: string | null;
  submission_status: string | null;
  diff_count: number | null;
};

const DEFAULT_STATS: BatchStats = {
  sourceRows: 0,
  validRows: 0,
  negativeRows: 0,
  invalidIncomeRows: 0,
  orgUnmappedRows: 0,
  assignedRows: 0,
  anomalyRows: 0,
  incomeTotalCents: 0,
  orgCounts: {},
};

export function parseStats(batch: BatchRow): BatchStats & { conservationOk?: boolean } {
  return jsonParse(batch.stats_json, DEFAULT_STATS);
}

export function createBatchFromStaging(
  db: Db,
  user: AuthUser,
  input: {
    uploadId: string;
    month: string;
    sheetName?: string | null;
    note?: string | null;
  },
): { batchId: string; jobId: string } {
  const month = parseMonth(input.month);
  if (!month) throw badRequest("请确认有效的佣金所属月份（YYYY-MM）");

  const staging = getStagingUpload(db, input.uploadId, user.id);
  const preview = jsonParse<WorkbookPreview>(staging.preview_json, {
    sheets: [],
    suggestedSheet: null,
  });

  const sheet =
    preview.sheets.find((item) => item.name === input.sheetName) ??
    preview.sheets.find((item) => item.name === preview.suggestedSheet) ??
    preview.sheets[0];

  if (!sheet || sheet.headerRow === null) {
    throw badRequest("未识别到有效表头，请检查文件或字段别名配置");
  }
  if (sheet.duplicatedHeaders.length) {
    throw badRequest(`存在重复表头：${sheet.duplicatedHeaders.join("、")}`);
  }
  if (sheet.conflictingFields.length) {
    throw badRequest("多个表头同时匹配同一字段，请调整字段别名配置");
  }
  if (sheet.missingRequired.length) {
    throw badRequest(`缺少必需字段：${sheet.missingRequired.join("、")}`);
  }

  const versionRow = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM batches WHERE month = ?")
    .get(month) as { version: number };
  const version = Number(versionRow.version) + 1;
  const batchId = newId();

  const { targetPath } = consumeStagingUpload(db, input.uploadId, user.id, batchId);
  const now = nowIso();

  db.prepare(
    `INSERT INTO batches
       (id, month, version, status, original_file_name, storage_path, sha256, uploaded_by,
        rule_version, field_mapping_json, source_sheet, header_row, source_headers_json,
        stats_json, error_message, note, created_at)
     VALUES (?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    batchId,
    month,
    version,
    staging.file_name,
    targetPath,
    staging.sha256,
    user.id,
    RULES_VERSION,
    JSON.stringify({ mapping: sheet.mapping, headersByField: sheet.headersByField }),
    sheet.name,
    sheet.headerRow,
    JSON.stringify(sheet.headers),
    JSON.stringify(DEFAULT_STATS),
    input.note?.trim() || null,
    now,
  );

  const jobId = enqueueJob(db, "PROCESS_BATCH", batchId);

  writeAudit(db, {
    userId: user.id,
    action: "UPLOAD_BATCH",
    objectType: "BATCH",
    objectId: batchId,
    context: {
      month,
      version,
      fileName: staging.file_name,
      sheets: preview.sheets.map((item) => item.name),
      selectedSheet: sheet.name,
    },
  });

  return { batchId, jobId };
}

export async function processBatch(
  db: Db,
  batchId: string,
  onProgress?: (progress: number) => void,
): Promise<BatchStats> {
  const batch = getBatchById(db, batchId);
  if (!batch) throw notFound("批次不存在");
  if (["PUBLISHED", "SUPERSEDED", "VOIDED"].includes(batch.status)) {
    throw conflict("已发布或已作废的批次不能重新处理");
  }

  db.prepare("UPDATE batches SET status = 'PROCESSING', error_message = NULL WHERE id = ?").run(
    batchId,
  );

  try {
    const frozenMapping = jsonParse<{
      mapping: Partial<Record<FieldKey, number>>;
      headersByField: Partial<Record<FieldKey, string>>;
    }>(batch.field_mapping_json, { mapping: {}, headersByField: {} });

    const headers = jsonParse<string[]>(batch.source_headers_json, []);
    const aliases = getFieldAliases(db);

    const source = await readSourceWorkbook(batch.storage_path, {
      sheetName: batch.source_sheet ?? undefined,
      headerRow: batch.header_row,
      headers,
      customAliases: aliases,
      mapping: frozenMapping.mapping,
    });

    if (source.records.length > maxRows()) {
      throw badRequest(`数据行数超过限制（${maxRows()} 行）`);
    }

    const mappingRows = db
      .prepare("SELECT source_value, org_id FROM province_mappings WHERE active = 1")
      .all() as Array<{ source_value: string; org_id: string }>;
    const orgMappings = new Map(mappingRows.map((item) => [item.source_value, item.org_id]));

    const normalized = source.records.map((record) => {
      const row = normalizeSourceRecord(record, {
        month: batch.month,
        orgMappings,
        idFactory: newId,
        fingerprint,
      });
      row.sheetName = source.sheetName;
      return row;
    });

    markDuplicateSuspects(normalized);

    const conservation = checkConservation(normalized);
    if (!conservation.ok) {
      throw badRequest(`守恒校验未通过：${conservation.errors.join("；")}`);
    }

    db.prepare("DELETE FROM dataset_rows WHERE batch_id = ?").run(batchId);
    db.prepare("DELETE FROM source_rows WHERE batch_id = ?").run(batchId);

    const insertSource = db.prepare(
      `INSERT INTO source_rows
         (id, batch_id, sheet_name, row_number, raw_json_enc, name, id_type, id_number_enc,
          id_fingerprint, id_mask, taxable_income_cents, taxable_income_text, entry_month,
          entry_month_raw, org_raw, org_id, valid_status, anomaly_codes_json,
          dedupe_fingerprint, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertDataset = db.prepare(
      `INSERT INTO dataset_rows
         (id, batch_id, org_id, dataset_type, source_row_id, output_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    const createdAt = nowIso();
    const chunkSize = 2000;

    for (let start = 0; start < normalized.length; start += chunkSize) {
      const chunk = normalized.slice(start, start + chunkSize);
      transaction(db, () => {
        for (const row of chunk) {
          insertSource.run(
            row.id,
            batchId,
            row.sheetName,
            row.rowNumber,
            encryptText(JSON.stringify(row.raw)),
            row.name,
            row.idType,
            row.idNumber ? encryptText(row.idNumber) : "",
            row.idFingerprint,
            row.idMask,
            row.taxableIncomeCents,
            row.taxableIncomeText,
            row.entryMonth,
            row.entryMonthRaw,
            row.orgRaw,
            row.orgId,
            row.validStatus,
            JSON.stringify(row.anomalyCodes),
            row.dedupeFingerprint,
            createdAt,
          );

          for (const datasetType of datasetMembership(row, batch.month)) {
            if (!row.orgId) continue;
            insertDataset.run(
              `${row.id}:${datasetType}`,
              batchId,
              row.orgId,
              datasetType,
              row.id,
              "{}",
            );
          }
        }
      });

      const progress = 5 + Math.floor(((start + chunk.length) / Math.max(1, normalized.length)) * 85);
      onProgress?.(progress);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    db.prepare(
      `UPDATE batches
          SET status = 'DRAFT', stats_json = ?, processed_at = ?, source_sheet = ?,
              header_row = ?, source_headers_json = ?, error_message = NULL
        WHERE id = ?`,
    ).run(
      JSON.stringify({ ...conservation.stats, conservationOk: true }),
      nowIso(),
      source.sheetName,
      source.headerRow,
      JSON.stringify(source.headers),
      batchId,
    );

    writeAudit(db, {
      userId: batch.uploaded_by,
      action: "PROCESS_BATCH",
      objectType: "BATCH",
      objectId: batchId,
      context: { month: batch.month, version: batch.version, stats: conservation.stats },
    });

    return conservation.stats;
  } catch (error) {
    db.prepare("DELETE FROM dataset_rows WHERE batch_id = ?").run(batchId);
    db.prepare("DELETE FROM source_rows WHERE batch_id = ?").run(batchId);
    db.prepare("UPDATE batches SET status = 'FAILED', error_message = ? WHERE id = ?").run(
      error instanceof Error ? error.message : String(error),
      batchId,
    );
    throw error;
  }
}

export function getBatchById(db: Db, batchId: string): BatchRow | null {
  return (db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId) as BatchRow | undefined) ?? null;
}

export function getBatchForUser(db: Db, user: AuthUser, batchId: string): BatchRow {
  const batch = getBatchById(db, batchId);
  if (!batch) throw notFound("批次不存在");

  if (user.role === "ADMIN") return batch;

  if (batch.status !== "PUBLISHED") throw notFound("批次不存在");
  if (!user.orgIds.length) throw notFound("批次不存在");

  const placeholders = user.orgIds.map(() => "?").join(", ");
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM source_rows WHERE batch_id = ? AND org_id IN (${placeholders}) LIMIT 1`,
    )
    .get(batchId, ...user.orgIds) as { ok: number } | undefined;
  if (!row) throw notFound("批次不存在或无权访问");
  return batch;
}

export function listBatches(
  db: Db,
  user: AuthUser,
  filters: { month?: string | null; status?: string | null } = {},
): BatchWithUploader[] {
  const conditions: string[] = ["1 = 1"];
  const params: Array<string | number> = [];

  if (filters.month) {
    conditions.push("b.month = ?");
    params.push(filters.month);
  }
  if (filters.status) {
    conditions.push("b.status = ?");
    params.push(filters.status);
  }

  if (user.role === "PROVINCE") {
    conditions.push("b.status = 'PUBLISHED'");
    if (!user.orgIds.length) {
      conditions.push("1 = 0");
    } else {
      const placeholders = user.orgIds.map(() => "?").join(", ");
      conditions.push(
        `EXISTS (SELECT 1 FROM source_rows sr WHERE sr.batch_id = b.id AND sr.org_id IN (${placeholders}))`,
      );
      params.push(...user.orgIds);
    }
  }

  const sql = `
    SELECT b.*, u.name AS uploader_name
      FROM batches b
      JOIN users u ON u.id = b.uploaded_by
     WHERE ${conditions.join(" AND ")}
     ORDER BY b.month DESC, b.version DESC, b.created_at DESC
     LIMIT 200
  `;
  return db.prepare(sql).all(...params) as unknown as BatchWithUploader[];
}

export function getBatchOrgs(
  db: Db,
  batchId: string,
  user: AuthUser,
): BatchOrgSummary[] {
  const params: string[] = [batchId];
  let orgFilter = "";
  if (user.role === "PROVINCE") {
    if (!user.orgIds.length) return [];
    orgFilter = ` AND sr.org_id IN (${user.orgIds.map(() => "?").join(", ")})`;
    params.push(...user.orgIds);
  }

  const rows = db
    .prepare(
      `SELECT sr.org_id, o.name AS org_name, o.short_name,
              COUNT(*) AS record_count,
              COALESCE(SUM(sr.taxable_income_cents), 0) AS income_cents,
              t.status AS task_status,
              s.status AS submission_status,
              s.diff_count AS diff_count
         FROM source_rows sr
         JOIN organizations o ON o.id = sr.org_id
         LEFT JOIN return_tasks t ON t.batch_id = sr.batch_id AND t.org_id = sr.org_id
         LEFT JOIN return_submissions s ON s.id = t.current_submission_id
        WHERE sr.batch_id = ? AND sr.valid_status = 'VALID'${orgFilter}
        GROUP BY sr.org_id, o.name, o.short_name, t.status, s.status, s.diff_count
        ORDER BY o.sort_order`,
    )
    .all(...params) as unknown as Array<{
    org_id: string;
    org_name: string;
    short_name: string;
    record_count: number;
    income_cents: number;
    task_status: string | null;
    submission_status: string | null;
    diff_count: number | null;
  }>;

  return rows.map((row) => ({
    org_id: row.org_id,
    org_name: row.org_name,
    short_name: row.short_name,
    record_count: Number(row.record_count),
    income_cents: Number(row.income_cents),
    task_status: row.task_status,
    submission_status: row.submission_status,
    diff_count: row.diff_count === null ? null : Number(row.diff_count),
  }));
}

export function publishBatch(db: Db, user: AuthUser, batchId: string): void {
  const batch = getBatchById(db, batchId);
  if (!batch) throw notFound("批次不存在");
  if (batch.status !== "DRAFT") throw conflict("只有草稿批次可以发布");

  const stats = parseStats(batch);
  if (stats.conservationOk === false) throw conflict("守恒校验未通过，不能发布");

  transaction(db, () => {
    const current = db
      .prepare("SELECT id FROM batches WHERE month = ? AND status = 'PUBLISHED' AND id <> ?")
      .get(batch.month, batchId) as { id: string } | undefined;

    if (current) {
      db.prepare(
        "UPDATE batches SET status = 'SUPERSEDED', voided_at = ?, replaced_by = ? WHERE id = ?",
      ).run(nowIso(), batchId, current.id);
    }

    db.prepare("UPDATE batches SET status = 'PUBLISHED', published_at = ? WHERE id = ?").run(
      nowIso(),
      batchId,
    );

    const orgs = db
      .prepare(
        "SELECT DISTINCT org_id FROM source_rows WHERE batch_id = ? AND valid_status = 'VALID' AND org_id IS NOT NULL",
      )
      .all(batchId) as Array<{ org_id: string }>;

    const now = nowIso();
    const insertTask = db.prepare(
      `INSERT OR IGNORE INTO return_tasks (id, batch_id, org_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'NOT_SUBMITTED', ?, ?)`,
    );
    for (const org of orgs) {
      insertTask.run(newId(), batchId, org.org_id, now, now);
    }

    db.prepare("UPDATE aggregations SET status = 'EXCLUDED' WHERE month = ?").run(batch.month);
  });

  writeAudit(db, {
    userId: user.id,
    action: "PUBLISH_BATCH",
    objectType: "BATCH",
    objectId: batchId,
    context: { month: batch.month, version: batch.version },
  });
}

export function voidBatch(db: Db, user: AuthUser, batchId: string): void {
  const batch = getBatchById(db, batchId);
  if (!batch) throw notFound("批次不存在");
  if (!["DRAFT", "PUBLISHED"].includes(batch.status)) {
    throw conflict("当前批次状态不允许作废");
  }

  transaction(db, () => {
    db.prepare("UPDATE batches SET status = 'VOIDED', voided_at = ? WHERE id = ?").run(
      nowIso(),
      batchId,
    );
    db.prepare("UPDATE aggregations SET status = 'EXCLUDED' WHERE batch_id = ?").run(batchId);
  });

  writeAudit(db, {
    userId: user.id,
    action: "VOID_BATCH",
    objectType: "BATCH",
    objectId: batchId,
    context: { month: batch.month, version: batch.version },
  });
}

export function downloadedOrgCount(db: Db, batchId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(DISTINCT org_id) AS count FROM audit_logs WHERE action = 'DOWNLOAD_EXPORT' AND object_id = ?",
    )
    .get(batchId) as { count: number };
  return Number(row.count ?? 0);
}

export function batchSourceHeaders(batch: BatchRow): string[] {
  return jsonParse<string[]>(batch.source_headers_json, []);
}

export type AnomalyRow = {
  id: string;
  row_number: number;
  name: string;
  id_mask: string;
  org_raw: string;
  taxable_income_cents: number | null;
  taxable_income_text: string;
  entry_month_raw: string;
  valid_status: string;
  anomaly_codes_json: string;
};

export function getAnomalyPage(
  db: Db,
  batchId: string,
  options: { page?: number; pageSize?: number; q?: string | null; code?: string | null },
): { rows: AnomalyRow[]; total: number } {
  const conditions = [
    "batch_id = ?",
    "(valid_status <> 'VALID' OR anomaly_codes_json <> '[]')",
  ];
  const params: Array<string | number> = [batchId];

  if (options.code) {
    conditions.push("anomaly_codes_json LIKE ?");
    params.push(`%${options.code}%`);
  }
  if (options.q?.trim()) {
    conditions.push("(name LIKE ? OR org_raw LIKE ? OR row_number = ?)");
    const q = options.q.trim();
    params.push(`%${q}%`, `%${q}%`, Number(q) || -1);
  }

  const where = conditions.join(" AND ");
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM source_rows WHERE ${where}`)
    .get(...params) as { total: number };

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
  const rows = db
    .prepare(
      `SELECT id, row_number, name, id_mask, org_raw, taxable_income_cents,
              taxable_income_text, entry_month_raw, valid_status, anomaly_codes_json
         FROM source_rows WHERE ${where}
        ORDER BY row_number LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as unknown as AnomalyRow[];

  return { rows, total: Number(totalRow.total) };
}

export function getLatestBatchJob(
  db: Db,
  batchId: string,
): {
  id: string;
  status: string;
  progress: number;
  error_message: string | null;
} | null {
  return (
    (db
      .prepare(
        `SELECT id, status, progress, error_message FROM jobs
          WHERE type = 'PROCESS_BATCH' AND object_id = ?
          ORDER BY created_at DESC LIMIT 1`,
      )
      .get(batchId) as
      | { id: string; status: string; progress: number; error_message: string | null }
      | undefined) ?? null
  );
}

export function batchFieldMapping(
  batch: BatchRow,
): Partial<Record<FieldKey, number>> {
  return jsonParse<{ mapping: Partial<Record<FieldKey, number>> }>(
    batch.field_mapping_json,
    { mapping: {} },
  ).mapping;
}

export function normalizedRowsForExport(
  db: Db,
  batchId: string,
  orgId: string,
): Array<{
  id: string;
  raw: string;
  name: string;
  idType: string;
  idNumber: string;
  taxableIncomeCents: number;
  entryMonth: string;
}> {
  return db
    .prepare(
      `SELECT id, raw_json_enc AS raw, name, id_type AS idType, id_number_enc AS idNumber,
              taxable_income_cents AS taxableIncomeCents, entry_month AS entryMonth
         FROM source_rows
        WHERE batch_id = ? AND org_id = ? AND valid_status = 'VALID'
        ORDER BY row_number`,
    )
    .all(batchId, orgId) as unknown as Array<{
    id: string;
    raw: string;
    name: string;
    idType: string;
    idNumber: string;
    taxableIncomeCents: number;
    entryMonth: string;
  }>;
}
