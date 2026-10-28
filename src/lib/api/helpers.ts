import { NextResponse, type NextRequest } from "next/server";
import { userFromRequest } from "../auth/request";
import { assertAdmin, assertAuthenticated, assertProvince } from "../auth/guard";
import type { AuthUser } from "../auth/session";
import { HttpError } from "../utils/http-error";

export function requireApiUser(
  request: NextRequest,
  role?: "ADMIN" | "PROVINCE",
): AuthUser {
  const user = userFromRequest(request);
  if (role === "ADMIN") return assertAdmin(user);
  if (role === "PROVINCE") return assertProvince(user);
  return assertAuthenticated(user);
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[api] unhandled error:", error);
  return NextResponse.json({ error: "服务器内部错误，请稍后重试" }, { status: 500 });
}

export function intParam(
  value: string | null,
  fallback: number,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function stringParam(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
