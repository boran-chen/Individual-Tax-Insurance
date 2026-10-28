export function toHalfWidth(input: string): string {
  return String(input ?? "")
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

export function normalizeText(input: unknown): string {
  return toHalfWidth(String(input ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeName(input: unknown): string {
  return toHalfWidth(String(input ?? ""))
    .replace(/\s+/g, "")
    .trim();
}

export function normalizeCertNo(input: unknown): string {
  return toHalfWidth(String(input ?? ""))
    .replace(/\s+/g, "")
    .toUpperCase()
    .trim();
}

export function maskCertNo(certNo: string): string {
  const value = normalizeCertNo(certNo);
  if (!value) return "";
  if (value.length >= 8) {
    return `${value.slice(0, 3)}${"*".repeat(value.length - 7)}${value.slice(-4)}`;
  }
  if (value.length >= 4) {
    return `${value.slice(0, 1)}${"*".repeat(value.length - 2)}${value.slice(-1)}`;
  }
  return "*".repeat(value.length);
}

export function normalizeOrgText(input: unknown): string {
  return toHalfWidth(String(input ?? ""))
    .replace(/\s+/g, "")
    .trim();
}

export function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value);
}
