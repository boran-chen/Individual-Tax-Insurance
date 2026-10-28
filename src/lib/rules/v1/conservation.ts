import type { BatchStats, NormalizedSourceRow } from "../types";

export type ConservationResult = {
  ok: boolean;
  errors: string[];
  stats: BatchStats;
};

export function computeBatchStats(rows: NormalizedSourceRow[]): BatchStats {
  const stats: BatchStats = {
    sourceRows: rows.length,
    validRows: 0,
    negativeRows: 0,
    invalidIncomeRows: 0,
    orgUnmappedRows: 0,
    assignedRows: 0,
    anomalyRows: 0,
    incomeTotalCents: 0,
    orgCounts: {},
  };

  for (const row of rows) {
    if (row.validStatus === "VALID") {
      stats.validRows += 1;
      stats.assignedRows += 1;
      stats.incomeTotalCents += row.taxableIncomeCents ?? 0;
      if (row.orgId) {
        stats.orgCounts[row.orgId] = (stats.orgCounts[row.orgId] ?? 0) + 1;
      }
    } else if (row.validStatus === "ORG_UNMAPPED") {
      stats.validRows += 1;
      stats.orgUnmappedRows += 1;
      stats.incomeTotalCents += row.taxableIncomeCents ?? 0;
    } else if (row.validStatus === "NEGATIVE") {
      stats.negativeRows += 1;
    } else if (row.validStatus === "INVALID_INCOME") {
      stats.invalidIncomeRows += 1;
    }

    if (row.anomalyCodes.length > 0 || row.validStatus !== "VALID") {
      stats.anomalyRows += 1;
    }
  }

  return stats;
}

export function checkConservation(rows: NormalizedSourceRow[]): ConservationResult {
  const errors: string[] = [];
  const stats = computeBatchStats(rows);

  const validRows = rows.filter(
    (row) => row.validStatus === "VALID" || row.validStatus === "ORG_UNMAPPED",
  );
  const assigned = validRows.filter((row) => row.validStatus === "VALID");
  const unmapped = validRows.filter((row) => row.validStatus === "ORG_UNMAPPED");

  if (stats.validRows !== stats.assignedRows + stats.orgUnmappedRows) {
    errors.push(
      `有效记录数不一致：有效 ${stats.validRows} ≠ 已归属 ${stats.assignedRows} + 归属异常 ${stats.orgUnmappedRows}`,
    );
  }

  for (const row of assigned) {
    if (!row.orgId) {
      errors.push(`第 ${row.rowNumber} 行标记为已归属但组织为空`);
    }
    if (row.taxableIncomeCents === null || row.taxableIncomeCents < 0) {
      errors.push(`第 ${row.rowNumber} 行标记为有效但金额无效`);
    }
  }

  for (const row of unmapped) {
    if (row.orgId) {
      errors.push(`第 ${row.rowNumber} 行标记为归属异常但存在组织`);
    }
    if (row.taxableIncomeCents === null || row.taxableIncomeCents < 0) {
      errors.push(`第 ${row.rowNumber} 行标记为归属异常但金额无效`);
    }
  }

  for (const row of rows) {
    if (row.validStatus === "NEGATIVE" && (row.taxableIncomeCents ?? 0) >= 0) {
      errors.push(`第 ${row.rowNumber} 行标记为负数排除但金额不为负`);
    }
    if (
      row.validStatus === "INVALID_INCOME" &&
      row.taxableIncomeCents !== null
    ) {
      errors.push(`第 ${row.rowNumber} 行标记为金额异常但存在金额`);
    }
  }

  const assignedIncome = assigned.reduce((total, row) => total + (row.taxableIncomeCents ?? 0), 0);
  const unmappedIncome = unmapped.reduce((total, row) => total + (row.taxableIncomeCents ?? 0), 0);
  if (stats.incomeTotalCents !== assignedIncome + unmappedIncome) {
    errors.push(
      `应税所得合计不一致：${stats.incomeTotalCents} ≠ ${assignedIncome + unmappedIncome}`,
    );
  }

  const orgTotal = Object.values(stats.orgCounts).reduce((total, count) => total + count, 0);
  if (orgTotal !== stats.assignedRows) {
    errors.push(`组织归属数不一致：${orgTotal} ≠ ${stats.assignedRows}`);
  }

  return { ok: errors.length === 0, errors, stats };
}
