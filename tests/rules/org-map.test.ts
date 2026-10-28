import { describe, expect, it } from "vitest";
import { resolveOrganization, type OrgMappingTable } from "@/lib/rules/v1/org-map";
import { normalizeOrgText } from "@/lib/rules/v1/text";

const mappings: OrgMappingTable = new Map([
  [normalizeOrgText("江苏"), "ORG-320000"],
  [normalizeOrgText("江苏省"), "ORG-320000"],
  [normalizeOrgText("北京"), "ORG-110000"],
]);

describe("省份拆分 AC-03 / AC-04 / AC-05", () => {
  it("含深圳优先归深圳分公司", () => {
    expect(resolveOrganization("广东深圳", mappings)).toMatchObject({
      status: "ASSIGNED",
      orgId: "ORG-440300",
      matchedBy: "SHENZHEN",
    });
    expect(resolveOrganization("广东省深圳市", mappings)).toMatchObject({
      status: "ASSIGNED",
      orgId: "ORG-440300",
    });
    expect(resolveOrganization(" 深圳 市 ", mappings)).toMatchObject({
      status: "ASSIGNED",
      orgId: "ORG-440300",
    });
  });

  it("广东（不含深圳）归广东分公司", () => {
    expect(resolveOrganization("广东省", mappings)).toMatchObject({
      status: "ASSIGNED",
      orgId: "ORG-440000",
      matchedBy: "GUANGDONG",
    });
  });

  it("其他省份查映射表", () => {
    expect(resolveOrganization("江苏", mappings)).toMatchObject({
      status: "ASSIGNED",
      orgId: "ORG-320000",
      matchedBy: "MAPPING",
    });
    expect(resolveOrganization("江苏省", mappings)).toMatchObject({
      status: "ASSIGNED",
      orgId: "ORG-320000",
    });
  });

  it("空值和未知省份不进入正式数据", () => {
    expect(resolveOrganization("", mappings).status).toBe("EMPTY");
    expect(resolveOrganization("   ", mappings).status).toBe("EMPTY");
    expect(resolveOrganization("火星", mappings).status).toBe("UNMAPPED");
  });
});
