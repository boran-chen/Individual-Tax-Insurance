import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { getBatchById, publishBatch } from "@/lib/services/batch-service";
import { notFound } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = requireApiUser(request, "ADMIN");
    const { id } = await context.params;
    const db = getDb();
    if (!getBatchById(db, id)) throw notFound("批次不存在");
    publishBatch(db, user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
