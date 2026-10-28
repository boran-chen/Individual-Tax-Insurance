import { normalizeHeader } from "./fields";

export type ReturnTemplate = {
  version: string;
  sheetNames: string[];
  headerRow: number | null;
  columns: {
    name: string[];
    idType: string[];
    idNumber: string[];
    income: string[];
  };
  toleranceCents: number;
};

export const DEFAULT_RETURN_TEMPLATE: ReturnTemplate = {
  version: "return-template-v1",
  sheetNames: ["3劳动报酬收入", "劳动报酬收入", "申报结果", "申报明细"],
  headerRow: null,
  columns: {
    name: ["姓名", "代理人姓名", "人员姓名"],
    idType: ["证照类型", "证件类型", "证件种类"],
    idNumber: ["证照号码", "证件号码", "身份证号", "身份证号码", "证件号"],
    income: ["收入", "收入额", "应税所得", "本期收入", "收入金额"],
  },
  toleranceCents: 0,
};

export type ReturnColumnKey = "name" | "idType" | "idNumber" | "income";

export type ReturnMappingResult = {
  mapping: Partial<Record<ReturnColumnKey, number>>;
  headers: Partial<Record<ReturnColumnKey, string>>;
  missing: ReturnColumnKey[];
  duplicated: string[];
};

export function resolveReturnMapping(
  rawHeaders: string[],
  template: ReturnTemplate = DEFAULT_RETURN_TEMPLATE,
): ReturnMappingResult {
  const mapping: Partial<Record<ReturnColumnKey, number>> = {};
  const headers: Partial<Record<ReturnColumnKey, string>> = {};
  const duplicated: string[] = [];
  const seen = new Set<string>();

  for (const header of rawHeaders) {
    const normalized = normalizeHeader(header);
    if (!normalized) continue;
    if (seen.has(normalized)) duplicated.push(String(header));
    seen.add(normalized);
  }

  (Object.keys(template.columns) as ReturnColumnKey[]).forEach((key) => {
    const aliases = template.columns[key].map(normalizeHeader);
    const index = rawHeaders.findIndex((header) => aliases.includes(normalizeHeader(header)));
    if (index >= 0) {
      mapping[key] = index;
      headers[key] = String(rawHeaders[index]);
    }
  });

  const required: ReturnColumnKey[] = ["name", "idNumber", "income"];
  const missing = required.filter((key) => mapping[key] === undefined);

  return { mapping, headers, missing, duplicated };
}
