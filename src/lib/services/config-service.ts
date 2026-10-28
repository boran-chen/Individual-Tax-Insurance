import { getDb, jsonParse, nowIso, type Db } from "../db";
import type { FieldKey } from "../config/fields";
import {
  DEFAULT_RETURN_TEMPLATE,
  type ReturnTemplate,
} from "../config/return-template";

export type AppConfigRow = {
  key: string;
  value_json: string;
  updated_by: string | null;
  updated_at: string;
  version: number;
};

export function getFieldAliases(db: Db = getDb()): Partial<Record<FieldKey, string[]>> {
  const row = db
    .prepare("SELECT value_json FROM app_config WHERE key = ?")
    .get("field_aliases") as { value_json: string } | undefined;
  return jsonParse<Partial<Record<FieldKey, string[]>>>(row?.value_json, {});
}

export function getReturnTemplate(db: Db = getDb()): ReturnTemplate {
  const row = db
    .prepare("SELECT value_json FROM app_config WHERE key = ?")
    .get("return_template") as { value_json: string } | undefined;
  const parsed = jsonParse<Partial<ReturnTemplate>>(row?.value_json, {});
  return {
    ...DEFAULT_RETURN_TEMPLATE,
    ...parsed,
    columns: {
      ...DEFAULT_RETURN_TEMPLATE.columns,
      ...(parsed.columns ?? {}),
    },
  };
}

export function setConfigValue(
  db: Db,
  key: string,
  value: unknown,
  userId: string | null,
): void {
  const now = nowIso();
  const existing = db
    .prepare("SELECT version FROM app_config WHERE key = ?")
    .get(key) as { version: number } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE app_config SET value_json = ?, updated_by = ?, updated_at = ?, version = ? WHERE key = ?",
    ).run(JSON.stringify(value), userId, now, existing.version + 1, key);
  } else {
    db.prepare(
      "INSERT INTO app_config (key, value_json, updated_by, updated_at, version) VALUES (?, ?, ?, ?, 1)",
    ).run(key, JSON.stringify(value), userId, now);
  }
}

export function listConfig(db: Db = getDb()): AppConfigRow[] {
  return db.prepare("SELECT * FROM app_config ORDER BY key").all() as unknown as AppConfigRow[];
}
