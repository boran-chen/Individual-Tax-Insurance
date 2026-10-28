export const DATASET_TYPES = ["NEW_PERSON", "TRANSFER_NON", "LABOR_INCOME", "SUMMARY"] as const;

export type DatasetType = (typeof DATASET_TYPES)[number];

export const DATASET_LABELS: Record<DatasetType, string> = {
  NEW_PERSON: "新增人员信息",
  TRANSFER_NON: "转非人员信息",
  LABOR_INCOME: "劳动报酬收入",
  SUMMARY: "汇总",
};

export const DATASET_SHEET_NAMES: Record<DatasetType, string> = {
  NEW_PERSON: "1新增人员信息导入",
  TRANSFER_NON: "2转非",
  LABOR_INCOME: "3劳动报酬收入",
  SUMMARY: "4汇总",
};

export type ValidStatus = "VALID" | "NEGATIVE" | "INVALID_INCOME" | "ORG_UNMAPPED";

export type AnomalyCode =
  | "INCOME_EMPTY"
  | "INCOME_NON_NUMERIC"
  | "INCOME_NEGATIVE"
  | "ENTRY_MONTH_INVALID"
  | "ORG_EMPTY"
  | "ORG_UNMAPPED"
  | "IDENTITY_MISSING"
  | "DUPLICATE_SUSPECT"
  | "FORMULA_NO_RESULT";

export type RawCellValue = string | number | boolean | null;

export type RawRow = Record<string, RawCellValue>;

export type NormalizedSourceRow = {
  id: string;
  sheetName: string;
  rowNumber: number;
  raw: RawRow;
  name: string;
  idType: string;
  idNumber: string;
  idMask: string;
  idFingerprint: string;
  taxableIncomeCents: number | null;
  taxableIncomeText: string;
  entryMonth: string | null;
  entryMonthRaw: string;
  orgRaw: string;
  orgId: string | null;
  validStatus: ValidStatus;
  anomalyCodes: AnomalyCode[];
  dedupeFingerprint: string | null;
  businessKey: string | null;
};

export type CompareDiffType =
  | "MISSING_IN_RETURN"
  | "EXTRA_IN_RETURN"
  | "AMOUNT_MISMATCH"
  | "FIELD_MISMATCH"
  | "DUPLICATE_KEY";

export type ExpectedCompareRow = {
  key: string;
  keyMask: string;
  name: string;
  idType: string;
  idNumber: string;
  incomeCents: number;
  rowNumber: number;
};

export type ActualCompareRow = {
  key: string;
  keyMask: string;
  name: string;
  idType: string;
  idNumber: string;
  incomeCents: number | null;
  rowNumber: number;
};

export type CompareDiff = {
  type: CompareDiffType;
  keyMask: string;
  field?: string;
  sourceRowNumber?: number;
  returnRowNumber?: number;
  originalValue?: string;
  returnedValue?: string;
  message: string;
};

export type CompareResult = {
  passed: boolean;
  totalSource: number;
  totalReturn: number;
  matchedRows: number;
  diffs: CompareDiff[];
};

export type BatchStats = {
  sourceRows: number;
  validRows: number;
  negativeRows: number;
  invalidIncomeRows: number;
  orgUnmappedRows: number;
  assignedRows: number;
  anomalyRows: number;
  incomeTotalCents: number;
  orgCounts: Record<string, number>;
};
