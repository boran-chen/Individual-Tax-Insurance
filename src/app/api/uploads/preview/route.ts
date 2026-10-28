import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { requireApiUser, errorResponse } from "@/lib/api/helpers";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { createStagingUpload } from "@/lib/services/upload-service";
import { badRequest } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = requireApiUser(request, "ADMIN");
    if (!request.body) throw badRequest("未收到文件内容");

    const fileName =
      request.nextUrl.searchParams.get("fileName")?.trim() || "佣金总表.xlsx";

    const result = await createStagingUpload(
      getDb(),
      user,
      fileName,
      request.body as ReadableStream<Uint8Array>,
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
