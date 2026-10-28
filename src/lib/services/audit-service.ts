import { newId, nowIso, type Db } from "../db";

export type AuditInput = {
  userId?: string | null;
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  orgId?: string | null;
  result?: "SUCCESS" | "FAILURE";
  context?: Record<string, unknown>;
  ip?: string | null;
};

export function writeAudit(db: Db, input: AuditInput): void {
  db.prepare(
    `INSERT INTO audit_logs
       (id, user_id, action, object_type, object_id, org_id, result, context_json, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    input.userId ?? null,
    input.action,
    input.objectType ?? null,
    input.objectId ?? null,
    input.orgId ?? null,
    input.result ?? "SUCCESS",
    JSON.stringify(input.context ?? {}),
    input.ip ?? null,
    nowIso(),
  );
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}
