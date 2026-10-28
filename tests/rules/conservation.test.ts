import { describe, expect, it } from "vitest";
import { checkConservation, computeBatchStats } from "@/lib/rules/v1/conservation";
import type { NormalizedSourceRow } from "@/lib/rules/types";

function row(overrides: Partial<NormalizedSourceRow>): NormalizedSourceRow {
  return {
    id: Math.random().toString(36),
    sheetName: "佣金总表",
    rowNumber: 2,
    raw: {},
    name: "张三",
    idType: "居民身份证",
    idNumber: "110101199001011234",
    idMask: "110***********1234",
    idFingerprint: "fp",
    taxableIncomeCents: 10000,
    taxableIncomeText: "100",
    entryMonth: "2020-01",
    entryMonthRaw: "2020-01",
    orgRaw: "北京",
    orgId: "ORG-110000",
    validStatus: "VALID",
    anomalyCodes: [],
    dedupeFingerprint: null,
    businessKey: "",
    ...overrides,
  };
}

describe("汇总守恒 AC-11", () => {
  it("有效记录 = 已归属 + 归属异常，金额一致", () => {
    const rows = [
      row({ rowNumber: 2, taxableIncomeCents: 10000 }),
      row({
        rowNumber: 3,
        validStatus: "ORG_UNMAPPED",
        orgId: null,
        orgRaw: "火星",
        taxableIncomeCents: 5000,
      }),
      row({
        rowNumber: 4,
        validStatus: "NEGATIVE",
        taxableIncomeCents: -100,
        anomalyCodes: ["INCOME_NEGATIVE"],
      }),
      row({
        rowNumber: 5,
        validStatus: "INVALID_INCOME",
        taxableIncomeCents: null,
        anomalyCodes: ["INCOME_EMPTY"],
      }),
    ];

    const stats = computeBatchStats(rows);
    expect(stats.sourceRows).toBe(4);
    expect(stats.validRows).toBe(2);
    expect(stats.assignedRows).toBe(1);
    expect(stats.orgUnmappedRows).toBe(1);
    expect(stats.negativeRows).toBe(1);
    expect(stats.invalidIncomeRows).toBe(1);
    expect(stats.incomeTotalCents).toBe(15000);
    expect(stats.orgCounts).toEqual({ "ORG-110000": 1 });

    const result = checkConservation(rows);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("已归属标记但组织为空时报错", () => {
    const rows = [row({ validStatus: "VALID", orgId: null })];
    const result = checkConservation(rows);
    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes("组织为空"))).toBe(true);
  });

  it("负数标记但金额非负时报错", () => {
    const rows = [
      row({ validStatus: "NEGATIVE", taxableIncomeCents: 100, anomalyCodes: [] }),
    ];
    const result = checkConservation(rows);
    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes("金额不为负"))).toBe(true);
  });
});
