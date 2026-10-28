export const FIELD_KEYS = [
  "province",
  "taxableIncome",
  "entryMonth",
  "name",
  "idType",
  "idNumber",
  "businessKey",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export type FieldDef = {
  key: FieldKey;
  label: string;
  aliases: string[];
  required: boolean;
};

export const FIELD_DEFS: FieldDef[] = [
  {
    key: "province",
    label: "渠道机构所在省",
    aliases: ["渠道机构所在省", "所在省", "省份", "渠道所在省", "机构所在省", "渠道机构省份"],
    required: true,
  },
  {
    key: "taxableIncome",
    label: "应税所得",
    aliases: ["应税所得", "应税收入", "佣金应税所得", "应税所得额", "本期应税所得"],
    required: true,
  },
  {
    key: "entryMonth",
    label: "入职月份",
    aliases: ["入职月份", "入司月份", "入职时间", "入司时间", "入职年月"],
    required: true,
  },
  {
    key: "name",
    label: "姓名",
    aliases: ["姓名", "代理人姓名", "营销员姓名", "人员姓名"],
    required: true,
  },
  {
    key: "idType",
    label: "证照类型",
    aliases: ["证照类型", "证件类型", "证件种类", "证件类别"],
    required: true,
  },
  {
    key: "idNumber",
    label: "证照号码",
    aliases: ["证照号码", "证件号码", "身份证号", "身份证号码", "证件号", "证照号"],
    required: true,
  },
  {
    key: "businessKey",
    label: "业务唯一键",
    aliases: ["业务唯一键", "业务编号", "保单号", "佣金流水号", "业务流水号"],
    required: false,
  },
];

export const FIELD_DEF_BY_KEY = new Map(FIELD_DEFS.map((def) => [def.key, def]));

export const DEFAULT_FIELD_CONFIG_VERSION = "fields-v1";

const FULL_WIDTH_MAP: Record<string, string> = {
  "（": "(",
  "）": ")",
  "：": ":",
  "　": " ",
  "＊": "*",
};

export function normalizeHeader(value: string): string {
  let text = String(value ?? "");
  text = text.replace(/^﻿/, "");
  text = text.replace(/[（）：　＊]/g, (ch) => FULL_WIDTH_MAP[ch] ?? ch);
  text = text.replace(/\s+/g, "");
  text = text.replace(/^\*+/, "");
  text = text.replace(/\*+$/, "");
  return text.toLowerCase();
}

export type FieldMappingResult = {
  mapping: Partial<Record<FieldKey, number>>;
  headers: Partial<Record<FieldKey, string>>;
  missingRequired: FieldKey[];
  duplicatedHeaders: string[];
  conflictingFields: FieldKey[];
  unmatchedHeaders: string[];
};

export function resolveFieldMapping(
  rawHeaders: string[],
  customAliases?: Partial<Record<FieldKey, string[]>>,
): FieldMappingResult {
  const aliasToKey = new Map<string, FieldKey>();
  for (const def of FIELD_DEFS) {
    for (const alias of def.aliases) {
      aliasToKey.set(normalizeHeader(alias), def.key);
    }
  }

  if (customAliases) {
    for (const def of FIELD_DEFS) {
      for (const alias of customAliases[def.key] ?? []) {
        const normalized = normalizeHeader(alias);
        if (normalized) aliasToKey.set(normalized, def.key);
      }
    }
  }

  const headers: Partial<Record<FieldKey, string>> = {};
  const mapping: Partial<Record<FieldKey, number>> = {};
  const conflictingFields: FieldKey[] = [];
  const seenHeaderNames = new Map<string, number>();
  const duplicatedHeaders: string[] = [];
  const unmatchedHeaders: string[] = [];

  rawHeaders.forEach((rawHeader, index) => {
    const normalized = normalizeHeader(rawHeader);
    if (!normalized) return;
    seenHeaderNames.set(normalized, (seenHeaderNames.get(normalized) ?? 0) + 1);

    const key = aliasToKey.get(normalized);
    if (!key) {
      unmatchedHeaders.push(String(rawHeader));
      return;
    }
    if (mapping[key] !== undefined) {
      if (!conflictingFields.includes(key)) conflictingFields.push(key);
      return;
    }
    mapping[key] = index;
    headers[key] = String(rawHeader);
  });

  for (const [normalized, count] of seenHeaderNames.entries()) {
    if (count > 1 && normalized) {
      const original = rawHeaders.find((h) => normalizeHeader(h) === normalized);
      if (original) duplicatedHeaders.push(String(original));
    }
  }

  const missingRequired = FIELD_DEFS.filter(
    (def) => def.required && mapping[def.key] === undefined,
  ).map((def) => def.key);

  return { mapping, headers, missingRequired, duplicatedHeaders, conflictingFields, unmatchedHeaders };
}

export function headerLabel(key: FieldKey): string {
  return FIELD_DEF_BY_KEY.get(key)?.label ?? key;
}
