import { resolveOrganization, type OrgMappingTable } from "../rules/v1/org-map";
import { parseAmount } from "../rules/v1/money";
import { parseEntryMonth } from "../rules/v1/entry-month";
import { maskCertNo, normalizeCertNo, normalizeText } from "../rules/v1/text";
import type {
  AnomalyCode,
  NormalizedSourceRow,
  ValidStatus,
} from "../rules/types";
import type { SourceCellRecord } from "../excel/reader";

export type NormalizeContext = {
  month: string;
  orgMappings: OrgMappingTable;
  idFactory: () => string;
  fingerprint: (value: string) => string;
};

function addCode(codes: AnomalyCode[], code: AnomalyCode): void {
  if (!codes.includes(code)) codes.push(code);
}

export function normalizeSourceRecord(
  record: SourceCellRecord,
  context: NormalizeContext,
): NormalizedSourceRow {
  const income = parseAmount(record.taxableIncomeRaw);
  const entryMonth = parseEntryMonth(record.entryMonthRaw);
  const organization = resolveOrganization(record.province, context.orgMappings);
  const idNumber = normalizeCertNo(record.idNumber);
  const name = normalizeText(record.name);
  const anomalyCodes: AnomalyCode[] = [];

  if (income.status === "EMPTY") addCode(anomalyCodes, "INCOME_EMPTY");
  if (income.status === "NON_NUMERIC") addCode(anomalyCodes, "INCOME_NON_NUMERIC");
  if (income.status === "NEGATIVE") addCode(anomalyCodes, "INCOME_NEGATIVE");
  if (!entryMonth) addCode(anomalyCodes, "ENTRY_MONTH_INVALID");
  if (organization.status === "EMPTY") addCode(anomalyCodes, "ORG_EMPTY");
  if (organization.status === "UNMAPPED") addCode(anomalyCodes, "ORG_UNMAPPED");
  if (!name || !record.idType.trim() || !idNumber) addCode(anomalyCodes, "IDENTITY_MISSING");
  if (record.formulaMissing.length > 0) addCode(anomalyCodes, "FORMULA_NO_RESULT");

  let validStatus: ValidStatus;
  if (income.status === "NEGATIVE") {
    validStatus = "NEGATIVE";
  } else if (income.status === "VALID") {
    validStatus = organization.status === "ASSIGNED" ? "VALID" : "ORG_UNMAPPED";
  } else {
    validStatus = "INVALID_INCOME";
  }

  if (income.status === "VALID" && organization.status !== "ASSIGNED") {
    if (organization.status === "EMPTY") addCode(anomalyCodes, "ORG_EMPTY");
    if (organization.status === "UNMAPPED") addCode(anomalyCodes, "ORG_UNMAPPED");
  }

  let dedupeFingerprint: string | null = null;
  if (idNumber) {
    const key = record.businessKey
      ? `${record.idType}|${idNumber}|${context.month}|${record.businessKey}`
      : `${record.idType}|${idNumber}|${context.month}`;
    dedupeFingerprint = context.fingerprint(key);
  }

  return {
    id: context.idFactory(),
    sheetName: "",
    rowNumber: record.rowNumber,
    raw: record.raw,
    name,
    idType: record.idType.trim(),
    idNumber,
    idMask: maskCertNo(idNumber),
    idFingerprint: idNumber ? context.fingerprint(idNumber) : "",
    taxableIncomeCents: income.cents,
    taxableIncomeText: income.text,
    entryMonth,
    entryMonthRaw: String(record.entryMonthRaw ?? ""),
    orgRaw: record.province,
    orgId: organization.status === "ASSIGNED" ? organization.orgId : null,
    validStatus,
    anomalyCodes,
    dedupeFingerprint,
    businessKey: record.businessKey.trim(),
  };
}

export function markDuplicateSuspects(rows: NormalizedSourceRow[]): NormalizedSourceRow[] {
  const groups = new Map<string, NormalizedSourceRow[]>();
  for (const row of rows) {
    if (!row.dedupeFingerprint) continue;
    const list = groups.get(row.dedupeFingerprint);
    if (list) list.push(row);
    else groups.set(row.dedupeFingerprint, [row]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      if (!row.anomalyCodes.includes("DUPLICATE_SUSPECT")) {
        row.anomalyCodes.push("DUPLICATE_SUSPECT");
      }
    }
  }

  return rows;
}
