import { toHalfWidth } from "./text";

function buildMonth(year: number, month: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function fromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const utcMillis = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const date = new Date(utcMillis);
  return buildMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

export function parseEntryMonth(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return buildMonth(value.getFullYear(), value.getMonth() + 1);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (Number.isInteger(value) && value >= 190001 && value <= 210012) {
      const year = Math.floor(value / 100);
      const month = value % 100;
      return buildMonth(year, month);
    }
    return fromExcelSerial(value);
  }

  const text = toHalfWidth(String(value)).trim();
  if (!text) return null;

  const separated = text.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})(?:\s*[-/.月].*)?$/);
  if (separated) return buildMonth(Number(separated[1]), Number(separated[2]));

  const compact = text.match(/^(\d{4})(\d{2})$/);
  if (compact) return buildMonth(Number(compact[1]), Number(compact[2]));

  if (/^\d{5}$/.test(text)) {
    return fromExcelSerial(Number(text));
  }

  return null;
}
