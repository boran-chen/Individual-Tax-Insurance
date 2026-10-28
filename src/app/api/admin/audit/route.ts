import { NextResponse, type NextRequest } from "next/server";
import { getDb, jsonParse } from "@/lib/db";
import { errorResponse, intParam, requireApiUser, stringParam } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireApiUser(request, "ADMIN");
    const db = getDb();
    const search = request.nextUrl.searchParams;
    const action = stringParam(search.get("action"));
    const userId = stringParam(search.get("userId"));
    const orgId = stringParam(search.get("orgId"));
    const from = stringParam(search.get("from"));
    const to = stringParam(search.get("to"));
    const month = stringParam(search.get("month"));
    const page = intParam(search.get("page"), 1, 1);
    const pageSize = intParam(search.get("pageSize"), 50, 1, 200);

    const conditions: string[] = ["1 = 1"];
    const params: Array<string | number> = [];
    if (action) {
      conditions.push("a.action = ?");
      params.push(action);
    }
    if (userId) {
      conditions.push("a.user_id = ?");
      params.push(userId);
    }
    if (orgId) {
      conditions.push("a.org_id = ?");
      params.push(orgId);
    }
    if (from) {
      conditions.push("a.created_at >= ?");
      params.push(from);
    }
    if (to) {
      conditions.push("a.created_at <= ?");
      params.push(to);
    }
    if (month) {
      conditions.push("json_extract(a.context_json, '$.month') = ?");
      params.push(month);
    }

    const where = conditions.join(" AND ");
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS total FROM audit_logs a WHERE ${where}`)
      .get(...params) as { total: number };

    const rows = db
      .prepare(
        `SELECT a.*, u.name AS user_name
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.user_id
          WHERE ${where}
          ORDER BY a.created_at DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, (page - 1) * pageSize) as unknown as Array<{
      id: string;
      user_id: string | null;
      user_name: string | null;
      action: string;
      object_type: string | null;
      object_id: string | null;
      org_id: string | null;
      result: string;
      context_json: string;
      ip: string | null;
      created_at: string;
    }>;

    return NextResponse.json({
      total: Number(totalRow.total),
      page,
      pageSize,
      rows: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        action: row.action,
        objectType: row.object_type,
        objectId: row.object_id,
        orgId: row.org_id,
        result: row.result,
        context: jsonParse<Record<string, unknown>>(row.context_json, {}),
        ip: row.ip,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
