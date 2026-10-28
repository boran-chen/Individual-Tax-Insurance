import { jsonParse, type Db } from "../db";
import { notFound } from "../utils/http-error";
import { decryptText, fingerprint } from "../utils/crypto";
import { maskCertNo, normalizeCertNo } from "../rules/v1/text";
import {
  buildLaborIncomeRowValues,
  LABOR_INCOME_COLUMNS,
} from "../rules/v1/datasets";
import { DATASET_TYPES, type DatasetType, type RawRow } from "../rules/types";
import type { AuthUser } from "../auth/session";
import type { BatchRow, BatchOrgSummary } from "./batch-service";
import { batchSourceHeaders, getBatchOrgs } from "./batch-service";
import type { CellValue } from "../excel/writer";

type DatasetDbRow = {
  id: string;
  raw_json_enc: string;
  name: string;
  id_type: string;
  id_number_enc: string;
  taxable_income_cents: number;
  entry_month: string | null;
  row_number: number;
  org_id: string;
};

export type DatasetPage = {
  type: DatasetType;
  headers: string[];
  rows: CellValue[][];
  total: number;
  page: number;
  pageSize: number;
  orgs: BatchOrgSummary[];
  selectedOrgId: string | null;
  includesOrgColumn: boolean;
};

function isDatasetType(value: string): value is DatasetType {
  return (DATASET_TYPES as readonly string[]).includes(value);
}

function idHeaderIndexes(headers: string[]): number[] {
  const indexes: number[] = [];
  headers.forEach((header, index) => {
    if (/证照号码|证件号码|身份证|证照号/.test(header)) indexes.push(index);
  });
  return indexes;
}

function decodeRaw(value: string): RawRow {
  const decrypted = decryptText(value);
  if (!decrypted) return {};
  return jsonParse<RawRow>(decrypted, {});
}

export function getDatasetPage(
  db: Db,
  user: AuthUser,
  batch: BatchRow,
  typeValue: string,
  options: {
    orgId?: string | null;
    page?: number;
    pageSize?: number;
    q?: string | null;
    sort?: string | null;
    direction?: string | null;
  },
): DatasetPage {
  if (!isDatasetType(typeValue)) throw notFound("数据集不存在");
  const type = typeValue;

  const allOrgs = getBatchOrgs(db, batch.id, user);
  if (!allOrgs.length) throw notFound("该批次没有可查看的组织数据");

  let selectedOrgId: string | null = null;
  let orgFilterIds: string[] = [];

  if (options.orgId) {
    const selected = allOrgs.find((org) => org.org_id === options.orgId);
    if (!selected) throw notFound("组织不存在或无权访问");
    selectedOrgId = selected.org_id;
    orgFilterIds = [selected.org_id];
  } else if (user.role === "PROVINCE") {
    orgFilterIds = allOrgs.map((org) => org.org_id);
  } else {
    orgFilterIds = allOrgs.map((org) => org.org_id);
  }

  const includesOrgColumn = !selectedOrgId && orgFilterIds.length > 1;
  const orgNameById = new Map(allOrgs.map((org) => [org.org_id, org.org_name]));

  const conditions = ["dr.batch_id = ?", "dr.dataset_type = ?"];
  const params: Array<string | number> = [batch.id, type];

  if (orgFilterIds.length) {
    conditions.push(`dr.org_id IN (${orgFilterIds.map(() => "?").join(", ")})`);
    params.push(...orgFilterIds);
  }

  const q = options.q?.trim();
  if (q) {
    conditions.push("(sr.name LIKE ? ESCAPE '\\' OR sr.id_fingerprint = ?)");
    const escaped = q.replace(/[\\%_]/g, "\\$&");
    params.push(`%${escaped}%`, q.length >= 6 ? fingerprint(normalizeCertNo(q)) : "__no_match__");
  }

  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(options.pageSize ?? 20)));
  const offset = (page - 1) * pageSize;

  const where = conditions.join(" AND ");
  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS total FROM dataset_rows dr JOIN source_rows sr ON sr.id = dr.source_row_id WHERE ${where}`,
    )
    .get(...params) as { total: number };

  const sortKey = options.sort ?? "row";
  const direction = options.direction === "desc" ? "DESC" : "ASC";
  const sortSql =
    sortKey === "name"
      ? `sr.name ${direction}`
      : sortKey === "income"
        ? `sr.taxable_income_cents ${direction}`
        : `sr.row_number ${direction}`;

  const dbRows = db
    .prepare(
      `SELECT sr.id, sr.raw_json_enc, sr.name, sr.id_type, sr.id_number_enc,
              sr.taxable_income_cents, sr.entry_month, sr.row_number, dr.org_id
         FROM dataset_rows dr
         JOIN source_rows sr ON sr.id = dr.source_row_id
        WHERE ${where}
        ORDER BY ${sortSql}
        LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as unknown as DatasetDbRow[];

  const sourceHeaders = batchSourceHeaders(batch);
  const baseHeaders = type === "LABOR_INCOME" ? [...LABOR_INCOME_COLUMNS] : sourceHeaders;
  const headers = includesOrgColumn ? ["组织", ...baseHeaders] : baseHeaders;

  const rows: CellValue[][] = dbRows.map((row) => {
    if (type === "LABOR_INCOME") {
      const values = buildLaborIncomeRowValues(
        row.name,
        row.id_type,
        maskCertNo(decryptText(row.id_number_enc)),
        row.taxable_income_cents,
      ) as CellValue[];
      return includesOrgColumn ? [orgNameById.get(row.org_id) ?? "", ...values] : values;
    }

    const raw = decodeRaw(row.raw_json_enc);
    const values: CellValue[] = baseHeaders.map((header) => {
      const value = raw[header];
      if (value === null || value === undefined) return null;
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return value;
      return String(value);
    });

    for (const index of idHeaderIndexes(baseHeaders)) {
      const value = values[index];
      if (value !== null && value !== undefined) {
        values[index] = maskCertNo(String(value));
      }
    }

    return includesOrgColumn ? [orgNameById.get(row.org_id) ?? "", ...values] : values;
  });

  return {
    type,
    headers,
    rows,
    total: Number(countRow.total),
    page,
    pageSize,
    orgs: allOrgs,
    selectedOrgId,
    includesOrgColumn,
  };
}
