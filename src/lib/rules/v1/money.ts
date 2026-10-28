import { toHalfWidth } from "./text";

export type AmountStatus = "VALID" | "NEGATIVE" | "EMPTY" | "NON_NUMERIC";

export type ParsedAmount = {
  status: AmountStatus;
  cents: number | null;
  text: string;
};

function decimalToCents(text: string): number | null {
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;

  const sign = match[1] === "-" ? -1 : 1;
  const integerPart = BigInt(match[2]);
  const fraction = (match[3] ?? "").padEnd(3, "0");

  let cents = integerPart * 100n + BigInt(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) cents += 1n;

  const result = Number(cents) * sign;
  if (!Number.isSafeInteger(result)) return null;
  return result;
}

export function parseAmount(value: unknown): ParsedAmount {
  if (value === null || value === undefined) {
    return { status: "EMPTY", cents: null, text: "" };
  }

  const originalText = String(value).trim();
  if (!originalText) {
    return { status: "EMPTY", cents: null, text: "" };
  }

  let normalized = toHalfWidth(originalText)
    .replace(/[,\s，]/g, "")
    .trim();

  if (!normalized) {
    return { status: "EMPTY", cents: null, text: originalText };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { status: "NON_NUMERIC", cents: null, text: originalText };
    }
    if (!normalized.includes(".") && /e/i.test(normalized)) {
      const rounded = Math.round(value * 100);
      if (!Number.isSafeInteger(rounded)) {
        return { status: "NON_NUMERIC", cents: null, text: originalText };
      }
      return { status: rounded < 0 ? "NEGATIVE" : "VALID", cents: rounded, text: originalText };
    }
  }

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
    return { status: "NON_NUMERIC", cents: null, text: originalText };
  }

  normalized = normalized.replace(/^\+/, "");
  const cents = decimalToCents(normalized);
  if (cents === null) {
    return { status: "NON_NUMERIC", cents: null, text: originalText };
  }

  return {
    status: cents < 0 ? "NEGATIVE" : "VALID",
    cents,
    text: originalText,
  };
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function centsToYuan(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined) return null;
  return cents / 100;
}

export function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}
