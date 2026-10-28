import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser, stringParam } from "@/lib/api/helpers";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { assertOrgAccess } from "@/lib/auth/guard";
import { getBatchForUser } from "@/lib/services/batch-service";
import {
  createReturnSubmission,
  listSubmissionsForOrg,
} from "@/lib/services/return-service";
import { badRequest } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const user = requireApiUser(request);
    const db = getDb();
    const batchId = stringParam(request.nextUrl.searchParams.get("batchId"));
    const orgId = stringParam(request.nextUrl.searchParams.get("orgId"));
    if (!batchId || !orgId) throw badRequest("缺少批次或组织参数");

    const batch = getBatchForUser(db, user, batchId);
    assertOrgAccess(user, orgId);

    return NextResponse.json({
      batch: { id: batch.id, month: batch.month, version: batch.version },
      submissions: listSubmissionsForOrg(db, batchId, orgId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = requireApiUser(request);
    if (!request.body) throw badRequest("未收到回传文件");

    const search = request.nextUrl.searchParams;
    const batchId = stringParam(search.get("batchId"));
    const orgId = stringParam(search.get("orgId"));
    const fileName = search.get("fileName")?.trim() || "回传文件.xlsx";
    if (!batchId || !orgId) throw badRequest("缺少批次或组织参数");

    const result = await createReturnSubmission(getDb(), user, {
      batchId,
      orgId,
      fileName,
      stream: request.body as ReadableStream<Uint8Array>,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
