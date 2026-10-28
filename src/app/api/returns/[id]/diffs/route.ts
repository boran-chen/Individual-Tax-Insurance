import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, intParam, requireApiUser, stringParam } from "@/lib/api/helpers";
import {
  getDiffPage,
  getDiffTypeStats,
  getSubmissionForUser,
} from "@/lib/services/return-service";

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
    getSubmissionForUser(db, user, id);

    const search = request.nextUrl.searchParams;
    const page = intParam(search.get("page"), 1, 1);
    const pageSize = intParam(search.get("pageSize"), 50, 1, 200);
    const diffType = stringParam(search.get("type"));

    return NextResponse.json({
      ...getDiffPage(db, id, page, pageSize, diffType),
      stats: getDiffTypeStats(db, id),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
