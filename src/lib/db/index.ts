import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "./schema";

export type Db = DatabaseSync;

const globalForDb = globalThis as unknown as { __cbrDb?: DatabaseSync };

export function defaultDbPath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
}

export function createDatabase(filePath: string = defaultDbPath()): Db {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  if (filePath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  return db;
}

export function getDb(): Db {
  if (!globalForDb.__cbrDb) {
    globalForDb.__cbrDb = createDatabase();
  }
  return globalForDb.__cbrDb;
}

export function setDbForTests(db: Db): void {
  globalForDb.__cbrDb = db;
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

export function jsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
