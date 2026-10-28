import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { ORGANIZATIONS, GUANGDONG_ORG_CODE } from "../src/lib/config/organizations";
import { resolveOrganization, type OrgMappingTable } from "../src/lib/rules/v1/org-map";
import { normalizeOrgText } from "../src/lib/rules/v1/text";
import { parseAmount } from "../src/lib/rules/v1/money";
import { buildLaborIncomeRowValues, LABOR_INCOME_COLUMNS } from "../src/lib/rules/v1/datasets";

const MONTH = "2026-07";
const NEXT_MONTH = "2026-08";
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

type SampleRow = {
  province: string;
  name: string;
  idType: string;
  idNumber: string;
  entryMonth: string;
  income: string | number;
  commission: number;
  policyNo: string;
  phone: string;
  note: string;
};

let seed = 20260701;
function random(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick<T>(values: T[]): T {
  return values[Math.floor(random() * values.length)];
}
function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

const PROVINCES = ["北京", "江苏", "浙江", "上海", "四川", "山东", "湖北", "广东省"];
const SURNAMES = ["张", "王", "李", "赵", "陈", "刘", "杨", "黄", "周", "吴", "徐", "孙", "马", "朱", "胡"];
const GIVEN = ["伟", "芳", "娜", "敏", "静", "强", "磊", "洋", "勇", "艳", "杰", "娟", "涛", "明", "超"];

function makeId(index: number): string {
  const area = pick(["110101", "320102", "330106", "440305", "510107", "370102", "420106", "310101"]);
  return `${area}19900101${pad(1000 + index, 4)}`;
}

function buildRows(): SampleRow[] {
  const rows: SampleRow[] = [];

  for (let index = 0; index < 520; index += 1) {
    const isShenzhen = random() < 0.14;
    const province = isShenzhen
      ? pick(["深圳", "深圳市", "广东深圳", "广东省深圳市"])
      : pick(PROVINCES);

    let entryMonth = "2020-01";
    const roll = random();
    if (roll < 0.06) entryMonth = NEXT_MONTH;
    else if (roll < 0.11) entryMonth = MONTH;

    const income = Math.round((100 + random() * 9800) * 100) / 100;

    rows.push({
      province,
      name: `${pick(SURNAMES)}${pick(GIVEN)}${random() < 0.3 ? pick(GIVEN) : ""}`,
      idType: "居民身份证",
      idNumber: makeId(index),
      entryMonth,
      income,
      commission: income,
      policyNo: `POL202607${pad(index, 5)}`,
      phone: `13${pad(Math.floor(random() * 100000000), 8)}`,
      note: "",
    });
  }

  // 边界样例
  rows.push({
    province: "广东省",
    name: "零收入",
    idType: "居民身份证",
    idNumber: makeId(9001),
    entryMonth: MONTH,
    income: 0,
    commission: 0,
    policyNo: "EDGE-0001",
    phone: "13800000001",
    note: "0 应视为有效",
  });
  rows.push({
    province: "广东省",
    name: "负数测试",
    idType: "居民身份证",
    idNumber: makeId(9002),
    entryMonth: MONTH,
    income: -1,
    commission: -1,
    policyNo: "EDGE-0002",
    phone: "13800000002",
    note: "负数排除",
  });
  rows.push({
    province: "江苏省",
    name: "空金额",
    idType: "居民身份证",
    idNumber: makeId(9003),
    entryMonth: MONTH,
    income: "",
    commission: 0,
    policyNo: "EDGE-0003",
    phone: "13800000003",
    note: "空金额进异常",
  });
  rows.push({
    province: "浙江省",
    name: "文本金额",
    idType: "居民身份证",
    idNumber: makeId(9004),
    entryMonth: MONTH,
    income: "待确认",
    commission: 0,
    policyNo: "EDGE-0004",
    phone: "13800000004",
    note: "文本金额进异常",
  });
  rows.push({
    province: "",
    name: "空省份",
    idType: "居民身份证",
    idNumber: makeId(9005),
    entryMonth: MONTH,
    income: 500,
    commission: 500,
    policyNo: "EDGE-0005",
    phone: "13800000005",
    note: "组织归属异常",
  });
  rows.push({
    province: "火星",
    name: "未知省份",
    idType: "居民身份证",
    idNumber: makeId(9006),
    entryMonth: MONTH,
    income: 600,
    commission: 600,
    policyNo: "EDGE-0006",
    phone: "13800000006",
    note: "组织归属异常",
  });
  rows.push({
    province: "北京市",
    name: "缺证件号",
    idType: "居民身份证",
    idNumber: "",
    entryMonth: MONTH,
    income: 700,
    commission: 700,
    policyNo: "EDGE-0007",
    phone: "13800000007",
    note: "身份字段缺失",
  });
  rows.push({
    province: "上海市",
    name: "入职月份异常",
    idType: "居民身份证",
    idNumber: makeId(9008),
    entryMonth: "不详",
    income: 800,
    commission: 800,
    policyNo: "EDGE-0008",
    phone: "13800000008",
    note: "入职月份无法识别",
  });
  rows.push({
    province: "山东省",
    name: "前导零证件",
    idType: "居民身份证",
    idNumber: "010101800101001",
    entryMonth: "2019-05",
    income: 900,
    commission: 900,
    policyNo: "EDGE-0009",
    phone: "13800000009",
    note: "15 位老身份证，需保持文本",
  });
  rows.push({
    province: "　广东省　",
    name: "全角空格省",
    idType: "居民身份证",
    idNumber: makeId(9010),
    entryMonth: "2018-03",
    income: 1000,
    commission: 1000,
    policyNo: "EDGE-0010",
    phone: "13800000010",
    note: "省份前后全角空格",
  });

  // 重复记录
  const duplicate = { ...rows[10], note: "疑似重复" };
  rows.push(duplicate);
  rows.push({ ...duplicate, policyNo: "DUP-0001", note: "疑似重复 2" });

  return rows;
}

function mappingTable(): OrgMappingTable {
  const map: OrgMappingTable = new Map();
  for (const org of ORGANIZATIONS) {
    for (const value of [org.name, org.shortName, ...org.aliases, `${org.shortName}分公司`]) {
      map.set(normalizeOrgText(value), `ORG-${org.code}`);
    }
  }
  return map;
}

async function writeSource(rows: SampleRow[], filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("佣金总表");
  sheet.addRow(HEADERS);
  for (const row of rows) {
    sheet.addRow([
      row.province,
      row.name,
      row.idType,
      row.idNumber,
      row.entryMonth,
      row.income,
      row.commission,
      row.policyNo,
      row.phone,
      row.note,
    ]);
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FF0F172A" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns = HEADERS.map((header) => ({ width: Math.max(12, header.length * 2 + 4) }));
  // 一个公式单元格，验证读取缓存结果
  const formulaRow = sheet.addRow([
    "北京市",
    "公式金额",
    "居民身份证",
    makeId(9999),
    "2017-06",
    { formula: "100+788.88", result: 888.88 },
    888.88,
    "FORMULA-0001",
    "13800009999",
    "公式单元格",
  ]);
  formulaRow.getCell(6).numFmt = "0.00";
  await workbook.xlsx.writeFile(filePath);
}

function guangdongLaborRows(rows: SampleRow[], map: OrgMappingTable) {
  return rows.filter((row) => {
    const org = resolveOrganization(row.province, map);
    if (org.status !== "ASSIGNED" || org.orgId !== `ORG-${GUANGDONG_ORG_CODE}`) return false;
    if (!row.name || !row.idType || !row.idNumber) return false;
    const amount = parseAmount(row.income);
    return amount.status === "VALID" && amount.cents !== null;
  });
}

async function writeReturn(
  rows: SampleRow[],
  map: OrgMappingTable,
  filePath: string,
  tamper: boolean,
): Promise<number> {
  const labor = guangdongLaborRows(rows, map);
  if (tamper && labor.length) {
    labor[0] = { ...labor[0], income: Number(labor[0].income) + 10 };
    labor.pop();
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("3劳动报酬收入");
  sheet.addRow([...LABOR_INCOME_COLUMNS]);
  for (const row of labor) {
    const amount = parseAmount(row.income);
    sheet.addRow(
      buildLaborIncomeRowValues(
        row.name,
        row.idType,
        row.idNumber,
        amount.cents,
      ) as ExcelJS.CellValue[],
    );
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns = LABOR_INCOME_COLUMNS.map((header) => ({
    width: Math.max(12, header.length * 2 + 4),
  }));
  await workbook.xlsx.writeFile(filePath);
  return labor.length;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const sampleDir = path.join(root, "samples");
  fs.mkdirSync(sampleDir, { recursive: true });

  const rows = buildRows();
  const map = mappingTable();

  const sourcePath = path.join(sampleDir, `${MONTH}_佣金总表_样例.xlsx`);
  await writeSource(rows, sourcePath);

  const correctPath = path.join(sampleDir, `${MONTH}_广东_回传_正确.xlsx`);
  const tamperedPath = path.join(sampleDir, `${MONTH}_广东_回传_篡改.xlsx`);
  const correctCount = await writeReturn(rows, map, correctPath, false);
  const tamperedCount = await writeReturn(rows, map, tamperedPath, true);

  console.log("已生成样例文件：");
  console.log(`- ${sourcePath}（源表 ${rows.length + 1} 行数据）`);
  console.log(`- ${correctPath}（广东劳动报酬 ${correctCount} 条，应通过）`);
  console.log(`- ${tamperedPath}（广东劳动报酬 ${tamperedCount} 条，含 1 条金额差异 + 1 条缺失，应不通过）`);
  console.log(`提示：上传源表时佣金月份填 ${MONTH}。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
