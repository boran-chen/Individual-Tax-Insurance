import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import { exportAggregationFile } from "@/lib/services/return-service";
import { writeAudit, clientIp } from "@/lib/services/audit-service";
import { parseMonth } from "@/lib/rules/v1/month";
import { badRequest } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: NextRequest) {
  try {
    const user = requireApiUser(request, "ADMIN");
    const month = parseMonth(request.nextUrl.searchParams.get("month"));
    if (!month) throw badRequest("请选择有效的月份");

    const db = getDb();
    const file = await exportAggregationFile(db, month);
    const stat = fs.statSync(file.path);

    writeAudit(db, {
      userId: user.id,
      action: "DOWNLOAD_AGGREGATION",
      objectType: "AGGREGATION",
      objectId: month,
      context: { month, fileName: file.fileName, sha256: file.sha256, size: stat.size },
      ip: clientIp(request),
    });

    const stream = Readable.toWeb(fs.createReadStream(file.path)) as unknown as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Length": String(stat.size),
        "Content-Disposition": contentDisposition(file.fileName),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
