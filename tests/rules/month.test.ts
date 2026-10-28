import { describe, expect, it } from "vitest";
import {
  nextMonth,
  parseMonth,
  suggestMonthFromFilename,
} from "@/lib/rules/v1/month";

describe("月份口径 AC-01 / AC-13", () => {
  it("规范化常见月份写法", () => {
    expect(parseMonth("2026-7")).toBe("2026-07");
    expect(parseMonth("2026/07")).toBe("2026-07");
    expect(parseMonth("2026年7月")).toBe("2026-07");
    expect(parseMonth("202607")).toBe("2026-07");
  });

  it("拒绝非法月份", () => {
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("2026-00")).toBeNull();
    expect(parseMonth("abc")).toBeNull();
    expect(parseMonth("")).toBeNull();
  });

  it("跨年计算次月", () => {
    expect(nextMonth("2026-07")).toBe("2026-08");
    expect(nextMonth("2026-12")).toBe("2027-01");
  });

  it("从文件名识别建议月份", () => {
    expect(suggestMonthFromFilename("2026-07_佣金总表.xlsx")).toBe("2026-07");
    expect(suggestMonthFromFilename("2026年7月佣金总表.xlsx")).toBe("2026-07");
    expect(suggestMonthFromFilename("202607佣金总表.xlsx")).toBe("2026-07");
    expect(suggestMonthFromFilename("佣金总表.xlsx")).toBeNull();
  });
});
