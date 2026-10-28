import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import { getJob } from "@/lib/services/job-service";
import { getBatchForUser } from "@/lib/services/batch-service";
import { getSubmissionForUser } from "@/lib/services/return-service";
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
    const job = getJob(db, id);
    if (!job) throw notFound("任务不存在");

    if (job.type === "PROCESS_BATCH") {
      getBatchForUser(db, user, job.object_id);
    } else {
      getSubmissionForUser(db, user, job.object_id);
    }

    return NextResponse.json({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      errorMessage: job.error_message,
      objectId: job.object_id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
