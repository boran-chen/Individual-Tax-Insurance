import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import {
  downloadedOrgCount,
  getBatchForUser,
  getBatchOrgs,
  parseStats,
} from "@/lib/services/batch-service";
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
    const orgs = getBatchOrgs(db, id, user);
    const progress = getReturnProgress(db, user, id);

    return NextResponse.json({
      batch: {
        id: batch.id,
        month: batch.month,
        version: batch.version,
        status: batch.status,
        originalFileName: batch.original_file_name,
        ruleVersion: batch.rule_version,
        note: batch.note,
        stats: parseStats(batch),
        createdAt: batch.created_at,
        processedAt: batch.processed_at,
        publishedAt: batch.published_at,
        voidedAt: batch.voided_at,
        errorMessage: batch.error_message,
        sourceSheet: batch.source_sheet,
        headerRow: batch.header_row,
        sha256: user.role === "ADMIN" ? batch.sha256 : null,
      },
      orgs,
      progress,
      downloadedOrgs: downloadedOrgCount(db, id),
      isAdmin: user.role === "ADMIN",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
