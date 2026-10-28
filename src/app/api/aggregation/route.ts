import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import {
  aggregationTotals,
  getActiveBatchForMonth,
  getReturnProgress,
  listAggregations,
} from "@/lib/services/return-service";
import { parseMonth } from "@/lib/rules/v1/month";
import { badRequest } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = requireApiUser(request, "ADMIN");
    const month = parseMonth(request.nextUrl.searchParams.get("month"));
    if (!month) throw badRequest("请选择有效的月份");

    const db = getDb();
    const rows = listAggregations(db, month);
    const totals = aggregationTotals(rows);
    const activeBatch = getActiveBatchForMonth(db, month);
    const progress = activeBatch ? getReturnProgress(db, user, activeBatch.id) : [];

    return NextResponse.json({
      month,
      rows,
      totals,
      activeBatch: activeBatch
        ? {
            id: activeBatch.id,
            month: activeBatch.month,
            version: activeBatch.version,
            publishedAt: activeBatch.published_at,
          }
        : null,
      progress,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
