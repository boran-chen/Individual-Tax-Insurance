import type { AuthUser } from "./session";
import { forbidden, notFound, unauthorized } from "../utils/http-error";

export function assertAuthenticated(user: AuthUser | null): AuthUser {
  if (!user) throw unauthorized();
  return user;
}

export function assertAdmin(user: AuthUser | null): AuthUser {
  const current = assertAuthenticated(user);
  if (current.role !== "ADMIN") throw forbidden("仅集团管理员可执行该操作");
  return current;
}

export function assertProvince(user: AuthUser | null): AuthUser {
  const current = assertAuthenticated(user);
  if (current.role !== "PROVINCE") throw forbidden("仅省级负责人可执行该操作");
  return current;
}

export function canAccessOrg(user: AuthUser, orgId: string): boolean {
  if (user.role === "ADMIN") return true;
  return user.orgIds.includes(orgId);
}

export function assertOrgAccess(user: AuthUser, orgId: string): void {
  if (!canAccessOrg(user, orgId)) {
    throw notFound("组织不存在或无权访问");
  }
}

export function orgScope(user: AuthUser, column = "org_id"): { clause: string; params: string[] } {
  if (user.role === "ADMIN") return { clause: "1 = 1", params: [] };
  if (!user.orgIds.length) return { clause: "1 = 0", params: [] };
  return {
    clause: `${column} IN (${user.orgIds.map(() => "?").join(", ")})`,
    params: [...user.orgIds],
  };
}

export function accessibleOrgIds(user: AuthUser): string[] | null {
  if (user.role === "ADMIN") return null;
  return [...user.orgIds];
}
