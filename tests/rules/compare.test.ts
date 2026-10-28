import { describe, expect, it } from "vitest";
import {
  buildCompareKey,
  buildKeyMask,
  compareReturn,
} from "@/lib/rules/v1/compare";
import type { ActualCompareRow, ExpectedCompareRow } from "@/lib/rules/types";

const CERT_A = "110101199001011234";
const CERT_B = "320102199002022345";

function expected(
  name: string,
  certNo: string,
  incomeCents: number,
  overrides: Partial<ExpectedCompareRow> = {},
): ExpectedCompareRow {
  return {
    key: buildCompareKey(name, certNo),
    keyMask: buildKeyMask(name, certNo),
    name,
    idType: "居民身份证",
    idNumber: certNo,
    incomeCents,
    rowNumber: 2,
    ...overrides,
  };
}

function actual(
  name: string,
  certNo: string,
  incomeCents: number | null,
  overrides: Partial<ActualCompareRow> = {},
): ActualCompareRow {
  return {
    key: buildCompareKey(name, certNo),
    keyMask: buildKeyMask(name, certNo),
    name,
    idType: "居民身份证",
    idNumber: certNo,
    incomeCents,
    rowNumber: 2,
    ...overrides,
  };
}

describe("回传比对", () => {
  it("零差异通过", () => {
    const result = compareReturn(
      [expected("张三", CERT_A, 10000), expected("李四", CERT_B, 20000)],
      [actual("张三", CERT_A, 10000), actual("李四", CERT_B, 20000)],
    );
    expect(result.passed).toBe(true);
    expect(result.diffs).toEqual([]);
    expect(result.matchedRows).toBe(2);
    expect(result.totalSource).toBe(2);
    expect(result.totalReturn).toBe(2);
  });

  it("回传缺少记录不通过", () => {
    const result = compareReturn(
      [expected("张三", CERT_A, 10000), expected("李四", CERT_B, 20000)],
      [actual("张三", CERT_A, 10000)],
    );
    expect(result.passed).toBe(false);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].type).toBe("MISSING_IN_RETURN");
    expect(result.diffs[0].originalValue).toBe("200.00");
  });

  it("回传多出记录不通过", () => {
    const result = compareReturn(
      [expected("张三", CERT_A, 10000)],
      [actual("张三", CERT_A, 10000), actual("王五", CERT_B, 30000)],
    );
    expect(result.passed).toBe(false);
    expect(result.diffs[0].type).toBe("EXTRA_IN_RETURN");
  });

  it("金额不一致不通过", () => {
    const result = compareReturn(
      [expected("张三", CERT_A, 10000)],
      [actual("张三", CERT_A, 10001)],
    );
    expect(result.passed).toBe(false);
    expect(result.diffs[0].type).toBe("AMOUNT_MISMATCH");
    expect(result.diffs[0].originalValue).toBe("100.00");
    expect(result.diffs[0].returnedValue).toBe("100.01");
  });

  it("回传重复记录不通过", () => {
    const result = compareReturn(
      [expected("张三", CERT_A, 10000)],
      [actual("张三", CERT_A, 10000), actual("张三", CERT_A, 10000)],
    );
    expect(result.passed).toBe(false);
    expect(result.diffs[0].type).toBe("DUPLICATE_KEY");
  });

  it("同一人多条佣金按金额多重集比对", () => {
    const result = compareReturn(
      [expected("张三", CERT_A, 10000), expected("张三", CERT_A, 20000)],
      [actual("张三", CERT_A, 20000), actual("张三", CERT_A, 10000)],
    );
    expect(result.passed).toBe(true);
  });

  it("证件号相同但姓名不同给出字段差异", () => {
    const result = compareReturn(
      [expected("张三", CERT_A, 10000)],
      [actual("张叁", CERT_A, 10000)],
    );
    expect(result.passed).toBe(false);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].type).toBe("FIELD_MISMATCH");
    expect(result.diffs[0].field).toBe("姓名");
  });

  it("证照类型不一致不通过", () => {
    const result = compareReturn(
      [expected("张三", CERT_A, 10000)],
      [actual("张三", CERT_A, 10000, { idType: "护照" })],
    );
    expect(result.passed).toBe(false);
    expect(result.diffs[0].type).toBe("FIELD_MISMATCH");
    expect(result.diffs[0].field).toBe("证照类型");
  });

  it("金额为空或非数值不通过", () => {
    const result = compareReturn(
      [expected("张三", CERT_A, 10000)],
      [actual("张三", CERT_A, null)],
    );
    expect(result.passed).toBe(false);
    expect(result.diffs[0].type).toBe("AMOUNT_MISMATCH");
    expect(result.diffs[0].returnedValue).toBe("空/无效");
  });

  it("差异键只包含掩码，不泄露完整证件号", () => {
    const result = compareReturn([expected("张三", CERT_A, 10000)], []);
    expect(result.diffs[0].keyMask).not.toContain(CERT_A);
    expect(result.diffs[0].keyMask).toContain("110");
    expect(result.diffs[0].keyMask).toContain("1234");
  });
});
