import type { NextRequest } from "next/server";
import { getDb } from "../db";
import { SESSION_COOKIE, getUserFromToken, type AuthUser } from "./session";

export function userFromRequest(request: NextRequest): AuthUser | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return getUserFromToken(getDb(), token);
}
