import { toHalfWidth } from "./text";

export function parseMonth(value: unknown): string | null {
  const text = toHalfWidth(String(value ?? "")).trim();
  if (!text) return null;

  let year: number | null = null;
  let month: number | null = null;

  let match = text.match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月].*)?$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
  }

  if (year === null) {
    match = text.match(/^(\d{4})(\d{2})$/);
    if (match) {
      year = Number(match[1]);
      month = Number(match[2]);
    }
  }

  if (year === null || month === null) return null;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;

  return `${year}-${String(month).padStart(2, "0")}`;
}

export function isValidMonth(value: unknown): boolean {
  return parseMonth(value) !== null;
}

export function nextMonth(month: string): string {
  const parsed = parseMonth(month);
  if (!parsed) throw new Error(`无效月份：${month}`);
  const [year, monthNumber] = parsed.split("-").map(Number);
  if (monthNumber === 12) return `${year + 1}-01`;
  return `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const parsed = parseMonth(month);
  if (!parsed) return month;
  const [year, monthNumber] = parsed.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

export function suggestMonthFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, "");
  const candidates: string[] = [];

  const cn = base.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
  if (cn) candidates.push(`${cn[1]}-${cn[2]}`);

  const separated = base.match(/(20\d{2})[-_./](\d{1,2})(?!\d)/);
  if (separated) candidates.push(`${separated[1]}-${separated[2]}`);

  const compact = base.match(/(20\d{2})(\d{2})(?!\d)/);
  if (compact) candidates.push(`${compact[1]}-${compact[2]}`);

  for (const candidate of candidates) {
    const parsed = parseMonth(candidate);
    if (parsed) return parsed;
  }
  return null;
}
