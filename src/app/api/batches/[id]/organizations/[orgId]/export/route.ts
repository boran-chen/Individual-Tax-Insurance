import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import { getBatchForUser } from "@/lib/services/batch-service";
import {
  getOrCreateExportFile,
  recordExportDownload,
} from "@/lib/services/export-service";
import { clientIp } from "@/lib/services/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; orgId: string }> },
) {
  try {
    const user = requireApiUser(request);
    const { id, orgId } = await context.params;
    const db = getDb();
    const batch = getBatchForUser(db, user, id);
    const file = await getOrCreateExportFile(db, user, batch, orgId);
    const stat = fs.statSync(file.path);

    recordExportDownload(
      db,
      user,
      batch,
      orgId,
      { fileName: file.fileName, sha256: file.sha256, size: stat.size },
      clientIp(request),
    );

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
