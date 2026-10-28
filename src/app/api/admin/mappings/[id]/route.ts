import { NextResponse, type NextRequest } from "next/server";
import { getDb, nowIso } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { writeAudit } from "@/lib/services/audit-service";
import { badRequest, notFound } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const admin = requireApiUser(request, "ADMIN");
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      active?: boolean;
      orgId?: string;
    } | null;
    if (!body) throw badRequest("请求内容无效");

    const db = getDb();
    const mapping = db
      .prepare("SELECT id, source_value, org_id FROM province_mappings WHERE id = ?")
      .get(id) as { id: string; source_value: string; org_id: string } | undefined;
    if (!mapping) throw notFound("映射不存在");

    if (body.orgId) {
      const org = db.prepare("SELECT id FROM organizations WHERE id = ?").get(body.orgId);
      if (!org) throw badRequest("目标组织不存在");
    }

    const sets: string[] = ["updated_at = ?"];
    const params: Array<string | number> = [nowIso()];
    if (body.orgId) {
      sets.push("org_id = ?");
      params.push(body.orgId);
    }
    if (body.active !== undefined) {
      sets.push("active = ?");
      params.push(body.active ? 1 : 0);
    }
    params.push(id);
    db.prepare(`UPDATE province_mappings SET ${sets.join(", ")} WHERE id = ?`).run(...params);

    writeAudit(db, {
      userId: admin.id,
      action: "UPDATE_MAPPING",
      objectType: "PROVINCE_MAPPING",
      objectId: id,
      context: { sourceValue: mapping.source_value, active: body.active, orgId: body.orgId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
