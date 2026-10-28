import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import {
  getDiffTypeStats,
  getSubmissionForUser,
} from "@/lib/services/return-service";
import { getBatchById } from "@/lib/services/batch-service";
import { notFound } from "@/lib/utils/http-error";

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
    const submission = getSubmissionForUser(db, user, id);
    const batch = getBatchById(db, submission.batch_id);
    if (!batch) throw notFound("批次不存在");

    return NextResponse.json({
      submission,
      batch: {
        id: batch.id,
        month: batch.month,
        version: batch.version,
        status: batch.status,
      },
      diffStats: getDiffTypeStats(db, id),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
