import ExcelJS from "exceljs";

export type CellValue = string | number | boolean | Date | null | undefined;

export type SheetData = {
  name: string;
  headers: string[];
  rows: CellValue[][];
  textColumns?: number[];
  widths?: number[];
};

export function escapeFormulaText(value: string): string {
  if (/^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

function normalizeCell(value: CellValue): CellValue {
  if (typeof value === "string") return escapeFormulaText(value);
  return value;
}

function defaultWidth(header: string): number {
  const length = [...header].length;
  return Math.min(36, Math.max(10, length * 2 + 4));
}

export async function writeWorkbook(filePath: string, sheets: SheetData[]): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useStyles: true,
    useSharedStrings: false,
  });

  for (const data of sheets) {
    const worksheet = workbook.addWorksheet(data.name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    worksheet.columns = data.headers.map((header, index) => ({
      header: header || `列${index + 1}`,
      key: `c${index}`,
      width: data.widths?.[index] ?? defaultWidth(header || `列${index + 1}`),
    }));

    for (const columnIndex of data.textColumns ?? []) {
      worksheet.getColumn(columnIndex + 1).numFmt = "@";
    }

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FF0F172A" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 22;

    if (data.headers.length > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: data.headers.length },
      };
    }

    for (const values of data.rows) {
      const row = worksheet.addRow(values.map((value) => normalizeCell(value)));
      row.commit();
    }

    await worksheet.commit();
  }

  await workbook.commit();
}

export function fitRows(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  mapValue?: (header: string, value: unknown) => CellValue,
): CellValue[][] {
  return rows.map((row) =>
    headers.map((header) => {
      const value = row[header];
      if (mapValue) return mapValue(header, value);
      if (value === null || value === undefined) return null;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return value;
      }
      if (value instanceof Date) return value;
      return String(value);
    }),
  );
}
