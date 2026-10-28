import type { DatasetType, NormalizedSourceRow } from "../types";
import { nextMonth } from "./month";

export const LABOR_INCOME_FIXED_PROJECT = "保险营销员佣金收入";

export const LABOR_INCOME_COLUMNS = [
  "*姓名",
  "*证照类型",
  "*证照号码",
  "*所得项目",
  "收入",
  "扣除项目(免税收入)",
  "累计减除费用",
  "企业(职业)年金",
  "商业健康保险",
  "其他",
  "允许扣除的税费",
  "减除费用",
  "备注",
] as const;

export function hasCompleteIdentity(row: NormalizedSourceRow): boolean {
  return Boolean(row.name && row.idType && row.idNumber);
}

export function buildLaborIncomeRowValues(
  name: string,
  idType: string,
  idNumber: string,
  taxableIncomeCents: number | null,
): Array<string | number | null> {
  return [
    name,
    idType,
    idNumber,
    LABOR_INCOME_FIXED_PROJECT,
    taxableIncomeCents === null ? null : taxableIncomeCents / 100,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
}

export function buildLaborIncomeRow(row: NormalizedSourceRow): Array<string | number | null> {
  return buildLaborIncomeRowValues(
    row.name,
    row.idType,
    row.idNumber,
    row.taxableIncomeCents,
  );
}

export function datasetMembership(row: NormalizedSourceRow, month: string): DatasetType[] {
  if (row.validStatus !== "VALID" || !row.orgId) return [];

  const membership: DatasetType[] = ["SUMMARY"];
  if (!hasCompleteIdentity(row)) return membership;

  membership.push("LABOR_INCOME");

  if (row.entryMonth) {
    if (row.entryMonth === nextMonth(month)) membership.push("NEW_PERSON");
    if (row.entryMonth === month) membership.push("TRANSFER_NON");
  }

  return membership;
}
