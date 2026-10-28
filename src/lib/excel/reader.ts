import ExcelJS from "exceljs";
import {
  resolveFieldMapping,
  type FieldKey,
  type FieldMappingResult,
} from "../config/fields";
import {
  resolveReturnMapping,
  type ReturnMappingResult,
  type ReturnTemplate,
} from "../config/return-template";
import type { RawCellValue, RawRow } from "../rules/types";
import { parseEntryMonth } from "../rules/v1/entry-month";
import { parseAmount } from "../rules/v1/money";
import { normalizeCertNo } from "../rules/v1/text";

export class ExcelParseError extends Error {
  details?: string[];

  constructor(message: string, details?: string[]) {
    super(message);
    this.name = "ExcelParseError";
    this.details = details;
  }
}

export type SheetPreview = {
  name: string;
  rowCount: number;
  dataRows: number;
  headerRow: number | null;
  headers: string[];
  sampleRows: string[][];
  mapping: Partial<Record<FieldKey, number>>;
  headersByField: Partial<Record<FieldKey, string>>;
  matchedFields: FieldKey[];
  missingRequired: FieldKey[];
  duplicatedHeaders: string[];
  conflictingFields: FieldKey[];
};

export type WorkbookPreview = {
  sheets: SheetPreview[];
  suggestedSheet: string | null;
};

export type SourceReadOptions = {
  sheetName?: string;
  headerRow?: number | null;
  headers?: string[];
  customAliases?: Partial<Record<FieldKey, string[]>>;
  mapping?: Partial<Record<FieldKey, number>>;
};

export type SourceCellRecord = {
  rowNumber: number;
  raw: RawRow;
  province: string;
  taxableIncomeRaw: RawCellValue;
  entryMonthRaw: RawCellValue;
  name: string;
  idType: string;
  idNumber: string;
  businessKey: string;
  formulaMissing: string[];
};

export type SourceWorkbookResult = {
  sheetName: string;
  headerRow: number;
  headers: string[];
  records: SourceCellRecord[];
};

export type ReturnRow = {
  rowNumber: number;
  raw: RawRow;
  name: string;
  idType: string;
  idNumber: string;
  incomeRaw: RawCellValue;
};

export type ReturnWorkbookResult = {
  sheetName: string;
  headerRow: number;
  headers: string[];
  mapping: ReturnMappingResult;
  rows: ReturnRow[];
};

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function primitiveText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDateOnly(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("richText" in record) {
      const rich = record.richText as Array<{ text?: string }>;
      return rich.map((item) => item.text ?? "").join("");
    }
    if ("text" in record) return String(record.text ?? "");
    if ("result" in record) return primitiveText(record.result);
    if ("error" in record) return String(record.error ?? "");
  }
  return String(value);
}

function cellDisplayText(cell: ExcelJS.Cell): string {
  const value = cell.value as unknown;
  if (value === null || value === undefined) return "";

  if (value instanceof Date) return formatDateOnly(value);

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("formula" in record || "sharedFormula" in record) {
      return primitiveText(record.result);
    }
    if ("richText" in record) return primitiveText(value);
    if ("text" in record) return String(record.text ?? "");
    if ("error" in record) return String(record.error ?? "");
    return primitiveText(value);
  }

  if (typeof value === "number") {
    if (Number.isInteger(value) && Math.abs(value) >= 1e15) {
      return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 });
    }
    return String(value);
  }

  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function rawCellValue(cell: ExcelJS.Cell): RawCellValue {
  const value = cell.value as unknown;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return formatDateOnly(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("formula" in record || "sharedFormula" in record) {
      return rawPrimitive(record.result);
    }
    if ("richText" in record) return primitiveText(value);
    if ("text" in record) return String(record.text ?? "");
    if ("error" in record) return cell.text ?? "";
    return primitiveText(value);
  }
  return rawPrimitive(value);
}

function rawPrimitive(value: unknown): RawCellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return formatDateOnly(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return primitiveText(value);
}

function hasFormulaWithoutResult(cell: ExcelJS.Cell): boolean {
  const value = cell.value as unknown;
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const isFormula = "formula" in record || "sharedFormula" in record;
  return isFormula && (record.result === null || record.result === undefined);
}

function rowTexts(row: ExcelJS.Row, width?: number): string[] {
  const values = (row.values ?? []) as unknown[];
  const max = Math.max(width ?? 0, row.cellCount ?? 0, values.length - 1);
  const texts: string[] = [];
  for (let index = 1; index <= max; index += 1) {
    texts.push(cellDisplayText(row.getCell(index)));
  }
  return texts;
}

function trimTrailingEmpty(values: string[]): string[] {
  const copy = [...values];
  while (copy.length && !String(copy[copy.length - 1]).trim()) copy.pop();
  return copy;
}

function isBlank(texts: string[]): boolean {
  return texts.every((text) => !String(text).trim());
}

function headerScore(mapping: FieldMappingResult): number {
  const matched = Object.keys(mapping.mapping).length;
  return matched * 10 - mapping.missingRequired.length * 100 - mapping.conflictingFields.length * 50;
}

function sheetPreviewFrom(
  name: string,
  rowCount: number,
  dataRows: number,
  headerRow: number | null,
  headers: string[],
  sampleRows: string[][],
  customAliases?: Partial<Record<FieldKey, string[]>>,
): SheetPreview {
  const effectiveHeaders = headers.length ? headers : [];
  const mapping = resolveFieldMapping(effectiveHeaders, customAliases);
  return {
    name,
    rowCount,
    dataRows,
    headerRow,
    headers: effectiveHeaders,
    sampleRows,
    mapping: mapping.mapping,
    headersByField: mapping.headers,
    matchedFields: Object.keys(mapping.mapping) as FieldKey[],
    missingRequired: mapping.missingRequired,
    duplicatedHeaders: mapping.duplicatedHeaders,
    conflictingFields: mapping.conflictingFields,
  };
}

export async function inspectWorkbook(
  filePath: string,
  customAliases?: Partial<Record<FieldKey, string[]>>,
  maxScanRows = 60,
  rowLimit = 200000,
): Promise<WorkbookPreview> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "cache",
    hyperlinks: "ignore",
  });

  const sheets: SheetPreview[] = [];

  for await (const sheet of reader) {
    const worksheet = sheet as unknown as {
      name?: string;
      [Symbol.asyncIterator](): AsyncIterator<ExcelJS.Row>;
    };
    const name = worksheet.name ?? `Sheet${sheets.length + 1}`;

    let headerRow: number | null = null;
    let headers: string[] = [];
    let firstRowHeaders: string[] = [];
    let rowCount = 0;
    let dataRows = 0;
    const sampleRows: string[][] = [];
    let bestHeaderScore = Number.NEGATIVE_INFINITY;

    for await (const row of worksheet) {
      const texts = rowTexts(row);
      if (isBlank(texts)) continue;
      rowCount += 1;
      if (headerRow === null && rowCount > rowLimit) {
        throw new ExcelParseError(`数据行数超过限制（${rowLimit} 行）`);
      }

      if (headerRow === null) {
        if (row.number <= maxScanRows) {
          const trimmed = trimTrailingEmpty(texts);
          if (!firstRowHeaders.length) firstRowHeaders = trimmed;
          if (trimmed.length >= 3) {
            const mapping = resolveFieldMapping(trimmed, customAliases);
            const score = headerScore(mapping);
            if (mapping.missingRequired.length === 0 && score > bestHeaderScore) {
              bestHeaderScore = score;
              headerRow = row.number;
              headers = trimmed;
            }
          }
        }
        continue;
      }

      dataRows += 1;
      if (dataRows > rowLimit) {
        throw new ExcelParseError(`数据行数超过限制（${rowLimit} 行）`);
      }
      if (sampleRows.length < 5) sampleRows.push(texts);
    }

    if (headerRow === null && firstRowHeaders.length) {
      headers = firstRowHeaders;
    }

    sheets.push(
      sheetPreviewFrom(
        name,
        rowCount,
        dataRows,
        headerRow,
        headers,
        sampleRows,
        customAliases,
      ),
    );
  }

  const valid = sheets
    .filter((sheet) => sheet.headerRow !== null && sheet.missingRequired.length === 0)
    .sort((a, b) => b.matchedFields.length - a.matchedFields.length);
  const fallback = sheets
    .filter((sheet) => sheet.headerRow !== null)
    .sort((a, b) => b.matchedFields.length - a.matchedFields.length);

  return {
    sheets,
    suggestedSheet: valid[0]?.name ?? fallback[0]?.name ?? sheets[0]?.name ?? null,
  };
}

export async function readSourceWorkbook(
  filePath: string,
  options: SourceReadOptions = {},
): Promise<SourceWorkbookResult> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "cache",
    hyperlinks: "ignore",
  });

  let selected: {
    sheetName: string;
    headerRow: number;
    headers: string[];
    mapping: { mapping: Partial<Record<FieldKey, number>> };
  } | null = null;
  const records: SourceCellRecord[] = [];

  for await (const sheet of reader) {
    const worksheet = sheet as unknown as {
      name?: string;
      [Symbol.asyncIterator](): AsyncIterator<ExcelJS.Row>;
    };
    const name = worksheet.name ?? "Sheet1";

    if (options.sheetName && name !== options.sheetName) {
      continue;
    }

    let headerRow = options.headerRow ?? null;
    let headers = options.headers ?? [];
    let mapping: { mapping: Partial<Record<FieldKey, number>> } | null =
      options.mapping && Object.keys(options.mapping).length
        ? { mapping: options.mapping }
        : null;

    for await (const row of worksheet) {
      if (headerRow === null) {
        if (row.number > 60) break;
        const texts = trimTrailingEmpty(rowTexts(row));
        if (texts.length < 3) continue;
        const candidate = resolveFieldMapping(texts, options.customAliases);
        if (candidate.missingRequired.length === 0) {
          headerRow = row.number;
          headers = texts;
          mapping = candidate;
          selected = { sheetName: name, headerRow, headers, mapping };
        }
        continue;
      }

      if (row.number === headerRow) {
        if (!headers.length) {
          headers = trimTrailingEmpty(rowTexts(row, headers.length));
        }
        if (!mapping) {
          mapping = resolveFieldMapping(headers, options.customAliases);
        }
        selected = { sheetName: name, headerRow, headers, mapping };
        continue;
      }

      if (row.number <= headerRow) continue;
      if (!mapping) continue;

      const rawTexts = rowTexts(row, headers.length);
      if (isBlank(rawTexts)) continue;

      const raw: RawRow = {};
      const formulaMissing: string[] = [];
      for (let index = 0; index < headers.length; index += 1) {
        const header = headers[index] || `列${index + 1}`;
        const cell = row.getCell(index + 1);
        let rawKey = header;
        let suffix = 2;
        while (Object.prototype.hasOwnProperty.call(raw, rawKey)) {
          rawKey = `${header} (${suffix})`;
          suffix += 1;
        }
        raw[rawKey] = rawCellValue(cell);
        if (hasFormulaWithoutResult(cell)) {
          formulaMissing.push(header);
        }
      }

      const getText = (field: FieldKey): string => {
        const index = mapping?.mapping[field];
        if (index === undefined) return "";
        return cellDisplayText(row.getCell(index + 1)).trim();
      };

      const getRaw = (field: FieldKey): RawCellValue => {
        const index = mapping?.mapping[field];
        if (index === undefined) return null;
        return rawCellValue(row.getCell(index + 1));
      };

      records.push({
        rowNumber: row.number,
        raw,
        province: getText("province"),
        taxableIncomeRaw: getRaw("taxableIncome"),
        entryMonthRaw: getRaw("entryMonth"),
        name: getText("name"),
        idType: getText("idType"),
        idNumber: getText("idNumber"),
        businessKey: getText("businessKey"),
        formulaMissing,
      });
    }

    if (selected) break;
    if (options.sheetName && name === options.sheetName && !selected) {
      break;
    }
  }

  if (!selected) {
    throw new ExcelParseError("未找到可识别的数据表头，请检查字段别名或表头行配置");
  }

  return {
    sheetName: selected.sheetName,
    headerRow: selected.headerRow,
    headers: selected.headers,
    records,
  };
}

function findHeaderInWorksheet(
  worksheet: ExcelJS.Worksheet,
  template: ReturnTemplate,
  maxScanRows = 60,
): { headerRow: number; headers: string[]; mapping: ReturnMappingResult } | null {
  const rowCount = Math.min(worksheet.rowCount, maxScanRows);
  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const texts = trimTrailingEmpty(rowTexts(row, worksheet.columnCount));
    if (texts.length < 2) continue;
    const mapping = resolveReturnMapping(texts, template);
    if (mapping.missing.length === 0) {
      return { headerRow: rowNumber, headers: texts, mapping };
    }
  }
  return null;
}

export async function readReturnWorkbook(
  filePath: string,
  template: ReturnTemplate,
): Promise<ReturnWorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const preferredNames = template.sheetNames.map((name) => name.trim());
  let selected:
    | { worksheet: ExcelJS.Worksheet; header: NonNullable<ReturnType<typeof findHeaderInWorksheet>> }
    | null = null;

  for (const name of preferredNames) {
    const worksheet = workbook.worksheets.find((item) => item.name.trim() === name);
    if (!worksheet) continue;
    const header = findHeaderInWorksheet(worksheet, template);
    if (header) {
      selected = { worksheet, header };
      break;
    }
  }

  if (!selected) {
    for (const worksheet of workbook.worksheets) {
      const header = findHeaderInWorksheet(worksheet, template);
      if (header) {
        selected = { worksheet, header };
        break;
      }
    }
  }

  if (!selected) {
    throw new ExcelParseError(
      "回传文件缺少可识别的表头，需要包含姓名、证照号码、收入等列",
      template.sheetNames,
    );
  }

  const { worksheet, header } = selected;
  const rows: ReturnRow[] = [];

  for (let rowNumber = header.headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rawTexts = rowTexts(row, header.headers.length);
    if (isBlank(rawTexts)) continue;

    const raw: RawRow = {};
    for (let index = 0; index < header.headers.length; index += 1) {
      const key = header.headers[index] || `列${index + 1}`;
      raw[key] = rawCellValue(row.getCell(index + 1));
    }

    const getText = (key: keyof ReturnMappingResult["mapping"]): string => {
      const index = header.mapping.mapping[key];
      if (index === undefined) return "";
      return cellDisplayText(row.getCell(index + 1)).trim();
    };
    const getRaw = (key: keyof ReturnMappingResult["mapping"]): RawCellValue => {
      const index = header.mapping.mapping[key];
      if (index === undefined) return null;
      return rawCellValue(row.getCell(index + 1));
    };

    rows.push({
      rowNumber,
      raw,
      name: getText("name"),
      idType: getText("idType"),
      idNumber: normalizeCertNo(getText("idNumber")),
      incomeRaw: getRaw("income"),
    });
  }

  return {
    sheetName: worksheet.name,
    headerRow: header.headerRow,
    headers: header.headers,
    mapping: header.mapping,
    rows,
  };
}

export function parseSourceIncome(value: RawCellValue) {
  return parseAmount(value);
}

export function parseSourceEntryMonth(value: RawCellValue) {
  return parseEntryMonth(value);
}
