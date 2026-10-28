import crypto from "node:crypto";
import type { Db } from "../db";

export const SESSION_COOKIE = "cbr_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type Role = "ADMIN" | "PROVINCE";

export type SessionPayload = {
  uid: string;
  role: Role;
  sv: number;
  exp: number;
};

export type AuthUser = {
  id: string;
  name: string;
  login: string;
  role: Role;
  status: string;
  sessionVersion: number;
  orgIds: string[];
};

type UserRow = {
  id: string;
  name: string;
  login: string;
  role: string;
  status: string;
  session_version: number;
};

function secret(): string {
  return process.env.APP_SESSION_SECRET || "cbr-dev-session-secret-change-me";
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signSession(payload: SessionPayload): string {
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload || typeof payload.uid !== "string") return null;
    if (payload.role !== "ADMIN" && payload.role !== "PROVINCE") return null;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    if (typeof payload.sv !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildSessionPayload(user: {
  id: string;
  role: Role;
  sessionVersion: number;
}): SessionPayload {
  return {
    uid: user.id,
    role: user.role,
    sv: user.sessionVersion,
    exp: Date.now() + SESSION_TTL_MS,
  };
}

export function sessionCookieOptions() {
  const secure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "1"
      : process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure,
  };
}

export function loadAuthUser(db: Db, userId: string): AuthUser | null {
  const row = db
    .prepare("SELECT id, name, login, role, status, session_version FROM users WHERE id = ?")
    .get(userId) as UserRow | undefined;
  if (!row) return null;
  if (row.status !== "ACTIVE") return null;
  if (row.role !== "ADMIN" && row.role !== "PROVINCE") return null;

  const orgRows = db
    .prepare(
      `SELECT uo.org_id AS org_id
         FROM user_organizations uo
         JOIN organizations o ON o.id = uo.org_id
        WHERE uo.user_id = ?
          AND o.status = 'ACTIVE'
          AND (uo.effective_from IS NULL OR date(uo.effective_from) <= date('now'))
          AND (uo.effective_to IS NULL OR date(uo.effective_to) >= date('now'))`,
    )
    .all(row.id) as Array<{ org_id: string }>;

  return {
    id: row.id,
    name: row.name,
    login: row.login,
    role: row.role as Role,
    status: row.status,
    sessionVersion: row.session_version,
    orgIds: orgRows.map((item) => item.org_id),
  };
}

export function getUserFromToken(db: Db, token: string | undefined | null): AuthUser | null {
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = loadAuthUser(db, payload.uid);
  if (!user) return null;
  if (user.sessionVersion !== payload.sv) return null;
  return user;
}
