import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { badRequest, notFound } from "../utils/http-error";
import { newId, nowIso, type Db } from "../db";
import { inspectWorkbook, type WorkbookPreview } from "../excel/reader";
import { getFieldAliases } from "./config-service";
import { suggestMonthFromFilename } from "../rules/v1/month";
import type { AuthUser } from "../auth/session";

export type StagingUploadRow = {
  id: string;
  file_name: string;
  storage_path: string;
  sha256: string;
  size: number;
  preview_json: string;
  created_by: string;
  created_at: string;
};

export type StagingUploadResult = {
  uploadId: string;
  fileName: string;
  size: number;
  sha256: string;
  suggestedMonth: string | null;
  preview: WorkbookPreview;
};

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? "50");
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}

export function maxRows(): number {
  const value = Number(process.env.MAX_ROWS ?? "200000");
  return Number.isFinite(value) && value > 0 ? value : 200000;
}

export function storageRoot(): string {
  return process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
}

export function ensureStorageDirs(): void {
  for (const dir of ["staging", "uploads", "exports", "returns"]) {
    fs.mkdirSync(path.join(storageRoot(), dir), { recursive: true });
  }
}

export function assertXlsxFileName(fileName: string): void {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".xlsx")) {
    throw badRequest("仅支持 .xlsx 文件，不支持宏文件或其他格式");
  }
}

export async function assertXlsxMagic(filePath: string): Promise<void> {
  const header = Buffer.alloc(4);
  const fileHandle = await fs.promises.open(filePath, "r");
  await fileHandle.read(header, 0, 4, 0);
  await fileHandle.close();
  if (header.toString("binary") !== "PK\u0003\u0004") {
    fs.rmSync(filePath, { force: true });
    throw badRequest("文件不是有效的 xlsx（可能已损坏或被加密）");
  }
}

export async function saveStreamToFile(
  stream: ReadableStream<Uint8Array>,
  targetPath: string,
): Promise<{ size: number; sha256: string }> {
  const limit = maxUploadBytes();
  const hash = crypto.createHash("sha256");
  let size = 0;
  const handle = await fs.promises.open(targetPath, "w");

  try {
    for await (const chunk of Readable.fromWeb(stream as never) as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > limit) {
        throw badRequest(`文件超过大小限制（${Math.floor(limit / 1024 / 1024)}MB）`);
      }
      hash.update(chunk);
      await handle.write(chunk);
    }
  } catch (error) {
    await handle.close();
    fs.rmSync(targetPath, { force: true });
    throw error;
  }

  await handle.close();
  return { size, sha256: hash.digest("hex") };
}

export async function createStagingUpload(
  db: Db,
  user: AuthUser,
  fileName: string,
  stream: ReadableStream<Uint8Array>,
): Promise<StagingUploadResult> {
  assertXlsxFileName(fileName);
  ensureStorageDirs();

  const id = newId();
  const targetPath = path.join(storageRoot(), "staging", `${id}.xlsx`);
  const { size, sha256 } = await saveStreamToFile(stream, targetPath);
  await assertXlsxMagic(targetPath);

  const aliases = getFieldAliases(db);
  let preview;
  try {
    preview = await inspectWorkbook(targetPath, aliases, 60, maxRows());
  } catch (error) {
    fs.rmSync(targetPath, { force: true });
    const detail = error instanceof Error ? error.message : "文件损坏或格式不受支持";
    throw badRequest(`无法解析 Excel：${detail}`);
  }

  const rowCount = preview.sheets.map((sheet) => sheet.dataRows);
  const totalRows = Math.max(0, ...rowCount);
  if (totalRows > maxRows()) {
    fs.rmSync(targetPath, { force: true });
    throw badRequest(`数据行数超过限制（${maxRows()} 行）`);
  }

  db.prepare(
    `INSERT INTO staging_uploads
       (id, file_name, storage_path, sha256, size, preview_json, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, fileName, targetPath, sha256, size, JSON.stringify(preview), user.id, nowIso());

  return {
    uploadId: id,
    fileName,
    size,
    sha256,
    suggestedMonth: suggestMonthFromFilename(fileName),
    preview,
  };
}

export function getStagingUpload(
  db: Db,
  uploadId: string,
  userId: string,
): StagingUploadRow {
  const row = db
    .prepare("SELECT * FROM staging_uploads WHERE id = ?")
    .get(uploadId) as StagingUploadRow | undefined;
  if (!row) throw notFound("上传文件不存在或已过期");
  if (row.created_by !== userId) throw notFound("上传文件不存在或已过期");
  return row;
}

export function consumeStagingUpload(
  db: Db,
  uploadId: string,
  userId: string,
  batchId: string,
): { row: StagingUploadRow; targetPath: string } {
  const row = getStagingUpload(db, uploadId, userId);
  ensureStorageDirs();
  const targetPath = path.join(storageRoot(), "uploads", `${batchId}.xlsx`);
  fs.renameSync(row.storage_path, targetPath);
  db.prepare("DELETE FROM staging_uploads WHERE id = ?").run(uploadId);
  return { row, targetPath };
}

export function removeStagingUpload(db: Db, uploadId: string): void {
  const row = db
    .prepare("SELECT storage_path FROM staging_uploads WHERE id = ?")
    .get(uploadId) as { storage_path: string } | undefined;
  if (row) {
    fs.rmSync(row.storage_path, { force: true });
    db.prepare("DELETE FROM staging_uploads WHERE id = ?").run(uploadId);
  }
}
