import { NextResponse, type NextRequest } from "next/server";
import { getDb, newId, nowIso } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { normalizeOrgText } from "@/lib/rules/v1/text";
import { writeAudit } from "@/lib/services/audit-service";
import { badRequest } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireApiUser(request, "ADMIN");
    const db = getDb();
    const mappings = db
      .prepare(
        `SELECT pm.id, pm.source_value, pm.org_id, pm.active, pm.updated_at,
                o.name AS org_name, o.short_name
           FROM province_mappings pm
           JOIN organizations o ON o.id = pm.org_id
          ORDER BY pm.active DESC, o.sort_order, pm.source_value`,
      )
      .all() as Array<{
      id: string;
      source_value: string;
      org_id: string;
      active: number;
      updated_at: string;
      org_name: string;
      short_name: string;
    }>;

    const organizations = db
      .prepare("SELECT id, name, short_name FROM organizations WHERE status = 'ACTIVE' ORDER BY sort_order")
      .all() as Array<{ id: string; name: string; short_name: string }>;

    return NextResponse.json({ mappings, organizations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = requireApiUser(request, "ADMIN");
    const body = (await request.json().catch(() => null)) as {
      sourceValue?: string;
      orgId?: string;
    } | null;
    if (!body?.sourceValue?.trim() || !body?.orgId) {
      throw badRequest("省份源值和目标组织不能为空");
    }

    const db = getDb();
    const org = db
      .prepare("SELECT id FROM organizations WHERE id = ?")
      .get(body.orgId) as { id: string } | undefined;
    if (!org) throw badRequest("目标组织不存在");

    const sourceValue = normalizeOrgText(body.sourceValue);
    if (!sourceValue) throw badRequest("省份源值无效");

    const existing = db
      .prepare("SELECT id FROM province_mappings WHERE source_value = ?")
      .get(sourceValue) as { id: string } | undefined;

    const now = nowIso();
    if (existing) {
      db.prepare(
        "UPDATE province_mappings SET org_id = ?, active = 1, updated_at = ? WHERE id = ?",
      ).run(body.orgId, now, existing.id);
    } else {
      db.prepare(
        "INSERT INTO province_mappings (id, source_value, org_id, active, updated_at) VALUES (?, ?, ?, 1, ?)",
      ).run(newId(), sourceValue, body.orgId, now);
    }

    writeAudit(db, {
      userId: admin.id,
      action: "UPDATE_MAPPING",
      objectType: "PROVINCE_MAPPING",
      objectId: existing?.id ?? sourceValue,
      context: { sourceValue, orgId: body.orgId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
