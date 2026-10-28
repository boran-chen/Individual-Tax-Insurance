import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
process.env.MAX_ROWS = "500000";
process.env.MAX_UPLOAD_MB = "200";

const rowCount = Number(process.env.PERF_ROWS ?? "100000");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cbr-perf-"));
process.env.DATABASE_PATH = path.join(tempRoot, "perf.db");
process.env.STORAGE_ROOT = path.join(tempRoot, "storage");

const HEADERS = [
  "渠道机构所在省",
  "姓名",
  "证照类型",
  "证照号码",
  "入职月份",
  "应税所得",
  "佣金金额",
  "保单号",
  "联系电话",
  "备注",
];
const PROVINCES = ["广东", "深圳", "北京", "江苏", "浙江", "上海", "四川", "山东"];

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

async function buildWorkbook(filePath: string): Promise<number> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useStyles: false,
  });
  const sheet = workbook.addWorksheet("佣金总表");
  sheet.addRow(HEADERS).commit();

  for (let index = 0; index < rowCount; index += 1) {
    const province = PROVINCES[index % PROVINCES.length];
    const yearMonth = index % 40 === 0 ? "2026-08" : index % 40 === 1 ? "2026-07" : "2020-01";
    const income = Math.round((50 + (index % 10000) * 0.37) * 100) / 100;
    sheet
      .addRow([
        province,
        `员工${index}`,
        "居民身份证",
        `110101900101${pad(index, 6)}`,
        yearMonth,
        income,
        income,
        `POL${pad(index, 8)}`,
        `13${pad(index % 100000000, 8)}`,
        "",
      ])
      .commit();
  }

  await workbook.commit();
  return rowCount;
}

async function main(): Promise<void> {
  const { createDatabase } = await import("../src/lib/db");
  const { seedDatabase } = await import("../src/lib/db/seed");
  const { loadAuthUser } = await import("../src/lib/auth/session");
  const { createStagingUpload } = await import("../src/lib/services/upload-service");
  const { createBatchFromStaging, processBatch, publishBatch, getBatchById } = await import(
    "../src/lib/services/batch-service"
  );
  const { getOrCreateExportFile } = await import("../src/lib/services/export-service");

  const db = createDatabase();
  await seedDatabase(db);
  const adminRow = db.prepare("SELECT id FROM users WHERE login = 'admin'").get() as { id: string };
  const admin = loadAuthUser(db, adminRow.id)!;

  const sourcePath = path.join(tempRoot, "perf-source.xlsx");
  console.log(`生成 ${rowCount.toLocaleString()} 行源表…`);
  let started = Date.now();
  await buildWorkbook(sourcePath);
  console.log(`生成完成：${((Date.now() - started) / 1000).toFixed(2)}s，文件 ${(fs.statSync(sourcePath).size / 1024 / 1024).toFixed(1)}MB`);

  started = Date.now();
  const preview = await createStagingUpload(
    db,
    admin,
    "2026-07_百万级佣金总表.xlsx",
    Readable.toWeb(fs.createReadStream(sourcePath)) as unknown as ReadableStream<Uint8Array>,
  );
  console.log(`上传+预览识别：${((Date.now() - started) / 1000).toFixed(2)}s，识别数据行 ${preview.preview.sheets[0]?.dataRows}`);

  const created = createBatchFromStaging(db, admin, {
    uploadId: preview.uploadId,
    month: "2026-07",
    sheetName: preview.preview.suggestedSheet,
  });

  started = Date.now();
  const stats = await processBatch(db, created.batchId, (progress) => {
    if (progress % 25 === 0) console.log(`  处理进度 ${progress}%`);
  });
  console.log(`解析+校验+拆分入库：${((Date.now() - started) / 1000).toFixed(2)}s`);
  console.log(
    `源 ${stats.sourceRows}，有效 ${stats.validRows}，已归属 ${stats.assignedRows}，异常 ${stats.anomalyRows}`,
  );

  publishBatch(db, admin, created.batchId);

  started = Date.now();
  const batch = getBatchById(db, created.batchId)!;
  const exportFile = await getOrCreateExportFile(db, admin, batch, "ORG-440000");
  console.log(`四 Sheet 导出：${((Date.now() - started) / 1000).toFixed(2)}s，${(fs.statSync(exportFile.path).size / 1024 / 1024).toFixed(1)}MB`);

  db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log("性能测试完成。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
