import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser, stringParam } from "@/lib/api/helpers";
import { assertSameOrigin } from "@/lib/auth/csrf";
import {
  createBatchFromStaging,
  downloadedOrgCount,
  listBatches,
  parseStats,
} from "@/lib/services/batch-service";
import { badRequest } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = requireApiUser(request);
    const db = getDb();
    const month = stringParam(request.nextUrl.searchParams.get("month"));
    const status = stringParam(request.nextUrl.searchParams.get("status"));

    const batches = listBatches(db, user, { month, status }).map((batch) => ({
      ...batch,
      stats: parseStats(batch),
      downloadedOrgs: downloadedOrgCount(db, batch.id),
    }));

    return NextResponse.json({ batches });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = requireApiUser(request, "ADMIN");
    const body = (await request.json().catch(() => null)) as {
      uploadId?: string;
      month?: string;
      sheetName?: string;
      note?: string;
    } | null;

    if (!body?.uploadId || !body?.month) {
      throw badRequest("缺少上传文件或佣金所属月份");
    }

    const result = createBatchFromStaging(getDb(), user, {
      uploadId: body.uploadId,
      month: body.month,
      sheetName: body.sheetName ?? null,
      note: body.note ?? null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
