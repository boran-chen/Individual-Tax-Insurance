import { NextResponse, type NextRequest } from "next/server";
import { getDb, newId, nowIso, transaction } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { hashPassword, passwordPolicyError } from "@/lib/auth/password";
import { writeAudit } from "@/lib/services/audit-service";
import { badRequest, conflict } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  name: string;
  login: string;
  role: "ADMIN" | "PROVINCE";
  status: string;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    requireApiUser(request, "ADMIN");
    const db = getDb();
    const users = db
      .prepare("SELECT id, name, login, role, status, created_at FROM users ORDER BY role, login")
      .all() as unknown as UserRow[];

    const orgRows = db
      .prepare(
        `SELECT uo.user_id, o.id, o.name FROM user_organizations uo
           JOIN organizations o ON o.id = uo.org_id ORDER BY o.sort_order`,
      )
      .all() as Array<{ user_id: string; id: string; name: string }>;

    const orgsByUser = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of orgRows) {
      const list = orgsByUser.get(row.user_id) ?? [];
      list.push({ id: row.id, name: row.name });
      orgsByUser.set(row.user_id, list);
    }

    const organizations = db
      .prepare("SELECT id, name, short_name FROM organizations WHERE status = 'ACTIVE' ORDER BY sort_order")
      .all() as Array<{ id: string; name: string; short_name: string }>;

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        login: user.login,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
        orgs: orgsByUser.get(user.id) ?? [],
      })),
      organizations,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = requireApiUser(request, "ADMIN");
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      login?: string;
      password?: string;
      role?: "ADMIN" | "PROVINCE";
      orgIds?: string[];
    } | null;

    if (!body?.name?.trim() || !body?.login?.trim() || !body?.password) {
      throw badRequest("姓名、登录名和密码不能为空");
    }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(body.login.trim())) {
      throw badRequest("登录名需为 3-32 位字母、数字、下划线、点或短横线");
    }
    const policy = passwordPolicyError(body.password);
    if (policy) throw badRequest(policy);

    const role = body.role === "ADMIN" ? "ADMIN" : "PROVINCE";
    const db = getDb();
    const existing = db
      .prepare("SELECT id FROM users WHERE login = ?")
      .get(body.login.trim()) as { id: string } | undefined;
    if (existing) throw conflict("登录名已存在");

    const orgIds = role === "PROVINCE" ? [...new Set(body.orgIds ?? [])] : [];
    for (const orgId of orgIds) {
      const org = db.prepare("SELECT id FROM organizations WHERE id = ?").get(orgId);
      if (!org) throw badRequest("包含无效的组织");
    }

    const passwordHash = await hashPassword(body.password);
    const userId = newId();
    const now = nowIso();

    transaction(db, () => {
      db.prepare(
        `INSERT INTO users (id, name, login, password_hash, role, status, session_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`,
      ).run(userId, body.name!.trim(), body.login!.trim(), passwordHash, role, now, now);

      const bind = db.prepare(
        "INSERT OR IGNORE INTO user_organizations (user_id, org_id, effective_from, effective_to) VALUES (?, ?, ?, NULL)",
      );
      for (const orgId of orgIds) bind.run(userId, orgId, now);
    });

    writeAudit(db, {
      userId: admin.id,
      action: "CREATE_USER",
      objectType: "USER",
      objectId: userId,
      context: { name: body.name, login: body.login, role, orgIds },
    });

    return NextResponse.json({ ok: true, id: userId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
