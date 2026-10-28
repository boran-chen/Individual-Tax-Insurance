import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type Db } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { loadAuthUser, type AuthUser } from "@/lib/auth/session";
import { createStagingUpload } from "@/lib/services/upload-service";
import {
  createBatchFromStaging,
  getBatchById,
  getBatchForUser,
  getBatchOrgs,
  processBatch,
  publishBatch,
} from "@/lib/services/batch-service";
import {
  getOrCreateExportFile,
  recordExportDownload,
} from "@/lib/services/export-service";
import {
  createReturnSubmission,
  processReturnSubmission,
  listAggregations,
  aggregationTotals,
} from "@/lib/services/return-service";
import { getDatasetPage } from "@/lib/services/dataset-service";

const HEADERS = [
  "渠道机构所在省",
  "姓名",
  "证照类型",
  "证照号码",
  "入职月份",
  "应税所得",
  "保单号",
];

type Row = {
  province: string;
  name: string;
  idType: string;
  idNumber: string;
  entryMonth: string;
  income: string | number;
  policyNo: string;
};

const ROWS: Row[] = [
  { province: "广东省", name: "广东新增", idType: "居民身份证", idNumber: "440101199001010001", entryMonth: "2026-08", income: 100, policyNo: "P1" },
  { province: "广东省", name: "广东转非", idType: "居民身份证", idNumber: "440101199001010002", entryMonth: "2026-07", income: 0, policyNo: "P2" },
  { province: "广东省", name: "前导零证件", idType: "居民身份证", idNumber: "010101800101001", entryMonth: "2019-01", income: 123.45, policyNo: "P3" },
  { province: "广东深圳", name: "深圳专属", idType: "居民身份证", idNumber: "440301199001010004", entryMonth: "2020-01", income: 200, policyNo: "P4" },
  { province: "北京", name: "北京专属", idType: "居民身份证", idNumber: "110101199001010005", entryMonth: "2020-01", income: 300, policyNo: "P5" },
  { province: "火星", name: "未知省份", idType: "居民身份证", idNumber: "999999199001010006", entryMonth: "2020-01", income: 50, policyNo: "P6" },
  { province: "广东省", name: "负数", idType: "居民身份证", idNumber: "440101199001010007", entryMonth: "2020-01", income: -1, policyNo: "P7" },
  { province: "广东省", name: "空金额", idType: "居民身份证", idNumber: "440101199001010008", entryMonth: "2020-01", income: "", policyNo: "P8" },
  { province: "广东省", name: "无效月份", idType: "居民身份证", idNumber: "440101199001010009", entryMonth: "不详", income: 80, policyNo: "P9" },
  { province: "广东省", name: "缺证件", idType: "居民身份证", idNumber: "", entryMonth: "2020-01", income: 90, policyNo: "P10" },
];

let db: Db;
let tempRoot: string;
let admin: AuthUser;
let gd: AuthUser;
let sourcePath: string;
let batchId: string;

async function buildSourceWorkbook(filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("佣金总表");
  sheet.addRow(HEADERS);
  for (const row of ROWS) {
    sheet.addRow([
      row.province,
      row.name,
      row.idType,
      row.idNumber,
      row.entryMonth,
      row.income,
      row.policyNo,
    ]);
  }
  await workbook.xlsx.writeFile(filePath);
}

async function buildReturnWorkbook(filePath: string, tamper: boolean): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("3劳动报酬收入");
  sheet.addRow([
    "*姓名",
    "*证照类型",
    "*证照号码",
    "*所得项目",
    "收入",
    "扣除项目(免税收入)",
    "累计减除费用",
    "企业(职业)年金",
    "商业健康保险",
    "其他",
    "允许扣除的税费",
    "减除费用",
    "备注",
  ]);

  const laborRows = ROWS.filter(
    (row) =>
      row.province === "广东省" &&
      row.name &&
      row.idNumber &&
      typeof row.income === "number" &&
      row.income >= 0,
  ).map((row) => ({ ...row }));

  if (tamper) {
    laborRows[0].income = Number(laborRows[0].income) + 1;
    laborRows.pop();
  }

  for (const row of laborRows) {
    sheet.addRow([
      row.name,
      row.idType,
      row.idNumber,
      "保险营销员佣金收入",
      row.income,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }

  await workbook.xlsx.writeFile(filePath);
}

function streamOf(filePath: string): ReadableStream<Uint8Array> {
  return Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream<Uint8Array>;
}

beforeAll(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cbr-test-"));
  process.env.STORAGE_ROOT = path.join(tempRoot, "storage");
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  process.env.APP_ID_HASH_KEY = "test-id-hash-key";

  db = createDatabase(":memory:");
  await seedDatabase(db);

  const adminRow = db.prepare("SELECT id FROM users WHERE login = 'admin'").get() as { id: string };
  const gdRow = db.prepare("SELECT id FROM users WHERE login = 'gd_user'").get() as { id: string };
  admin = loadAuthUser(db, adminRow.id)!;
  gd = loadAuthUser(db, gdRow.id)!;

  sourcePath = path.join(tempRoot, "source.xlsx");
  await buildSourceWorkbook(sourcePath);

  const preview = await createStagingUpload(
    db,
    admin,
    "2026-07_佣金总表_测试.xlsx",
    streamOf(sourcePath),
  );
  expect(preview.suggestedMonth).toBe("2026-07");
  expect(preview.preview.sheets[0].missingRequired).toEqual([]);

  const created = createBatchFromStaging(db, admin, {
    uploadId: preview.uploadId,
    month: "2026-07",
    sheetName: preview.preview.suggestedSheet,
  });
  batchId = created.batchId;

  const stats = await processBatch(db, batchId);
  expect(stats.sourceRows).toBe(10);
  expect(stats.validRows).toBe(8);
  expect(stats.assignedRows).toBe(7);
  expect(stats.orgUnmappedRows).toBe(1);
  expect(stats.negativeRows).toBe(1);
  expect(stats.invalidIncomeRows).toBe(1);

  publishBatch(db, admin, batchId);
}, 60000);

afterAll(() => {
  db?.close();
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("批次、权限与导出 AC-06 / AC-08 / AC-09 / AC-10 / AC-14", () => {
  it("省负责人只能看到本人组织", () => {
    const provinceOrgs = getBatchOrgs(db, batchId, gd);
    expect(provinceOrgs.map((org) => org.org_id)).toEqual(["ORG-440000"]);

    expect(() =>
      getDatasetPage(db, gd, getBatchForUser(db, gd, batchId), "SUMMARY", {
        orgId: "ORG-440300",
      }),
    ).toThrow();
  });

  it("跨省导出被服务端拒绝", async () => {
    const batch = getBatchById(db, batchId)!;
    await expect(
      getOrCreateExportFile(db, gd, batch, "ORG-440300"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("四 Sheet 名称与顺序正确，内容仅包含当前组织", async () => {
    const batch = getBatchById(db, batchId)!;
    const exportFile = await getOrCreateExportFile(db, admin, batch, "ORG-440000");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exportFile.path);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "1新增人员信息导入",
      "2转非",
      "3劳动报酬收入",
      "4汇总",
    ]);

    const labor = workbook.getWorksheet("3劳动报酬收入")!;
    expect(labor.getRow(1).cellCount).toBe(13);

    const allText: string[] = [];
    workbook.worksheets.forEach((sheet) => {
      sheet.eachRow((row) => {
        row.eachCell((cell) => allText.push(String(cell.value ?? "")));
      });
    });
    expect(allText).not.toContain("深圳专属");
    expect(allText).not.toContain("北京专属");

    const leadingZeroRows: ExcelJS.Row[] = [];
    labor.eachRow((row) => {
      if (row.getCell(1).value === "前导零证件") leadingZeroRows.push(row);
    });
    expect(leadingZeroRows).toHaveLength(1);
    const idCell = leadingZeroRows[0].getCell(3);
    expect(idCell.value).toBe("010101800101001");
    expect(typeof idCell.value).toBe("string");
    expect(labor.getColumn(3).numFmt).toBe("@");
  });

  it("空组织导出仍包含四个 Sheet 和表头", async () => {
    const batch = getBatchById(db, batchId)!;
    const exportFile = await getOrCreateExportFile(db, admin, batch, "ORG-310000");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exportFile.path);
    expect(workbook.worksheets).toHaveLength(4);
    expect(workbook.getWorksheet("3劳动报酬收入")!.rowCount).toBe(1);
  });

  it("下载写审计日志", () => {
    const batch = getBatchById(db, batchId)!;
    recordExportDownload(db, admin, batch, "ORG-440000", {
      fileName: "test.xlsx",
      sha256: "abc",
    });
    const audit = db
      .prepare(
        "SELECT action, org_id FROM audit_logs WHERE action = 'DOWNLOAD_EXPORT' AND object_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(batchId) as { action: string; org_id: string } | undefined;
    expect(audit).toMatchObject({ action: "DOWNLOAD_EXPORT", org_id: "ORG-440000" });
  });
});

describe("回传比对与归集", () => {
  it("正确回传零差异通过并入归集", async () => {
    const returnPath = path.join(tempRoot, "return-ok.xlsx");
    await buildReturnWorkbook(returnPath, false);

    const submission = await createReturnSubmission(db, gd, {
      batchId,
      orgId: "ORG-440000",
      fileName: "正确回传.xlsx",
      stream: streamOf(returnPath),
    });
    const result = await processReturnSubmission(db, submission.submissionId);
    expect(result.passed).toBe(true);
    expect(result.diffs).toEqual([]);
    expect(result.totalSource).toBe(4);

    const totals = aggregationTotals(listAggregations(db, "2026-07"));
    expect(totals).toMatchObject({ orgCount: 1, recordCount: 4 });
  });

  it("篡改回传不通过并排除归集", async () => {
    const returnPath = path.join(tempRoot, "return-bad.xlsx");
    await buildReturnWorkbook(returnPath, true);

    const submission = await createReturnSubmission(db, gd, {
      batchId,
      orgId: "ORG-440000",
      fileName: "篡改回传.xlsx",
      stream: streamOf(returnPath),
    });
    const result = await processReturnSubmission(db, submission.submissionId);
    expect(result.passed).toBe(false);
    expect(result.diffs.map((diff) => diff.type)).toEqual(
      expect.arrayContaining(["AMOUNT_MISMATCH", "MISSING_IN_RETURN"]),
    );

    const aggregation = db
      .prepare("SELECT status FROM aggregations WHERE month = '2026-07' AND org_id = 'ORG-440000'")
      .get() as { status: string };
    expect(aggregation.status).toBe("EXCLUDED");
  });
});

describe("同月重传 AC-12", () => {
  it("形成新版本并替代旧发布批次，旧批次保留", async () => {
    const preview = await createStagingUpload(
      db,
      admin,
      "2026-07_佣金总表_测试_V2.xlsx",
      streamOf(sourcePath),
    );
    const created = createBatchFromStaging(db, admin, {
      uploadId: preview.uploadId,
      month: "2026-07",
      sheetName: preview.preview.suggestedSheet,
    });
    expect(getBatchById(db, created.batchId)!.version).toBe(2);

    await processBatch(db, created.batchId);
    publishBatch(db, admin, created.batchId);

    expect(getBatchById(db, created.batchId)!.status).toBe("PUBLISHED");
    expect(getBatchById(db, batchId)!.status).toBe("SUPERSEDED");
    expect(getBatchById(db, batchId)!.replaced_by).toBe(created.batchId);
  }, 60000);
});
