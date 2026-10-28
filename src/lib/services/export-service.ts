import fs from "node:fs";
import path from "node:path";
import { jsonParse, nowIso, type Db } from "../db";
import { canAccessOrg } from "../auth/guard";
import { conflict, notFound } from "../utils/http-error";
import { decryptText, sha256File, sha256Text } from "../utils/crypto";
import { writeAudit } from "./audit-service";
import { writeWorkbook, type CellValue, type SheetData } from "../excel/writer";
import { buildLaborIncomeRowValues, LABOR_INCOME_COLUMNS } from "../rules/v1/datasets";
import { DATASET_SHEET_NAMES } from "../rules/types";
import { storageRoot } from "./upload-service";
import type { AuthUser } from "../auth/session";
import type { BatchRow } from "./batch-service";
import { batchSourceHeaders } from "./batch-service";
import type { DatasetType, RawRow } from "../rules/types";

type SourceDbRow = {
  id: string;
  raw_json_enc: string;
  name: string;
  id_type: string;
  id_number_enc: string;
  taxable_income_cents: number;
  row_number: number;
};

type ExportOrg = { id: string; name: string; short_name: string };

export type ExportFileResult = {
  path: string;
  fileName: string;
  sha256: string;
};

function decodeRaw(value: string): RawRow {
  const decrypted = decryptText(value);
  if (!decrypted) {
    if (value) {
      throw new Error("原始数据解密失败，请检查 APP_ENCRYPTION_KEY 是否与建库时一致");
    }
    return {};
  }
  return jsonParse<RawRow>(decrypted, {});
}

function toCell(header: string, value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    if (/日期|时间/.test(header)) {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      }
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function textColumnIndexes(headers: string[]): number[] {
  const indexes: number[] = [];
  headers.forEach((header, index) => {
    if (/证照号码|证件号码|身份证|证照号/.test(header)) indexes.push(index);
  });
  return indexes;
}

function orgForExport(db: Db, orgId: string): ExportOrg {
  const org = db
    .prepare("SELECT id, name, short_name FROM organizations WHERE id = ?")
    .get(orgId) as ExportOrg | undefined;
  if (!org) throw notFound("组织不存在");
  return org;
}

function rowsForDataset(
  db: Db,
  batchId: string,
  orgId: string,
  type: DatasetType,
): SourceDbRow[] {
  return db
    .prepare(
      `SELECT sr.id, sr.raw_json_enc, sr.name, sr.id_type, sr.id_number_enc,
              sr.taxable_income_cents, sr.row_number
         FROM dataset_rows dr
         JOIN source_rows sr ON sr.id = dr.source_row_id
        WHERE dr.batch_id = ? AND dr.org_id = ? AND dr.dataset_type = ?
        ORDER BY sr.row_number`,
    )
    .all(batchId, orgId, type) as unknown as SourceDbRow[];
}

function rawRowsToCells(headers: string[], rows: SourceDbRow[]): CellValue[][] {
  return rows.map((row) => {
    const raw = decodeRaw(row.raw_json_enc);
    return headers.map((header) => toCell(header, raw[header]));
  });
}

function laborRowsToCells(rows: SourceDbRow[]): CellValue[][] {
  return rows.map((row) =>
    buildLaborIncomeRowValues(
      row.name,
      row.id_type,
      decryptText(row.id_number_enc),
      row.taxable_income_cents,
    ) as CellValue[],
  );
}

export function buildExportSheets(
  db: Db,
  batch: BatchRow,
  orgId: string,
): SheetData[] {
  const headers = batchSourceHeaders(batch);
  const textColumns = textColumnIndexes(headers);

  return [
    {
      name: DATASET_SHEET_NAMES.NEW_PERSON,
      headers,
      rows: rawRowsToCells(headers, rowsForDataset(db, batch.id, orgId, "NEW_PERSON")),
      textColumns,
    },
    {
      name: DATASET_SHEET_NAMES.TRANSFER_NON,
      headers,
      rows: rawRowsToCells(headers, rowsForDataset(db, batch.id, orgId, "TRANSFER_NON")),
      textColumns,
    },
    {
      name: DATASET_SHEET_NAMES.LABOR_INCOME,
      headers: [...LABOR_INCOME_COLUMNS],
      rows: laborRowsToCells(rowsForDataset(db, batch.id, orgId, "LABOR_INCOME")),
      textColumns: [2],
      widths: [14, 14, 24, 24, 14, 18, 16, 16, 16, 12, 18, 14, 24],
    },
    {
      name: DATASET_SHEET_NAMES.SUMMARY,
      headers,
      rows: rawRowsToCells(headers, rowsForDataset(db, batch.id, orgId, "SUMMARY")),
      textColumns,
    },
  ];
}

export function exportFileName(batch: BatchRow, orgName: string): string {
  return `${batch.month}_${orgName}_佣金个税申报数据_V${batch.version}.xlsx`;
}

export async function getOrCreateExportFile(
  db: Db,
  user: AuthUser,
  batch: BatchRow,
  orgId: string,
): Promise<ExportFileResult & { org: ExportOrg }> {
  if (batch.status !== "PUBLISHED") throw conflict("批次未发布，不能下载申报数据");
  if (!canAccessOrg(user, orgId)) throw notFound("组织不存在或无权访问");

  const org = orgForExport(db, orgId);
  const ruleVersion = batch.rule_version;
  const fileName = exportFileName(batch, org.name);

  const existing = db
    .prepare(
      "SELECT path, sha256 FROM export_files WHERE batch_id = ? AND org_id = ? AND rule_version = ?",
    )
    .get(batch.id, orgId, ruleVersion) as { path: string; sha256: string } | undefined;

  if (existing && fs.existsSync(existing.path)) {
    return { path: existing.path, fileName, sha256: existing.sha256, org };
  }

  const dir = path.join(storageRoot(), "exports", batch.id);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${orgId}.xlsx`);

  const sheets = buildExportSheets(db, batch, orgId);
  await writeWorkbook(filePath, sheets);
  const sha256 = await sha256File(filePath);

  db.prepare(
    `INSERT INTO export_files
       (id, batch_id, org_id, path, sha256, generated_by, generated_at, rule_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(batch_id, org_id, rule_version) DO UPDATE SET
       path = excluded.path,
       sha256 = excluded.sha256,
       generated_by = excluded.generated_by,
       generated_at = excluded.generated_at`,
  ).run(
    sha256Text(`${batch.id}:${orgId}:${ruleVersion}`),
    batch.id,
    orgId,
    filePath,
    sha256,
    user.id,
    nowIso(),
    ruleVersion,
  );

  return { path: filePath, fileName, sha256, org };
}

export function recordExportDownload(
  db: Db,
  user: AuthUser,
  batch: BatchRow,
  orgId: string,
  file: { fileName: string; sha256: string; size?: number },
  ip?: string | null,
): void {
  writeAudit(db, {
    userId: user.id,
    action: "DOWNLOAD_EXPORT",
    objectType: "BATCH",
    objectId: batch.id,
    orgId,
    context: {
      month: batch.month,
      version: batch.version,
      fileName: file.fileName,
      sha256: file.sha256,
      size: file.size ?? null,
    },
    ip: ip ?? null,
  });
}
