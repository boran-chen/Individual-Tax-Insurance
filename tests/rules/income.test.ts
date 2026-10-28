import { describe, expect, it } from "vitest";
import { formatCents, parseAmount } from "@/lib/rules/v1/money";

describe("应税所得解析 AC-02", () => {
  it("正数和 0 有效", () => {
    expect(parseAmount(100)).toEqual({ status: "VALID", cents: 10000, text: "100" });
    expect(parseAmount(0)).toEqual({ status: "VALID", cents: 0, text: "0" });
    expect(parseAmount("0.00")).toEqual({ status: "VALID", cents: 0, text: "0.00" });
  });

  it("负数排除", () => {
    expect(parseAmount(-1)).toEqual({ status: "NEGATIVE", cents: -100, text: "-1" });
    expect(parseAmount("-0.01")).toEqual({ status: "NEGATIVE", cents: -1, text: "-0.01" });
  });

  it("空值与非数值进入异常", () => {
    expect(parseAmount("").status).toBe("EMPTY");
    expect(parseAmount(null).status).toBe("EMPTY");
    expect(parseAmount("待确认").status).toBe("NON_NUMERIC");
    expect(parseAmount("1.2.3").status).toBe("NON_NUMERIC");
  });

  it("支持千分位、全角数字和四舍五入到分", () => {
    expect(parseAmount("1,234.56")).toEqual({
      status: "VALID",
      cents: 123456,
      text: "1,234.56",
    });
    expect(parseAmount("１２３．４５")).toMatchObject({ status: "VALID", cents: 12345 });
    expect(parseAmount("1.005")).toMatchObject({ status: "VALID", cents: 101 });
  });

  it("金额格式化", () => {
    expect(formatCents(123456)).toBe("1234.56");
    expect(formatCents(-100)).toBe("-1.00");
    expect(formatCents(null)).toBe("");
  });
});
