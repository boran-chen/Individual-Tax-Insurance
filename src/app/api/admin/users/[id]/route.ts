import { NextResponse, type NextRequest } from "next/server";
import { getDb, nowIso, transaction } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { hashPassword, passwordPolicyError } from "@/lib/auth/password";
import { writeAudit } from "@/lib/services/audit-service";
import { badRequest, notFound } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TargetUser = {
  id: string;
  name: string;
  login: string;
  role: "ADMIN" | "PROVINCE";
  status: string;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const admin = requireApiUser(request, "ADMIN");
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      status?: "ACTIVE" | "DISABLED";
      password?: string;
      orgIds?: string[];
    } | null;
    if (!body) throw badRequest("请求内容无效");

    const db = getDb();
    const target = db
      .prepare("SELECT id, name, login, role, status FROM users WHERE id = ?")
      .get(id) as TargetUser | undefined;
    if (!target) throw notFound("用户不存在");

    if (target.id === admin.id && body.status === "DISABLED") {
      throw badRequest("不能停用当前登录账号");
    }

    if (body.password) {
      const policy = passwordPolicyError(body.password);
      if (policy) throw badRequest(policy);
    }

    const orgIds =
      target.role === "PROVINCE" && body.orgIds ? [...new Set(body.orgIds)] : undefined;
    if (orgIds) {
      for (const orgId of orgIds) {
        const org = db.prepare("SELECT id FROM organizations WHERE id = ?").get(orgId);
        if (!org) throw badRequest("包含无效的组织");
      }
    }

    const passwordHash = body.password ? await hashPassword(body.password) : null;
    const now = nowIso();
    const bumpSession =
      Boolean(passwordHash) || (body.status !== undefined && body.status !== target.status);

    const beforeOrgIds = (
      db.prepare("SELECT org_id FROM user_organizations WHERE user_id = ?").all(id) as Array<{
        org_id: string;
      }>
    ).map((row) => row.org_id);

    transaction(db, () => {
      const sets: string[] = ["updated_at = ?"];
      const params: Array<string | number> = [now];

      if (body.name?.trim()) {
        sets.push("name = ?");
        params.push(body.name.trim());
      }
      if (body.status) {
        sets.push("status = ?");
        params.push(body.status);
      }
      if (passwordHash) {
        sets.push("password_hash = ?");
        params.push(passwordHash);
      }
      if (bumpSession) {
        sets.push("session_version = session_version + 1");
      }
      params.push(id);
      db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...params);

      if (orgIds) {
        db.prepare("DELETE FROM user_organizations WHERE user_id = ?").run(id);
        const bind = db.prepare(
          "INSERT OR IGNORE INTO user_organizations (user_id, org_id, effective_from, effective_to) VALUES (?, ?, ?, NULL)",
        );
        for (const orgId of orgIds) bind.run(id, orgId, now);
      }
    });

    writeAudit(db, {
      userId: admin.id,
      action: "UPDATE_USER",
      objectType: "USER",
      objectId: id,
      context: {
        before: {
          name: target.name,
          status: target.status,
          orgIds: beforeOrgIds,
        },
        after: {
          name: body.name?.trim() || target.name,
          status: body.status ?? target.status,
          orgIds: orgIds ?? beforeOrgIds,
          passwordChanged: Boolean(body.password),
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
