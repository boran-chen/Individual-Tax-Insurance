import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, requireApiUser } from "@/lib/api/helpers";
import { assertSameOrigin } from "@/lib/auth/csrf";
import {
  getFieldAliases,
  getReturnTemplate,
  setConfigValue,
} from "@/lib/services/config-service";
import { FIELD_KEYS, type FieldKey } from "@/lib/config/fields";
import { DEFAULT_RETURN_TEMPLATE, type ReturnTemplate } from "@/lib/config/return-template";
import { writeAudit } from "@/lib/services/audit-service";
import { badRequest } from "@/lib/utils/http-error";
import { RULES_VERSION } from "@/lib/rules/v1/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validateAliases(value: unknown): Partial<Record<FieldKey, string[]>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("字段别名必须是对象");
  }
  const result: Partial<Record<FieldKey, string[]>> = {};
  for (const [key, aliases] of Object.entries(value as Record<string, unknown>)) {
    if (!(FIELD_KEYS as readonly string[]).includes(key)) {
      throw badRequest(`未知字段：${key}`);
    }
    if (!Array.isArray(aliases) || aliases.some((item) => typeof item !== "string" || !item.trim())) {
      throw badRequest(`字段 ${key} 的别名必须是非空字符串数组`);
    }
    result[key as FieldKey] = aliases.map((item) => String(item).trim());
  }
  return result;
}

function validateTemplate(value: unknown): ReturnTemplate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("回传模板必须是对象");
  }
  const input = value as Partial<ReturnTemplate>;
  const merged: ReturnTemplate = {
    ...DEFAULT_RETURN_TEMPLATE,
    ...input,
    columns: {
      ...DEFAULT_RETURN_TEMPLATE.columns,
      ...(input.columns ?? {}),
    },
  };

  if (!Array.isArray(merged.sheetNames) || merged.sheetNames.some((name) => typeof name !== "string" || !name.trim())) {
    throw badRequest("sheetNames 必须是字符串数组");
  }
  for (const key of ["name", "idType", "idNumber", "income"] as const) {
    const list = merged.columns[key];
    if (!Array.isArray(list) || list.some((item) => typeof item !== "string" || !item.trim())) {
      throw badRequest(`回传列 ${key} 必须是非空字符串数组`);
    }
  }
  if (!Number.isFinite(merged.toleranceCents) || merged.toleranceCents < 0) {
    throw badRequest("toleranceCents 必须是非负数字");
  }
  if (merged.headerRow !== null && (!Number.isInteger(merged.headerRow) || merged.headerRow < 1)) {
    throw badRequest("headerRow 必须为空或正整数");
  }
  return merged;
}

export async function GET(request: NextRequest) {
  try {
    requireApiUser(request, "ADMIN");
    const db = getDb();
    return NextResponse.json({
      fieldAliases: getFieldAliases(db),
      returnTemplate: getReturnTemplate(db),
      rulesVersion: RULES_VERSION,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = requireApiUser(request, "ADMIN");
    const body = (await request.json().catch(() => null)) as {
      key?: string;
      value?: unknown;
    } | null;
    if (!body?.key) throw badRequest("缺少配置项");

    const db = getDb();
    if (body.key === "field_aliases") {
      setConfigValue(db, "field_aliases", validateAliases(body.value), admin.id);
    } else if (body.key === "return_template") {
      setConfigValue(db, "return_template", validateTemplate(body.value), admin.id);
    } else {
      throw badRequest("不支持的配置项");
    }

    writeAudit(db, {
      userId: admin.id,
      action: "UPDATE_CONFIG",
      objectType: "APP_CONFIG",
      objectId: body.key,
      context: { key: body.key },
    });

    return NextResponse.json({
      ok: true,
      fieldAliases: getFieldAliases(db),
      returnTemplate: getReturnTemplate(db),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
