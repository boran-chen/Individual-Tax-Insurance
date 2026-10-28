import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cbr-smoke-"));
process.env.DATABASE_PATH = path.join(tempRoot, "test.db");
process.env.STORAGE_ROOT = path.join(tempRoot, "storage");

async function main(): Promise<void> {
  const { createDatabase } = await import("../src/lib/db");
  const { seedDatabase } = await import("../src/lib/db/seed");
  const { loadAuthUser } = await import("../src/lib/auth/session");
  const { createStagingUpload } = await import("../src/lib/services/upload-service");
  const {
    createBatchFromStaging,
    processBatch,
    getBatchOrgs,
    publishBatch,
    parseStats,
    getBatchById,
  } = await import("../src/lib/services/batch-service");
  const { getOrCreateExportFile } = await import("../src/lib/services/export-service");
  const {
    createReturnSubmission,
    processReturnSubmission,
    listAggregations,
    aggregationTotals,
  } = await import("../src/lib/services/return-service");

  const db = createDatabase();
  await seedDatabase(db);

  const adminRow = db.prepare("SELECT id FROM users WHERE login = 'admin'").get() as { id: string };
  const gdRow = db.prepare("SELECT id FROM users WHERE login = 'gd_user'").get() as { id: string };
  const admin = loadAuthUser(db, adminRow.id);
  const gd = loadAuthUser(db, gdRow.id);
  assert(admin && gd, "种子用户加载失败");
  assert.equal(gd.orgIds[0], "ORG-440000");

  const sourcePath = path.join(process.cwd(), "samples", "2026-07_佣金总表_样例.xlsx");
  const correctPath = path.join(process.cwd(), "samples", "2026-07_广东_回传_正确.xlsx");
  const tamperedPath = path.join(process.cwd(), "samples", "2026-07_广东_回传_篡改.xlsx");
  for (const file of [sourcePath, correctPath, tamperedPath]) {
    assert(fs.existsSync(file), `缺少样例文件：${file}`);
  }

  const preview = await createStagingUpload(
    db,
    admin,
    path.basename(sourcePath),
    Readable.toWeb(fs.createReadStream(sourcePath)) as unknown as ReadableStream<Uint8Array>,
  );
  console.log("预览工作表：", preview.preview.sheets.map((sheet) => `${sheet.name}(${sheet.dataRows})`).join(", "));
  console.log("建议月份：", preview.suggestedMonth);
  assert.equal(preview.suggestedMonth, "2026-07");

  const created = createBatchFromStaging(db, admin, {
    uploadId: preview.uploadId,
    month: "2026-07",
    sheetName: preview.preview.suggestedSheet,
    note: "smoke test",
  });
  const stats = await processBatch(db, created.batchId, (progress) => {
    if (progress % 30 === 0) console.log("处理进度", progress);
  });
  console.log("批次统计：", stats);
  assert(stats.sourceRows > 500);
  assert(stats.validRows > 0);
  assert(stats.assignedRows > 0);
  assert(stats.orgUnmappedRows >= 2);
  assert(stats.negativeRows === 1);
  assert(stats.invalidIncomeRows >= 2);
  assert(Object.keys(stats.orgCounts).includes("ORG-440000"));
  assert(Object.keys(stats.orgCounts).includes("ORG-440300"));

  const batch = getBatchById(db, created.batchId);
  assert(batch);
  assert.equal(batch.status, "DRAFT");

  publishBatch(db, admin, created.batchId);
  const publishedBatch = getBatchById(db, created.batchId);
  assert(publishedBatch);
  assert.equal(publishedBatch.status, "PUBLISHED");

  const orgs = getBatchOrgs(db, created.batchId, admin);
  const gdOrg = orgs.find((org) => org.org_id === "ORG-440000");
  const szOrg = orgs.find((org) => org.org_id === "ORG-440300");
  assert(gdOrg && szOrg, "广东/深圳组织缺失");
  console.log("广东记录：", gdOrg.record_count, "深圳记录：", szOrg.record_count);

  const exportFile = await getOrCreateExportFile(db, admin, publishedBatch, "ORG-440000");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(exportFile.path);
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  assert.deepEqual(sheetNames, ["1新增人员信息导入", "2转非", "3劳动报酬收入", "4汇总"]);
  const laborSheet = workbook.getWorksheet("3劳动报酬收入");
  assert(laborSheet);
  assert.equal(laborSheet.getRow(1).cellCount, 13);
  const idCell = laborSheet.getRow(2).getCell(3);
  console.log("导出首条证件号：", idCell.value, "类型：", typeof idCell.value, "格式：", idCell.numFmt);
  assert.equal(typeof idCell.value, "string");
  console.log("四 Sheet 导出校验通过：", exportFile.fileName);

  const correctStream = Readable.toWeb(fs.createReadStream(correctPath)) as unknown as ReadableStream<Uint8Array>;
  const correct = await createReturnSubmission(db, gd, {
    batchId: created.batchId,
    orgId: "ORG-440000",
    fileName: path.basename(correctPath),
    stream: correctStream,
  });
  const correctResult = await processReturnSubmission(db, correct.submissionId);
  console.log("正确回传：", correctResult.passed, "差异", correctResult.diffs.length);
  assert.equal(correctResult.passed, true);
  assert.equal(correctResult.diffs.length, 0);

  const aggregations = listAggregations(db, "2026-07");
  const totals = aggregationTotals(aggregations);
  console.log("归集：", totals);
  assert.equal(totals.orgCount, 1);
  assert.equal(totals.recordCount, gdOrg.record_count);

  const tamperedStream = Readable.toWeb(fs.createReadStream(tamperedPath)) as unknown as ReadableStream<Uint8Array>;
  const tampered = await createReturnSubmission(db, gd, {
    batchId: created.batchId,
    orgId: "ORG-440000",
    fileName: path.basename(tamperedPath),
    stream: tamperedStream,
  });
  const tamperedResult = await processReturnSubmission(db, tampered.submissionId);
  console.log("篡改回传：", tamperedResult.passed, "差异", tamperedResult.diffs.length);
  assert.equal(tamperedResult.passed, false);
  assert(tamperedResult.diffs.length >= 2);
  const excluded = db
    .prepare("SELECT status FROM aggregations WHERE month = '2026-07' AND org_id = 'ORG-440000'")
    .get() as { status: string };
  assert.equal(excluded.status, "EXCLUDED");

  const finalStats = parseStats(getBatchById(db, created.batchId)!);
  console.log("最终统计：", finalStats);

  db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log("\n冒烟测试全部通过。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
