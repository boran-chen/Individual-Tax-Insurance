import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, intParam, requireApiUser } from "@/lib/api/helpers";
import { getBatchForUser } from "@/lib/services/batch-service";
import { getDatasetPage } from "@/lib/services/dataset-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; type: string }> },
) {
  try {
    const user = requireApiUser(request);
    const { id, type } = await context.params;
    const db = getDb();
    const batch = getBatchForUser(db, user, id);
    const search = request.nextUrl.searchParams;

    const result = getDatasetPage(db, user, batch, type, {
      orgId: search.get("orgId"),
      page: intParam(search.get("page"), 1, 1),
      pageSize: intParam(search.get("pageSize"), 20, 1, 100),
      q: search.get("q"),
      sort: search.get("sort"),
      direction: search.get("direction"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
