import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import { getBatchForUser } from "@/lib/services/batch-service";
import { getReturnProgress } from "@/lib/services/return-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireApiUser(request);
    const { id } = await context.params;
    const db = getDb();
    const batch = getBatchForUser(db, user, id);
    const progress = getReturnProgress(db, user, id);

    return NextResponse.json({
      batch: { id: batch.id, month: batch.month, version: batch.version, status: batch.status },
      progress,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
