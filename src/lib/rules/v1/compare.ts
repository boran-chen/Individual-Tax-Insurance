import type {
  ActualCompareRow,
  CompareDiff,
  CompareResult,
  ExpectedCompareRow,
} from "../types";
import { maskCertNo, normalizeCertNo, normalizeName } from "./text";

type ExpectedItem = { row: ExpectedCompareRow; used: boolean };
type ActualItem = { row: ActualCompareRow; used: boolean };

export function buildCompareKey(name: string, certNo: string): string {
  return `${normalizeCertNo(certNo)}|${normalizeName(name)}`;
}

export function buildKeyMask(name: string, certNo: string): string {
  return `${maskCertNo(certNo) || "无证件号"} / ${name || "无姓名"}`;
}

function amountMatches(a: number, b: number | null, toleranceCents: number): boolean {
  if (b === null) return false;
  return Math.abs(a - b) <= toleranceCents;
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function compareReturn(
  expectedRows: ExpectedCompareRow[],
  actualRows: ActualCompareRow[],
  toleranceCents = 0,
): CompareResult {
  const diffs: CompareDiff[] = [];
  let matchedRows = 0;

  const expectedItems: ExpectedItem[] = expectedRows.map((row) => ({ row, used: false }));
  const actualItems: ActualItem[] = actualRows.map((row) => ({ row, used: false }));

  const expectedByKey = groupBy(expectedItems, (item) => item.row.key);
  const actualByKey = groupBy(actualItems, (item) => item.row.key);

  const allKeys = new Set([...expectedByKey.keys(), ...actualByKey.keys()]);

  for (const key of allKeys) {
    if (!expectedByKey.has(key) || !actualByKey.has(key)) continue;

    const expectedGroup = [...(expectedByKey.get(key) ?? [])].sort(
      (a, b) => a.row.incomeCents - b.row.incomeCents || a.row.rowNumber - b.row.rowNumber,
    );
    const actualGroup = [...(actualByKey.get(key) ?? [])].sort((a, b) => {
      const aIncome = a.row.incomeCents ?? Number.NEGATIVE_INFINITY;
      const bIncome = b.row.incomeCents ?? Number.NEGATIVE_INFINITY;
      return aIncome - bIncome || a.row.rowNumber - b.row.rowNumber;
    });

    const pairCount = Math.min(expectedGroup.length, actualGroup.length);

    for (let index = 0; index < pairCount; index += 1) {
      const expected = expectedGroup[index];
      const actual = actualGroup[index];
      expected.used = true;
      actual.used = true;
      matchedRows += 1;

      if (!amountMatches(expected.row.incomeCents, actual.row.incomeCents, toleranceCents)) {
        diffs.push({
          type: "AMOUNT_MISMATCH",
          keyMask: expected.row.keyMask,
          field: "收入",
          sourceRowNumber: expected.row.rowNumber,
          returnRowNumber: actual.row.rowNumber,
          originalValue: (expected.row.incomeCents / 100).toFixed(2),
          returnedValue:
            actual.row.incomeCents === null ? "空/无效" : (actual.row.incomeCents / 100).toFixed(2),
          message: "应税所得/收入与原数据不一致",
        });
      }

      const expectedType = normalizeName(expected.row.idType);
      const actualType = normalizeName(actual.row.idType);
      if (expectedType && actualType && expectedType !== actualType) {
        diffs.push({
          type: "FIELD_MISMATCH",
          keyMask: expected.row.keyMask,
          field: "证照类型",
          sourceRowNumber: expected.row.rowNumber,
          returnRowNumber: actual.row.rowNumber,
          originalValue: expected.row.idType,
          returnedValue: actual.row.idType,
          message: "证照类型与原数据不一致",
        });
      }
    }

    if (actualGroup.length > pairCount) {
      for (const item of actualGroup.slice(pairCount)) {
        if (item.used) continue;
        item.used = true;
        diffs.push({
          type: "DUPLICATE_KEY",
          keyMask: item.row.keyMask,
          field: "记录",
          returnRowNumber: item.row.rowNumber,
          returnedValue:
            item.row.incomeCents === null ? "空/无效" : (item.row.incomeCents / 100).toFixed(2),
          message: "回传文件中存在重复记录",
        });
      }
    }
  }

  // 第二阶段：证件号相同但姓名不同，给出更明确的字段差异
  const unusedExpected = expectedItems.filter((item) => !item.used);
  const unusedActual = actualItems.filter((item) => !item.used);
  const expectedByCert = groupBy(unusedExpected, (item) => normalizeCertNo(item.row.idNumber));

  for (const actual of unusedActual) {
    const certNo = normalizeCertNo(actual.row.idNumber);
    const candidates = (expectedByCert.get(certNo) ?? []).filter((item) => !item.used);
    if (!candidates.length) continue;

    const expected = candidates[0];
    expected.used = true;
    actual.used = true;
    matchedRows += 1;

    diffs.push({
      type: "FIELD_MISMATCH",
      keyMask: expected.row.keyMask,
      field: "姓名",
      sourceRowNumber: expected.row.rowNumber,
      returnRowNumber: actual.row.rowNumber,
      originalValue: expected.row.name,
      returnedValue: actual.row.name,
      message: "证件号码相同但姓名不一致",
    });

    if (!amountMatches(expected.row.incomeCents, actual.row.incomeCents, toleranceCents)) {
      diffs.push({
        type: "AMOUNT_MISMATCH",
        keyMask: expected.row.keyMask,
        field: "收入",
        sourceRowNumber: expected.row.rowNumber,
        returnRowNumber: actual.row.rowNumber,
        originalValue: (expected.row.incomeCents / 100).toFixed(2),
        returnedValue:
          actual.row.incomeCents === null ? "空/无效" : (actual.row.incomeCents / 100).toFixed(2),
        message: "应税所得/收入与原数据不一致",
      });
    }
  }

  for (const item of expectedItems) {
    if (item.used) continue;
    item.used = true;
    diffs.push({
      type: "MISSING_IN_RETURN",
      keyMask: item.row.keyMask,
      field: "记录",
      sourceRowNumber: item.row.rowNumber,
      originalValue: (item.row.incomeCents / 100).toFixed(2),
      message: "回传文件中缺少该记录",
    });
  }

  for (const item of actualItems) {
    if (item.used) continue;
    item.used = true;
    diffs.push({
      type: "EXTRA_IN_RETURN",
      keyMask: item.row.keyMask,
      field: "记录",
      returnRowNumber: item.row.rowNumber,
      returnedValue:
        item.row.incomeCents === null ? "空/无效" : (item.row.incomeCents / 100).toFixed(2),
      message: "回传文件中存在原数据没有的记录",
    });
  }

  return {
    passed: diffs.length === 0,
    totalSource: expectedRows.length,
    totalReturn: actualRows.length,
    matchedRows,
    diffs,
  };
}
