import { GUANGDONG_ORG_CODE, SHENZHEN_ORG_CODE } from "../../config/organizations";
import { normalizeOrgText } from "./text";

export type OrgResolution =
  | { status: "ASSIGNED"; orgId: string; matchedBy: "SHENZHEN" | "GUANGDONG" | "MAPPING" }
  | { status: "EMPTY"; orgId: null }
  | { status: "UNMAPPED"; orgId: null };

export type OrgMappingTable = Map<string, string>;

export function resolveOrganization(raw: unknown, mappings: OrgMappingTable): OrgResolution {
  const normalized = normalizeOrgText(raw);
  if (!normalized) {
    return { status: "EMPTY", orgId: null };
  }

  // 深圳规则优先于广东规则
  if (normalized.includes("深圳")) {
    return { status: "ASSIGNED", orgId: `ORG-${SHENZHEN_ORG_CODE}`, matchedBy: "SHENZHEN" };
  }

  if (normalized.includes("广东")) {
    return { status: "ASSIGNED", orgId: `ORG-${GUANGDONG_ORG_CODE}`, matchedBy: "GUANGDONG" };
  }

  const mapped = mappings.get(normalized);
  if (mapped) {
    return { status: "ASSIGNED", orgId: mapped, matchedBy: "MAPPING" };
  }

  return { status: "UNMAPPED", orgId: null };
}
