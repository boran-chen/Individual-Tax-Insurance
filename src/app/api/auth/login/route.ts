import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  buildSessionPayload,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { writeAudit, clientIp } from "@/lib/services/audit-service";
import { errorResponse } from "@/lib/api/helpers";
import { badRequest, HttpError, unauthorized } from "@/lib/utils/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForAttempts = globalThis as unknown as {
  __cbrLoginAttempts?: Map<string, { count: number; resetAt: number }>;
};

function attemptsMap(): Map<string, { count: number; resetAt: number }> {
  if (!globalForAttempts.__cbrLoginAttempts) {
    globalForAttempts.__cbrLoginAttempts = new Map();
  }
  return globalForAttempts.__cbrLoginAttempts;
}

type UserRow = {
  id: string;
  name: string;
  login: string;
  password_hash: string;
  role: "ADMIN" | "PROVINCE";
  status: string;
  session_version: number;
};

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = (await request.json().catch(() => null)) as {
      login?: string;
      password?: string;
    } | null;
    if (!body?.login || !body?.password) {
      throw badRequest("请输入账号和密码");
    }

    const ip = clientIp(request) ?? "unknown";
    const key = `${ip}:${body.login.trim().toLowerCase()}`;
    const map = attemptsMap();
    const record = map.get(key);
    if (record && record.resetAt > Date.now() && record.count >= 5) {
      throw new HttpError(429, "登录失败次数过多，请 10 分钟后再试");
    }

    const db = getDb();
    const user = db
      .prepare("SELECT * FROM users WHERE login = ?")
      .get(body.login.trim()) as UserRow | undefined;

    const valid = user ? await verifyPassword(body.password, user.password_hash) : false;
    if (!user || !valid) {
      const next = record && record.resetAt > Date.now() ? record : { count: 0, resetAt: Date.now() + 600000 };
      next.count += 1;
      map.set(key, next);
      writeAudit(db, {
        userId: user?.id ?? null,
        action: "LOGIN",
        result: "FAILURE",
        context: { login: body.login },
        ip,
      });
      throw unauthorized("账号或密码错误");
    }

    if (user.status !== "ACTIVE") {
      throw new HttpError(403, "账号已停用，请联系管理员");
    }

    map.delete(key);

    const token = signSession(
      buildSessionPayload({
        id: user.id,
        role: user.role,
        sessionVersion: user.session_version,
      }),
    );

    writeAudit(db, {
      userId: user.id,
      action: "LOGIN",
      objectType: "USER",
      objectId: user.id,
      result: "SUCCESS",
      ip,
    });

    const response = NextResponse.json({
      ok: true,
      role: user.role,
      name: user.name,
      redirect: user.role === "ADMIN" ? "/admin" : "/province",
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
