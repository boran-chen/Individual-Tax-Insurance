import { describe, expect, it } from "vitest";
import {
  buildLaborIncomeRowValues,
  datasetMembership,
  hasCompleteIdentity,
  LABOR_INCOME_COLUMNS,
} from "@/lib/rules/v1/datasets";
import type { NormalizedSourceRow } from "@/lib/rules/types";

function makeRow(overrides: Partial<NormalizedSourceRow> = {}): NormalizedSourceRow {
  return {
    id: "row-1",
    sheetName: "佣金总表",
    rowNumber: 2,
    raw: {},
    name: "张三",
    idType: "居民身份证",
    idNumber: "110101199001011234",
    idMask: "110***********1234",
    idFingerprint: "fingerprint",
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

describe("四类数据集 AC-01 / AC-07 / AC-09", () => {
  it("劳动报酬收入固定 13 列", () => {
    expect(LABOR_INCOME_COLUMNS).toHaveLength(13);
    const values = buildLaborIncomeRowValues("张三", "居民身份证", "001122", 12345);
    expect(values).toHaveLength(13);
    expect(values[0]).toBe("张三");
    expect(values[1]).toBe("居民身份证");
    expect(values[2]).toBe("001122");
    expect(values[3]).toBe("保险营销员佣金收入");
    expect(values[4]).toBe(123.45);
    expect(values.slice(5)).toEqual(["", "", "", "", "", "", "", ""]);
  });

  it("新增人员筛 M+1，转非筛 M", () => {
    const newRow = makeRow({ entryMonth: "2026-08" });
    const transferRow = makeRow({ entryMonth: "2026-07" });
    const oldRow = makeRow({ entryMonth: "2026-06" });

    expect(datasetMembership(newRow, "2026-07")).toEqual([
      "SUMMARY",
      "LABOR_INCOME",
      "NEW_PERSON",
    ]);
    expect(datasetMembership(transferRow, "2026-07")).toEqual([
      "SUMMARY",
      "LABOR_INCOME",
      "TRANSFER_NON",
    ]);
    expect(datasetMembership(oldRow, "2026-07")).toEqual(["SUMMARY", "LABOR_INCOME"]);
  });

  it("入职月份无法识别仍进入汇总和劳动报酬", () => {
    const row = makeRow({ entryMonth: null, entryMonthRaw: "不详" });
    expect(datasetMembership(row, "2026-07")).toEqual(["SUMMARY", "LABOR_INCOME"]);
  });

  it("身份字段缺失只进入汇总", () => {
    const row = makeRow({ idNumber: "" });
    expect(hasCompleteIdentity(row)).toBe(false);
    expect(datasetMembership(row, "2026-07")).toEqual(["SUMMARY"]);
  });

  it("负数与归属异常不进入任何组织数据集", () => {
    expect(datasetMembership(makeRow({ validStatus: "NEGATIVE" }), "2026-07")).toEqual([]);
    expect(
      datasetMembership(makeRow({ validStatus: "ORG_UNMAPPED", orgId: null }), "2026-07"),
    ).toEqual([]);
  });
});
